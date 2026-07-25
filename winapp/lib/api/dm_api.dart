import '../models/dm.dart';
import 'api_client.dart';

/// REST-часть ЛС: список диалогов, тред, тикет realtime-канала. Сама отправка
/// сообщений идёт по WebSocket (см. UserSocket / DmController).
class DmApi {
  final ApiClient _c;
  DmApi(this._c);

  /// Короткоживущий тикет для подключения к /ws/user.
  Future<String?> realtimeTicket() async {
    final j = await _c.get('/auth/realtime-ticket') as Map<String, dynamic>;
    return j['ticket'] as String?;
  }

  Future<({List<DmConversation> conversations, int unreadTotal})> conversations() async {
    final j = await _c.get('/dm/conversations') as Map<String, dynamic>;
    return (
      conversations: (j['conversations'] as List? ?? [])
          .map((e) => DmConversation.fromJson(e as Map<String, dynamic>))
          .toList(),
      unreadTotal: (j['unreadTotal'] as num?)?.toInt() ?? 0,
    );
  }

  /// Тред переписки с пользователем по publicId (before — ISO для пагинации).
  Future<ConversationThread> thread(String publicId, {String? before}) async {
    final q = before != null ? '?before=${Uri.encodeQueryComponent(before)}' : '';
    final j = await _c.get('/dm/with/$publicId$q') as Map<String, dynamic>;
    return ConversationThread.fromJson(j);
  }

  /// Загрузить изображение для ЛС (multipart). Возвращает url + размеры для
  /// последующей отправки по WS (dm_send с imageUrl).
  Future<({String url, int width, int height})> uploadImage(String filePath) async {
    final j = await _c.uploadFile('/dm/image', 'file', filePath) as Map<String, dynamic>;
    return (
      url: j['url'] as String,
      width: (j['width'] as num?)?.toInt() ?? 0,
      height: (j['height'] as num?)?.toInt() ?? 0,
    );
  }

  /// Загрузить голосовое (multipart). Возвращает url для dm_send с voiceUrl.
  Future<String> uploadVoice(String filePath) async {
    final j = await _c.uploadFile('/dm/voice', 'file', filePath) as Map<String, dynamic>;
    return j['url'] as String;
  }

  /// Загрузить сырое видео-кружок (multipart). Возвращает uploadId; сервер
  /// транскодирует в mp4 в фоне после dm_send (videoUploadId).
  Future<String> uploadVideoNote(String filePath) async {
    final j = await _c.uploadFile('/dm/video-note', 'file', filePath) as Map<String, dynamic>;
    return j['uploadId'] as String;
  }
}
