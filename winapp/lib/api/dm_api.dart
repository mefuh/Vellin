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
}
