import 'dart:async';
import 'package:flutter/foundation.dart';
import '../api/friends_api.dart';
import '../api/notifications_api.dart';
import '../models/notification.dart';
import '../realtime/user_socket.dart';

/// Состояние «колокольчика»: список уведомлений, счётчик непрочитанных и
/// открытость панели. Источник истины — сервер: снапшот приходит в `hello`
/// пользовательского WS-канала, дальше живые `notification` /
/// `notifications_removed`. REST используется для действий (прочитать, убрать)
/// и как запасной путь, если WS ещё не отдал снапшот.
class NotificationsController extends ChangeNotifier {
  final NotificationsApi _api;
  final FriendsApi _friendsApi;
  final UserSocket _socket;
  NotificationsController(this._api, this._friendsApi, this._socket);

  /// Не больше стольких уведомлений держим в памяти (как в вебе).
  static const _maxItems = 50;

  StreamSubscription<Map<String, dynamic>>? _sub;
  bool _started = false;

  List<AppNotification> notifications = [];
  int unreadCount = 0;
  bool panelOpen = false;

  /// Вызывается на каждое новое входящее уведомление — сюда подписан показ
  /// системного тоста Windows (см. runtime/desktop_notifier.dart).
  void Function(AppNotification)? onIncoming;

  void start() {
    if (_started) return;
    _started = true;
    _sub = _socket.messages.listen(_onMessage);
    // Сокет поднимает DmController; снапшот придёт в hello. Но если канал уже
    // подключён (например, после перелогина), hello мы пропустим — тянем REST.
    load();
  }

  Future<void> stop() async {
    _started = false;
    await _sub?.cancel();
    _sub = null;
    notifications = [];
    unreadCount = 0;
    panelOpen = false;
  }

  /// Загрузить снапшот по REST (запасной путь и обновление «на всякий случай»).
  Future<void> load() async {
    try {
      final snap = await _api.list();
      notifications = snap.notifications;
      unreadCount = snap.unreadCount;
      notifyListeners();
    } catch (_) {
      // Молча: следующий hello по WS восстановит состояние.
    }
  }

  void _onMessage(Map<String, dynamic> msg) {
    switch (msg['t']) {
      case 'hello':
        notifications = (msg['notifications'] as List? ?? [])
            .map((e) => AppNotification.fromJson(e as Map<String, dynamic>))
            .toList();
        unreadCount = (msg['unreadCount'] as num?)?.toInt() ?? 0;
        notifyListeners();
        break;
      case 'notification':
        final n = AppNotification.fromJson(msg['notification'] as Map<String, dynamic>);
        notifications = [n, ...notifications.where((x) => x.id != n.id)].take(_maxItems).toList();
        unreadCount = (msg['unreadCount'] as num?)?.toInt() ?? unreadCount;
        notifyListeners();
        onIncoming?.call(n);
        break;
      case 'notifications_removed':
        final ids = (msg['ids'] as List? ?? []).cast<String>().toSet();
        notifications = notifications.where((n) => !ids.contains(n.id)).toList();
        unreadCount = (msg['unreadCount'] as num?)?.toInt() ?? unreadCount;
        notifyListeners();
        break;
    }
  }

  // ── Действия ──────────────────────────────────────────────────────────────

  void togglePanel() {
    panelOpen = !panelOpen;
    notifyListeners();
    // Открытие панели гасит непрочитанные — как в вебе.
    if (panelOpen && unreadCount > 0) markAllRead();
  }

  void closePanel() {
    if (!panelOpen) return;
    panelOpen = false;
    notifyListeners();
  }

  Future<void> markAllRead() async {
    if (unreadCount == 0) return;
    // Оптимистично гасим бейдж, затем синхронизируем счётчик с сервером.
    unreadCount = 0;
    notifications = notifications.map((n) => n.copyWith(read: true)).toList();
    notifyListeners();
    try {
      unreadCount = await _api.markRead();
      notifyListeners();
    } catch (_) {
      // Следующий снапшот восстановит счётчик.
    }
  }

  /// Убрать уведомление (крестик, либо после отыгранного действия).
  Future<void> dismiss(String id) async {
    notifications = notifications.where((n) => n.id != id).toList();
    notifyListeners();
    try {
      unreadCount = await _api.dismiss(id);
      notifyListeners();
    } catch (_) {
      // Следующий снапшот восстановит состояние.
    }
  }

  // ── Заявки в друзья прямо из панели ───────────────────────────────────────

  /// id уведомлений, по которым сейчас выполняется принять/отклонить — чтобы
  /// не жать дважды и показать блокировку кнопок.
  final Set<String> busy = {};

  /// Принять (accept=true) или отклонить заявку от автора уведомления. Заявку
  /// ищем по актуальному списку с сервера: локального списка заявок у
  /// колокольчика нет, а уведомление хранит только автора.
  Future<void> respondToFriendRequest(AppNotification n, {required bool accept}) async {
    final actorId = n.actor?.id;
    if (actorId == null || busy.contains(n.id)) return;
    busy.add(n.id);
    notifyListeners();
    try {
      final requests = await _friendsApi.listRequests();
      for (final r in requests) {
        if (!r.isIncoming || r.user.id != actorId) continue;
        if (accept) {
          await _friendsApi.accept(r.id);
        } else {
          await _friendsApi.decline(r.id);
        }
        break;
      }
      // Заявка отыграна — сервер сам пришлёт notifications_removed, но убираем
      // сразу, чтобы кнопки не висели.
      await dismiss(n.id);
    } catch (_) {
      // Молча: список заявок на вкладке «Друзья» покажет актуальное состояние.
    } finally {
      busy.remove(n.id);
      notifyListeners();
    }
  }
}
