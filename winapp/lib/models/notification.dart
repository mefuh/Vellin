// Модель уведомления, зеркалит `@vellin/shared` (domain.ts: AppNotification).

import 'social.dart';

/// Тип уведомления (shared: NotificationType). Строкой, а не enum: сервер может
/// добавить новый тип раньше клиента — неизвестный не должен ломать разбор.
class NotificationTypes {
  static const friendRequest = 'friend_request';
  static const friendAccepted = 'friend_accepted';
  static const roomInvite = 'room_invite';
  static const directMessage = 'direct_message';
}

/// Уведомление в колокольчике. `actor` — кто инициировал (может отсутствовать,
/// если пользователь удалён).
class AppNotification {
  final String id;
  final String type;
  final PublicUser? actor;

  /// Контекст: для room_invite — куда зовут; для direct_message — превью и
  /// счётчик непрочитанных в диалоге.
  final String? roomSlug;
  final String? roomName;
  final String? conversationId;
  final String? preview;
  final int? count;

  final bool read;
  final String createdAt;

  const AppNotification({
    required this.id,
    required this.type,
    required this.actor,
    required this.roomSlug,
    required this.roomName,
    required this.conversationId,
    required this.preview,
    required this.count,
    required this.read,
    required this.createdAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> j) {
    final actor = j['actor'];
    final data = j['data'] is Map<String, dynamic> ? j['data'] as Map<String, dynamic> : const <String, dynamic>{};
    return AppNotification(
      id: j['id'] as String? ?? '',
      type: j['type'] as String? ?? '',
      actor: actor is Map<String, dynamic> ? PublicUser.fromJson(actor) : null,
      roomSlug: data['roomSlug'] as String?,
      roomName: data['roomName'] as String?,
      conversationId: data['conversationId'] as String?,
      preview: data['preview'] as String?,
      count: (data['count'] as num?)?.toInt(),
      read: j['read'] as bool? ?? false,
      createdAt: j['createdAt'] as String? ?? '',
    );
  }

  AppNotification copyWith({bool? read}) => AppNotification(
        id: id,
        type: type,
        actor: actor,
        roomSlug: roomSlug,
        roomName: roomName,
        conversationId: conversationId,
        preview: preview,
        count: count,
        read: read ?? this.read,
        createdAt: createdAt,
      );

  /// Заголовок для системного тоста Windows.
  String get toastTitle => actor?.username ?? 'Vellin';

  /// Текст уведомления одной строкой — и для панели, и для тоста.
  String get text {
    final name = actor?.username ?? 'Кто-то';
    switch (type) {
      case NotificationTypes.friendRequest:
        return '$name хочет добавить вас в друзья';
      case NotificationTypes.friendAccepted:
        return '$name принял вашу заявку в друзья';
      case NotificationTypes.roomInvite:
        return '$name приглашает в «${roomName ?? 'комнату'}»';
      case NotificationTypes.directMessage:
        final n = count ?? 1;
        final head = n > 1 ? '$name прислал $n новых сообщения' : '$name прислал вам сообщение';
        return preview != null && preview!.isNotEmpty ? '$head: «$preview»' : head;
      default:
        return name;
    }
  }

  /// Текст без имени отправителя — для тоста, где имя уже в заголовке.
  String get toastBody {
    switch (type) {
      case NotificationTypes.friendRequest:
        return 'Хочет добавить вас в друзья';
      case NotificationTypes.friendAccepted:
        return 'Принял вашу заявку в друзья';
      case NotificationTypes.roomInvite:
        return 'Приглашает в «${roomName ?? 'комнату'}»';
      case NotificationTypes.directMessage:
        if (preview != null && preview!.isNotEmpty) return preview!;
        final n = count ?? 1;
        return n > 1 ? '$n новых сообщения' : 'Новое сообщение';
      default:
        return text;
    }
  }
}
