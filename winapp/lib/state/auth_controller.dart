import 'package:flutter/foundation.dart';
import '../api/api_client.dart';
import '../api/auth_api.dart';
import '../models/models.dart';
import '../storage/session_store.dart';

/// Состояние авторизации. Только зарегистрированные пользователи (гостей нет).
/// Восстановление сессии асинхронное (секреты из ОС-хранилища) — до готовности
/// `ready == false`, роутер показывает сплэш.
class AuthController extends ChangeNotifier {
  final ApiClient _client;
  final AuthApi _auth;
  final SessionStore _store;

  AuthController(this._client, this._auth, this._store) {
    _client.setTokenGetter(() => _token);
    _client.setUpgradeRequiredHandler((min) {
      _upgradeMinVersion = min;
      notifyListeners();
    });
  }

  String? _token;
  AuthUser? _user;
  bool _ready = false;
  String? _upgradeMinVersion;

  String? get token => _token;
  AuthUser? get user => _user;
  bool get ready => _ready;
  bool get authenticated => _token != null;
  String? get upgradeMinVersion => _upgradeMinVersion;

  /// Восстановление сессии из ОС-хранилища + освежение с сервера.
  Future<void> restore() async {
    final saved = await _store.load();
    if (saved == null) {
      _ready = true;
      notifyListeners();
      return;
    }
    _token = saved.token;
    _user = saved.user;
    try {
      final fresh = await _auth.me();
      _user = fresh.user;
      if (fresh.token != null) _token = fresh.token;
      await _store.save(_token!, _user!);
    } on ApiException catch (e) {
      // 401/403 → сессия недействительна; сетевые ошибки не разлогинивают.
      if (e.status == 401 || e.status == 403) {
        await _store.clear();
        _token = null;
        _user = null;
      }
    } catch (_) {}
    _ready = true;
    notifyListeners();
  }

  Future<void> login(String email, String password) async {
    final res = await _auth.login(email, password);
    await _apply(res);
  }

  Future<void> register(String email, String username, String password) async {
    final res = await _auth.register(email, username, password);
    await _apply(res);
  }

  /// Применить свежие token+user после мутаций профиля.
  Future<void> applyResult(AuthResult res) => _apply(res);

  Future<void> _apply(AuthResult res) async {
    _token = res.token;
    _user = res.user;
    await _store.save(res.token, res.user);
    notifyListeners();
  }

  Future<void> logout() async {
    _token = null;
    _user = null;
    await _store.clear();
    notifyListeners();
  }
}
