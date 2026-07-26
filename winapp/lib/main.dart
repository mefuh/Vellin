import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:provider/provider.dart';
import 'package:window_manager/window_manager.dart';
import 'api/api_client.dart';
import 'api/auth_api.dart';
import 'api/friends_api.dart';
import 'api/catalog_api.dart';
import 'api/dm_api.dart';
import 'realtime/user_socket.dart';
import 'router.dart';
import 'state/auth_controller.dart';
import 'state/friends_controller.dart';
import 'state/dm_controller.dart';
import 'state/presence_controller.dart';
import 'state/update_controller.dart';
import 'storage/session_store.dart';
import 'theme/vellin_theme.dart';
import 'runtime/update_checker.dart';
import 'widgets/window_title_bar.dart';

/// Размер маленького окна апдейтера (без нативного заголовка).
/// Высота с запасом под двухстрочную подпись во время загрузки.
const _updaterSize = Size(440, 360);

/// Размеры основного окна приложения.
const _appSize = Size(1180, 760);
const _appMinSize = Size(940, 640);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await windowManager.ensureInitialized();
  MediaKit.ensureInitialized();

  final client = ApiClient();
  final authApi = AuthApi(client);
  final friendsApi = FriendsApi(client);
  final catalogApi = CatalogApi(client);
  final dmApi = DmApi(client);
  final socket = UserSocket(dmApi.realtimeTicket);
  final auth = AuthController(client, authApi, SessionStore());
  final update = UpdateController(client);

  // Старт: проверка обновления и восстановление сессии идут параллельно.
  update.check();
  auth.restore();

  // Окно стартует маленьким и БЕЗ нативного заголовка (titleBarStyle.hidden) —
  // фаза апдейтера. Непрозрачное: прозрачная подложка в release ненадёжна
  // (окно рендерилось пустым). Показываем только когда готово, без мелькания.
  await windowManager.waitUntilReadyToShow(
    const WindowOptions(
      size: _updaterSize,
      center: true,
      titleBarStyle: TitleBarStyle.hidden,
      windowButtonVisibility: false,
    ),
    () async {
      await windowManager.setResizable(false);
      await windowManager.setMaximizable(false);
      await windowManager.setMinimizable(false);
      await windowManager.show();
      await windowManager.focus();
    },
  );

  runApp(
    MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: client),
        Provider<AuthApi>.value(value: authApi),
        Provider<FriendsApi>.value(value: friendsApi),
        Provider<CatalogApi>.value(value: catalogApi),
        ChangeNotifierProvider<AuthController>.value(value: auth),
        ChangeNotifierProvider<FriendsController>(create: (_) => FriendsController(friendsApi)),
        ChangeNotifierProvider<DmController>(create: (_) => DmController(dmApi, socket)),
        ChangeNotifierProvider<PresenceController>(create: (_) => PresenceController(socket)),
        ChangeNotifierProvider<UpdateController>.value(value: update),
      ],
      child: const VellinApp(),
    ),
  );
}

/// Двухфазный корень: сначала маленькое безрамочное окно апдейтера (проверка /
/// обновление, как у Discord), затем — нормальное окно приложения.
class VellinApp extends StatefulWidget {
  const VellinApp({super.key});
  @override
  State<VellinApp> createState() => _VellinAppState();
}

class _VellinAppState extends State<VellinApp> {
  late final _router = buildRouter(context.read<AuthController>());
  bool _enteredApp = false;

  /// Переключить окно в обычный режим (рамка + заголовок, ресайз, нормальный
  /// размер) — вызывается один раз при переходе из апдейтера в приложение.
  Future<void> _enterAppWindow() async {
    // Окно приложения — БЕЗ нативного заголовка (свой титлбар), но ресайзное,
    // с тенью и системным скруглением. Возвращаем рамку после безрамочного
    // апдейтера (setAsFrameless) через titleBarStyle.hidden.
    await windowManager.setTitleBarStyle(TitleBarStyle.hidden, windowButtonVisibility: false);
    await windowManager.setResizable(true);
    await windowManager.setMaximizable(true);
    await windowManager.setMinimizable(true);
    await windowManager.setHasShadow(true);
    await windowManager.setMinimumSize(_appMinSize);
    await windowManager.setSize(_appSize);
    await windowManager.setTitle('Vellin');
    await windowManager.center();
  }

  @override
  Widget build(BuildContext context) {
    final update = context.watch<UpdateController>();

    // Проверка завершена и обновления нет (или отложено) — уходим в приложение.
    if (!_enteredApp && update.ready && update.pending == null) {
      _enteredApp = true;
      WidgetsBinding.instance.addPostFrameCallback((_) => _enterAppWindow());
    }

    if (_enteredApp) {
      return MaterialApp.router(
        title: 'Vellin',
        debugShowCheckedModeBanner: false,
        theme: buildVellinTheme(),
        routerConfig: _router,
        // Свой заголовок окна поверх всех экранов (нативный скрыт).
        builder: (context, child) => Column(children: [
          const WindowTitleBar(),
          Expanded(child: child ?? const SizedBox.shrink()),
        ]),
      );
    }

    // Фаза апдейтера в маленьком окне без нативного заголовка (углы скругляет
    // система, DWM). Непрозрачное — надёжно в release.
    return MaterialApp(
      title: 'Vellin',
      debugShowCheckedModeBanner: false,
      theme: buildVellinTheme(),
      home: update.pending != null
          ? UpdateScreen(info: update.pending!, onSkip: update.skip)
          : const _CheckingScreen(),
    );
  }
}

/// Экран «проверка обновлений» в маленьком окне апдейтера.
class _CheckingScreen extends StatelessWidget {
  const _CheckingScreen();
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: VellinColors.bg0,
      body: Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(color: VellinColors.accent, borderRadius: BorderRadius.circular(16)),
            alignment: Alignment.center,
            child: const Text('V',
                style: TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w800, height: 1)),
          ),
          const SizedBox(height: 22),
          const SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(strokeWidth: 2.4, color: VellinColors.accentHi),
          ),
          const SizedBox(height: 16),
          const Text('Проверка обновлений…',
              style: TextStyle(color: VellinColors.text2, fontSize: 13)),
        ]),
      ),
    );
  }
}
