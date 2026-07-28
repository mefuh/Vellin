// Сплэш апдейтера: интро-анимация знака Vellin, цикл ожидания на время
// загрузки/установки и плавное затухание перед стартом приложения.
//
// Нативная реализация макета `vellin_updater.html` на CustomPainter — без
// WebView: апдейтер стоит гейтом перед запуском приложения, и лишняя тяжёлая
// зависимость (WebView2) в этом месте означала бы «клиент не стартует, если
// рантайм не поднялся».
//
// Тайминги повторяют макет:
//   0,08 → 0,90 c  отрисовка контура V со световой головкой
//   0,84 → 1,44 c  вспышка и проявление объёмного знака
//   1,10 → 1,94 c  раскрытие слова VELLIN
//   1,72 → 2,15 c  подпись, прогресс-бар, версия
//   2,15 c         [onIntroDone]
// Цикл ожидания (downloading/installing) — 3,6 c, бесшовный. Затухание 440 мс.

import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:window_manager/window_manager.dart';

/// Фазы апдейтера, как в макете.
enum SplashPhase { checking, downloading, installing, ready, error }

/// Размер окна апдейтера и его фон (совпадают с макетом).
const Size kSplashSize = Size(520, 340);
const Color kSplashBackground = Color(0xFF0B0908);

const Color _paper = Color(0xFFF7F6F4);

/// Подписи под знаком для каждой фазы.
const Map<SplashPhase, String> _phaseText = {
  SplashPhase.checking: 'Проверка обновлений…',
  SplashPhase.downloading: 'Загрузка обновления',
  SplashPhase.installing: 'Установка обновления…',
  SplashPhase.ready: 'Запуск Vellin…',
  SplashPhase.error: 'Не удалось обновить',
};

/// Момент завершения интро (мс от старта) — раньше него фазу менять визуально
/// нельзя, иначе анимация оборвётся на середине.
const int kIntroDoneMs = 2150;
const int _introTotalMs = 2600;

/// Длительность затухания [VellinUpdaterSplash] перед запуском приложения.
const Duration kSplashFadeOut = Duration(milliseconds: 440);

/// Приводит КЛИЕНТСКУЮ область окна ровно к [kSplashSize].
///
/// `WindowOptions.size` задаёт внешний размер окна вместе с рамкой, поэтому
/// содержимое оказывается уже и ниже макета (у нас было 504×331 вместо
/// 520×340). Разницу считаем по фактическому размеру вью и компенсируем.
Future<void> fitSplashClientSize() async {
  final view = WidgetsBinding.instance.platformDispatcher.views.first;
  final client = view.physicalSize / view.devicePixelRatio;
  final dw = kSplashSize.width - client.width;
  final dh = kSplashSize.height - client.height;
  if (dw.abs() < 0.5 && dh.abs() < 0.5) return;
  final outer = await windowManager.getSize();
  await windowManager.setSize(Size(outer.width + dw, outer.height + dh));
  await windowManager.center();
}

// --- геометрия знака (viewBox 0 0 100 100) --------------------------------

/// Контур V — тот же путь, что в бренд-наборе (vellin-mark.svg).
Path _buildMarkPath() => Path()
  ..moveTo(6.8, 4)
  ..lineTo(23.5, 4)
  ..quadraticBezierTo(26, 4, 27.1, 6.5)
  ..lineTo(48.8, 55.2)
  ..quadraticBezierTo(50, 58.8, 51.2, 55.2)
  ..lineTo(72.9, 6.5)
  ..quadraticBezierTo(74, 4, 76.5, 4)
  ..lineTo(93.2, 4)
  ..quadraticBezierTo(96, 4, 94.75, 6.5)
  ..lineTo(50.85, 94.3)
  ..quadraticBezierTo(50, 96.8, 49.15, 94.3)
  ..lineTo(5.25, 6.5)
  ..quadraticBezierTo(4, 4, 6.8, 4)
  ..close();

/// Полуплоскость верхней (левой) плоскости ленты — даёт сгиб и его тень.
Path _buildFoldPath() => Path()
  ..moveTo(75.8, 0)
  ..lineTo(-30, 0)
  ..lineTo(-30, 130)
  ..lineTo(18.1, 130)
  ..close();

/// Доля отрезка анимации [startMs, startMs+durMs] в момент [tMs], со сглаживанием.
double _seg(double tMs, double startMs, double durMs, [Curve curve = Curves.linear]) {
  if (durMs <= 0) return 1;
  final x = ((tMs - startMs) / durMs).clamp(0.0, 1.0);
  return curve.transform(x);
}

/// Кусочно-линейная огибающая по опорным точкам {позиция 0..1: значение}.
double _envelope(double x, List<double> stops, List<double> values) {
  if (x <= stops.first) return values.first;
  for (var i = 1; i < stops.length; i++) {
    if (x <= stops[i]) {
      final k = (x - stops[i - 1]) / (stops[i] - stops[i - 1]);
      return values[i - 1] + (values[i] - values[i - 1]) * k;
    }
  }
  return values.last;
}

// --- виджет ----------------------------------------------------------------

class VellinUpdaterSplash extends StatefulWidget {
  const VellinUpdaterSplash({
    super.key,
    required this.phase,
    required this.version,
    this.progress,
    this.status,
    this.fadingOut = false,
    this.onIntroDone,
    this.onRetry,
  });

  final SplashPhase phase;

  /// 0..1 — детерминированный прогресс; null — бегущий бар.
  final double? progress;

  /// Подпись вместо стандартной для фазы.
  final String? status;

  final String version;
  final bool fadingOut;
  final VoidCallback? onIntroDone;
  final VoidCallback? onRetry;

  @override
  State<VellinUpdaterSplash> createState() => _VellinUpdaterSplashState();
}

class _VellinUpdaterSplashState extends State<VellinUpdaterSplash> with TickerProviderStateMixin {
  late final AnimationController _intro;
  late final AnimationController _glow; // дыхание засветки
  late final AnimationController _hg; // цикл песочных часов
  late final AnimationController _sand; // падающая струйка
  late final AnimationController _sweep; // бегущий прогресс-бар
  late final AnimationController _morph; // знак ⇄ песочные часы

  bool _introFired = false;

  @override
  void initState() {
    super.initState();
    _intro =
        AnimationController(
            vsync: this,
            duration: const Duration(milliseconds: _introTotalMs),
          )
          ..addListener(_watchIntro)
          ..forward();
    _glow = AnimationController(vsync: this, duration: const Duration(milliseconds: 2300))
      ..repeat(reverse: true);
    _hg = AnimationController(vsync: this, duration: const Duration(milliseconds: 3600))..repeat();
    _sand = AnimationController(vsync: this, duration: const Duration(milliseconds: 580))..repeat();
    _sweep = AnimationController(vsync: this, duration: const Duration(milliseconds: 1550))
      ..repeat();
    _morph = AnimationController(vsync: this, duration: const Duration(milliseconds: 440));
    if (_waiting) _morph.value = 1;
  }

  bool get _waiting =>
      widget.phase == SplashPhase.downloading || widget.phase == SplashPhase.installing;

  /// Сообщаем хосту о конце интро ровно в 2,15 c.
  void _watchIntro() {
    if (_introFired) return;
    if (_intro.value * _introTotalMs >= kIntroDoneMs) {
      _introFired = true;
      widget.onIntroDone?.call();
    }
  }

  @override
  void didUpdateWidget(VellinUpdaterSplash old) {
    super.didUpdateWidget(old);
    final wasWaiting = old.phase == SplashPhase.downloading || old.phase == SplashPhase.installing;
    if (_waiting && !wasWaiting) {
      // Цикл ожидания начинается со входом в фазу, а не с запуска приложения —
      // иначе часы «подхватываются» с середины пересыпания.
      _hg.forward(from: 0);
      _hg.repeat();
      _morph.forward();
    } else if (!_waiting && wasWaiting) {
      _morph.reverse();
    }
  }

  @override
  void dispose() {
    _intro.removeListener(_watchIntro);
    for (final c in [_intro, _glow, _hg, _sand, _sweep, _morph]) {
      c.dispose();
    }
    super.dispose();
  }

  /// Подпись под знаком: проценты показываем только во время загрузки.
  String get _statusText {
    if (widget.status != null) return widget.status!;
    final base = _phaseText[widget.phase] ?? '';
    if (widget.phase == SplashPhase.downloading && widget.progress != null) {
      return '$base · ${(widget.progress! * 100).round()}%';
    }
    return base;
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedOpacity(
      opacity: widget.fadingOut ? 0 : 1,
      duration: kSplashFadeOut,
      curve: Curves.easeOut,
      child: AnimatedScale(
        scale: widget.fadingOut ? 0.985 : 1,
        duration: kSplashFadeOut,
        curve: Curves.easeOut,
        // Material нужен как предок текста: без него Flutter рисует служебное
        // жёлтое подчёркивание. Прозрачный — фон задаёт градиент ниже.
        child: Material(
          type: MaterialType.transparency,
          child: DragToMoveArea(
            child: CustomPaint(
              painter: const _BackdropPainter(),
              child: Stack(
                children: [
                  _buildGlow(),
                  _buildLockup(),
                  _buildFooter(),
                  _buildVersion(),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// Мягкое световое пятно за знаком: проявляется на 0,35 c и после «дышит».
  /// Позиция задаётся долями от реального размера окна (макет: 50% / 41%).
  Widget _buildGlow() {
    final size = MediaQuery.sizeOf(context);
    const d = 385.0; // min(74vw, 420px) при ширине окна 520
    return Positioned(
      left: size.width / 2 - d / 2,
      top: size.height * 0.41 - d / 2,
      width: d,
      height: d,
      child: AnimatedBuilder(
        animation: Listenable.merge([_intro, _glow]),
        builder: (context, _) {
          final t = _intro.value * _introTotalMs;
          final appear = _seg(t, 350, 900, Curves.ease);
          // Дыхание стартует после проявления, чтобы не спорить с интро.
          final breathe = t < 1400 ? 0.0 : Curves.easeInOut.transform(_glow.value);
          final opacity = appear * (0.85 + 0.15 * breathe);
          final scale = 1 + 0.07 * breathe;
          return IgnorePointer(
            child: Opacity(
              opacity: opacity.clamp(0.0, 1.0),
              child: Transform.scale(
                scale: scale,
                child: const DecoratedBox(
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    // radius 0.707 = «farthest-corner» из CSS: там 100 %
                    // радиуса — расстояние до угла блока, а не до его стороны.
                    gradient: RadialGradient(
                      radius: 0.7071,
                      colors: [Color(0x26FFF6E8), Color(0x00FFF6E8)],
                      stops: [0, 0.62],
                    ),
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  /// Знак и слово VELLIN по центру окна.
  Widget _buildLockup() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 104,
              height: 104,
              child: AnimatedBuilder(
                animation: Listenable.merge([_intro, _hg, _sand, _morph]),
                builder: (context, _) => CustomPaint(
                  painter: _MarkPainter(
                    introMs: _intro.value * _introTotalMs,
                    morph: Curves.easeOut.transform(_morph.value),
                    hg: _hg.value,
                    sand: _sand.value,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 26),
            _buildWord(),
          ],
        ),
      ),
    );
  }

  /// «VELLIN» раскрывается от центра, разрядка сжимается .70em → .42em.
  Widget _buildWord() {
    return AnimatedBuilder(
      animation: _intro,
      builder: (context, _) {
        final t = _intro.value * _introTotalMs;
        final p = _seg(t, 1100, 840, const Cubic(0.16, 1, 0.3, 1));
        final opacity = (p / 0.3).clamp(0.0, 1.0);
        final inset = 0.5 + (-0.1 - 0.5) * p; // 50% → -10%
        final spacing = 26 * (0.70 + (0.42 - 0.70) * p);
        return Opacity(
          opacity: opacity,
          child: ClipRect(
            clipper: _InsetClipper(inset),
            // В макете разрядка компенсируется фиксированным padding-left, но
            // Flutter иначе учитывает хвостовой интервал: центрируем сдвигом,
            // повторяющим смещение CSS ((.42em − текущая разрядка) / 2).
            child: Transform.translate(
              offset: Offset((26 * 0.42 - spacing) / 2, 0),
              child: Text(
                'VELLIN',
                style: TextStyle(
                  fontFamily: 'Onest',
                  fontFamilyFallback: const ['Segoe UI Variable Display', 'Segoe UI'],
                  fontSize: 26,
                  height: 1,
                  fontWeight: FontWeight.w500,
                  color: _paper,
                  letterSpacing: spacing,
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  /// Подпись, прогресс-бар и кнопка «Повторить» — появляются в конце интро.
  Widget _buildFooter() {
    return Positioned(
      left: 0,
      right: 0,
      bottom: 34,
      child: AnimatedBuilder(
        animation: _intro,
        builder: (context, child) => Opacity(
          opacity: _seg(_intro.value * _introTotalMs, 1720, 600, Curves.ease),
          child: child,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 200),
              transitionBuilder: (child, anim) => FadeTransition(
                opacity: anim,
                child: SlideTransition(
                  position: Tween(begin: const Offset(0, -0.25), end: Offset.zero).animate(anim),
                  child: child,
                ),
              ),
              child: Text(
                _statusText,
                // Ключ — фаза, а не сам текст: проценты во время загрузки
                // должны меняться на месте (как setStatusNow в макете), иначе
                // каждый процент запускает кроссфейд и подпись «прыгает».
                // Кроссфейд остаётся только на смене фазы.
                key: ValueKey(widget.status ?? widget.phase.name),
                style: TextStyle(
                  fontFamily: 'Onest',
                  fontFamilyFallback: const ['Segoe UI Variable Display', 'Segoe UI'],
                  fontSize: 12.5,
                  letterSpacing: 0.09 * 12.5,
                  color: widget.phase == SplashPhase.error
                      ? const Color(0xFFE8A08C)
                      : _paper.withValues(alpha: 0.68),
                ),
              ),
            ),
            const SizedBox(height: 16),
            if (widget.phase == SplashPhase.error)
              _RetryButton(onTap: widget.onRetry)
            else
              _buildTrack(),
          ],
        ),
      ),
    );
  }

  /// Прогресс: бегущий блик, либо детерминированная заливка.
  Widget _buildTrack() {
    return AnimatedOpacity(
      opacity: widget.phase == SplashPhase.ready ? 0 : 1,
      duration: const Duration(milliseconds: 300),
      child: SizedBox(
        width: 184,
        height: 2,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(2),
          child: ColoredBox(
            color: _paper.withValues(alpha: 0.13),
            child: widget.progress == null
                ? AnimatedBuilder(
                    animation: _sweep,
                    builder: (context, _) {
                      final x = const Cubic(0.65, 0.05, 0.35, 0.95).transform(_sweep.value);
                      // Сдвиг в макете задан в процентах ОТ ШИРИНЫ БЕГУНКА
                      // (32 % дорожки), а не от самой дорожки: −110 % → 330 %.
                      const runner = 184 * 0.32;
                      return Align(
                        alignment: Alignment.centerLeft,
                        child: Transform.translate(
                          offset: Offset(runner * (-1.10 + 4.40 * x), 0),
                          child: Container(
                            width: 184 * 0.32,
                            decoration: const BoxDecoration(
                              gradient: LinearGradient(
                                colors: [Color(0x00F7F6F4), Color(0xFFFFFAF2), Color(0x00F7F6F4)],
                                stops: [0, 0.55, 1],
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  )
                : Align(
                    alignment: Alignment.centerLeft,
                    child: AnimatedFractionallySizedBox(
                      duration: const Duration(milliseconds: 450),
                      curve: const Cubic(0.3, 0.9, 0.3, 1),
                      widthFactor: widget.progress!.clamp(0.0, 1.0),
                      heightFactor: 1,
                      child: const ColoredBox(color: _paper),
                    ),
                  ),
          ),
        ),
      ),
    );
  }

  Widget _buildVersion() {
    return Positioned(
      right: 14,
      bottom: 10,
      child: AnimatedBuilder(
        animation: _intro,
        builder: (context, child) => Opacity(
          opacity: _seg(_intro.value * _introTotalMs, 1880, 600, Curves.ease),
          child: child,
        ),
        child: Text(
          'v${widget.version.replaceFirst(RegExp(r'^v'), '')}',
          style: TextStyle(
            fontFamily: 'Onest',
            fontFamilyFallback: const ['Segoe UI Variable Display', 'Segoe UI'],
            fontSize: 10.5,
            letterSpacing: 0.07 * 10.5,
            color: _paper.withValues(alpha: 0.26),
          ),
        ),
      ),
    );
  }
}

/// Фон окна: тёплая эллиптическая засветка сверху, мягкое затемнение к нижнему
/// краю и тонкая рамка — как `radial-gradient(130% 105% at 50% 30%)` плюс
/// внутренняя тень в макете. Радиал именно эллиптический: круговой градиент
/// Flutter гасит углы заметно быстрее и картинка выходит темнее эталона.
class _BackdropPainter extends CustomPainter {
  const _BackdropPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final center = Offset(size.width * 0.5, size.height * 0.3);
    final ry = size.height * 1.05;
    final rx = size.width * 1.30;

    canvas.drawRect(
      rect,
      Paint()
        ..shader = ui.Gradient.radial(
          center,
          ry,
          const [Color(0xFF241D18), Color(0xFF14100D), kSplashBackground],
          const [0, 0.55, 1],
          TileMode.clamp,
          // Растягиваем круг в эллипс относительно его центра.
          (Matrix4.identity()
                ..translateByDouble(center.dx, center.dy, 0, 1)
                ..scaleByDouble(rx / ry, 1, 1, 1)
                ..translateByDouble(-center.dx, -center.dy, 0, 1))
              .storage,
        ),
    );

    // Затемнение у нижнего края (inset-тень макета).
    canvas.drawRect(
      rect,
      Paint()
        ..shader = ui.Gradient.linear(
          Offset(0, size.height),
          Offset(0, size.height - 150),
          const [Color(0x8C000000), Color(0x00000000)],
        ),
    );

    canvas.drawRect(
      rect.deflate(0.5),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = _paper.withValues(alpha: 0.06),
    );
  }

  @override
  bool shouldRepaint(_BackdropPainter old) => false;
}

/// Горизонтальный клип от центра: [inset] — доля ширины с каждой стороны.
class _InsetClipper extends CustomClipper<Rect> {
  const _InsetClipper(this.inset);
  final double inset;

  @override
  Rect getClip(Size size) =>
      Rect.fromLTRB(size.width * inset, -size.height, size.width * (1 - inset), size.height * 2);

  @override
  bool shouldReclip(_InsetClipper old) => old.inset != inset;
}

class _RetryButton extends StatefulWidget {
  const _RetryButton({this.onTap});
  final VoidCallback? onTap;
  @override
  State<_RetryButton> createState() => _RetryButtonState();
}

class _RetryButtonState extends State<_RetryButton> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 7),
          decoration: BoxDecoration(
            color: _paper.withValues(alpha: _hover ? 0.12 : 0.06),
            border: Border.all(color: _paper.withValues(alpha: _hover ? 0.4 : 0.22)),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            'Повторить',
            style: TextStyle(
              fontFamily: 'Onest',
              fontFamilyFallback: const ['Segoe UI Variable Display', 'Segoe UI'],
              fontSize: 12,
              letterSpacing: 0.06 * 12,
              color: _paper,
            ),
          ),
        ),
      ),
    );
  }
}

// --- отрисовка знака -------------------------------------------------------

/// Рисует знак Vellin: отрисовку контура, вспышку, объёмный знак и цикл
/// ожидания (V мутирует в песочные часы).
class _MarkPainter extends CustomPainter {
  _MarkPainter({required this.introMs, required this.morph, required this.hg, required this.sand});

  /// Время от старта интро, мс.
  final double introMs;

  /// 0 — знак, 1 — песочные часы.
  final double morph;

  /// Фаза цикла песочных часов и падающей струйки, 0..1.
  final double hg;
  final double sand;

  static final Path _mark = _buildMarkPath();
  static final Path _fold = _buildFoldPath();
  static final ui.PathMetric _metric = _mark.computeMetrics().first;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 100);

    _paintGroundShadow(canvas);
    if (morph < 1) {
      canvas.saveLayer(
        const Rect.fromLTWH(-40, -40, 180, 180),
        Paint()..color = Color.fromRGBO(0, 0, 0, 1 - morph),
      );
      _paintOutline(canvas);
      _paintBloom(canvas);
      _paintSolidMark(canvas);
      canvas.restore();
    }
    if (morph > 0) {
      canvas.saveLayer(
        const Rect.fromLTWH(-40, -40, 180, 180),
        Paint()..color = Color.fromRGBO(0, 0, 0, morph),
      );
      _paintHourglass(canvas);
      canvas.restore();
    }

    canvas.restore();
  }

  /// Мягкая тень под знаком — «ставит» его на плоскость.
  void _paintGroundShadow(Canvas canvas) {
    final o = _seg(introMs, 950, 600, Curves.ease) * (1 - morph);
    if (o <= 0) return;
    // Макет: 78×16 px, нижний край на 14 px ниже знака (в единицах viewBox).
    final rect = Rect.fromCenter(center: const Offset(50, 105.8), width: 75, height: 15.4);
    canvas.drawOval(
      rect,
      Paint()
        ..shader = ui.Gradient.radial(
          rect.center,
          rect.width / 2,
          [Color.fromRGBO(0, 0, 0, 0.55 * o), const Color(0x00000000)],
          [0, 0.7],
          TileMode.clamp,
          Matrix4.diagonal3Values(1, rect.height / rect.width, 1).storage,
        ),
    );
  }

  /// Контур V прорисовывается световой головкой, затем гаснет.
  void _paintOutline(Canvas canvas) {
    final p = _seg(introMs, 80, 820, const Cubic(0.62, 0.02, 0.24, 1));
    if (p <= 0) return;
    final len = _metric.length;

    final fade = 1 - _seg(introMs, 860, 300, Curves.ease);
    if (fade > 0) {
      canvas.drawPath(
        _metric.extractPath(0, len * p),
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.15
          ..strokeJoin = StrokeJoin.round
          ..color = _paper.withValues(alpha: 0.55 * fade),
      );
    }

    // Световая головка: короткий отрезок в точке отрисовки, со свечением.
    final x = ((introMs - 80) / 820).clamp(0.0, 1.0);
    final lead = _envelope(x, [0, 0.14, 0.82, 1], [0, 1, 1, 0]);
    if (lead > 0 && p > 0) {
      final end = len * p;
      final head = _metric.extractPath(math.max(0, end - len * 0.055), end);
      canvas.drawPath(
        head,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.9
          ..strokeCap = StrokeCap.round
          ..strokeJoin = StrokeJoin.round
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 1.6)
          ..color = const Color(0xFFFFFAF2).withValues(alpha: lead),
      );
      canvas.drawPath(
        head,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.9
          ..strokeCap = StrokeCap.round
          ..strokeJoin = StrokeJoin.round
          ..color = const Color(0xFFFFFAF2).withValues(alpha: lead),
      );
    }
  }

  /// Вспышка в момент проявления объёмного знака.
  void _paintBloom(Canvas canvas) {
    final p = _seg(introMs, 840, 720, const Cubic(0.2, 0.8, 0.3, 1));
    if (p <= 0 || p >= 1) return;
    final o = _envelope(p, [0, 0.28, 1], [0, 1, 0]);
    // Блок вспышки в макете — 150 px при знаке 104 px; радиус градиента идёт
    // до угла блока (farthest-corner), отсюда 102 единицы viewBox.
    final r = (0.45 + (1.25 - 0.45) * p) * 102;
    canvas.drawCircle(
      const Offset(50, 50),
      r,
      Paint()
        ..shader = ui.Gradient.radial(
          const Offset(50, 50),
          r,
          [
            Color.fromRGBO(255, 250, 242, 0.55 * o),
            Color.fromRGBO(255, 250, 242, 0.12 * o),
            const Color(0x00FFFAF2),
          ],
          [0, 0.42, 0.7],
        ),
    );
  }

  /// Объёмный знак: две плоскости ленты, свет сверху-слева, тень сгиба.
  void _paintSolidMark(Canvas canvas) {
    final p = _seg(introMs, 780, 660, const Cubic(0.18, 0.9, 0.24, 1));
    if (p <= 0) return;
    // В цикле ожидания знак «раздувается» и уступает место часам.
    final scale = (0.955 + (1 - 0.955) * p) * (1 + 0.12 * morph);

    canvas.save();
    canvas.translate(50, 50);
    canvas.scale(scale);
    canvas.translate(-50, -50);
    canvas.saveLayer(
      const Rect.fromLTWH(-40, -40, 180, 180),
      Paint()..color = Color.fromRGBO(0, 0, 0, p),
    );
    canvas.clipPath(_mark);

    canvas.drawPath(_mark, Paint()..color = _paper);

    // Тень от кромки верхней плоскости.
    canvas.save();
    canvas.translate(1.1, 1.5);
    canvas.drawPath(
      _fold,
      Paint()
        ..color = const Color(0x36000000)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 1.1),
    );
    canvas.restore();

    canvas.drawPath(_fold, Paint()..color = _paper);
    canvas.drawPath(
      _fold,
      Paint()
        ..shader = ui.Gradient.linear(const Offset(0, 0), const Offset(70, 100), [
          Color.fromRGBO(255, 255, 255, 0.16),
          Color.fromRGBO(255, 255, 255, 0.02),
        ]),
    );
    // Светящаяся кромка сгиба.
    canvas.drawPath(
      _fold,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.7
        ..color = Color.fromRGBO(255, 255, 255, 0.45),
    );
    // Общая объёмная подсветка знака.
    canvas.drawPath(
      _mark,
      Paint()
        ..shader = ui.Gradient.linear(
          const Offset(5, 0),
          const Offset(85, 100),
          [
            Color.fromRGBO(255, 255, 255, 0.22),
            Color.fromRGBO(255, 255, 255, 0.02),
            Color.fromRGBO(0, 0, 0, 0.14),
          ],
          [0, 0.45, 1],
        ),
    );

    canvas.restore();
    canvas.restore();
  }

  /// Цикл ожидания: знак превращается в песочные часы из двух половин V.
  void _paintHourglass(Canvas canvas) {
    // Колба «сжата» по вертикали, поэтому пути трансформируем сами —
    // так обводка остаётся равномерной (аналог vector-effect в SVG).
    final top = _mark.transform(
      (Matrix4.identity()
            ..translateByDouble(0, 3, 0, 1)
            ..scaleByDouble(1, 0.48, 1, 1))
          .storage,
    );
    final bottom = _mark.transform(
      (Matrix4.identity()
            ..translateByDouble(0, 97, 0, 1)
            ..scaleByDouble(1, -0.48, 1, 1))
          .storage,
    );

    // Пересыпание: уровень идёт 0 → 104 за 72 % цикла, затем колба переворачивается.
    final level = const Cubic(0.42, 0, 0.58, 1).transform((hg / 0.72).clamp(0.0, 1.0)) * 104;
    final spin = hg < 0.74
        ? 0.0
        : const Cubic(0.72, 0, 0.24, 1).transform((hg - 0.74) / 0.26) * math.pi;

    canvas.save();
    canvas.translate(50, 50);
    canvas.rotate(spin);
    canvas.translate(-50, -50);
    // Часы «вырастают» из знака.
    final s = 0.86 + 0.14 * morph;
    canvas.translate(50, 50);
    canvas.scale(s);
    canvas.translate(-50, -50);

    final glass = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2
      ..strokeJoin = StrokeJoin.round
      ..color = _paper.withValues(alpha: 0.28);

    final sandPaint = Paint()
      ..shader = ui.Gradient.linear(const Offset(0, 0), const Offset(75, 100), [
        Color.fromRGBO(255, 255, 255, 0.96),
        Color.fromRGBO(247, 246, 244, 0.78),
      ]);

    // Верхняя колба пустеет, нижняя наполняется.
    canvas.save();
    canvas.clipPath(top);
    canvas.drawRect(Rect.fromLTWH(-6, 3 + level * 0.48, 112, 96), sandPaint);
    canvas.restore();
    canvas.drawPath(top, glass);

    canvas.save();
    canvas.clipPath(bottom);
    canvas.drawRect(Rect.fromLTWH(-6, 97 - level * 0.48, 112, 96), sandPaint);
    canvas.restore();
    canvas.drawPath(bottom, glass);

    // Перешеек.
    canvas.drawLine(
      const Offset(45.4, 50),
      const Offset(54.6, 50),
      Paint()
        ..strokeWidth = 1
        ..strokeCap = StrokeCap.round
        ..color = _paper.withValues(alpha: 0.34),
    );

    // Струйка песка — видна, пока идёт пересыпание.
    final gate = _envelope(hg, [0, 0.03, 0.09, 0.66, 0.72, 1], [0, 0, 1, 1, 0, 0]);
    if (gate > 0) {
      final fall = _envelope(sand, [0, 0.3, 1], [0, 0.95, 0]);
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(49, 45 + (-4 + 12 * sand), 2, 12),
          const Radius.circular(1),
        ),
        Paint()..color = _paper.withValues(alpha: gate * fall),
      );
    }

    canvas.restore();
  }

  @override
  bool shouldRepaint(_MarkPainter old) =>
      old.introMs != introMs || old.morph != morph || old.hg != hg || old.sand != sand;
}
