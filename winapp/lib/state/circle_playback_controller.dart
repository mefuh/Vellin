import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';

/// Кружок, который сейчас смотрят со звуком.
@immutable
class CircleItem {
  final String messageId;

  /// Уже скачанный локальный файл: баббл качает его заранее, и второй раз
  /// ходить в сеть незачем.
  final String path;

  /// Диалог и собеседник — их показывает мини-плеер, как у голосовых.
  final String peerPublicId;
  final String peerName;
  final String? peerAvatarUrl;

  /// Свой кружок — в плеере он подписан «Вы».
  final bool mine;

  const CircleItem({
    required this.messageId,
    required this.path,
    required this.peerPublicId,
    required this.peerName,
    required this.peerAvatarUrl,
    required this.mine,
  });
}

/// Озвученное воспроизведение видео-кружков — одно на всё приложение.
///
/// Беззвучный цикл остаётся у самого баббла: он привязан к видимости и живёт
/// столько же, сколько строка в ленте. А кружок, который включили со звуком,
/// должен пережить уход строки за край экрана — иначе он обрывался бы на
/// полуслове от одного движения колеса. Поэтому его плеер живёт здесь, а
/// картинку рисует либо баббл, либо всплывающее окошко.
class CirclePlaybackController extends ChangeNotifier {
  Player? _player;
  VideoController? _controller;
  final _subs = <StreamSubscription>[];

  CircleItem? _item;
  bool _playing = false;
  Duration _position = Duration.zero;
  Duration _duration = Duration.zero;

  /// Скорость воспроизведения — общая с голосовыми по набору значений.
  double _speed = 1;

  /// Виден ли сейчас баббл этого кружка в ленте. Пока виден — картинка у него,
  /// как только ушёл — всплывает окошко.
  bool _bubbleVisible = true;

  CircleItem? get item => _item;
  VideoController? get controller => _controller;
  bool get playing => _playing;
  bool get bubbleVisible => _bubbleVisible;
  Duration get position => _position;
  Duration get duration => _duration;
  double get speed => _speed;

  /// Показывать ли окошко: кружок играет, а его строки на экране нет.
  bool get pipVisible => _item != null && !_bubbleVisible;

  bool isCurrent(String messageId) => _item?.messageId == messageId;

  double get progress {
    if (_duration.inMilliseconds <= 0) return 0;
    return (_position.inMilliseconds / _duration.inMilliseconds).clamp(0.0, 1.0);
  }

  void setBubbleVisible(String messageId, bool visible) {
    if (!isCurrent(messageId) || _bubbleVisible == visible) return;
    _bubbleVisible = visible;
    // Оповещение — отдельной микрозадачей: строка сообщает об уходе из своего
    // dispose, а перестраивать дерево прямо в этот момент нельзя.
    scheduleMicrotask(notifyListeners);
  }

  /// Включить кружок со звуком с начала.
  Future<void> play(CircleItem next) async {
    await _teardown();
    _item = next;
    _bubbleVisible = true;
    _position = Duration.zero;
    notifyListeners();

    try {
      final p = Player();
      final c = VideoController(p);
      _player = p;
      _controller = c;

      _subs.add(p.stream.playing.listen((v) {
        _playing = v;
        notifyListeners();
      }));
      _subs.add(p.stream.position.listen((v) {
        _position = v;
        notifyListeners();
      }));
      _subs.add(p.stream.duration.listen((v) {
        _duration = v;
        notifyListeners();
      }));
      // Доиграл — снимаем с показа: кружок звучит один раз, дальше баббл сам
      // вернётся к беззвучному циклу.
      _subs.add(p.stream.completed.listen((done) {
        if (done) stop();
      }));

      // Дисковый кэш mpv для локального файла не нужен (и его создание падает).
      final platform = p.platform;
      if (platform is NativePlayer) {
        try {
          await platform.setProperty('cache-on-disk', 'no');
        } catch (_) {}
      }

      await p.setVolume(100);
      await p.open(Media(next.path));
      // Выбранная скорость держится между записями, как у голосовых.
      await p.setRate(_speed);
    } catch (_) {
      _item = null;
      _controller = null;
      notifyListeners();
    }
  }

  Future<void> toggle() async {
    final p = _player;
    if (p == null) return;
    if (_playing) {
      await p.pause();
    } else {
      await p.play();
    }
  }

  /// Скорость по кругу — тот же набор, что у голосовых.
  Future<void> cycleSpeed() async {
    const order = [1.0, 1.5, 2.0, 0.5, 0.75];
    final next = order[(order.indexOf(_speed) + 1) % order.length];
    _speed = next;
    await _player?.setRate(next);
    notifyListeners();
  }

  Future<void> stop() async {
    if (_item == null) return;
    await _teardown();
    _item = null;
    _position = Duration.zero;
    _duration = Duration.zero;
    _bubbleVisible = true;
    notifyListeners();
  }

  Future<void> _teardown() async {
    for (final s in _subs) {
      await s.cancel();
    }
    _subs.clear();
    final p = _player;
    _player = null;
    _controller = null;
    _playing = false;
    try {
      await p?.dispose();
    } catch (_) {}
  }

  @override
  void dispose() {
    _teardown();
    super.dispose();
  }
}
