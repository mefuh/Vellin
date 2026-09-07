import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import '../../state/auth_controller.dart';
import '../../state/dm_controller.dart';
import '../../state/playback_controller.dart';
import '../../state/presence_controller.dart';
import '../../state/shell_controller.dart';
import 'settings_frame.dart';

/// Слой настроек в стопке приложения: пока они закрыты, ничего не рисует и не
/// перехватывает нажатия.
class SettingsLayer extends StatelessWidget {
  const SettingsLayer({super.key});

  @override
  Widget build(BuildContext context) {
    final open = context.select<ShellController, bool>((s) => s.settingsOpen);
    if (!open) return const SizedBox.shrink();

    // Контроллеры берём до асинхронных пауз: после них тянуть их из context
    // уже нельзя — слой к тому моменту размонтируется вместе с сессией.
    final playback = context.read<PlaybackController>();
    final dm = context.read<DmController>();
    final presence = context.read<PresenceController>();
    final shell = context.read<ShellController>();
    final auth = context.read<AuthController>();

    return SettingsFrame(
      onLogout: () async {
        // Тот же порядок, что в оболочке: сначала гасим живые каналы.
        await playback.stop();
        await dm.stop();
        await presence.stop();
        shell.closeSettings();
        await auth.logout();
      },
    );
  }
}
