// Модели личных сообщений, зеркалят типы `@vellin/shared` (domain.ts/api.ts).
import 'social.dart';

/// Сообщение (shared: DirectMessageDTO — текстовое подмножество + маркеры вложений).
class DirectMessage {
  final String id;
  final String conversationId;
  final String senderId;
  final String body;
  final String createdAt;
  final String? imageUrl;
  final int? imageWidth;
  final int? imageHeight;
  final String? voiceUrl;
  final int? voiceDurationSec;
  final List<int>? voicePeaks;
  final String? videoStatus;
  final String? inviteRoomId;
  /// Эхо оптимистичной отправки (только у отправителя).
  final String? nonce;
  /// Локальный флаг «ещё отправляется» (оптимистичный бабл до эха с сервера).
  final bool pending;

  const DirectMessage({
    required this.id,
    required this.conversationId,
    required this.senderId,
    required this.body,
    required this.createdAt,
    this.imageUrl,
    this.imageWidth,
    this.imageHeight,
    this.voiceUrl,
    this.voiceDurationSec,
    this.voicePeaks,
    this.videoStatus,
    this.inviteRoomId,
    this.nonce,
    this.pending = false,
  });

  factory DirectMessage.fromJson(Map<String, dynamic> j) => DirectMessage(
        id: j['id'] as String? ?? '',
        conversationId: j['conversationId'] as String? ?? '',
        senderId: j['senderId'] as String? ?? '',
        body: j['body'] as String? ?? '',
        createdAt: j['createdAt'] as String? ?? '',
        imageUrl: j['imageUrl'] as String?,
        imageWidth: (j['imageWidth'] as num?)?.toInt(),
        imageHeight: (j['imageHeight'] as num?)?.toInt(),
        voiceUrl: j['voiceUrl'] as String?,
        voiceDurationSec: (j['voiceDurationSec'] as num?)?.toInt(),
        voicePeaks: (j['voicePeaks'] as List?)?.map((e) => (e as num).toInt()).toList(),
        videoStatus: j['videoStatus'] as String?,
        inviteRoomId: j['inviteRoomId'] as String?,
        nonce: j['nonce'] as String?,
      );

  bool get hasAttachment => imageUrl != null || voiceUrl != null || videoStatus != null || inviteRoomId != null;

  /// Текст для превью/бабла с учётом вложений (текст может быть пустым).
  String get previewText {
    if (body.isNotEmpty) return body;
    if (imageUrl != null) return '📷 Изображение';
    if (voiceUrl != null) return '🎤 Голосовое';
    if (videoStatus != null) return '⭕ Видеосообщение';
    if (inviteRoomId != null) return '🎬 Приглашение в комнату';
    return '';
  }
}

/// Диалог в списке (shared: DmConversation).
class DmConversation {
  final String id;
  final PublicUser peer;
  final String? lastBody;
  final String? lastSenderId;
  final int unreadCount;
  final bool online;
  final String lastMessageAt;

  const DmConversation({
    required this.id,
    required this.peer,
    required this.lastBody,
    required this.lastSenderId,
    required this.unreadCount,
    required this.online,
    required this.lastMessageAt,
  });

  factory DmConversation.fromJson(Map<String, dynamic> j) {
    final last = j['lastMessage'] as Map<String, dynamic>?;
    String? preview;
    if (last != null) {
      final body = last['body'] as String? ?? '';
      if (body.isNotEmpty) {
        preview = body;
      } else if (last['hasImage'] == true) {
        preview = '📷 Изображение';
      } else if (last['hasVoice'] == true) {
        preview = '🎤 Голосовое';
      } else if (last['hasVideo'] == true) {
        preview = '⭕ Видеосообщение';
      } else if (last['hasRoomInvite'] == true) {
        preview = '🎬 Приглашение';
      }
    }
    return DmConversation(
      id: j['id'] as String? ?? '',
      peer: PublicUser.fromJson(j['peer'] as Map<String, dynamic>),
      lastBody: preview,
      lastSenderId: last?['senderId'] as String?,
      unreadCount: (j['unreadCount'] as num?)?.toInt() ?? 0,
      online: j['online'] as bool? ?? false,
      lastMessageAt: j['lastMessageAt'] as String? ?? '',
    );
  }
}

/// Тред переписки (shared: ConversationThreadResponse).
class ConversationThread {
  final String conversationId;
  final PublicUser peer;
  final List<DirectMessage> messages;
  final bool hasMore;
  final bool online;

  const ConversationThread({
    required this.conversationId,
    required this.peer,
    required this.messages,
    required this.hasMore,
    required this.online,
  });

  factory ConversationThread.fromJson(Map<String, dynamic> j) => ConversationThread(
        conversationId: j['conversationId'] as String? ?? '',
        peer: PublicUser.fromJson(j['peer'] as Map<String, dynamic>),
        messages: (j['messages'] as List? ?? [])
            .map((e) => DirectMessage.fromJson(e as Map<String, dynamic>))
            .toList(),
        hasMore: j['hasMore'] as bool? ?? false,
        online: j['online'] as bool? ?? false,
      );
}
