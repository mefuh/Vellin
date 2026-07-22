import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'app_config.dart';
import 'state/auth_controller.dart';
import 'theme/vellin_theme.dart';
import 'screens/login_screen.dart';
import 'screens/register_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/friends_screen.dart';
import 'screens/messages_screen.dart';
import 'screens/home_shell.dart';

/// Ключ корневого навигатора — для показа глобальных диалогов (обновление).
final rootNavigatorKey = GlobalKey<NavigatorState>();

/// Роутер с guard'ом авторизации. Пока сессия восстанавливается — сплэш; при
/// 426 — экран принудительного обновления; авторизованная часть живёт в
/// оболочке HomeShell (боковая навигация Друзья/Профиль).
GoRouter buildRouter(AuthController auth) {
  return GoRouter(
    navigatorKey: rootNavigatorKey,
    refreshListenable: auth,
    initialLocation: '/splash',
    routes: [
      GoRoute(path: '/splash', builder: (_, _) => const _SplashScreen()),
      GoRoute(path: '/upgrade', builder: (_, _) => _UpgradeScreen(minVersion: auth.upgradeMinVersion ?? '')),
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      GoRoute(path: '/register', builder: (_, _) => const RegisterScreen()),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) => HomeShell(shell: navigationShell),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: '/friends', builder: (_, _) => const FriendsScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/messages', builder: (_, _) => const MessagesScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/profile', builder: (_, _) => const ProfileScreen())]),
        ],
      ),
    ],
    redirect: (context, state) {
      final loc = state.matchedLocation;
      if (auth.upgradeMinVersion != null) return loc == '/upgrade' ? null : '/upgrade';
      if (!auth.ready) return loc == '/splash' ? null : '/splash';
      final authed = auth.authenticated;
      final onAuthPage = loc == '/login' || loc == '/register';
      if (authed) return onAuthPage || loc == '/splash' ? '/friends' : null;
      return onAuthPage ? null : '/login';
    },
  );
}

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();
  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: VellinColors.bg0,
      body: Center(child: CircularProgressIndicator(color: VellinColors.accentHi)),
    );
  }
}

class _UpgradeScreen extends StatelessWidget {
  final String minVersion;
  const _UpgradeScreen({required this.minVersion});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: VellinColors.bg0,
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 380),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('Нужно обновление',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600, color: VellinColors.text0)),
                const SizedBox(height: 12),
                Text(
                  'Ваша версия (${AppConfig.appVersion}) больше не поддерживается. '
                  'Обновите Vellin${minVersion.isNotEmpty ? ' до версии $minVersion или новее' : ''}, чтобы продолжить.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 14, color: VellinColors.text1, height: 1.5),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
