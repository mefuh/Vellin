import 'dart:io';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:window_manager/window_manager.dart';
import '../models/notification.dart';
import 'notification_router.dart';

/// Системные уведомления Windows (тосты в центре уведомлений).
///
/// Показываются только когда окно не в фокусе: если пользователь и так смотрит
/// в приложение, ему хватает колокольчика. Клик по тосту разворачивает окно и
/// открывает то же, что клик по уведомлению в панели.
///
/// Регистрацию приложения в системе (AppUserModelId в HKCU) плагин делает сам
/// при initialize — установленный ярлык в меню «Пуск» для этого не нужен.
class DesktopNotifier {
  /// Идентификатор приложения для центра уведомлений Windows
  /// (CompanyName.ProductName.SubProduct.VersionInformation).
  static const _aumid = 'Vellin.Desktop.Client.1';

  /// GUID COM-активатора: по нему Windows возвращает клик по тосту в приложение.
  /// Менять нельзя — иначе старые тосты перестанут открывать приложение.
  static const _guid = '4f1c9a2e-8b53-4d7a-9f16-2c0e5b7d3a48';

  final _plugin = FlutterLocalNotificationsPlugin();
  bool _ready = false;

  /// Сквозной id тоста: у Windows он нужен для замены/отзыва уведомления.
  int _nextId = 1;

  /// Уведомления по id тоста — чтобы клик знал, куда вести.
  final _pending = <String, AppNotification>{};

  Future<void> init() async {
    if (!Platform.isWindows) return;
    try {
      await _plugin.initialize(
        settings: InitializationSettings(
          windows: WindowsInitializationSettings(
            appName: 'Vellin',
            appUserModelId: _aumid,
            guid: _guid,
            iconPath: await _iconPath(),
          ),
        ),
        onDidReceiveNotificationResponse: _onTap,
      );
      _ready = true;
    } catch (_) {
      // Без системных уведомлений приложение работает как раньше — остаётся
      // колокольчик. Молча выключаемся, чтобы не ронять старт.
      _ready = false;
    }
  }

  /// Показать тост, если окно сейчас не в фокусе.
  Future<void> show(AppNotification n) async {
    if (!_ready) return;
    try {
      if (await windowManager.isFocused()) return;
    } catch (_) {
      // Не смогли узнать состояние окна — лучше показать, чем потерять.
    }
    final id = _nextId++;
    _pending[n.id] = n;
    try {
      await _plugin.show(
        id: id,
        title: n.toastTitle,
        body: n.toastBody,
        notificationDetails: const NotificationDetails(windows: WindowsNotificationDetails()),
        payload: n.id,
      );
    } catch (_) {
      _pending.remove(n.id);
    }
  }

  void _onTap(NotificationResponse response) {
    final n = _pending.remove(response.payload);
    restoreWindow();
    if (n != null) openNotification(n);
  }

  /// Иконка для тоста: файл на диске рядом с данными приложения. Ассет
  /// вкомпилирован в exe, поэтому один раз выкладываем его в %APPDATA%.
  Future<String?> _iconPath() async {
    try {
      final appData = Platform.environment['APPDATA'];
      if (appData == null) return null;
      final dir = Directory('$appData\\Vellin');
      if (!dir.existsSync()) dir.createSync(recursive: true);
      final file = File('${dir.path}\\notification_icon.png');
      if (!file.existsSync()) {
        final bytes = await rootBundle.load('assets/vellin_icon.png');
        await file.writeAsBytes(bytes.buffer.asUint8List(), flush: true);
      }
      return file.path;
    } catch (_) {
      return null; // Без иконки тост всё равно показывается.
    }
  }
}
