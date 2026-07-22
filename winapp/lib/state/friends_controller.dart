import 'package:flutter/foundation.dart';
import '../api/friends_api.dart';
import '../models/social.dart';

/// Состояние раздела «Друзья»: список друзей + входящие/исходящие заявки.
/// Мутации (принять/отклонить/удалить/отправить) обновляют списки перезагрузкой.
class FriendsController extends ChangeNotifier {
  final FriendsApi _api;
  FriendsController(this._api);

  List<FriendUser> friends = [];
  List<FriendRequest> incoming = [];
  List<FriendRequest> outgoing = [];
  bool loading = false;
  String? error;

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final results = await Future.wait([_api.listFriends(), _api.listRequests()]);
      friends = results[0] as List<FriendUser>;
      final requests = results[1] as List<FriendRequest>;
      incoming = requests.where((r) => r.isIncoming).toList();
      outgoing = requests.where((r) => !r.isIncoming).toList();
    } catch (e) {
      error = 'Не удалось загрузить друзей';
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> accept(String requestId) async {
    await _api.accept(requestId);
    await load();
  }

  Future<void> decline(String requestId) async {
    await _api.decline(requestId);
    await load();
  }

  Future<void> removeFriend(String userId) async {
    await _api.remove(userId);
    await load();
  }

  /// Отправить заявку; возвращает autoAccepted. По завершении обновляет списки.
  Future<bool> sendRequest({String? username, String? userId}) async {
    final auto = await _api.sendRequest(username: username, userId: userId);
    await load();
    return auto;
  }
}
