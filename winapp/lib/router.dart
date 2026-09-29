import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'app_config.dart';
import 'screens/app_shell.dart';
import 'state/auth_controller.dart';
import 'theme/vellin_design.dart';

/// Ключ корневого навигатора — для показа глобальных диалогов (обновление).
final rootNavigatorKey = GlobalKey<NavigatorState>();

/// Роутер с guard'ом авторизации.
///
/// Маршрутов у авторизованной части больше нет: раздел, открытый диалог и
/// профиль — это состояние оболочки (`ShellController`), а не адрес. Так рейл
/// может менять левую панель, не трогая правую область, чего вложенными
/// маршрутами не выразить.
GoRouter buildRouter(AuthController auth) {
  return GoRouter(
    navigatorKey: rootNavigatorKey,
    refreshListenable: auth,
    initialLocation: '/splash',
    routes: [
      GoRoute(path: '/splash', builder: (_, _) => const _SplashScreen()),
      GoRoute(path: '/upgrade', builder: (_, _) => _UpgradeScreen(minVersion: auth.upgradeMinVersion ?? '')),
      GoRoute(path: '/app', builder: (_, _) => const AppShell()),
    ],
    redirect: (context, state) {
      final loc = state.matchedLocation;
      if (auth.upgradeMinVersion != null) return loc == '/upgrade' ? null : '/upgrade';
      if (!auth.ready) return loc == '/splash' ? null : '/splash';
      // Вход живёт в отдельном окне (runtime/auth_window.dart): экранов входа
      // и регистрации внутри приложения нет, роутер работает только для уже
      // авторизованного пользователя.
      if (!auth.authenticated) return loc == '/splash' ? null : '/splash';
      return loc == '/splash' ? '/app' : null;
    },
  );
}

/// Восстановление сессии: знак и слово VELLIN на том же фоне, что у апдейтера,
/// а не голый крутящийся кружок — иначе стык с апдейтером виден.
class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return const ColoredBox(
      color: VellinColors.bg1,
      child: Center(child: _Wordmark()),
    );
  }
}

class _Wordmark extends StatelessWidget {
  const _Wordmark();

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Image.asset('assets/vellin_icon.png', width: 44, height: 44, filterQuality: FilterQuality.high),
        const SizedBox(height: 14),
        Text(
          'VELLIN',
          style: TextStyle(
            fontFamily: VellinType.family,
            fontSize: 13,
            fontWeight: FontWeight.w500,
            letterSpacing: 13 * 0.42,
            color: VellinColors.ink45,
          ),
        ),
      ],
    );
  }
}

class _UpgradeScreen extends StatelessWidget {
  final String minVersion;
  const _UpgradeScreen({required this.minVersion});

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: VellinColors.bg1,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 380),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const _Wordmark(),
                const SizedBox(height: 24),
                Text(
                  'Нужно обновление',
                  style: VellinType.paneTitle.copyWith(fontSize: 20),
                ),
                const SizedBox(height: 10),
                Text(
                  'Ваша версия (${AppConfig.appVersion}) больше не поддерживается. '
                  'Обновите Vellin${minVersion.isNotEmpty ? ' до версии $minVersion или новее' : ''}, чтобы продолжить.',
                  textAlign: TextAlign.center,
                  style: VellinType.body.copyWith(color: VellinColors.ink55, height: 1.6),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
