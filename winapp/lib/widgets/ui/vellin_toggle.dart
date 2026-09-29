import 'package:flutter/widgets.dart';

import '../../theme/vellin_design.dart';
import 'vellin_hover.dart';

/// Переключатель 40×22: включён — золотая заливка и тёмная кнопка,
/// выключен — белый на просвет.
class VellinToggle extends StatelessWidget {
  final bool value;
  final ValueChanged<bool>? onChanged;

  const VellinToggle({super.key, required this.value, this.onChanged});

  @override
  Widget build(BuildContext context) {
    final br = BorderRadius.circular(VellinRadius.pill);

    return VellinInteractive(
      onTap: onChanged == null ? null : () => onChanged!(!value),
      focusRadius: br,
      builder: (context, s) {
        return Opacity(
          opacity: onChanged == null ? 0.4 : 1,
          child: AnimatedContainer(
            duration: VellinMotion.state,
            curve: VellinMotion.standard,
            width: 40,
            height: 22,
            padding: const EdgeInsets.all(3),
            decoration: BoxDecoration(
              color: value ? const Color(0xE6E2C99B) : VellinColors.fill12,
              borderRadius: br,
            ),
            alignment: value ? Alignment.centerRight : Alignment.centerLeft,
            child: AnimatedContainer(
              duration: VellinMotion.state,
              curve: VellinMotion.standard,
              width: 16,
              height: 16,
              decoration: BoxDecoration(
                color: value ? VellinColors.onAccent : VellinColors.ink62,
                shape: BoxShape.circle,
              ),
            ),
          ),
        );
      },
    );
  }
}

/// Строка настройки с переключателем: название, подпись, тумблер справа.
class VellinToggleRow extends StatelessWidget {
  final String title;
  final String? hint;
  final bool value;
  final ValueChanged<bool>? onChanged;

  const VellinToggleRow({
    super.key,
    required this.title,
    this.hint,
    required this.value,
    this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: VellinType.body.copyWith(height: 1.3)),
              if (hint != null) ...[
                const SizedBox(height: 3),
                Text(hint!, style: VellinType.caption),
              ],
            ],
          ),
        ),
        const SizedBox(width: 14),
        VellinToggle(value: value, onChanged: onChanged),
      ],
    );
  }
}
