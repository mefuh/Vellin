import '../models/models.dart';
import 'api_client.dart';

/// Методы auth + профиль. Гостевого входа нет — только зарегистрированные.
class AuthApi {
  final ApiClient _c;
  AuthApi(this._c);

  Future<AuthResult> register(String email, String username, String password) async {
    final j = await _c.post('/auth/register', {
      'email': email,
      'username': username,
      'password': password,
    });
    return AuthResult.fromJson(j as Map<String, dynamic>);
  }

  Future<AuthResult> login(String email, String password) async {
    final j = await _c.post('/auth/login', {'email': email, 'password': password});
    return AuthResult.fromJson(j as Map<String, dynamic>);
  }

  /// /auth/me — освежает пользователя; может вернуть перевыпущенный токен.
  Future<({AuthUser user, String? token})> me() async {
    final j = await _c.get('/auth/me') as Map<String, dynamic>;
    return (
      user: AuthUser.fromJson(j['user'] as Map<String, dynamic>),
      token: j['token'] as String?,
    );
  }

  Future<AuthResult> updateProfile(Map<String, dynamic> patch) async {
    final j = await _c.patch('/auth/profile', patch);
    return AuthResult.fromJson(j as Map<String, dynamic>);
  }

  Future<AuthResult> changeEmail(String email, String currentPassword) async {
    final j = await _c.post('/auth/email', {'email': email, 'currentPassword': currentPassword});
    return AuthResult.fromJson(j as Map<String, dynamic>);
  }

  Future<AuthResult> changePassword(String currentPassword, String newPassword) async {
    final j = await _c.post('/auth/password', {
      'currentPassword': currentPassword,
      'newPassword': newPassword,
    });
    return AuthResult.fromJson(j as Map<String, dynamic>);
  }

  Future<AuthResult> uploadAvatar(String filePath) async {
    final j = await _c.uploadFile('/auth/avatar', 'file', filePath);
    return AuthResult.fromJson(j as Map<String, dynamic>);
  }
}
