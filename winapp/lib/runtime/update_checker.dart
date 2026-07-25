import 'dart:io';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../api/api_client.dart';
import '../app_config.dart';
import '../theme/vellin_theme.dart';

/// Информация о доступном обновлении Windows-клиента (из /api/config).
class UpdateInfo {
  final String version;
  final String url;
  final bool mandatory;
  const UpdateInfo({required this.version, required this.url, required this.mandatory});
}

/// Сравнение semver `a` vs `b`: -1/0/1 (пре-релизные суффиксы игнорируются).
int compareSemver(String a, String b) {
  List<int> parse(String v) => v.trim().split('-').first.split('.').map((x) => int.tryParse(x) ?? 0).toList();
  final pa = parse(a), pb = parse(b);
  for (var i = 0; i < 3; i++) {
    final d = (i < pa.length ? pa[i] : 0) - (i < pb.length ? pb[i] : 0);
    if (d != 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/// Проверяет `/api/config` на наличие более новой версии Windows-клиента.
/// Возвращает null, если обновления нет или проверка не удалась.
Future<UpdateInfo?> checkForUpdate(ApiClient client) async {
  try {
    final j = await client.get('/config') as Map<String, dynamic>;
    final w = (j['update'] as Map<String, dynamic>?)?['windows'] as Map<String, dynamic>?;
    if (w == null) return null;
    final latest = w['latestVersion'] as String?;
    final url = w['url'] as String?;
    if (latest == null || url == null) return null;
    if (compareSemver(latest, AppConfig.appVersion) <= 0) return null; // не новее
    return UpdateInfo(version: latest, url: url, mandatory: w['mandatory'] as bool? ?? false);
  } catch (_) {
    return null;
  }
}

/// Показывает диалог обновления. Для обязательного (mandatory) — без «Позже».
void showUpdateDialog(BuildContext context, UpdateInfo info) {
  showDialog<void>(
    context: context,
    barrierDismissible: !info.mandatory,
    builder: (_) => _UpdateDialog(info: info),
  );
}

class _UpdateDialog extends StatefulWidget {
  final UpdateInfo info;
  const _UpdateDialog({required this.info});
  @override
  State<_UpdateDialog> createState() => _UpdateDialogState();
}

class _UpdateDialogState extends State<_UpdateDialog> {
  bool _downloading = false;
  double _progress = 0;
  String? _error;

  Future<void> _update() async {
    setState(() {
      _downloading = true;
      _error = null;
    });
    try {
      final path = await _download(widget.info.url, (p) {
        if (mounted) setState(() => _progress = p);
      });
      // Запускаем установщик тихо и закрываемся, чтобы он заменил файлы.
      await Process.start(path, ['--silent'], mode: ProcessStartMode.detached);
      exit(0);
    } catch (e) {
      if (mounted) {
        setState(() {
          _downloading = false;
          _error = 'Не удалось загрузить обновление';
        });
      }
    }
  }

  Future<String> _download(String url, void Function(double) onProgress) async {
    final req = http.Request('GET', Uri.parse(url));
    final res = await req.send();
    final total = res.contentLength ?? 0;
    final bytes = <int>[];
    var received = 0;
    await for (final chunk in res.stream) {
      bytes.addAll(chunk);
      received += chunk.length;
      if (total > 0) onProgress(received / total);
    }
    final path = '${Directory.systemTemp.path}${Platform.pathSeparator}Vellin-Setup-${widget.info.version}.exe';
    await File(path).writeAsBytes(bytes);
    return path;
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: VellinColors.bg1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(VellinRadius.xl)),
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Доступно обновление ${widget.info.version}',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: VellinColors.text0)),
          const SizedBox(height: 10),
          Text(
            widget.info.mandatory
                ? 'Для продолжения работы нужно обновить Vellin.'
                : 'Вышла новая версия Vellin. Обновиться сейчас?',
            style: const TextStyle(fontSize: 14, color: VellinColors.text1, height: 1.4),
          ),
          if (_downloading) ...[
            const SizedBox(height: 20),
            LinearProgressIndicator(
              value: _progress > 0 ? _progress : null,
              backgroundColor: VellinColors.bg3,
              color: VellinColors.accentHi,
            ),
            const SizedBox(height: 8),
            Text('Загрузка… ${(_progress * 100).round()}%', style: const TextStyle(fontSize: 12, color: VellinColors.text2)),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(fontSize: 13, color: VellinColors.accentHi)),
          ],
          const SizedBox(height: 22),
          Row(mainAxisAlignment: MainAxisAlignment.end, children: [
            if (!widget.info.mandatory && !_downloading)
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                style: TextButton.styleFrom(foregroundColor: VellinColors.text1),
                child: const Text('Позже'),
              ),
            const SizedBox(width: 8),
            FilledButton(
              onPressed: _downloading ? null : _update,
              style: FilledButton.styleFrom(backgroundColor: VellinColors.accent, foregroundColor: Colors.white),
              child: Text(_downloading ? 'Загрузка…' : 'Обновить'),
            ),
          ]),
        ]),
      ),
    );
  }
}
