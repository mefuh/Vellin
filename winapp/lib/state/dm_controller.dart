import 'dart:async';
import 'package:flutter/foundation.dart';
import '../api/dm_api.dart';
import '../models/dm.dart';
import '../models/social.dart';
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
  PublicUser? activePeer; // карточка собеседника — для аватара в баблах
  List<DirectMessage> activeMessages = [];
  bool threadLoading = false;
  bool activeHasMore = false;
  bool loadingOlder = false;

  /// Что делает собеседник прямо сейчас в активном треде: null / 'text'
  /// (печатает) / 'voice' (записывает голосовое) / 'video' (записывает кружок).
  String? peerActivity;
  Timer? _peerActivityTimer;

  // Мой сигнал «печатаю» (троттлинг старт + авто-стоп по простою).
  bool _myTyping = false;
  Timer? _myTypingStop;

  int _nonceSeq = 0;

  String? get activePeerUserId => _activePeerUserId;

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
    _peerActivityTimer?.cancel();
    _myTypingStop?.cancel();
    _myTyping = false;
    peerActivity = null;
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
    _stopTyping();
    _peerActivityTimer?.cancel();
    peerActivity = null;
    activePeerPublicId = publicId;
    // Аватар/имя из списка диалогов — сразу, до загрузки треда.
    activePeer = conversations
        .cast<DmConversation?>()
        .firstWhere((c) => c?.peer.publicId == publicId, orElse: () => null)
        ?.peer;
    activeMessages = [];
    activeHasMore = false;
    threadLoading = true;
    notifyListeners();
    try {
      final t = await _api.thread(publicId);
      _activeConversationId = t.conversationId.isEmpty ? null : t.conversationId;
      _activePeerUserId = t.peer.id;
      activePeer = t.peer;
      activeMessages = t.messages;
      activeHasMore = t.hasMore;
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
    _stopTyping();
    _peerActivityTimer?.cancel();
    peerActivity = null;
    activePeerPublicId = null;
    _activePeerUserId = null;
    _activeConversationId = null;
    activePeer = null;
    activeMessages = [];
    activeHasMore = false;
    notifyListeners();
  }

  // ── Индикаторы «печатает / записывает» ────────────────────────────────────

  /// Вызывать на каждый ввод символа: единожды шлёт «печатает», авто-стоп через
  /// 3 c простоя.
  void typingText() {
    if (_activePeerUserId == null) return;
    if (!_myTyping) {
      _myTyping = true;
      _socket.send({'t': 'dm_typing', 'toUserId': _activePeerUserId, 'typing': true, 'kind': 'text'});
    }
    _myTypingStop?.cancel();
    _myTypingStop = Timer(const Duration(seconds: 3), _stopTyping);
  }

  /// Явный сигнал записи голосового/кружка (kind: 'voice' | 'video').
  void sendRecordingSignal(bool active, String kind) {
    if (_activePeerUserId == null) return;
    if (active) _stopTyping(); // запись отменяет «печатает»
    _socket.send({'t': 'dm_typing', 'toUserId': _activePeerUserId, 'typing': active, 'kind': kind});
  }

  void _stopTyping() {
    _myTypingStop?.cancel();
    if (_myTyping) {
      _myTyping = false;
      if (_activePeerUserId != null) {
        _socket.send({'t': 'dm_typing', 'toUserId': _activePeerUserId, 'typing': false, 'kind': 'text'});
      }
    }
  }

  void _onTyping(Map<String, dynamic> msg) {
    final from = msg['fromUserId'] as String?;
    if (from == null || from != _activePeerUserId) return; // только активный собеседник
    final typing = msg['typing'] as bool? ?? false;
    _peerActivityTimer?.cancel();
    if (typing) {
      final kind = msg['kind'] as String?;
      peerActivity = (kind == 'voice' || kind == 'video') ? kind : 'text';
      // Страховка: авто-сброс, если «перестал» потеряется.
      _peerActivityTimer = Timer(const Duration(seconds: 6), () {
        peerActivity = null;
        notifyListeners();
      });
    } else {
      peerActivity = null;
    }
    notifyListeners();
  }

  /// Подгрузить более ранние сообщения (пагинация «раньше»). Старые страницы
  /// добавляются в начало списка. Возвращает число догруженных сообщений.
  Future<int> loadOlder() async {
    if (loadingOlder || !activeHasMore || activeMessages.isEmpty || activePeerPublicId == null) {
      return 0;
    }
    loadingOlder = true;
    notifyListeners();
    var added = 0;
    try {
      final oldest = activeMessages.first.createdAt;
      final t = await _api.thread(activePeerPublicId!, before: oldest);
      final existing = activeMessages.map((m) => m.id).toSet();
      final older = t.messages.where((m) => !existing.contains(m.id)).toList();
      added = older.length;
      activeMessages = [...older, ...activeMessages];
      activeHasMore = t.hasMore;
    } catch (_) {
    } finally {
      loadingOlder = false;
      notifyListeners();
    }
    return added;
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

  /// Отправить голосовое: загрузить (REST) → отправить (WS dm_send с voiceUrl).
  Future<void> sendVoice(String filePath, int durationSec, List<int> peaks) async {
    if (_activePeerUserId == null) return;
    final url = await _api.uploadVoice(filePath);
    final nonce = 'n${DateTime.now().millisecondsSinceEpoch}_${_nonceSeq++}';
    activeMessages.add(DirectMessage(
      id: nonce,
      conversationId: _activeConversationId ?? '',
      senderId: _myUserId,
      body: '',
      createdAt: DateTime.now().toIso8601String(),
      voiceUrl: url,
      voiceDurationSec: durationSec,
      voicePeaks: peaks,
      nonce: nonce,
      pending: true,
    ));
    notifyListeners();
    _socket.send({
      't': 'dm_send',
      'toUserId': _activePeerUserId,
      'body': '',
      'nonce': nonce,
      'voiceUrl': url,
      'voiceDurationSec': durationSec,
      'voicePeaks': peaks,
    });
  }

  /// Отправить видео-кружок: загрузить сырьё (REST) → dm_send с videoUploadId.
  /// Сервер транскодирует в фоне; статус придёт через dm_message_updated.
  Future<void> sendVideoNote(String filePath, int durationSec) async {
    if (_activePeerUserId == null) return;
    final uploadId = await _api.uploadVideoNote(filePath);
    final nonce = 'n${DateTime.now().millisecondsSinceEpoch}_${_nonceSeq++}';
    activeMessages.add(DirectMessage(
      id: nonce,
      conversationId: _activeConversationId ?? '',
      senderId: _myUserId,
      body: '',
      createdAt: DateTime.now().toIso8601String(),
      videoStatus: 'processing',
      videoDurationSec: durationSec,
      nonce: nonce,
      pending: true,
    ));
    notifyListeners();
    _socket.send({
      't': 'dm_send',
      'toUserId': _activePeerUserId,
      'body': '',
      'nonce': nonce,
      'videoUploadId': uploadId,
      'videoDurationSec': durationSec,
      'videoMirrored': true,
    });
  }

  /// Отправить текст активному собеседнику (оптимистично + по WS).
  void sendText(String text) {
    final body = text.trim();
    if (body.isEmpty || _activePeerUserId == null) return;
    _stopTyping();
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
      case 'dm_message_updated':
        _onDmMessageUpdated(DirectMessage.fromJson(msg['message'] as Map<String, dynamic>));
        break;
      case 'dm_typing':
        _onTyping(msg);
        break;
    }
  }

  /// Обновление существующего сообщения (напр. видео-кружок processing→ready).
  void _onDmMessageUpdated(DirectMessage m) {
    final idx = activeMessages.indexWhere((x) => x.id == m.id);
    if (idx >= 0) {
      activeMessages[idx] = m;
      notifyListeners();
    }
    loadConversations();
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
