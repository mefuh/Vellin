import '../models/notification.dart';
import 'api_client.dart';

/// Снапшот уведомлений: список + счётчик непрочитанных.
class NotificationsSnapshot {
  final List<AppNotification> notifications;
  final int unreadCount;
  const NotificationsSnapshot(this.notifications, this.unreadCount);
}

/// Уведомления «колокольчика». Требуют авторизации.
class NotificationsApi {
  final ApiClient _c;
  NotificationsApi(this._c);

  Future<NotificationsSnapshot> list() async {
    final j = await _c.get('/notifications') as Map<String, dynamic>;
    return NotificationsSnapshot(
      (j['notifications'] as List? ?? [])
          .map((e) => AppNotification.fromJson(e as Map<String, dynamic>))
          .toList(),
      (j['unreadCount'] as num?)?.toInt() ?? 0,
    );
  }

  /// Отметить прочитанными: конкретные id либо все (без аргумента).
  /// Возвращает новый счётчик непрочитанных.
  Future<int> markRead([List<String>? ids]) async {
    final j = await _c.post('/notifications/read', ids == null ? {} : {'ids': ids}) as Map<String, dynamic>;
    return (j['unreadCount'] as num?)?.toInt() ?? 0;
  }

  /// Убрать одно уведомление. Возвращает новый счётчик непрочитанных.
  Future<int> dismiss(String id) async {
    final j = await _c.delete('/notifications/${Uri.encodeComponent(id)}') as Map<String, dynamic>;
    return (j['unreadCount'] as num?)?.toInt() ?? 0;
  }
}
