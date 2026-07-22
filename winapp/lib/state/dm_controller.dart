import 'dart:async';
import 'package:flutter/foundation.dart';
import '../api/dm_api.dart';
import '../models/dm.dart';
import '../realtime/user_socket.dart';

/// Состояние личных сообщений: WebSocket-канал, список диалогов и активный тред.
/// Отправка — по WS (dm_send с nonce + оптимистичный бабл), приём — dm_message.
class DmController extends ChangeNotifier {
  final DmApi _api;
  final UserSocket _socket;
  DmController(this._api, this._socket);

  StreamSubscription<Map<String, dynamic>>? _sub;
  String _myUserId = '';
  bool _started = false;

  List<DmConversation> conversations = [];
  int unreadTotal = 0;
  bool loadingConversations = false;

  // Активный тред.
  String? activePeerPublicId;
  String? _activePeerUserId;
  String? _activeConversationId;
  List<DirectMessage> activeMessages = [];
  bool threadLoading = false;

  int _nonceSeq = 0;

  void start(String myUserId) {
    if (_started) return;
    _started = true;
    _myUserId = myUserId;
    _sub = _socket.messages.listen(_onMessage);
    _socket.connect();
    loadConversations();
  }

  Future<void> stop() async {
    _started = false;
    await _sub?.cancel();
    _sub = null;
    conversations = [];
    activeMessages = [];
    activePeerPublicId = null;
  }

  String get myUserId => _myUserId;

  Future<void> loadConversations() async {
    loadingConversations = true;
    notifyListeners();
    try {
      final r = await _api.conversations();
      conversations = r.conversations;
      unreadTotal = r.unreadTotal;
    } catch (_) {
    } finally {
      loadingConversations = false;
      notifyListeners();
    }
  }

  /// Открыть тред с пользователем по publicId: загрузить историю и отметить прочтённым.
  Future<void> openThread(String publicId) async {
    activePeerPublicId = publicId;
    activeMessages = [];
    threadLoading = true;
    notifyListeners();
    try {
      final t = await _api.thread(publicId);
      _activeConversationId = t.conversationId.isEmpty ? null : t.conversationId;
      _activePeerUserId = t.peer.id;
      activeMessages = t.messages;
      threadLoading = false;
      notifyListeners();
      // Отметить прочитанным (если диалог уже существует).
      if (_activePeerUserId != null) {
        _socket.send({'t': 'dm_read', 'peerId': _activePeerUserId});
      }
      // Локально обнулить непрочитанные в списке.
      _clearUnread(publicId);
    } catch (_) {
      threadLoading = false;
      notifyListeners();
    }
  }

  void closeThread() {
    activePeerPublicId = null;
    _activePeerUserId = null;
    _activeConversationId = null;
    activeMessages = [];
    notifyListeners();
  }

  bool sendingImage = false;

  /// Отправить изображение активному собеседнику: загрузить (REST) → отправить
  /// (WS dm_send с imageUrl). Необязательная подпись — в body.
  Future<void> sendImage(String filePath, {String caption = ''}) async {
    if (_activePeerUserId == null) return;
    sendingImage = true;
    notifyListeners();
    try {
      final img = await _api.uploadImage(filePath);
      final nonce = 'n${DateTime.now().millisecondsSinceEpoch}_${_nonceSeq++}';
      activeMessages.add(DirectMessage(
        id: nonce,
        conversationId: _activeConversationId ?? '',
        senderId: _myUserId,
        body: caption.trim(),
        createdAt: DateTime.now().toIso8601String(),
        imageUrl: img.url,
        imageWidth: img.width,
        imageHeight: img.height,
        nonce: nonce,
        pending: true,
      ));
      _socket.send({
        't': 'dm_send',
        'toUserId': _activePeerUserId,
        'body': caption.trim(),
        'nonce': nonce,
        'imageUrl': img.url,
        'imageWidth': img.width,
        'imageHeight': img.height,
      });
    } finally {
      sendingImage = false;
      notifyListeners();
    }
  }

  /// Отправить текст активному собеседнику (оптимистично + по WS).
  void sendText(String text) {
    final body = text.trim();
    if (body.isEmpty || _activePeerUserId == null) return;
    final nonce = 'n${DateTime.now().millisecondsSinceEpoch}_${_nonceSeq++}';
    activeMessages.add(DirectMessage(
      id: nonce,
      conversationId: _activeConversationId ?? '',
      senderId: _myUserId,
      body: body,
      createdAt: DateTime.now().toIso8601String(),
      nonce: nonce,
      pending: true,
    ));
    notifyListeners();
    _socket.send({'t': 'dm_send', 'toUserId': _activePeerUserId, 'body': body, 'nonce': nonce});
  }

  void _onMessage(Map<String, dynamic> msg) {
    switch (msg['t']) {
      case 'hello':
        unreadTotal = (msg['dmUnreadTotal'] as num?)?.toInt() ?? unreadTotal;
        notifyListeners();
        break;
      case 'dm_message':
        _onDmMessage(DirectMessage.fromJson(msg['message'] as Map<String, dynamic>));
        break;
    }
  }

  void _onDmMessage(DirectMessage m) {
    final isActive = _activeConversationId != null && m.conversationId == _activeConversationId;
    // Первый ответ создаёт диалог — привяжем conversationId к активному треду,
    // если сообщение от текущего собеседника, а треда ещё не было.
    if (_activeConversationId == null && (m.senderId == _activePeerUserId || (m.nonce != null && m.senderId == _myUserId))) {
      _activeConversationId = m.conversationId;
    }
    final belongsActive = isActive || (_activeConversationId == m.conversationId);

    if (belongsActive) {
      // Эхо своей оптимистичной отправки — заменяем pending по nonce.
      final idx = m.nonce != null ? activeMessages.indexWhere((x) => x.nonce == m.nonce) : -1;
      if (idx >= 0) {
        activeMessages[idx] = m;
      } else if (activeMessages.every((x) => x.id != m.id)) {
        activeMessages.add(m);
      }
      // Входящее от собеседника в открытом треде — сразу отмечаем прочитанным.
      if (m.senderId != _myUserId && _activePeerUserId != null) {
        _socket.send({'t': 'dm_read', 'peerId': _activePeerUserId});
      }
      notifyListeners();
    }
    // Обновляем список диалогов (превью/порядок/непрочитанные) из источника истины.
    loadConversations();
  }

  void _clearUnread(String publicId) {
    conversations = conversations
        .map((c) => c.peer.publicId == publicId && c.unreadCount > 0
            ? DmConversation(
                id: c.id,
                peer: c.peer,
                lastBody: c.lastBody,
                lastSenderId: c.lastSenderId,
                unreadCount: 0,
                online: c.online,
                lastMessageAt: c.lastMessageAt,
              )
            : c)
        .toList();
    unreadTotal = conversations.fold(0, (s, c) => s + c.unreadCount);
    notifyListeners();
  }
}
