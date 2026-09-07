import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:media_kit/media_kit.dart';

/// Что играет: голосовое из переписки.
@immutable
class PlaybackItem {
  final String messageId;

  /// Диалог, которому принадлежит запись, — по нему мини-плеер понимает,
  /// открыт ли «свой» чат.
  final String peerPublicId;
  final String peerName;
  final String? peerAvatarUrl;

  final String url;
  final int durationSec;
  final List<int> peaks;

  const PlaybackItem({
    required this.messageId,
    required this.peerPublicId,
    required this.peerName,
    required this.peerAvatarUrl,
    required this.url,
    required this.durationSec,
    required this.peaks,
  });
}

/// Один плеер на всё приложение.
///
/// Раньше каждый баббл держал свой `Player`: звук обрывался, стоило уйти из
/// переписки, и на длинном списке движок поднимался десятки раз. Теперь
/// воспроизведение живёт здесь, а бабблы только показывают его состояние.
class PlaybackController extends ChangeNotifier {
  Player? _player;
  final _subs = <StreamSubscription>[];

  PlaybackItem? _item;
  bool _playing = false;
  Duration _pos = Duration.zero;
  double _speed = 1;

  PlaybackItem? get item => _item;
  bool get playing => _playing;
  Duration get position => _pos;
  double get speed => _speed;

  /// Доля проигранного 0..1 для дорожки и полосы мини-плеера.
  double get progress {
    final total = _item?.durationSec ?? 0;
    if (total <= 0) return 0;
    return (_pos.inMilliseconds / (total * 1000)).clamp(0.0, 1.0);
  }

  bool isCurrent(String messageId) => _item?.messageId == messageId;

  /// Запустить запись. Та же — переключает паузу.
  Future<void> play(PlaybackItem next) async {
    if (_item?.messageId == next.messageId) {
      await toggle();
      return;
    }
    await _teardown();
    _item = next;
    _pos = Duration.zero;
    notifyListeners();

    try {
      final path = await _ensureLocal(next.url);
      final p = Player();
      _player = p;
      _subs.add(p.stream.playing.listen((v) {
        _playing = v;
        notifyListeners();
      }));
      _subs.add(p.stream.position.listen((v) {
        _pos = v;
        notifyListeners();
      }));
      _subs.add(p.stream.completed.listen((done) {
        if (!done) return;
        _pos = Duration.zero;
        _playing = false;
        notifyListeners();
      }));
      final platform = p.platform;
      if (platform is NativePlayer) {
        try {
          await platform.setProperty('cache-on-disk', 'no');
        } catch (_) {}
      }
      await p.open(Media(path));
      await p.setRate(_speed);
    } catch (_) {
      // Не удалось скачать или открыть — просто снимаем запись с плеера.
      _item = null;
      notifyListeners();
    }
  }

  Future<void> toggle() async {
    final p = _player;
    if (p == null) return;
    if (_playing) {
      await p.pause();
      return;
    }
    final total = _item?.durationSec ?? 0;
    if (total > 0 && _pos.inSeconds >= total) await p.seek(Duration.zero);
    await p.play();
  }

  /// Перемотка по клику в дорожку.
  Future<void> seekFraction(double fraction) async {
    final total = _item?.durationSec ?? 0;
    if (_player == null || total <= 0) return;
    await _player!.seek(Duration(milliseconds: (total * 1000 * fraction.clamp(0, 1)).round()));
  }

  /// Скорость по кругу: 1× → 1,5× → 2× → 0,5× → 0,75× → 1×.
  Future<void> cycleSpeed() async {
    const order = [1.0, 1.5, 2.0, 0.5, 0.75];
    final next = order[(order.indexOf(_speed) + 1) % order.length];
    _speed = next;
    await _player?.setRate(next);
    notifyListeners();
  }

  Future<void> stop() async {
    await _teardown();
    _item = null;
    _pos = Duration.zero;
    _playing = false;
    notifyListeners();
  }

  Future<void> _teardown() async {
    for (final s in _subs) {
      await s.cancel();
    }
    _subs.clear();
    await _player?.dispose();
    _player = null;
    _playing = false;
  }

  /// Файл кладём во временный и играем с диска: сетевой стрим mpv на Windows
  /// и медленный, и падает с «Failed to create file cache».
  static Future<String> _ensureLocal(String url) async {
    final f = File('${Directory.systemTemp.path}${Platform.pathSeparator}vellin_voice_${url.hashCode}.audio');
    if (await f.exists() && await f.length() > 0) return f.path;
    final res = await http.get(Uri.parse(url));
    if (res.statusCode != 200) throw Exception('HTTP ${res.statusCode}');
    await f.writeAsBytes(res.bodyBytes);
    return f.path;
  }

  @override
  void dispose() {
    _teardown();
    super.dispose();
  }
}
