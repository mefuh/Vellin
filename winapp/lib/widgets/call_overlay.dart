import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:provider/provider.dart';

import '../models/social.dart';
import '../state/call_controller.dart';
import '../theme/vellin_theme.dart';
import 'common.dart';
import 'screen_share_picker.dart';

/// «5:32» от момента ответа.
String _elapsed(String? answeredAt) {
  if (answeredAt == null) return '';
  final start = DateTime.tryParse(answeredAt)?.toLocal();
  if (start == null) return '';
  final total = DateTime.now().difference(start).inSeconds.clamp(0, 359999);
  return '${total ~/ 60}:${(total % 60).toString().padLeft(2, '0')}';
}

/// Экраны звонка поверх всего приложения: входящий, разговор и свёрнутая
/// полоса. Живут в Stack над роутером, поэтому переходы по разделам разговор
/// не прерывают.
class CallLayer extends StatelessWidget {
  const CallLayer({super.key});

  @override
  Widget build(BuildContext context) {
    final call = context.watch<CallController>();
    final show = call.incoming != null ||
        (call.isMine && call.call != null && call.uiMode == CallUiMode.expanded) ||
        call.error != null;
    if (!show) return const SizedBox.shrink();

    // Собственный Overlay: слой звонка живёт ВЫШЕ навигатора приложения, а
    // всплывающие подсказки кнопок ищут ближайший Overlay-предок. Без него
    // подсказка рисовалась серым прямоугольником поверх экрана — и он
    // перекрывал сами кнопки, так что ответить на звонок было нельзя.
    return Overlay(initialEntries: [
      OverlayEntry(builder: (context) {
        final c = context.watch<CallController>();
        // Material обязателен: Overlay сам по себе не даёт ни подложки, ни
        // базового стиля текста, и надписи рисовались с жёлтым подчёркиванием
        // «текста вне Material». Прозрачный — фон рисуют сами экраны.
        return Material(
          type: MaterialType.transparency,
          child: Stack(children: [
            if (c.incoming != null) const _IncomingCall(),
            if (c.isMine && c.call != null && c.uiMode == CallUiMode.expanded) const _CallScreen(),
            if (c.error != null) _CallError(message: c.error!, onDone: c.clearError),
          ]),
        );
      }),
    ]);
  }
}

/// Высота полосы свёрнутого звонка.
const double _callBarHeight = 44;

/// Место для свёрнутого звонка в колонке окна: полоса раздвигает содержимое,
/// а не накрывает его, иначе она перекрывала бы шапку раздела.
class CallBarSlot extends StatelessWidget {
  const CallBarSlot({super.key});

  @override
  Widget build(BuildContext context) {
    final call = context.watch<CallController>();
    if (!call.isMine || call.call == null || call.uiMode != CallUiMode.minimized) {
      return const SizedBox.shrink();
    }
    // Полоса живёт над навигатором, где своего Overlay нет, а подсказкам
    // кнопок он нужен — иначе они всплывают чужим светлым прямоугольником.
    return SizedBox(
      height: _callBarHeight,
      child: Overlay(initialEntries: [OverlayEntry(builder: (_) => const _CallBar())]),
    );
  }
}

class _IncomingCall extends StatelessWidget {
  const _IncomingCall();

  @override
  Widget build(BuildContext context) {
    final call = context.watch<CallController>();
    final inc = call.incoming;
    if (inc == null) return const SizedBox.shrink();
    final from = inc.from;

    return Positioned.fill(
      child: Container(
        color: Colors.black.withValues(alpha: 0.62),
        alignment: Alignment.center,
        child: Container(
          width: 380,
          padding: const EdgeInsets.fromLTRB(24, 28, 24, 22),
          decoration: BoxDecoration(
            color: VellinColors.bg1,
            borderRadius: BorderRadius.circular(VellinRadius.xl),
            border: Border.all(color: VellinColors.line2),
          ),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            VellinAvatar(
              username: from.username,
              avatarSeed: from.avatarSeed,
              avatarUrl: from.avatarUrl,
              size: 92,
            ),
            const SizedBox(height: 16),
            Text(from.username,
                style: const TextStyle(color: VellinColors.text0, fontSize: 20, fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            Text(inc.call.video ? 'Входящий видеозвонок' : 'Входящий звонок',
                style: const TextStyle(color: VellinColors.text2, fontSize: 13.5)),
            const SizedBox(height: 26),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              _RoundButton(
                icon: Icons.call_end,
                color: VellinColors.accent,
                tooltip: 'Отклонить',
                onTap: call.decline,
              ),
              const SizedBox(width: 12),
              if (inc.call.video) ...[
                _RoundButton(
                  icon: Icons.videocam,
                  color: VellinColors.bg4,
                  tooltip: 'Ответить с камерой',
                  onTap: () => call.accept(video: true),
                ),
                const SizedBox(width: 12),
              ],
              _RoundButton(
                icon: Icons.call,
                color: VellinColors.ok,
                tooltip: 'Ответить',
                onTap: () => call.accept(video: false),
              ),
            ]),
          ]),
        ),
      ),
    );
  }
}

class _CallScreen extends StatefulWidget {
  const _CallScreen();
  @override
  State<_CallScreen> createState() => _CallScreenState();
}

class _CallScreenState extends State<_CallScreen> {
  Timer? _tick;

  /// Какой поток показан крупно. Пусто — первый по порядку: демонстрация
  /// собеседника, затем его камера.
  String _mainKey = '';

  /// Открыт выбор источника демонстрации.
  bool _pickingSource = false;

  /// Выбор открыт для настройки уже идущей демонстрации, а не для запуска.
  bool _adjusting = false;

  @override
  void initState() {
    super.initState();
    // Раз в секунду — только ради таймера разговора.
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final call = context.watch<CallController>();
    final snapshot = call.call;
    final peer = call.peer;
    if (snapshot == null || peer == null) return const SizedBox.shrink();

    // Все потоки разговора. Демонстрация не заменяет камеры — они идут рядом,
    // поэтому потоков может быть до четырёх. Первый показывается крупно,
    // остальные — плитками; клик по плитке меняет её местами с главным.
    final tiles = <_CallTile>[
      if (call.hasRemoteScreen)
        _CallTile(
          key: 'peer-screen',
          renderer: call.remoteScreenRenderer,
          label: 'Экран: ${peer.username}',
          contain: true,
        ),
      if (call.sharingScreen && call.showMyScreenPreview)
        _CallTile(
          key: 'my-screen',
          renderer: call.localScreenRenderer,
          label: 'Ваш экран',
          contain: true,
        ),
      if (call.hasRemoteVideo)
        _CallTile(key: 'peer-camera', renderer: call.remoteRenderer, label: peer.username)
      else
        _CallTile(key: 'peer-avatar', renderer: null, label: peer.username),
      if (call.cameraEnabled)
        _CallTile(key: 'my-camera', renderer: call.localRenderer, label: 'Вы', mirror: true),
    ];
    final main = tiles.firstWhere((t) => t.key == _mainKey, orElse: () => tiles.first);
    final others = tiles.where((t) => t.key != main.key).toList();

    return Positioned.fill(
      child: Container(
        color: VellinColors.bg0,
        child: Stack(children: [
          Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              if (main.renderer != null)
                SizedBox(
                  width: 860,
                  height: 484,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(VellinRadius.lg),
                    child: RTCVideoView(
                      main.renderer!,
                      mirror: main.mirror,
                      // Чужой экран нельзя обрезать — показываем целиком.
                      objectFit: main.contain
                          ? RTCVideoViewObjectFit.RTCVideoViewObjectFitContain
                          : RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                    ),
                  ),
                )
              else
                VellinAvatar(
                  username: peer.username,
                  avatarSeed: peer.avatarSeed,
                  avatarUrl: peer.avatarUrl,
                  size: 148,
                ),
              const SizedBox(height: 18),
              Text(peer.username,
                  style: const TextStyle(color: VellinColors.text0, fontSize: 24, fontWeight: FontWeight.w600)),
              const SizedBox(height: 6),
              Text(
                snapshot.isRinging
                    ? 'Дозвон…'
                    : '${_elapsed(snapshot.answeredAt)}'
                        '${call.peerMicEnabled ? '' : ' · микрофон выключен у собеседника'}',
                style: const TextStyle(color: VellinColors.text2, fontSize: 14),
              ),
              const SizedBox(height: 26),
              Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                _RoundButton(
                  icon: call.micEnabled ? Icons.mic : Icons.mic_off,
                  color: VellinColors.bg3,
                  tooltip: call.micEnabled ? 'Выключить микрофон' : 'Включить микрофон',
                  onTap: call.toggleMic,
                ),
                const SizedBox(width: 14),
                _RoundButton(
                  icon: call.cameraEnabled ? Icons.videocam : Icons.videocam_off,
                  color: VellinColors.bg3,
                  tooltip: call.cameraEnabled ? 'Выключить камеру' : 'Включить камеру',
                  onTap: () => call.toggleCamera(),
                ),
                const SizedBox(width: 14),
                _RoundButton(
                  icon: call.sharingScreen ? Icons.stop_screen_share : Icons.screen_share,
                  color: call.sharingScreen ? VellinColors.accentHi : VellinColors.bg3,
                  tooltip: call.sharingScreen ? 'Остановить демонстрацию' : 'Демонстрация экрана',
                  onTap: () {
                    if (call.sharingScreen) {
                      call.stopScreenShare();
                    } else {
                      setState(() => _pickingSource = true);
                    }
                  },
                ),
                const SizedBox(width: 14),
                _RoundButton(
                  icon: Icons.call_end,
                  color: VellinColors.accent,
                  tooltip: 'Завершить',
                  onTap: call.hangup,
                ),
              ]),
            ]),
          ),

          // Своя демонстрация: полоса состояния держится всё время, пока идёт
          // показ, — из неё же меняются настройки и убирается превью.
          if (call.sharingScreen)
            Positioned(
              left: 0,
              right: 0,
              top: 16,
              child: Center(
                child: _MyScreenBanner(
                  title: call.screenShare!.source.name,
                  withAudio: call.screenShare!.hasAudio,
                  previewShown: call.showMyScreenPreview,
                  onTogglePreview: () => call.setMyScreenPreview(!call.showMyScreenPreview),
                  onAdjust: () => setState(() {
                    _pickingSource = true;
                    _adjusting = true;
                  }),
                  onStop: call.stopScreenShare,
                ),
              ),
            ),

          // Остальные потоки — плитками в углу.
          if (others.isNotEmpty)
            Positioned(
              right: 20,
              bottom: 20,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (final t in others) ...[
                    _TilePreview(
                      tile: t,
                      peer: peer,
                      onTap: () => setState(() => _mainKey = t.key),
                    ),
                    const SizedBox(width: 10),
                  ],
                ],
              ),
            ),
          Positioned(
            left: 16,
            top: 16,
            child: IconButton(
              icon: const Icon(Icons.expand_more, color: VellinColors.text2),
              tooltip: 'Свернуть звонок',
              onPressed: () => call.setUiMode(CallUiMode.minimized),
            ),
          ),

          // Выбор источника — поверх разговора, в том же слое: навигатора
          // здесь нет, обычный диалог открыть не из чего.
          if (_pickingSource)
            Positioned.fill(
              child: ScreenSharePicker(
                adjusting: _adjusting,
                // Флажок звука показываем по факту: он мог не захватиться.
                initialOptions: _adjusting
                    ? call.screenShare?.options.copyWith(withAudio: call.screenShare!.hasAudio)
                    : null,
                initialSourceId: _adjusting ? call.screenShare?.source.id : null,
                onCancel: () => setState(() {
                  _pickingSource = false;
                  _adjusting = false;
                }),
                onPick: (pick) {
                  final adjusting = _adjusting;
                  setState(() {
                    _pickingSource = false;
                    _adjusting = false;
                  });
                  if (adjusting) {
                    call.updateScreenShare(pick.source, pick.options);
                  } else {
                    call.startScreenShare(pick.source, pick.options);
                  }
                },
              ),
            ),
        ]),
      ),
    );
  }
}

/// Один показываемый поток разговора.
class _CallTile {
  final String key;
  /// null — вместо картинки показываем аватар собеседника.
  final RTCVideoRenderer? renderer;
  final String label;
  /// Своё изображение зеркалим — так привычнее, как в зеркале.
  final bool mirror;
  /// Демонстрацию показываем целиком: обрезать чужой экран нельзя.
  final bool contain;

  const _CallTile({
    required this.key,
    required this.renderer,
    required this.label,
    this.mirror = false,
    this.contain = false,
  });
}


/// Маленькая плитка потока: клик делает её главной.
class _TilePreview extends StatelessWidget {
  final _CallTile tile;
  final PublicUser peer;
  final VoidCallback onTap;
  const _TilePreview({required this.tile, required this.peer, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: 'Показать крупно: ${tile.label}',
      child: Material(
        color: VellinColors.bg2,
        borderRadius: BorderRadius.circular(VellinRadius.md),
        child: InkWell(
          borderRadius: BorderRadius.circular(VellinRadius.md),
          onTap: onTap,
          child: SizedBox(
            width: 200,
            height: 113,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(VellinRadius.md),
              child: tile.renderer == null
                  ? Center(
                      child: VellinAvatar(
                        username: peer.username,
                        avatarSeed: peer.avatarSeed,
                        avatarUrl: peer.avatarUrl,
                        size: 52,
                      ),
                    )
                  : RTCVideoView(
                      tile.renderer!,
                      mirror: tile.mirror,
                      objectFit: tile.contain
                          ? RTCVideoViewObjectFit.RTCVideoViewObjectFitContain
                          : RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Полоса «вы демонстрируете»: что показывается, и всё управление показом —
/// настройки, превью и остановка.
class _MyScreenBanner extends StatelessWidget {
  final String title;
  final bool withAudio;
  final bool previewShown;
  final VoidCallback onTogglePreview;
  final VoidCallback onAdjust;
  final VoidCallback onStop;
  const _MyScreenBanner({
    required this.title,
    required this.withAudio,
    required this.previewShown,
    required this.onTogglePreview,
    required this.onAdjust,
    required this.onStop,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 8, 8, 8),
      decoration: BoxDecoration(
        color: VellinColors.bg2,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: VellinColors.line2),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.screen_share, size: 17, color: VellinColors.accentHi),
        const SizedBox(width: 9),
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 320),
          child: Text(
            'Вы демонстрируете: $title${withAudio ? ' · со звуком' : ''}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: VellinColors.text0, fontSize: 13),
          ),
        ),
        const SizedBox(width: 12),
        TextButton(
          onPressed: onAdjust,
          style: TextButton.styleFrom(foregroundColor: VellinColors.text1),
          child: const Text('Настроить'),
        ),
        TextButton(
          onPressed: onTogglePreview,
          style: TextButton.styleFrom(foregroundColor: VellinColors.text1),
          child: Text(previewShown ? 'Скрыть' : 'Показать'),
        ),
        TextButton(
          onPressed: onStop,
          style: TextButton.styleFrom(foregroundColor: VellinColors.accentHi),
          child: const Text('Остановить'),
        ),
      ]),
    );
  }
}

/// Свёрнутый звонок: полоса под заголовком окна.
class _CallBar extends StatefulWidget {
  const _CallBar();
  @override
  State<_CallBar> createState() => _CallBarState();
}

class _CallBarState extends State<_CallBar> {
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final call = context.watch<CallController>();
    final snapshot = call.call;
    final peer = call.peer;
    if (snapshot == null || peer == null) return const SizedBox.shrink();

    return Material(
      color: VellinColors.bg2,
      child: InkWell(
        onTap: () => call.setUiMode(CallUiMode.expanded),
        child: Container(
          height: _callBarHeight,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: VellinColors.line2)),
          ),
          child: Row(children: [
            VellinAvatar(
              username: peer.username,
              avatarSeed: peer.avatarSeed,
              avatarUrl: peer.avatarUrl,
              size: 26,
            ),
            const SizedBox(width: 10),
            Text(peer.username,
                style: const TextStyle(color: VellinColors.text0, fontSize: 13, fontWeight: FontWeight.w600)),
            const SizedBox(width: 10),
            Text(
              snapshot.isRinging ? 'Дозвон…' : _elapsed(snapshot.answeredAt),
              style: const TextStyle(color: VellinColors.text2, fontSize: 12),
            ),
            // Демонстрация идёт и в свёрнутом звонке — о ней надо помнить.
            if (call.sharingScreen || call.hasRemoteScreen) ...[
              const SizedBox(width: 10),
              Icon(Icons.screen_share, size: 15, color: VellinColors.accentHi),
              const SizedBox(width: 5),
              Text(
                call.sharingScreen ? 'вы демонстрируете' : 'демонстрация экрана',
                style: const TextStyle(color: VellinColors.text2, fontSize: 12),
              ),
            ],
            const Spacer(),
            if (call.sharingScreen)
              IconButton(
                icon: const Icon(Icons.stop_screen_share, size: 18, color: VellinColors.accentHi),
                tooltip: 'Остановить демонстрацию',
                onPressed: call.stopScreenShare,
              ),
            IconButton(
              icon: Icon(call.micEnabled ? Icons.mic : Icons.mic_off, size: 18, color: VellinColors.text1),
              tooltip: call.micEnabled ? 'Выключить микрофон' : 'Включить микрофон',
              onPressed: call.toggleMic,
            ),
            IconButton(
              icon: const Icon(Icons.call_end, size: 18, color: Colors.white),
              tooltip: 'Завершить',
              style: IconButton.styleFrom(backgroundColor: VellinColors.accent),
              onPressed: call.hangup,
            ),
          ]),
        ),
      ),
    );
  }
}

class _CallError extends StatefulWidget {
  final String message;
  final VoidCallback onDone;
  const _CallError({required this.message, required this.onDone});
  @override
  State<_CallError> createState() => _CallErrorState();
}

class _CallErrorState extends State<_CallError> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer(const Duration(seconds: 5), widget.onDone);
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Positioned(
      top: 16,
      left: 0,
      right: 0,
      child: Center(
        child: Material(
          color: Colors.transparent,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: VellinColors.bg2,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: VellinColors.line2),
            ),
            child: Text(widget.message,
                style: const TextStyle(color: VellinColors.text0, fontSize: 13.5)),
          ),
        ),
      ),
    );
  }
}

class _RoundButton extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String tooltip;
  final VoidCallback onTap;
  const _RoundButton({
    required this.icon,
    required this.color,
    required this.tooltip,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: color,
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox(
            width: 58,
            height: 58,
            child: Icon(icon, color: Colors.white, size: 24),
          ),
        ),
      ),
    );
  }
}
