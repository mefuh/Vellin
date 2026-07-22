import '../models/social.dart';
import 'api_client.dart';

/// Друзья, заявки, поиск пользователей. Все эндпоинты требуют авторизации.
class FriendsApi {
  final ApiClient _c;
  FriendsApi(this._c);

  Future<List<FriendUser>> listFriends() async {
    final j = await _c.get('/friends') as Map<String, dynamic>;
    return (j['friends'] as List).map((e) => FriendUser.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<FriendRequest>> listRequests() async {
    final j = await _c.get('/friends/requests') as Map<String, dynamic>;
    return (j['requests'] as List).map((e) => FriendRequest.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Отправить заявку по username или userId. Возвращает autoAccepted (если
  /// встречная заявка существовала — дружба сразу подтверждена).
  Future<bool> sendRequest({String? username, String? userId}) async {
    final body = <String, dynamic>{};
    if (username != null) body['username'] = username;
    if (userId != null) body['userId'] = userId;
    final j = await _c.post('/friends/requests', body) as Map<String, dynamic>;
    return j['autoAccepted'] as bool? ?? false;
  }

  Future<void> accept(String requestId) => _c.post('/friends/requests/$requestId/accept');
  Future<void> decline(String requestId) => _c.post('/friends/requests/$requestId/decline');
  Future<void> remove(String userId) => _c.delete('/friends/$userId');

  Future<List<SearchUser>> search(String query) async {
    final j = await _c.get('/users/search?q=${Uri.encodeQueryComponent(query)}') as Map<String, dynamic>;
    return (j['users'] as List).map((e) => SearchUser.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Публичный профиль пользователя по publicId.
  Future<PublicProfile> profile(String publicId) async {
    final j = await _c.get('/users/$publicId') as Map<String, dynamic>;
    return PublicProfile.fromJson(j['profile'] as Map<String, dynamic>);
  }
}
