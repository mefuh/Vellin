import 'dart:async';
import 'package:flutter/foundation.dart';
import '../realtime/user_socket.dart';

/// Живое присутствие пользователя (online + время последнего захода).
class PresenceInfo {
  final bool online;
  final String? lastSeenAt;
  const PresenceInfo({required this.online, required this.lastSeenAt});
}

/// Хранит presence всех пользователей, о которых сервер прислал данные:
/// друзей (снапшот в `hello` + широковещательные `presence`) и тех, на кого мы
/// подписаны точечно (`watch_presence` — например, открыт профиль/диалог).
/// Всё обновляется в реальном времени через пользовательский WS-канал.
class PresenceController extends ChangeNotifier {
  final UserSocket _socket;
  PresenceController(this._socket);

  StreamSubscription<Map<String, dynamic>>? _sub;
  final Map<String, PresenceInfo> _map = {};
  final Map<String, int> _watch = {}; // userId → счётчик подписок
  bool _started = false;

  void start() {
    if (_started) return;
    _started = true;
    _sub = _socket.messages.listen(_onMessage);
  }

  Future<void> stop() async {
    _started = false;
    await _sub?.cancel();
    _sub = null;
    _map.clear();
    _watch.clear();
  }

  PresenceInfo? of(String userId) => _map[userId];

  /// Сообщить серверу, активно ли приложение (свёрнуто/на фоне → офлайн).
  void setActive(bool active) => _socket.send({'t': 'activity', 'active': active});

  /// Подписаться на live-присутствие пользователя (открыт его профиль/диалог).
  void watch(String userId) {
    final n = (_watch[userId] ?? 0) + 1;
    _watch[userId] = n;
    if (n == 1) _socket.send({'t': 'watch_presence', 'userId': userId});
  }

  void unwatch(String userId) {
    final n = (_watch[userId] ?? 0) - 1;
    if (n <= 0) {
      _watch.remove(userId);
      _socket.send({'t': 'unwatch_presence', 'userId': userId});
    } else {
      _watch[userId] = n;
    }
  }

  void _onMessage(Map<String, dynamic> msg) {
    switch (msg['t']) {
      case 'hello':
        final list = msg['presence'] as List? ?? const [];
        for (final p in list) {
          _apply(p as Map<String, dynamic>);
        }
        // После (пере)подключения заново отправляем точечные подписки.
        for (final id in _watch.keys) {
          _socket.send({'t': 'watch_presence', 'userId': id});
        }
        notifyListeners();
        break;
      case 'presence':
        _apply(msg['presence'] as Map<String, dynamic>);
        notifyListeners();
        break;
    }
  }

  void _apply(Map<String, dynamic> p) {
    final id = p['userId'] as String?;
    if (id == null) return;
    _map[id] = PresenceInfo(
      online: p['online'] as bool? ?? false,
      lastSeenAt: p['lastSeenAt'] as String?,
    );
  }
}

/// Текст статуса присутствия. online → «в сети»; иначе — «был(а) в сети …»
/// (только что / N мин назад / сегодня|вчера в HH:MM / DD.MM.YYYY).
String presenceLabel({required bool online, String? lastSeenAt}) {
  if (online) return 'в сети';
  final t = lastSeenAt != null ? DateTime.tryParse(lastSeenAt)?.toLocal() : null;
  if (t == null) return 'не в сети';
  final now = DateTime.now();
  final diff = now.difference(t);
  if (diff.inSeconds < 60) return 'был(а) в сети только что';
  if (diff.inMinutes < 60) return 'был(а) в сети ${diff.inMinutes} мин назад';
  String hm(DateTime d) => '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
  final today = DateTime(now.year, now.month, now.day);
  final that = DateTime(t.year, t.month, t.day);
  final days = today.difference(that).inDays;
  if (days == 0) return 'был(а) в сети сегодня в ${hm(t)}';
  if (days == 1) return 'был(а) в сети вчера в ${hm(t)}';
  final dd = t.day.toString().padLeft(2, '0');
  final mm = t.month.toString().padLeft(2, '0');
  return 'был(а) в сети $dd.$mm.${t.year}';
}
