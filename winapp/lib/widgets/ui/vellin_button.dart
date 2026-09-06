import 'package:flutter/widgets.dart';

import '../../theme/vellin_design.dart';
import 'vellin_hover.dart';
import 'vellin_icon.dart';

/// Тон кнопки.
enum VellinButtonTone {
  /// Золотая заливка — одно главное действие на экран.
  primary,

  /// Обычная: белая на просвет с волосяной обводкой.
  secondary,

  /// Без фона — только текст и глиф.
  ghost,

  /// Золотая на просвет: действие второго ряда, но родственное главному.
  goldTint,

  /// Опасное: выход, удаление, отклонение.
  danger,
}

/// Кнопка клиента. Material не используется: у него своя механика ряби,
/// свои тени и свои размеры, и рядом со звонком это читается как чужое.
class VellinButton extends StatelessWidget {
  final String? label;

  /// Обводочные пути глифа из `VellinGlyphs`.
  final List<String>? glyph;

  final VoidCallback? onPressed;
  final VellinButtonTone tone;
  final double height;
  final double radius;

  /// Растянуть по ширине родителя.
  final bool expand;

  /// Показывать вращающийся штрих вместо подписи («Сохраняем…»).
  final bool busy;

  const VellinButton({
    super.key,
    this.label,
    this.glyph,
    required this.onPressed,
    this.tone = VellinButtonTone.secondary,
    this.height = 44,
    this.radius = VellinRadius.row,
    this.expand = false,
    this.busy = false,
  });

  bool get _enabled => onPressed != null && !busy;

  @override
  Widget build(BuildContext context) {
    final br = BorderRadius.circular(radius);

    return VellinInteractive(
      onTap: _enabled ? onPressed : null,
      focusRadius: br,
      builder: (context, s) {
        final visual = _visual(s);
        final content = Row(
          mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (busy)
              _Spinner(color: visual.foreground)
            else ...[
              if (glyph != null)
                VellinIcon(glyph!, size: 17, color: visual.foreground),
              if (glyph != null && label != null) const SizedBox(width: 8),
              if (label != null)
                Text(
                  label!,
                  style: TextStyle(
                    fontFamily: VellinType.family,
                    fontSize: 13.5,
                    fontWeight: tone == VellinButtonTone.primary ? FontWeight.w600 : FontWeight.w500,
                    color: visual.foreground,
                  ),
                ),
            ],
          ],
        );

        return AnimatedContainer(
          duration: VellinMotion.hover,
          curve: VellinMotion.standard,
          height: height,
          width: expand ? double.infinity : null,
          padding: EdgeInsets.symmetric(horizontal: label == null ? 0 : 16),
          decoration: BoxDecoration(
            color: visual.background,
            borderRadius: br,
            border: Border.all(color: visual.border),
            boxShadow: visual.glow ? VellinShadow.accentButton : null,
          ),
          alignment: Alignment.center,
          child: Opacity(opacity: _enabled || busy ? 1 : 0.4, child: content),
        );
      },
    );
  }

  _ButtonVisual _visual(VellinInteractionState s) {
    final hot = s.hovered || s.pressed;
    switch (tone) {
      case VellinButtonTone.primary:
        return _ButtonVisual(
          background: busy ? const Color(0x73E2C99B) : VellinColors.accent,
          border: const Color(0x00000000),
          foreground: VellinColors.onAccent,
          glow: !busy,
        );
      case VellinButtonTone.secondary:
        return _ButtonVisual(
          background: hot ? VellinColors.fill11 : VellinColors.fill045,
          border: VellinColors.line07,
          foreground: VellinColors.ink82,
        );
      case VellinButtonTone.ghost:
        return _ButtonVisual(
          background: hot ? VellinColors.fill055 : const Color(0x00000000),
          border: const Color(0x00000000),
          foreground: VellinColors.ink62,
        );
      case VellinButtonTone.goldTint:
        return _ButtonVisual(
          background: hot ? const Color(0x24E2C99B) : const Color(0x17E2C99B),
          border: const Color(0x47E2C99B),
          foreground: VellinColors.accent,
        );
      case VellinButtonTone.danger:
        return _ButtonVisual(
          background: hot ? const Color(0x1FD65C52) : const Color(0x00000000),
          border: const Color(0x00000000),
          foreground: VellinColors.danger,
        );
    }
  }
}

class _ButtonVisual {
  final Color background;
  final Color border;
  final Color foreground;
  final bool glow;
  const _ButtonVisual({
    required this.background,
    required this.border,
    required this.foreground,
    this.glow = false,
  });
}

/// Квадратная кнопка с одним глифом: мини-кнопки строк, кнопки шапки чата,
/// ячейки заголовка окна.
class VellinIconButton extends StatelessWidget {
  final List<String> glyph;
  final VoidCallback? onPressed;
  final double size;
  final double radius;
  final double glyphSize;
  final String? tooltip;

  /// Тон в покое: с фоном (кнопки строк) или без (ячейки заголовка).
  final bool filled;

  /// Золотое наведение вместо белого — кнопка настроек в карточке «я».
  final bool goldHover;

  final Color? color;

  const VellinIconButton({
    super.key,
    required this.glyph,
    required this.onPressed,
    this.size = 34,
    this.radius = VellinRadius.button,
    this.glyphSize = 17,
    this.tooltip,
    this.filled = true,
    this.goldHover = false,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    final br = BorderRadius.circular(radius);
    final enabled = onPressed != null;

    return VellinInteractive(
      onTap: onPressed,
      focusRadius: br,
      builder: (context, s) {
        final hot = s.hovered || s.pressed;
        final background = goldHover && hot
            ? const Color(0x24E2C99B)
            : hot
                ? VellinColors.fill11
                : (filled ? VellinColors.fill045 : const Color(0x00000000));
        final border = goldHover && hot
            ? const Color(0x4DE2C99B)
            : (filled ? VellinColors.line07 : const Color(0x00000000));
        final fg = goldHover && hot
            ? VellinColors.accent
            : (color ?? (hot ? VellinColors.ink72 : VellinColors.ink45));

        return Opacity(
          opacity: enabled ? 1 : 0.4,
          child: AnimatedContainer(
            duration: VellinMotion.hover,
            curve: VellinMotion.standard,
            width: size,
            height: size,
            decoration: BoxDecoration(
              color: background,
              borderRadius: br,
              border: Border.all(color: border),
            ),
            alignment: Alignment.center,
            child: VellinIcon(glyph, size: glyphSize, color: fg),
          ),
        );
      },
    );
  }
}

/// Единственное место, где допустим `linear`: штрих сохранения.
class _Spinner extends StatefulWidget {
  final Color color;
  const _Spinner({required this.color});
  @override
  State<_Spinner> createState() => _SpinnerState();
}

class _SpinnerState extends State<_Spinner> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 800))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return RotationTransition(
      turns: _c,
      child: CustomPaint(size: const Size(14, 14), painter: _SpinnerPainter(widget.color)),
    );
  }
}

class _SpinnerPainter extends CustomPainter {
  final Color color;
  _SpinnerPainter(this.color);

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawArc(
      Offset.zero & size,
      0,
      4.4,
      false,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.6
        ..strokeCap = StrokeCap.round,
    );
  }

  @override
  bool shouldRepaint(_SpinnerPainter old) => old.color != color;
}
