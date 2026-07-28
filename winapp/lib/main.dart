import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:provider/provider.dart';
import 'package:window_manager/window_manager.dart';
import 'api/api_client.dart';
import 'api/auth_api.dart';
import 'api/friends_api.dart';
import 'api/catalog_api.dart';
import 'api/dm_api.dart';
import 'app_config.dart';
import 'realtime/user_socket.dart';
import 'router.dart';
import 'state/auth_controller.dart';
import 'state/friends_controller.dart';
import 'state/dm_controller.dart';
import 'state/presence_controller.dart';
import 'state/update_controller.dart';
import 'storage/session_store.dart';
import 'theme/vellin_theme.dart';
import 'runtime/updater_splash.dart';
import 'widgets/window_title_bar.dart';

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

  // Старт: сценарий обновления и восстановление сессии идут параллельно.
  update.run();
  auth.restore();

  // Окно стартует маленьким и БЕЗ нативного заголовка (titleBarStyle.hidden) —
  // фаза апдейтера. Непрозрачное: прозрачная подложка в release ненадёжна
  // (окно рендерилось пустым). Показываем только когда готово, без мелькания.
  await windowManager.waitUntilReadyToShow(
    const WindowOptions(
      size: kSplashSize,
      center: true,
      backgroundColor: kSplashBackground,
      titleBarStyle: TitleBarStyle.hidden,
      windowButtonVisibility: false,
    ),
    () async {
      await windowManager.setResizable(false);
      await windowManager.setMaximizable(false);
      await windowManager.setMinimizable(false);
      // Окно здесь НЕ показываем: до runApp у Flutter нет ни одного кадра, и
      // пустое окно на мгновение мелькает белым. Показ — после первого кадра.
    },
  );
  // Содержимое сплэша рассчитано на точные 520×340 клиентской области.
  await fitSplashClientSize();

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

  // Первый кадр отрисован — только теперь показываем окно, чтобы старт был
  // сразу со сплэшем, без белой вспышки пустого окна.
  WidgetsBinding.instance.addPostFrameCallback((_) async {
    await windowManager.show();
    await windowManager.focus();
  });
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

    // Сценарий апдейтера отработал (обновления нет) — уходим в приложение.
    if (!_enteredApp && update.done) {
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
      home: VellinUpdaterSplash(
        phase: update.phase,
        progress: update.progress,
        fadingOut: update.fadingOut,
        version: AppConfig.appVersion,
        onIntroDone: update.introDone,
        onRetry: update.retry,
      ),
    );
  }
}
