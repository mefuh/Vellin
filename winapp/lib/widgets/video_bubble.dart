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
import '../state/playback_controller.dart';
import '../theme/vellin_design.dart';

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

  /// Диалог и собеседник — их показывает мини-плеер, пока кружок звучит.
  final String peerPublicId;
  final String peerName;
  final String? peerAvatarUrl;

  /// Длина записи в секундах — подпись слева внизу.
  final int? durationSec;

  /// Время отправки и галочки — подпись справа внизу; её собирает строка
  /// сообщения, чтобы у всех типов реплик она выглядела одинаково.
  final Widget sentAt;

  /// Посмотрел ли собеседник мой кружок — точка рядом с длительностью.
  final bool played;

  /// Первый просмотр чужого кружка — повод сказать об этом отправителю.
  final VoidCallback? onFirstPlay;

  const VideoBubble({
    super.key,
    required this.messageId,
    required this.status,
    required this.videoUrl,
    required this.thumbUrl,
    required this.peerPublicId,
    required this.peerName,
    required this.peerAvatarUrl,
    required this.durationSec,
    required this.sentAt,
    this.played = false,
    this.onFirstPlay,
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
    // Ушли из переписки или сменили раздел — строки больше нет, показывать
    // кадр некому. Без этого окошко не всплывало: плеер считал, что кружок
    // всё ещё на виду.
    _circles?.setBubbleVisible(widget.messageId, false);
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

    widget.onFirstPlay?.call();
    // Голосовое и кружок вместе звучать не должны — одно место для звука.
    await context.read<PlaybackController>().stop();
    if (!mounted) return;
    // Свой беззвучный цикл гасим: иначе один кружок звучал бы из двух плееров.
    setState(_teardown);
    await circles.play(CircleItem(
      messageId: widget.messageId,
      path: path,
      peerPublicId: widget.peerPublicId,
      peerName: widget.peerName,
      peerAvatarUrl: widget.peerAvatarUrl,
      mine: widget.mine,
    ));
  }

  @override
  Widget build(BuildContext context) {
    // Кадр всегда круглый и одного размера — кружки в ленте стоят ровной
    // колонкой. Размер заметно крупнее макетного: на 140 лицо было не
    // разглядеть.
    const box = 260.0;
    const grow = 1.14;

    final playing = _playingWithSound;

    return VisibilityDetector(
      key: _visibilityKey,
      onVisibilityChanged: _onVisibilityChanged,
      child: Padding(
        // Растёт кружок от нижнего края, то есть вверх — значит и воздух ему
        // нужен сверху, иначе он наезжает на предыдущую реплику.
        padding: EdgeInsets.only(top: playing ? box * (grow - 1) : 0),
        child: MouseRegion(
          cursor: widget.status == 'ready' ? SystemMouseCursors.click : MouseCursor.defer,
          child: GestureDetector(
            onTap: widget.status == 'ready' ? _onTap : null,
            child: AnimatedScale(
              duration: const Duration(milliseconds: 550),
              curve: VellinMotion.standard,
              scale: playing ? grow : 1,
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
                    ClipOval(child: _frame()),
                    // Кольцо идёт ровно по краю кадра и только пока кружок
                    // звучит: на выключенном ему нечего показывать.
                    if (_isCurrent)
                      CustomPaint(painter: _RingPainter(progress: _progress)),
                    // Слева — сколько идёт запись и просмотрена ли она,
                    // справа — когда её прислали.
                    Positioned(
                      left: 10,
                      right: 10,
                      bottom: 12,
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          _Caption(
                            text: _durationLabel,
                            // Точка стоит, пока запись не открыли: у своего
                            // кружка её снимет собеседник, у чужого — я сам.
                            trailing: widget.played ? null : const _PlayedDot(),
                          ),
                          _Caption(child: widget.sentAt),
                        ],
                      ),
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
        // Затемнения и кнопки здесь нет: кружок в покое крутит беззвучный
        // цикл, и вуаль поверх живого кадра только мешала бы его смотреть.
      ],
    );
  }

  /// Подпись слева: пока звучит — сколько прошло, иначе длина записи.
  String get _durationLabel {
    final total = widget.durationSec ?? _circles?.duration.inSeconds ?? 0;
    final shown = _isCurrent ? (_circles?.position.inSeconds ?? 0) : total;
    return '${(shown ~/ 60).toString().padLeft(2, '0')}:${(shown % 60).toString().padLeft(2, '0')}';
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

  _RingPainter({required this.progress});

  @override
  void paint(Canvas canvas, Size size) {
    const stroke = 2.5;
    final rect = Rect.fromCircle(
      center: Offset(size.width / 2, size.height / 2),
      radius: size.width / 2 - stroke / 2,
    );

    // Подложка кольца — тёмный контур кадра: на нём золотой прогресс виден и
    // на светлом видео.
    final base = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..color = const Color(0x66080706);
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
  bool shouldRepaint(_RingPainter old) => old.progress != progress;
}

/// Подпись на кадре: тёмная капсула, чтобы цифры читались на любом видео.
class _Caption extends StatelessWidget {
  /// Готовая подпись (время с галочками) либо просто строка — их рисуют
  /// разные места, а капсула у обеих одна.
  final String? text;
  final Widget? child;
  final Widget? trailing;

  const _Caption({this.text, this.child, this.trailing});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: const Color(0xA6080706),
        borderRadius: BorderRadius.circular(VellinRadius.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (child != null)
            child!
          else
            Text(
              text ?? '',
              style: VellinType.caption.copyWith(
                fontSize: 11,
                color: VellinColors.ink82,
                fontFeatures: VellinType.tabular,
              ),
            ),
          if (trailing != null) ...[
            const SizedBox(width: 6),
            trailing!,
          ],
        ],
      ),
    );
  }
}

/// Точка «ещё не просмотрено»: золотая, пока кружок не открыли. Просмотренный
/// метки не несёт.
class _PlayedDot extends StatelessWidget {
  const _PlayedDot();

  @override
  Widget build(BuildContext context) {
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
