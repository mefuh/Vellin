import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:media_kit/media_kit.dart';

/// Звуки звонка: трель у того, кому звонят, и гудки у звонящего.
///
/// Звуковых файлов в поставке нет — тон синтезируется здесь и кладётся во
/// временный WAV, который media_kit крутит по кругу. Так же устроен веб (там
/// тон синтезирует WebAudio), и звучат обе стороны одинаково.
class CallTones {
  CallTones._();
  static final CallTones instance = CallTones._();

  Player? _player;
  String? _playing;

  static const _rate = 44100;

  /// Трель входящего звонка: два коротких сигнала и пауза, по кругу.
  Future<void> startRingtone() => _loop('ring', _ringtoneWav);

  /// Гудки дозвона: длинный сигнал раз в четыре секунды.
  Future<void> startRingback() => _loop('ringback', _ringbackWav);

  /// Короткий сигнал новой реплики. Разовый и на своём плеере, чтобы не сбить
  /// идущую трель звонка.
  Future<void> playMessage() async {
    try {
      final file = File(
        '${Directory.systemTemp.path}${Platform.pathSeparator}vellin_message.wav',
      );
      if (!await file.exists()) await file.writeAsBytes(_messageWav());
      final player = Player();
      await player.setVolume(45);
      await player.open(Media(file.path));
      // Отпускаем движок сами: ждать события окончания ради полусекунды незачем.
      Future.delayed(const Duration(seconds: 2), () async {
        try {
          await player.dispose();
        } catch (_) {}
      });
    } catch (_) {
      // Молча: сообщение и так видно в списке диалогов.
    }
  }

  Future<void> stop() async {
    _playing = null;
    final player = _player;
    _player = null;
    try {
      await player?.dispose();
    } catch (_) {}
  }

  Future<void> _loop(String kind, Uint8List Function() build) async {
    if (_playing == kind) return;
    await stop();
    _playing = kind;
    try {
      final file = File(
        '${Directory.systemTemp.path}${Platform.pathSeparator}vellin_$kind.wav',
      );
      if (!await file.exists()) await file.writeAsBytes(build());
      final player = Player();
      _player = player;
      await player.setPlaylistMode(PlaylistMode.loop);
      await player.setVolume(60);
      await player.open(Media(file.path));
    } catch (_) {
      // Без звука звонок всё равно виден: экран входящего никуда не денется.
      _playing = null;
    }
  }

  /// Цикл 2 с: сигнал — пауза — сигнал — тишина.
  static Uint8List _ringtoneWav() => _wav(2.0, (t) {
        final inBurst = (t < 0.3) || (t >= 0.4 && t < 0.7);
        if (!inBurst) return 0;
        return math.sin(2 * math.pi * 480 * t) * _fade(t < 0.3 ? t : t - 0.4, 0.3);
      });

  /// Цикл 4 с: секунда сигнала и три секунды тишины.
  static Uint8List _ringbackWav() => _wav(4.0, (t) {
        if (t >= 1.0) return 0;
        return math.sin(2 * math.pi * 425 * t) * _fade(t, 1.0) * 0.7;
      });

  /// Полсекунды: две быстрые ноты вверх — так сигнал не путается с трелью.
  static Uint8List _messageWav() => _wav(0.5, (t) {
        if (t < 0.11) return math.sin(2 * math.pi * 660 * t) * _fade(t, 0.11);
        if (t >= 0.13 && t < 0.28) {
          final u = t - 0.13;
          return math.sin(2 * math.pi * 880 * u) * _fade(u, 0.15) * 0.9;
        }
        return 0;
      });

  /// Плавные края сигнала: резкий обрыв синуса даёт щелчок.
  static double _fade(double t, double len) {
    const edge = 0.02;
    if (t < edge) return t / edge;
    if (t > len - edge) return (len - t) / edge;
    return 1;
  }

  /// Моно 16 бит — минимальный WAV, который media_kit точно прочитает.
  static Uint8List _wav(double seconds, double Function(double t) sample) {
    final frames = (seconds * _rate).round();
    final data = ByteData(frames * 2);
    for (var i = 0; i < frames; i++) {
      final v = (sample(i / _rate) * 0.35 * 32767).clamp(-32767.0, 32767.0);
      data.setInt16(i * 2, v.round(), Endian.little);
    }
    final body = data.buffer.asUint8List();

    final header = ByteData(44);
    void ascii(int offset, String s) {
      for (var i = 0; i < s.length; i++) {
        header.setUint8(offset + i, s.codeUnitAt(i));
      }
    }

    ascii(0, 'RIFF');
    header.setUint32(4, 36 + body.length, Endian.little);
    ascii(8, 'WAVE');
    ascii(12, 'fmt ');
    header.setUint32(16, 16, Endian.little); // размер блока формата
    header.setUint16(20, 1, Endian.little); // PCM
    header.setUint16(22, 1, Endian.little); // каналов
    header.setUint32(24, _rate, Endian.little);
    header.setUint32(28, _rate * 2, Endian.little); // байт в секунду
    header.setUint16(32, 2, Endian.little); // байт на кадр
    header.setUint16(34, 16, Endian.little); // бит на отсчёт
    ascii(36, 'data');
    header.setUint32(40, body.length, Endian.little);

    return Uint8List.fromList([...header.buffer.asUint8List(), ...body]);
  }
}
