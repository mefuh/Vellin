import 'dart:io';
import 'package:archive/archive.dart';
import 'package:flutter/services.dart' show rootBundle;

/// Версия устанавливаемого приложения (держать в синхроне с winapp/pubspec).
const installerAppVersion = '0.2.0';

/// Шаг установки: доля прогресса 0..1, статусная строка и текущий файл.
class InstallProgress {
  final double fraction;
  final String status;
  final String detail;
  const InstallProgress(this.fraction, this.status, [this.detail = '']);
}

/// Движок установки Vellin: распаковка встроенного payload в папку пользователя
/// (без прав администратора), ярлыки, автозапуск, запись деинсталлятора.
class InstallerEngine {
  static const appName = 'Vellin';

  /// Папка установки по умолчанию — внутри профиля пользователя, поэтому
  /// установка не требует прав администратора (в отличие от Program Files).
  static String get defaultTargetDir => '${Platform.environment['LOCALAPPDATA']}\\Vellin';

  /// Совместимость с прежним кодом (тихая установка).
  static String get targetDir => defaultTargetDir;
  static String get exePath => '$defaultTargetDir\\vellin_winapp.exe';

  static const _uninstallKey =
      r'HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Vellin';
  static const _runKey = r'HKCU\Software\Microsoft\Windows\CurrentVersion\Run';

  /// Полная установка. Прогресс — потоком.
  ///
  /// [dir] — папка установки (по умолчанию [defaultTargetDir]).
  /// [desktopShortcut] — создавать ли ярлык на рабочем столе.
  /// [autostart] — `true` добавить в автозапуск, `false` убрать,
  /// `null` не трогать (используется при тихом обновлении).
  Stream<InstallProgress> install({
    String? dir,
    bool desktopShortcut = true,
    bool? autostart,
  }) async* {
    final target = (dir == null || dir.trim().isEmpty) ? defaultTargetDir : dir.trim();
    final exe = '$target\\vellin_winapp.exe';

    yield const InstallProgress(0.05, 'Подготовка…', 'Проверка окружения');
    // Закрываем запущенное приложение (установка поверх / обновление).
    try {
      await Process.run('taskkill', ['/IM', 'vellin_winapp.exe', '/F']);
    } catch (_) {}

    final data = await rootBundle.load('assets/payload.zip');
    yield const InstallProgress(0.15, 'Распаковка…', 'Чтение пакета');
    final archive = ZipDecoder().decodeBytes(data.buffer.asUint8List());

    final directory = Directory(target);
    if (await directory.exists()) await directory.delete(recursive: true);
    await directory.create(recursive: true);

    final total = archive.isEmpty ? 1 : archive.length;
    var i = 0;
    for (final file in archive) {
      final outPath = '$target\\${file.name.replaceAll('/', '\\')}';
      if (file.isFile) {
        final f = File(outPath);
        await f.parent.create(recursive: true);
        await f.writeAsBytes(file.content as List<int>);
      } else {
        await Directory(outPath).create(recursive: true);
      }
      i++;
      yield InstallProgress(0.15 + 0.65 * (i / total), 'Установка Vellin…', outPath);
    }

    yield const InstallProgress(0.85, 'Создание ярлыков…', 'Ярлыки');
    await _createShortcuts(target, exe, desktop: desktopShortcut);

    if (autostart != null) {
      yield const InstallProgress(0.9, 'Настройка автозапуска…', 'Автозапуск');
      await _setAutostart(exe, autostart);
    }

    yield const InstallProgress(0.95, 'Завершение…', 'Регистрация приложения');
    await _registerUninstall(target, exe);
    await _writeUninstallScript(target);
    yield const InstallProgress(1.0, 'Готово', '');
  }

  Future<void> _createShortcuts(String target, String exe, {required bool desktop}) async {
    final startMenu =
        '${Platform.environment['APPDATA']}\\Microsoft\\Windows\\Start Menu\\Programs\\Vellin.lnk';
    final desktopLnk = '${Platform.environment['USERPROFILE']}\\Desktop\\Vellin.lnk';

    for (final lnk in [startMenu, if (desktop) desktopLnk]) {
      final ps = "\$s=(New-Object -ComObject WScript.Shell).CreateShortcut('$lnk'); "
          "\$s.TargetPath='$exe'; \$s.WorkingDirectory='$target'; "
          "\$s.IconLocation='$exe'; \$s.Save()";
      await Process.run('powershell', ['-NoProfile', '-Command', ps]);
    }
    // Пользователь снял галочку — убираем ранее созданный ярлык.
    if (!desktop) {
      try {
        final f = File(desktopLnk);
        if (await f.exists()) await f.delete();
      } catch (_) {}
    }
  }

  Future<void> _setAutostart(String exe, bool enabled) async {
    if (enabled) {
      await Process.run('reg', ['add', _runKey, '/v', appName, '/t', 'REG_SZ', '/d', '"$exe"', '/f']);
    } else {
      await Process.run('reg', ['delete', _runKey, '/v', appName, '/f']);
    }
  }

  Future<void> _registerUninstall(String target, String exe) async {
    final uninstall =
        'powershell -NoProfile -ExecutionPolicy Bypass -File "$target\\uninstall.ps1"';
    final values = <String, String>{
      'DisplayName': appName,
      'DisplayIcon': exe,
      'DisplayVersion': installerAppVersion,
      'Publisher': 'Vellin',
      'InstallLocation': target,
      'UninstallString': uninstall,
    };
    for (final e in values.entries) {
      await Process.run('reg', ['add', _uninstallKey, '/v', e.key, '/t', 'REG_SZ', '/d', e.value, '/f']);
    }
    await Process.run('reg', ['add', _uninstallKey, '/v', 'NoModify', '/t', 'REG_DWORD', '/d', '1', '/f']);
  }

  Future<void> _writeUninstallScript(String target) async {
    final startMenu = r'$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Vellin.lnk';
    final desktop = r'$env:USERPROFILE\Desktop\Vellin.lnk';
    final script = '''
Stop-Process -Name vellin_winapp -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath "$startMenu" -ErrorAction SilentlyContinue
Remove-Item -LiteralPath "$desktop" -ErrorAction SilentlyContinue
reg delete "$_runKey" /v $appName /f 2>\$null
reg delete "$_uninstallKey" /f
Start-Sleep -Milliseconds 300
Remove-Item -LiteralPath "$target" -Recurse -Force -ErrorAction SilentlyContinue
''';
    await File('$target\\uninstall.ps1').writeAsString(script);
  }

  /// Свободное место на диске, куда ставим (человекочитаемо). Пусто при ошибке.
  static Future<String> freeSpace(String dir) async {
    try {
      final drive = dir.length >= 2 && dir[1] == ':' ? dir.substring(0, 1) : 'C';
      final r = await Process.run('powershell', [
        '-NoProfile',
        '-Command',
        "(Get-PSDrive -Name $drive).Free",
      ]);
      final bytes = int.tryParse((r.stdout as String).trim());
      if (bytes == null) return '';
      const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
      var v = bytes.toDouble();
      var u = 0;
      while (v >= 1024 && u < units.length - 1) {
        v /= 1024;
        u++;
      }
      return '${v.toStringAsFixed(v >= 100 || u <= 1 ? 0 : 1)} ${units[u]}';
    } catch (_) {
      return '';
    }
  }

  Future<void> launchApp({String? dir}) async {
    final exe = '${dir ?? defaultTargetDir}\\vellin_winapp.exe';
    await Process.start(exe, const [], mode: ProcessStartMode.detached);
  }
}
