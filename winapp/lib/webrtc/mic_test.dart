import 'dart:async';

import 'package:record/record.dart';

import '../runtime/media_gate.dart';
import 'call_settings.dart';

/// Проверка микрофона: живая шкала уровня, по которой видно, что устройство
/// выбрано верно и голос до него доходит.
///
/// Уровень берётся двумя разными путями, потому что микрофон монопольный:
/// в разговоре его держит WebRTC и открыть второй раз нельзя — там уровень
/// читается из статистики самого звонка. Вне разговора устройство свободно, и
/// его слушает `record`, тот же, что пишет голосовые.
class MicTest {
  /// Откуда брать уровень во время разговора. Возвращает 0..1 или null, если
  /// статистика недоступна.
  final Future<double?> Function()? fromCall;

  /// Какой микрофон слушать вне разговора.
  final String? micId;

  MicTest({this.fromCall, this.micId});

  final _levels = StreamController<double>.broadcast();
  AudioRecorder? _recorder;
  StreamSubscription<Amplitude>? _amplitudes;
  StreamSubscription<List<int>>? _bytes;
  Timer? _poll;
  bool _running = false;

  /// Уровень 0..1, примерно 10 раз в секунду.
  Stream<double> get levels => _levels.stream;

  /// Идёт ли проверка.
  bool get running => _running;

  /// Начать. Возвращает false, если микрофон занят: во время записи голосового
  /// или кружка слушать его нечем.
  Future<bool> start() async {
    if (_running) return true;
    _running = true;

    if (fromCall != null) {
      _poll = Timer.periodic(const Duration(milliseconds: 150), (_) async {
        final level = await fromCall!();
        if (_running) _levels.add(level ?? 0);
      });
      return true;
    }

    if (!MediaGate.instance.beginRecording(stop)) {
      _running = false;
      return false;
    }

    try {
      final recorder = AudioRecorder();
      _recorder = recorder;
      // Устройство ищем по названию: у `record` свои идентификаторы, они не
      // совпадают с теми, которыми устройства зовёт WebRTC. Не нашли — слушаем
      // системный микрофон по умолчанию.
      final device = await _matchDevice(recorder);
      final stream = await recorder.startStream(
        RecordConfig(encoder: AudioEncoder.pcm16bits, device: device),
      );
      // Сами отсчёты не нужны — важен только уровень, — но поток надо забирать,
      // иначе запись встанет.
      _bytes = stream.listen((_) {});
      _amplitudes = recorder
          .onAmplitudeChanged(const Duration(milliseconds: 120))
          .listen((a) => _levels.add(_normalize(a.current)));
      return true;
    } catch (_) {
      await stop();
      return false;
    }
  }

  Future<InputDevice?> _matchDevice(AudioRecorder recorder) async {
    final id = micId;
    if (id == null) return null;
    try {
      String? wanted;
      for (final m in (await CallSettings.devices()).mics) {
        if (m.id == id) wanted = m.label;
      }
      if (wanted == null) return null;
      final devices = await recorder.listInputDevices();
      for (final d in devices) {
        if (d.label.trim() == wanted.trim()) return d;
      }
    } catch (_) {
      // Списка нет — сойдёт устройство по умолчанию.
    }
    return null;
  }

  /// Из децибел в долю шкалы. Тишина у `record` — около −45 дБ, крик — 0.
  double _normalize(double db) {
    if (db.isNaN || db.isInfinite) return 0;
    return ((db + 45) / 45).clamp(0.0, 1.0);
  }

  Future<void> stop() async {
    if (!_running) return;
    _running = false;
    _poll?.cancel();
    _poll = null;
    await _amplitudes?.cancel();
    _amplitudes = null;
    await _bytes?.cancel();
    _bytes = null;
    final recorder = _recorder;
    _recorder = null;
    if (recorder != null) {
      try {
        await recorder.stop();
      } catch (_) {
        // Запись уже оборвана.
      }
      try {
        await recorder.dispose();
      } catch (_) {
        // Освободится вместе с приложением.
      }
      MediaGate.instance.endRecording();
    }
  }

  Future<void> dispose() async {
    await stop();
    await _levels.close();
  }
}
