import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart' show MediaType;
import '../app_config.dart';

/// Ошибка API с HTTP-статусом и сообщением из тела `{error,message,statusCode}`.
class ApiException implements Exception {
  final int status;
  final String error;
  final String message;
  const ApiException(this.status, this.error, this.message);
  @override
  String toString() => message;
}

/// Сигнал «нужно обновить приложение» (HTTP 426 от версионного гейтинга).
class UpgradeRequiredException extends ApiException {
  final String minVersion;
  const UpgradeRequiredException(this.minVersion, String message)
      : super(426, 'UpgradeRequired', message);
}

/// HTTP-клиент к бэкенду Vellin. Единая точка: базовый URL, заголовки
/// платформы/версии (X-App-*), Bearer-токен, разбор ошибок и 426.
class ApiClient {
  String? Function() _tokenGetter = () => null;
  void Function(String minVersion)? _onUpgradeRequired;

  void setTokenGetter(String? Function() fn) => _tokenGetter = fn;
  void setUpgradeRequiredHandler(void Function(String) fn) => _onUpgradeRequired = fn;

  Map<String, String> _headers({bool json = false}) {
    final h = <String, String>{
      'x-app-platform': AppConfig.platform,
      'x-app-version': AppConfig.appVersion,
    };
    if (json) h['content-type'] = 'application/json';
    final token = _tokenGetter();
    if (token != null) h['authorization'] = 'Bearer $token';
    return h;
  }

  Uri _uri(String path) => Uri.parse('${AppConfig.apiBase}$path');

  dynamic _decode(http.Response res) {
    final body = res.body.isNotEmpty ? jsonDecode(res.body) : null;
    if (res.statusCode >= 200 && res.statusCode < 300) return body;
    final map = body is Map<String, dynamic> ? body : <String, dynamic>{};
    final message = (map['message'] as String?) ?? res.reasonPhrase ?? 'Ошибка';
    if (res.statusCode == 426) {
      final min = (map['minVersion'] as String?) ?? '';
      _onUpgradeRequired?.call(min);
      throw UpgradeRequiredException(min, message);
    }
    throw ApiException(res.statusCode, (map['error'] as String?) ?? 'Error', message);
  }

  Future<dynamic> get(String path) async =>
      _decode(await http.get(_uri(path), headers: _headers()));

  Future<dynamic> post(String path, [Object? body]) async => _decode(
        await http.post(_uri(path), headers: _headers(json: true), body: jsonEncode(body ?? {})),
      );

  Future<dynamic> patch(String path, [Object? body]) async => _decode(
        await http.patch(_uri(path), headers: _headers(json: true), body: jsonEncode(body ?? {})),
      );

  Future<dynamic> delete(String path) async =>
      _decode(await http.delete(_uri(path), headers: _headers()));

  /// content-type части файла по расширению. Без него MultipartFile шлёт
  /// application/octet-stream, и сервер отклоняет загрузку (принимает только
  /// image/jpeg|png|webp).
  static MediaType? _mediaTypeFor(String filePath) {
    final ext = filePath.contains('.') ? filePath.split('.').last.toLowerCase() : '';
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return MediaType('image', 'jpeg');
      case 'png':
        return MediaType('image', 'png');
      case 'webp':
        return MediaType('image', 'webp');
      case 'wav':
        return MediaType('audio', 'wav');
      case 'm4a':
        return MediaType('audio', 'mp4');
      case 'webm':
        return MediaType('audio', 'webm');
      case 'ogg':
        return MediaType('audio', 'ogg');
      case 'mp3':
        return MediaType('audio', 'mpeg');
      default:
        return null;
    }
  }

  /// Multipart-загрузка файла (аватар, картинка ЛС).
  Future<dynamic> uploadFile(String path, String field, String filePath) async {
    final req = http.MultipartRequest('POST', _uri(path))
      ..headers.addAll(_headers())
      ..files.add(await http.MultipartFile.fromPath(field, filePath, contentType: _mediaTypeFor(filePath)));
    final streamed = await req.send();
    return _decode(await http.Response.fromStream(streamed));
  }
}
