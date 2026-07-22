import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../state/auth_controller.dart';
import '../theme/vellin_theme.dart';

/// Каркас авторизованной части: боковая навигация (NavigationRail) слева +
/// активная секция справа. Разделы: Друзья, Профиль (далее — Сообщения и т.д.).
class HomeShell extends StatelessWidget {
  final StatefulNavigationShell shell;
  const HomeShell({super.key, required this.shell});

  Future<void> _logout(BuildContext context) async {
    await context.read<AuthController>().logout();
    if (context.mounted) context.go('/login');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: VellinColors.bg0,
      body: Row(children: [
        NavigationRail(
          backgroundColor: VellinColors.bg1,
          selectedIndex: shell.currentIndex,
          onDestinationSelected: (i) => shell.goBranch(i, initialLocation: i == shell.currentIndex),
          labelType: NavigationRailLabelType.all,
          indicatorColor: VellinColors.accentSoft,
          selectedIconTheme: const IconThemeData(color: VellinColors.accentHi),
          unselectedIconTheme: const IconThemeData(color: VellinColors.text2),
          selectedLabelTextStyle: const TextStyle(color: VellinColors.text0, fontSize: 12, fontWeight: FontWeight.w600),
          unselectedLabelTextStyle: const TextStyle(color: VellinColors.text2, fontSize: 12),
          leading: const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: _RailMark(),
          ),
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
          destinations: const [
            NavigationRailDestination(icon: Icon(Icons.people_alt_outlined), selectedIcon: Icon(Icons.people_alt), label: Text('Друзья')),
            NavigationRailDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: Text('Профиль')),
          ],
        ),
        const VerticalDivider(width: 1, thickness: 1, color: VellinColors.line2),
        Expanded(child: shell),
      ]),
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
