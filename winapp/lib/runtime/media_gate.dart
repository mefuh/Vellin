import 'package:flutter/foundation.dart';

/// Кто сейчас держит микрофон и камеру.
///
/// На Windows устройство захвата занимается монопольно: `record` (голосовые),
/// `camera_windows` (кружки) и WebRTC берут те же микрофон и камеру. Две записи
/// одновременно кончаются не ошибкой, а тишиной в одной из них — поэтому
/// доступ разводится здесь, а не проверками на местах.
///
/// Правило простое: звонок главнее. Он приходит извне и ждать не может, а
/// запись голосового пользователь начал сам и может повторить.
class MediaGate extends ChangeNotifier {
  MediaGate._();
  static final MediaGate instance = MediaGate._();

  bool _callHoldsDevices = false;

  /// Как прервать текущую запись. Регистрирует тот, кто пишет.
  Future<void> Function()? _cancelRecording;

  /// Звонок занял устройства — записывать нельзя.
  bool get callHoldsDevices => _callHoldsDevices;

  /// Идёт запись голосового или кружка.
  bool get recording => _cancelRecording != null;

  /// Заявить о начале записи и получить способ её снять. Возвращает false,
  /// если устройства заняты звонком.
  bool beginRecording(Future<void> Function() cancel) {
    if (_callHoldsDevices) return false;
    _cancelRecording = cancel;
    notifyListeners();
    return true;
  }

  void endRecording() {
    if (_cancelRecording == null) return;
    _cancelRecording = null;
    notifyListeners();
  }

  /// Отдать устройства звонку, прервав запись, если она идёт.
  Future<void> acquireForCall() async {
    _callHoldsDevices = true;
    final cancel = _cancelRecording;
    _cancelRecording = null;
    notifyListeners();
    if (cancel != null) {
      try {
        await cancel();
      } catch (_) {
        // Запись всё равно считаем снятой: держать устройства ей больше нечем.
      }
    }
  }

  /// Звонок закончился — устройства свободны.
  void releaseFromCall() {
    if (!_callHoldsDevices) return;
    _callHoldsDevices = false;
    notifyListeners();
  }
}
