import 'dart:async';
import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import '../theme/vellin_theme.dart';

/// Плеер голосового сообщения: кнопка play/pause, волна из пиков с прогрессом и
/// длительность. Нативный Player (media_kit) создаётся лениво — при первом
/// воспроизведении, чтобы не плодить движки на каждый бабл.
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
  Player? _player;
  final _subs = <StreamSubscription>[];
  bool _playing = false;
  Duration _pos = Duration.zero;

  Color get _fg => widget.mine ? Colors.white : VellinColors.text0;
  Color get _muted => widget.mine ? Colors.white54 : VellinColors.text3;

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    _player?.dispose();
    super.dispose();
  }

  Future<void> _toggle() async {
    if (_player == null) {
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
      await p.open(Media(widget.url));
      return;
    }
    if (_playing) {
      await _player!.pause();
    } else {
      await _player!.play();
    }
  }

  String _fmt(int totalSec) => '${(totalSec ~/ 60).toString().padLeft(1, '0')}:${(totalSec % 60).toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final total = widget.durationSec > 0 ? widget.durationSec : 0;
    final progress = total > 0 ? (_pos.inMilliseconds / (total * 1000)).clamp(0.0, 1.0) : 0.0;
    final label = _playing || _pos > Duration.zero ? _fmt(_pos.inSeconds) : _fmt(total);

    return Row(mainAxisSize: MainAxisSize.min, children: [
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
        width: 150,
        height: 28,
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
      Text(label, style: TextStyle(color: _muted, fontSize: 12)),
    ]);
  }
}

class _WavePainter extends CustomPainter {
  final List<int> peaks;
  final double progress;
  final Color active;
  final Color inactive;
  _WavePainter({required this.peaks, required this.progress, required this.active, required this.inactive});

  @override
  void paint(Canvas canvas, Size size) {
    final bars = peaks.isNotEmpty ? peaks : List<int>.filled(24, 30);
    final n = bars.length;
    final gap = 2.0;
    final barW = ((size.width - gap * (n - 1)) / n).clamp(1.5, 4.0);
    final activeCount = (progress * n).round();
    final paint = Paint()..strokeCap = StrokeCap.round;
    for (var i = 0; i < n; i++) {
      final h = (bars[i].clamp(4, 100) / 100) * size.height;
      final x = i * (barW + gap) + barW / 2;
      final y0 = (size.height - h) / 2;
      paint.color = i < activeCount ? active : inactive;
      paint.strokeWidth = barW;
      canvas.drawLine(Offset(x, y0), Offset(x, y0 + h), paint);
    }
  }

  @override
  bool shouldRepaint(covariant _WavePainter old) => old.progress != progress || old.peaks != peaks;
}
