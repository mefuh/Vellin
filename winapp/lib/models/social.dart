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

/// Любимый фильм/сериал (shared: FavoriteTitle, подмножество для отображения).
class FavoriteTitle {
  final String title;
  final int? year;
  final String? posterUrl;
  const FavoriteTitle({required this.title, this.year, this.posterUrl});

  factory FavoriteTitle.fromJson(Map<String, dynamic> j) => FavoriteTitle(
        title: j['title'] as String? ?? '',
        year: (j['year'] as num?)?.toInt(),
        posterUrl: j['posterUrl'] as String?,
      );
}

/// Публичный профиль пользователя (shared: PublicProfile).
class PublicProfile {
  final PublicUser user;
  final String? bio;
  final String? gender;
  final String? birthDate;
  final String? city;
  final String createdAt;
  final bool online;
  final String? lastSeenAt;
  final String relationship;
  final String? friendshipId;
  final List<FavoriteTitle> favoriteTitles;

  const PublicProfile({
    required this.user,
    required this.bio,
    required this.gender,
    required this.birthDate,
    required this.city,
    required this.createdAt,
    required this.online,
    required this.lastSeenAt,
    required this.relationship,
    required this.friendshipId,
    required this.favoriteTitles,
  });

  factory PublicProfile.fromJson(Map<String, dynamic> j) => PublicProfile(
        user: PublicUser.fromJson(j),
        bio: j['bio'] as String?,
        gender: j['gender'] as String?,
        birthDate: j['birthDate'] as String?,
        city: j['city'] as String?,
        createdAt: j['createdAt'] as String? ?? '',
        online: j['online'] as bool? ?? false,
        lastSeenAt: j['lastSeenAt'] as String?,
        relationship: j['relationship'] as String? ?? 'none',
        friendshipId: j['friendshipId'] as String?,
        favoriteTitles: (j['favoriteTitles'] as List? ?? [])
            .map((e) => FavoriteTitle.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
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
