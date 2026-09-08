import 'dart:async';
import 'dart:io';
import 'package:flutter/widgets.dart';
import 'package:http/http.dart' as http;
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';
import 'package:visibility_detector/visibility_detector.dart';
import '../app_config.dart';
import 'package:provider/provider.dart';
import '../state/circle_playback_controller.dart';
import '../theme/vellin_design.dart';
import '../theme/vellin_glyphs.dart';
import 'ui/vellin_icon.dart';

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
  /// Сообщение: по нему общий плеер понимает, чей кружок сейчас звучит.
  final String messageId;

  final String? status; // processing | ready | failed
  final String? videoUrl;
  final String? thumbUrl;

  /// Мой кружок или чужой — от этого зависит цвет подложки кольца.
  final bool mine;

  const VideoBubble({
    super.key,
    required this.messageId,
    required this.status,
    required this.videoUrl,
    required this.thumbUrl,
    this.mine = false,
  });

  @override
  State<VideoBubble> createState() => _VideoBubbleState();
}

class _VideoBubbleState extends State<VideoBubble> {
  final _visibilityKey = UniqueKey();

  Player? _player;
  VideoController? _controller;
  final List<StreamSubscription> _subs = [];
  Future<String>? _download;

  bool _starting = false; // идёт создание плеера
  bool _failed = false;

  /// Общий плеер озвученных кружков.
  CirclePlaybackController? _circles;

  /// Звучал ли этот кружок на прошлой перерисовке — по спаду возвращаем
  /// беззвучный цикл: события видимости в этот момент не приходит.
  bool _wasCurrent = false;

  @override
  void initState() {
    super.initState();
    _prefetch();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final circles = context.read<CirclePlaybackController>();
    if (identical(circles, _circles)) return;
    _circles?.removeListener(_onCirclesChanged);
    _circles = circles..addListener(_onCirclesChanged);
  }

  void _onCirclesChanged() {
    if (!mounted) return;
    final current = _circles?.isCurrent(widget.messageId) ?? false;
    if (_wasCurrent && !current) _startSilentLoop();
    _wasCurrent = current;
    setState(() {});
  }

  @override
  void didUpdateWidget(VideoBubble old) {
    super.didUpdateWidget(old);
    // Кружок дотранскодировался (processing → ready) — можно предзагружать.
    if (old.videoUrl != widget.videoUrl || old.status != widget.status) _prefetch();
  }

  @override
  void dispose() {
    _circles?.removeListener(_onCirclesChanged);
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
  }

  /// Кружок появился/скрылся в списке: видимый — крутим беззвучно, скрытый —
  /// освобождаем плеер.
  ///
  /// Кружок, включённый со звуком, живёт не здесь, а в общем плеере: ему уход
  /// строки за край экрана не помеха — картинка просто переезжает в окошко.
  void _onVisibilityChanged(VisibilityInfo info) {
    if (!mounted) return;
    final visible = info.visibleFraction > 0.3;
    _circles?.setBubbleVisible(widget.messageId, visible);
    if (visible) {
      if (_circles?.isCurrent(widget.messageId) != true) _startSilentLoop();
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

    // Подписок на позицию и окончание здесь нет: этот плеер только крутит
    // беззвучный цикл, а всё, что показывает кольцо, считает общий плеер.

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

  /// Тап: беззвучный цикл → играть с начала со звуком в общем плеере;
  /// уже звучит → пауза; на паузе → продолжить.
  Future<void> _onTap() async {
    final circles = _circles;
    if (circles == null) return;

    if (circles.isCurrent(widget.messageId)) {
      await circles.toggle();
      return;
    }

    if (_download == null) {
      _prefetch();
      if (_download == null) return;
    }
    String path;
    try {
      path = await _download!;
      if (path.isEmpty) throw Exception('download failed');
    } catch (_) {
      if (mounted) setState(() => _failed = true);
      return;
    }
    if (!mounted) return;

    // Свой беззвучный цикл гасим: иначе один кружок звучал бы из двух плееров.
    setState(_teardown);
    await circles.play(CircleItem(messageId: widget.messageId, path: path));
  }

  @override
  Widget build(BuildContext context) {
    // Кадр всегда круглый и одного размера: бокс 140 с отступом 9 под кольцо
    // прогресса — так кружки в ленте стоят ровной колонкой.
    const box = 140.0;
    const inset = 9.0;

    final playing = _playingWithSound;

    return VisibilityDetector(
      key: _visibilityKey,
      onVisibilityChanged: _onVisibilityChanged,
      child: Padding(
        // Играющий кружок вырастает — оставляем ему воздух снизу заранее,
        // иначе лента дёргалась бы на каждом запуске.
        padding: EdgeInsets.only(bottom: playing ? 22 : 0),
        child: MouseRegion(
          cursor: widget.status == 'ready' ? SystemMouseCursors.click : MouseCursor.defer,
          child: GestureDetector(
            onTap: widget.status == 'ready' ? _onTap : null,
            child: AnimatedScale(
              duration: const Duration(milliseconds: 550),
              curve: VellinMotion.standard,
              scale: playing ? 1.14 : 1,
              alignment: Alignment.bottomCenter,
              child: AnimatedContainer(
                duration: VellinMotion.state,
                curve: VellinMotion.standard,
                width: box,
                height: box,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  boxShadow: playing
                      ? const [
                          BoxShadow(color: Color(0xB3000000), blurRadius: 34, offset: Offset(0, 12), spreadRadius: -10),
                        ]
                      : null,
                ),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    // Кольцо прогресса поверх всего: оно и рамка кадра.
                    CustomPaint(
                      painter: _RingPainter(
                        progress: _progress,
                        mine: widget.mine,
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.all(inset),
                      child: ClipOval(child: _frame()),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// Этот ли кружок сейчас в общем плеере.
  bool get _isCurrent => _circles?.isCurrent(widget.messageId) ?? false;

  /// Играет со звуком: воспроизведение идёт в общем плеере и не на паузе.
  bool get _playingWithSound => _isCurrent && (_circles?.playing ?? false);

  /// Доля проигранного: считается только когда кружок играет со звуком —
  /// беззвучный цикл кольцо не крутит, иначе оно мельтешило бы в ленте.
  double get _progress => _isCurrent ? (_circles?.progress ?? 0) : 0;

  Widget _frame() {
    if (widget.status == 'processing') {
      return _placeholder('обрабатывается');
    }
    if (widget.status == 'failed' || _failed) {
      return _placeholder('не получилось');
    }

    final thumb = AppConfig.mediaUrl(widget.thumbUrl);
    final playing = _playingWithSound;
    // Звучащий кружок рисуется из общего плеера — своего у баббла в этот
    // момент нет, он его отдал вместе с воспроизведением.
    final shared = _isCurrent ? _circles?.controller : null;

    return Stack(
      fit: StackFit.expand,
      children: [
        if (shared != null)
          Video(controller: shared, fit: BoxFit.cover, controls: NoVideoControls)
        else if (_controller != null)
          Video(controller: _controller!, fit: BoxFit.cover, controls: NoVideoControls)
        else if (thumb != null)
          Image.network(thumb, fit: BoxFit.cover,
              errorBuilder: (_, _, _) => const ColoredBox(color: VellinColors.bg5))
        else
          const ColoredBox(color: VellinColors.bg5),
        // Пока не играет со звуком, кадр под вуалью с треугольником: беззвучный
        // цикл — это ещё не воспроизведение, и путать их не нужно.
        AnimatedOpacity(
          duration: VellinMotion.state,
          curve: VellinMotion.standard,
          opacity: playing ? 0 : 1,
          child: ColoredBox(
            color: const Color(0x57080706),
            child: Center(
              child: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: VellinColors.glassPill,
                  shape: BoxShape.circle,
                  border: Border.all(color: VellinColors.accentLine),
                ),
                alignment: Alignment.center,
                child: VellinIcon.filled(
                  VellinGlyphs.playFilled,
                  size: 13,
                  box: const Size(12, 12),
                  color: VellinColors.accent,
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _placeholder(String label) {
    return ColoredBox(
      color: VellinColors.skeleton,
      child: Center(
        child: Text(
          label,
          textAlign: TextAlign.center,
          style: VellinType.caption.copyWith(fontSize: 11.5),
        ),
      ),
    );
  }
}

/// Кольцо вокруг кадра: подложка и золотой прогресс от верхней точки.
class _RingPainter extends CustomPainter {
  final double progress;
  final bool mine;

  _RingPainter({required this.progress, required this.mine});

  @override
  void paint(Canvas canvas, Size size) {
    const stroke = 2.5;
    final rect = Rect.fromCircle(
      center: Offset(size.width / 2, size.height / 2),
      radius: size.width / 2 - stroke / 2,
    );

    final base = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..color = mine ? const Color(0x33E2C99B) : const Color(0x24FFFFFF);
    canvas.drawArc(rect, 0, 6.2831853, false, base);

    if (progress <= 0) return;
    final done = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..color = VellinColors.accent;
    // Старт сверху: у дуги нулевой угол справа, поэтому смещаем на четверть.
    canvas.drawArc(rect, -1.5707963, 6.2831853 * progress, false, done);
  }

  @override
  bool shouldRepaint(_RingPainter old) => old.progress != progress || old.mine != mine;
}
