import 'dart:io';

import 'package:shared_preferences/shared_preferences.dart';

/// Единая точка доступа к локальным настройкам.
///
/// `SharedPreferences` на Windows — это один JSON-файл в каталоге приложения.
/// Жёсткая перезагрузка посреди записи оставляет его нечитаемым (нужная длина
/// есть, содержимого нет), и тогда `getInstance()` падает. Раньше это ломало
/// вход: сессия не читалась, а сохранить новую не удавалось, и пользователь
/// видел «Не удалось войти. Проверьте подключение» при живом сервере.
///
/// Поэтому битый файл сносится и заводится заново: настройки этого компьютера
/// восстановимы, а возможность войти — нет.
Future<SharedPreferences> openPrefs() async {
  try {
    return await SharedPreferences.getInstance();
  } catch (_) {
    await _dropBrokenStore();
    return SharedPreferences.getInstance();
  }
}

/// Удалить повреждённый файл настроек. Путь тот же, что использует плагин:
/// `%APPDATA%\<company>\<app>\shared_preferences.json`, где company и app
/// заданы в `windows/runner/Runner.rc`.
Future<void> _dropBrokenStore() async {
  final appData = Platform.environment['APPDATA'];
  if (appData == null) return;
  final file = File(
    '$appData${Platform.pathSeparator}ru.vellin${Platform.pathSeparator}'
    'vellin_winapp${Platform.pathSeparator}shared_preferences.json',
  );
  try {
    if (await file.exists()) await file.delete();
  } catch (_) {
    // Не удалось снести — дальше попытка чтения всё равно бросит, и вызывающий
    // код отработает как при пустых настройках.
  }
}
