import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';
import '../app_config.dart';
import '../theme/vellin_theme.dart';

/// Круглый бабл видео-кружка. processing — спиннер; ready — по тапу играет
/// видео (media_kit) зациклено в круге; failed — иконка ошибки.
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
  bool _started = false;

  @override
  void dispose() {
    _player?.dispose();
    super.dispose();
  }

  Future<void> _play() async {
    if (_started || widget.videoUrl == null) return;
    final p = Player();
    final c = VideoController(p);
    _player = p;
    _controller = c;
    await p.setPlaylistMode(PlaylistMode.single); // зациклить кружок
    await p.open(Media(AppConfig.mediaUrl(widget.videoUrl)!));
    if (mounted) setState(() => _started = true);
  }

  @override
  Widget build(BuildContext context) {
    Widget inner;
    if (widget.status == 'processing') {
      inner = _circleOverlay(const CircularProgressIndicator(color: Colors.white, strokeWidth: 2), 'обрабатывается');
    } else if (widget.status == 'failed') {
      inner = _circleOverlay(const Icon(Icons.error_outline, color: Colors.white70, size: 28), 'ошибка');
    } else if (_started && _controller != null) {
      inner = Video(controller: _controller!, fit: BoxFit.cover, controls: NoVideoControls);
    } else {
      // ready, ещё не запущено — постер + кнопка play.
      final thumb = AppConfig.mediaUrl(widget.thumbUrl);
      inner = Stack(fit: StackFit.expand, children: [
        if (thumb != null) Image.network(thumb, fit: BoxFit.cover, errorBuilder: (_, _, _) => Container(color: VellinColors.bg3)) else Container(color: VellinColors.bg3),
        const Center(child: Icon(Icons.play_circle_fill, color: Colors.white, size: 44)),
      ]);
    }

    return GestureDetector(
      onTap: widget.status == 'ready' && !_started ? _play : null,
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
