import 'dart:async';
import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:record/record.dart';
import '../app_config.dart';
import '../models/dm.dart';
import '../state/auth_controller.dart';
import '../state/dm_controller.dart';
import '../state/presence_controller.dart';
import '../theme/vellin_theme.dart';
import '../widgets/back_dismiss.dart';
import '../widgets/common.dart';
import '../widgets/voice_bubble.dart';
import '../widgets/video_bubble.dart';
import '../widgets/circle_recorder.dart';

/// Раздел «Сообщения»: слева список диалогов, справа активный чат (two-pane).
class MessagesScreen extends StatelessWidget {
  const MessagesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final dm = context.watch<DmController>();

    // Esc / Alt+← / боковая кнопка мыши закрывают открытый диалог. autofocus
    // выключен: иначе обёртка перетягивала бы фокус с поля ввода после Enter.
    return BackDismissible(
      autofocus: false,
      onBack: () {
        if (dm.activePeerPublicId != null) dm.closeThread();
      },
      child: Scaffold(
        backgroundColor: VellinColors.bg0,
        body: Row(children: [
          SizedBox(width: 300, child: _ConversationList(dm: dm)),
          const VerticalDivider(width: 1, thickness: 1, color: VellinColors.line2),
          Expanded(child: dm.activePeerPublicId == null ? const _EmptyChat() : _ChatPane(dm: dm)),
        ]),
      ),
    );
  }
}

class _ConversationList extends StatelessWidget {
  final DmController dm;
  const _ConversationList({required this.dm});

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      const Padding(
        padding: EdgeInsets.fromLTRB(20, 24, 20, 12),
        child: Align(
          alignment: Alignment.centerLeft,
          child: Text('Сообщения',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: VellinColors.text0, letterSpacing: -0.5)),
        ),
      ),
      Expanded(
        child: dm.loadingConversations && dm.conversations.isEmpty
            ? const Center(child: CircularProgressIndicator(color: VellinColors.accentHi))
            : dm.conversations.isEmpty
                ? const Padding(
                    padding: EdgeInsets.all(20),
                    child: Center(
                      child: Text('Нет диалогов. Напишите другу из вкладки «Друзья».',
                          textAlign: TextAlign.center, style: TextStyle(color: VellinColors.text3, fontSize: 14)),
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    itemCount: dm.conversations.length,
                    itemBuilder: (_, i) => _ConversationTile(c: dm.conversations[i], dm: dm),
                  ),
      ),
    ]);
  }
}

class _ConversationTile extends StatelessWidget {
  final DmConversation c;
  final DmController dm;
  const _ConversationTile({required this.c, required this.dm});

  @override
  Widget build(BuildContext context) {
    final active = c.peer.publicId == dm.activePeerPublicId;
    final online = context.watch<PresenceController>().of(c.peer.id)?.online ?? c.online;
    return Material(
      color: active ? VellinColors.bg3 : Colors.transparent,
      borderRadius: BorderRadius.circular(VellinRadius.md),
      child: InkWell(
        borderRadius: BorderRadius.circular(VellinRadius.md),
        onTap: () => dm.openThread(c.peer.publicId),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          child: Row(children: [
            VellinAvatar(username: c.peer.username, avatarSeed: c.peer.avatarSeed, avatarUrl: c.peer.avatarUrl, size: 42, online: online),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(c.peer.username,
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: VellinColors.text0, fontSize: 14.5, fontWeight: FontWeight.w600)),
                if (c.lastBody != null)
                  Text(c.lastBody!,
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: VellinColors.text2, fontSize: 13)),
              ]),
            ),
            if (c.unreadCount > 0) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(color: VellinColors.accent, borderRadius: BorderRadius.circular(999)),
                child: Text('${c.unreadCount}', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
              ),
            ],
          ]),
        ),
      ),
    );
  }
}

class _EmptyChat extends StatelessWidget {
  const _EmptyChat();
  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Text('Выберите диалог', style: TextStyle(color: VellinColors.text3, fontSize: 15)),
    );
  }
}

class _ChatPane extends StatefulWidget {
  final DmController dm;
  const _ChatPane({required this.dm});
  @override
  State<_ChatPane> createState() => _ChatPaneState();
}

class _ChatPaneState extends State<_ChatPane> {
  final _input = TextEditingController();
  final _inputFocus = FocusNode();
  final _scroll = ScrollController();
  String? _shownPeer;
  String? _lastMsgId;
  bool _loadingOlder = false;
  String? _watchedPeerId; // на чьё присутствие подписаны сейчас
  bool _atBottom = true; // виден конец переписки (иначе показываем стрелку вниз)

  // Запись голосового.
  final _rec = AudioRecorder();
  bool _recording = false;
  int _recSeconds = 0;
  Timer? _recTimer;
  StreamSubscription<Amplitude>? _ampSub;
  final List<int> _peaks = [];
  String? _recPath;

  @override
  void initState() {
    super.initState();
    // Список рисуется снизу вверх (reverse), поэтому pixels — расстояние ОТ
    // низа: 0 — самый низ, максимум — начало переписки.
    _scroll.addListener(() {
      if (!_scroll.hasClients) return;
      final p = _scroll.position;
      if (p.pixels >= p.maxScrollExtent - 200) _maybeLoadOlder();
      final atBottom = p.pixels <= 120;
      if (atBottom != _atBottom) setState(() => _atBottom = atBottom);
    });
    // Ввод текста → сигнал «печатает» собеседнику.
    _input.addListener(() {
      if (_input.text.isNotEmpty) widget.dm.typingText();
    });
  }

  /// Подписаться на live-присутствие текущего собеседника (и отписаться от
  /// прежнего). Вызывается из build при смене активного треда.
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
    // Позицию сохранять не нужно: в reverse-списке отсчёт идёт от низа, а
    // старые сообщения дописываются сверху и текущий кадр не смещают.
    await widget.dm.loadOlder();
    _loadingOlder = false;
  }

  @override
  void dispose() {
    if (_watchedPeerId != null) {
      // Не через context (виджет размонтируется) — читаем провайдер заранее нельзя,
      // поэтому отписку делаем безопасно: presence уже знает счётчик.
      context.read<PresenceController>().unwatch(_watchedPeerId!);
    }
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
    if (text.trim().isEmpty) return;
    widget.dm.sendText(text);
    _input.clear();
    // Оставляем фокус в поле — можно печатать дальше без клика.
    _inputFocus.requestFocus();
  }

  Future<void> _startRecord() async {
    if (!await _rec.hasPermission()) {
      if (mounted) _snack('Нет доступа к микрофону');
      return;
    }
    _peaks.clear();
    _recSeconds = 0;
    _recPath = '${Directory.systemTemp.path}${Platform.pathSeparator}vellin_voice_${DateTime.now().millisecondsSinceEpoch}.wav';
    await _rec.start(const RecordConfig(encoder: AudioEncoder.wav), path: _recPath!);
    _ampSub = _rec.onAmplitudeChanged(const Duration(milliseconds: 150)).listen((amp) {
      // dBFS (~ -45..0) → 0..100.
      final norm = ((amp.current + 45) / 45 * 100).clamp(0, 100).round();
      _peaks.add(norm);
    });
    _recTimer = Timer.periodic(const Duration(seconds: 1), (_) => setState(() => _recSeconds++));
    setState(() => _recording = true);
    widget.dm.sendRecordingSignal(true, 'voice'); // «записывает голосовое»
  }

  Future<void> _stopRecordAndSend() async {
    final path = await _rec.stop();
    _recTimer?.cancel();
    await _ampSub?.cancel();
    final seconds = _recSeconds;
    setState(() => _recording = false);
    widget.dm.sendRecordingSignal(false, 'voice');
    if (path == null || seconds < 1) return; // слишком коротко — отбрасываем
    // Прореживаем пики до ≤56 столбиков.
    final peaks = _downsample(_peaks, 56);
    try {
      await widget.dm.sendVoice(path, seconds, peaks);
    } catch (e) {
      if (mounted) _snack('Не удалось отправить голосовое: $e');
    }
  }

  Future<void> _cancelRecord() async {
    await _rec.stop();
    _recTimer?.cancel();
    await _ampSub?.cancel();
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

  void _snack(String msg) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: VellinColors.bg3));

  Future<void> _attach() async {
    final picked = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['jpg', 'jpeg', 'png', 'webp'],
    );
    final path = picked?.files.single.path;
    if (path == null) return;
    final caption = _input.text;
    _input.clear();
    try {
      await widget.dm.sendImage(path, caption: caption);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Не удалось отправить: $e'), backgroundColor: VellinColors.bg3),
        );
      }
    }
  }

  Future<void> _recordCircle() async {
    widget.dm.sendRecordingSignal(true, 'video'); // «записывает видео»
    CircleRecording? rec;
    try {
      rec = await showCircleRecorder(context);
    } finally {
      widget.dm.sendRecordingSignal(false, 'video');
    }
    if (rec == null) return;
    try {
      await widget.dm.sendVideoNote(rec.path, rec.seconds);
    } catch (e) {
      if (mounted) _snack('Не удалось отправить кружок: $e');
    }
  }

  /// Низ переписки в reverse-списке — позиция 0, поэтому прыжок точный и не
  /// зависит от того, что картинки/кружки догрузятся позже.
  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.jumpTo(0);
    });
  }

  void _animateToBottom() {
    if (!_scroll.hasClients) return;
    _scroll.animateTo(0, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
  }

  @override
  Widget build(BuildContext context) {
    final dm = widget.dm;
    // Синхронизируем подписку на присутствие собеседника после смены треда.
    WidgetsBinding.instance.addPostFrameCallback((_) { if (mounted) _syncPresenceWatch(); });
    final presence = context.watch<PresenceController>();
    final msgs = dm.activeMessages;
    // В reverse-списке низ держится сам: новые сообщения приходят в позицию 0,
    // и если пользователь внизу, он там и остаётся. Прыгаем вручную только при
    // смене диалога и когда пользователь сам отправил сообщение, читая старое.
    final lastId = msgs.isNotEmpty ? msgs.last.id : null;
    if (dm.activePeerPublicId != _shownPeer) {
      _shownPeer = dm.activePeerPublicId;
      _lastMsgId = lastId;
      _scrollToBottom();
      // Сразу ставим фокус в поле ввода при открытии диалога.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _inputFocus.requestFocus();
      });
    } else if (lastId != null && lastId != _lastMsgId) {
      final mine = msgs.last.senderId == dm.myUserId;
      _lastMsgId = lastId;
      if (mine) _scrollToBottom();
    }
    final peerName = dm.conversations
        .cast<DmConversation?>()
        .firstWhere((c) => c?.peer.publicId == dm.activePeerPublicId, orElse: () => null)
        ?.peer
        .username;

    final peerId = dm.activePeerUserId;
    final info = peerId != null ? presence.of(peerId) : null;

    return Column(children: [
      // Заголовок собеседника (тап — открыть профиль).
      InkWell(
        onTap: dm.activePeerPublicId != null ? () => context.push('/u/${dm.activePeerPublicId!}') : null,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: VellinColors.line2))),
          alignment: Alignment.centerLeft,
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(peerName ?? 'Диалог',
                style: const TextStyle(color: VellinColors.text0, fontSize: 16, fontWeight: FontWeight.w600)),
            const SizedBox(height: 2),
            _StatusLine(activity: dm.peerActivity, online: info?.online ?? false, lastSeenAt: info?.lastSeenAt),
          ]),
        ),
      ),
      Expanded(
        child: dm.threadLoading
            ? const Center(child: CircularProgressIndicator(color: VellinColors.accentHi))
            : Builder(builder: (_) {
                final me = context.read<AuthController>().user;
                final peer = dm.activePeer;
                // Плоский список: разделители дат вперемешку с сообщениями.
                final rows = <Object>[];
                DateTime? lastDay;
                for (final m in msgs) {
                  final t = DateTime.tryParse(m.createdAt)?.toLocal();
                  if (t != null) {
                    final day = DateTime(t.year, t.month, t.day);
                    if (lastDay == null || day != lastDay) {
                      rows.add(day);
                      lastDay = day;
                    }
                  }
                  rows.add(m);
                }
                // Аватар показываем только у последнего сообщения группы одного
                // отправителя (Telegram-стиль), в остальных — колонка резервируется.
                final showAvatar = <String>{};
                for (var k = 0; k < rows.length; k++) {
                  final r = rows[k];
                  if (r is! DirectMessage) continue;
                  final next = k + 1 < rows.length ? rows[k + 1] : null;
                  if (next is! DirectMessage || next.senderId != r.senderId) showAvatar.add(r.id);
                }
                // reverse: список строится от низа. Индекс 0 — последнее
                // сообщение, поэтому диалог всегда открывается точно в конце,
                // даже если картинки и кружки догрузятся позже.
                final display = rows.reversed.toList();
                return Stack(children: [
                  ListView.builder(
                    controller: _scroll,
                    reverse: true,
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                    itemCount: display.length + 1,
                    itemBuilder: (_, i) {
                      // Последний по индексу = самый верх: индикатор догрузки.
                      if (i == display.length) {
                        return dm.loadingOlder
                            ? const Padding(
                                padding: EdgeInsets.symmetric(vertical: 10),
                                child: Center(child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: VellinColors.accentHi))),
                              )
                            : const SizedBox.shrink();
                      }
                      final row = display[i];
                      if (row is DateTime) return _DateDivider(day: row);
                      final m = row as DirectMessage;
                      final mine = m.senderId == dm.myUserId;
                      return _Bubble(
                        m: m,
                        mine: mine,
                        showAvatar: showAvatar.contains(m.id),
                        senderName: mine ? (me?.username ?? '') : (peer?.username ?? ''),
                        senderSeed: mine ? (me?.avatarSeed ?? '') : (peer?.avatarSeed ?? ''),
                        senderAvatarUrl: mine ? me?.avatarUrl : peer?.avatarUrl,
                      );
                    },
                  ),
                  // Возврат в конец переписки.
                  Positioned(
                    right: 20,
                    bottom: 16,
                    child: AnimatedSlide(
                      offset: _atBottom ? const Offset(0, 1.4) : Offset.zero,
                      duration: const Duration(milliseconds: 180),
                      curve: Curves.easeOut,
                      child: AnimatedOpacity(
                        opacity: _atBottom ? 0 : 1,
                        duration: const Duration(milliseconds: 180),
                        child: IgnorePointer(
                          ignoring: _atBottom,
                          child: _ScrollDownButton(onTap: _animateToBottom),
                        ),
                      ),
                    ),
                  ),
                ]);
              }),
      ),
      if (dm.sendingImage)
        const Padding(
          padding: EdgeInsets.only(bottom: 4),
          child: Text('Отправка изображения…', style: TextStyle(color: VellinColors.text3, fontSize: 12)),
        ),
      _Composer(
        controller: _input,
        focusNode: _inputFocus,
        onSend: _send,
        onAttach: _attach,
        recording: _recording,
        recSeconds: _recSeconds,
        onStartRecord: _startRecord,
        onStopSend: _stopRecordAndSend,
        onCancelRecord: _cancelRecord,
        onVideoNote: _recordCircle,
      ),
    ]);
  }
}

const _months = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/// Время отправки «ЧЧ:ММ» (пусто, если дата не распарсилась).
String _fmtTime(String iso) {
  final t = DateTime.tryParse(iso)?.toLocal();
  if (t == null) return '';
  return '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
}

/// Подпись разделителя: «Сегодня» / «Вчера» / «24 июля» / «24 июля 2025».
String _fmtDay(DateTime day) {
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final diff = today.difference(day).inDays;
  if (diff == 0) return 'Сегодня';
  if (diff == 1) return 'Вчера';
  final base = '${day.day} ${_months[day.month - 1]}';
  return day.year == now.year ? base : '$base ${day.year}';
}

/// Разделитель дня в ленте сообщений.
class _DateDivider extends StatelessWidget {
  final DateTime day;
  const _DateDivider({required this.day});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
          decoration: BoxDecoration(
            color: VellinColors.bg2,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: VellinColors.line2),
          ),
          child: Text(_fmtDay(day),
              style: const TextStyle(color: VellinColors.text2, fontSize: 12, fontWeight: FontWeight.w500)),
        ),
      ),
    );
  }
}

/// Круглая кнопка «в конец переписки».
class _ScrollDownButton extends StatelessWidget {
  final VoidCallback onTap;
  const _ScrollDownButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: VellinColors.bg2,
      shape: const CircleBorder(side: BorderSide(color: VellinColors.line2)),
      elevation: 3,
      shadowColor: Colors.black54,
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: const SizedBox(
          width: 42,
          height: 42,
          child: Icon(Icons.keyboard_arrow_down_rounded, color: VellinColors.text1, size: 26),
        ),
      ),
    );
  }
}

/// Время отправки внутри бабла.
class _TimeLabel extends StatelessWidget {
  final String iso;
  final bool mine;
  final bool onMedia; // поверх изображения — нужна тёмная подложка
  const _TimeLabel({required this.iso, required this.mine, this.onMedia = false});

  @override
  Widget build(BuildContext context) {
    final text = Text(
      _fmtTime(iso),
      style: TextStyle(
        color: onMedia ? Colors.white : (mine ? Colors.white70 : VellinColors.text3),
        fontSize: 11,
      ),
    );
    if (!onMedia) return text;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.45), borderRadius: BorderRadius.circular(999)),
      child: text,
    );
  }
}

/// Сообщение в стиле Telegram: все слева, слева от бабла — аватар отправителя
/// (показывается только у последнего сообщения группы, иначе колонка пустая).
class _Bubble extends StatelessWidget {
  final DirectMessage m;
  final bool mine;
  final bool showAvatar;
  final String senderName;
  final String senderSeed;
  final String? senderAvatarUrl;
  const _Bubble({
    required this.m,
    required this.mine,
    required this.showAvatar,
    required this.senderName,
    required this.senderSeed,
    required this.senderAvatarUrl,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: showAvatar ? 10 : 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          // Аватар — у последнего сообщения группы; иначе колонка резервируется.
          SizedBox(
            width: 32,
            child: showAvatar
                ? VellinAvatar(username: senderName, avatarSeed: senderSeed, avatarUrl: senderAvatarUrl, size: 32)
                : null,
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Align(
              alignment: Alignment.centerLeft,
              child: Opacity(opacity: m.pending ? 0.7 : 1, child: _content()),
            ),
          ),
        ],
      ),
    );
  }

  Widget _content() {
    // Видео-кружок — отдельный круглый бабл без прямоугольной подложки.
    if (m.videoStatus != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Opacity(
            opacity: m.pending && m.videoStatus == 'processing' ? 0.85 : 1,
            child: VideoBubble(status: m.videoStatus, videoUrl: m.videoUrl, thumbUrl: m.videoThumbUrl),
          ),
          Padding(
            padding: const EdgeInsets.only(left: 6, top: 4),
            child: _TimeLabel(iso: m.createdAt, mine: false),
          ),
        ],
      );
    }
    final hasImage = m.imageUrl != null;
    final hasVoice = m.voiceUrl != null;
    final hasText = m.body.isNotEmpty;
    return Container(
      padding: hasImage
          ? const EdgeInsets.all(4)
          : hasVoice
              ? const EdgeInsets.symmetric(horizontal: 10, vertical: 8)
              : const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
      constraints: const BoxConstraints(maxWidth: 440),
      decoration: BoxDecoration(
        color: mine ? VellinColors.accent : VellinColors.bg2,
        borderRadius: BorderRadius.circular(VellinRadius.lg),
      ),
      child: Column(
        // Без картинки колонка сама прижимает время вправо (Align нельзя —
        // он растягивает бабл на всю максимальную ширину).
        crossAxisAlignment: hasImage ? CrossAxisAlignment.start : CrossAxisAlignment.end,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (hasVoice)
            VoiceBubble(
              url: AppConfig.mediaUrl(m.voiceUrl)!,
              durationSec: m.voiceDurationSec ?? 0,
              peaks: m.voicePeaks ?? const [],
              mine: mine,
            ),
          if (hasImage)
            Stack(children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(VellinRadius.md),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 300, maxHeight: 360),
                  child: Image.network(
                    AppConfig.mediaUrl(m.imageUrl)!,
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) => const SizedBox(
                      width: 200, height: 120,
                      child: Center(child: Icon(Icons.broken_image_outlined, color: VellinColors.text3)),
                    ),
                  ),
                ),
              ),
              Positioned(
                right: 8,
                bottom: 8,
                child: _TimeLabel(iso: m.createdAt, mine: mine, onMedia: true),
              ),
            ]),
          if (hasText)
            Padding(
              padding: hasImage ? const EdgeInsets.fromLTRB(10, 8, 10, 0) : EdgeInsets.zero,
              child: Text(
                m.body,
                style: TextStyle(color: mine ? Colors.white : VellinColors.text0, fontSize: 14.5, height: 1.35),
              ),
            ),
          if (!hasImage && !hasVoice && !hasText)
            Text(m.previewText,
                style: TextStyle(color: mine ? Colors.white : VellinColors.text0, fontSize: 14.5, height: 1.35)),
          // Время: у картинок оно уже наложено на изображение.
          if (!hasImage)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: _TimeLabel(iso: m.createdAt, mine: mine),
            ),
        ],
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode focusNode;
  final VoidCallback onSend;
  final VoidCallback onAttach;
  final bool recording;
  final int recSeconds;
  final VoidCallback onStartRecord;
  final VoidCallback onStopSend;
  final VoidCallback onCancelRecord;
  final VoidCallback onVideoNote;

  const _Composer({
    required this.controller,
    required this.focusNode,
    required this.onSend,
    required this.onAttach,
    required this.recording,
    required this.recSeconds,
    required this.onStartRecord,
    required this.onStopSend,
    required this.onCancelRecord,
    required this.onVideoNote,
  });

  String _fmt(int s) => '${(s ~/ 60).toString().padLeft(2, '0')}:${(s % 60).toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      decoration: const BoxDecoration(border: Border(top: BorderSide(color: VellinColors.line2))),
      child: recording ? _recordingBar() : _inputBar(),
    );
  }

  Widget _recordingBar() {
    return Row(children: [
      IconButton(
        onPressed: onCancelRecord,
        tooltip: 'Отменить',
        icon: const Icon(Icons.delete_outline, color: VellinColors.text2),
      ),
      const SizedBox(width: 8),
      const _RecDot(),
      const SizedBox(width: 10),
      Text('Идёт запись · ${_fmt(recSeconds)}', style: const TextStyle(color: VellinColors.text1, fontSize: 14)),
      const Spacer(),
      IconButton.filled(
        onPressed: onStopSend,
        style: IconButton.styleFrom(backgroundColor: VellinColors.accent),
        icon: const Icon(Icons.send, color: Colors.white, size: 20),
      ),
    ]);
  }

  Widget _inputBar() {
    return Row(children: [
      IconButton(
        onPressed: onAttach,
        tooltip: 'Прикрепить изображение',
        icon: const Icon(Icons.image_outlined, color: VellinColors.text2),
      ),
      const SizedBox(width: 4),
      Expanded(
        child: TextField(
          controller: controller,
          focusNode: focusNode,
          onSubmitted: (_) => onSend(),
          textInputAction: TextInputAction.send,
          style: const TextStyle(color: VellinColors.text0, fontSize: 15),
          decoration: InputDecoration(
            hintText: 'Сообщение…',
            hintStyle: const TextStyle(color: VellinColors.text3),
            filled: true,
            fillColor: VellinColors.bg2,
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(VellinRadius.md),
              borderSide: const BorderSide(color: VellinColors.line2),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(VellinRadius.md),
              borderSide: const BorderSide(color: VellinColors.accentHi),
            ),
          ),
        ),
      ),
      const SizedBox(width: 6),
      IconButton(
        onPressed: onVideoNote,
        tooltip: 'Записать видео-кружок',
        icon: const Icon(Icons.videocam_outlined, color: VellinColors.text2),
      ),
      IconButton(
        onPressed: onStartRecord,
        tooltip: 'Записать голосовое',
        icon: const Icon(Icons.mic_none, color: VellinColors.text2),
      ),
      IconButton.filled(
        onPressed: onSend,
        style: IconButton.styleFrom(backgroundColor: VellinColors.accent),
        icon: const Icon(Icons.send, color: Colors.white, size: 20),
      ),
    ]);
  }
}

/// Строка статуса в шапке чата: живой индикатор «печатает/записывает …» либо
/// присутствие («в сети» / «был(а) в сети …»). Меняется в реальном времени.
class _StatusLine extends StatelessWidget {
  final String? activity; // 'text' | 'voice' | 'video' | null
  final bool online;
  final String? lastSeenAt;
  const _StatusLine({required this.activity, required this.online, required this.lastSeenAt});

  @override
  Widget build(BuildContext context) {
    if (activity != null) {
      final label = switch (activity) {
        'voice' => 'записывает голосовое',
        'video' => 'записывает видео',
        _ => 'печатает',
      };
      return Row(mainAxisSize: MainAxisSize.min, children: [
        Text(label, style: const TextStyle(color: VellinColors.accentHi, fontSize: 12.5, fontWeight: FontWeight.w500)),
        const SizedBox(width: 5),
        const _TypingDots(),
      ]);
    }
    return Text(
      presenceLabel(online: online, lastSeenAt: lastSeenAt),
      style: TextStyle(color: online ? VellinColors.ok : VellinColors.text2, fontSize: 12.5),
    );
  }
}

/// Три пульсирующие точки рядом с «печатает».
class _TypingDots extends StatefulWidget {
  const _TypingDots();
  @override
  State<_TypingDots> createState() => _TypingDotsState();
}

class _TypingDotsState extends State<_TypingDots> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))..repeat();
  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  double _opacity(int i) {
    final phase = ((_c.value - i * 0.18) % 1.0 + 1.0) % 1.0;
    final v = phase < 0.5 ? 0.3 + phase * 1.4 : 1.0 - (phase - 0.5) * 1.4;
    return v.clamp(0.3, 1.0);
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (_, _) => Row(
        mainAxisSize: MainAxisSize.min,
        children: List.generate(3, (i) => Padding(
              padding: const EdgeInsets.only(right: 2),
              child: Opacity(
                opacity: _opacity(i),
                child: Container(width: 3.5, height: 3.5, decoration: const BoxDecoration(color: VellinColors.accentHi, shape: BoxShape.circle)),
              ),
            )),
      ),
    );
  }
}

class _RecDot extends StatefulWidget {
  const _RecDot();
  @override
  State<_RecDot> createState() => _RecDotState();
}

class _RecDotState extends State<_RecDot> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 800))..repeat(reverse: true);
  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween<double>(begin: 0.3, end: 1).animate(_c),
      child: Container(width: 10, height: 10, decoration: const BoxDecoration(color: VellinColors.accent, shape: BoxShape.circle)),
    );
  }
}
