import '../app_config.dart';
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

  /// Заявка на вход по QR: возвращает адрес для кода и секрет для опроса.
  ///
  /// `url` сервер собирает по PUBLIC_BASE_URL; если она не задана (локальная
  /// разработка), приходит относительный путь — достраиваем его сами, иначе
  /// в QR попадёт ссылка, которую телефону некуда резолвить.
  Future<QrLoginStart> qrStart() async {
    final j = await _c.post('/auth/qr/start', const {}) as Map<String, dynamic>;
    final url = j['url'] as String;
    return QrLoginStart(
      requestId: j['requestId'] as String,
      pollToken: j['pollToken'] as String,
      url: url.startsWith('/') ? '${AppConfig.siteUrl}$url' : url,
      expiresAt: DateTime.parse(j['expiresAt'] as String),
    );
  }

  /// Опрос статуса заявки. Токен отдаётся сервером ровно один раз.
  Future<QrLoginPoll> qrPoll(String pollToken) async {
    final j = await _c.get('/auth/qr/poll?token=${Uri.encodeQueryComponent(pollToken)}')
        as Map<String, dynamic>;
    final status = j['status'] as String;
    return QrLoginPoll(
      status: status,
      result: status == 'approved' && j['token'] != null
          ? AuthResult.fromJson(j)
          : null,
    );
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

/// Ответ на запрос заявки для входа по QR.
class QrLoginStart {
  final String requestId;
  final String pollToken;

  /// Что зашиваем в QR — ссылка на страницу подтверждения на сайте.
  final String url;
  final DateTime expiresAt;
  const QrLoginStart({
    required this.requestId,
    required this.pollToken,
    required this.url,
    required this.expiresAt,
  });
}

/// Результат опроса заявки: pending | approved | expired.
class QrLoginPoll {
  final String status;

  /// Заполняется только при status == 'approved'.
  final AuthResult? result;
  const QrLoginPoll({required this.status, this.result});
}
