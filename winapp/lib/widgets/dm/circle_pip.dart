import 'package:flutter/widgets.dart';
import 'package:media_kit_video/media_kit_video.dart';
import 'package:provider/provider.dart';

import '../../state/circle_playback_controller.dart';
import '../../theme/vellin_design.dart';
import '../../theme/vellin_glyphs.dart';
import '../ui/vellin_hover.dart';
import '../ui/vellin_icon.dart';

/// Кружок, уехавший из видимой части ленты, — маленьким окошком справа сверху.
///
/// Прокрутка ленты не должна обрывать то, что человек смотрит: кадр просто
/// переезжает сюда и возвращается в строку, когда она снова на экране.
class CirclePip extends StatefulWidget {
  const CirclePip({super.key});

  @override
  State<CirclePip> createState() => _CirclePipState();
}

class _CirclePipState extends State<CirclePip> with SingleTickerProviderStateMixin {
  late final AnimationController _anim = AnimationController(
    vsync: this,
    duration: VellinMotion.hover,
    reverseDuration: const Duration(milliseconds: 340),
  );

  bool _shown = false;

  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final circles = context.watch<CirclePlaybackController>();
    final show = circles.pipVisible;

    if (show != _shown) {
      _shown = show;
      // Уход играем до конца, а не срезаем: иначе кадр исчезал бы рывком.
      show ? _anim.forward() : _anim.reverse();
    }

    return AnimatedBuilder(
      animation: _anim,
      builder: (context, child) {
        if (_anim.isDismissed) return const SizedBox.shrink();
        final t = _anim.status == AnimationStatus.reverse
            ? VellinMotion.exit.transform(_anim.value)
            : VellinMotion.standard.transform(_anim.value);
        return Opacity(
          opacity: t,
          child: Transform.scale(
            scale: 0.86 + 0.14 * t,
            child: Transform.translate(offset: Offset(18 * (1 - t), 0), child: child),
          ),
        );
      },
      child: _Frame(circles: circles),
    );
  }
}

class _Frame extends StatelessWidget {
  final CirclePlaybackController circles;
  const _Frame({required this.circles});

  @override
  Widget build(BuildContext context) {
    const box = 104.0;
    const inset = 5.0;
    final controller = circles.controller;

    return SizedBox(
      width: box,
      height: box,
      child: VellinInteractive(
        onTap: circles.toggle,
        focusRadius: BorderRadius.circular(box / 2),
        builder: (context, s) {
          final hot = s.hovered || s.pressed;
          return Stack(
            fit: StackFit.expand,
            children: [
              // Кольцо прогресса — рамка кадра, как у кружка в ленте.
              CustomPaint(painter: _PipRingPainter(progress: circles.progress)),
              Padding(
                padding: const EdgeInsets.all(inset),
                child: ClipOval(
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (controller != null)
                        Video(controller: controller, fit: BoxFit.cover, controls: NoVideoControls)
                      else
                        const ColoredBox(color: VellinColors.bg5),
                      // Под курсором — приглушение и знак паузы: окошко живёт
                      // поверх содержимого, и по нему должно быть видно, что оно
                      // нажимается.
                      AnimatedOpacity(
                        duration: VellinMotion.hover,
                        curve: VellinMotion.standard,
                        opacity: hot || !circles.playing ? 1 : 0,
                        child: ColoredBox(
                          color: const Color(0x8C080706),
                          child: Center(
                            child: VellinIcon.filled(
                              circles.playing ? VellinGlyphs.pauseFilled : VellinGlyphs.playFilled,
                              size: 14,
                              box: const Size(12, 12),
                              color: VellinColors.accent,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Positioned(
                top: -2,
                right: -2,
                child: AnimatedOpacity(
                  duration: VellinMotion.hover,
                  curve: VellinMotion.standard,
                  opacity: hot ? 1 : 0,
                  child: _CloseButton(onTap: circles.stop),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _CloseButton extends StatelessWidget {
  final VoidCallback onTap;
  const _CloseButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return VellinInteractive(
      onTap: onTap,
      focusRadius: BorderRadius.circular(12),
      builder: (context, s) {
        final hot = s.hovered || s.pressed;
        return Container(
          width: 24,
          height: 24,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: hot ? const Color(0xF2BA423A) : VellinColors.glassPill,
            border: Border.all(color: VellinColors.line14),
          ),
          alignment: Alignment.center,
          child: VellinIcon(
            VellinGlyphs.closeSmall,
            size: 9,
            box: const Size(11, 11),
            color: hot ? VellinColors.ink92 : VellinColors.ink62,
          ),
        );
      },
    );
  }
}

/// Кольцо окошка: подложка и золотой прогресс от верхней точки.
class _PipRingPainter extends CustomPainter {
  final double progress;
  _PipRingPainter({required this.progress});

  @override
  void paint(Canvas canvas, Size size) {
    const stroke = 2.6;
    final rect = Rect.fromCircle(
      center: Offset(size.width / 2, size.height / 2),
      radius: size.width / 2 - stroke / 2,
    );

    canvas.drawArc(
      rect,
      0,
      6.2831853,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..color = VellinColors.accentLine,
    );

    if (progress <= 0) return;
    canvas.drawArc(
      rect,
      -1.5707963, // старт сверху: у дуги нулевой угол справа
      6.2831853 * progress,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..strokeCap = StrokeCap.round
        ..color = VellinColors.accent,
    );
  }

  @override
  bool shouldRepaint(_PipRingPainter old) => old.progress != progress;
}
