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

  /// Платформа клиента (заголовок X-App-Platform).
  static const String platform = 'windows';

  /// Версия приложения (заголовок X-App-Version). Синхронно с pubspec version.
  static const String appVersion = '0.1.0';

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
