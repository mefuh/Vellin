import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';
import '../app_config.dart';
import '../theme/vellin_theme.dart';

/// Круглый бабл видео-кружка. processing — спиннер; ready — по тапу играет
/// видео (media_kit) в круге; failed — иконка ошибки.
///
/// Кружок заранее скачивается во временный файл и играется локально: прямой
/// сетевой стрим mpv на Windows падает с «Failed to create file cache», а
/// предзагрузка ещё и убирает задержку старта по тапу. Играет один раз, затем
/// возвращает постер с кнопкой повтора.
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
  bool _active = false; // плеер создан → показываем Video
  bool _buffering = false;
  bool _failed = false;
  Future<String>? _download; // предзагрузка файла (стартует сразу)

  @override
  void initState() {
    super.initState();
    _prefetch();
  }

  @override
  void didUpdateWidget(VideoBubble old) {
    super.didUpdateWidget(old);
    // Кружок дотранскодировался (processing → ready) — можно предзагружать.
    if (old.videoUrl != widget.videoUrl || old.status != widget.status) _prefetch();
  }

  /// Тихо скачать файл заранее, чтобы тап стартовал мгновенно.
  void _prefetch() {
    if (_download != null || widget.status != 'ready' || widget.videoUrl == null) return;
    final url = AppConfig.mediaUrl(widget.videoUrl);
    if (url == null) return;
    _download = _ensureLocal(url);
    _download!.catchError((Object e) {
      _download = null; // повторим по тапу
      return '';
    });
  }

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

  /// Скачать кружок во временный файл (переиспользуется при повторе).
  Future<String> _ensureLocal(String url) async {
    final f = File('${Directory.systemTemp.path}${Platform.pathSeparator}vellin_circle_${url.hashCode}.mp4');
    if (await f.exists() && await f.length() > 0) return f.path;
    final res = await http.get(Uri.parse(url));
    if (res.statusCode != 200) throw Exception('HTTP ${res.statusCode}');
    await f.writeAsBytes(res.bodyBytes);
    return f.path;
  }

  Future<void> _play() async {
    if (_active || widget.videoUrl == null) return;
    setState(() { _active = true; _buffering = true; _failed = false; });

    String path;
    try {
      _prefetch();
      path = await _download!;
      if (path.isEmpty) throw Exception('download failed');
    } catch (_) {
      if (mounted) setState(() { _active = false; _buffering = false; _failed = true; });
      return;
    }
    if (!mounted) return;

    final p = Player();
    final c = VideoController(p);
    _player = p;
    _controller = c;

    _subs.add(p.stream.buffering.listen((b) {
      if (mounted) setState(() => _buffering = b);
    }));
    // Доиграл до конца → постер с кнопкой «повтор» (без зацикливания).
    _subs.add(p.stream.completed.listen((done) {
      if (done && mounted) {
        _teardown();
        setState(() { _active = false; _buffering = false; });
      }
    }));

    // Дисковый кэш mpv не нужен для локального файла (и его создание падает).
    final platform = p.platform;
    if (platform is NativePlayer) {
      try { await platform.setProperty('cache-on-disk', 'no'); } catch (_) {}
    }

    await p.setPlaylistMode(PlaylistMode.none); // играть один раз
    await p.open(Media(path));
  }

  @override
  Widget build(BuildContext context) {
    Widget inner;
    if (widget.status == 'processing') {
      inner = _circleOverlay(const CircularProgressIndicator(color: Colors.white, strokeWidth: 2), 'обрабатывается');
    } else if (widget.status == 'failed' || _failed) {
      inner = _circleOverlay(const Icon(Icons.error_outline, color: Colors.white70, size: 28), 'ошибка');
    } else if (_active && _controller != null) {
      inner = Stack(fit: StackFit.expand, children: [
        Video(controller: _controller!, fit: BoxFit.cover, controls: NoVideoControls),
        if (_buffering)
          const Center(child: SizedBox(width: 30, height: 30, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5))),
      ]);
    } else {
      // ready: постер + кнопка play (или спиннер, пока готовится плеер).
      final thumb = AppConfig.mediaUrl(widget.thumbUrl);
      inner = Stack(fit: StackFit.expand, children: [
        if (thumb != null)
          Image.network(thumb, fit: BoxFit.cover, errorBuilder: (_, _, _) => Container(color: VellinColors.bg3))
        else
          Container(color: VellinColors.bg3),
        Container(color: Colors.black.withValues(alpha: 0.25)),
        Center(
          child: _active
              ? const SizedBox(width: 30, height: 30, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5))
              : const Icon(Icons.play_circle_fill, color: Colors.white, size: 44),
        ),
      ]);
    }

    return GestureDetector(
      onTap: widget.status == 'ready' && !_active ? _play : null,
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
