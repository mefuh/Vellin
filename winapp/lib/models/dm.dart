// Модели личных сообщений, зеркалят типы `@vellin/shared` (domain.ts/api.ts).
import 'social.dart';

/// Что за сообщение — для цитаты ответа и полосы закрепа (shared: DirectMessageKind).
enum DmKind { text, image, voice, video, invite, call }

DmKind _kindFrom(String? v) => switch (v) {
      'image' => DmKind.image,
      'voice' => DmKind.voice,
      'video' => DmKind.video,
      'invite' => DmKind.invite,
      'call' => DmKind.call,
      _ => DmKind.text,
    };

/// Подпись вложения без текста: в цитате и закрепе глиф стоит отдельно.
String dmKindLabel(DmKind kind) => switch (kind) {
      DmKind.image => 'Изображение',
      DmKind.voice => 'Голосовое сообщение',
      DmKind.video => 'Видеосообщение',
      DmKind.invite => 'Приглашение в комнату',
      DmKind.call => 'Звонок',
      DmKind.text => '',
    };

/// Снимок сообщения (shared: DirectMessageImage).
class DmImage {
  final String url;
  final int width;
  final int height;

  /// Файл на этом компьютере — у снимка, который ещё загружается. Пока он
  /// есть, снимок рисуется с диска: так превью видно сразу и не мигает, когда
  /// придёт ссылка с сервера.
  final String? localPath;

  const DmImage({required this.url, this.width = 0, this.height = 0, this.localPath});

  factory DmImage.fromJson(Map<String, dynamic> j) => DmImage(
        url: j['url'] as String? ?? '',
        width: (j['width'] as num?)?.toInt() ?? 0,
        height: (j['height'] as num?)?.toInt() ?? 0,
      );

  DmImage withLocal(String? path) => DmImage(url: url, width: width, height: height, localPath: path);
}

/// Реакция одного участника (shared: DirectMessageReactionDTO).
class DmReaction {
  final String userId;
  final String emoji;
  const DmReaction({required this.userId, required this.emoji});

  factory DmReaction.fromJson(Map<String, dynamic> j) =>
      DmReaction(userId: j['userId'] as String? ?? '', emoji: j['emoji'] as String? ?? '');
}

/// Ссылка на сообщение в цитате ответа (shared: DirectMessageReplyRef).
class DmReplyRef {
  final String id;

  /// Оригинал удалён для всех: цитата остаётся, содержимого нет.
  final bool deleted;
  final String? senderId;
  final DmKind kind;
  final String body;

  const DmReplyRef({
    required this.id,
    this.deleted = false,
    this.senderId,
    this.kind = DmKind.text,
    this.body = '',
  });

  factory DmReplyRef.fromJson(Map<String, dynamic> j) => DmReplyRef(
        id: j['id'] as String? ?? '',
        deleted: j['deleted'] as bool? ?? false,
        senderId: j['senderId'] as String?,
        kind: _kindFrom(j['kind'] as String?),
        body: j['body'] as String? ?? '',
      );

  /// Ссылка на загруженное сообщение — для оптимистичной отправки ответа.
  factory DmReplyRef.of(DirectMessage m) =>
      DmReplyRef(id: m.id, senderId: m.senderId, kind: m.kind, body: m.body);

  /// Текст цитаты: начало реплики либо подпись вложения.
  String get preview {
    if (deleted) return 'Сообщение удалено';
    if (body.isNotEmpty) return body;
    return dmKindLabel(kind);
  }
}

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

  /// Все снимки сообщения по порядку: у альбома — до 10, у одиночного — один.
  final List<DmImage> images;
  final String? voiceUrl;
  final int? voiceDurationSec;
  final List<int>? voicePeaks;

  /// Голосовое прослушано получателем — точка рядом с таймером.
  final bool voicePlayed;
  final String? videoStatus;
  final String? videoUrl;
  final String? videoThumbUrl;
  final int? videoDurationSec;

  /// Посмотрен ли кружок получателем — точка «просмотрено» у автора.
  final bool videoPlayed;
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

  /// Цитата сообщения, на которое это — ответ.
  final DmReplyRef? replyTo;

  /// Пересланное: имя автора оригинала. Null — написано отправителем.
  final String? forwardedFromName;

  /// Когда текст последний раз меняли (ISO). Null — не менялся.
  final String? editedAt;

  /// Когда получатель прочитал именно это сообщение (ISO).
  final String? readAt;

  /// Когда голосовое или кружок впервые прослушали (ISO).
  final String? playedAt;

  /// Реакции участников — не больше одной на человека, по порядку постановки.
  final List<DmReaction> reactions;

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
    this.images = const [],
    this.voiceUrl,
    this.voiceDurationSec,
    this.voicePeaks,
    this.voicePlayed = false,
    this.videoStatus,
    this.videoUrl,
    this.videoThumbUrl,
    this.videoDurationSec,
    this.videoPlayed = false,
    this.inviteRoomId,
    this.callId,
    this.callKind,
    this.callOutcome,
    this.callDurationSec,
    this.replyTo,
    this.forwardedFromName,
    this.editedAt,
    this.readAt,
    this.playedAt,
    this.reactions = const [],
    this.nonce,
    this.pending = false,
  });

  /// Моя реакция на это сообщение, если есть.
  String? reactionOf(String userId) {
    for (final r in reactions) {
      if (r.userId == userId) return r.emoji;
    }
    return null;
  }

  /// Сообщение — запись о звонке, а не переписка.
  bool get isCallRecord => callId != null && callId!.isNotEmpty;

  DmKind get kind {
    if (isCallRecord) return DmKind.call;
    if (inviteRoomId != null) return DmKind.invite;
    if (videoStatus != null) return DmKind.video;
    if (voiceUrl != null) return DmKind.voice;
    if (imageUrl != null) return DmKind.image;
    return DmKind.text;
  }

  bool get isForwarded => forwardedFromName != null;

  /// Текст можно править: у голосовых и кружков нечего, приглашение и звонок —
  /// не реплики, а пересланное — чужие слова.
  bool get isEditable =>
      !pending && voiceUrl == null && videoStatus == null && inviteRoomId == null && !isCallRecord && !isForwarded;

  /// Пересылается всё, что можно показать у другого человека: звонок и
  /// приглашение привязаны к этой паре, недотранскодированный кружок — пустой.
  bool get isForwardable =>
      !pending && !isCallRecord && inviteRoomId == null && (videoStatus == null || videoStatus == 'ready');

  static const _keep = Object();

  /// Копия с изменёнными полями. Для nullable-полей [_keep] значит «оставить»,
  /// а явный null — «очистить».
  DirectMessage copyWith({
    String? body,
    bool? voicePlayed,
    bool? videoPlayed,
    Object? replyTo = _keep,
    Object? editedAt = _keep,
    Object? readAt = _keep,
    Object? playedAt = _keep,
    List<DmReaction>? reactions,
    List<DmImage>? images,
  }) =>
      DirectMessage(
        id: id,
        conversationId: conversationId,
        senderId: senderId,
        body: body ?? this.body,
        createdAt: createdAt,
        imageUrl: imageUrl,
        imageWidth: imageWidth,
        imageHeight: imageHeight,
        images: images ?? this.images,
        voiceUrl: voiceUrl,
        voiceDurationSec: voiceDurationSec,
        voicePeaks: voicePeaks,
        voicePlayed: voicePlayed ?? this.voicePlayed,
        videoStatus: videoStatus,
        videoUrl: videoUrl,
        videoThumbUrl: videoThumbUrl,
        videoDurationSec: videoDurationSec,
        videoPlayed: videoPlayed ?? this.videoPlayed,
        inviteRoomId: inviteRoomId,
        callId: callId,
        callKind: callKind,
        callOutcome: callOutcome,
        callDurationSec: callDurationSec,
        replyTo: identical(replyTo, _keep) ? this.replyTo : replyTo as DmReplyRef?,
        forwardedFromName: forwardedFromName,
        editedAt: identical(editedAt, _keep) ? this.editedAt : editedAt as String?,
        readAt: identical(readAt, _keep) ? this.readAt : readAt as String?,
        playedAt: identical(playedAt, _keep) ? this.playedAt : playedAt as String?,
        reactions: reactions ?? this.reactions,
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
        images: _imagesFrom(j),
        voiceUrl: j['voiceUrl'] as String?,
        voiceDurationSec: (j['voiceDurationSec'] as num?)?.toInt(),
        voicePeaks: (j['voicePeaks'] as List?)?.map((e) => (e as num).toInt()).toList(),
        voicePlayed: j['voicePlayed'] as bool? ?? false,
        videoStatus: j['videoStatus'] as String?,
        videoUrl: j['videoUrl'] as String?,
        videoThumbUrl: j['videoThumbUrl'] as String?,
        videoDurationSec: (j['videoDurationSec'] as num?)?.toInt(),
        videoPlayed: j['videoPlayed'] as bool? ?? false,
        inviteRoomId: j['inviteRoomId'] as String?,
        callId: j['callId'] as String?,
        callKind: j['callKind'] as String?,
        callOutcome: j['callOutcome'] as String?,
        callDurationSec: (j['callDurationSec'] as num?)?.toInt(),
        replyTo: j['replyTo'] is Map<String, dynamic>
            ? DmReplyRef.fromJson(j['replyTo'] as Map<String, dynamic>)
            : null,
        forwardedFromName: (j['forwardedFrom'] as Map<String, dynamic>?)?['name'] as String?,
        editedAt: j['editedAt'] as String?,
        readAt: j['readAt'] as String?,
        playedAt: j['playedAt'] as String?,
        reactions: (j['reactions'] as List? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(DmReaction.fromJson)
            .toList(),
        nonce: j['nonce'] as String?,
      );

  /// Альбом — список из сервера; одиночный снимок — из старых полей.
  static List<DmImage> _imagesFrom(Map<String, dynamic> j) {
    final list = (j['images'] as List? ?? const []).whereType<Map<String, dynamic>>().map(DmImage.fromJson).toList();
    if (list.isNotEmpty) return list;
    final url = j['imageUrl'] as String?;
    if (url == null) return const [];
    return [
      DmImage(
        url: url,
        width: (j['imageWidth'] as num?)?.toInt() ?? 0,
        height: (j['imageHeight'] as num?)?.toInt() ?? 0,
      ),
    ];
  }

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

  /// Уведомления этого диалога выключены мной: сообщения приходят как обычно,
  /// молчат колокольчик, звук и всплывающее окно.
  final bool muted;

  const DmConversation({
    required this.id,
    required this.peer,
    required this.lastBody,
    required this.lastSenderId,
    required this.unreadCount,
    required this.online,
    required this.lastMessageAt,
    this.lastKind = DmPreviewKind.text,
    this.muted = false,
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
      muted: j['muted'] as bool? ?? false,
    );
  }

  DmConversation copyWith({int? unreadCount, bool? muted}) => DmConversation(
        id: id,
        peer: peer,
        lastBody: lastBody,
        lastKind: lastKind,
        lastSenderId: lastSenderId,
        unreadCount: unreadCount ?? this.unreadCount,
        online: online,
        lastMessageAt: lastMessageAt,
        muted: muted ?? this.muted,
      );
}

/// Снимок в витрине вложений диалога (shared: DmMediaItem).
///
/// Единица витрины — картинка, а не сообщение: альбом из десяти фото даёт
/// десять плиток подряд.
class DmMediaItem {
  final String messageId;
  final String url;
  final int width;
  final int height;
  final String senderId;
  final String createdAt;

  const DmMediaItem({
    required this.messageId,
    required this.url,
    required this.width,
    required this.height,
    required this.senderId,
    required this.createdAt,
  });

  factory DmMediaItem.fromJson(Map<String, dynamic> j) => DmMediaItem(
        messageId: j['messageId'] as String? ?? '',
        url: j['url'] as String? ?? '',
        width: (j['width'] as num?)?.toInt() ?? 0,
        height: (j['height'] as num?)?.toInt() ?? 0,
        senderId: j['senderId'] as String? ?? '',
        createdAt: j['createdAt'] as String? ?? '',
      );
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

  /// Закреплённое в диалоге сообщение.
  final DirectMessage? pinned;

  /// Уведомления диалога выключены мной.
  final bool muted;

  const ConversationThread({
    required this.conversationId,
    required this.peer,
    required this.messages,
    required this.hasMore,
    required this.online,
    this.peerLastReadAt,
    this.pinned,
    this.muted = false,
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
        pinned: j['pinned'] is Map<String, dynamic>
            ? DirectMessage.fromJson(j['pinned'] as Map<String, dynamic>)
            : null,
        muted: j['muted'] as bool? ?? false,
      );
}
