/// Конфигурация клиента. Адрес бэкенда переопределяется при сборке:
///   flutter run --dart-define=SERVER_URL=http://localhost:3001
/// По умолчанию — прод. Заголовки X-App-Platform / X-App-Version уходят на
/// сервер для версионного гейтинга (устаревший клиент получает 426).
class AppConfig {
  static const String serverUrl = String.fromEnvironment(
    'SERVER_URL',
    defaultValue: 'https://vellin.ru',
  );

  /// База REST API.
  static String get apiBase => '$serverUrl/api';

  /// Адрес сайта — для ссылок наружу (регистрация, подтверждение входа по QR).
  ///
  /// В проде сайт и API живут на одном домене, поэтому по умолчанию совпадает
  /// с [serverUrl]. Локально это разные порты (сайт :5173, API :3001), и адрес
  /// задаётся при сборке:
  ///   flutter run --dart-define=SITE_URL=https://localhost:5173
  static const String siteUrl = String.fromEnvironment('SITE_URL', defaultValue: serverUrl);

  /// WS-адрес пользовательского realtime-канала (http→ws).
  static String get userWsUrl => '${serverUrl.replaceFirst(RegExp(r'^http'), 'ws')}/ws/user';

  /// Платформа клиента (заголовок X-App-Platform).
  static const String platform = 'windows';

  /// Версия приложения (заголовок X-App-Version). Синхронно с pubspec version.
  static const String appVersion = '0.2.0';

  /// Приводит URL медиа (аватар) к загружаемому виду. Абсолютный — как есть;
  /// относительный `/api/uploads/...` (когда PUBLIC_BASE_URL не задан на сервере)
  /// префиксуем origin сервера.
  static String? mediaUrl(String? url) {
    if (url == null || url.isEmpty) return null;
    if (url.startsWith('http')) return url;
    if (url.startsWith('/')) return '$serverUrl$url';
    return url;
  }
}
