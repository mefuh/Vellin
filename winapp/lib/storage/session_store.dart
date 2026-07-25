import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/models.dart';

/// Хранилище сессии (token + user). На Windows shared_preferences реализован
/// через pure-Dart win32 FFI (файл в каталоге приложения) — сборка без C++/ATL.
///
/// ВАЖНО (hardening): значения хранятся без шифрования. Для продакшн-хранения
/// долгоживущего JWT это приемлемый MVP; следующий шаг — ОС-хранилище секретов
/// (Windows Credential Manager через flutter_secure_storage, требует ATL в VS).
/// Точка изоляции — этот модуль, менять только его.
class SessionStore {
  static const _kToken = 'vellin_token';
  static const _kUser = 'vellin_user';

  Future<({String token, AuthUser user})?> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString(_kToken);
      final userJson = prefs.getString(_kUser);
      if (token == null || userJson == null) return null;
      final user = AuthUser.fromJson(jsonDecode(userJson) as Map<String, dynamic>);
      return (token: token, user: user);
    } catch (_) {
      return null;
    }
  }

  Future<void> save(String token, AuthUser user) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kToken, token);
    await prefs.setString(_kUser, jsonEncode(user.toJson()));
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kToken);
    await prefs.remove(_kUser);
  }
}
