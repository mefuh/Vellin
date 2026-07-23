import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:provider/provider.dart';
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
import 'storage/session_store.dart';
import 'theme/vellin_theme.dart';
import 'runtime/update_checker.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  MediaKit.ensureInitialized();

  final client = ApiClient();
  final authApi = AuthApi(client);
  final friendsApi = FriendsApi(client);
  final catalogApi = CatalogApi(client);
  final dmApi = DmApi(client);
  final socket = UserSocket(dmApi.realtimeTicket);
  final auth = AuthController(client, authApi, SessionStore());

  // Восстанавливаем сессию из ОС-хранилища (async; контроллер выставит ready).
  auth.restore();

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
      ],
      child: const VellinApp(),
    ),
  );
}

class VellinApp extends StatefulWidget {
  const VellinApp({super.key});
  @override
  State<VellinApp> createState() => _VellinAppState();
}

class _VellinAppState extends State<VellinApp> {
  late final _router = buildRouter(context.read<AuthController>());

  @override
  void initState() {
    super.initState();
    // Проверяем обновление на старте; при наличии — показываем диалог.
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final info = await checkForUpdate(context.read<ApiClient>());
      final ctx = rootNavigatorKey.currentContext;
      if (info != null && ctx != null && ctx.mounted) showUpdateDialog(ctx, info);
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Vellin',
      debugShowCheckedModeBanner: false,
      theme: buildVellinTheme(),
      routerConfig: _router,
    );
  }
}
