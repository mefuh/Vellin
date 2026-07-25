import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';
import 'package:visibility_detector/visibility_detector.dart';
import '../app_config.dart';
import '../theme/vellin_theme.dart';

/// Круглый бабл видео-кружка (поведение как в мессенджерах):
/// * пока кружок виден в диалоге — крутится по кругу **без звука**;
/// * тап — воспроизведение **с начала со звуком** (один раз);
/// * повторный тап — пауза, следующий — продолжить;
/// * доиграв со звуком, возвращается к беззвучному циклу.
///
/// Плеер создаётся только для видимых кружков и освобождается, когда кружок
/// уходит с экрана. Файл заранее скачивается во временный: прямой сетевой стрим
/// mpv на Windows падает с «Failed to create file cache», а предзагрузка ещё и
/// убирает задержку старта.
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
  final _visibilityKey = UniqueKey();

  Player? _player;
  VideoController? _controller;
  final List<StreamSubscription> _subs = [];
  Future<String>? _download;

  bool _starting = false; // идёт создание плеера
  bool _sound = false; // играет со звуком (после тапа)
  bool _paused = false; // поставлен на паузу тапом
  bool _failed = false;

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

  @override
  void dispose() {
    _teardown();
    super.dispose();
  }

  /// Тихо скачать файл заранее, чтобы старт был мгновенным.
  void _prefetch() {
    if (_download != null || widget.status != 'ready' || widget.videoUrl == null) return;
    final url = AppConfig.mediaUrl(widget.videoUrl);
    if (url == null) return;
    _download = _ensureLocal(url);
    _download!.catchError((Object e) {
      _download = null; // повторим позже
      return '';
    });
  }

  Future<String> _ensureLocal(String url) async {
    final f = File('${Directory.systemTemp.path}${Platform.pathSeparator}vellin_circle_${url.hashCode}.mp4');
    if (await f.exists() && await f.length() > 0) return f.path;
    final res = await http.get(Uri.parse(url));
    if (res.statusCode != 200) throw Exception('HTTP ${res.statusCode}');
    await f.writeAsBytes(res.bodyBytes);
    return f.path;
  }

  void _teardown() {
    for (final s in _subs) {
      s.cancel();
    }
    _subs.clear();
    _player?.dispose();
    _player = null;
    _controller = null;
    _sound = false;
    _paused = false;
  }

  /// Кружок появился/скрылся в списке: видимый — крутим беззвучно, скрытый —
  /// освобождаем плеер.
  void _onVisibilityChanged(VisibilityInfo info) {
    if (!mounted) return;
    final visible = info.visibleFraction > 0.3;
    if (visible) {
      _startSilentLoop();
    } else if (_player != null) {
      setState(_teardown);
    }
  }

  /// Создать плеер и запустить беззвучный цикл.
  Future<void> _startSilentLoop() async {
    if (_player != null || _starting || widget.status != 'ready') return;
    _prefetch();
    if (_download == null) return;
    _starting = true;

    String path;
    try {
      path = await _download!;
      if (path.isEmpty) throw Exception('download failed');
    } catch (_) {
      _starting = false;
      if (mounted) setState(() => _failed = true);
      return;
    }
    // Пока качали, кружок мог уйти с экрана или виджет — исчезнуть.
    if (!mounted) {
      _starting = false;
      return;
    }

    final p = Player();
    final c = VideoController(p);
    _player = p;
    _controller = c;

    // Доиграл со звуком → возвращаемся к беззвучному циклу.
    _subs.add(p.stream.completed.listen((done) {
      if (done && mounted && _sound) _backToSilentLoop();
    }));

    // Дисковый кэш mpv не нужен для локального файла (и его создание падает).
    final platform = p.platform;
    if (platform is NativePlayer) {
      try { await platform.setProperty('cache-on-disk', 'no'); } catch (_) {}
    }

    await p.setVolume(0);
    await p.setPlaylistMode(PlaylistMode.single); // зациклить
    await p.open(Media(path));
    _starting = false;
    if (mounted) setState(() {});
  }

  Future<void> _backToSilentLoop() async {
    final p = _player;
    if (p == null) return;
    setState(() { _sound = false; _paused = false; });
    await p.setVolume(0);
    await p.setPlaylistMode(PlaylistMode.single);
    await p.seek(Duration.zero);
    await p.play();
  }

  /// Тап: беззвучный цикл → играть с начала со звуком; со звуком → пауза;
  /// на паузе → продолжить.
  Future<void> _onTap() async {
    final p = _player;
    if (p == null) {
      _startSilentLoop();
      return;
    }
    if (!_sound) {
      setState(() { _sound = true; _paused = false; });
      await p.setPlaylistMode(PlaylistMode.none); // со звуком — один раз
      await p.seek(Duration.zero);
      await p.setVolume(100);
      await p.play();
    } else if (!_paused) {
      setState(() => _paused = true);
      await p.pause();
    } else {
      setState(() => _paused = false);
      await p.play();
    }
  }

  @override
  Widget build(BuildContext context) {
    Widget inner;
    if (widget.status == 'processing') {
      inner = _circleOverlay(const CircularProgressIndicator(color: Colors.white, strokeWidth: 2), 'обрабатывается');
    } else if (widget.status == 'failed' || _failed) {
      inner = _circleOverlay(const Icon(Icons.error_outline, color: Colors.white70, size: 28), 'ошибка');
    } else if (_controller != null) {
      inner = Stack(fit: StackFit.expand, children: [
        Video(controller: _controller!, fit: BoxFit.cover, controls: NoVideoControls),
        if (_paused)
          Container(
            color: Colors.black.withValues(alpha: 0.3),
            child: const Center(child: Icon(Icons.play_arrow_rounded, color: Colors.white, size: 46)),
          )
        else if (!_sound)
          // Беззвучный цикл — ненавязчивый значок «без звука». По центру снизу:
          // в углах круга ничего не поместить, ClipOval их срезает.
          Positioned(
            left: 0,
            right: 0,
            bottom: 12,
            child: Center(
              child: Container(
                padding: const EdgeInsets.all(5),
                decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.45), shape: BoxShape.circle),
                child: const Icon(Icons.volume_off_rounded, color: Colors.white, size: 15),
              ),
            ),
          ),
      ]);
    } else {
      // Постер, пока плеер не готов.
      final thumb = AppConfig.mediaUrl(widget.thumbUrl);
      inner = Stack(fit: StackFit.expand, children: [
        if (thumb != null)
          Image.network(thumb, fit: BoxFit.cover, errorBuilder: (_, _, _) => Container(color: VellinColors.bg3))
        else
          Container(color: VellinColors.bg3),
        Container(color: Colors.black.withValues(alpha: 0.25)),
        const Center(child: Icon(Icons.play_circle_fill, color: Colors.white, size: 44)),
      ]);
    }

    return VisibilityDetector(
      key: _visibilityKey,
      onVisibilityChanged: _onVisibilityChanged,
      child: GestureDetector(
        onTap: widget.status == 'ready' ? _onTap : null,
        child: ClipOval(
          child: Container(
            width: _size,
            height: _size,
            color: VellinColors.bg3,
            child: inner,
          ),
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
