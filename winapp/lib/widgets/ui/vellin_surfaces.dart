import 'dart:ui' as ui;

import 'package:flutter/widgets.dart';

import '../../theme/vellin_design.dart';
import 'vellin_hover.dart';

/// Карточка настроек: приподнятая поверхность с заголовком.
class VellinCard extends StatelessWidget {
  final String? title;
  final List<Widget> children;
  final EdgeInsets padding;
  final double gap;

  const VellinCard({
    super.key,
    this.title,
    required this.children,
    this.padding = const EdgeInsets.all(20),
    this.gap = VellinLayout.gapCard,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: VellinColors.surface,
        borderRadius: BorderRadius.circular(VellinRadius.card),
        border: Border.all(color: VellinColors.line06),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null) ...[
            Text(title!, style: VellinType.cardTitle),
            SizedBox(height: gap),
          ],
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0) SizedBox(height: gap),
            children[i],
          ],
        ],
      ),
    );
  }
}

/// Стеклянная поверхность: подложка с прозрачностью + блюр под ней.
///
/// Блюр дорогой, поэтому площадь ограничена: панель уведомлений, меню статуса,
/// мини-плеер, тулбар и подложка лайтбокса, кнопки поверх скролла.
class VellinGlass extends StatelessWidget {
  final Widget child;
  final Color color;
  final double blur;
  final BorderRadius radius;
  final Color border;
  final List<BoxShadow>? shadow;
  final EdgeInsets? padding;

  const VellinGlass({
    super.key,
    required this.child,
    this.color = VellinColors.glassPanel,
    this.blur = VellinBlur.panel,
    this.radius = const BorderRadius.all(Radius.circular(VellinRadius.card)),
    this.border = VellinColors.line10,
    this.shadow,
    this.padding,
  });

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(borderRadius: radius, boxShadow: shadow),
      child: ClipRRect(
        borderRadius: radius,
        child: BackdropFilter(
          filter: ui.ImageFilter.blur(sigmaX: blur, sigmaY: blur),
          child: Container(
            padding: padding,
            decoration: BoxDecoration(
              color: color,
              borderRadius: radius,
              border: Border.all(color: border),
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}

/// Пилюля: таб в «Друзьях», счётчик, статус, «Ждёт».
class VellinPill extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback? onTap;
  final Widget? leading;

  const VellinPill({
    super.key,
    required this.label,
    this.selected = false,
    this.onTap,
    this.leading,
  });

  @override
  Widget build(BuildContext context) {
    final br = BorderRadius.circular(VellinRadius.pill);

    return VellinInteractive(
      onTap: onTap,
      focusRadius: onTap == null ? null : br,
      focusable: onTap != null,
      builder: (context, s) {
        final hot = s.hovered || s.pressed;
        return AnimatedContainer(
          duration: VellinMotion.hover,
          curve: VellinMotion.standard,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: selected
                ? const Color(0x1FE2C99B)
                : hot
                    ? VellinColors.fill055
                    : const Color(0x00000000),
            borderRadius: br,
            border: Border.all(
              color: selected ? const Color(0x42E2C99B) : VellinColors.line07,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (leading != null) ...[leading!, const SizedBox(width: 6)],
              Text(
                label,
                style: TextStyle(
                  fontFamily: VellinType.family,
                  fontSize: 11.5,
                  fontWeight: FontWeight.w500,
                  color: selected ? VellinColors.accent : VellinColors.ink55,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// Бейдж непрочитанных: золотой, цифры табличные, обводка цветом фона под ним.
class VellinBadge extends StatelessWidget {
  final int count;
  final double height;
  final double fontSize;

  /// Цвет фона, на котором лежит бейдж: им обводится, чтобы не слипался
  /// с иконкой под собой.
  final Color? bedColor;

  const VellinBadge({
    super.key,
    required this.count,
    this.height = 18,
    this.fontSize = 10.5,
    this.bedColor,
  });

  @override
  Widget build(BuildContext context) {
    if (count <= 0) return const SizedBox.shrink();
    return Container(
      constraints: BoxConstraints(minWidth: height, minHeight: height),
      padding: const EdgeInsets.symmetric(horizontal: 5),
      decoration: BoxDecoration(
        color: VellinColors.accent,
        borderRadius: BorderRadius.circular(VellinRadius.pill),
        border: bedColor == null ? null : Border.all(color: bedColor!, width: 2),
      ),
      alignment: Alignment.center,
      child: Text(
        '$count',
        style: VellinType.badge.copyWith(fontSize: fontSize),
      ),
    );
  }
}

/// Заголовок секции: прописные с разрядкой и волосяная линия до края.
class VellinSectionTitle extends StatelessWidget {
  final String label;
  final bool withRule;

  const VellinSectionTitle(this.label, {super.key, this.withRule = true});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(label.toUpperCase(), style: VellinType.sectionLabel),
        if (withRule) ...[
          const SizedBox(width: 12),
          const Expanded(child: ColoredBox(color: VellinColors.line05, child: SizedBox(height: 1))),
        ],
      ],
    );
  }
}

/// Прямоугольник-заглушка скелета. Крутящихся кружков в клиенте нет:
/// пустое место должно иметь форму того, что в него приедет.
class VellinSkeleton extends StatelessWidget {
  final double width;
  final double height;
  final double radius;
  final Color color;
  final bool circle;

  const VellinSkeleton({
    super.key,
    required this.width,
    required this.height,
    this.radius = 4,
    this.color = VellinColors.skeleton,
    this.circle = false,
  });

  const VellinSkeleton.circle(double size, {Key? key, Color color = VellinColors.skeleton})
      : this(key: key, width: size, height: size, color: color, circle: true);

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: color,
        shape: circle ? BoxShape.circle : BoxShape.rectangle,
        borderRadius: circle ? null : BorderRadius.circular(radius),
      ),
    );
  }
}
