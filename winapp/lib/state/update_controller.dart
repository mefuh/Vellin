import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../runtime/update_checker.dart';
import '../runtime/updater_splash.dart';

/// Сценарий апдейтера на старте клиента (окно-сплэш до входа в приложение).
///
/// Обновления **принудительные**: найденную версию апдейтер ставит сам, не
/// спрашивая пользователя. Выбора «Позже» больше нет — единственная кнопка
/// появляется при ошибке и повторяет попытку.
///
/// Порядок: проверка идёт параллельно с интро-анимацией, но применяется только
/// после [introDone] — иначе анимация оборвалась бы на середине.
class UpdateController extends ChangeNotifier {
  final ApiClient _client;
  UpdateController(this._client);

  SplashPhase _phase = SplashPhase.checking;
  double? _progress;
  bool _fadingOut = false;
  bool _done = false;

  final Completer<void> _intro = Completer<void>();

  /// Текущая фаза для сплэша.
  SplashPhase get phase => _phase;

  /// Прогресс загрузки 0..1; null — бегущий индикатор.
  double? get progress => _progress;

  /// Идёт затухание перед запуском приложения.
  bool get fadingOut => _fadingOut;

  /// Сценарий завершён — можно показывать приложение.
  bool get done => _done;

  /// Вызывается сплэшем, когда интро доиграло (~2,15 c).
  void introDone() {
    if (!_intro.isCompleted) _intro.complete();
  }

  void _set(SplashPhase phase, {double? progress}) {
    _phase = phase;
    _progress = progress;
    notifyListeners();
  }

  /// Полный сценарий: проверка → (загрузка → установка) → запуск приложения.
  Future<void> run() async {
    _set(SplashPhase.checking);
    try {
      // Сеть работает во время интро, чтобы не терять время впустую.
      final info = await checkForUpdate(_client);
      await _intro.future;

      if (info != null) {
        _set(SplashPhase.downloading, progress: 0);
        final path = await downloadInstaller(info, (p) {
          _progress = p;
          notifyListeners();
        });

        _set(SplashPhase.installing);
        // Даём увидеть фазу установки, прежде чем окно исчезнет.
        await Future<void>.delayed(const Duration(milliseconds: 700));
        // Установщик молча заменяет файлы и сам перезапускает клиент.
        await Process.start(path, ['--silent'], mode: ProcessStartMode.detached);
        exit(0);
      }

      _set(SplashPhase.ready);
      await Future<void>.delayed(const Duration(milliseconds: 500));
      _fadingOut = true;
      notifyListeners();
      await Future<void>.delayed(kSplashFadeOut + const Duration(milliseconds: 20));
      _done = true;
      notifyListeners();
    } catch (_) {
      _set(SplashPhase.error);
    }
  }

  /// Кнопка «Повторить» в состоянии ошибки.
  void retry() {
    if (_phase != SplashPhase.error) return;
    // Интро уже доиграло — новый сценарий не должен его ждать.
    if (!_intro.isCompleted) _intro.complete();
    run();
  }
}
