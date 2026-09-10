import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import '../state/circle_playback_controller.dart';
import '../state/playback_controller.dart';
import '../theme/vellin_design.dart';
import '../theme/vellin_glyphs.dart';
import 'ui/vellin_icon.dart';

/// Голосовое сообщение в ленте: кнопка воспроизведения, дорожка из пиков,
/// длительность и точка «прослушано».
///
/// Самого плеера здесь нет — он один на приложение (`PlaybackController`),
/// иначе звук обрывался бы при уходе из переписки, а мини-плееру нечего было
/// бы показывать.
class VoiceBubble extends StatelessWidget {
  final String messageId;
  final String url;
  final int durationSec;
  final List<int> peaks;
  final bool mine;

  /// Прослушано ли голосовое (у своих — собеседником, у чужих — мной).
  final bool played;

  /// Собеседник и диалог — чтобы мини-плеер знал, чью запись он тянет.
  final String peerPublicId;
  final String peerName;
  final String? peerAvatarUrl;

  /// Первый запуск чужого голосового — повод сказать об этом собеседнику.
  final VoidCallback? onFirstPlay;

  /// Время отправки и галочки — их собирает строка сообщения.
  final Widget? trailing;

  const VoiceBubble({
    super.key,
    required this.messageId,
    required this.url,
    required this.durationSec,
    required this.peaks,
    required this.mine,
    required this.peerPublicId,
    required this.peerName,
    required this.peerAvatarUrl,
    this.played = false,
    this.onFirstPlay,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    final playback = context.watch<PlaybackController>();
    final current = playback.isCurrent(messageId);
    final playing = current && playback.playing;
    final progress = current ? playback.progress : 0.0;
    final shown = current && playback.position > Duration.zero
        ? playback.position.inSeconds
        : durationSec;
    final idle = mine ? const Color(0x47E2C99B) : VellinColors.ink24;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _PlayButton(
          playing: playing,
          onTap: () {
            onFirstPlay?.call();
            // Кружок и голосовое одновременно не звучат.
            context.read<CirclePlaybackController>().stop();
            context.read<PlaybackController>().play(
                  PlaybackItem(
                    messageId: messageId,
                    peerPublicId: peerPublicId,
                    peerName: peerName,
                    peerAvatarUrl: peerAvatarUrl,
                    url: url,
                    durationSec: durationSec,
                    peaks: peaks,
                    mine: mine,
                  ),
                );
          },
        ),
        const SizedBox(width: 10),
        _Wave(
          peaks: peaks,
          progress: progress,
          playing: playing,
          inactive: idle,
          onSeek: current ? (f) => context.read<PlaybackController>().seekFraction(f) : null,
        ),
        const SizedBox(width: 10),
        // Фиксированная ширина: цифры не «прыгают» при смене 0:09 → 0:10.
        SizedBox(
          width: 30,
          child: Text(
            _fmt(shown),
            textAlign: TextAlign.right,
            style: TextStyle(
              fontFamily: VellinType.family,
              fontSize: 11,
              color: mine ? const Color(0xA8E2C99B) : VellinColors.ink34,
              fontFeatures: VellinType.tabular,
            ),
          ),
        ),
        // Отступ живёт вместе с точкой: без неё он оставлял бы дыру у края.
        if (!played) ...[
          const SizedBox(width: 7),
          const _PlayedDot(played: false),
        ],
        if (trailing != null) ...[
          const SizedBox(width: 10),
          trailing!,
        ],
      ],
    );
  }

  static String _fmt(int totalSec) =>
      '${(totalSec ~/ 60).toString().padLeft(1, '0')}:${(totalSec % 60).toString().padLeft(2, '0')}';
}

/// Дорожка: 34 полоски, пройденные золотые и дышащие во время игры.
class _Wave extends StatefulWidget {
  final List<int> peaks;
  final double progress;
  final bool playing;
  final Color inactive;
  final ValueChanged<double>? onSeek;

  const _Wave({
    required this.peaks,
    required this.progress,
    required this.playing,
    required this.inactive,
    this.onSeek,
  });

  @override
  State<_Wave> createState() => _WaveState();
}

class _WaveState extends State<_Wave> with SingleTickerProviderStateMixin {
  late final AnimationController _breath = AnimationController(
    vsync: this,
    duration: VellinMotion.voiceBars,
  );

  @override
  void initState() {
    super.initState();
    if (widget.playing) _breath.repeat();
  }

  @override
  void didUpdateWidget(_Wave old) {
    super.didUpdateWidget(old);
    if (widget.playing && !_breath.isAnimating) {
      _breath.repeat();
    } else if (!widget.playing && _breath.isAnimating) {
      _breath.stop();
    }
  }

  @override
  void dispose() {
    _breath.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const width = 170.0;

    return GestureDetector(
      onTapDown: widget.onSeek == null
          ? null
          : (d) => widget.onSeek!((d.localPosition.dx / width).clamp(0.0, 1.0)),
      child: MouseRegion(
        cursor: widget.onSeek == null ? MouseCursor.defer : SystemMouseCursors.click,
        child: AnimatedBuilder(
          animation: _breath,
          builder: (context, _) => SizedBox(
            width: width,
            height: 24,
            child: CustomPaint(
              painter: _WavePainter(
                peaks: widget.peaks,
                progress: widget.progress,
                breath: widget.playing ? _breath.value : null,
                active: VellinColors.accent,
                inactive: widget.inactive,
              ),
            ),
          ),
        ),
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

/// Точка «ещё не прослушано»: золотая, пока запись не открыли. Прослушанная
/// запись метки не несёт — отметка нужна ровно до того, как её сняли.
class _PlayedDot extends StatelessWidget {
  final bool played;
  const _PlayedDot({required this.played});

  @override
  Widget build(BuildContext context) {
    if (played) return const SizedBox.shrink();
    return Container(
      width: 5,
      height: 5,
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        color: VellinColors.accent,
        boxShadow: [BoxShadow(color: Color(0x1FE2C99B), blurRadius: 0, spreadRadius: 3)],
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
    // Дорожка из макета: полоски шириной 2.5 с шагом 5.
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
        h *= 0.62 + 0.66 * (0.5 - 0.5 * math.cos(phase * 2 * math.pi));
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
