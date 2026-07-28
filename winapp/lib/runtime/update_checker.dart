import 'dart:io';
import 'package:http/http.dart' as http;
import '../api/api_client.dart';
import '../app_config.dart';

/// Информация о доступном обновлении Windows-клиента (из /api/config).
///
/// Флага «необязательное» здесь нет намеренно: все обновления клиента
/// принудительные — апдейтер не спрашивает, а сразу ставит найденную версию.
class UpdateInfo {
  final String version;
  final String url;
  const UpdateInfo({required this.version, required this.url});
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
    return UpdateInfo(version: latest, url: url);
  } catch (_) {
    return null;
  }
}

/// Качает установщик во временную папку, отдавая прогресс 0..1.
/// Возвращает путь к скачанному файлу; бросает исключение при ошибке сети.
Future<String> downloadInstaller(UpdateInfo info, void Function(double) onProgress) async {
  final res = await http.Request('GET', Uri.parse(info.url)).send();
  if (res.statusCode != 200) {
    throw HttpException('HTTP ${res.statusCode}', uri: Uri.parse(info.url));
  }
  final total = res.contentLength ?? 0;
  final bytes = <int>[];
  var received = 0;
  await for (final chunk in res.stream) {
    bytes.addAll(chunk);
    received += chunk.length;
    if (total > 0) onProgress(received / total);
  }
  final path = '${Directory.systemTemp.path}${Platform.pathSeparator}Vellin-Setup-${info.version}.exe';
  await File(path).writeAsBytes(bytes);
  return path;
}
