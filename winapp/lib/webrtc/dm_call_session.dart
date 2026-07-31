import 'dart:async';

import 'package:flutter_webrtc/flutter_webrtc.dart';

/// Одно соединение звонка один на один.
///
/// Переносит на Flutter ту же схему, что в вебе: «вежливая» сторона (по
/// сравнению идентификаторов) уступает при встречном предложении, а видео-
/// трансивер создаётся заранее — тогда включение камеры по ходу разговора
/// делается заменой дорожки, без повторного согласования.
class DmCallSession {
  final String myUserId;
  final String peerUserId;
  final Map<String, dynamic> rtcConfig;

  /// Отправить сигнал собеседнику (сервер перешлёт как есть).
  final void Function(Map<String, dynamic> payload) sendSignal;

  /// Соединение установлено — сервер ждёт этого подтверждения.
  final void Function()? onConnected;

  /// Пришёл поток собеседника (или обновился).
  final void Function(MediaStream stream)? onRemoteStream;

  DmCallSession({
    required this.myUserId,
    required this.peerUserId,
    required this.rtcConfig,
    required this.sendSignal,
    this.onConnected,
    this.onRemoteStream,
  });

  RTCPeerConnection? _pc;
  MediaStream? _localStream;
  RTCRtpSender? _videoSender;
  bool _makingOffer = false;
  bool _settingRemoteAnswer = false;
  bool _closed = false;
  bool _connectedReported = false;

  /// Вежливая сторона уступает при столкновении предложений. Правило то же,
  /// что в вебе, иначе стороны разойдутся в решении.
  bool get _polite => myUserId.compareTo(peerUserId) < 0;

  /// Сообщить о состоявшемся соединении ровно один раз.
  void _reportConnected() {
    if (_connectedReported || _closed) return;
    _connectedReported = true;
    onConnected?.call();
  }

  MediaStream? get localStream => _localStream;

  /// Захватить микрофон (и камеру, если [withVideo]) и поднять соединение.
  Future<void> start({required bool withVideo}) async {
    _localStream = await navigator.mediaDevices.getUserMedia({
      'audio': {
        'echoCancellation': true,
        'noiseSuppression': true,
        'autoGainControl': true,
      },
      'video': withVideo
          ? {
              'width': {'ideal': 640},
              'height': {'ideal': 360},
              'frameRate': {'ideal': 24},
            }
          : false,
    });

    final pc = await createPeerConnection(rtcConfig);
    _pc = pc;

    pc.onIceCandidate = (candidate) {
      if (_closed) return;
      sendSignal({
        'kind': 'ice',
        'candidate': {
          'candidate': candidate.candidate,
          'sdpMid': candidate.sdpMid,
          'sdpMLineIndex': candidate.sdpMLineIndex,
        },
      });
    };

    pc.onTrack = (event) {
      if (event.streams.isNotEmpty) {
        onRemoteStream?.call(event.streams.first);
        // Поток собеседника пошёл — соединение состоялось. Ждать только
        // onConnectionState ненадёжно: на Windows это событие приходит не
        // всегда, и сервер записывал состоявшийся разговор как несостоявшийся.
        _reportConnected();
      }
    };

    pc.onIceConnectionState = (state) {
      if (state == RTCIceConnectionState.RTCIceConnectionStateConnected ||
          state == RTCIceConnectionState.RTCIceConnectionStateCompleted) {
        _reportConnected();
      }
    };

    pc.onConnectionState = (state) {
      if (state == RTCPeerConnectionState.RTCPeerConnectionStateConnected) {
        _reportConnected();
      }
      if (state == RTCPeerConnectionState.RTCPeerConnectionStateFailed) {
        pc.restartIce();
      }
    };

    pc.onRenegotiationNeeded = () async {
      if (_closed) return;
      try {
        _makingOffer = true;
        final offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        final local = await pc.getLocalDescription();
        if (local?.sdp != null) sendSignal({'kind': 'offer', 'sdp': local!.sdp});
      } catch (_) {
        // Согласование повторится по следующему событию.
      } finally {
        _makingOffer = false;
      }
    };

    // Аудио отправляем сразу; видео-трансивер заводим заранее, даже когда
    // камера выключена — потом достаточно подменить дорожку.
    for (final track in _localStream!.getAudioTracks()) {
      await pc.addTrack(track, _localStream!);
    }
    final videoTrack = _localStream!.getVideoTracks().isNotEmpty
        ? _localStream!.getVideoTracks().first
        : null;
    if (videoTrack != null) {
      _videoSender = await pc.addTrack(videoTrack, _localStream!);
    } else {
      final transceiver = await pc.addTransceiver(
        kind: RTCRtpMediaType.RTCRtpMediaTypeVideo,
        init: RTCRtpTransceiverInit(direction: TransceiverDirection.SendRecv),
      );
      _videoSender = transceiver.sender;
    }
  }

  /// Обработать сигнал собеседника.
  Future<void> handleSignal(Map<String, dynamic> payload) async {
    final pc = _pc;
    if (pc == null || _closed) return;
    final kind = payload['kind'] as String?;

    try {
      if (kind == 'ice') {
        final c = payload['candidate'];
        if (c is Map<String, dynamic>) {
          await pc.addCandidate(RTCIceCandidate(
            c['candidate'] as String?,
            c['sdpMid'] as String?,
            (c['sdpMLineIndex'] as num?)?.toInt(),
          ));
        }
        return;
      }

      if (kind == 'offer') {
        final signalingState = pc.signalingState;
        final ready = !_makingOffer &&
            (signalingState == RTCSignalingState.RTCSignalingStateStable || _settingRemoteAnswer);
        // Столкновение предложений: невежливая сторона своё не уступает.
        if (!ready && !_polite) return;

        await pc.setRemoteDescription(RTCSessionDescription(payload['sdp'] as String?, 'offer'));
        final answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        final local = await pc.getLocalDescription();
        if (local?.sdp != null) sendSignal({'kind': 'answer', 'sdp': local!.sdp});
        return;
      }

      if (kind == 'answer') {
        _settingRemoteAnswer = true;
        await pc.setRemoteDescription(RTCSessionDescription(payload['sdp'] as String?, 'answer'));
        _settingRemoteAnswer = false;
      }
    } catch (_) {
      _settingRemoteAnswer = false;
    }
  }

  /// Микрофон: выключение оставляет дорожку в соединении, просто без звука.
  void setMicEnabled(bool enabled) {
    for (final t in _localStream?.getAudioTracks() ?? const <MediaStreamTrack>[]) {
      t.enabled = enabled;
    }
  }

  bool get micEnabled {
    final tracks = _localStream?.getAudioTracks() ?? const <MediaStreamTrack>[];
    return tracks.isNotEmpty && tracks.first.enabled;
  }

  bool get videoEnabled {
    final tracks = _localStream?.getVideoTracks() ?? const <MediaStreamTrack>[];
    return tracks.isNotEmpty && tracks.first.enabled;
  }

  /// Включить или выключить камеру. Дорожка подменяется в готовом
  /// трансивере, поэтому пересогласования не требуется.
  Future<void> setCameraEnabled(bool enabled) async {
    final stream = _localStream;
    if (stream == null) return;

    if (!enabled) {
      for (final t in stream.getVideoTracks()) {
        t.enabled = false;
        await _videoSender?.replaceTrack(null);
        await stream.removeTrack(t);
        await t.stop();
      }
      return;
    }

    final camStream = await navigator.mediaDevices.getUserMedia({
      'audio': false,
      'video': {
        'width': {'ideal': 640},
        'height': {'ideal': 360},
        'frameRate': {'ideal': 24},
      },
    });
    final track = camStream.getVideoTracks().first;
    await stream.addTrack(track);
    await _videoSender?.replaceTrack(track);
  }

  Future<void> dispose() async {
    _closed = true;
    for (final t in _localStream?.getTracks() ?? const <MediaStreamTrack>[]) {
      await t.stop();
    }
    await _localStream?.dispose();
    _localStream = null;
    await _pc?.close();
    _pc = null;
  }
}
