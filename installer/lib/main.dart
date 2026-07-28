import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:window_manager/window_manager.dart';

import 'installer_engine.dart';
import 'installer_ui.dart';
import 'vellin_theme.dart';

void main(List<String> args) async {
  WidgetsFlutterBinding.ensureInitialized();

  // Тихая установка (для автообновления): без окна — распаковать и запустить
  // приложение. Автозапуск не трогаем (null), чтобы не сбросить выбор
  // пользователя, сделанный при первой установке.
  if (args.contains('--silent')) {
    final engine = InstallerEngine();
    await for (final _ in engine.install()) {}
    await engine.launchApp();
    exit(0);
  }

  await windowManager.ensureInitialized();
  // Безрамочное окно (заголовок/кнопки скрыты), показываем настроенным —
  // чтобы не мелькала стандартная рамка. Тот же подход, что у апдейтера.
  await windowManager.waitUntilReadyToShow(
    const WindowOptions(
      size: kInstallerSize,
      center: true,
      backgroundColor: Colors.transparent,
      titleBarStyle: TitleBarStyle.hidden,
      windowButtonVisibility: false,
    ),
    () async {
      await windowManager.setResizable(false);
      await windowManager.setMaximizable(false);
      await windowManager.setMinimizable(false);
      // Полностью убираем неклиентскую рамку (иначе сверху остаётся 1px кромка).
      await windowManager.setAsFrameless();
      await windowManager.setHasShadow(false);
      await windowManager.show();
      await windowManager.focus();
    },
  );
  // Вёрстка рассчитана на точные 720×500 клиентской области.
  await fitInstallerClientSize();

  runApp(const InstallerApp());
}

class InstallerApp extends StatelessWidget {
  const InstallerApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: buildVellinTheme(),
      // Крупное скругление рисуем сами: окно прозрачное, углы за радиусом —
      // прозрачные и сглаженные (системный DWM даёт лишь ~8px).
      home: ClipRRect(
        borderRadius: BorderRadius.circular(26),
        child: const _InstallerScreen(),
      ),
    );
  }
}

class _InstallerScreen extends StatefulWidget {
  const _InstallerScreen();
  @override
  State<_InstallerScreen> createState() => _InstallerScreenState();
}

class _InstallerScreenState extends State<_InstallerScreen> {
  final _engine = InstallerEngine();
  final _pathCtrl = TextEditingController(text: InstallerEngine.defaultTargetDir);

  InstallStep _step = InstallStep.welcome;
  double _progress = 0;
  String _status = 'Установка Vellin…';
  String _detail = '';
  String _error = '';
  String _diskFree = '';
  String _installedTo = InstallerEngine.defaultTargetDir;
  bool _fadingOut = false;

  @override
  void dispose() {
    _pathCtrl.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    // Свободное место считаем в фоне — диалог не должен ждать PowerShell.
    InstallerEngine.freeSpace(InstallerEngine.defaultTargetDir).then((v) {
      if (mounted && v.isNotEmpty) setState(() => _diskFree = v);
    });
  }

  Future<void> _install(String path, InstallOptions options) async {
    setState(() {
      _installedTo = path.isEmpty ? InstallerEngine.defaultTargetDir : path;
      _step = InstallStep.installing;
      _progress = 0;
      _detail = '';
      _error = '';
    });
    try {
      await for (final p in _engine.install(
        dir: _installedTo,
        desktopShortcut: options.shortcut,
        autostart: options.autostart,
      )) {
        if (!mounted) return;
        setState(() {
          _progress = p.fraction;
          _status = p.status;
          _detail = p.detail;
        });
      }
      if (mounted) setState(() => _step = InstallStep.done);
    } catch (e) {
      if (mounted) {
        setState(() {
          _step = InstallStep.error;
          _error = 'Не удалось записать файлы в $_installedTo. '
              'Проверьте права доступа и попробуйте снова.';
        });
      }
    }
  }

  Future<void> _launch() async {
    await _engine.launchApp(dir: _installedTo);
    setState(() => _fadingOut = true);
    await Future<void>.delayed(kInstallerFadeOut + const Duration(milliseconds: 20));
    exit(0);
  }

  Future<void> _browse(String current) async {
    final dir = await FilePicker.platform.getDirectoryPath(initialDirectory: current);
    if (dir != null && mounted) {
      // Пользователь выбирает родительскую папку — ставим в неё подпапку Vellin.
      final target = dir.endsWith('\\Vellin') ? dir : '$dir\\Vellin';
      _pathCtrl.text = target;
      final free = await InstallerEngine.freeSpace(target);
      if (mounted && free.isNotEmpty) setState(() => _diskFree = free);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: VellinColors.bg0,
      child: VellinInstallerUi(
        step: _step,
        version: installerAppVersion,
        pathController: _pathCtrl,
        progress: _progress,
        status: _status,
        detail: _detail,
        errorText: _error,
        diskFree: _diskFree,
        fadingOut: _fadingOut,
        onStep: (s) => setState(() => _step = s),
        onBrowse: _browse,
        onInstall: _install,
        onLaunch: _launch,
        onCancel: () => exit(0),
        onClose: () => exit(0),
        onRetry: () => setState(() => _step = InstallStep.options),
      ),
    );
  }
}
