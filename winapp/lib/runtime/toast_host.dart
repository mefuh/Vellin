import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:window_manager/window_manager.dart';

import '../app_config.dart';
import '../models/notification.dart';
import 'notification_router.dart';

/// Показ фирменных всплывающих уведомлений (см. toast_window.dart).
///
/// Тост живёт в отдельном процессе того же exe, потому что у Flutter на
/// Windows одно окно на процесс. Здесь — сторона приложения: поднимает
/// локальный сокет, запускает процесс-тостер, шлёт ему уведомления и слушает
/// клики.
///
/// Тостер запускается лениво — при первом уведомлении, и дальше живёт до конца
/// сессии: окно у него создано заранее и скрыто, поэтому показ мгновенный.
class ToastHost {
  ServerSocket? _server;
  Socket? _client;
  Process? _process;
  Completer<void>? _ready;

  /// Показанные тосты — чтобы клик знал, куда вести.
  final _shown = <String, AppNotification>{};

  /// Показать уведомление, если главное окно сейчас не в фокусе: при активном
  /// окне пользователю достаточно колокольчика.
  Future<void> show(AppNotification n) async {
    try {
      if (await windowManager.isFocused()) return;
    } catch (_) {
      // Не смогли узнать состояние окна — лучше показать, чем потерять.
    }
    if (!await _ensureToaster()) return;
    _shown[n.id] = n;
    _send({
      'cmd': 'show',
      'id': n.id,
      'title': n.toastTitle,
      'body': n.toastBody,
      'avatarUrl': AppConfig.mediaUrl(n.actor?.avatarUrl),
      'avatarSeed': n.actor?.avatarSeed ?? '',
    });
  }

  /// Завершить тостер (выход из аккаунта, закрытие приложения).
  Future<void> stop() async {
    _send({'cmd': 'quit'});
    _shown.clear();
    _ready = null;
    try {
      await _client?.close();
    } catch (_) {}
    _client = null;
    try {
      await _server?.close();
    } catch (_) {}
    _server = null;
    _process?.kill();
    _process = null;
  }

  /// Гарантирует живой процесс-тостер с установленным соединением.
  Future<bool> _ensureToaster() async {
    if (_client != null) return true;
    final pending = _ready;
    if (pending != null) {
      // Тостер уже поднимается — дождёмся его.
      try {
        await pending.future;
        return _client != null;
      } catch (_) {
        return false;
      }
    }

    final ready = Completer<void>();
    _ready = ready;
    try {
      final server = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
      _server = server;
      server.listen((socket) {
        _client = socket;
        socket
            .cast<List<int>>()
            .transform(utf8.decoder)
            .transform(const LineSplitter())
            .listen(_onLine, onDone: _onDisconnect, onError: (_) => _onDisconnect());
        if (!ready.isCompleted) ready.complete();
      });

      _process = await Process.start(
        Platform.resolvedExecutable,
        ['--toast', '${server.port}'],
        // detached: у тостера нет консоли, и никто не читает его поток вывода —
        // с наследованием stdio он бы рано или поздно на нём заблокировался.
        mode: ProcessStartMode.detached,
      );
      // Процесс мог не стартовать (антивирус, права) — не ждём вечно.
      await ready.future.timeout(const Duration(seconds: 20));
      return _client != null;
    } catch (_) {
      // Тостер не поднялся — уведомление остаётся в колокольчике.
      if (!ready.isCompleted) ready.completeError(Exception('toaster failed'));
      _ready = null;
      _process?.kill();
      _process = null;
      try {
      await _server?.close();
    } catch (_) {}
      _server = null;
      return false;
    }
  }

  void _onDisconnect() {
    _client = null;
    _ready = null;
    _process = null;
    // Следующее уведомление поднимет тостер заново.
  }

  void _onLine(String line) {
    Map<String, dynamic> msg;
    try {
      msg = jsonDecode(line) as Map<String, dynamic>;
    } catch (_) {
      return;
    }
    if (msg['event'] == 'click') {
      final n = _shown.remove(msg['id']);
      restoreWindow();
      if (n != null) openNotification(n);
    }
  }

  void _send(Map<String, dynamic> msg) {
    try {
      _client?.write('${jsonEncode(msg)}\n');
    } catch (_) {}
  }
}
