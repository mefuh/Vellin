import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:provider/provider.dart';
import 'package:window_manager/window_manager.dart';
import 'api/api_client.dart';
import 'api/auth_api.dart';
import 'api/friends_api.dart';
import 'api/catalog_api.dart';
import 'api/dm_api.dart';
import 'api/notifications_api.dart';
import 'app_config.dart';
import 'realtime/user_socket.dart';
import 'router.dart';
import 'state/auth_controller.dart';
import 'state/friends_controller.dart';
import 'state/dm_controller.dart';
import 'state/call_controller.dart';
import 'state/notifications_controller.dart';
import 'state/presence_controller.dart';
import 'state/update_controller.dart';
import 'storage/session_store.dart';
import 'webrtc/call_settings.dart';
import 'theme/vellin_theme.dart';
import 'runtime/auth_window.dart';
import 'runtime/toast_host.dart';
import 'runtime/toast_window.dart';
import 'runtime/updater_splash.dart';
import 'widgets/call_overlay.dart';
import 'widgets/notifications_bell.dart';
import 'widgets/window_title_bar.dart';

/// Размеры основного окна приложения.
const _appSize = Size(1180, 760);
const _appMinSize = Size(940, 640);

Future<void> main(List<String> args) async {
  // Этот же exe обслуживает окна уведомлений: у Flutter на Windows одно окно
  // на процесс, поэтому тост живёт отдельным процессом (см. toast_host.dart).
  // Ветка ранняя: приложению целиком в этом режиме подниматься незачем.
  if (args.length >= 2 && args.first == '--toast') {
    final port = int.tryParse(args[1]);
    if (port != null) {
      await runToastApp(port);
      return;
    }
  }

  WidgetsFlutterBinding.ensureInitialized();
  await windowManager.ensureInitialized();
  MediaKit.ensureInitialized();

  final client = ApiClient();
  final authApi = AuthApi(client);
  final friendsApi = FriendsApi(client);
  final catalogApi = CatalogApi(client);
  final dmApi = DmApi(client);
  final notificationsApi = NotificationsApi(client);
  final socket = UserSocket(dmApi.realtimeTicket);
  final auth = AuthController(client, authApi, SessionStore());
  final update = UpdateController(client);

  // Устройства и обработка звука для звонков. Читаются заранее: выбранный
  // динамик нужен ещё до первого звонка — на нём играет рингтон.
  final callSettings = CallSettings();
  callSettings.load();

  // Всплывающие уведомления в фирменном стиле — отдельным окном-процессом.
  // Поднимается лениво, при первом уведомлении.
  final toasts = ToastHost();
  final notifications = NotificationsController(notificationsApi, friendsApi, socket);
  notifications.onIncoming = toasts.show;

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
        ChangeNotifierProvider<NotificationsController>.value(value: notifications),
        ChangeNotifierProvider<CallSettings>.value(value: callSettings),
        // Тостер нужен звонкам: при неактивном окне входящий приходит им.
        ChangeNotifierProvider<CallController>(
          create: (_) => CallController(socket, toasts, callSettings),
        ),
        Provider<ToastHost>.value(value: toasts),
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

/// Фазы окна: апдейтер → вход → приложение. Каждая живёт в своём окне —
/// маленьком безрамочном для первых двух и обычном для третьей.
enum _Phase { updater, auth, app }

class _VellinAppState extends State<VellinApp> {
  late final _router = buildRouter(context.read<AuthController>());
  _Phase _phase = _Phase.updater;

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

  /// Окно входа — того же семейства, что апдейтер: маленькое, без ресайза.
  /// Сюда же возвращаемся после выхода из аккаунта, поэтому снимаем всё, что
  /// включало окно приложения (разворот, изменение размера).
  Future<void> _enterAuthWindow() async {
    if (await windowManager.isMaximized()) await windowManager.unmaximize();
    await windowManager.setResizable(false);
    await windowManager.setMaximizable(false);
    // Снимаем минимум окна приложения: он больше окна входа и не дал бы
    // ужаться. Ставим до смены размера, иначе окно дёрнется дважды.
    await windowManager.setMinimumSize(const Size(200, 200));
    await applyAuthWindowSize();
  }

  @override
  Widget build(BuildContext context) {
    final update = context.watch<UpdateController>();
    final auth = context.watch<AuthController>();

    // Апдейтер отработал: дальше либо вход, либо сразу приложение.
    final target = !update.done
        ? _Phase.updater
        : (auth.ready && !auth.authenticated ? _Phase.auth : _Phase.app);

    // Звонки поднимаем, как только известен пользователь, а не на смене фазы:
    // на переходе окна профиль мог быть ещё не загружен, и тогда звонки не
    // включались бы вовсе. Метод идемпотентен.
    final me = auth.user;
    if (target == _Phase.app && me != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        context.read<CallController>().start(me.id);
      });
    }

    if (target != _phase) {
      _phase = target;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (target == _Phase.auth) _enterAuthWindow();
        if (target == _Phase.app) _enterAppWindow();
        // Уведомления живут всю сессию, а не пока открыт HomeShell: заход в
        // профиль или настройки выходит за пределы оболочки, и привязка к её
        // жизненному циклу рвала бы подписку и обнуляла список.
        final notifications = context.read<NotificationsController>();
        final calls = context.read<CallController>();
        if (target == _Phase.app) notifications.start();
        if (target == _Phase.auth) {
          notifications.stop();
          calls.stop();
          // Вышли из аккаунта — окно уведомлений больше не нужно.
          context.read<ToastHost>().stop();
        }
      });
    }

    if (_phase == _Phase.auth) {
      return MaterialApp(
        title: 'Vellin',
        debugShowCheckedModeBanner: false,
        theme: buildVellinTheme(),
        home: AuthWindow(auth: auth, authApi: context.read<AuthApi>()),
      );
    }

    if (_phase == _Phase.app) {
      return MaterialApp.router(
        title: 'Vellin',
        debugShowCheckedModeBanner: false,
        theme: buildVellinTheme(),
        routerConfig: _router,
        // Свой заголовок окна поверх всех экранов (нативный скрыт), а над ним —
        // слой панели уведомлений: она выпадает из колокольчика в заголовке и
        // должна перекрывать содержимое любого экрана.
        builder: (context, child) => Stack(children: [
          Column(children: [
            const WindowTitleBar(),
            // Свёрнутый звонок — полоса под заголовком, над содержимым раздела.
            const CallBarSlot(),
            Expanded(child: child ?? const SizedBox.shrink()),
          ]),
          const NotificationsPanelOverlay(),
          // Экраны звонка выше роутера: разговор переживает переходы по
          // разделам. Positioned.fill обязателен: вложенный Stack без него
          // схлопнулся бы по содержимому и рисовал экраны не на месте.
          const Positioned.fill(child: CallLayer()),
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
