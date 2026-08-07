import 'dart:async';

import 'package:flutter_webrtc/flutter_webrtc.dart';

/// Одно соединение звонка один на один.
///
/// Переносит на Flutter ту же схему, что в вебе: «вежливая» сторона (по
/// сравнению идентификаторов) уступает при встречном предложении. Камера
/// включается по ходу разговора добавлением дорожки и новым согласованием —
/// заранее заведённая пустая видео-линия для этого не годится, стороны
/// договариваются о ней как о «только приёме».
class DmCallSession {
  final String myUserId;
  final String peerUserId;
  final Map<String, dynamic> rtcConfig;

  /// Отправить сигнал собеседнику (сервер перешлёт как есть).
  final void Function(Map<String, dynamic> payload) sendSignal;

  /// Соединение установлено — сервер ждёт этого подтверждения.
  final void Function()? onConnected;

  /// Пришёл поток собеседника (или обновился). Потоков может быть два —
  /// камера и демонстрация экрана, — поэтому вместе с потоком отдаём его
  /// приметы: идентификатор линии согласования и идентификатор потока. По ним
  /// принимающая сторона решает, что из них что.
  final void Function(MediaStream stream, String? mid)? onRemoteStream;

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

  /// Отправители демонстрации экрана и линия, по которой она идёт: её номер
  /// нужен собеседнику, чтобы отличить демонстрацию от камеры.
  RTCRtpSender? _screenVideoSender;
  RTCRtpSender? _screenAudioSender;
  RTCRtpTransceiver? _screenTransceiver;
  String? _screenStreamId;
  bool _makingOffer = false;

  /// Соединение просило согласование не вовремя — предложим, как освободится.
  bool _renegotiatePending = false;

  /// Своё предложение отправлено, ответ ещё не пришёл.
  ///
  /// Состояние самого соединения для этого не годится: оно обновляется с
  /// задержкой (сразу после создания читается как «неизвестно», а сразу после
  /// применения ответа — ещё как «жду ответ»), и решения по нему выходили
  /// неверными — согласование вставало навсегда.
  bool _negotiating = false;

  /// Сторож на ответ и число повторов предложения.
  Timer? _offerWatchdog;
  int _offerAttempts = 0;
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
        onRemoteStream?.call(event.streams.first, event.transceiver?.mid);
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

    pc.onRenegotiationNeeded = () => _offerIfPossible();

    // Аудио отправляем сразу; видео добавится при включении камеры.
    for (final track in _localStream!.getAudioTracks()) {
      await pc.addTrack(track, _localStream!);
    }
    final videoTrack = _localStream!.getVideoTracks().isNotEmpty
        ? _localStream!.getVideoTracks().first
        : null;
    // Видео добавляем только когда оно действительно есть. Заведённая заранее
    // пустая видео-линия соглашалась как «только приём», и включённая позже
    // камера в неё уже не проходила — картинки не видел никто.
    if (videoTrack != null) {
      _videoSender = await pc.addTrack(videoTrack, _localStream!);
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
        final ready = !_makingOffer && !_negotiating;
        // Столкновение предложений: невежливая сторона своё не уступает.
        if (!ready && !_polite) return;
        // А вежливая — откатывает своё, иначе чужое предложение не принять и
        // согласование встанет (например, когда камеру включили одновременно).
        if (!ready && _polite) {
          try {
            await pc.setLocalDescription(RTCSessionDescription(null, 'rollback'));
          } catch (_) {
            // Отката нет — примем предложение как есть.
          }
          _negotiating = false;
        }

        await pc.setRemoteDescription(RTCSessionDescription(payload['sdp'] as String?, 'offer'));
        final answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        final local = await pc.getLocalDescription();
        if (local?.sdp != null) sendSignal({'kind': 'answer', 'sdp': local!.sdp});
        await _flushPendingRenegotiation();
        return;
      }

      if (kind == 'answer') {
        // Своего предложения нет — этот ответ уже неактуален (обмен закрыт
        // откатом или чужим предложением), и соединение его отвергнет.
        if (!_negotiating) return;
        await pc.setRemoteDescription(RTCSessionDescription(payload['sdp'] as String?, 'answer'));
        _negotiating = false;
        _offerWatchdog?.cancel();
        _offerAttempts = 0;
        await _flushPendingRenegotiation();
      }
    } catch (_) {
      // Согласование повторится по следующему изменению.
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
        // Каждый шаг — сам по себе: снятие дорожки из локального потока на
        // Windows иногда срывается, и раньше это обрывало всё выключение —
        // собеседник не получал даже уведомления и видел застывший кадр.
        try {
          // Отправитель остаётся на месте: линия уже согласована, и включить
          // камеру обратно можно будет одной подменой дорожки.
          await _videoSender?.replaceTrack(null);
        } catch (_) {
          // Дорожка уже не отправляется.
        }
        try {
          await stream.removeTrack(t);
        } catch (_) {
          // В потоке её всё равно больше нет смысла держать.
        }
        try {
          await t.stop();
        } catch (_) {
          // Камера освободится вместе с разговором.
        }
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

    final sender = _videoSender;
    if (sender == null) {
      // Первое включение камеры в разговоре: дорожку добавляем в соединение,
      // и оно само просит новое согласование — иначе видео некуда идти.
      _videoSender = await _pc?.addTrack(track, stream);
      // Просьба о согласовании приходит раньше, чем дорожка действительно
      // встала в соединение, и то предложение уходит ещё без видео. Просим
      // ещё раз: если обмен уже идёт, повтор дождётся его конца.
      await _offerIfPossible();
    } else {
      await sender.replaceTrack(track);
    }
  }

  /// Приметы идущей демонстрации: номер линии и идентификатор потока.
  /// Собеседнику они нужны, чтобы отличить демонстрацию от камеры.
  ({String? mid, String? streamId}) get screenMarks =>
      (mid: _screenTransceiver?.mid, streamId: _screenStreamId);

  /// Начать демонстрацию: дорожки уходят в СВОЁМ потоке, отдельно от камеры —
  /// тогда у демонстрации собственный идентификатор, и собеседник ни с чем её
  /// не спутает.
  Future<void> startScreen({
    required MediaStream stream,
    required MediaStreamTrack videoTrack,
    MediaStreamTrack? audioTrack,
    required int maxBitrate,
    required int maxFramerate,
  }) async {
    final pc = _pc;
    if (pc == null || _closed) return;

    _screenStreamId = stream.id;
    _screenVideoSender = await pc.addTrack(videoTrack, stream);
    if (audioTrack != null) _screenAudioSender = await pc.addTrack(audioTrack, stream);

    // Найти линию, по которой пошла демонстрация: её номер уедет собеседнику.
    for (final t in await pc.getTransceivers()) {
      if (identical(t.sender, _screenVideoSender) || t.sender.senderId == _screenVideoSender?.senderId) {
        _screenTransceiver = t;
        break;
      }
    }

    await _limitScreenSending(maxBitrate: maxBitrate, maxFramerate: maxFramerate);
    // Просьба о согласовании приходит раньше, чем дорожка встаёт в соединение
    // (та же беда, что с камерой), поэтому просим ещё раз.
    await _offerIfPossible();
  }

  /// Заменить то, что демонстрируется, не прерывая демонстрацию: другой
  /// источник, другое разрешение или частота, снятый звук.
  ///
  /// Линии остаются прежними, поэтому нового согласования не нужно, а приметы
  /// демонстрации не меняются — собеседник продолжает узнавать её как ту же
  /// самую, и картинка у него не мигает.
  Future<bool> replaceScreen({
    required MediaStreamTrack videoTrack,
    MediaStreamTrack? audioTrack,
    required int maxBitrate,
    required int maxFramerate,
  }) async {
    final video = _screenVideoSender;
    if (video == null || _closed) return false;
    try {
      await video.replaceTrack(videoTrack);
    } catch (_) {
      return false;
    }
    // Звук можно только снять или подменить: появление нового звука требует
    // новой линии, и такой случай сюда не доходит.
    final audio = _screenAudioSender;
    if (audio != null) {
      try {
        await audio.replaceTrack(audioTrack);
      } catch (_) {
        // Звук останется прежним.
      }
    }
    await _limitScreenSending(maxBitrate: maxBitrate, maxFramerate: maxFramerate);
    return true;
  }

  /// Есть ли в соединении линия для звука демонстрации.
  bool get hasScreenAudioLine => _screenAudioSender != null;

  /// Прекратить демонстрацию. Линии остаются на месте — повторный запуск
  /// обойдётся подменой дорожки, без нового согласования.
  Future<void> stopScreen() async {
    for (final s in [_screenVideoSender, _screenAudioSender]) {
      if (s == null) continue;
      try {
        await s.replaceTrack(null);
      } catch (_) {
        // Дорожка уже не отправляется.
      }
    }
    _screenStreamId = null;
  }

  /// Потолок битрейта и частоты для демонстрации: без него крупная картинка
  /// съедает канал, и первым начинает рваться голос.
  Future<void> _limitScreenSending({required int maxBitrate, required int maxFramerate}) async {
    final sender = _screenVideoSender;
    if (sender == null) return;
    try {
      final params = sender.parameters;
      final encodings = params.encodings;
      if (encodings == null || encodings.isEmpty) {
        params.encodings = [
          RTCRtpEncoding(maxBitrate: maxBitrate, maxFramerate: maxFramerate),
        ];
      } else {
        for (final e in encodings) {
          e.maxBitrate = maxBitrate;
          e.maxFramerate = maxFramerate;
        }
      }
      await sender.setParameters(params);
    } catch (_) {
      // Ограничить не вышло — демонстрация пойдёт как есть.
    }
  }

  /// Догнать отложенное согласование, когда обмен завершился.
  Future<void> _flushPendingRenegotiation() async {
    if (!_renegotiatePending) return;
    _renegotiatePending = false;
    await _offerIfPossible();
  }

  /// Предложить согласование, если соединение к нему готово.
  ///
  /// Предлагать можно только из спокойного состояния: второе предложение
  /// поверх незавершённого обмена его ломает — собеседник отвечает на оба, и
  /// второй ответ соединение уже отвергает. Поэтому просьба, пришедшая не
  /// вовремя, не теряется, а откладывается до конца текущего обмена.
  Future<void> _offerIfPossible() async {
    final pc = _pc;
    if (pc == null || _closed) return;
    if (_makingOffer || _negotiating) {
      _renegotiatePending = true;
      return;
    }
    try {
      _makingOffer = true;
      final offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      final local = await pc.getLocalDescription();
      if (local?.sdp != null) {
        _negotiating = true;
        sendSignal({'kind': 'offer', 'sdp': local!.sdp});
        _armOfferWatchdog();
      }
    } catch (_) {
      // Предложение не составилось — повторим при следующей просьбе.
    } finally {
      _makingOffer = false;
    }
  }

  /// Ждать ответ ограниченное время и предложить заново, если его нет.
  ///
  /// Пока обмен не завершён, сторона по правилу разрешения столкновений
  /// отклоняет встречные предложения — и если ответ потерялся (собеседник ещё
  /// поднимал микрофон), звонок остаётся без звука и видео навсегда. Повтор
  /// выводит из этого тупика.
  void _armOfferWatchdog() {
    _offerWatchdog?.cancel();
    _offerWatchdog = Timer(const Duration(seconds: 3), () {
      if (_closed || !_negotiating) return;
      if (_offerAttempts >= 3) return;
      _offerAttempts++;
      _negotiating = false;
      _offerIfPossible();
    });
  }

  Future<void> dispose() async {
    _closed = true;
    _offerWatchdog?.cancel();
    for (final t in _localStream?.getTracks() ?? const <MediaStreamTrack>[]) {
      await t.stop();
    }
    await _localStream?.dispose();
    _localStream = null;
    await _pc?.close();
    _pc = null;
  }
}
