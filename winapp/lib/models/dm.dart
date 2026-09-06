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

  /// Голосовое прослушано получателем — точка рядом с таймером.
  final bool voicePlayed;
  final String? videoStatus;
  final String? videoUrl;
  final String? videoThumbUrl;
  final int? videoDurationSec;
  final String? inviteRoomId;

  /// Запись о звонке. Наличие [callId] делает сообщение записью о звонке;
  /// отправителем всегда числится звонящий, поэтому «исходящий» и «входящий»
  /// выводятся из того, моё ли это сообщение, без отдельного поля.
  final String? callId;
  /// 'audio' | 'video'.
  final String? callKind;
  /// 'completed' | 'missed' | 'declined' | 'cancelled' | 'failed'.
  final String? callOutcome;
  final int? callDurationSec;

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
    this.voicePlayed = false,
    this.videoStatus,
    this.videoUrl,
    this.videoThumbUrl,
    this.videoDurationSec,
    this.inviteRoomId,
    this.callId,
    this.callKind,
    this.callOutcome,
    this.callDurationSec,
    this.nonce,
    this.pending = false,
  });

  /// Сообщение — запись о звонке, а не переписка.
  bool get isCallRecord => callId != null && callId!.isNotEmpty;

  /// Копия с изменённой отметкой «прослушано»: остальные поля сообщения после
  /// отправки не меняются, поэтому общего copyWith на все поля не нужно.
  DirectMessage copyWith({bool? voicePlayed}) => DirectMessage(
        id: id,
        conversationId: conversationId,
        senderId: senderId,
        body: body,
        createdAt: createdAt,
        imageUrl: imageUrl,
        imageWidth: imageWidth,
        imageHeight: imageHeight,
        voiceUrl: voiceUrl,
        voiceDurationSec: voiceDurationSec,
        voicePeaks: voicePeaks,
        voicePlayed: voicePlayed ?? this.voicePlayed,
        videoStatus: videoStatus,
        videoUrl: videoUrl,
        videoThumbUrl: videoThumbUrl,
        videoDurationSec: videoDurationSec,
        inviteRoomId: inviteRoomId,
        callId: callId,
        callKind: callKind,
        callOutcome: callOutcome,
        callDurationSec: callDurationSec,
        nonce: nonce,
        pending: pending,
      );

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
        voicePlayed: j['voicePlayed'] as bool? ?? false,
        videoStatus: j['videoStatus'] as String?,
        videoUrl: j['videoUrl'] as String?,
        videoThumbUrl: j['videoThumbUrl'] as String?,
        videoDurationSec: (j['videoDurationSec'] as num?)?.toInt(),
        inviteRoomId: j['inviteRoomId'] as String?,
        callId: j['callId'] as String?,
        callKind: j['callKind'] as String?,
        callOutcome: j['callOutcome'] as String?,
        callDurationSec: (j['callDurationSec'] as num?)?.toInt(),
        nonce: j['nonce'] as String?,
      );

  bool get hasAttachment =>
      imageUrl != null || voiceUrl != null || videoStatus != null || inviteRoomId != null || isCallRecord;

  /// Текст для превью/бабла с учётом вложений (текст может быть пустым).
  String get previewText {
    if (body.isNotEmpty) return body;
    if (imageUrl != null) return '📷 Изображение';
    if (voiceUrl != null) return '🎤 Голосовое';
    if (videoStatus != null) return '⭕ Видеосообщение';
    if (inviteRoomId != null) return '🎬 Приглашение в комнату';
    if (isCallRecord) {
      return callOutcome == 'missed'
          ? '📞 Пропущенный звонок'
          : callKind == 'video'
              ? '📹 Видеозвонок'
              : '📞 Звонок';
    }
    return '';
  }
}

/// Чем была последняя реплика в диалоге. Список рисует перед превью глиф,
/// а не эмодзи: эмодзи приходят из системного шрифта и в тёмном интерфейсе
/// с обводочными иконками выглядят наклейками.
enum DmPreviewKind { text, image, voice, video, invite, call, callMissed }

/// Диалог в списке (shared: DmConversation).
class DmConversation {
  final String id;
  final PublicUser peer;
  final String? lastBody;
  final DmPreviewKind lastKind;
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
    this.lastKind = DmPreviewKind.text,
  });

  factory DmConversation.fromJson(Map<String, dynamic> j) {
    final last = j['lastMessage'] as Map<String, dynamic>?;
    String? preview;
    var kind = DmPreviewKind.text;
    if (last != null) {
      final body = last['body'] as String? ?? '';
      if (body.isNotEmpty) {
        preview = body;
      } else if (last['hasImage'] == true) {
        preview = 'Изображение';
        kind = DmPreviewKind.image;
      } else if (last['hasVoice'] == true) {
        preview = 'Голосовое';
        kind = DmPreviewKind.voice;
      } else if (last['hasVideo'] == true) {
        preview = 'Видеосообщение';
        kind = DmPreviewKind.video;
      } else if (last['hasRoomInvite'] == true) {
        preview = 'Приглашение в комнату';
        kind = DmPreviewKind.invite;
      } else if (last['hasCall'] == true) {
        final missed = last['callOutcome'] == 'missed';
        preview = missed ? 'Пропущенный звонок' : 'Звонок';
        kind = missed ? DmPreviewKind.callMissed : DmPreviewKind.call;
      }
    }
    return DmConversation(
      id: j['id'] as String? ?? '',
      peer: PublicUser.fromJson(j['peer'] as Map<String, dynamic>),
      lastBody: preview,
      lastKind: kind,
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

  /// До какого момента собеседник прочитал переписку (ISO). По нему в ленте
  /// проставляются галочки «прочитано» у своих сообщений.
  final String? peerLastReadAt;

  const ConversationThread({
    required this.conversationId,
    required this.peer,
    required this.messages,
    required this.hasMore,
    required this.online,
    this.peerLastReadAt,
  });

  factory ConversationThread.fromJson(Map<String, dynamic> j) => ConversationThread(
        conversationId: j['conversationId'] as String? ?? '',
        peer: PublicUser.fromJson(j['peer'] as Map<String, dynamic>),
        messages: (j['messages'] as List? ?? [])
            .map((e) => DirectMessage.fromJson(e as Map<String, dynamic>))
            .toList(),
        hasMore: j['hasMore'] as bool? ?? false,
        online: j['online'] as bool? ?? false,
        peerLastReadAt: j['peerLastReadAt'] as String?,
      );
}
