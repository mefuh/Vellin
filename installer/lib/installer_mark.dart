// Знак Vellin для окна установщика: интро-анимация (та же, что в апдейтере),
// цикл установки — знак собирается снизу вверх из горизонтальных слоёв со
// световым сканом, и финальный «перелив» света по готовому знаку.
//
// Нативная отрисовка макета `vellin_installer.html` на CustomPainter — без
// WebView: установщик не должен зависеть от рантайма WebView2.

import 'dart:ui' as ui;

import 'package:flutter/material.dart';

const Color kPaper = Color(0xFFF7F6F4);

/// Контур V — путь из бренд-набора (viewBox 0 0 100 100).
Path buildMarkPath() => Path()
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

/// Полуплоскость верхней плоскости ленты — даёт сгиб и его тень.
Path buildFoldPath() => Path()
  ..moveTo(75.8, 0)
  ..lineTo(-30, 0)
  ..lineTo(-30, 130)
  ..lineTo(18.1, 130)
  ..close();

/// Доля отрезка анимации [startMs, startMs+durMs] в момент [tMs].
double seg(double tMs, double startMs, double durMs, [Curve curve = Curves.linear]) {
  if (durMs <= 0) return 1;
  return curve.transform(((tMs - startMs) / durMs).clamp(0.0, 1.0));
}

/// Кусочно-линейная огибающая по опорным точкам.
double envelope(double x, List<double> stops, List<double> values) {
  if (x <= stops.first) return values.first;
  for (var i = 1; i < stops.length; i++) {
    if (x <= stops[i]) {
      final k = (x - stops[i - 1]) / (stops[i] - stops[i - 1]);
      return values[i - 1] + (values[i] - values[i - 1]) * k;
    }
  }
  return values.last;
}

/// Рисует знак во всех его состояниях. Размер холста — 84×84 (макет).
class InstallerMarkPainter extends CustomPainter {
  InstallerMarkPainter({
    required this.introMs,
    required this.building,
    required this.build,
    required this.scan,
    required this.done,
    required this.sheen,
  });

  /// Время от старта интро, мс.
  final double introMs;

  /// 0 — цельный знак, 1 — знак «в сборке» (шаг установки).
  final double building;

  /// Фаза цикла сборки слоёв (0..1, период 2,55 с) и скана (0..1, 1,7 с).
  final double build;
  final double scan;

  /// 0 — обычный знак, 1 — финальное состояние (ореол + перелив).
  final double done;

  /// Фаза цикла перелива/ореола (0..1, период 3,2 с).
  final double sheen;

  static final Path _mark = buildMarkPath();
  static final Path _fold = buildFoldPath();
  static final ui.PathMetric _metric = _mark.computeMetrics().first;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 100);

    _paintHalo(canvas);
    _paintGroundShadow(canvas);
    _paintOutline(canvas);
    _paintBloom(canvas);
    _paintSolidMark(canvas);
    if (building > 0) _paintBuild(canvas);
    if (done > 0) _paintSheen(canvas);

    canvas.restore();
  }

  /// Ореол на финальном экране: дышит вместе с переливом.
  void _paintHalo(Canvas canvas) {
    if (done <= 0) return;
    // 150 px при знаке 84 px; радиус градиента — до угла блока.
    // Прозрачность слоя дышит .34 → .72, стопы градиента — из макета (.34/.08).
    final o = envelope(sheen, [0, 0.46, 1], [0.34, 0.72, 0.34]) * done;
    final r = 126.3 * envelope(sheen, [0, 0.46, 1], [1.0, 1.1, 1.0]);
    canvas.drawCircle(
      const Offset(50, 50),
      r,
      Paint()
        ..shader = ui.Gradient.radial(const Offset(50, 50), r, [
          Color.fromRGBO(255, 250, 242, 0.34 * o),
          Color.fromRGBO(255, 250, 242, 0.08 * o),
          const Color(0x00FFFAF2),
        ], [
          0,
          0.46,
          0.7,
        ]),
    );
  }

  /// Мягкая тень под знаком — «ставит» его на плоскость.
  void _paintGroundShadow(Canvas canvas) {
    var o = seg(introMs, 950, 600, Curves.ease);
    if (done > 0) {
      o *= envelope(sheen, [0, 0.46, 1], [1.0, 0.62, 1.0]);
    }
    if (o <= 0) return;
    // Макет: 64×14 px, нижний край на 12 px ниже знака 84 px.
    final rect = Rect.fromCenter(center: const Offset(50, 106), width: 76.2, height: 16.7);
    canvas.drawOval(
      rect,
      Paint()
        ..shader = ui.Gradient.radial(
          rect.center,
          rect.width / 2,
          [Color.fromRGBO(0, 0, 0, 0.5 * o), const Color(0x00000000)],
          [0, 0.7],
          TileMode.clamp,
          Matrix4.diagonal3Values(1, rect.height / rect.width, 1).storage,
        ),
    );
  }

  /// Контур V прорисовывается световой головкой, затем гаснет.
  void _paintOutline(Canvas canvas) {
    final p = seg(introMs, 80, 820, const Cubic(0.62, 0.02, 0.24, 1));
    if (p <= 0) return;
    final len = _metric.length;

    final fade = 1 - seg(introMs, 860, 300, Curves.ease);
    if (fade > 0) {
      canvas.drawPath(
        _metric.extractPath(0, len * p),
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.15
          ..strokeJoin = StrokeJoin.round
          ..color = kPaper.withValues(alpha: 0.55 * fade),
      );
    }

    final x = ((introMs - 80) / 820).clamp(0.0, 1.0);
    final lead = envelope(x, [0, 0.14, 0.82, 1], [0, 1, 1, 0]);
    if (lead > 0) {
      final end = len * p;
      final head = _metric.extractPath((end - len * 0.055).clamp(0.0, len), end);
      for (final blur in [true, false]) {
        canvas.drawPath(
          head,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 1.9
            ..strokeCap = StrokeCap.round
            ..strokeJoin = StrokeJoin.round
            ..maskFilter = blur ? const MaskFilter.blur(BlurStyle.normal, 1.6) : null
            ..color = const Color(0xFFFFFAF2).withValues(alpha: lead),
        );
      }
    }
  }

  /// Вспышка в момент проявления объёмного знака.
  void _paintBloom(Canvas canvas) {
    final p = seg(introMs, 840, 720, const Cubic(0.2, 0.8, 0.3, 1));
    if (p <= 0 || p >= 1) return;
    final o = envelope(p, [0, 0.28, 1], [0, 1, 0]);
    // Блок 130 px при знаке 84 px, радиус — до угла блока.
    final r = (0.45 + 0.8 * p) * 109.4;
    canvas.drawCircle(
      const Offset(50, 50),
      r,
      Paint()
        ..shader = ui.Gradient.radial(const Offset(50, 50), r, [
          Color.fromRGBO(255, 250, 242, 0.55 * o),
          Color.fromRGBO(255, 250, 242, 0.12 * o),
          const Color(0x00FFFAF2),
        ], [
          0,
          0.42,
          0.7,
        ]),
    );
  }

  /// Объёмный знак: две плоскости ленты, свет сверху-слева, тень сгиба.
  void _paintSolidMark(Canvas canvas) {
    final appear = seg(introMs, 780, 660, const Cubic(0.18, 0.9, 0.24, 1));
    // На шаге установки цельный знак уступает место «сборке».
    final opacity = appear * (1 - building);
    if (opacity <= 0) return;
    final scale = (0.955 + 0.045 * appear) * (1 + 0.06 * building);

    canvas.save();
    canvas.translate(50, 50);
    canvas.scale(scale);
    canvas.translate(-50, -50);
    canvas.saveLayer(
      const Rect.fromLTWH(-40, -40, 180, 180),
      Paint()..color = Color.fromRGBO(0, 0, 0, opacity),
    );
    canvas.clipPath(_mark);

    canvas.drawPath(_mark, Paint()..color = kPaper);

    canvas.save();
    canvas.translate(1.1, 1.5);
    canvas.drawPath(
      _fold,
      Paint()
        ..color = const Color(0x36000000)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 1.1),
    );
    canvas.restore();

    canvas.drawPath(_fold, Paint()..color = kPaper);
    canvas.drawPath(
      _fold,
      Paint()
        ..shader = ui.Gradient.linear(const Offset(0, 0), const Offset(70, 100), [
          Color.fromRGBO(255, 255, 255, 0.16),
          Color.fromRGBO(255, 255, 255, 0.02),
        ]),
    );
    canvas.drawPath(
      _fold,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.7
        ..color = Color.fromRGBO(255, 255, 255, 0.45),
    );
    canvas.drawPath(
      _mark,
      Paint()
        ..shader = ui.Gradient.linear(const Offset(5, 0), const Offset(85, 100), [
          Color.fromRGBO(255, 255, 255, 0.22),
          Color.fromRGBO(255, 255, 255, 0.02),
          Color.fromRGBO(0, 0, 0, 0.14),
        ], [
          0,
          0.45,
          1,
        ]),
    );

    canvas.restore();
    canvas.restore();
  }

  /// Шаг установки: знак собирается снизу вверх из слоёв, по ним идёт скан.
  void _paintBuild(Canvas canvas) {
    canvas.saveLayer(
      const Rect.fromLTWH(-40, -40, 180, 180),
      Paint()..color = Color.fromRGBO(0, 0, 0, building),
    );

    // Пустая «форма» знака, в которую укладываются слои.
    canvas.drawPath(
      _mark,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.1
        ..strokeJoin = StrokeJoin.round
        ..color = kPaper.withValues(alpha: 0.26),
    );

    canvas.save();
    canvas.clipPath(_mark);

    // 8 слоёв снизу вверх, каждый со своей задержкой в 2,55-секундном цикле.
    const ys = [86.0, 74.0, 62.0, 50.0, 38.0, 26.0, 14.0, 2.0];
    for (var i = 0; i < ys.length; i++) {
      // Задержка .125 c на слой, цикл 2,55 c.
      final phase = (build - i * (125 / 2550)) % 1.0;
      final t = phase < 0 ? phase + 1 : phase;
      final o = envelope(t, [0, 0.10, 0.62, 0.76, 1], [0, 1, 1, 0.14, 0.14]);
      final dx = -24 * (1 - seg(t, 0, 0.10, const Cubic(0.2, 0.92, 0.24, 1)));
      final rect = Rect.fromLTWH(-4 + dx, ys[i], 108, 10.5);
      canvas.drawRect(
        rect,
        Paint()
          ..shader = ui.Gradient.linear(
            Offset(rect.left, 0),
            Offset(rect.right, 0),
            [
              Color.fromRGBO(247, 246, 244, 0.72 * o),
              Color.fromRGBO(255, 250, 242, 0.96 * o),
              Color.fromRGBO(247, 246, 244, 0.72 * o),
            ],
            [0, 0.55, 1],
          ),
      );
    }

    // Световой скан снизу вверх — метафора записи файлов.
    final so = envelope(scan, [0, 0.18, 0.82, 1], [0, 0.85, 0.85, 0]);
    if (so > 0) {
      final y = 92 - 94 * scan;
      final rect = Rect.fromLTWH(-4, y, 108, 7);
      canvas.drawRect(
        rect,
        Paint()
          ..shader = ui.Gradient.linear(
            Offset(0, rect.top),
            Offset(0, rect.bottom),
            [
              const Color(0x00FFFAF2),
              Color.fromRGBO(255, 250, 242, 0.9 * so),
              const Color(0x00FFFAF2),
            ],
            [0, 0.5, 1],
          ),
      );
    }

    canvas.restore();
    canvas.restore();
  }

  /// Финал: диагональная полоса света проходит сквозь готовый знак.
  void _paintSheen(Canvas canvas) {
    canvas.save();
    canvas.clipPath(_mark);
    // swipe: (-118,118) → (118,-118), к 42 % цикла уже в конечной точке.
    final k = seg(sheen, 0, 0.42, const Cubic(0.45, 0, 0.35, 1));
    final d = -118 + 236 * k;
    canvas.translate(d, -d);
    canvas.drawRect(
      const Rect.fromLTWH(-30, -30, 160, 160),
      Paint()
        ..shader = ui.Gradient.linear(const Offset(-30, 130), const Offset(130, -30), [
          const Color(0x00FFFAF2),
          Color.fromRGBO(255, 250, 242, 0.95 * 0.5 * done),
          const Color(0x00FFFAF2),
        ], [
          0,
          0.5,
          1,
        ]),
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(InstallerMarkPainter old) =>
      old.introMs != introMs ||
      old.building != building ||
      old.build != build ||
      old.scan != scan ||
      old.done != done ||
      old.sheen != sheen;
}

/// Фон окна: тёплая эллиптическая засветка сверху, затемнение к нижнему краю
/// и тонкая рамка — `radial-gradient(120% 90% at 50% 22%)` из макета.
class InstallerBackdropPainter extends CustomPainter {
  const InstallerBackdropPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final center = Offset(size.width * 0.5, size.height * 0.22);
    final ry = size.height * 0.90;
    final rx = size.width * 1.20;

    canvas.drawRect(
      rect,
      Paint()
        ..shader = ui.Gradient.radial(
          center,
          ry,
          const [Color(0xFF241D18), Color(0xFF14100D), Color(0xFF0B0908)],
          const [0, 0.52, 1],
          TileMode.clamp,
          (Matrix4.identity()
                ..translateByDouble(center.dx, center.dy, 0, 1)
                ..scaleByDouble(rx / ry, 1, 1, 1)
                ..translateByDouble(-center.dx, -center.dy, 0, 1))
              .storage,
        ),
    );

    canvas.drawRect(
      rect,
      Paint()
        ..shader = ui.Gradient.linear(
          Offset(0, size.height),
          Offset(0, size.height - 170),
          const [Color(0x7A000000), Color(0x00000000)],
        ),
    );

    canvas.drawRect(
      rect.deflate(0.5),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = kPaper.withValues(alpha: 0.06),
    );
  }

  @override
  bool shouldRepaint(InstallerBackdropPainter old) => false;
}
