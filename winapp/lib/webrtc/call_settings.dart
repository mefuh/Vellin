import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Что именно поменялось в настройках. Разное меняется по-разному: громкость
/// применяется мгновенно, а смена микрофона требует перезахвата дорожки —
/// поэтому слушателю важно знать, из-за чего его позвали.
enum CallSettingsChange { audioInput, videoInput, audioOutput, processing, volume }

/// Одно устройство в списке выбора.
class CallDevice {
  final String id;
  final String label;
  const CallDevice({required this.id, required this.label});
}

/// Устройства, доступные звонку.
class CallDevices {
  final List<CallDevice> mics;
  final List<CallDevice> cameras;
  final List<CallDevice> speakers;
  const CallDevices({required this.mics, required this.cameras, required this.speakers});

  static const empty = CallDevices(mics: [], cameras: [], speakers: []);
}

/// Настройки звонка: устройства, обработка звука и громкость собеседников.
///
/// Живут вне звонка и переживают перезапуск: человек настраивает микрофон один
/// раз, а не каждый разговор. Значение `null` у устройства означает «как в
/// системе» — так настройка не ломается, когда наушники отключили.
class CallSettings extends ChangeNotifier {
  static const _kMic = 'vellin_call_mic';
  static const _kCamera = 'vellin_call_camera';
  static const _kSpeaker = 'vellin_call_speaker';
  static const _kNoise = 'vellin_call_noise_suppression';
  static const _kEcho = 'vellin_call_echo_cancellation';
  static const _kGain = 'vellin_call_auto_gain';
  static const _kVolumes = 'vellin_call_peer_volumes';

  String? _micId;
  String? _cameraId;
  String? _speakerId;
  bool _noiseSuppression = true;
  bool _echoCancellation = true;
  bool _autoGain = true;

  /// Громкость по собеседнику: 1.0 — как есть, 0 — тишина. Хранится по каждому
  /// отдельно, потому что тихий собеседник — свойство человека и его гарнитуры,
  /// а не звонка.
  final Map<String, double> _peerVolume = {};

  final _changes = StreamController<CallSettingsChange>.broadcast();

  /// На что реагировать тому, кто ведёт разговор.
  Stream<CallSettingsChange> get changes => _changes.stream;

  String? get micId => _micId;
  String? get cameraId => _cameraId;
  String? get speakerId => _speakerId;
  bool get noiseSuppression => _noiseSuppression;
  bool get echoCancellation => _echoCancellation;
  bool get autoGain => _autoGain;

  /// Громкость собеседника: 0 — тишина, 1 — обычная, до 2 — громче обычного.
  double volumeFor(String userId) => _peerVolume[userId] ?? 1.0;

  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _micId = prefs.getString(_kMic);
      _cameraId = prefs.getString(_kCamera);
      _speakerId = prefs.getString(_kSpeaker);
      _noiseSuppression = prefs.getBool(_kNoise) ?? true;
      _echoCancellation = prefs.getBool(_kEcho) ?? true;
      _autoGain = prefs.getBool(_kGain) ?? true;
      final raw = prefs.getString(_kVolumes);
      if (raw != null) {
        final decoded = jsonDecode(raw);
        if (decoded is Map) {
          decoded.forEach((k, v) {
            if (k is String && v is num) _peerVolume[k] = v.toDouble().clamp(0.0, 2.0);
          });
        }
      }
    } catch (_) {
      // Настройки не прочитались — поедем на значениях по умолчанию.
    }
    notifyListeners();
    // Выбранный динамик надо назвать движку сразу: до звонка он играет и
    // рингтон, и проверку звука.
    if (_speakerId != null) _applyOutput();
  }

  Future<SharedPreferences?> _prefs() async {
    try {
      return await SharedPreferences.getInstance();
    } catch (_) {
      return null;
    }
  }

  Future<void> _remember(String key, String? value) async {
    final prefs = await _prefs();
    if (prefs == null) return;
    if (value == null) {
      await prefs.remove(key);
    } else {
      await prefs.setString(key, value);
    }
  }

  Future<void> setMic(String? id) async {
    if (_micId == id) return;
    _micId = id;
    notifyListeners();
    _changes.add(CallSettingsChange.audioInput);
    await _remember(_kMic, id);
  }

  Future<void> setCamera(String? id) async {
    if (_cameraId == id) return;
    _cameraId = id;
    notifyListeners();
    _changes.add(CallSettingsChange.videoInput);
    await _remember(_kCamera, id);
  }

  Future<void> setSpeaker(String? id) async {
    if (_speakerId == id) return;
    _speakerId = id;
    notifyListeners();
    _applyOutput();
    _changes.add(CallSettingsChange.audioOutput);
    await _remember(_kSpeaker, id);
  }

  Future<void> setProcessing({bool? noiseSuppression, bool? echoCancellation, bool? autoGain}) async {
    _noiseSuppression = noiseSuppression ?? _noiseSuppression;
    _echoCancellation = echoCancellation ?? _echoCancellation;
    _autoGain = autoGain ?? _autoGain;
    notifyListeners();
    _changes.add(CallSettingsChange.processing);
    final prefs = await _prefs();
    if (prefs == null) return;
    await prefs.setBool(_kNoise, _noiseSuppression);
    await prefs.setBool(_kEcho, _echoCancellation);
    await prefs.setBool(_kGain, _autoGain);
  }

  Future<void> setVolumeFor(String userId, double volume) async {
    final v = volume.clamp(0.0, 2.0);
    if (_peerVolume[userId] == v) return;
    _peerVolume[userId] = v;
    notifyListeners();
    _changes.add(CallSettingsChange.volume);
    final prefs = await _prefs();
    if (prefs == null) return;
    await prefs.setString(_kVolumes, jsonEncode(_peerVolume));
  }

  /// Сказать движку, куда играть. Отдельно от захвата: динамик переключается
  /// на ходу, ничего не пересобирая.
  void _applyOutput() {
    final id = _speakerId;
    if (id == null) return;
    // Устройство могло исчезнуть (наушники вынули) — тогда останется системное.
    Helper.selectAudioOutput(id).catchError((_) {});
  }

  /// Ограничения захвата микрофона. Обработка звука задаётся здесь же: она
  /// живёт в источнике, и поменять её иначе как перезахватом нельзя.
  Map<String, dynamic> audioConstraints() => {
        if (_micId != null)
          'optional': [
            {'sourceId': _micId},
          ],
        'echoCancellation': _echoCancellation,
        'noiseSuppression': _noiseSuppression,
        'autoGainControl': _autoGain,
      };

  /// Ограничения захвата камеры.
  Map<String, dynamic> videoConstraints() => {
        if (_cameraId != null)
          'optional': [
            {'sourceId': _cameraId},
          ],
        'width': {'ideal': 640},
        'height': {'ideal': 360},
        'frameRate': {'ideal': 24},
      };

  /// Перечислить устройства. Список читается каждый раз заново: наушники
  /// втыкают и вынимают, и запомненный список быстро врёт.
  static Future<CallDevices> devices() async {
    try {
      final found = await navigator.mediaDevices.enumerateDevices();
      final mics = <CallDevice>[];
      final cameras = <CallDevice>[];
      final speakers = <CallDevice>[];
      for (final d in found) {
        final label = d.label.trim();
        final device = CallDevice(id: d.deviceId, label: label.isEmpty ? 'Устройство' : label);
        switch (d.kind) {
          case 'audioinput':
            mics.add(device);
          case 'videoinput':
            cameras.add(device);
          case 'audiooutput':
            speakers.add(device);
        }
      }
      return CallDevices(mics: mics, cameras: cameras, speakers: speakers);
    } catch (_) {
      return CallDevices.empty;
    }
  }

  @override
  void dispose() {
    _changes.close();
    super.dispose();
  }
}
