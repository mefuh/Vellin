import 'dart:async';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart' show InputDecoration, TextField;
import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';
import 'package:record/record.dart';

import '../../runtime/media_gate.dart';
import '../../state/auth_controller.dart';
import '../../state/call_controller.dart';
import '../../state/dm_controller.dart';
import '../../state/presence_controller.dart';
import '../../theme/vellin_design.dart';
import '../../theme/vellin_glyphs.dart';
import '../circle_recorder.dart';
import '../ui/vellin_avatar.dart';
import '../ui/vellin_button.dart';
import '../ui/vellin_hover.dart';
import '../ui/vellin_icon.dart';
import 'message_row.dart';

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

  @override
  void initState() {
    super.initState();
    // Лента рисуется снизу вверх (reverse): pixels — расстояние ОТ низа.
    _scroll.addListener(() {
      if (!_scroll.hasClients) return;
      final p = _scroll.position;
      if (p.pixels >= p.maxScrollExtent - 200) _maybeLoadOlder();
      final atBottom = p.pixels <= 120;
      if (atBottom != _atBottom) setState(() => _atBottom = atBottom);
    });
    _input.addListener(() {
      if (_input.text.isNotEmpty) widget.dm.typingText();
      setState(() {}); // кнопка отправки зависит от того, пусто ли поле
    });
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
      allowedExtensions: ['jpg', 'jpeg', 'png', 'webp'],
    );
    final path = picked?.files.single.path;
    if (path == null) return;
    final caption = _input.text;
    _input.clear();
    try {
      await widget.dm.sendImage(path, caption: caption);
    } catch (e) {
      if (mounted) _toast('Не удалось отправить: $e');
    }
  }

  Future<void> _recordCircle() async {
    // Камеру и микрофон во время звонка держит он — записать кружок нечем.
    if (MediaGate.instance.callHoldsDevices) {
      _toast('Идёт звонок — записать кружок нельзя');
      return;
    }
    widget.dm.sendRecordingSignal(true, 'video');
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
      if (mounted) _toast('Не удалось отправить кружок: $e');
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

    final msgs = dm.activeMessages;
    final lastId = msgs.isNotEmpty ? msgs.last.id : null;
    if (dm.activePeerPublicId != _shownPeer) {
      _shownPeer = dm.activePeerPublicId;
      _lastMsgId = lastId;
      _scrollToBottom();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _inputFocus.requestFocus();
      });
    } else if (lastId != null && lastId != _lastMsgId) {
      final mine = msgs.last.senderId == dm.myUserId;
      _lastMsgId = lastId;
      if (mine) _scrollToBottom();
    }

    return Column(
      children: [
        _ChatHeader(dm: dm, onOpenProfile: widget.onOpenProfile),
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
                      glyphSize: 12,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        _composer(),
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
      padding: const EdgeInsets.fromLTRB(24, 20, 24, 20),
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
            MessageRow(
              message: m,
              mine: mine,
              groupStart: groupStart,
              peer: dm.activePeer,
              myUsername: auth?.username ?? '',
              myAvatarUrl: auth?.avatarUrl,
              peerReadAt: peerRead,
              onVoicePlayed: dm.markVoicePlayed,
              onImageTap: widget.onOpenImage,
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
      child: _recording ? _recordingBar() : _inputBar(),
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
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(
          child: _InputField(
            controller: _input,
            focusNode: _inputFocus,
            onSubmit: _send,
            onAttach: _attach,
            onVoice: _startRecord,
          ),
        ),
        const SizedBox(width: 10),
        _CircleButton(onTap: _recordCircle),
        const SizedBox(width: 8),
        _SendButton(onTap: _send),
      ],
    );
  }

  static String _fmtSeconds(int s) =>
      '${(s ~/ 60).toString().padLeft(2, '0')}:${(s % 60).toString().padLeft(2, '0')}';
}

/// Шапка чата: аватар, имя, живая строка состояния и кнопки звонка.
class _ChatHeader extends StatelessWidget {
  final DmController dm;
  final VoidCallback onOpenProfile;

  const _ChatHeader({required this.dm, required this.onOpenProfile});

  @override
  Widget build(BuildContext context) {
    final presence = context.watch<PresenceController>();
    final call = context.watch<CallController>();
    final peer = dm.activePeer;
    final peerId = dm.activePeerUserId;
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
                        activity: dm.peerActivity,
                        presence: state,
                        lastSeenAt: info?.lastSeenAt,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          VellinIconButton(
            glyph: VellinGlyphs.calls,
            onPressed: busy || peerId == null ? null : () => call.invite(peerId, video: false),
            size: 34,
            radius: VellinRadius.button,
          ),
          const SizedBox(width: 8),
          VellinIconButton(
            glyph: VellinGlyphs.camera,
            onPressed: busy || peerId == null ? null : () => call.invite(peerId, video: true),
            size: 34,
            radius: VellinRadius.button,
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
        VellinPresence.away => 'недавно',
        VellinPresence.offline => presenceLabel(online: false, lastSeenAt: lastSeenAt),
      },
      style: VellinType.caption.copyWith(
        color: switch (presence) {
          VellinPresence.online => const Color(0xE693B08A),
          VellinPresence.away => const Color(0xCCD6AE6E),
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
  final VoidCallback onSubmit;
  final VoidCallback onAttach;
  final VoidCallback onVoice;

  const _InputField({
    required this.controller,
    required this.focusNode,
    required this.onSubmit,
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
    final focused = widget.focusNode.hasFocus;

    return AnimatedContainer(
      duration: VellinMotion.hover,
      curve: VellinMotion.standard,
      constraints: const BoxConstraints(minHeight: VellinLayout.composerMinHeight),
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: VellinColors.fill045,
        borderRadius: BorderRadius.circular(VellinRadius.row),
        border: Border.all(color: focused ? VellinColors.focusRing : VellinColors.line09),
        boxShadow: focused ? VellinShadow.focus : null,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          VellinIconButton(
            glyph: VellinGlyphs.image,
            onPressed: widget.onAttach,
            size: 32,
            radius: VellinRadius.mini,
            glyphSize: 17,
            filled: false,
          ),
          const SizedBox(width: 4),
          Expanded(
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
              onSubmitted: (_) => widget.onSubmit(),
              decoration: InputDecoration.collapsed(
                hintText: 'Написать сообщение…',
                hintStyle: TextStyle(
                  fontFamily: VellinType.family,
                  fontSize: 13.5,
                  color: const Color(0x5CFFFFFF),
                ),
              ),
            ),
          ),
          const SizedBox(width: 4),
          VellinIconButton(
            glyph: VellinGlyphs.mic,
            onPressed: widget.onVoice,
            size: 32,
            radius: VellinRadius.mini,
            glyphSize: 17,
            filled: false,
          ),
        ],
      ),
    );
  }
}

/// Кнопка записи кружка.
class _CircleButton extends StatelessWidget {
  final VoidCallback onTap;
  const _CircleButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return VellinIconButton(
      glyph: VellinGlyphs.camera,
      onPressed: onTap,
      size: 34,
      radius: VellinRadius.button,
      glyphSize: 17,
    );
  }
}

/// Кнопка отправки: единственная золотая заливка в поле ввода.
class _SendButton extends StatelessWidget {
  final VoidCallback onTap;
  const _SendButton({required this.onTap});

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
        child: const VellinIcon(VellinGlyphs.send, size: 16, color: VellinColors.onAccent),
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
