import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:media_kit/media_kit.dart';
import 'package:visibility_detector/visibility_detector.dart';
import '../theme/vellin_theme.dart';

/// Плеер голосового сообщения: кнопка play/pause, волна из пиков с прогрессом и
/// длительность.
///
/// Чтобы старт был мгновенным, для видимых голосовых файл заранее скачивается
/// во временный, а плеер открывается **на паузе** ещё до тапа — тап сводится к
/// `play()`. Сетевой стрим mpv на Windows тут не используется: он и медленный,
/// и падает с «Failed to create file cache». Ушло с экрана — плеер
/// освобождается, чтобы не держать движок на каждый бабл.
class VoiceBubble extends StatefulWidget {
  final String url;
  final int durationSec;
  final List<int> peaks;
  final bool mine;

  const VoiceBubble({
    super.key,
    required this.url,
    required this.durationSec,
    required this.peaks,
    required this.mine,
  });

  @override
  State<VoiceBubble> createState() => _VoiceBubbleState();
}

class _VoiceBubbleState extends State<VoiceBubble> {
  final _visibilityKey = UniqueKey();
  Player? _player;
  final _subs = <StreamSubscription>[];
  Future<String>? _download;
  bool _preparing = false;
  bool _playing = false;
  Duration _pos = Duration.zero;

  Color get _fg => widget.mine ? Colors.white : VellinColors.text0;
  Color get _muted => widget.mine ? Colors.white54 : VellinColors.text3;

  @override
  void initState() {
    super.initState();
    _prefetch();
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
    _playing = false;
    _pos = Duration.zero;
  }

  void _prefetch() {
    if (_download != null) return;
    _download = _ensureLocal(widget.url);
    _download!.catchError((Object e) {
      _download = null; // повторим позже
      return '';
    });
  }

  Future<String> _ensureLocal(String url) async {
    final f = File('${Directory.systemTemp.path}${Platform.pathSeparator}vellin_voice_${url.hashCode}.audio');
    if (await f.exists() && await f.length() > 0) return f.path;
    final res = await http.get(Uri.parse(url));
    if (res.statusCode != 200) throw Exception('HTTP ${res.statusCode}');
    await f.writeAsBytes(res.bodyBytes);
    return f.path;
  }

  void _onVisibilityChanged(VisibilityInfo info) {
    if (!mounted) return;
    if (info.visibleFraction > 0.3) {
      _prepare();
    } else if (_player != null && !_playing) {
      // Играющее не трогаем: звук должен продолжаться при прокрутке.
      setState(_teardown);
    }
  }

  /// Заранее открыть плеер на паузе, чтобы тап стартовал мгновенно.
  Future<void> _prepare() async {
    if (_player != null || _preparing) return;
    _preparing = true;
    try {
      _prefetch();
      final path = await _download!;
      if (path.isEmpty || !mounted) return;

      final p = Player();
      _player = p;
      _subs.add(p.stream.playing.listen((v) {
        if (mounted) setState(() => _playing = v);
      }));
      _subs.add(p.stream.position.listen((v) {
        if (mounted) setState(() => _pos = v);
      }));
      _subs.add(p.stream.completed.listen((done) {
        if (done && mounted) setState(() => _pos = Duration.zero);
      }));

      final platform = p.platform;
      if (platform is NativePlayer) {
        try { await platform.setProperty('cache-on-disk', 'no'); } catch (_) {}
      }
      await p.open(Media(path), play: false); // готов к мгновенному старту
      if (mounted) setState(() {});
    } catch (_) {
      // Останется ленивый старт по тапу.
    } finally {
      _preparing = false;
    }
  }

  Future<void> _toggle() async {
    final p = _player;
    if (p == null) {
      await _prepare();
      await _player?.play();
      return;
    }
    if (_playing) {
      await p.pause();
    } else {
      // Доиграл до конца — начинаем сначала.
      if (widget.durationSec > 0 && _pos.inSeconds >= widget.durationSec) {
        await p.seek(Duration.zero);
      }
      await p.play();
    }
  }

  String _fmt(int totalSec) => '${(totalSec ~/ 60).toString().padLeft(1, '0')}:${(totalSec % 60).toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final total = widget.durationSec > 0 ? widget.durationSec : 0;
    final progress = total > 0 ? (_pos.inMilliseconds / (total * 1000)).clamp(0.0, 1.0) : 0.0;
    final label = _playing || _pos > Duration.zero ? _fmt(_pos.inSeconds) : _fmt(total);

    return VisibilityDetector(
      key: _visibilityKey,
      onVisibilityChanged: _onVisibilityChanged,
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        GestureDetector(
          onTap: _toggle,
          child: Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: widget.mine ? Colors.white24 : VellinColors.bg3,
              shape: BoxShape.circle,
            ),
            child: Icon(_playing ? Icons.pause : Icons.play_arrow, color: _fg, size: 20),
          ),
        ),
        const SizedBox(width: 10),
        SizedBox(
          width: 156,
          height: 30,
          child: CustomPaint(
            painter: _WavePainter(
              peaks: widget.peaks,
              progress: progress,
              active: widget.mine ? Colors.white : VellinColors.accentHi,
              inactive: _muted,
            ),
          ),
        ),
        const SizedBox(width: 10),
        // Фиксированная ширина: цифры не «прыгают» при смене 0:09 → 0:10.
        SizedBox(
          width: 34,
          child: Text(label, textAlign: TextAlign.right, style: TextStyle(color: _muted, fontSize: 12)),
        ),
      ]),
    );
  }
}

class _WavePainter extends CustomPainter {
  final List<int> peaks;
  final double progress;
  final Color active;
  final Color inactive;
  _WavePainter({required this.peaks, required this.progress, required this.active, required this.inactive});

  /// Привести пики к нужному числу столбиков (усреднением по окну).
  static List<int> _resample(List<int> src, int target) {
    if (src.length <= target) return src;
    final out = <int>[];
    final step = src.length / target;
    for (var i = 0; i < target; i++) {
      final a = (i * step).floor();
      final b = ((i + 1) * step).ceil().clamp(a + 1, src.length);
      var sum = 0;
      for (var j = a; j < b; j++) {
        sum += src[j];
      }
      out.add(sum ~/ (b - a));
    }
    return out;
  }

  @override
  void paint(Canvas canvas, Size size) {
    // Раскладка считается ОТ доступной ширины: столбиков ровно столько, сколько
    // помещается, иначе волна вылезает за блок и наезжает на длительность.
    const pitch = 4.0; // шаг между центрами столбиков
    final count = (size.width / pitch).floor().clamp(12, 64);
    final source = peaks.isNotEmpty ? peaks : List<int>.filled(count, 30);
    final bars = _resample(source, count);
    final n = bars.length;
    final step = size.width / n;
    final barW = (step * 0.55).clamp(1.5, 3.0);
    final activeCount = (progress * n).round();
    final paint = Paint()..strokeCap = StrokeCap.round;
    for (var i = 0; i < n; i++) {
      // Минимум 12% высоты — тишина тоже читается как волна, а не как пропуск.
      final h = (bars[i].clamp(0, 100) / 100).clamp(0.12, 1.0) * size.height;
      final x = i * step + step / 2;
      final y0 = (size.height - h) / 2;
      paint.color = i < activeCount ? active : inactive;
      paint.strokeWidth = barW;
      canvas.drawLine(Offset(x, y0), Offset(x, y0 + h), paint);
    }
  }

  @override
  bool shouldRepaint(covariant _WavePainter old) => old.progress != progress || old.peaks != peaks;
}
