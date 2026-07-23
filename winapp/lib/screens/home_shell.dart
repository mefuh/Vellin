import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../state/auth_controller.dart';
import '../state/dm_controller.dart';
import '../state/presence_controller.dart';
import '../theme/vellin_theme.dart';

/// Каркас авторизованной части: боковая навигация (NavigationRail) слева +
/// активная секция справа. Разделы: Друзья, Сообщения, Профиль. Здесь же
/// поднимается realtime-канал (DmController.start) на время сессии.
class HomeShell extends StatefulWidget {
  final StatefulNavigationShell shell;
  const HomeShell({super.key, required this.shell});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> with WidgetsBindingObserver {
  DmController? _dm;
  PresenceController? _presence;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Запускаем realtime-каналы (ЛС + присутствие) на время авторизованной сессии.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final user = context.read<AuthController>().user;
      if (user != null) {
        _dm = context.read<DmController>();
        _dm!.start(user.id);
        _presence = context.read<PresenceController>();
        _presence!.start();
        _presence!.setActive(true);
      }
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Свёрнуто/на фоне → офлайн для собеседников; развёрнуто → снова в сети.
    _presence?.setActive(state == AppLifecycleState.resumed);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _dm?.stop();
    _presence?.stop();
    super.dispose();
  }

  Future<void> _logout(BuildContext context) async {
    await _dm?.stop();
    await _presence?.stop();
    if (!context.mounted) return;
    await context.read<AuthController>().logout();
    if (context.mounted) context.go('/login');
  }

  @override
  Widget build(BuildContext context) {
    final unread = context.select<DmController, int>((d) => d.unreadTotal);
    return Scaffold(
      backgroundColor: VellinColors.bg0,
      body: Row(children: [
        NavigationRail(
          backgroundColor: VellinColors.bg1,
          selectedIndex: widget.shell.currentIndex,
          onDestinationSelected: (i) => widget.shell.goBranch(i, initialLocation: i == widget.shell.currentIndex),
          labelType: NavigationRailLabelType.all,
          indicatorColor: VellinColors.accentSoft,
          selectedIconTheme: const IconThemeData(color: VellinColors.accentHi),
          unselectedIconTheme: const IconThemeData(color: VellinColors.text2),
          selectedLabelTextStyle: const TextStyle(color: VellinColors.text0, fontSize: 12, fontWeight: FontWeight.w600),
          unselectedLabelTextStyle: const TextStyle(color: VellinColors.text2, fontSize: 12),
          leading: const Padding(padding: EdgeInsets.symmetric(vertical: 16), child: _RailMark()),
          trailing: Expanded(
            child: Align(
              alignment: Alignment.bottomCenter,
              child: Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: IconButton(
                  icon: const Icon(Icons.logout, color: VellinColors.text2),
                  tooltip: 'Выйти',
                  onPressed: () => _logout(context),
                ),
              ),
            ),
          ),
          destinations: [
            NavigationRailDestination(
              icon: _BadgedIcon(icon: Icons.chat_bubble_outline, count: unread),
              selectedIcon: _BadgedIcon(icon: Icons.chat_bubble, count: unread),
              label: const Text('Сообщения'),
            ),
            const NavigationRailDestination(icon: Icon(Icons.people_alt_outlined), selectedIcon: Icon(Icons.people_alt), label: Text('Друзья')),
            const NavigationRailDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: Text('Профиль')),
          ],
        ),
        const VerticalDivider(width: 1, thickness: 1, color: VellinColors.line2),
        Expanded(child: widget.shell),
      ]),
    );
  }
}

class _BadgedIcon extends StatelessWidget {
  final IconData icon;
  final int count;
  const _BadgedIcon({required this.icon, required this.count});
  @override
  Widget build(BuildContext context) {
    if (count <= 0) return Icon(icon);
    return Badge(
      label: Text('$count'),
      backgroundColor: VellinColors.accent,
      child: Icon(icon),
    );
  }
}

class _RailMark extends StatelessWidget {
  const _RailMark();
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 12,
      height: 12,
      decoration: const BoxDecoration(color: VellinColors.accent, shape: BoxShape.circle),
    );
  }
}
