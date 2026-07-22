// Модели соцслоя (друзья, поиск), зеркалят типы `@vellin/shared` (domain.ts).

/// Публичная карточка пользователя (shared: PublicUser).
class PublicUser {
  final String id;
  final String publicId;
  final String username;
  final String avatarSeed;
  final String? avatarUrl;
  final String kind;

  const PublicUser({
    required this.id,
    required this.publicId,
    required this.username,
    required this.avatarSeed,
    required this.avatarUrl,
    required this.kind,
  });

  factory PublicUser.fromJson(Map<String, dynamic> j) => PublicUser(
        id: j['id'] as String? ?? '',
        publicId: j['publicId'] as String? ?? '',
        username: j['username'] as String? ?? '',
        avatarSeed: j['avatarSeed'] as String? ?? '',
        avatarUrl: j['avatarUrl'] as String?,
        kind: j['kind'] as String? ?? 'user',
      );
}

/// Друг (shared: FriendUser) — публичная карточка + статус сети.
class FriendUser {
  final PublicUser user;
  final String friendshipId;
  final bool online;
  final String? lastSeenAt;

  const FriendUser({
    required this.user,
    required this.friendshipId,
    required this.online,
    required this.lastSeenAt,
  });

  factory FriendUser.fromJson(Map<String, dynamic> j) => FriendUser(
        user: PublicUser.fromJson(j),
        friendshipId: j['friendshipId'] as String? ?? '',
        online: j['online'] as bool? ?? false,
        lastSeenAt: j['lastSeenAt'] as String?,
      );
}

/// Заявка в друзья (shared: FriendRequest).
class FriendRequest {
  final String id;
  final String direction; // 'incoming' | 'outgoing'
  final PublicUser user;
  final String createdAt;

  const FriendRequest({
    required this.id,
    required this.direction,
    required this.user,
    required this.createdAt,
  });

  factory FriendRequest.fromJson(Map<String, dynamic> j) {
    final u = j['user'];
    return FriendRequest(
      id: j['id'] as String? ?? '',
      direction: j['direction'] as String? ?? 'incoming',
      user: u is Map<String, dynamic>
          ? PublicUser.fromJson(u)
          : const PublicUser(id: '', publicId: '', username: '', avatarSeed: '', avatarUrl: null, kind: 'user'),
      createdAt: j['createdAt'] as String? ?? '',
    );
  }

  bool get isIncoming => direction == 'incoming';
}

/// Результат поиска (shared: PublicProfile, нужное подмножество).
/// relationship: 'none'|'friends'|'incoming'|'outgoing'|'blocked'|'self'.
class SearchUser {
  final PublicUser user;
  final String relationship;
  final bool online;

  const SearchUser({required this.user, required this.relationship, required this.online});

  factory SearchUser.fromJson(Map<String, dynamic> j) => SearchUser(
        user: PublicUser.fromJson(j),
        relationship: j['relationship'] as String? ?? 'none',
        online: j['online'] as bool? ?? false,
      );
}
