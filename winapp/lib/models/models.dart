// Модели данных, зеркалящие типы `@vellin/shared` (api.ts/domain.ts).
// Источник истины по формам — общий TS-пакет бэкенда; здесь — Dart-эквивалент.

/// Пользователь (shared: AuthUser). В клиентах — всегда kind == 'user'.
class AuthUser {
  final String id;
  final String publicId;
  final String? email;
  final String username;
  final String avatarSeed;
  final String? avatarUrl;
  final String? bio;
  final String? gender; // 'male' | 'female' | 'other'
  final String? birthDate; // YYYY-MM-DD
  final String? city;
  final String kind;
  final String createdAt;

  /// Выбранный статус присутствия: online | away | offline.
  final String presenceStatus;
  final bool isAdmin;

  const AuthUser({
    required this.id,
    required this.publicId,
    required this.email,
    required this.username,
    required this.avatarSeed,
    required this.avatarUrl,
    required this.bio,
    required this.gender,
    required this.birthDate,
    required this.city,
    required this.kind,
    required this.createdAt,
    required this.isAdmin,
    this.presenceStatus = 'online',
  });

  factory AuthUser.fromJson(Map<String, dynamic> j) => AuthUser(
        id: j['id'] as String,
        publicId: j['publicId'] as String? ?? j['id'] as String,
        email: j['email'] as String?,
        username: j['username'] as String,
        avatarSeed: j['avatarSeed'] as String? ?? '',
        avatarUrl: j['avatarUrl'] as String?,
        bio: j['bio'] as String?,
        gender: j['gender'] as String?,
        birthDate: j['birthDate'] as String?,
        city: j['city'] as String?,
        kind: j['kind'] as String? ?? 'user',
        createdAt: j['createdAt'] as String? ?? '',
        presenceStatus: j['presenceStatus'] as String? ?? 'online',
        isAdmin: j['isAdmin'] as bool? ?? false,
      );

  /// Копия с другим статусом присутствия — остальные поля профиля при смене
  /// статуса не трогаются.
  AuthUser withPresenceStatus(String status) => AuthUser(
        id: id,
        publicId: publicId,
        email: email,
        username: username,
        avatarSeed: avatarSeed,
        avatarUrl: avatarUrl,
        bio: bio,
        gender: gender,
        birthDate: birthDate,
        city: city,
        kind: kind,
        createdAt: createdAt,
        isAdmin: isAdmin,
        presenceStatus: status,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'publicId': publicId,
        'email': email,
        'username': username,
        'avatarSeed': avatarSeed,
        'avatarUrl': avatarUrl,
        'bio': bio,
        'gender': gender,
        'birthDate': birthDate,
        'city': city,
        'kind': kind,
        'createdAt': createdAt,
        'presenceStatus': presenceStatus,
        'isAdmin': isAdmin,
      };
}

/// Ответ авторизации/мутаций профиля (shared: AuthResponse / ProfileMutationResponse).
class AuthResult {
  final String token;
  final AuthUser user;
  const AuthResult({required this.token, required this.user});

  factory AuthResult.fromJson(Map<String, dynamic> j) => AuthResult(
        token: j['token'] as String,
        user: AuthUser.fromJson(j['user'] as Map<String, dynamic>),
      );
}
