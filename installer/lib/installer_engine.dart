import 'dart:io';
import 'package:archive/archive.dart';
import 'package:flutter/services.dart' show rootBundle;

/// Версия устанавливаемого приложения (держать в синхроне с winapp/pubspec).
const installerAppVersion = '0.2.0';

/// Шаг установки: доля прогресса 0..1 + статусная строка.
class InstallProgress {
  final double fraction;
  final String status;
  const InstallProgress(this.fraction, this.status);
}

/// Движок установки Vellin: распаковка встроенного payload в
/// %LOCALAPPDATA%\Vellin (без прав администратора), ярлыки, запись деинсталля.
class InstallerEngine {
  static const appName = 'Vellin';
  static String get targetDir => '${Platform.environment['LOCALAPPDATA']}\\Vellin';
  static String get exePath => '$targetDir\\vellin_winapp.exe';

  static const _uninstallKey =
      r'HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Vellin';

  /// Полная установка. Прогресс — потоком.
  Stream<InstallProgress> install() async* {
    yield const InstallProgress(0.05, 'Подготовка…');
    // Закрываем запущенное приложение (установка поверх / обновление).
    try {
      await Process.run('taskkill', ['/IM', 'vellin_winapp.exe', '/F']);
    } catch (_) {}

    final data = await rootBundle.load('assets/payload.zip');
    yield const InstallProgress(0.15, 'Распаковка…');
    final archive = ZipDecoder().decodeBytes(data.buffer.asUint8List());

    final dir = Directory(targetDir);
    if (await dir.exists()) await dir.delete(recursive: true);
    await dir.create(recursive: true);

    final total = archive.isEmpty ? 1 : archive.length;
    var i = 0;
    for (final file in archive) {
      final outPath = '$targetDir\\${file.name.replaceAll('/', '\\')}';
      if (file.isFile) {
        final f = File(outPath);
        await f.parent.create(recursive: true);
        await f.writeAsBytes(file.content as List<int>);
      } else {
        await Directory(outPath).create(recursive: true);
      }
      i++;
      yield InstallProgress(0.15 + 0.65 * (i / total), 'Распаковка файлов…');
    }

    yield const InstallProgress(0.85, 'Создание ярлыков…');
    await _createShortcuts();
    yield const InstallProgress(0.95, 'Регистрация…');
    await _registerUninstall();
    await _writeUninstallScript();
    yield const InstallProgress(1.0, 'Готово');
  }

  Future<void> _createShortcuts() async {
    final startMenu =
        '${Platform.environment['APPDATA']}\\Microsoft\\Windows\\Start Menu\\Programs\\Vellin.lnk';
    final desktop = '${Platform.environment['USERPROFILE']}\\Desktop\\Vellin.lnk';
    for (final lnk in [startMenu, desktop]) {
      final ps =
          "\$s=(New-Object -ComObject WScript.Shell).CreateShortcut('$lnk'); "
          "\$s.TargetPath='$exePath'; \$s.WorkingDirectory='$targetDir'; "
          "\$s.IconLocation='$exePath'; \$s.Save()";
      await Process.run('powershell', ['-NoProfile', '-Command', ps]);
    }
  }

  Future<void> _registerUninstall() async {
    final uninstall =
        'powershell -NoProfile -ExecutionPolicy Bypass -File "$targetDir\\uninstall.ps1"';
    final values = <String, String>{
      'DisplayName': appName,
      'DisplayIcon': exePath,
      'DisplayVersion': installerAppVersion,
      'Publisher': 'Vellin',
      'InstallLocation': targetDir,
      'UninstallString': uninstall,
    };
    for (final e in values.entries) {
      await Process.run('reg', ['add', _uninstallKey, '/v', e.key, '/t', 'REG_SZ', '/d', e.value, '/f']);
    }
    await Process.run('reg', ['add', _uninstallKey, '/v', 'NoModify', '/t', 'REG_DWORD', '/d', '1', '/f']);
  }

  Future<void> _writeUninstallScript() async {
    final startMenu = r'$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Vellin.lnk';
    final desktop = r'$env:USERPROFILE\Desktop\Vellin.lnk';
    final script = '''
Stop-Process -Name vellin_winapp -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath "$startMenu" -ErrorAction SilentlyContinue
Remove-Item -LiteralPath "$desktop" -ErrorAction SilentlyContinue
reg delete "$_uninstallKey" /f
Start-Sleep -Milliseconds 300
Remove-Item -LiteralPath "$targetDir" -Recurse -Force -ErrorAction SilentlyContinue
''';
    await File('$targetDir\\uninstall.ps1').writeAsString(script);
  }

  Future<void> launchApp() async {
    await Process.start(exePath, const [], mode: ProcessStartMode.detached);
  }
}
