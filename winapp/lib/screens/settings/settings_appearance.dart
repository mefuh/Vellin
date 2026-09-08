import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import '../../state/app_settings.dart';
import '../../theme/vellin_design.dart';
import '../../widgets/ui/vellin_hover.dart';
import '../../widgets/ui/vellin_surfaces.dart';
import '../../widgets/ui/vellin_toggle.dart';

/// «Оформление»: движение и размер текста.
///
/// Выбора темы здесь нет намеренно — тёмная единственная, и переключатель,
/// который ничего не меняет, хуже его отсутствия.
class SettingsAppearance extends StatelessWidget {
  const SettingsAppearance({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppSettings>();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        VellinCard(
          title: 'Движение',
          children: [
            VellinToggleRow(
              title: 'Ускорить переходы',
              hint: 'Панели, меню и списки двигаются втрое быстрее. '
                  'Пригодится на слабом компьютере и если анимация мешает.',
              value: s.reduceMotion,
              onChanged: s.setReduceMotion,
            ),
          ],
        ),
        const SizedBox(height: VellinLayout.gapCard),
        VellinCard(
          title: 'Размер текста',
          children: [
            _ScaleChoice(value: s.textScale, onChanged: s.setTextScale),
            Text(
              'Меняет кегль по всему приложению. Раскладка рассчитана на обычный '
              'размер: на крупном длинные подписи могут переноситься.',
              style: VellinType.caption.copyWith(color: VellinColors.ink32, height: 1.5),
            ),
          ],
        ),
        const SizedBox(height: VellinLayout.gapCard),
        VellinCard(
          title: 'Тема',
          children: [
            Text(
              'Vellin тёмный — так задуман экран разговора, к которому подстроено '
              'остальное. Светлой темы нет.',
              style: VellinType.body.copyWith(color: VellinColors.ink62, height: 1.6),
            ),
          ],
        ),
      ],
    );
  }
}

/// Три размера текста: 90 · 100 · 110 %.
class _ScaleChoice extends StatelessWidget {
  final double value;
  final ValueChanged<double> onChanged;

  const _ScaleChoice({required this.value, required this.onChanged});

  static const _options = [
    (0.9, 'Мельче'),
    (1.0, 'Обычный'),
    (1.1, 'Крупнее'),
  ];

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (final (scale, label) in _options) ...[
          if (scale != _options.first.$1) const SizedBox(width: 8),
          _Option(
            label: label,
            scale: scale,
            selected: (value - scale).abs() < 0.01,
            onTap: () => onChanged(scale),
          ),
        ],
      ],
    );
  }
}

class _Option extends StatelessWidget {
  final String label;
  final double scale;
  final bool selected;
  final VoidCallback onTap;

  const _Option({
    required this.label,
    required this.scale,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final br = BorderRadius.circular(VellinRadius.field);

    return VellinInteractive(
      onTap: onTap,
      focusRadius: br,
      builder: (context, s) {
        final hot = s.hovered || s.pressed;
        return AnimatedContainer(
          duration: VellinMotion.state,
          curve: VellinMotion.standard,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: BoxDecoration(
            color: selected
                ? VellinColors.accentWash
                : hot
                    ? VellinColors.fill055
                    : VellinColors.fill045,
            borderRadius: br,
            border: Border.all(
              color: selected ? VellinColors.accentLine : VellinColors.line07,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Образец кегля прямо на кнопке: подпись словом не показывает,
              // насколько крупнее станет текст.
              Text(
                'Аа',
                style: VellinType.body.copyWith(
                  fontSize: 13.5 * scale,
                  color: selected ? VellinColors.accent : VellinColors.ink72,
                ),
              ),
              const SizedBox(width: 9),
              Text(
                label,
                style: VellinType.caption.copyWith(
                  fontSize: 12.5,
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
