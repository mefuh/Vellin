import 'dart:async';
import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';
import '../app_config.dart';
import '../theme/vellin_theme.dart';

/// Круглый бабл видео-кружка. processing — спиннер; ready — по тапу играет
/// видео (media_kit) в круге; failed — иконка ошибки.
///
/// Рендер: программное декодирование (enableHardwareAcceleration: false) —
/// аппаратное на Windows часто даёт «чёрный круг» (кадры не выводятся, слышно
/// только звук). Видео показывается лишь после первого кадра (до этого —
/// спиннер поверх постера), играет один раз, затем предлагает повтор.
class VideoBubble extends StatefulWidget {
  final String? status; // processing | ready | failed
  final String? videoUrl;
  final String? thumbUrl;

  const VideoBubble({super.key, required this.status, required this.videoUrl, required this.thumbUrl});

  @override
  State<VideoBubble> createState() => _VideoBubbleState();
}

class _VideoBubbleState extends State<VideoBubble> {
  static const double _size = 190;
  Player? _player;
  VideoController? _controller;
  final List<StreamSubscription> _subs = [];
  bool _loading = false; // открытие/буферизация — показываем спиннер
  bool _playing = false; // пошёл первый кадр — показываем Video

  @override
  void dispose() {
    _teardown();
    super.dispose();
  }

  void _teardown() {
    for (final s in _subs) {
      s.cancel();
    }
    _subs.clear();
    _player?.dispose();
    _player = null;
    _controller = null;
  }

  Future<void> _play() async {
    if (_loading || _playing || widget.videoUrl == null) return;
    setState(() => _loading = true);

    final p = Player();
    // Программное декодирование — надёжный вывод кадров на Windows.
    final c = VideoController(p, configuration: const VideoControllerConfiguration(enableHardwareAcceleration: false));
    _player = p;
    _controller = c;

    // Первый кадр (появились размеры видео) → прячем спиннер, показываем Video.
    _subs.add(p.stream.width.listen((w) {
      if (w != null && w > 0 && mounted && !_playing) {
        setState(() { _playing = true; _loading = false; });
      }
    }));
    // Доиграл до конца → возвращаем постер с кнопкой «повтор» (без зацикливания).
    _subs.add(p.stream.completed.listen((done) {
      if (done && mounted) {
        _teardown();
        setState(() { _playing = false; _loading = false; });
      }
    }));

    await p.setPlaylistMode(PlaylistMode.none); // играть один раз
    await p.open(Media(AppConfig.mediaUrl(widget.videoUrl)!)); // play: true по умолчанию
  }

  @override
  Widget build(BuildContext context) {
    Widget inner;
    if (widget.status == 'processing') {
      inner = _circleOverlay(const CircularProgressIndicator(color: Colors.white, strokeWidth: 2), 'обрабатывается');
    } else if (widget.status == 'failed') {
      inner = _circleOverlay(const Icon(Icons.error_outline, color: Colors.white70, size: 28), 'ошибка');
    } else if (_playing && _controller != null) {
      inner = Video(controller: _controller!, fit: BoxFit.cover, controls: NoVideoControls);
    } else {
      // ready: постер + оверлей (спиннер при загрузке или кнопка play).
      final thumb = AppConfig.mediaUrl(widget.thumbUrl);
      inner = Stack(fit: StackFit.expand, children: [
        if (thumb != null)
          Image.network(thumb, fit: BoxFit.cover, errorBuilder: (_, _, _) => Container(color: VellinColors.bg3))
        else
          Container(color: VellinColors.bg3),
        Container(color: Colors.black.withValues(alpha: 0.25)),
        Center(
          child: _loading
              ? const SizedBox(width: 32, height: 32, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5))
              : const Icon(Icons.play_circle_fill, color: Colors.white, size: 44),
        ),
      ]);
    }

    return GestureDetector(
      onTap: widget.status == 'ready' && !_playing && !_loading ? _play : null,
      child: ClipOval(
        child: Container(
          width: _size,
          height: _size,
          color: VellinColors.bg3,
          child: inner,
        ),
      ),
    );
  }

  Widget _circleOverlay(Widget icon, String label) {
    return Container(
      color: VellinColors.bg3,
      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        SizedBox(width: 28, height: 28, child: icon),
        const SizedBox(height: 8),
        Text(label, style: const TextStyle(color: VellinColors.text2, fontSize: 12)),
      ]),
    );
  }
}
