import 'dart:async';
import 'dart:math' as math;
import 'dart:io';
import 'package:flutter/widgets.dart';
import 'package:http/http.dart' as http;
import 'package:media_kit/media_kit.dart';
import 'package:visibility_detector/visibility_detector.dart';
import '../theme/vellin_design.dart';
import '../theme/vellin_glyphs.dart';
import 'ui/vellin_icon.dart';

/// Плеер голосового сообщения: кнопка play/pause, дорожка из пиков с прогрессом,
/// длительность и точка «прослушано».
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

  /// Прослушано ли голосовое (у своих — собеседником, у чужих — мной).
  final bool played;

  /// Первый запуск чужого голосового — повод сказать об этом собеседнику.
  final VoidCallback? onFirstPlay;

  const VoiceBubble({
    super.key,
    required this.url,
    required this.durationSec,
    required this.peaks,
    required this.mine,
    this.played = false,
    this.onFirstPlay,
  });

  @override
  State<VoiceBubble> createState() => _VoiceBubbleState();
}

class _VoiceBubbleState extends State<VoiceBubble> with SingleTickerProviderStateMixin {
  final _visibilityKey = UniqueKey();
  Player? _player;
  final _subs = <StreamSubscription>[];
  Future<String>? _download;
  bool _preparing = false;
  bool _playing = false;
  bool _reported = false;
  Duration _pos = Duration.zero;

  /// Дыхание пройденных полосок во время игры.
  late final AnimationController _breath = AnimationController(
    vsync: this,
    duration: VellinMotion.voiceBars,
  );

  @override
  void initState() {
    super.initState();
    _prefetch();
  }

  @override
  void dispose() {
    _breath.dispose();
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
        if (!mounted) return;
        setState(() => _playing = v);
        if (v) {
          _breath.repeat(reverse: true);
        } else {
          _breath.stop();
        }
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
    if (!_reported) {
      _reported = true;
      widget.onFirstPlay?.call();
    }
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

  String _fmt(int totalSec) =>
      '${(totalSec ~/ 60).toString().padLeft(1, '0')}:${(totalSec % 60).toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final total = widget.durationSec > 0 ? widget.durationSec : 0;
    final progress = total > 0 ? (_pos.inMilliseconds / (total * 1000)).clamp(0.0, 1.0) : 0.0;
    final label = _playing || _pos > Duration.zero ? _fmt(_pos.inSeconds) : _fmt(total);
    final idle = widget.mine ? const Color(0x47E2C99B) : VellinColors.ink24;

    return VisibilityDetector(
      key: _visibilityKey,
      onVisibilityChanged: _onVisibilityChanged,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _PlayButton(playing: _playing, onTap: _toggle),
          const SizedBox(width: 10),
          AnimatedBuilder(
            animation: _breath,
            builder: (context, _) => SizedBox(
              width: 170,
              height: 24,
              child: CustomPaint(
                painter: _WavePainter(
                  peaks: widget.peaks,
                  progress: progress,
                  breath: _playing ? _breath.value : null,
                  active: VellinColors.accent,
                  inactive: idle,
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          // Фиксированная ширина: цифры не «прыгают» при смене 0:09 → 0:10.
          SizedBox(
            width: 30,
            child: Text(
              label,
              textAlign: TextAlign.right,
              style: TextStyle(
                fontFamily: VellinType.family,
                fontSize: 11,
                color: widget.mine ? const Color(0xA8E2C99B) : VellinColors.ink34,
                fontFeatures: VellinType.tabular,
              ),
            ),
          ),
          const SizedBox(width: 7),
          _PlayedDot(played: widget.played),
        ],
      ),
    );
  }
}

/// Кнопка воспроизведения 32: играет — золотая заливка с ореолом.
class _PlayButton extends StatelessWidget {
  final bool playing;
  final VoidCallback onTap;
  const _PlayButton({required this.playing, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: VellinMotion.state,
          curve: VellinMotion.standard,
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: playing ? const Color(0x33E2C99B) : VellinColors.fill045,
            border: Border.all(
              color: playing ? VellinColors.accentLineStrong : VellinColors.line07,
            ),
            boxShadow: playing
                ? const [BoxShadow(color: Color(0x12E2C99B), blurRadius: 0, spreadRadius: 5)]
                : null,
          ),
          alignment: Alignment.center,
          child: VellinIcon.filled(
            playing ? VellinGlyphs.pauseFilled : VellinGlyphs.playFilled,
            size: 11,
            box: const Size(12, 12),
            color: VellinColors.accent,
          ),
        ),
      ),
    );
  }
}

/// Точка «прослушано»: закрашена золотом с ореолом, иначе — пустая с обводкой.
class _PlayedDot extends StatelessWidget {
  final bool played;
  const _PlayedDot({required this.played});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 5,
      height: 5,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: played ? VellinColors.accent : const Color(0x00000000),
        border: played ? null : Border.all(color: VellinColors.accentLineStrong, width: 1),
        boxShadow: played
            ? const [BoxShadow(color: Color(0x1FE2C99B), blurRadius: 0, spreadRadius: 3)]
            : null,
      ),
    );
  }
}

class _WavePainter extends CustomPainter {
  final List<int> peaks;
  final double progress;

  /// Фаза дыхания 0..1, пока голосовое играет; null — стоит.
  final double? breath;
  final Color active;
  final Color inactive;

  _WavePainter({
    required this.peaks,
    required this.progress,
    required this.breath,
    required this.active,
    required this.inactive,
  });

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
    // Дорожка из макета: 34 полоски шириной 2.5 с шагом 5.
    const barW = 2.5;
    const pitch = 5.0;
    final count = (size.width / pitch).floor().clamp(12, 34);
    final source = peaks.isNotEmpty ? peaks : List<int>.filled(count, 30);
    final bars = _resample(source, count);
    final n = bars.length;
    final playedCount = (progress * n).round();
    final paint = Paint()..strokeCap = StrokeCap.round;

    for (var i = 0; i < n; i++) {
      // Минимум 14 % высоты — тишина тоже читается как дорожка, а не как дыра.
      var h = (bars[i].clamp(0, 100) / 100).clamp(0.14, 1.0) * size.height;
      final isPlayed = i < playedCount;
      if (isPlayed && breath != null) {
        // Пройденные полоски дышат врозь: сдвиг фазы по (i % 7).
        final phase = (breath! + (i % 7) / 7) % 1.0;
        final wave = 0.62 + 0.66 * (0.5 - 0.5 * math.cos(phase * 2 * math.pi));
        h *= wave;
      }
      final x = i * pitch + barW / 2;
      final y0 = (size.height - h) / 2;
      paint.color = isPlayed ? active : inactive;
      paint.strokeWidth = barW;
      canvas.drawLine(Offset(x, y0), Offset(x, y0 + h), paint);
    }
  }

  @override
  bool shouldRepaint(covariant _WavePainter old) =>
      old.progress != progress || old.peaks != peaks || old.breath != breath;
}
