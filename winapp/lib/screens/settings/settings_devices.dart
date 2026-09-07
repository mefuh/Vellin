import 'package:flutter/widgets.dart';

import '../../theme/vellin_design.dart';
import '../../widgets/call_settings_panel.dart';
import '../../widgets/ui/vellin_surfaces.dart';

/// «Звук и видео» — та же панель, что открывается кнопкой в разговоре.
///
/// Значения общие и меняются в одном месте: настроить микрофон заранее должно
/// быть можно, а не только когда собеседник уже не слышит.
class SettingsDevices extends StatelessWidget {
  const SettingsDevices({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
          decoration: BoxDecoration(
            color: VellinColors.surface,
            borderRadius: BorderRadius.circular(VellinRadius.card),
            border: Border.all(color: VellinColors.line06),
          ),
          child: const CallSettingsPanel(),
        ),
        const SizedBox(height: VellinLayout.gapCard),
        VellinCard(
          title: 'Как это работает',
          children: [
            Text(
              'Шумоподавление, эхоподавление и авторегулировка громкости включаются '
              'в самом движке звонка: клиент передаёт их выбранными флагами при '
              'создании источника звука, а не обрабатывает дорожку сам.',
              style: VellinType.body.copyWith(color: VellinColors.ink62, height: 1.6),
            ),
          ],
        ),
      ],
    );
  }
}
