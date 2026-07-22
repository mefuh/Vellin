import 'dart:io';
import 'package:bitsdojo_window/bitsdojo_window.dart';
import 'package:flutter/material.dart';
import 'installer_engine.dart';
import 'vellin_theme.dart';

void main(List<String> args) async {
  WidgetsFlutterBinding.ensureInitialized();

  // Тихая установка (для автообновления): без окна, только распаковка.
  if (args.contains('--silent')) {
    final engine = InstallerEngine();
    await for (final _ in engine.install()) {}
    exit(0);
  }

  runApp(const InstallerApp());
  doWhenWindowReady(() {
    const win = Size(560, 460);
    appWindow.minSize = win;
    appWindow.maxSize = win;
    appWindow.size = win;
    appWindow.alignment = Alignment.center;
    appWindow.title = 'Установка Vellin';
    appWindow.show();
  });
}

class InstallerApp extends StatelessWidget {
  const InstallerApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: buildVellinTheme(),
      home: const _InstallerScreen(),
    );
  }
}

enum _Stage { idle, installing, done, error }

class _InstallerScreen extends StatefulWidget {
  const _InstallerScreen();
  @override
  State<_InstallerScreen> createState() => _InstallerScreenState();
}

class _InstallerScreenState extends State<_InstallerScreen> {
  final _engine = InstallerEngine();
  _Stage _stage = _Stage.idle;
  double _progress = 0;
  String _status = '';

  Future<void> _install() async {
    setState(() {
      _stage = _Stage.installing;
      _progress = 0;
    });
    try {
      await for (final p in _engine.install()) {
        if (mounted) {
          setState(() {
            _progress = p.fraction;
            _status = p.status;
          });
        }
      }
      if (mounted) setState(() => _stage = _Stage.done);
    } catch (e) {
      if (mounted) {
        setState(() {
          _stage = _Stage.error;
          _status = '$e';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: VellinColors.bg0,
      body: Column(children: [
        _titleBar(),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(40, 8, 40, 32),
            child: Column(
              children: [
                const SizedBox(height: 8),
                Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: const [BoxShadow(color: VellinColors.accentGlow, blurRadius: 40, spreadRadius: -6)],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(20),
                    child: Image.asset('assets/vellin_icon.png', width: 84, height: 84),
                  ),
                ),
                const SizedBox(height: 20),
                const Text('Vellin для Windows',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: VellinColors.text0, letterSpacing: -0.4)),
                const SizedBox(height: 6),
                const Text('Совместный просмотр видео в реальном времени',
                    textAlign: TextAlign.center, style: TextStyle(fontSize: 13.5, color: VellinColors.text2)),
                const Spacer(),
                _body(),
              ],
            ),
          ),
        ),
      ]),
    );
  }

  Widget _titleBar() {
    return SizedBox(
      height: 40,
      child: Row(children: [
        Expanded(child: MoveWindow()),
        _WinButton(icon: Icons.close, onTap: () => appWindow.close()),
      ]),
    );
  }

  Widget _body() {
    switch (_stage) {
      case _Stage.idle:
        return Column(children: [
          Text('Приложение будет установлено в\n${InstallerEngine.targetDir}',
              textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, color: VellinColors.text3, height: 1.4)),
          const SizedBox(height: 18),
          _primaryButton('Установить', _install),
        ]);
      case _Stage.installing:
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: _progress > 0 ? _progress : null,
              minHeight: 6,
              backgroundColor: VellinColors.bg3,
              color: VellinColors.accentHi,
            ),
          ),
          const SizedBox(height: 12),
          Text(_status, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12.5, color: VellinColors.text2)),
        ]);
      case _Stage.done:
        return Column(children: [
          const Icon(Icons.check_circle, color: VellinColors.ok, size: 30),
          const SizedBox(height: 8),
          const Text('Установка завершена', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: VellinColors.text0)),
          const SizedBox(height: 18),
          Row(children: [
            Expanded(child: _secondaryButton('Закрыть', () => appWindow.close())),
            const SizedBox(width: 10),
            Expanded(child: _primaryButton('Запустить', () async {
              await _engine.launchApp();
              appWindow.close();
            })),
          ]),
        ]);
      case _Stage.error:
        return Column(children: [
          const Icon(Icons.error_outline, color: VellinColors.accentHi, size: 28),
          const SizedBox(height: 8),
          Text('Не удалось установить\n$_status',
              textAlign: TextAlign.center, style: const TextStyle(fontSize: 12.5, color: VellinColors.text2)),
          const SizedBox(height: 16),
          _primaryButton('Повторить', _install),
        ]);
    }
  }

  Widget _primaryButton(String label, VoidCallback onTap) => SizedBox(
        height: 46,
        width: double.infinity,
        child: FilledButton(
          onPressed: onTap,
          style: FilledButton.styleFrom(
            backgroundColor: VellinColors.accent,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(VellinRadius.md)),
            textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          ),
          child: Text(label),
        ),
      );

  Widget _secondaryButton(String label, VoidCallback onTap) => SizedBox(
        height: 46,
        child: FilledButton(
          onPressed: onTap,
          style: FilledButton.styleFrom(
            backgroundColor: VellinColors.bg3,
            foregroundColor: VellinColors.text0,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(VellinRadius.md)),
            textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          ),
          child: Text(label),
        ),
      );
}

class _WinButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  const _WinButton({required this.icon, required this.onTap});
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: SizedBox(width: 46, height: 40, child: Icon(icon, size: 18, color: VellinColors.text2)),
    );
  }
}
