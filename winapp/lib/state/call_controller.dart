import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import '../models/call.dart';
import '../models/social.dart';
import '../realtime/user_socket.dart';
import '../runtime/call_tones.dart';
import '../runtime/media_gate.dart';
import '../runtime/toast_host.dart';
import '../webrtc/dm_call_session.dart';

/// Как показан звонок в окне.
enum CallUiMode { hidden, minimized, expanded }

/// Звонки один на один в личных сообщениях.
///
/// Состояние принадлежит серверу: контроллер отражает присланные снапшоты и
/// поднимает медиа, когда разговор начался. Живёт всю сессию, а не пока открыт
/// раздел «Сообщения» — звонок должен приходить из любого места приложения.
class CallController extends ChangeNotifier {
  final UserSocket _socket;

  /// Окно тостов: через него звонок доходит до пользователя, когда главное
  /// окно свёрнуто или перекрыто.
  final ToastHost _toasts;

  CallController(this._socket, this._toasts) {
    _toasts.onCallAction = _onToastAction;
  }

  /// Идентификатор звонка, показанного тостом, — его нужно будет снять.
  String? _toastCallId;

  StreamSubscription<Map<String, dynamic>>? _sub;
  bool _started = false;
  String _myUserId = '';

  /// Идентификатор своего соединения (из hello): по нему видно, наш ли звонок.
  String? _connId;

  DmCallSnapshot? call;
  PublicUser? peer;
  IncomingDmCall? incoming;
  CallUiMode uiMode = CallUiMode.hidden;

  /// Текст последней неудачи — показать пользователю.
  String? error;

  DmCallSession? _session;
  Map<String, dynamic>? _rtcConfig;

  final RTCVideoRenderer localRenderer = RTCVideoRenderer();
  final RTCVideoRenderer remoteRenderer = RTCVideoRenderer();
  bool _renderersReady = false;

  bool get hasRemoteVideo => remoteRenderer.srcObject != null && (call?.media[peerId]?.video ?? false);

  /// Микрофон собеседника: выключенный он не слышен, и об этом надо сказать —
  /// иначе тишина читается как обрыв связи.
  bool get peerMicEnabled => call?.media[peerId]?.audio ?? true;
  String get peerId => call != null ? call!.peerIdFor(_myUserId) : '';
  bool get micEnabled => _session?.micEnabled ?? true;
  bool get cameraEnabled => _session?.videoEnabled ?? false;

  /// Звонок обслуживается ЭТИМ окном, а не другим устройством.
  bool get isMine {
    final c = call;
    final conn = _connId;
    if (c == null || conn == null) return false;
    return c.callerConnId == conn || c.calleeConnId == conn;
  }

  Future<void> start(String myUserId) async {
    if (_started) return;
    _started = true;
    _myUserId = myUserId;
    _sub = _socket.messages.listen(_onMessage);
  }

  /// Поверхности видео создаём только на время разговора. Инициализация на
  /// старте приложения заводит платформенный слой, который на Windows
  /// перекрывает интерфейс серым прямоугольником — по нему невозможно даже
  /// нажать кнопки экрана входящего звонка.
  Future<void> _ensureRenderers() async {
    if (_renderersReady) return;
    await localRenderer.initialize();
    await remoteRenderer.initialize();
    _renderersReady = true;
  }

  Future<void> _releaseRenderers() async {
    if (!_renderersReady) return;
    _renderersReady = false;
    localRenderer.srcObject = null;
    remoteRenderer.srcObject = null;
  }

  Future<void> stop() async {
    _started = false;
    await _sub?.cancel();
    _sub = null;
    _stopRinging();
    await _teardownSession();
    call = null;
    peer = null;
    incoming = null;
    uiMode = CallUiMode.hidden;
    notifyListeners();
  }

  @override
  void dispose() {
    _sub?.cancel();
    CallTones.instance.stop();
    _session?.dispose();
    localRenderer.dispose();
    remoteRenderer.dispose();
    super.dispose();
  }

  // ── Приём сообщений ───────────────────────────────────────────────────────

  void _onMessage(Map<String, dynamic> msg) {
    final t = msg['t'];
    if (t is! String) return;

    if (t == 'hello') {
      _connId = msg['connId'] as String?;
      final active = msg['activeCall'];
      if (active is Map<String, dynamic>) {
        // Приложение перезапустили посреди разговора — возвращаемся в него.
        final snapshot = DmCallSnapshot.fromJson(active);
        _socket.send({'t': 'dmcall_rejoin', 'callId': snapshot.callId});
      }
      return;
    }

    if (!t.startsWith('dmcall_')) return;

    switch (t) {
      case 'dmcall_ring':
        final snapshot = DmCallSnapshot.fromJson(msg['call'] as Map<String, dynamic>);
        final from = PublicUser.fromJson(msg['from'] as Map<String, dynamic>);
        _rtcConfig = _toRtcConfig(msg['rtc']);
        incoming = IncomingDmCall(snapshot, from);
        error = null;
        CallTones.instance.startRingtone();
        _showCallToast(snapshot, from);
        notifyListeners();
        break;

      case 'dmcall_state':
        _onState(msg);
        break;

      case 'dmcall_signal':
        final payload = msg['payload'];
        if (payload is Map<String, dynamic>) _session?.handleSignal(payload);
        break;

      case 'dmcall_media':
        // Сервер шлёт переключение отдельно, без нового снимка, — состояние
        // собеседника обновляем сами, иначе включённая камера не появится.
        final from = msg['fromUserId'] as String?;
        final current = call;
        if (from != null && current != null && current.callId == msg['callId']) {
          call = current.withMedia(
            from,
            DmCallMediaState(
              audio: msg['audio'] as bool? ?? true,
              video: msg['video'] as bool? ?? false,
            ),
          );
        }
        notifyListeners();
        break;

      case 'dmcall_error':
        error = msg['message'] as String? ?? 'Не удалось позвонить';
        incoming = null;
        call = null;
        peer = null;
        uiMode = CallUiMode.hidden;
        _stopRinging();
        _teardownSession();
        notifyListeners();
        break;
    }
  }

  Future<void> _onState(Map<String, dynamic> msg) async {
    final snapshot = DmCallSnapshot.fromJson(msg['call'] as Map<String, dynamic>);
    final peerUser = msg['peer'] is Map<String, dynamic>
        ? PublicUser.fromJson(msg['peer'] as Map<String, dynamic>)
        : null;
    final rtc = _toRtcConfig(msg['rtc']);
    if (rtc != null) _rtcConfig = rtc;

    if (snapshot.isEnded) {
      call = null;
      peer = null;
      incoming = null;
      uiMode = CallUiMode.hidden;
      _stopRinging();
      await _teardownSession();
      notifyListeners();
      return;
    }

    final wasCallId = call?.callId;
    final prevPeerConn = call == null
        ? null
        : (call!.callerId == _myUserId ? call!.calleeConnId : call!.callerConnId);

    call = snapshot;
    if (peerUser != null) peer = peerUser;

    // Ответили на другом устройстве — гасим у себя входящий и не поднимаем медиа.
    if (!isMine) {
      incoming = null;
      uiMode = CallUiMode.hidden;
      _stopRinging();
      await _teardownSession();
      notifyListeners();
      return;
    }

    if (uiMode == CallUiMode.hidden) uiMode = CallUiMode.expanded;

    // Гудки — пока идёт дозвон, и только у звонящего: у принимающей стороны
    // звонок уже отзвонил трелью.
    if (snapshot.isRinging && snapshot.callerId == _myUserId) {
      CallTones.instance.startRingback();
    } else {
      _stopRinging();
    }

    if (snapshot.isActive) {
      final nextPeerConn =
          snapshot.callerId == _myUserId ? snapshot.calleeConnId : snapshot.callerConnId;
      // Собеседник перезашёл: старое соединение мертво, поднимаем заново.
      final peerChanged = prevPeerConn != null && nextPeerConn != null && prevPeerConn != nextPeerConn;
      if (peerChanged || wasCallId != snapshot.callId) {
        await _teardownSession();
      }
      if (_session == null) await _startSession(snapshot);
    }

    notifyListeners();
  }

  Map<String, dynamic>? _toRtcConfig(dynamic raw) {
    if (raw is! Map<String, dynamic>) return null;
    final servers = raw['iceServers'];
    if (servers is! List) return null;
    return {
      'iceServers': servers
          .whereType<Map<String, dynamic>>()
          .map((s) => {
                'urls': s['urls'],
                if (s['username'] != null) 'username': s['username'],
                if (s['credential'] != null) 'credential': s['credential'],
              })
          .toList(),
      'sdpSemantics': 'unified-plan',
    };
  }

  // ── Тост входящего звонка и звуки ─────────────────────────────────────────

  /// Показать звонок тостом, если главное окно не в фокусе. Иначе достаточно
  /// экрана входящего — тост показан не будет, и снимать нечего.
  Future<void> _showCallToast(DmCallSnapshot snapshot, PublicUser from) async {
    final shown = await _toasts.showIncomingCall(
      callId: snapshot.callId,
      username: from.username,
      video: snapshot.video,
      avatarUrl: from.avatarUrl,
      avatarSeed: from.avatarSeed,
    );
    if (shown) _toastCallId = snapshot.callId;
  }

  void _hideCallToast() {
    final id = _toastCallId;
    if (id == null) return;
    _toastCallId = null;
    _toasts.hideIncomingCall(id);
  }

  /// Ответ или отказ кнопкой прямо в тосте.
  void _onToastAction(String callId, String action) {
    _toastCallId = null; // тост уже снял себя сам
    final inc = incoming;
    if (inc == null || inc.call.callId != callId) return;
    if (action == 'accept') {
      accept(video: false);
    } else {
      decline();
    }
  }

  /// Снять звук дозвона вместе с тостом: оба живут ровно пока звонят.
  void _stopRinging() {
    CallTones.instance.stop();
    _hideCallToast();
  }

  // ── Медиа ─────────────────────────────────────────────────────────────────

  Future<void> _startSession(DmCallSnapshot snapshot) async {
    final config = _rtcConfig;
    if (config == null) return;
    // Микрофон и камера монопольны: если сейчас пишется голосовое или кружок,
    // запись прерывается — иначе звонок остался бы без звука.
    await MediaGate.instance.acquireForCall();
    await _ensureRenderers();
    final session = DmCallSession(
      myUserId: _myUserId,
      peerUserId: snapshot.peerIdFor(_myUserId),
      rtcConfig: config,
      sendSignal: (payload) =>
          _socket.send({'t': 'dmcall_signal', 'callId': snapshot.callId, 'payload': payload}),
      onConnected: () => _socket.send({'t': 'dmcall_connected', 'callId': snapshot.callId}),
      onRemoteStream: (stream) {
        // Камеру собеседник включает по ходу разговора, и дорожка приходит в
        // тот же поток. Поверхность привязана к объекту потока и такой
        // добавки не замечает — переустанавливаем её принудительно.
        remoteRenderer.srcObject = null;
        remoteRenderer.srcObject = stream;
        notifyListeners();
      },
    );
    _session = session;
    try {
      await session.start(withVideo: snapshot.video);
      localRenderer.srcObject = session.localStream;
      notifyListeners();
    } catch (e) {
      error = 'Нет доступа к микрофону';
      await _teardownSession();
      hangup();
      notifyListeners();
    }
  }

  Future<void> _teardownSession() async {
    final s = _session;
    _session = null;
    await _releaseRenderers();
    await s?.dispose();
    MediaGate.instance.releaseFromCall();
  }

  // ── Действия пользователя ─────────────────────────────────────────────────

  void invite(String toUserId, {required bool video}) {
    error = null;
    _socket.send({
      't': 'dmcall_invite',
      'toUserId': toUserId,
      'video': video,
      'nonce': 'c${DateTime.now().millisecondsSinceEpoch}',
    });
  }

  void accept({required bool video}) {
    final inc = incoming;
    if (inc == null) return;
    incoming = null;
    _stopRinging();
    notifyListeners();
    _socket.send({'t': 'dmcall_accept', 'callId': inc.call.callId, 'video': video});
  }

  void decline() {
    final inc = incoming;
    if (inc == null) return;
    incoming = null;
    _stopRinging();
    notifyListeners();
    _socket.send({'t': 'dmcall_decline', 'callId': inc.call.callId});
  }

  void hangup() {
    final c = call;
    if (c == null) return;
    _socket.send({'t': 'dmcall_hangup', 'callId': c.callId});
  }

  void toggleMic() {
    final s = _session;
    if (s == null) return;
    final next = !s.micEnabled;
    s.setMicEnabled(next);
    final c = call;
    if (c != null) {
      _socket.send({
        't': 'dmcall_media',
        'callId': c.callId,
        'audio': next,
        'video': s.videoEnabled,
      });
    }
    notifyListeners();
  }

  Future<void> toggleCamera() async {
    final s = _session;
    final c = call;
    if (s == null || c == null) return;
    final next = !s.videoEnabled;
    try {
      await s.setCameraEnabled(next);
    } finally {
      // Сообщить собеседнику нужно в любом случае: сорвись переключение на
      // полпути — он всё равно перестанет получать картинку, и без этого
      // сообщения у него останется висеть застывший кадр.
      localRenderer.srcObject = s.localStream;
      _socket.send({
        't': 'dmcall_media',
        'callId': c.callId,
        'audio': s.micEnabled,
        'video': next,
      });
      notifyListeners();
    }
  }

  void setUiMode(CallUiMode mode) {
    uiMode = mode;
    notifyListeners();
  }

  void clearError() {
    error = null;
    notifyListeners();
  }
}
