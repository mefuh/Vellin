import 'dart:async';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart' show InputDecoration, TextField;
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';
import 'package:record/record.dart';

import '../../runtime/media_gate.dart';
import '../../state/app_settings.dart';
import '../../state/auth_controller.dart';
import '../../state/call_controller.dart';
import '../../state/dm_controller.dart';
import '../../state/presence_controller.dart';
import '../../theme/vellin_design.dart';
import '../../theme/vellin_glyphs.dart';
import '../ui/vellin_avatar.dart';
import '../ui/vellin_button.dart';
import '../ui/vellin_hover.dart';
import '../ui/vellin_icon.dart';
import '../shell/phase_switch.dart';
import '../../models/dm.dart';
import '../../models/social.dart';
import '../../state/friends_controller.dart';
import '../../state/recent_reactions.dart';
import '../../runtime/clipboard_images.dart';
import 'message_dialogs.dart';
import 'photo_send_dialog.dart';
import 'message_menu.dart';
import 'message_row.dart';
import 'peer_panel.dart';

/// Переписка в правой области: шапка, лента и поле ввода.
class ChatPane extends StatefulWidget {
  final DmController dm;

  /// Открыть профиль собеседника (клик по шапке).
  final VoidCallback onOpenProfile;

  /// Показать изображение во весь экран.
  final void Function(String url) onOpenImage;

  const ChatPane({
    super.key,
    required this.dm,
    required this.onOpenProfile,
    required this.onOpenImage,
  });

  @override
  State<ChatPane> createState() => _ChatPaneState();
}

class _ChatPaneState extends State<ChatPane> {
  final _input = TextEditingController();
  final _inputFocus = FocusNode();
  final _scroll = ScrollController();
  String? _shownPeer;

  /// Чей это диалог. Берётся один раз при создании и больше не меняется:
  /// правая область меняет диалоги в две фазы, и пока прежняя переписка
  /// уезжает, она обязана показывать прежнего человека — иначе шапка и
  /// боковая панель подменяются раньше самого перехода.
  late final String? _panePeerId = widget.dm.activePeerPublicId;

  /// Снимок собеседника этого диалога: им живут шапка и панель, когда
  /// контроллер уже переключился на другую переписку.
  PublicUser? _panePeer;
  String? _panePeerUserId;
  bool _paneMuted = false;
  String? _lastMsgId;
  bool _loadingOlder = false;
  String? _watchedPeerId;
  bool _atBottom = true;

  // Запись голосового.
  final _rec = AudioRecorder();
  bool _recording = false;
  int _recSeconds = 0;
  Timer? _recTimer;
  StreamSubscription<Amplitude>? _ampSub;
  final List<int> _peaks = [];
  String? _recPath;

  // Действия над сообщениями.
  final _paneFocus = FocusNode(debugLabel: 'chat-pane', skipTraversal: true);
  StreamSubscription<String>? _errors;

  /// Над каким сообщением открыто меню — строка подсвечена, пока оно живо.
  String? _menuTargetId;

  /// Вспышка у сообщения, к которому прокрутили.
  String? _flashId;
  int _flashSeq = 0;

  /// Ключи строк: по ним прокрутка находит сообщение в ленте.
  final Map<String, GlobalKey> _rowKeys = {};

  /// Какую правку сейчас показывает поле и что было набрано до неё.
  String? _shownEditId;
  String _draftBeforeEdit = '';

  @override
  void initState() {
    super.initState();
    _errors = widget.dm.errors.listen((text) {
      if (mounted) _toast(text);
    });
    // Лента рисуется снизу вверх (reverse): pixels — расстояние ОТ низа.
    _scroll.addListener(() {
      if (!_scroll.hasClients) return;
      final p = _scroll.position;
      if (p.pixels >= p.maxScrollExtent - 200) _maybeLoadOlder();
      final atBottom = p.pixels <= 120;
      if (atBottom != _atBottom) setState(() => _atBottom = atBottom);
    });
    _input.addListener(() {
      // Правка — не набор нового сообщения: «печатает» собеседнику не шлём.
      if (_input.text.isNotEmpty && widget.dm.editing == null) widget.dm.typingText();
      setState(() {}); // кнопка отправки зависит от того, пусто ли поле
    });
  }

  // ── Действия над сообщениями ─────────────────────────────────────────────

  GlobalKey _keyFor(String id) => _rowKeys.putIfAbsent(id, () => GlobalKey(debugLabel: id));

  void _focusInput() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _inputFocus.requestFocus();
    });
  }

  /// Поле ввода следует за правкой: при входе в неё подставляет текст
  /// сообщения, при выходе возвращает набранный до этого черновик.
  void _syncEditField() {
    final editing = widget.dm.editing;
    if (editing?.id == _shownEditId) return;
    final wasEditing = _shownEditId != null;
    _shownEditId = editing?.id;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (editing != null) {
        if (!wasEditing) _draftBeforeEdit = _input.text;
        _input.value = TextEditingValue(
          text: editing.body,
          selection: TextSelection.collapsed(offset: editing.body.length),
        );
        _inputFocus.requestFocus();
      } else {
        _input.value = TextEditingValue(
          text: _draftBeforeEdit,
          selection: TextSelection.collapsed(offset: _draftBeforeEdit.length),
        );
        _draftBeforeEdit = '';
      }
    });
  }

  KeyEventResult _onPaneKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent || event.logicalKey != LogicalKeyboardKey.escape) {
      return KeyEventResult.ignored;
    }
    final dm = widget.dm;
    // Esc снимает самое верхнее: выделение, затем ответ или правку, и только
    // потом (в оболочке) закрывает сам диалог.
    if (dm.selecting) {
      dm.exitSelection();
      return KeyEventResult.handled;
    }
    if (dm.editing != null || dm.replyTarget != null) {
      dm.cancelCompose();
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  bool _isRead(DirectMessage m) {
    final at = widget.dm.peerLastReadAt != null ? DateTime.tryParse(widget.dm.peerLastReadAt!) : null;
    final sent = DateTime.tryParse(m.createdAt);
    return at != null && sent != null && !sent.isAfter(at);
  }

  Future<void> _openMenu(DirectMessage m, Offset position) async {
    final dm = widget.dm;
    final mine = m.senderId == dm.myUserId;
    final isPinned = dm.pinned?.id == m.id;
    final items = <MessageMenuItem>[
      if (!m.isCallRecord)
        MessageMenuItem(
          glyph: VellinGlyphs.reply,
          label: 'Ответить',
          onSelect: () {
            dm.startReply(m);
            _focusInput();
          },
        ),
      if (mine && m.isEditable)
        MessageMenuItem(glyph: VellinGlyphs.edit, label: 'Изменить', onSelect: () => dm.startEdit(m)),
      if (!m.isCallRecord)
        MessageMenuItem(
          glyph: isPinned ? VellinGlyphs.unpin : VellinGlyphs.pin,
          label: isPinned ? 'Открепить' : 'Закрепить',
          onSelect: () => dm.togglePin(m),
        ),
      if (m.body.isNotEmpty)
        MessageMenuItem(glyph: VellinGlyphs.copy, label: 'Копировать текст', onSelect: () => _copy(m)),
      if (m.isForwardable)
        MessageMenuItem(glyph: VellinGlyphs.forward, label: 'Переслать', onSelect: () => _forward([m.id])),
      MessageMenuItem(glyph: VellinGlyphs.trash, label: 'Удалить', danger: true, onSelect: () => _delete([m.id])),
      MessageMenuItem(
        glyph: VellinGlyphs.select,
        label: 'Выделить',
        onSelect: () {
          dm.startSelection(m.id);
          // Фокус ленте: поле ввода в режиме выделения спрятано, а Esc
          // должен снимать выделение, куда бы ни щёлкнули до этого.
          _paneFocus.requestFocus();
        },
      ),
    ];

    final facts = <MessageMenuFact>[
      // Прочитано и прослушано — только у своих: у чужих это знаю я сам.
      if (mine && !m.isCallRecord) ...[
        if (m.readAt != null)
          MessageFacts.read(m.readAt)
        else if (_isRead(m))
          MessageFacts.read(null),
        if (m.playedAt != null && m.voiceUrl != null) MessageFacts.listened(m.playedAt!),
        if (m.playedAt != null && m.videoStatus != null) MessageFacts.viewed(m.playedAt!),
      ],
      if (m.editedAt != null) MessageFacts.edited(m.editedAt!),
    ];

    setState(() => _menuTargetId = m.id);
    await showMessageMenu(
      context,
      position: position,
      items: items,
      facts: facts,
      // У записи о звонке реакций нет: это отметка события, а не реплика.
      reactions: m.isCallRecord
          ? null
          : MessageMenuReactions(
              quick: RecentReactions.instance.quick,
              current: m.reactionOf(dm.myUserId),
              onReact: (emoji) => dm.react(m, emoji),
            ),
    );
    if (mounted && _menuTargetId == m.id) setState(() => _menuTargetId = null);
  }

  Future<void> _copy(DirectMessage m) async {
    await Clipboard.setData(ClipboardData(text: m.body));
    if (mounted) _toast('Текст скопирован');
  }

  Future<void> _forward(List<String> ids) async {
    final dm = widget.dm;
    final forwardable = ids.where((id) => dm.messageById(id)?.isForwardable ?? false).toList();
    if (forwardable.isEmpty) {
      _toast('Звонки и приглашения не пересылаются');
      return;
    }
    // Сначала переписки — по свежести, затем друзья, с кем ещё не писали.
    final seen = <String>{};
    final targets = <ForwardTarget>[];
    for (final c in dm.conversations) {
      if (seen.add(c.peer.id)) {
        targets.add(ForwardTarget(user: c.peer, current: c.peer.id == dm.activePeerUserId));
      }
    }
    final active = dm.activePeer;
    if (active != null && seen.add(active.id)) targets.insert(0, ForwardTarget(user: active, current: true));
    for (final f in context.read<FriendsController>().friends) {
      if (seen.add(f.user.id)) targets.add(ForwardTarget(user: f.user));
    }

    final to = await showForwardDialog(context, targets: targets, count: forwardable.length);
    if (to == null || !mounted) return;
    final sent = dm.forward(to.id, forwardable);
    if (sent > 0) _toast(to.id == dm.activePeerUserId ? 'Переслано в этот диалог' : 'Переслано · ${to.username}');
  }

  Future<void> _delete(List<String> ids) async {
    final dm = widget.dm;
    final scope = await showDeleteMessagesDialog(
      context,
      count: ids.length,
      peerName: dm.activePeer?.username ?? '',
    );
    if (scope == null || !mounted) return;
    dm.deleteMessages(ids, forAll: scope == DeleteScope.everyone);
  }

  /// Прокрутить к сообщению и мигнуть им. Если его ещё нет в загруженной
  /// истории — сначала догрузить; если строка не построена — ехать к ней
  /// экранами, пока лента её не построит.
  Future<void> _scrollToMessage(String id) async {
    final dm = widget.dm;
    if (!await dm.ensureLoaded(id)) {
      if (mounted) _toast('Сообщение не найдено');
      return;
    }
    for (var step = 0; step < 60; step++) {
      await WidgetsBinding.instance.endOfFrame;
      if (!mounted || !_scroll.hasClients) return;
      final ctx = _rowKeys[id]?.currentContext;
      if (ctx != null && ctx.mounted) {
        await Scrollable.ensureVisible(
          ctx,
          alignment: 0.5,
          duration: VellinMotion.layout,
          curve: VellinMotion.standard,
        );
        if (mounted) {
          setState(() {
            _flashId = id;
            _flashSeq++;
          });
        }
        return;
      }
      final target = dm.activeMessages.indexWhere((m) => m.id == id);
      if (target < 0) return;
      // Ближайшая построенная строка подсказывает, в какую сторону ехать.
      var anchor = -1;
      for (var i = 0; i < dm.activeMessages.length; i++) {
        if (_rowKeys[dm.activeMessages[i].id]?.currentContext != null) {
          anchor = i;
          break;
        }
      }
      final p = _scroll.position;
      // Лента перевёрнута: к старым сообщениям — это рост pixels.
      final older = anchor < 0 || target < anchor;
      final next = (p.pixels + (older ? 1 : -1) * p.viewportDimension * 0.85)
          .clamp(p.minScrollExtent, p.maxScrollExtent);
      if (next == p.pixels) return;
      _scroll.jumpTo(next);
    }
  }

  void _syncPresenceWatch() {
    final peerId = widget.dm.activePeerUserId;
    if (peerId == _watchedPeerId) return;
    final presence = context.read<PresenceController>();
    if (_watchedPeerId != null) presence.unwatch(_watchedPeerId!);
    if (peerId != null) presence.watch(peerId);
    _watchedPeerId = peerId;
  }

  Future<void> _maybeLoadOlder() async {
    if (_loadingOlder || !widget.dm.activeHasMore) return;
    _loadingOlder = true;
    await widget.dm.loadOlder();
    _loadingOlder = false;
  }

  @override
  void dispose() {
    if (_watchedPeerId != null) {
      context.read<PresenceController>().unwatch(_watchedPeerId!);
    }
    _errors?.cancel();
    _paneFocus.dispose();
    _input.dispose();
    _inputFocus.dispose();
    _scroll.dispose();
    _recTimer?.cancel();
    _ampSub?.cancel();
    _rec.dispose();
    super.dispose();
  }

  void _send() {
    final text = _input.text;
    if (widget.dm.editing != null) {
      // Поле вернёт черновик само, когда правка закроется.
      widget.dm.saveEdit(text);
      _inputFocus.requestFocus();
      return;
    }
    if (text.trim().isEmpty) return;
    widget.dm.sendText(text);
    _input.clear();
    _inputFocus.requestFocus();
  }

  Future<void> _startRecord() async {
    // Микрофон монопольный: во время звонка запись отняла бы у него звук.
    if (!MediaGate.instance.beginRecording(_cancelRecord)) {
      _toast('Идёт звонок — записать голосовое нельзя');
      return;
    }
    if (!await _rec.hasPermission()) {
      MediaGate.instance.endRecording();
      if (mounted) _toast('Нет доступа к микрофону');
      return;
    }
    _peaks.clear();
    _recSeconds = 0;
    _recPath =
        '${Directory.systemTemp.path}${Platform.pathSeparator}vellin_voice_${DateTime.now().millisecondsSinceEpoch}.wav';
    await _rec.start(const RecordConfig(encoder: AudioEncoder.wav), path: _recPath!);
    _ampSub = _rec.onAmplitudeChanged(const Duration(milliseconds: 150)).listen((amp) {
      // dBFS (~ -45..0) → 0..100.
      final norm = ((amp.current + 45) / 45 * 100).clamp(0, 100).round();
      _peaks.add(norm);
    });
    _recTimer = Timer.periodic(const Duration(seconds: 1), (_) => setState(() => _recSeconds++));
    setState(() => _recording = true);
    widget.dm.sendRecordingSignal(true, 'voice');
  }

  Future<void> _stopRecordAndSend() async {
    final path = await _rec.stop();
    MediaGate.instance.endRecording();
    _recTimer?.cancel();
    await _ampSub?.cancel();
    final seconds = _recSeconds;
    if (!mounted) return;
    setState(() => _recording = false);
    widget.dm.sendRecordingSignal(false, 'voice');
    if (path == null || seconds < 1) return; // слишком коротко — отбрасываем
    final peaks = _downsample(_peaks, 56);
    try {
      await widget.dm.sendVoice(path, seconds, peaks);
    } catch (e) {
      if (mounted) _toast('Не удалось отправить голосовое: $e');
    }
  }

  /// Отмена записи — по кнопке пользователя либо принудительно, когда
  /// устройства забирает звонок (см. MediaGate).
  Future<void> _cancelRecord() async {
    await _rec.stop();
    MediaGate.instance.endRecording();
    _recTimer?.cancel();
    await _ampSub?.cancel();
    if (!mounted) return;
    setState(() => _recording = false);
    widget.dm.sendRecordingSignal(false, 'voice');
    if (_recPath != null) {
      try {
        await File(_recPath!).delete();
      } catch (_) {}
    }
  }

  static List<int> _downsample(List<int> src, int target) {
    if (src.length <= target) return List.of(src);
    final out = <int>[];
    final step = src.length / target;
    for (var i = 0; i < target; i++) {
      out.add(src[(i * step).floor()]);
    }
    return out;
  }

  void _toast(String message) => ChatToast.show(context, message);

  Future<void> _attach() async {
    final picked = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: photoExtensions,
      allowMultiple: true,
    );
    final paths = (picked?.files ?? const []).map((f) => f.path).whereType<String>().toList();
    if (paths.isEmpty || !mounted) return;
    await _composePhotos(paths);
  }

  /// Ctrl+V в поле ввода: если в буфере фото — открыть окно отправки с ними.
  /// Текст вставляется как обычно, окно появляется только при фото в буфере.
  Future<void> _pastePhotos() async {
    if (widget.dm.editing != null) return;
    final photos = await readClipboardPhotos();
    if (photos.isEmpty || !mounted) return;
    await _composePhotos(photos);
  }

  /// Окно отправки: там фото добирают из других папок и буфера и подписывают.
  /// Набранный в поле текст переезжает в подпись, а после отправки поле
  /// очищается; закрыли окно — текст остаётся на месте.
  Future<void> _composePhotos(List<String> paths) async {
    const max = DmController.maxImages;
    final draft = await showPhotoSendDialog(context, initial: paths, caption: _input.text, max: max);
    if (draft == null || !mounted) {
      _focusInput();
      return;
    }
    _input.clear();
    _focusInput();
    try {
      await widget.dm.sendImages(draft.paths, caption: draft.caption);
    } catch (e) {
      if (mounted) _toast('Не удалось отправить фото: $e');
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.jumpTo(0);
    });
  }

  void _animateToBottom() {
    if (!_scroll.hasClients) return;
    _scroll.animateTo(0, duration: VellinMotion.hover, curve: VellinMotion.standard);
  }

  @override
  Widget build(BuildContext context) {
    final dm = widget.dm;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _syncPresenceWatch();
    });

    _syncEditField();

    final msgs = dm.activeMessages;
    final lastId = msgs.isNotEmpty ? msgs.last.id : null;
    if (dm.activePeerPublicId != _shownPeer) {
      _shownPeer = dm.activePeerPublicId;
      _lastMsgId = lastId;
      _rowKeys.clear();
      _menuTargetId = null;
      _flashId = null;
      _scrollToBottom();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _inputFocus.requestFocus();
      });
    } else if (lastId != null && lastId != _lastMsgId) {
      final mine = msgs.last.senderId == dm.myUserId;
      _lastMsgId = lastId;
      if (mine) _scrollToBottom();
    }

    final settings = context.watch<AppSettings>();
    // На узком окне панель не ужимает ленту до нечитаемой ширины, а ложится
    // поверх неё: 940 пикселей окна минус рейл, список и панель оставили бы
    // переписке меньше трёхсот.
    final narrow = MediaQuery.sizeOf(context).width < VellinLayout.breakpoint;
    // Контроллер мог уже уйти в другой диалог: тогда эта переписка доигрывает
    // свой уход и остаётся при своём человеке до самой подмены.
    final mine = dm.activePeerPublicId == _panePeerId;
    if (mine) {
      _panePeer = dm.activePeer ?? _panePeer;
      _panePeerUserId = dm.activePeerUserId ?? _panePeerUserId;
      _paneMuted = dm.peerMuted;
    }
    final panelOpen = settings.peerPanelOpen && _panePeerId != null;

    final panel = _PanelSlot(
      open: panelOpen,
      floating: narrow,
      child: PeerPanel(
        key: ValueKey(_panePeerId),
        dm: dm,
        publicId: _panePeerId,
        peer: _panePeer,
        peerUserId: _panePeerUserId,
        muted: _paneMuted,
        onOpenProfile: widget.onOpenProfile,
        onClose: () => settings.setPeerPanelOpen(false),
      ),
    );

    final body = Focus(
      focusNode: _paneFocus,
      onKeyEvent: _onPaneKey,
      child: Column(
      children: [
        _ChatHeader(
          peer: _panePeer,
          peerUserId: _panePeerUserId,
          activity: mine ? dm.peerActivity : null,
          onOpenProfile: widget.onOpenProfile,
          panelOpen: settings.peerPanelOpen,
          onTogglePanel: () => settings.setPeerPanelOpen(!settings.peerPanelOpen),
        ),
        _PinBar(
          pinned: dm.pinned,
          onOpen: (id) => _scrollToMessage(id),
          onUnpin: dm.unpin,
        ),
        Expanded(
          child: Stack(
            children: [
              _feed(dm),
              Positioned(
                right: 20,
                bottom: 16,
                child: AnimatedOpacity(
                  duration: VellinMotion.hover,
                  curve: VellinMotion.standard,
                  opacity: _atBottom ? 0 : 1,
                  child: IgnorePointer(
                    ignoring: _atBottom,
                    child: VellinIconButton(
                      glyph: VellinGlyphs.chevronDown,
                      onPressed: _animateToBottom,
                      size: 34,
                      radius: 17,
                      glyphSize: 13,
                      glyphBox: const Size(12, 12),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        _composer(),
      ],
      ),
    );

    if (narrow) {
      return Stack(
        children: [
          body,
          Positioned(top: 0, right: 0, bottom: 0, child: panel),
        ],
      );
    }
    return Row(
      children: [
        Expanded(child: body),
        panel,
      ],
    );
  }

  Widget _feed(DmController dm) {
    if (dm.threadLoading && dm.activeMessages.isEmpty) return const _FeedSkeleton();

    final msgs = dm.activeMessages;
    final auth = context.watch<AuthController>().user;
    final peerRead = dm.peerLastReadAt != null ? DateTime.tryParse(dm.peerLastReadAt!) : null;

    if (msgs.isEmpty && !dm.threadLoading) {
      return _EmptyThread(dm: dm);
    }

    // Список идёт снизу вверх: индекс 0 — последняя реплика.
    final typing = dm.peerActivity != null ? 1 : 0;

    return ListView.builder(
      controller: _scroll,
      reverse: true,
      // По бокам 16, а не 24: ещё 8 даёт оболочка строки под подсветку.
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 20),
      itemCount: msgs.length + typing,
      itemBuilder: (context, i) {
        if (typing == 1 && i == 0) {
          return _TypingBubble(kind: dm.peerActivity!);
        }
        final index = msgs.length - 1 - (i - typing);
        final m = msgs[index];
        final prev = index > 0 ? msgs[index - 1] : null;
        final mine = m.senderId == dm.myUserId;

        // Группа — подряд идущие реплики одного человека в пределах пяти минут.
        final groupStart = prev == null ||
            prev.senderId != m.senderId ||
            prev.isCallRecord != m.isCallRecord ||
            _gap(prev.createdAt, m.createdAt) > const Duration(minutes: 5);

        final divider = prev == null || !_sameDay(prev.createdAt, m.createdAt)
            ? _DayDivider(iso: m.createdAt)
            : null;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ?divider,
            KeyedSubtree(
              key: _keyFor(m.id),
              child: MessageRow(
                // Ключ по сообщению: без него состояние строки (в том числе
                // прочерчивание галочек) достаётся соседней реплике, когда в
                // ленту добавляется новая.
                key: ValueKey(m.id),
                message: m,
                mine: mine,
                groupStart: groupStart,
                peer: dm.activePeer,
                myUsername: auth?.username ?? '',
                myAvatarUrl: auth?.avatarUrl,
                myUserId: dm.myUserId,
                peerReadAt: peerRead,
                selecting: dm.selecting,
                selected: dm.selected.contains(m.id),
                menuOpen: _menuTargetId == m.id,
                flash: _flashId == m.id ? _flashSeq : 0,
                removing: dm.removing.contains(m.id),
                onVoicePlayed: dm.markVoicePlayed,
                onVideoPlayed: dm.markVideoPlayed,
                onImageTap: widget.onOpenImage,
                onContextMenu: _openMenu,
                onToggleSelect: () => dm.toggleSelected(m.id),
                onReact: (emoji) => dm.react(m, emoji),
                onQuoteTap: _scrollToMessage,
              ),
            ),
          ],
        );
      },
    );
  }

  static Duration _gap(String a, String b) {
    final x = DateTime.tryParse(a);
    final y = DateTime.tryParse(b);
    if (x == null || y == null) return const Duration(days: 1);
    return y.difference(x).abs();
  }

  static bool _sameDay(String a, String b) {
    final x = DateTime.tryParse(a)?.toLocal();
    final y = DateTime.tryParse(b)?.toLocal();
    if (x == null || y == null) return true;
    return x.year == y.year && x.month == y.month && x.day == y.day;
  }

  Widget _composer() {
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 16),
      decoration: const BoxDecoration(
        color: VellinColors.strip,
        border: Border(top: BorderSide(color: VellinColors.line05)),
      ),
      // Выделение подменяет поле ввода в две фазы: поле уходит, панель
      // действий приходит, и обратно.
      child: PhaseSwitch(
        phaseKey: widget.dm.selecting,
        child: widget.dm.selecting ? _selectionBar() : (_recording ? _recordingBar() : _inputBar()),
      ),
    );
  }

  Widget _selectionBar() {
    final dm = widget.dm;
    final chosen = dm.selectedMessages;
    final canForward = chosen.any((m) => m.isForwardable);
    return _SelectionBar(
      count: chosen.length,
      onCancel: dm.exitSelection,
      onForward: canForward ? () => _forward(chosen.map((m) => m.id).toList()) : null,
      onDelete: chosen.isEmpty ? null : () => _delete(chosen.map((m) => m.id).toList()),
    );
  }

  Widget _recordingBar() {
    return Row(
      children: [
        VellinIconButton(
          glyph: VellinGlyphs.cross,
          onPressed: _cancelRecord,
          size: 32,
          radius: VellinRadius.mini,
          glyphSize: 15,
          filled: false,
        ),
        const SizedBox(width: 10),
        const _RecordingDot(),
        const SizedBox(width: 10),
        Text(
          'Идёт запись · ${_fmtSeconds(_recSeconds)}',
          style: VellinType.body.copyWith(
            fontSize: 12.5,
            color: VellinColors.ink62,
            fontFeatures: VellinType.tabular,
          ),
        ),
        const Spacer(),
        _SendButton(onTap: _stopRecordAndSend),
      ],
    );
  }

  Widget _inputBar() {
    // Одна рамка на всё: картинка, текст, микрофон и отправка живут внутри
    // поля, как в макете.
    final dm = widget.dm;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _ComposeStrip(
          reply: dm.replyTarget,
          editing: dm.editing,
          authorOf: (m) => m.senderId == dm.myUserId ? 'Вы' : (dm.activePeer?.username ?? ''),
          onCancel: dm.cancelCompose,
          onOpen: _scrollToMessage,
        ),
        _InputField(
          controller: _input,
          focusNode: _inputFocus,
          editing: dm.editing != null,
          onSubmit: _send,
          onPaste: _pastePhotos,
          onAttach: _attach,
          onVoice: _startRecord,
        ),
      ],
    );
  }

  static String _fmtSeconds(int s) =>
      '${(s ~/ 60).toString().padLeft(2, '0')}:${(s % 60).toString().padLeft(2, '0')}';
}

/// Место боковой панели собеседника: на широком окне раздвигает ленту, на
/// узком — наезжает на неё справа.
///
/// Закрытая панель не просто спрятана, а размонтирована: иначе её витрина
/// продолжала бы тянуть снимки для диалога, которого не видно.
class _PanelSlot extends StatefulWidget {
  final bool open;

  /// Панель лежит поверх ленты, а не раздвигает её.
  final bool floating;

  final Widget child;

  const _PanelSlot({required this.open, required this.floating, required this.child});

  @override
  State<_PanelSlot> createState() => _PanelSlotState();
}

class _PanelSlotState extends State<_PanelSlot> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: VellinMotion.state,
    reverseDuration: VellinMotion.quick,
    value: widget.open ? 1 : 0,
  );

  @override
  void initState() {
    super.initState();
    // Уход доигран — снимаем панель с дерева.
    _c.addStatusListener((s) {
      if (s == AnimationStatus.dismissed && mounted) setState(() {});
    });
  }

  @override
  void didUpdateWidget(_PanelSlot old) {
    super.didUpdateWidget(old);
    if (widget.open != old.open) {
      if (widget.open) {
        _c.forward();
      } else {
        _c.reverse();
      }
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.open && _c.isDismissed) return const SizedBox.shrink();
    const w = VellinLayout.peerPanel;

    return AnimatedBuilder(
      animation: _c,
      builder: (context, child) {
        final t = VellinMotion.standard.transform(_c.value);
        return SizedBox(
          // Наезжающая панель ширину не меняет — она въезжает целиком;
          // раздвигающая открывает ленте ровно столько, сколько заняла.
          width: widget.floating ? w : w * t,
          child: ClipRect(
            child: OverflowBox(
              alignment: Alignment.centerLeft,
              minWidth: w,
              maxWidth: w,
              child: Opacity(
                opacity: t,
                child: Transform.translate(
                  offset: Offset(w * (1 - t) * (widget.floating ? 1 : 0.3), 0),
                  child: child,
                ),
              ),
            ),
          ),
        );
      },
      child: widget.floating
          ? DecoratedBox(
              decoration: const BoxDecoration(
                boxShadow: [BoxShadow(color: Color(0x66000000), blurRadius: 28, offset: Offset(-10, 0))],
              ),
              child: widget.child,
            )
          : widget.child,
    );
  }
}

/// Шапка чата: аватар, имя, живая строка состояния и кнопки звонка.
class _ChatHeader extends StatelessWidget {
  /// Собеседник этой переписки. Не берётся из контроллера напрямую: пока
  /// прежний диалог уезжает, шапка обязана держать прежнего человека.
  final PublicUser? peer;
  final String? peerUserId;

  /// Что собеседник делает прямо сейчас: null — ничего.
  final String? activity;

  final VoidCallback onOpenProfile;

  /// Открыта ли боковая панель собеседника — кнопка показывает это золотом.
  final bool panelOpen;
  final VoidCallback onTogglePanel;

  const _ChatHeader({
    required this.peer,
    required this.peerUserId,
    required this.activity,
    required this.onOpenProfile,
    required this.panelOpen,
    required this.onTogglePanel,
  });

  @override
  Widget build(BuildContext context) {
    final presence = context.watch<PresenceController>();
    final call = context.watch<CallController>();
    final peerId = peerUserId;
    final info = peerId != null ? presence.of(peerId) : null;
    final state = presenceFromStatus(info?.status);
    final busy = call.call != null;

    return Container(
      height: VellinLayout.chatHeader,
      padding: const EdgeInsets.symmetric(horizontal: 18),
      decoration: const BoxDecoration(
        color: VellinColors.strip,
        border: Border(bottom: BorderSide(color: VellinColors.line05)),
      ),
      child: Row(
        children: [
          Expanded(
            child: VellinInteractive(
              onTap: onOpenProfile,
              cursor: SystemMouseCursors.click,
              builder: (context, s) => Row(
                children: [
                  VellinAvatar(
                    username: peer?.username ?? '',
                    avatarUrl: peer?.avatarUrl,
                    size: 38,
                    bedColor: VellinColors.strip,
                  ),
                  const SizedBox(width: 11),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(peer?.username ?? '', style: VellinType.chatName),
                      const SizedBox(height: 2),
                      _StatusLine(
                        activity: activity,
                        presence: state,
                        lastSeenAt: info?.lastSeenAt,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          // Кнопка одна: камеру в разговоре включают внутри самого звонка,
          // и отдельный вход «сразу с видео» тут только дублировал её.
          VellinIconButton(
            glyph: VellinGlyphs.calls,
            onPressed: busy || peerId == null ? null : () => call.invite(peerId, video: false),
            size: 34,
            radius: VellinRadius.button,
          ),
          const SizedBox(width: 8),
          VellinIconButton(
            glyph: VellinGlyphs.sidePanel,
            onPressed: onTogglePanel,
            size: 34,
            radius: VellinRadius.button,
            color: panelOpen ? VellinColors.accent : null,
            tooltip: panelOpen ? 'Скрыть панель собеседника' : 'Показать панель собеседника',
          ),
        ],
      ),
    );
  }
}

/// Строка состояния: «печатает…» с точками либо присутствие.
class _StatusLine extends StatelessWidget {
  final String? activity;
  final VellinPresence presence;
  final String? lastSeenAt;

  const _StatusLine({required this.activity, required this.presence, required this.lastSeenAt});

  @override
  Widget build(BuildContext context) {
    if (activity != null) {
      final label = switch (activity) {
        'voice' => 'записывает голосовое',
        'video' => 'записывает кружок',
        _ => 'печатает',
      };
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: VellinType.caption.copyWith(color: const Color(0xE693B08A))),
          const SizedBox(width: 5),
          const TypingDots(color: Color(0xE693B08A)),
        ],
      );
    }

    return Text(
      switch (presence) {
        VellinPresence.online => 'в сети',
        VellinPresence.dnd => 'не беспокоить',
        VellinPresence.offline => presenceLabel(online: false, lastSeenAt: lastSeenAt),
      },
      style: VellinType.caption.copyWith(
        color: switch (presence) {
          VellinPresence.online => const Color(0xE693B08A),
          VellinPresence.dnd => const Color(0xCCD6AE6E),
          VellinPresence.offline => VellinColors.ink28,
        },
      ),
    );
  }
}

/// Три точки «печатает»: подъём на 2 пикселя и прозрачность .28 → .90.
class TypingDots extends StatefulWidget {
  final Color color;
  const TypingDots({super.key, this.color = VellinColors.ink72});

  @override
  State<TypingDots> createState() => _TypingDotsState();
}

class _TypingDotsState extends State<TypingDots> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: VellinMotion.typingDots,
  )..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, _) {
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: List.generate(3, (i) {
            // Задержки 0 / 160 / 320 мс от цикла в 1.2 с.
            final phase = (_c.value - i * 0.1333) % 1.0;
            final wave = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
            final eased = VellinMotion.breathe.transform(wave.clamp(0.0, 1.0));
            return Padding(
              padding: EdgeInsets.only(left: i == 0 ? 0 : 3),
              child: Transform.translate(
                offset: Offset(0, -2 * eased),
                child: Container(
                  width: 5,
                  height: 5,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: widget.color.withValues(alpha: 0.28 + 0.62 * eased),
                  ),
                ),
              ),
            );
          }),
        );
      },
    );
  }
}

/// Баббл «печатает…» в ленте.
class _TypingBubble extends StatelessWidget {
  final String kind;
  const _TypingBubble({required this.kind});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 12, left: 38),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: VellinColors.bubble,
            borderRadius: VellinRadius.bubble,
            border: Border.all(color: VellinColors.line06),
          ),
          child: const TypingDots(),
        ),
      ),
    );
  }
}

/// Разделитель дня по центру ленты.
class _DayDivider extends StatelessWidget {
  final String iso;
  const _DayDivider({required this.iso});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: Center(
        child: Text(
          _label(iso).toUpperCase(),
          style: VellinType.sectionLabel.copyWith(
            color: VellinColors.ink24,
            letterSpacing: 1.05,
          ),
        ),
      ),
    );
  }

  static String _label(String iso) {
    final t = DateTime.tryParse(iso)?.toLocal();
    if (t == null) return '';
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final that = DateTime(t.year, t.month, t.day);
    final days = today.difference(that).inDays;
    if (days == 0) return 'Сегодня';
    if (days == 1) return 'Вчера';
    const months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
    ];
    final base = '${t.day} ${months[t.month - 1]}';
    return t.year == now.year ? base : '$base ${t.year}';
  }
}

/// Пустая переписка: аватар, имя и приглашение написать первым.
class _EmptyThread extends StatelessWidget {
  final DmController dm;
  const _EmptyThread({required this.dm});

  @override
  Widget build(BuildContext context) {
    final peer = dm.activePeer;
    return Center(
      child: SizedBox(
        width: 320,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            VellinAvatar(
              username: peer?.username ?? '',
              avatarUrl: peer?.avatarUrl,
              size: 72,
              bedColor: VellinColors.bg1,
            ),
            const SizedBox(height: 14),
            Text(peer?.username ?? '', style: VellinType.cardTitle.copyWith(fontSize: 16)),
            const SizedBox(height: 8),
            Text(
              'Переписки ещё нет. Напишите первым — сообщение придёт сразу.',
              textAlign: TextAlign.center,
              style: VellinType.caption.copyWith(fontSize: 12.5, height: 1.6),
            ),
          ],
        ),
      ),
    );
  }
}

/// Скелет ленты: пятна вместо бабблов, а не крутящийся кружок.
class _FeedSkeleton extends StatelessWidget {
  const _FeedSkeleton();

  @override
  Widget build(BuildContext context) {
    const widths = [220.0, 150.0, 300.0, 190.0, 260.0];
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 20, 24, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final w in widths) ...[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 28,
                  height: 28,
                  decoration: const BoxDecoration(
                    color: VellinColors.skeleton,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 10),
                Container(
                  width: w,
                  height: 34,
                  decoration: BoxDecoration(
                    color: VellinColors.bubble,
                    borderRadius: VellinRadius.bubble,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
          ],
        ],
      ),
    );
  }
}

/// Поле ввода: кнопки вложения и голосового живут внутри рамки.
class _InputField extends StatefulWidget {
  final TextEditingController controller;
  final FocusNode focusNode;

  /// Поле правит отправленное сообщение: другая подсказка и галочка вместо
  /// самолётика, вложений и голосового при правке нет.
  final bool editing;
  final VoidCallback onSubmit;

  /// Ctrl+V — проверить буфер на фото. Текст вставляется как обычно.
  final VoidCallback onPaste;
  final VoidCallback onAttach;
  final VoidCallback onVoice;

  const _InputField({
    required this.controller,
    required this.focusNode,
    this.editing = false,
    required this.onSubmit,
    required this.onPaste,
    required this.onAttach,
    required this.onVoice,
  });

  @override
  State<_InputField> createState() => _InputFieldState();
}

class _InputFieldState extends State<_InputField> {
  @override
  void initState() {
    super.initState();
    widget.focusNode.addListener(_repaint);
  }

  void _repaint() => setState(() {});

  @override
  void dispose() {
    widget.focusNode.removeListener(_repaint);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Поле выглядит одинаково в покое и в работе: о том, что оно поймало
    // ввод, говорит мигающая каретка, а золотая рамка на всю ширину окна
    // только мешала.
    return Container(
      constraints: const BoxConstraints(minHeight: VellinLayout.composerMinHeight),
      padding: const EdgeInsets.only(left: 6, right: 8),
      decoration: BoxDecoration(
        color: VellinColors.fill045,
        borderRadius: BorderRadius.circular(VellinRadius.row),
        border: Border.all(color: VellinColors.line09),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // При правке вложение и голосовое прячутся: заменить снимок или
          // запись в отправленном сообщении нельзя.
          _Collapsible(
            visible: !widget.editing,
            child: Padding(
              padding: const EdgeInsets.only(right: 10),
              child: VellinIconButton(
                glyph: VellinGlyphs.image,
                onPressed: widget.onAttach,
                size: 32,
                radius: VellinRadius.mini,
                glyphSize: 17,
                filled: false,
              ),
            ),
          ),
          if (widget.editing) const SizedBox(width: 8),
          Expanded(
            // Enter отправляет, Shift+Enter переносит строку. Поле
            // многострочное, поэтому решать приходится до того, как перевод
            // строки попадёт в текст.
            child: Focus(
              canRequestFocus: false,
              skipTraversal: true,
              onKeyEvent: (node, event) {
                if (event is! KeyDownEvent) return KeyEventResult.ignored;
                if (event.logicalKey == LogicalKeyboardKey.keyV && HardwareKeyboard.instance.isControlPressed) {
                  widget.onPaste();
                  return KeyEventResult.ignored;
                }
                final enter = event.logicalKey == LogicalKeyboardKey.enter ||
                    event.logicalKey == LogicalKeyboardKey.numpadEnter;
                if (!enter) return KeyEventResult.ignored;
                final shift = HardwareKeyboard.instance.isShiftPressed;
                if (shift) return KeyEventResult.ignored;
                widget.onSubmit();
                return KeyEventResult.handled;
              },
              child: TextField(
              controller: widget.controller,
              focusNode: widget.focusNode,
              maxLines: 5,
              minLines: 1,
              style: TextStyle(
                fontFamily: VellinType.family,
                fontSize: 13.5,
                height: 1.4,
                color: VellinColors.ink92,
              ),
              cursorColor: VellinColors.accent,
              cursorWidth: 1.4,
              decoration: InputDecoration.collapsed(
                hintText: widget.editing ? 'Текст сообщения…' : 'Написать сообщение…',
                hintStyle: TextStyle(
                  fontFamily: VellinType.family,
                  fontSize: 13.5,
                  color: const Color(0x5CFFFFFF),
                ),
              ),
            ),
            ),
          ),
          const SizedBox(width: 10),
          _Collapsible(
            visible: !widget.editing,
            child: Padding(
              padding: const EdgeInsets.only(right: 10),
              child: VellinIconButton(
                glyph: VellinGlyphs.mic,
                onPressed: widget.onVoice,
                size: 32,
                radius: VellinRadius.mini,
                glyphSize: 17,
                filled: false,
              ),
            ),
          ),
          _SendButton(onTap: widget.onSubmit, confirm: widget.editing),
        ],
      ),
    );
  }
}

/// Кнопка отправки: единственная золотая заливка в поле ввода.
class _SendButton extends StatelessWidget {
  final VoidCallback onTap;

  /// Сохранить правку — галочка вместо самолётика.
  final bool confirm;
  const _SendButton({required this.onTap, this.confirm = false});

  @override
  Widget build(BuildContext context) {
    return VellinInteractive(
      onTap: onTap,
      focusRadius: BorderRadius.circular(VellinRadius.button),
      builder: (context, s) => AnimatedContainer(
        duration: VellinMotion.hover,
        curve: VellinMotion.standard,
        width: 34,
        height: 34,
        decoration: BoxDecoration(
          color: VellinColors.accent,
          borderRadius: BorderRadius.circular(VellinRadius.button),
          boxShadow: const [
            BoxShadow(color: Color(0xE6D6AE6E), blurRadius: 18, offset: Offset(0, 6), spreadRadius: -8),
          ],
        ),
        alignment: Alignment.center,
        // Глиф меняется в две фазы: самолётик уходит, галочка приходит.
        child: PhaseSwitch(
          phaseKey: confirm,
          shift: 0,
          out: VellinMotion.micro,
          inDuration: const Duration(milliseconds: 380),
          child: confirm
              ? const VellinIcon(VellinGlyphs.check, size: 17, color: VellinColors.onAccent, stroke: 1.6)
              : const VellinIcon(VellinGlyphs.send, size: 16, color: VellinColors.onAccent),
        ),
      ),
    );
  }
}

/// Кнопка в поле ввода, которая уезжает и схлопывает место под собой.
class _Collapsible extends StatelessWidget {
  final bool visible;
  final Widget child;
  const _Collapsible({required this.visible, required this.child});

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(end: visible ? 1 : 0),
      duration: visible ? VellinMotion.hover : VellinMotion.quick,
      curve: visible ? VellinMotion.standard : VellinMotion.exit,
      builder: (context, t, child) {
        if (t == 0) return const SizedBox.shrink();
        return ClipRect(
          child: Align(
            alignment: Alignment.centerLeft,
            widthFactor: t,
            child: Opacity(opacity: t, child: Transform.scale(scale: 0.8 + 0.2 * t, child: child)),
          ),
        );
      },
      child: child,
    );
  }
}

/// Полоса закреплённого сообщения под шапкой. Появляется, раскрываясь по
/// высоте, уходит так же; смена закрепа — две фазы содержимого.
class _PinBar extends StatefulWidget {
  final DirectMessage? pinned;
  final void Function(String messageId) onOpen;
  final VoidCallback onUnpin;

  const _PinBar({required this.pinned, required this.onOpen, required this.onUnpin});

  @override
  State<_PinBar> createState() => _PinBarState();
}

class _PinBarState extends State<_PinBar> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: VellinMotion.state,
    reverseDuration: VellinMotion.quick,
    value: widget.pinned == null ? 0 : 1,
  );

  /// Что показывать: при уходе полосы закреп уже снят, а текст должен
  /// догаснуть вместе с ней.
  late DirectMessage? _shown = widget.pinned;
  bool _hover = false;

  @override
  void didUpdateWidget(_PinBar old) {
    super.didUpdateWidget(old);
    if (widget.pinned != null) {
      _shown = widget.pinned;
      _c.forward();
    } else if (old.pinned != null) {
      _c.reverse();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, child) {
        if (_c.value == 0) return const SizedBox.shrink();
        final t = _c.status == AnimationStatus.reverse
            ? VellinMotion.exit.transform(_c.value)
            : VellinMotion.standard.transform(_c.value);
        return ClipRect(
          child: Align(
            alignment: Alignment.topCenter,
            heightFactor: t,
            child: Opacity(
              opacity: t.clamp(0.0, 1.0),
              child: Transform.translate(offset: Offset(0, -6 * (1 - t)), child: child),
            ),
          ),
        );
      },
      child: _body(),
    );
  }

  Widget _body() {
    final m = _shown;
    if (m == null) return const SizedBox.shrink();
    final preview = m.body.isNotEmpty ? m.body : dmKindLabel(m.kind);

    return Container(
      height: 50,
      padding: const EdgeInsets.only(left: 18, right: 12),
      decoration: const BoxDecoration(
        color: VellinColors.strip,
        border: Border(bottom: BorderSide(color: VellinColors.line05)),
      ),
      child: Row(
        children: [
          Expanded(
            child: MouseRegion(
              cursor: SystemMouseCursors.click,
              onEnter: (_) => setState(() => _hover = true),
              onExit: (_) => setState(() => _hover = false),
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => widget.onOpen(m.id),
                child: Row(
                  children: [
                    AnimatedContainer(
                      duration: VellinMotion.hover,
                      curve: VellinMotion.standard,
                      width: 2,
                      height: _hover ? 32 : 26,
                      decoration: BoxDecoration(
                        color: VellinColors.accent,
                        borderRadius: BorderRadius.circular(1),
                      ),
                    ),
                    const SizedBox(width: 12),
                    VellinIcon(VellinGlyphs.pin, size: 15, color: _hover ? VellinColors.accent : VellinColors.ink45),
                    const SizedBox(width: 10),
                    Expanded(
                      // Другой закреп — старый текст уходит, новый приходит.
                      child: PhaseSwitch(
                        phaseKey: m.id,
                        shift: 8,
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Закреплённое сообщение',
                              style: VellinType.author.copyWith(fontSize: 11.5, color: VellinColors.accent),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              preview,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: VellinType.caption.copyWith(
                                fontSize: 12.5,
                                color: _hover ? VellinColors.ink82 : VellinColors.ink62,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          VellinIconButton(
            glyph: VellinGlyphs.cross,
            onPressed: widget.onUnpin,
            size: 30,
            radius: VellinRadius.mini,
            glyphSize: 14,
            filled: false,
            tooltip: 'Открепить',
          ),
        ],
      ),
    );
  }
}

/// Полоса над полем ввода: на что отвечаем или что правим.
class _ComposeStrip extends StatefulWidget {
  final DirectMessage? reply;
  final DirectMessage? editing;
  final String Function(DirectMessage m) authorOf;
  final VoidCallback onCancel;
  final void Function(String messageId) onOpen;

  const _ComposeStrip({
    required this.reply,
    required this.editing,
    required this.authorOf,
    required this.onCancel,
    required this.onOpen,
  });

  @override
  State<_ComposeStrip> createState() => _ComposeStripState();
}

class _ComposeStripState extends State<_ComposeStrip> with SingleTickerProviderStateMixin {
  DirectMessage? get _target => widget.editing ?? widget.reply;

  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: VellinMotion.state,
    reverseDuration: VellinMotion.quick,
    value: _target == null ? 0 : 1,
  );

  late DirectMessage? _shown = _target;
  late bool _shownEditing = widget.editing != null;

  @override
  void didUpdateWidget(_ComposeStrip old) {
    super.didUpdateWidget(old);
    if (_target != null) {
      _shown = _target;
      _shownEditing = widget.editing != null;
      _c.forward();
    } else if (old.editing != null || old.reply != null) {
      _c.reverse();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, child) {
        if (_c.value == 0) return const SizedBox.shrink();
        final t = _c.status == AnimationStatus.reverse
            ? VellinMotion.exit.transform(_c.value)
            : VellinMotion.standard.transform(_c.value);
        return ClipRect(
          child: Align(
            alignment: Alignment.bottomCenter,
            heightFactor: t,
            child: Opacity(
              opacity: t.clamp(0.0, 1.0),
              child: Transform.translate(offset: Offset(0, 8 * (1 - t)), child: child),
            ),
          ),
        );
      },
      child: _body(),
    );
  }

  Widget _body() {
    final m = _shown;
    if (m == null) return const SizedBox.shrink();
    final editing = _shownEditing;
    final preview = m.body.isNotEmpty ? m.body : dmKindLabel(m.kind);
    final author = widget.authorOf(m);

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          const SizedBox(width: 6),
          // Смена ответа на правку или на другое сообщение — в две фазы.
          Expanded(
            child: PhaseSwitch(
              phaseKey: '${editing ? 'e' : 'r'}:${m.id}',
              shift: 8,
              child: MouseRegion(
                cursor: SystemMouseCursors.click,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => widget.onOpen(m.id),
                  child: Row(
                    children: [
                      VellinIcon(
                        editing ? VellinGlyphs.edit : VellinGlyphs.reply,
                        size: 16,
                        color: VellinColors.accent,
                      ),
                      const SizedBox(width: 12),
                      Container(
                        width: 2,
                        height: 30,
                        decoration: BoxDecoration(
                          color: VellinColors.accent,
                          borderRadius: BorderRadius.circular(1),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              editing ? 'Редактирование' : 'Ответ · $author',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: VellinType.author.copyWith(fontSize: 11.5, color: VellinColors.accent),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              preview,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: VellinType.caption.copyWith(fontSize: 12.5, color: VellinColors.ink62),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          VellinIconButton(
            glyph: VellinGlyphs.cross,
            onPressed: widget.onCancel,
            size: 28,
            radius: VellinRadius.mini,
            glyphSize: 13,
            filled: false,
            tooltip: editing ? 'Отменить правку' : 'Отменить ответ',
          ),
        ],
      ),
    );
  }
}

/// Панель режима выделения на месте поля ввода.
class _SelectionBar extends StatelessWidget {
  final int count;
  final VoidCallback onCancel;
  final VoidCallback? onForward;
  final VoidCallback? onDelete;

  const _SelectionBar({
    required this.count,
    required this.onCancel,
    required this.onForward,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: VellinLayout.composerMinHeight,
      child: Row(
        children: [
          VellinIconButton(
            glyph: VellinGlyphs.cross,
            onPressed: onCancel,
            size: 32,
            radius: VellinRadius.mini,
            glyphSize: 15,
            filled: false,
            tooltip: 'Снять выделение',
          ),
          const SizedBox(width: 10),
          // Ширина под двузначное число: подпись не дёргается при выборе.
          SizedBox(
            width: 110,
            child: Text(
              'Выбрано: $count',
              style: VellinType.body.copyWith(
                fontSize: 13,
                color: VellinColors.ink82,
                fontFeatures: VellinType.tabular,
              ),
            ),
          ),
          const Spacer(),
          VellinButton(
            label: 'Переслать',
            glyph: VellinGlyphs.forward,
            tone: VellinButtonTone.secondary,
            height: 36,
            onPressed: onForward,
          ),
          const SizedBox(width: 8),
          VellinButton(
            label: 'Удалить',
            glyph: VellinGlyphs.trash,
            tone: VellinButtonTone.danger,
            height: 36,
            onPressed: onDelete,
          ),
        ],
      ),
    );
  }
}

/// Пульсирующая точка записи.
class _RecordingDot extends StatefulWidget {
  const _RecordingDot();
  @override
  State<_RecordingDot> createState() => _RecordingDotState();
}

class _RecordingDotState extends State<_RecordingDot> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, _) {
        final t = VellinMotion.breathe.transform(_c.value);
        return Container(
          width: 7,
          height: 7,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: VellinColors.danger.withValues(alpha: 0.45 + 0.55 * t),
          ),
        );
      },
    );
  }
}

/// Короткое сообщение поверх переписки вместо системного SnackBar.
class ChatToast {
  static void show(BuildContext context, String message) {
    final overlay = Overlay.maybeOf(context);
    if (overlay == null) return;
    late final OverlayEntry entry;
    entry = OverlayEntry(
      builder: (context) => Positioned(
        left: 0,
        right: 0,
        bottom: 92,
        child: Center(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: VellinColors.glassToast,
              borderRadius: BorderRadius.circular(VellinRadius.row),
              border: Border.all(color: VellinColors.line10),
              boxShadow: VellinShadow.pill,
            ),
            child: Text(
              message,
              style: VellinType.body.copyWith(fontSize: 12.5, color: VellinColors.ink82),
            ),
          ),
        ),
      ),
    );
    overlay.insert(entry);
    Future<void>.delayed(const Duration(milliseconds: 2600), entry.remove);
  }
}
