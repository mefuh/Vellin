import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Что именно поменялось в настройках. Разное применяется по-разному: громкость
/// ложится мгновенно, а смена камеры или обработки звука требует перезахвата
/// дорожки — поэтому слушателю важно знать, из-за чего его позвали.
enum CallSettingsChange { videoInput, processing, volume }

/// Одно устройство в списке выбора.
class CallDevice {
  final String id;
  final String label;
  const CallDevice({required this.id, required this.label});
}

/// Камеры, доступные звонку.
///
/// Микрофонов и динамиков здесь нет намеренно: библиотека звонков на Windows
/// звуковых устройств не перечисляет и выбирать их не даёт — звук всегда идёт
/// через «устройства связи» Windows. Их названия читаются отдельно, через
/// [systemAudioDevices].
class CallDevices {
  final List<CallDevice> cameras;
  const CallDevices({required this.cameras});

  static const empty = CallDevices(cameras: []);
}

/// Устройства связи Windows: через них идёт звук любого звонка.
class SystemAudioDevices {
  final String micLabel;
  final String speakerLabel;
  const SystemAudioDevices({required this.micLabel, required this.speakerLabel});

  static const unknown = SystemAudioDevices(micLabel: '', speakerLabel: '');
}

/// Настройки звонка: камера, обработка звука и громкость собеседников.
///
/// Живут вне звонка и переживают перезапуск: человек настраивает их один раз, а
/// не каждый разговор. `null` у камеры означает «как в системе» — так настройка
/// не ломается, когда камеру отключили.
class CallSettings extends ChangeNotifier {
  static const _kCamera = 'vellin_call_camera';
  static const _kNoise = 'vellin_call_noise_suppression';
  static const _kEcho = 'vellin_call_echo_cancellation';
  static const _kGain = 'vellin_call_auto_gain';
  static const _kVolumes = 'vellin_call_peer_volumes';

  static const _audioDevices = MethodChannel('vellin/audio_devices');

  String? _cameraId;
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

  String? get cameraId => _cameraId;
  bool get noiseSuppression => _noiseSuppression;
  bool get echoCancellation => _echoCancellation;
  bool get autoGain => _autoGain;

  /// Громкость собеседника: 0 — тишина, 1 — обычная, до 2 — громче обычного.
  double volumeFor(String userId) => _peerVolume[userId] ?? 1.0;

  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _cameraId = prefs.getString(_kCamera);
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
  }

  Future<SharedPreferences?> _prefs() async {
    try {
      return await SharedPreferences.getInstance();
    } catch (_) {
      return null;
    }
  }

  Future<void> setCamera(String? id) async {
    if (_cameraId == id) return;
    _cameraId = id;
    notifyListeners();
    _changes.add(CallSettingsChange.videoInput);
    final prefs = await _prefs();
    if (prefs == null) return;
    if (id == null) {
      await prefs.remove(_kCamera);
    } else {
      await prefs.setString(_kCamera, id);
    }
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

  /// Ограничения захвата микрофона. Устройство здесь не задаётся: его выбирает
  /// Windows. Обработка звука, наоборот, живёт в источнике, и поменять её иначе
  /// как перезахватом нельзя.
  Map<String, dynamic> audioConstraints() => {
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

  /// Перечислить камеры. Список читается каждый раз заново: камеры втыкают и
  /// вынимают, и запомненный список быстро врёт.
  static Future<CallDevices> devices() async {
    try {
      final found = await navigator.mediaDevices.enumerateDevices();
      final cameras = <CallDevice>[];
      for (final d in found) {
        if (d.kind != 'videoinput') continue;
        final label = d.label.trim();
        cameras.add(CallDevice(id: d.deviceId, label: label.isEmpty ? 'Камера' : label));
      }
      return CallDevices(cameras: cameras);
    } catch (e) {
      debugPrint('[call] список камер не получен: $e');
      return CallDevices.empty;
    }
  }

  /// Узнать, какие микрофон и динамик Windows отдаёт разговорам.
  static Future<SystemAudioDevices> systemAudioDevices() async {
    try {
      final res = await _audioDevices.invokeMapMethod<String, dynamic>('communications');
      return SystemAudioDevices(
        micLabel: (res?['capture'] as String? ?? '').trim(),
        speakerLabel: (res?['render'] as String? ?? '').trim(),
      );
    } catch (_) {
      return SystemAudioDevices.unknown;
    }
  }

  @override
  void dispose() {
    _changes.close();
    super.dispose();
  }
}
