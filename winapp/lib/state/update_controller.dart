import 'package:flutter/foundation.dart';
import '../api/api_client.dart';
import '../runtime/update_checker.dart';

/// Состояние проверки обновления на старте (gate в стиле Discord).
///
/// Проверка идёт ПАРАЛЛЕЛЬНО с восстановлением сессии и завершается всегда
/// (внутри [checkForUpdate] есть таймаут). Роутер держит сплэш, пока
/// `!ready`, а при `pending != null` показывает экран обновления ДО входа в
/// приложение. «Позже» → [skip] пропускает дальше.
class UpdateController extends ChangeNotifier {
  final ApiClient _client;
  UpdateController(this._client);

  bool _ready = false;
  UpdateInfo? _pending;

  /// Проверка завершена (успешно, с ошибкой или по таймауту).
  bool get ready => _ready;

  /// Найденное обновление, которое ещё не отложено пользователем.
  UpdateInfo? get pending => _pending;

  /// Запустить проверку один раз на старте.
  Future<void> check() async {
    if (_ready) return;
    _pending = await checkForUpdate(_client);
    _ready = true;
    notifyListeners();
  }

  /// Пользователь нажал «Позже» — пропускаем в приложение (для этой сессии).
  void skip() {
    if (_pending == null) return;
    _pending = null;
    notifyListeners();
  }
}
