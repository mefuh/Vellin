import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import '../../state/playback_controller.dart';
import '../../theme/vellin_design.dart';
import '../../theme/vellin_glyphs.dart';
import '../ui/vellin_avatar.dart';
import '../ui/vellin_hover.dart';
import '../ui/vellin_icon.dart';
import '../ui/vellin_surfaces.dart';

/// Мини-плеер голосового: пилюля в своём чате и док — во всех остальных местах.
///
/// Он один на приложение и переживает переходы: запись, начатая в переписке,
/// продолжает играть и в «Друзьях», и в профиле.
class MiniPlayer extends StatelessWidget {
  /// Какой диалог открыт сейчас — по нему выбирается вид: пилюля или док.
  final String? openPeerPublicId;

  const MiniPlayer({super.key, required this.openPeerPublicId});

  @override
  Widget build(BuildContext context) {
    final playback = context.watch<PlaybackController>();
    final item = playback.item;
    if (item == null) return const SizedBox.shrink();

    final own = item.peerPublicId == openPeerPublicId;
    return own ? _Pill(item: item, playback: playback) : _Dock(item: item, playback: playback);
  }
}

/// Пилюля поверх ленты своего чата.
class _Pill extends StatelessWidget {
  final PlaybackItem item;
  final PlaybackController playback;
  const _Pill({required this.item, required this.playback});

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.topCenter,
      child: Padding(
        padding: const EdgeInsets.only(top: 8),
        child: _Appear(
          fromTop: false,
          child: VellinGlass(
            color: VellinColors.glassPill,
            blur: VellinBlur.pill,
            radius: BorderRadius.circular(VellinRadius.pill),
            border: const Color(0x2EE2C99B),
            shadow: VellinShadow.pill,
            padding: const EdgeInsets.fromLTRB(5, 0, 6, 0),
            child: SizedBox(
              height: 40,
              child: _Body(item: item, playback: playback),
            ),
          ),
        ),
      ),
    );
  }
}

/// Док во всю ширину правой области, когда чат записи не открыт.
class _Dock extends StatelessWidget {
  final PlaybackItem item;
  final PlaybackController playback;
  const _Dock({required this.item, required this.playback});

  @override
  Widget build(BuildContext context) {
    return _Appear(
      fromTop: true,
      child: Container(
        height: 40,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: const BoxDecoration(
          color: VellinColors.glassDock,
          border: Border(bottom: BorderSide(color: VellinColors.line07)),
        ),
        child: _Body(item: item, playback: playback),
      ),
    );
  }
}

/// Начинка плеера — одна на оба вида.
class _Body extends StatelessWidget {
  final PlaybackItem item;
  final PlaybackController playback;
  const _Body({required this.item, required this.playback});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _PlayPause(playing: playback.playing, onTap: playback.toggle),
        const SizedBox(width: 9),
        VellinAvatar(
          username: item.peerName,
          avatarUrl: item.peerAvatarUrl,
          size: 20,
          bedColor: VellinColors.strip,
        ),
        const SizedBox(width: 8),
        Text(
          '${item.peerName} · голосовое',
          style: VellinType.caption.copyWith(fontSize: 12, color: VellinColors.ink72),
        ),
        const SizedBox(width: 12),
        _Progress(value: playback.progress),
        const SizedBox(width: 10),
        Text(
          _fmt(playback.position.inSeconds),
          style: VellinType.caption.copyWith(
            fontSize: 11,
            color: const Color(0xA8E2C99B),
            fontFeatures: VellinType.tabular,
          ),
        ),
        const SizedBox(width: 8),
        _SpeedButton(speed: playback.speed, onTap: playback.cycleSpeed),
        const SizedBox(width: 4),
        _CloseButton(onTap: playback.stop),
      ],
    );
  }

  static String _fmt(int sec) =>
      '${(sec ~/ 60).toString().padLeft(1, '0')}:${(sec % 60).toString().padLeft(2, '0')}';
}

class _PlayPause extends StatelessWidget {
  final bool playing;
  final VoidCallback onTap;
  const _PlayPause({required this.playing, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return VellinInteractive(
      onTap: onTap,
      focusRadius: BorderRadius.circular(15),
      builder: (context, s) => Container(
        width: 30,
        height: 30,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: const Color(0x29E2C99B),
          border: Border.all(color: VellinColors.accentLine),
        ),
        alignment: Alignment.center,
        child: VellinIcon.filled(
          playing ? VellinGlyphs.pauseFilled : VellinGlyphs.playFilled,
          size: 10,
          box: const Size(12, 12),
          color: VellinColors.accent,
        ),
      ),
    );
  }
}

/// Полоса воспроизведения 92×3 с золотой заливкой.
class _Progress extends StatelessWidget {
  final double value;
  const _Progress({required this.value});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 92,
      height: 3,
      child: Stack(
        children: [
          DecoratedBox(
            decoration: BoxDecoration(
              color: VellinColors.fill12,
              borderRadius: BorderRadius.circular(VellinRadius.pill),
            ),
            child: const SizedBox(width: 92, height: 3),
          ),
          FractionallySizedBox(
            widthFactor: value.clamp(0.0, 1.0),
            child: Container(
              height: 3,
              decoration: BoxDecoration(
                color: VellinColors.accent,
                borderRadius: BorderRadius.circular(VellinRadius.pill),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SpeedButton extends StatelessWidget {
  final double speed;
  final VoidCallback onTap;
  const _SpeedButton({required this.speed, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final label = speed == speed.roundToDouble()
        ? '${speed.toStringAsFixed(0)}×'
        : '${speed.toStringAsFixed(2).replaceAll('.', ',').replaceAll(RegExp(r'0$'), '')}×';

    return VellinInteractive(
      onTap: onTap,
      focusRadius: BorderRadius.circular(VellinRadius.chip),
      builder: (context, s) {
        final hot = s.hovered || s.pressed;
        return AnimatedContainer(
          duration: VellinMotion.hover,
          curve: VellinMotion.standard,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
          decoration: BoxDecoration(
            color: hot ? VellinColors.fill11 : VellinColors.fill045,
            borderRadius: BorderRadius.circular(VellinRadius.chip),
          ),
          child: Text(
            label,
            style: VellinType.caption.copyWith(
              fontSize: 11,
              color: VellinColors.ink62,
              fontFeatures: VellinType.tabular,
            ),
          ),
        );
      },
    );
  }
}

/// Крестик: при наведении разворачивается и краснеет.
class _CloseButton extends StatelessWidget {
  final VoidCallback onTap;
  const _CloseButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return VellinInteractive(
      onTap: onTap,
      focusRadius: BorderRadius.circular(13),
      builder: (context, s) {
        final hot = s.hovered || s.pressed;
        return AnimatedContainer(
          duration: VellinMotion.hover,
          curve: VellinMotion.standard,
          width: 26,
          height: 26,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: hot ? const Color(0x2ED65C52) : const Color(0x00000000),
          ),
          alignment: Alignment.center,
          child: AnimatedRotation(
            duration: VellinMotion.hover,
            curve: VellinMotion.standard,
            turns: hot ? 0.25 : 0,
            child: VellinIcon(
              VellinGlyphs.closeSmall,
              size: 10,
              box: const Size(11, 11),
              color: hot ? VellinColors.danger : VellinColors.ink45,
            ),
          ),
        );
      },
    );
  }
}

/// Появление плеера: сверху вниз для дока, снизу вверх для пилюли.
class _Appear extends StatefulWidget {
  final Widget child;
  final bool fromTop;
  const _Appear({required this.child, required this.fromTop});

  @override
  State<_Appear> createState() => _AppearState();
}

class _AppearState extends State<_Appear> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 440),
  )..forward();

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
        final t = VellinMotion.standard.transform(_c.value);
        return Opacity(
          opacity: t,
          child: Transform.translate(
            offset: Offset(0, (widget.fromTop ? -14 : 10) * (1 - t)),
            child: child,
          ),
        );
      },
      child: widget.child,
    );
  }
}
