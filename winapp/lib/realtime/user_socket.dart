import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../app_config.dart';

/// Пользовательский realtime-канал `/ws/user` (личные сообщения, presence,
/// уведомления). Подключается по короткоживущему тикету (GET /auth/realtime-
/// ticket), сам переподключается с backoff, отвечает pong на server ping.
///
/// Входящие S2C-сообщения отдаются как decoded Map через [messages]; исходящие
/// C2S — через [send].
class UserSocket {
  final Future<String?> Function() _getTicket;
  UserSocket(this._getTicket);

  WebSocketChannel? _ch;
  StreamSubscription? _sub;
  final _controller = StreamController<Map<String, dynamic>>.broadcast();
  bool _closed = false;
  int _backoffMs = 1000;

  /// Поток декодированных входящих сообщений сервера.
  Stream<Map<String, dynamic>> get messages => _controller.stream;

  Future<void> connect() async {
    _closed = false;
    await _open();
  }

  Future<void> _open() async {
    if (_closed) return;
    final ticket = await _getTicket();
    if (ticket == null) {
      _scheduleReconnect();
      return;
    }
    try {
      final uri = Uri.parse('${AppConfig.userWsUrl}?ticket=${Uri.encodeQueryComponent(ticket)}');
      final ch = WebSocketChannel.connect(uri);
      await ch.ready;
      _ch = ch;
      _backoffMs = 1000;
      _sub = ch.stream.listen(
        _onData,
        onDone: _onDone,
        onError: (_) => _onDone(),
        cancelOnError: true,
      );
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void _onData(dynamic raw) {
    Map<String, dynamic> msg;
    try {
      msg = jsonDecode(raw as String) as Map<String, dynamic>;
    } catch (_) {
      return;
    }
    // Keep-alive: сервер шлёт ping — отвечаем pong.
    if (msg['t'] == 'ping') {
      send({'t': 'pong', 'serverTs': msg['serverTs']});
      return;
    }
    _controller.add(msg);
  }

  void _onDone() {
    _sub?.cancel();
    _sub = null;
    _ch = null;
    _scheduleReconnect();
  }

  void _scheduleReconnect() {
    if (_closed) return;
    final delay = Duration(milliseconds: _backoffMs);
    _backoffMs = (_backoffMs * 2).clamp(1000, 30000);
    Timer(delay, _open);
  }

  void send(Map<String, dynamic> msg) {
    try {
      _ch?.sink.add(jsonEncode(msg));
    } catch (_) {}
  }

  Future<void> dispose() async {
    _closed = true;
    await _sub?.cancel();
    await _ch?.sink.close();
    await _controller.close();
  }
}
