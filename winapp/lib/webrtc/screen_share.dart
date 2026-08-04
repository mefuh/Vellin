import 'dart:async';

import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Что демонстрировать: весь экран или отдельное окно.
enum ScreenShareKind { screen, window }

/// Разрешение картинки. Ограничение задаётся и захвату, и отправителю: без
/// потолка Full HD 60 забивает канал, и первым начинает рваться звук.
enum ScreenResolution { low, medium, high }

extension ScreenResolutionInfo on ScreenResolution {
  int get width => switch (this) {
        ScreenResolution.low => 854,
        ScreenResolution.medium => 1280,
        ScreenResolution.high => 1920,
      };

  int get height => switch (this) {
        ScreenResolution.low => 480,
        ScreenResolution.medium => 720,
        ScreenResolution.high => 1080,
      };

  String get label => switch (this) {
        ScreenResolution.low => '480p',
        ScreenResolution.medium => '720p',
        ScreenResolution.high => '1080p',
      };

  /// Потолок битрейта, бит/с. Чем крупнее картинка и чаще кадры, тем больше
  /// нужно, но выше этих значений выигрыш уже незаметен, а канал страдает.
  int maxBitrate(int fps) => switch (this) {
        ScreenResolution.low => fps >= 60 ? 2000000 : 1500000,
        ScreenResolution.medium => fps >= 60 ? 4000000 : 3000000,
        ScreenResolution.high => fps >= 60 ? 8000000 : 6000000,
      };
}

/// Настройки, с которыми пользователь запускает демонстрацию.
class ScreenShareOptions {
  final ScreenResolution resolution;
  final int fps;
  final bool withAudio;

  const ScreenShareOptions({
    this.resolution = ScreenResolution.medium,
    this.fps = 30,
    this.withAudio = true,
  });

  ScreenShareOptions copyWith({ScreenResolution? resolution, int? fps, bool? withAudio}) =>
      ScreenShareOptions(
        resolution: resolution ?? this.resolution,
        fps: fps ?? this.fps,
        withAudio: withAudio ?? this.withAudio,
      );
}

/// Запомненные между запусками настройки демонстрации: человек выбирает
/// качество один раз, а потом просто нажимает кнопку.
class ScreenShareSettings {
  static const _kResolution = 'vellin_screen_resolution';
  static const _kFps = 'vellin_screen_fps';
  static const _kAudio = 'vellin_screen_audio';

  static Future<ScreenShareOptions> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final res = prefs.getInt(_kResolution);
      return ScreenShareOptions(
        resolution: res != null && res >= 0 && res < ScreenResolution.values.length
            ? ScreenResolution.values[res]
            : ScreenResolution.medium,
        fps: prefs.getInt(_kFps) ?? 30,
        withAudio: prefs.getBool(_kAudio) ?? true,
      );
    } catch (_) {
      return const ScreenShareOptions();
    }
  }

  static Future<void> save(ScreenShareOptions o) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setInt(_kResolution, o.resolution.index);
      await prefs.setInt(_kFps, o.fps);
      await prefs.setBool(_kAudio, o.withAudio);
    } catch (_) {
      // Не сохранилось — в следующий раз просто предложим значения по умолчанию.
    }
  }
}

/// Источник захвата: экран или окно, с миниатюрой для выбора.
class ScreenShareSource {
  final String id;
  final String name;
  final ScreenShareKind kind;
  final DesktopCapturerSource raw;

  const ScreenShareSource({
    required this.id,
    required this.name,
    required this.kind,
    required this.raw,
  });
}

/// Идущая демонстрация: что показываем и какими дорожками.
class ActiveScreenShare {
  final ScreenShareSource source;
  final ScreenShareOptions options;
  final MediaStream stream;
  final MediaStreamTrack videoTrack;
  final MediaStreamTrack? audioTrack;

  const ActiveScreenShare({
    required this.source,
    required this.options,
    required this.stream,
    required this.videoTrack,
    required this.audioTrack,
  });

  /// Звук идёт, только если его удалось захватить: на старых сборках Windows
  /// перехват системного звука недоступен, и демонстрация идёт молча.
  bool get hasAudio => audioTrack != null;
}

/// Захват экрана для звонков. Живёт отдельно от соединения: соединение только
/// отправляет готовые дорожки, а откуда они взялись — забота этого модуля.
class ScreenShare {
  /// Перечислить, что можно показать. Миниатюры приходят вместе со списком.
  static Future<List<ScreenShareSource>> sources() async {
    // Оба типа — одним запросом: захват помнит только последний запрошенный
    // список, и раздельные вызовы затирали экраны окнами. После такого захват
    // экрана падал с «источник не найден».
    final found = await desktopCapturer.getSources(
      types: [SourceType.Screen, SourceType.Window],
      // Размер миниатюры нужно назвать явно, иначе картинки не приходят и в
      // выборе остаются пустые карточки.
      thumbnailSize: ThumbnailSize(320, 180),
    );
    final result = <ScreenShareSource>[];
    for (final s in found) {
      final isScreen = s.type == SourceType.Screen;
      result.add(ScreenShareSource(
        id: s.id,
        name: s.name.trim().isEmpty ? (isScreen ? 'Экран' : 'Окно') : s.name.trim(),
        kind: isScreen ? ScreenShareKind.screen : ScreenShareKind.window,
        raw: s,
      ));
    }
    return result;
  }

  /// Обновить миниатюры уже показанного списка.
  static Future<void> refreshThumbnails() async {
    try {
      await desktopCapturer.updateSources(types: [SourceType.Screen, SourceType.Window]);
    } catch (_) {
      // Список просто останется прежним.
    }
  }

  /// Начать захват. Звук запрашивается вместе с картинкой: при захвате экрана
  /// это весь звук системы, при захвате окна — звук только этого приложения.
  static Future<ActiveScreenShare> start({
    required ScreenShareSource source,
    required ScreenShareOptions options,
  }) async {
    Future<MediaStream> capture({required bool withAudio}) {
      return navigator.mediaDevices.getDisplayMedia({
        if (withAudio) 'audio': {'deviceId': source.id},
        'video': {
          'deviceId': {'exact': source.id},
          'mandatory': {
            'frameRate': options.fps.toDouble(),
            'maxWidth': options.resolution.width,
            'maxHeight': options.resolution.height,
          },
        },
      });
    }

    // Захват ищет источник в последнем запрошенном списке, а тот мог устареть
    // (окно закрылось, список пересобрался) — перечитываем перед стартом.
    await sources();
    MediaStream stream;
    try {
      stream = await capture(withAudio: options.withAudio);
    } catch (_) {
      // Звук перехватить не удалось (старая сборка Windows, занятое
      // устройство) — демонстрация важнее, показываем её без звука.
      if (!options.withAudio) rethrow;
      stream = await capture(withAudio: false);
    }

    final video = stream.getVideoTracks().first;
    final audio = stream.getAudioTracks().isNotEmpty ? stream.getAudioTracks().first : null;
    return ActiveScreenShare(
      source: source,
      options: options,
      stream: stream,
      videoTrack: video,
      audioTrack: audio,
    );
  }

  /// Остановить захват. Каждый шаг сам по себе: сорвавшийся не должен мешать
  /// остальным — иначе демонстрация «зависает» у собеседника.
  static Future<void> stop(ActiveScreenShare share) async {
    for (final t in [share.videoTrack, share.audioTrack]) {
      if (t == null) continue;
      try {
        await t.stop();
      } catch (_) {
        // Дорожка уже мертва.
      }
    }
    try {
      await share.stream.dispose();
    } catch (_) {
      // Поток уже освобождён.
    }
  }
}
