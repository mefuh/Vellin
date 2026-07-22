import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'api/api_client.dart';
import 'api/auth_api.dart';
import 'api/friends_api.dart';
import 'api/dm_api.dart';
import 'realtime/user_socket.dart';
import 'router.dart';
import 'state/auth_controller.dart';
import 'state/friends_controller.dart';
import 'state/dm_controller.dart';
import 'storage/session_store.dart';
import 'theme/vellin_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  final client = ApiClient();
  final authApi = AuthApi(client);
  final friendsApi = FriendsApi(client);
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
        ChangeNotifierProvider<AuthController>.value(value: auth),
        ChangeNotifierProvider<FriendsController>(create: (_) => FriendsController(friendsApi)),
        ChangeNotifierProvider<DmController>(create: (_) => DmController(dmApi, socket)),
      ],
      child: const VellinApp(),
    ),
  );
}

class VellinApp extends StatelessWidget {
  const VellinApp({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.read<AuthController>();
    final router = buildRouter(auth);
    return MaterialApp.router(
      title: 'Vellin',
      debugShowCheckedModeBanner: false,
      theme: buildVellinTheme(),
      routerConfig: router,
    );
  }
}
