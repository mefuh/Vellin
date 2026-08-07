import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:provider/provider.dart';

import '../models/social.dart';
import '../state/call_controller.dart';
import '../theme/call_design.dart';
// Подписи пресетов качества для плашки «вы демонстрируете».
import '../webrtc/screen_share.dart';
import 'call/call_bits.dart';
import 'call/call_glyphs.dart';
import 'call_settings_panel.dart';
import 'screen_share_picker.dart';
import 'window_title_bar.dart';

/// «26:42» от момента ответа. Минуты дополняются нулём: иначе строка прыгает
/// на переходе от 9 к 10 минутам.
String _elapsed(String? answeredAt) {
  if (answeredAt == null) return '--:--';
  final start = DateTime.tryParse(answeredAt)?.toLocal();
  if (start == null) return '--:--';
  final total = DateTime.now().difference(start).inSeconds.clamp(0, 359999);
  final mm = (total ~/ 60).toString().padLeft(2, '0');
  final ss = (total % 60).toString().padLeft(2, '0');
  return '$mm:$ss';
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
            if (c.isMine && c.call != null && c.uiMode == CallUiMode.expanded) const _CallScreen(),
            if (c.incoming != null) const _IncomingCall(),
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

// ── Входящий звонок ─────────────────────────────────────────────────────────

class _IncomingCall extends StatelessWidget {
  const _IncomingCall();

  @override
  Widget build(BuildContext context) {
    final call = context.watch<CallController>();
    final inc = call.incoming;
    if (inc == null) return const SizedBox.shrink();
    final from = inc.from;

    return Positioned.fill(
      child: Stack(children: [
        const Positioned.fill(child: CallBackdrop()),
        Center(
          child: Glass(
            blur: 26,
            radius: BorderRadius.circular(24),
            color: const Color(0xEB0F0E0D),
            padding: const EdgeInsets.fromLTRB(32, 34, 32, 28),
            shadows: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.9),
                blurRadius: 120,
                offset: const Offset(0, 50),
                spreadRadius: -40,
              ),
            ],
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              CallAvatar(username: from.username, avatarUrl: from.avatarUrl, size: 132),
              const SizedBox(height: 14),
              Text(from.username, style: CallText.displayName),
              const SizedBox(height: 8),
              Text(
                inc.call.video ? 'Входящий видеозвонок' : 'Входящий звонок',
                style: CallText.pill,
              ),
              const SizedBox(height: 30),
              Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                EndCallButton(onTap: call.decline),
                const SizedBox(width: 14),
                if (inc.call.video) ...[
                  _AcceptButton(
                    glyph: CallGlyphs.camera,
                    tooltip: 'Ответить с камерой',
                    onTap: () => call.accept(video: true),
                  ),
                  const SizedBox(width: 12),
                ],
                _AcceptButton(
                  glyph: CallGlyphs.answer,
                  tooltip: 'Ответить',
                  onTap: () => call.accept(video: false),
                ),
              ]),
            ]),
          ),
        ),
      ]),
    );
  }
}

/// Ответ на звонок — белая кнопка: единственное здесь действие «по умолчанию».
class _AcceptButton extends StatefulWidget {
  final CallGlyph glyph;
  final String tooltip;
  final VoidCallback onTap;
  const _AcceptButton({required this.glyph, required this.tooltip, required this.onTap});

  @override
  State<_AcceptButton> createState() => _AcceptButtonState();
}

class _AcceptButtonState extends State<_AcceptButton> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: widget.tooltip,
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        onEnter: (_) => setState(() => _hover = true),
        onExit: (_) => setState(() => _hover = false),
        child: GestureDetector(
          onTap: widget.onTap,
          child: AnimatedSlide(
            offset: Offset(0, _hover ? -3 / 54 : 0),
            duration: CallMotion.base,
            curve: CallMotion.ease,
            child: Container(
              width: 54,
              height: 54,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white,
                boxShadow: [
                  BoxShadow(
                    color: Colors.white.withValues(alpha: _hover ? 0.45 : 0.32),
                    blurRadius: 44,
                    offset: const Offset(0, 16),
                    spreadRadius: -14,
                  ),
                ],
              ),
              child: CallIcon(widget.glyph, size: 20, color: const Color(0xFF141210)),
            ),
          ),
        ),
      ),
    );
  }
}

// ── Экран разговора ─────────────────────────────────────────────────────────

/// Какая трансляция развёрнута, когда демонстрируют оба.
enum _Focus { none, mine, peer }

class _CallScreen extends StatefulWidget {
  const _CallScreen();
  @override
  State<_CallScreen> createState() => _CallScreenState();
}

class _CallScreenState extends State<_CallScreen> {
  Timer? _tick;

  /// Развёрнутая трансляция при двух демонстрациях сразу.
  _Focus _focus = _Focus.none;

  /// Открыт выбор источника демонстрации.
  bool _pickingSource = false;

  /// Выбор открыт для настройки уже идущей демонстрации, а не для запуска.
  bool _adjusting = false;

  /// Открыты настройки звонка.
  bool _settingsOpen = false;

  /// Развёрнута ли карточка второй трансляции сбоку.
  bool _sidePreviewOpen = true;

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

    final connecting = call.netState == CallNetState.connecting;
    final sharing = call.sharingScreen;
    final peerSharing = call.hasRemoteScreen;
    final peerCam = call.hasRemoteVideo;
    final myCam = call.cameraEnabled;

    // Раскладка кадра — теми же правилами, что в макете. Своя демонстрация
    // крупно, когда собеседник не демонстрирует и превью включено, либо когда
    // демонстрируют оба и развёрнута именно она.
    final myScreenBig = !connecting &&
        sharing &&
        ((!peerSharing && call.showMyScreenPreview) || (peerSharing && _focus == _Focus.mine));
    final peerScreenBig =
        !connecting && peerSharing && (!sharing || _focus == _Focus.peer);
    final bothSharing = !connecting && sharing && peerSharing && _focus == _Focus.none;
    // Кадр свободен под собеседника: ни одна демонстрация его не занимает.
    final stageFree = !connecting && !peerSharing && !myScreenBig;

    final selfPipVisible = !connecting &&
        !(!peerSharing && !peerCam && !myCam) &&
        !bothSharing;
    final peerCamThumb = !connecting && peerCam && (myScreenBig || peerScreenBig);

    return Positioned.fill(
      child: Stack(children: [
        const Positioned.fill(child: CallBackdrop()),

        // Сам кадр: под заголовком окна и над ним — всё остальное.
        Positioned(
          left: 0,
          right: 0,
          top: kWindowTitleBarHeight,
          bottom: 0,
          child: Stack(children: [
            if (connecting)
              const _ConnectingStage()
            else if (bothSharing)
              _BothSharingStage(
                mine: call.localScreenRenderer,
                peer: call.remoteScreenRenderer,
                peerName: peer.username,
                onFocusMine: () => setState(() => _focus = _Focus.mine),
                onFocusPeer: () => setState(() => _focus = _Focus.peer),
              )
            else if (peerScreenBig)
              _ScreenStage(renderer: call.remoteScreenRenderer)
            else if (myScreenBig)
              _ScreenStage(renderer: call.localScreenRenderer, own: true)
            else if (stageFree && peerCam)
              _VideoStage(renderer: call.remoteRenderer)
            else if (stageFree && !peerCam && myCam)
              _AvatarStage(peer: peer, speaking: call.peerSpeaking)
            else
              _AudioOnlyStage(
                peer: peer,
                peerSpeaking: call.peerSpeaking,
                peerMuted: !call.peerMicEnabled,
                mySpeaking: call.iAmSpeaking,
                myMuted: !call.micEnabled,
              ),

            // Затемнение снизу — чтобы имя и капсула читались на любом кадре.
            IgnorePointer(
              child: Align(
                alignment: Alignment.bottomCenter,
                child: Container(
                  height: 150,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.bottomCenter,
                      end: Alignment.topCenter,
                      colors: [Colors.black.withValues(alpha: 0.72), Colors.transparent],
                    ),
                  ),
                ),
              ),
            ),

            // Имя собеседника внизу слева — только когда кадр занят им.
            if (stageFree && !(!peerCam && !myCam))
              Positioned(
                left: 26,
                bottom: 22,
                child: Row(children: [
                  Text(peer.username, style: CallText.panelTitle),
                  if (!call.peerMicEnabled) ...[
                    const SizedBox(width: 12),
                    const _MutedChip(),
                  ],
                ]),
              ),

            // Плашки поверх кадра.
            if (peerScreenBig)
              Positioned(
                right: 26,
                top: 12,
                child: GlassPill(
                  padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 7),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    const PulseDot(color: CallColors.gold, period: Duration(seconds: 2)),
                    const SizedBox(width: 8),
                    Text('${peer.username.toUpperCase()} ДЕМОНСТРИРУЕТ ЭКРАН', style: CallText.plaque),
                  ]),
                ),
              ),

            if (sharing)
              Positioned(
                left: 62,
                top: 12,
                child: _MyShareBadge(
                  title: call.screenShare!.source.name,
                  quality: _qualityLabel(call),
                  previewShown: call.showMyScreenPreview || peerSharing,
                  onAdjust: () => setState(() {
                    _pickingSource = true;
                    _adjusting = true;
                  }),
                  onTogglePreview: peerSharing
                      ? null
                      : () => call.setMyScreenPreview(!call.showMyScreenPreview),
                ),
              ),

            if (myScreenBig && !peerSharing)
              Positioned(
                right: 26,
                top: 12,
                child: GlassPill(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
                  onTap: () => call.setMyScreenPreview(false),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    CallIcon(CallGlyphs.eyeOff, size: 13, color: CallColors.textMuted),
                    const SizedBox(width: 11),
                    Text('ТАК ЭТО ВИДИТ ${peer.username.toUpperCase()} · СКРЫТЬ',
                        style: CallText.plaque),
                  ]),
                ),
              ),

            // Вернуться к двум трансляциям.
            if (sharing && peerSharing && _focus != _Focus.none)
              Positioned(
                left: 0,
                right: 0,
                top: 60,
                child: Center(
                  child: GlassPill(
                    padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 8),
                    onTap: () => setState(() => _focus = _Focus.none),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      CallIcon(CallGlyphs.split, size: 12, color: CallColors.textMuted),
                      const SizedBox(width: 9),
                      Text('ПОКАЗАТЬ ОБЕ ТРАНСЛЯЦИИ', style: CallText.plaque),
                    ]),
                  ),
                ),
              ),

            // Вторая трансляция карточкой слева, когда одна развёрнута.
            if (sharing && peerSharing && _focus != _Focus.none)
              Positioned(
                left: 44,
                bottom: _sidePreviewOpen ? 232 : 158,
                child: _SidePreview(
                  open: _sidePreviewOpen,
                  title: _focus == _Focus.peer ? 'ВАША ТРАНСЛЯЦИЯ' : 'ЭКРАН: ${peer.username}',
                  renderer: _focus == _Focus.peer ? call.localScreenRenderer : call.remoteScreenRenderer,
                  onToggle: () => setState(() => _sidePreviewOpen = !_sidePreviewOpen),
                  onExpand: _focus == _Focus.peer
                      ? null
                      : () => setState(() => _focus = _Focus.peer),
                ),
              ),

            // Камера собеседника отдельным превью, когда кадр занят экраном.
            if (peerCamThumb)
              Positioned(
                right: 44,
                bottom: 320,
                child: _Thumb(
                  width: 192,
                  height: 108,
                  radius: 16,
                  renderer: call.remoteRenderer,
                  label: peer.username,
                  speaking: call.peerSpeaking,
                ),
              ),

            // Своё превью: уезжает влево, когда открыта панель настроек.
            AnimatedPositioned(
              duration: CallMotion.slow,
              curve: CallMotion.ease,
              right: (selfPipVisible ? 44 : -300) + (_settingsOpen ? CallGeometry.panelShift : 0),
              bottom: 158,
              child: AnimatedOpacity(
                duration: CallMotion.slow,
                curve: CallMotion.ease,
                opacity: selfPipVisible ? 1 : 0,
                child: _SelfPip(
                  renderer: call.localRenderer,
                  cameraOn: myCam,
                  speaking: call.iAmSpeaking,
                  muted: !call.micEnabled,
                ),
              ),
            ),
          ]),
        ),

        // Пилюля состояния связи и таймер.
        Positioned(
          left: 0,
          right: 0,
          top: kWindowTitleBarHeight + 12,
          child: Center(
            child: _StatusPill(
              net: call.netState,
              time: snapshot.isRinging ? '--:--' : _elapsed(snapshot.answeredAt),
            ),
          ),
        ),

        // Свернуть звонок — разговор продолжается полосой под заголовком.
        Positioned(
          left: 20,
          top: kWindowTitleBarHeight + 12,
          child: _GlassIconButton(
            glyph: CallGlyphs.minus,
            tooltip: 'Свернуть звонок',
            onTap: () => call.setUiMode(CallUiMode.minimized),
          ),
        ),

        // Капсула управления.
        Positioned(
          left: 0,
          right: 0,
          bottom: 34,
          child: Center(
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Glass(
                blur: 30,
                radius: BorderRadius.circular(999),
                color: const Color(0x8C12100F),
                border: Colors.white.withValues(alpha: 0.075),
                padding: const EdgeInsets.all(10),
                shadows: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.9),
                    blurRadius: 60,
                    offset: const Offset(0, 24),
                    spreadRadius: -20,
                  ),
                ],
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  CallButton(
                    glyph: call.micEnabled ? CallGlyphs.mic : CallGlyphs.micOff,
                    tooltip: call.micEnabled ? 'Выключить микрофон' : 'Включить микрофон',
                    tone: call.micEnabled ? CallButtonTone.plain : CallButtonTone.off,
                    speaking: call.iAmSpeaking,
                    onTap: call.toggleMic,
                  ),
                  const SizedBox(width: 10),
                  CallButton(
                    glyph: myCam ? CallGlyphs.camera : CallGlyphs.cameraOff,
                    tooltip: myCam ? 'Выключить камеру' : 'Включить камеру',
                    tone: myCam ? CallButtonTone.plain : CallButtonTone.off,
                    onTap: () => call.toggleCamera(),
                  ),
                  const SizedBox(width: 10),
                  CallButton(
                    glyph: CallGlyphs.screen,
                    tooltip: sharing ? 'Остановить демонстрацию' : 'Демонстрация экрана',
                    tone: sharing ? CallButtonTone.gold : CallButtonTone.plain,
                    onTap: () {
                      if (sharing) {
                        call.stopScreenShare();
                      } else {
                        setState(() {
                          _pickingSource = true;
                          _adjusting = false;
                        });
                      }
                    },
                  ),
                  const SizedBox(width: 10),
                  CallButton(
                    glyph: CallGlyphs.gear,
                    tooltip: 'Настройки звонка',
                    tone: _settingsOpen ? CallButtonTone.active : CallButtonTone.plain,
                    onTap: () => setState(() => _settingsOpen = !_settingsOpen),
                  ),
                ]),
              ),
              const SizedBox(width: 12),
              EndCallButton(onTap: call.hangup),
            ]),
          ),
        ),

        // Панель настроек справа — кадр под ней не затемняется, содержимое
        // должно оставаться видимым.
        if (_settingsOpen)
          Positioned(
            top: kWindowTitleBarHeight,
            right: 0,
            bottom: 0,
            child: CallSettingsSidePanel(
              peerId: call.peerId,
              peerName: peer.username,
              onClose: () => setState(() => _settingsOpen = false),
            ),
          ),

        // Выбор источника — поверх разговора, в том же слое: навигатора здесь
        // нет, обычный диалог открыть не из чего.
        if (_pickingSource)
          Positioned.fill(
            child: ScreenSharePicker(
              peerName: peer.username,
              adjusting: _adjusting,
              showPreview: call.showMyScreenPreview,
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
                call.setMyScreenPreview(pick.showPreview);
                if (adjusting) {
                  call.updateScreenShare(pick.source, pick.options);
                } else {
                  call.startScreenShare(pick.source, pick.options);
                }
              },
            ),
          ),
      ]),
    );
  }

  /// «1080p · 60 FPS» — что именно уходит собеседнику.
  String _qualityLabel(CallController call) {
    final o = call.screenShare?.options;
    if (o == null) return '';
    return '${o.resolution.label} · ${o.fps} FPS';
  }
}

// ── Состояния центральной области ───────────────────────────────────────────

/// Подключение: скелет кадра с бегущим бликом.
class _ConnectingStage extends StatelessWidget {
  const _ConnectingStage();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        SkeletonShimmer(width: 150, height: 150, radius: BorderRadius.circular(999)),
        const SizedBox(height: 20),
        SkeletonShimmer(width: 180, height: 11, radius: BorderRadius.circular(6)),
        const SizedBox(height: 26),
        Text('ПОДКЛЮЧЕНИЕ…',
            style: CallText.plaque.copyWith(color: Colors.white.withValues(alpha: 0.30))),
      ]),
    );
  }
}

/// Кадр собеседника на весь экран.
class _VideoStage extends StatelessWidget {
  final RTCVideoRenderer renderer;
  const _VideoStage({required this.renderer});

  @override
  Widget build(BuildContext context) {
    return Positioned.fill(
      child: RTCVideoView(
        renderer,
        objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
      ),
    );
  }
}

/// Демонстрация во весь кадр. Показываем целиком на чёрном: обрезать чужой
/// экран нельзя — по краям как раз и лежит то, ради чего его показывают.
class _ScreenStage extends StatelessWidget {
  final RTCVideoRenderer renderer;

  /// Своя трансляция обведена золотой рамкой — видно, что это ваш экран.
  final bool own;
  const _ScreenStage({required this.renderer, this.own = false});

  @override
  Widget build(BuildContext context) {
    return Positioned.fill(
      child: Stack(children: [
        Positioned.fill(child: Container(color: const Color(0xFF0B0A09))),
        Positioned.fill(
          child: RTCVideoView(
            renderer,
            objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitContain,
          ),
        ),
        if (own)
          IgnorePointer(
            child: Container(
              decoration: BoxDecoration(
                border: Border.all(color: CallColors.gold.withValues(alpha: 0.28), width: 2),
              ),
            ),
          ),
      ]),
    );
  }
}

/// Демонстрируют оба: честный сплит 50/50, клик разворачивает одну.
class _BothSharingStage extends StatelessWidget {
  final RTCVideoRenderer mine;
  final RTCVideoRenderer peer;
  final String peerName;
  final VoidCallback onFocusMine;
  final VoidCallback onFocusPeer;

  const _BothSharingStage({
    required this.mine,
    required this.peer,
    required this.peerName,
    required this.onFocusMine,
    required this.onFocusPeer,
  });

  @override
  Widget build(BuildContext context) {
    return Positioned.fill(
      child: Stack(children: [
        Positioned.fill(child: Container(color: const Color(0xFF090807))),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 58, 16, 16),
          child: Row(children: [
            Expanded(
              child: _SplitTile(
                renderer: peer,
                label: 'Экран: $peerName',
                accent: true,
                onTap: onFocusPeer,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: _SplitTile(renderer: mine, label: 'Ваш экран', onTap: onFocusMine),
            ),
          ]),
        ),
        Positioned(
          left: 0,
          right: 0,
          top: 60,
          child: Center(
            child: GlassPill(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
              border: CallColors.gold.withValues(alpha: 0.20),
              child: Text('ДВЕ ТРАНСЛЯЦИИ · НАЖМИТЕ НА ЛЮБУЮ, ЧТОБЫ РАЗВЕРНУТЬ',
                  style: CallText.plaque),
            ),
          ),
        ),
      ]),
    );
  }
}

class _SplitTile extends StatefulWidget {
  final RTCVideoRenderer renderer;
  final String label;
  final bool accent;
  final VoidCallback onTap;
  const _SplitTile({
    required this.renderer,
    required this.label,
    required this.onTap,
    this.accent = false,
  });

  @override
  State<_SplitTile> createState() => _SplitTileState();
}

class _SplitTileState extends State<_SplitTile> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: AspectRatio(
        aspectRatio: 16 / 9,
        child: MouseRegion(
          cursor: SystemMouseCursors.click,
          onEnter: (_) => setState(() => _hover = true),
          onExit: (_) => setState(() => _hover = false),
          child: GestureDetector(
            onTap: widget.onTap,
            child: AnimatedSlide(
              offset: Offset(0, _hover ? -0.01 : 0),
              duration: CallMotion.slow,
              curve: CallMotion.ease,
              child: Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(CallGeometry.radiusCard),
                  border: Border.all(
                    color: widget.accent ? CallColors.gold.withValues(alpha: 0.22) : CallColors.stroke,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFFB08C58).withValues(alpha: _hover ? 0.20 : 0.10),
                      blurRadius: _hover ? 60 : 44,
                    ),
                  ],
                ),
                clipBehavior: Clip.antiAlias,
                child: Stack(children: [
                  Positioned.fill(child: Container(color: const Color(0xFF0C0B0A))),
                  Positioned.fill(
                    child: RTCVideoView(
                      widget.renderer,
                      objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitContain,
                    ),
                  ),
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: 74,
                    child: IgnorePointer(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.bottomCenter,
                            end: Alignment.topCenter,
                            colors: [Colors.black.withValues(alpha: 0.78), Colors.transparent],
                          ),
                        ),
                      ),
                    ),
                  ),
                  Positioned(
                    left: 16,
                    bottom: 14,
                    child: Row(children: [
                      const PulseDot(color: CallColors.gold, period: Duration(seconds: 2)),
                      const SizedBox(width: 8),
                      Text(widget.label,
                          style: CallText.pill.copyWith(color: CallColors.textBody)),
                    ]),
                  ),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// У собеседника нет камеры, а у вас есть: один аватар в центре кадра.
class _AvatarStage extends StatelessWidget {
  final PublicUser peer;
  final bool speaking;
  const _AvatarStage({required this.peer, required this.speaking});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: CallAvatar(
        username: peer.username,
        avatarUrl: peer.avatarUrl,
        size: 132,
        speaking: speaking,
      ),
    );
  }
}

/// Голосовой звонок: две колонки с аватарами и именами.
class _AudioOnlyStage extends StatelessWidget {
  final PublicUser peer;
  final bool peerSpeaking;
  final bool peerMuted;
  final bool mySpeaking;
  final bool myMuted;

  const _AudioOnlyStage({
    required this.peer,
    required this.peerSpeaking,
    required this.peerMuted,
    required this.mySpeaking,
    required this.myMuted,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Person(
            name: peer.username,
            avatarUrl: peer.avatarUrl,
            speaking: peerSpeaking,
            muted: peerMuted,
          ),
          const SizedBox(width: 104),
          _Person(name: 'Вы', avatarUrl: null, speaking: mySpeaking, muted: myMuted, dim: true),
        ],
      ),
    );
  }
}

class _Person extends StatelessWidget {
  final String name;
  final String? avatarUrl;
  final bool speaking;
  final bool muted;
  final bool dim;
  const _Person({
    required this.name,
    required this.avatarUrl,
    required this.speaking,
    required this.muted,
    this.dim = false,
  });

  @override
  Widget build(BuildContext context) {
    return Column(mainAxisSize: MainAxisSize.min, children: [
      CallAvatar(
        username: name,
        avatarUrl: avatarUrl,
        size: 148,
        speaking: speaking,
        dim: dim,
      ),
      const SizedBox(height: 8),
      Text(
        name,
        style: TextStyle(
          fontFamily: CallText.family,
          fontSize: 18,
          fontWeight: FontWeight.w400,
          letterSpacing: 0.18,
          color: Colors.white.withValues(alpha: dim ? 0.72 : 0.92),
        ),
      ),
      if (muted) ...[
        const SizedBox(height: 9),
        Text('Микрофон выключен',
            style: CallText.pill.copyWith(color: CallColors.textFaint)),
      ],
    ]);
  }
}

// ── Мелкие части кадра ──────────────────────────────────────────────────────

/// Пилюля состояния связи с таймером.
class _StatusPill extends StatelessWidget {
  final CallNetState net;
  final String time;
  const _StatusPill({required this.net, required this.time});

  @override
  Widget build(BuildContext context) {
    final (color, period, text) = switch (net) {
      CallNetState.connecting => (
          const Color(0xFFC9A45C),
          const Duration(milliseconds: 1200),
          'Подключение…',
        ),
      CallNetState.good => (
          const Color(0xFFD8CBB4),
          const Duration(milliseconds: 3400),
          'Соединение стабильно',
        ),
      CallNetState.weak => (
          const Color(0xFFC9A45C),
          const Duration(milliseconds: 1500),
          'Нестабильная сеть',
        ),
      CallNetState.lost => (
          CallColors.dangerSoft,
          const Duration(milliseconds: 1000),
          'Переподключение…',
        ),
    };

    return GlassPill(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 9),
      color: Colors.white.withValues(alpha: 0.035),
      border: CallColors.divider,
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        PulseDot(color: color, period: period),
        const SizedBox(width: 8),
        Text(text, style: CallText.pill),
        const SizedBox(width: 14),
        Container(width: 1, height: 12, color: CallColors.strokeSoft),
        const SizedBox(width: 14),
        Text(time, style: CallText.timer),
      ]),
    );
  }
}

/// Плашка «вы демонстрируете»: что уходит собеседнику и с каким качеством.
/// Нажатие открывает настройку идущей демонстрации — она меняется без
/// перезапуска, и у собеседника картинка не мигает.
class _MyShareBadge extends StatelessWidget {
  final String title;
  final String quality;
  final bool previewShown;
  final VoidCallback onAdjust;
  final VoidCallback? onTogglePreview;

  const _MyShareBadge({
    required this.title,
    required this.quality,
    required this.previewShown,
    required this.onAdjust,
    required this.onTogglePreview,
  });

  @override
  Widget build(BuildContext context) {
    return GlassPill(
      onTap: onAdjust,
      color: const Color(0x940C0B0A),
      border: CallColors.gold.withValues(alpha: 0.22),
      padding: EdgeInsets.fromLTRB(15, 8, onTogglePreview == null ? 15 : 9, 8),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        const PulseDot(color: CallColors.gold, period: Duration(seconds: 2)),
        const SizedBox(width: 12),
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 260),
          child: Text(
            'Вы демонстрируете $title',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: CallText.pill.copyWith(color: Colors.white.withValues(alpha: 0.74)),
          ),
        ),
        const SizedBox(width: 10),
        Text(quality, style: CallText.plaque.copyWith(color: CallColors.textLabel)),
        if (onTogglePreview != null) ...[
          const SizedBox(width: 12),
          _TinyPill(
            label: previewShown ? 'СКРЫТЬ' : 'ПОКАЗАТЬ МНЕ',
            onTap: onTogglePreview!,
          ),
        ],
      ]),
    );
  }
}

class _TinyPill extends StatefulWidget {
  final String label;
  final VoidCallback onTap;
  const _TinyPill({required this.label, required this.onTap});

  @override
  State<_TinyPill> createState() => _TinyPillState();
}

class _TinyPillState extends State<_TinyPill> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: CallMotion.base,
          curve: CallMotion.ease,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            color: Colors.white.withValues(alpha: _hover ? 0.14 : 0.07),
            border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
          ),
          child: Text(widget.label,
              style: CallText.plaque.copyWith(
                letterSpacing: 0.84,
                color: Colors.white.withValues(alpha: 0.62),
              )),
        ),
      ),
    );
  }
}

/// Метка «микрофон выключен» рядом с именем.
class _MutedChip extends StatelessWidget {
  const _MutedChip();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.42),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: CallColors.stroke),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        CallIcon(CallGlyphs.micMutedSmall, size: 11, color: Colors.white.withValues(alpha: 0.62)),
        const SizedBox(width: 6),
        Text('Микрофон выключен',
            style: CallText.rowHint.copyWith(fontSize: 11, color: CallColors.textMuted)),
      ]),
    );
  }
}

/// Своё превью в углу: камера или инициал, если её нет.
class _SelfPip extends StatelessWidget {
  final RTCVideoRenderer renderer;
  final bool cameraOn;
  final bool speaking;
  final bool muted;

  const _SelfPip({
    required this.renderer,
    required this.cameraOn,
    required this.speaking,
    required this.muted,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 256,
      height: 144,
      decoration: BoxDecoration(
        color: const Color(0xFF0E0D0C),
        borderRadius: BorderRadius.circular(CallGeometry.radiusCard),
        border: Border.all(color: CallColors.stroke),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.9),
            blurRadius: 60,
            offset: const Offset(0, 30),
            spreadRadius: -24,
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(children: [
        if (cameraOn)
          Positioned.fill(
            child: RTCVideoView(
              renderer,
              mirror: true,
              objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
            ),
          )
        else
          Positioned.fill(
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xFF131110), Color(0xFF0B0A09)],
                ),
              ),
              child: Center(
                child: Container(
                  width: 48,
                  height: 48,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white.withValues(alpha: 0.06),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                  ),
                  child: CallIcon(CallGlyphs.cameraOff, size: 18, color: CallColors.textMuted),
                ),
              ),
            ),
          ),
        if (speaking)
          const Positioned.fill(child: SpeakingFrame(radius: CallGeometry.radiusCard)),
        Positioned(
          left: 12,
          bottom: 10,
          child: Row(children: [
            Text(
              'Вы',
              style: TextStyle(
                fontFamily: CallText.family,
                fontSize: 11.5,
                fontWeight: FontWeight.w500,
                color: Colors.white.withValues(alpha: 0.8),
                shadows: const [Shadow(color: Colors.black87, blurRadius: 6, offset: Offset(0, 1))],
              ),
            ),
            if (muted) ...[
              const SizedBox(width: 7),
              CallIcon(CallGlyphs.micMutedSmall, size: 11, color: Colors.white.withValues(alpha: 0.7)),
            ],
          ]),
        ),
      ]),
    );
  }
}

/// Небольшая плитка потока в углу кадра.
class _Thumb extends StatelessWidget {
  final double width;
  final double height;
  final double radius;
  final RTCVideoRenderer renderer;
  final String label;
  final bool speaking;

  const _Thumb({
    required this.width,
    required this.height,
    required this.radius,
    required this.renderer,
    required this.label,
    this.speaking = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: const Color(0xFF0E0D0C),
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: CallColors.stroke),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.9),
            blurRadius: 54,
            offset: const Offset(0, 26),
            spreadRadius: -22,
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(children: [
        Positioned.fill(
          child: RTCVideoView(
            renderer,
            objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
          ),
        ),
        if (speaking) Positioned.fill(child: SpeakingFrame(radius: radius)),
        Positioned(
          left: 11,
          bottom: 9,
          child: Text(
            label,
            style: TextStyle(
              fontFamily: CallText.family,
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: Colors.white.withValues(alpha: 0.82),
              shadows: const [Shadow(color: Colors.black87, blurRadius: 6, offset: Offset(0, 1))],
            ),
          ),
        ),
      ]),
    );
  }
}

/// Карточка второй трансляции слева. Сворачивается в пилюлю — содержимое
/// гаснет первым, потом сжимается сама карточка.
class _SidePreview extends StatelessWidget {
  final bool open;
  final String title;
  final RTCVideoRenderer renderer;
  final VoidCallback onToggle;

  /// Развернуть эту трансляцию на весь кадр (только для чужой).
  final VoidCallback? onExpand;

  const _SidePreview({
    required this.open,
    required this.title,
    required this.renderer,
    required this.onToggle,
    required this.onExpand,
  });

  @override
  Widget build(BuildContext context) {
    if (!open) {
      return GlassPill(
        onTap: onToggle,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          CallIcon(CallGlyphs.monitor, size: 13, color: Colors.white.withValues(alpha: 0.7)),
          const SizedBox(width: 9),
          Text('Превью трансляции',
              style: CallText.pill.copyWith(color: Colors.white.withValues(alpha: 0.66))),
        ]),
      );
    }

    return Glass(
      blur: 26,
      radius: BorderRadius.circular(CallGeometry.radiusCard),
      color: const Color(0xB80E0D0C),
      border: onExpand == null ? null : CallColors.gold.withValues(alpha: 0.20),
      shadows: [
        BoxShadow(
          color: Colors.black.withValues(alpha: 0.9),
          blurRadius: 60,
          offset: const Offset(0, 30),
          spreadRadius: -24,
        ),
      ],
      child: SizedBox(
        width: 268,
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 12, 8),
            child: Row(children: [
              Expanded(
                child: Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: CallText.plaque.copyWith(fontSize: 11, color: CallColors.textFaint),
                ),
              ),
              if (onExpand != null)
                GestureDetector(
                  onTap: onExpand,
                  child: MouseRegion(
                    cursor: SystemMouseCursors.click,
                    child: Text('развернуть',
                        style: CallText.plaque.copyWith(
                          fontSize: 10,
                          color: Colors.white.withValues(alpha: 0.30),
                        )),
                  ),
                )
              else
                _GlassIconButton(
                  glyph: CallGlyphs.minus,
                  tooltip: 'Свернуть превью',
                  onTap: onToggle,
                  size: 22,
                  bare: true,
                ),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(CallGeometry.radiusSmall),
              child: AspectRatio(
                aspectRatio: 16 / 9,
                child: Container(
                  color: const Color(0xFF0C0B0A),
                  child: RTCVideoView(
                    renderer,
                    objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitContain,
                  ),
                ),
              ),
            ),
          ),
        ]),
      ),
    );
  }
}

/// Круглая кнопка-иконка на матовом стекле — вне капсулы управления.
class _GlassIconButton extends StatefulWidget {
  final CallGlyph glyph;
  final String tooltip;
  final VoidCallback onTap;
  final double size;

  /// Без подложки — для кнопок внутри уже стеклянной карточки.
  final bool bare;

  const _GlassIconButton({
    required this.glyph,
    required this.tooltip,
    required this.onTap,
    this.size = 30,
    this.bare = false,
  });

  @override
  State<_GlassIconButton> createState() => _GlassIconButtonState();
}

class _GlassIconButtonState extends State<_GlassIconButton> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: widget.tooltip,
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        onEnter: (_) => setState(() => _hover = true),
        onExit: (_) => setState(() => _hover = false),
        child: GestureDetector(
          onTap: widget.onTap,
          child: AnimatedContainer(
            duration: CallMotion.fast,
            curve: CallMotion.ease,
            width: widget.size,
            height: widget.size,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(widget.bare ? 7 : 999),
              color: _hover
                  ? Colors.white.withValues(alpha: 0.10)
                  : (widget.bare ? Colors.transparent : Colors.white.withValues(alpha: 0.035)),
              border: widget.bare ? null : Border.all(color: CallColors.divider),
            ),
            child: CallIcon(
              widget.glyph,
              size: widget.size * 0.36,
              color: _hover ? Colors.white : CallColors.textFaint,
            ),
          ),
        ),
      ),
    );
  }
}

// ── Свёрнутый звонок ────────────────────────────────────────────────────────

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
      color: CallColors.surfaceRaised,
      child: InkWell(
        onTap: () => call.setUiMode(CallUiMode.expanded),
        child: Container(
          height: _callBarHeight,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: CallColors.stroke)),
          ),
          child: Row(children: [
            CallAvatar(username: peer.username, avatarUrl: peer.avatarUrl, size: 26),
            const SizedBox(width: 4),
            Text(
              peer.username,
              style: TextStyle(
                fontFamily: CallText.family,
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: CallColors.textStrong,
              ),
            ),
            const SizedBox(width: 12),
            Text(
              snapshot.isRinging ? 'Дозвон…' : _elapsed(snapshot.answeredAt),
              style: CallText.timer,
            ),
            // Демонстрация идёт и в свёрнутом звонке — о ней надо помнить.
            if (call.sharingScreen || call.hasRemoteScreen) ...[
              const SizedBox(width: 14),
              const PulseDot(color: CallColors.gold, period: Duration(seconds: 2)),
              const SizedBox(width: 8),
              Text(
                call.sharingScreen ? 'вы демонстрируете' : 'демонстрация экрана',
                style: CallText.pill,
              ),
            ],
            const Spacer(),
            if (call.sharingScreen)
              _GlassIconButton(
                glyph: CallGlyphs.screen,
                tooltip: 'Остановить демонстрацию',
                onTap: call.stopScreenShare,
                size: 28,
                bare: true,
              ),
            const SizedBox(width: 4),
            _GlassIconButton(
              glyph: call.micEnabled ? CallGlyphs.mic : CallGlyphs.micOff,
              tooltip: call.micEnabled ? 'Выключить микрофон' : 'Включить микрофон',
              onTap: call.toggleMic,
              size: 28,
              bare: true,
            ),
            const SizedBox(width: 8),
            EndCallButton(onTap: call.hangup, width: 46, height: 28),
          ]),
        ),
      ),
    );
  }
}

// ── Ошибка ──────────────────────────────────────────────────────────────────

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
      top: kWindowTitleBarHeight + 58,
      left: 0,
      right: 0,
      child: Center(
        child: GlassPill(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          border: CallColors.dangerSoft.withValues(alpha: 0.28),
          color: const Color(0xC718100F),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            const PulseDot(color: CallColors.dangerSoft, period: Duration(seconds: 1)),
            const SizedBox(width: 11),
            Text(widget.message,
                style: CallText.row.copyWith(fontSize: 12.5, color: CallColors.textBody)),
          ]),
        ),
      ),
    );
  }
}
