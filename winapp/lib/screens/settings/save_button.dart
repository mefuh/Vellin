import 'package:flutter/widgets.dart';

import '../../theme/vellin_design.dart';
import '../../theme/vellin_glyphs.dart';
import '../../widgets/ui/vellin_button.dart';
import '../../widgets/ui/vellin_icon.dart';

/// Состояние кнопки сохранения формы.
enum SaveState { idle, saving, saved }

/// Кнопка сохранения: «Сохранить» → «Сохраняем…» со штрихом → «Сохранено» на
/// две секунды и обратно.
class SaveButton extends StatefulWidget {
  final SaveState state;
  final String label;
  final VoidCallback onPressed;

  /// Вызывается, когда «Сохранено» отвиселось и состояние пора сбросить.
  final VoidCallback onSettled;

  const SaveButton({
    super.key,
    required this.state,
    required this.label,
    required this.onPressed,
    required this.onSettled,
  });

  @override
  State<SaveButton> createState() => _SaveButtonState();
}

class _SaveButtonState extends State<SaveButton> {
  @override
  void didUpdateWidget(SaveButton old) {
    super.didUpdateWidget(old);
    if (widget.state == SaveState.saved && old.state != SaveState.saved) {
      Future<void>.delayed(const Duration(seconds: 2), () {
        if (mounted) widget.onSettled();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.state == SaveState.saved) {
      return Container(
        height: VellinLayout.fieldHeight,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        decoration: BoxDecoration(
          color: const Color(0x1F93B08A),
          borderRadius: BorderRadius.circular(VellinRadius.field),
          border: Border.all(color: const Color(0x4D93B08A)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const VellinIcon(VellinGlyphs.check, size: 15, color: VellinColors.online),
            const SizedBox(width: 8),
            Text(
              'Сохранено',
              style: VellinType.body.copyWith(fontSize: 13.5, color: VellinColors.online),
            ),
          ],
        ),
      );
    }

    return VellinButton(
      label: widget.state == SaveState.saving ? 'Сохраняем…' : widget.label,
      tone: VellinButtonTone.primary,
      height: VellinLayout.fieldHeight,
      radius: VellinRadius.field,
      busy: widget.state == SaveState.saving,
      onPressed: widget.onPressed,
    );
  }
}
