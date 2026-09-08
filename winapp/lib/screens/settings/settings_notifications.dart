import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import '../../state/app_settings.dart';
import '../../theme/vellin_design.dart';
import '../../widgets/ui/vellin_surfaces.dart';
import '../../widgets/ui/vellin_toggle.dart';

/// «Уведомления»: всплывающие окна и звуки.
///
/// Настройки этого компьютера, а не аккаунта: они про то, как ведёт себя окно,
/// поэтому кнопки «Сохранить» тут нет — переключатель применяется сразу.
class SettingsNotifications extends StatelessWidget {
  const SettingsNotifications({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppSettings>();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        VellinCard(
          title: 'Всплывающие уведомления',
          children: [
            VellinToggleRow(
              title: 'Показывать поверх других окон',
              hint: 'Появляются в углу экрана, когда окно Vellin не в фокусе. '
                  'При открытом окне достаточно колокольчика.',
              value: s.toasts,
              onChanged: s.setToasts,
            ),
            VellinToggleRow(
              title: 'Показывать текст сообщения',
              hint: s.toasts
                  ? 'Выключено — в уведомлении будет только имя и «Новое сообщение».'
                  : 'Доступно, когда включены всплывающие уведомления.',
              value: s.toastPreview,
              onChanged: s.toasts ? s.setToastPreview : null,
            ),
          ],
        ),
        const SizedBox(height: VellinLayout.gapCard),
        VellinCard(
          title: 'Звук',
          children: [
            VellinToggleRow(
              title: 'Звук новых сообщений',
              hint: 'Короткий сигнал на входящую реплику, когда окно не в фокусе.',
              value: s.messageSound,
              onChanged: s.setMessageSound,
            ),
            VellinToggleRow(
              title: 'Мелодия входящего звонка',
              hint: 'Выключение касается только вашего компьютера — '
                  'звонящий всё так же слышит гудки.',
              value: s.ringtone,
              onChanged: s.setRingtone,
            ),
          ],
        ),
        const SizedBox(height: VellinLayout.gapCard),
        VellinCard(
          title: 'Кто может вас беспокоить',
          children: [
            Text(
              'Кому разрешено писать и звонить, задаётся в разделе «Приватность»: '
              'уведомление не придёт от того, кто и так не может с вами связаться.',
              style: VellinType.body.copyWith(color: VellinColors.ink62, height: 1.6),
            ),
          ],
        ),
      ],
    );
  }
}
