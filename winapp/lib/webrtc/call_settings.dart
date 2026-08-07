import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Что именно поменялось в настройках. Разное применяется по-разному: громкость
/// ложится мгновенно, а смена устройства захвата или обработки звука требует
/// перезахвата дорожки — поэтому слушателю важно знать, из-за чего его позвали.
enum CallSettingsChange { audioInput, audioOutput, videoInput, processing, volume }

/// Одно устройство в списке выбора.
class CallDevice {
  final String id;
  final String label;
  const CallDevice({required this.id, required this.label});
}

/// Устройства, доступные звонку.
class CallDevices {
  final List<CallDevice> mics;
  final List<CallDevice> speakers;
  final List<CallDevice> cameras;

  /// Что система отдаёт разговорам, когда своё устройство не выбрано.
  final String? defaultMicId;
  final String? defaultSpeakerId;

  const CallDevices({
    required this.mics,
    required this.speakers,
    required this.cameras,
    this.defaultMicId,
    this.defaultSpeakerId,
  });

  static const empty = CallDevices(mics: [], speakers: [], cameras: []);

  String? labelFor(List<CallDevice> list, String? id) {
    if (id == null) return null;
    for (final d in list) {
      if (d.id == id) return d.label;
    }
    return null;
  }
}

/// Настройки звонка: камера, обработка звука и громкость собеседников.
///
/// Живут вне звонка и переживают перезапуск: человек настраивает их один раз, а
/// не каждый разговор. `null` у камеры означает «как в системе» — так настройка
/// не ломается, когда камеру отключили.
class CallSettings extends ChangeNotifier {
  static const _kMic = 'vellin_call_mic';
  static const _kSpeaker = 'vellin_call_speaker';
  static const _kCamera = 'vellin_call_camera';
  static const _kNoise = 'vellin_call_noise_suppression';
  static const _kEcho = 'vellin_call_echo_cancellation';
  static const _kGain = 'vellin_call_auto_gain';
  static const _kVolumes = 'vellin_call_peer_volumes';

  static const _audioDevices = MethodChannel('vellin/audio_devices');

  String? _micId;
  String? _speakerId;
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

  String? get micId => _micId;
  String? get speakerId => _speakerId;
  String? get cameraId => _cameraId;
  bool get noiseSuppression => _noiseSuppression;
  bool get echoCancellation => _echoCancellation;
  bool get autoGain => _autoGain;

  /// Громкость собеседника: 0 — тишина, 1 — обычная, до 2 — громче обычного.
  double volumeFor(String userId) => _peerVolume[userId] ?? 1.0;

  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _micId = prefs.getString(_kMic);
      _speakerId = prefs.getString(_kSpeaker);
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

  Future<void> setSpeaker(String? id) async {
    if (_speakerId == id) return;
    _speakerId = id;
    notifyListeners();
    _changes.add(CallSettingsChange.audioOutput);
    await _remember(_kSpeaker, id);
  }

  Future<void> setCamera(String? id) async {
    if (_cameraId == id) return;
    _cameraId = id;
    notifyListeners();
    _changes.add(CallSettingsChange.videoInput);
    await _remember(_kCamera, id);
  }

  /// Сказать библиотеке, какие устройства брать. Отдельно от захвата: динамик
  /// иначе не переключить вовсе, а микрофон так подхватывается перезахватом.
  ///
  /// Работает, только когда звук уже идёт: до разговора звуковой модуль
  /// библиотеки устройств не знает и на выбор отвечает отказом. Поэтому вызов
  /// повторяется в начале каждого разговора.
  Future<void> applyAudioDevices() async {
    final mic = _micId;
    if (mic != null) {
      try {
        await Helper.selectAudioInput(mic);
      } catch (_) {
        // Устройство исчезло или звук ещё не идёт — останется системное.
      }
    }
    final speaker = _speakerId;
    if (speaker != null) {
      try {
        await Helper.selectAudioOutput(speaker);
      } catch (_) {
        // То же: без звука выбор не принимается, повторим со следующим звонком.
      }
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

  /// Ограничения захвата микрофона: выбранное устройство и обработка звука.
  /// И то, и другое задаётся только при захвате — у работающей дорожки их не
  /// поменять.
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
  ///
  /// Микрофоны и динамики берутся у Windows напрямую, а не у библиотеки
  /// звонков: та перечисляет их, только пока звук уже идёт, и до первого
  /// разговора её списки пусты. Опознаватели устройств у обеих сторон одни и те
  /// же, поэтому выбранное здесь библиотека потом принимает.
  static Future<CallDevices> devices() async {
    final cameras = <CallDevice>[];
    try {
      for (final d in await navigator.mediaDevices.enumerateDevices()) {
        if (d.kind != 'videoinput') continue;
        final label = d.label.trim();
        cameras.add(CallDevice(id: d.deviceId, label: label.isEmpty ? 'Камера' : label));
      }
    } catch (e) {
      debugPrint('[call] список камер не получен: $e');
    }

    try {
      final res = await _audioDevices.invokeMapMethod<String, dynamic>('list');
      List<CallDevice> parse(String key, String fallback) {
        final raw = res?[key];
        if (raw is! List) return const [];
        final out = <CallDevice>[];
        for (final item in raw) {
          if (item is! Map) continue;
          final id = item['id'];
          if (id is! String || id.isEmpty) continue;
          final label = (item['label'] as String? ?? '').trim();
          out.add(CallDevice(id: id, label: label.isEmpty ? fallback : label));
        }
        return out;
      }

      String? id(String key) {
        final v = res?[key];
        return v is String && v.isNotEmpty ? v : null;
      }

      return CallDevices(
        mics: parse('capture', 'Микрофон'),
        speakers: parse('render', 'Динамик'),
        cameras: cameras,
        defaultMicId: id('defaultCapture'),
        defaultSpeakerId: id('defaultRender'),
      );
    } catch (e) {
      debugPrint('[call] список звуковых устройств не получен: $e');
      return CallDevices(mics: const [], speakers: const [], cameras: cameras);
    }
  }

  @override
  void dispose() {
    _changes.close();
    super.dispose();
  }
}
