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
/// Возвращает null, если обновления нет или проверка не удалась/зависла.
///
/// Таймаут обязателен: проверка стоит на старте (gate) перед входом в
/// приложение, и без ограничения по времени медленная сеть/оффлайн подвесили
/// бы запуск. При любой ошибке/таймауте — null (пускаем в приложение).
Future<UpdateInfo?> checkForUpdate(ApiClient client) async {
  try {
    final j = await client.get('/config').timeout(const Duration(seconds: 4)) as Map<String, dynamic>;
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

/// Полноэкранный gate обновления (в стиле Discord): показывается ДО входа в
/// приложение, если найдено обновление. Не императивный диалог — отдельный
/// маршрут, поэтому его не сносит редирект роутера.
///
/// «Обновить» — качает установщик, запускает его `--silent` и закрывает
/// приложение. «Позже» (только для необязательного обновления) — [onSkip],
/// пропускает в приложение.
class UpdateScreen extends StatefulWidget {
  final UpdateInfo info;
  final VoidCallback onSkip;
  const UpdateScreen({super.key, required this.info, required this.onSkip});

  @override
  State<UpdateScreen> createState() => _UpdateScreenState();
}

class _UpdateScreenState extends State<UpdateScreen> {
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
    final info = widget.info;
    return Scaffold(
      backgroundColor: VellinColors.bg0,
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.center, children: [
              // Брендовый бейдж: красный скруглённый квадрат с белой «V».
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(color: VellinColors.accent, borderRadius: BorderRadius.circular(16)),
                alignment: Alignment.center,
                child: const Text('V',
                    style: TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w800, height: 1)),
              ),
              const SizedBox(height: 22),
              Text('Доступно обновление ${info.version}',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: VellinColors.text0, letterSpacing: -0.4)),
              const SizedBox(height: 10),
              Text(
                _downloading
                    ? 'Устанавливаем обновление. Приложение перезапустится автоматически.'
                    : info.mandatory
                        ? 'Для продолжения работы нужно обновить Vellin.'
                        : 'Вышла новая версия Vellin. Обновиться сейчас?',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 14, color: VellinColors.text1, height: 1.5),
              ),
              if (_downloading) ...[
                const SizedBox(height: 24),
                ClipRRect(
                  borderRadius: BorderRadius.circular(999),
                  child: LinearProgressIndicator(
                    value: _progress > 0 ? _progress : null,
                    minHeight: 6,
                    backgroundColor: VellinColors.bg3,
                    color: VellinColors.accentHi,
                  ),
                ),
                const SizedBox(height: 8),
                Text('Загрузка… ${(_progress * 100).round()}%',
                    style: const TextStyle(fontSize: 12, color: VellinColors.text2)),
              ],
              if (_error != null) ...[
                const SizedBox(height: 14),
                Text(_error!, textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, color: VellinColors.accentHi)),
              ],
              const SizedBox(height: 26),
              Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                if (!info.mandatory && !_downloading) ...[
                  TextButton(
                    onPressed: widget.onSkip,
                    style: TextButton.styleFrom(
                      foregroundColor: VellinColors.text1,
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                    ),
                    child: const Text('Позже'),
                  ),
                  const SizedBox(width: 10),
                ],
                SizedBox(
                  height: 46,
                  child: FilledButton(
                    onPressed: _downloading ? null : _update,
                    style: FilledButton.styleFrom(
                      backgroundColor: VellinColors.accent,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 28),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(VellinRadius.md)),
                      textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                    ),
                    child: Text(_downloading ? 'Загрузка…' : 'Обновить'),
                  ),
                ),
              ]),
            ]),
          ),
        ),
      ),
    );
  }
}
