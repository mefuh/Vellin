import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import '../../app_config.dart';
import '../../state/shell_controller.dart';
import '../../theme/vellin_design.dart';
import '../../theme/vellin_glyphs.dart';
import '../../widgets/shell/phase_switch.dart';
import '../../widgets/ui/vellin_hover.dart';
import '../../widgets/ui/vellin_icon.dart';
import 'settings_account.dart';
import 'settings_appearance.dart';
import 'settings_devices.dart';
import 'settings_notifications.dart';
import 'settings_privacy.dart';
import 'settings_profile.dart';
import 'settings_showcase.dart';

/// Раздел настроек: идентификатор вкладки и её заголовок.
class SettingsTab {
  final String id;
  final String title;
  const SettingsTab(this.id, this.title);
}

const _groups = <(String, List<SettingsTab>)>[
  ('Аккаунт', [
    SettingsTab('profile', 'Мой профиль'),
    SettingsTab('showcase', 'Витрина кино'),
    SettingsTab('account', 'Аккаунт и пароль'),
    SettingsTab('privacy', 'Приватность'),
  ]),
  ('Приложение', [
    SettingsTab('devices', 'Звук и видео'),
    SettingsTab('notifications', 'Уведомления'),
    SettingsTab('appearance', 'Оформление'),
  ]),
  ('Прочее', [
    SettingsTab('about', 'О программе'),
  ]),
];

/// Фрейм настроек поверх приложения, но НИЖЕ заголовка окна: кнопки свернуть,
/// развернуть и закрыть остаются доступными, пока настройки открыты.
class SettingsFrame extends StatefulWidget {
  final VoidCallback onLogout;
  const SettingsFrame({super.key, required this.onLogout});

  @override
  State<SettingsFrame> createState() => _SettingsFrameState();
}

class _SettingsFrameState extends State<SettingsFrame> with SingleTickerProviderStateMixin {
  late final AnimationController _in = AnimationController(
    vsync: this,
    duration: VellinMotion.hover,
    reverseDuration: VellinMotion.short,
  )..forward();

  @override
  void dispose() {
    _in.dispose();
    super.dispose();
  }

  bool _closing = false;

  /// Просьбы закрыться, пришедшие до открытия фрейма, к нему не относятся.
  late int _seenCloseRequest = context.read<ShellController>().settingsCloseRequest;

  Future<void> _close() async {
    // Кнопка и Esc могут прийти почти разом — уход играем один раз.
    if (_closing) return;
    _closing = true;
    await _in.reverse();
    if (mounted) context.read<ShellController>().closeSettings();
  }

  @override
  Widget build(BuildContext context) {
    final shell = context.watch<ShellController>();
    final tab = shell.settingsTab;
    if (shell.settingsCloseRequest != _seenCloseRequest) {
      _seenCloseRequest = shell.settingsCloseRequest;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _close();
      });
    }

    return AnimatedBuilder(
      animation: _in,
      builder: (context, child) {
        final t = VellinMotion.standard.transform(_in.value);
        return Opacity(
          opacity: t,
          child: Transform.translate(offset: Offset(0, 18 * (1 - t)), child: child),
        );
      },
      child: ColoredBox(
        color: VellinColors.bg1,
        child: Row(
          children: [
            _Sidebar(current: tab, onSelect: shell.selectSettingsTab, onBack: _close, onLogout: widget.onLogout),
            Expanded(
              child: Column(
                children: [
                  _ContentHeader(title: _titleOf(tab)),
                  Expanded(
                    // Вкладка меняется в две фазы, как разделы рейла.
                    child: PhaseSwitch(
                      phaseKey: tab,
                      out: const Duration(milliseconds: 240),
                      inDuration: VellinMotion.hover,
                      shift: 0,
                      child: _panel(tab),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _panel(String tab) {
    return SingleChildScrollView(
      key: ValueKey(tab),
      padding: const EdgeInsets.fromLTRB(24, 26, 24, 48),
      child: Align(
        alignment: Alignment.topLeft,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: VellinLayout.paneMaxWidth),
          child: switch (tab) {
            'showcase' => const SettingsShowcase(),
            'account' => const SettingsAccount(),
            'privacy' => const SettingsPrivacy(),
            'devices' => const SettingsDevices(),
            'notifications' => const SettingsNotifications(),
            'appearance' => const SettingsAppearance(),
            'about' => const _AboutPanel(),
            _ => const SettingsProfile(),
          },
        ),
      ),
    );
  }

  static String _titleOf(String tab) {
    for (final g in _groups) {
      for (final t in g.$2) {
        if (t.id == tab) return t.title;
      }
    }
    return 'Настройки';
  }
}

class _Sidebar extends StatelessWidget {
  final String current;
  final ValueChanged<String> onSelect;
  final VoidCallback onBack;
  final VoidCallback onLogout;

  const _Sidebar({
    required this.current,
    required this.onSelect,
    required this.onBack,
    required this.onLogout,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: VellinLayout.settingsSidebar,
      padding: const EdgeInsets.fromLTRB(12, 14, 12, 16),
      decoration: const BoxDecoration(
        color: VellinColors.panel,
        border: Border(right: BorderSide(color: VellinColors.line05)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _BackRow(onTap: onBack),
          const SizedBox(height: 14),
          Expanded(
            child: ListView(
              padding: EdgeInsets.zero,
              children: [
                for (final group in _groups) ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(10, 10, 10, 6),
                    child: Text(group.$1.toUpperCase(), style: VellinType.groupLabel),
                  ),
                  for (final tab in group.$2)
                    _TabRow(
                      label: tab.title,
                      selected: tab.id == current,
                      onTap: () => onSelect(tab.id),
                    ),
                ],
              ],
            ),
          ),
          _LogoutRow(onTap: onLogout),
          const SizedBox(height: 10),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: Text(
              'Версия ${AppConfig.appVersion}',
              style: VellinType.time.copyWith(color: VellinColors.ink24),
            ),
          ),
        ],
      ),
    );
  }
}

class _BackRow extends StatelessWidget {
  final VoidCallback onTap;
  const _BackRow({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return VellinInteractive(
      onTap: onTap,
      focusRadius: BorderRadius.circular(VellinRadius.button),
      builder: (context, s) {
        final hot = s.hovered || s.pressed;
        return AnimatedContainer(
          duration: VellinMotion.hover,
          curve: VellinMotion.standard,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
          decoration: BoxDecoration(
            color: hot ? VellinColors.fill055 : const Color(0x00000000),
            borderRadius: BorderRadius.circular(VellinRadius.button),
          ),
          child: Row(
            children: [
              Container(
                width: 26,
                height: 26,
                decoration: BoxDecoration(
                  color: VellinColors.fill045,
                  borderRadius: BorderRadius.circular(VellinRadius.chip),
                  border: Border.all(color: VellinColors.line07),
                ),
                alignment: Alignment.center,
                child: VellinIcon(
                  VellinGlyphs.back,
                  size: 14,
                  color: hot ? VellinColors.accent : VellinColors.ink62,
                ),
              ),
              const SizedBox(width: 10),
              Text('Назад', style: VellinType.body.copyWith(fontSize: 13)),
            ],
          ),
        );
      },
    );
  }
}

class _TabRow extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _TabRow({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: VellinInteractive(
        onTap: onTap,
        focusRadius: BorderRadius.circular(VellinRadius.mini),
        builder: (context, s) {
          final hot = s.hovered || s.pressed;
          return AnimatedContainer(
            duration: VellinMotion.hover,
            curve: VellinMotion.standard,
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: selected
                  ? const Color(0x1FE2C99B)
                  : hot
                      ? VellinColors.fill055
                      : const Color(0x00000000),
              borderRadius: BorderRadius.circular(VellinRadius.mini),
            ),
            child: Text(
              label,
              style: VellinType.body.copyWith(
                fontSize: 13,
                color: selected ? VellinColors.accent : VellinColors.ink72,
              ),
            ),
          );
        },
      ),
    );
  }
}

class _LogoutRow extends StatelessWidget {
  final VoidCallback onTap;
  const _LogoutRow({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return VellinInteractive(
      onTap: onTap,
      focusRadius: BorderRadius.circular(VellinRadius.mini),
      builder: (context, s) {
        final hot = s.hovered || s.pressed;
        return AnimatedContainer(
          duration: VellinMotion.hover,
          curve: VellinMotion.standard,
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: hot ? const Color(0x1FD65C52) : const Color(0x00000000),
            borderRadius: BorderRadius.circular(VellinRadius.mini),
          ),
          child: Row(
            children: [
              const VellinIcon(VellinGlyphs.logout, size: 15, color: VellinColors.danger),
              const SizedBox(width: 10),
              Text(
                'Выйти из аккаунта',
                style: VellinType.body.copyWith(fontSize: 13, color: VellinColors.danger),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _ContentHeader extends StatelessWidget {
  final String title;
  const _ContentHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: VellinLayout.settingsHeader,
      padding: const EdgeInsets.symmetric(horizontal: 24),
      alignment: Alignment.centerLeft,
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: VellinColors.line05)),
      ),
      child: Text(title, style: VellinType.paneTitle),
    );
  }
}

/// «О программе»: версия, к какому серверу подключены и где лежат данные.
class _AboutPanel extends StatelessWidget {
  const _AboutPanel();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Vellin для Windows', style: VellinType.cardTitle.copyWith(fontSize: 17)),
        const SizedBox(height: 10),
        Text(
          'Версия ${AppConfig.appVersion}',
          style: VellinType.body.copyWith(
            color: VellinColors.ink62,
            fontFeatures: VellinType.tabular,
          ),
        ),
        const SizedBox(height: 6),
        Text(AppConfig.serverUrl, style: VellinType.caption.copyWith(fontSize: 12)),
      ],
    );
  }
}
