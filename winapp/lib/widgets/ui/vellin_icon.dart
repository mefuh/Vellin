import 'package:flutter/widgets.dart';

import '../../theme/vellin_design.dart';
import '../../theme/vellin_glyphs.dart';
import '../call/svg_path.dart';

/// Иконка клиента: штриховые пути из `vellin_glyphs.dart`.
///
/// Material-иконок в приложении нет: спецификация задаёт обводочную графику с
/// толщиной 1.25 в боксе 18×18, и ни один готовый набор её не повторяет.
/// Пути переносятся из макета как есть и разбираются тем же разборщиком, что
/// иконки звонка (`widgets/call/svg_path.dart`) — второй набор правил рисования
/// в приложении не нужен.
class VellinIcon extends StatelessWidget {
  /// Обводочные пути `d` из [VellinGlyphs].
  final List<String> paths;

  /// Сторона, в которую вписывается иконка (ширина бокса после масштаба).
  final double size;

  final Color color;

  /// Координатный бокс, в котором заданы пути. У большинства глифов 18×18,
  /// но галочки статуса и кнопки окна заданы в своих боксах.
  final Size box;

  /// Толщина обводки в координатах бокса — масштаб растянет её вместе с путём.
  final double stroke;

  /// Заливочные пути (трубка, треугольник play) — рисуются под обводкой.
  final List<String> fills;

  /// Доля прочерченности пути 0..1 — для галочек «доставлено/прочитано»,
  /// которые в макете рисуются от начала к концу.
  final double progress;

  const VellinIcon(
    this.paths, {
    super.key,
    this.size = 18,
    this.color = VellinColors.ink62,
    this.box = const Size(18, 18),
    this.stroke = VellinGlyphs.stroke,
    this.fills = const [],
    this.progress = 1,
  });

  /// Иконка из одного заливочного пути.
  VellinIcon.filled(
    String path, {
    super.key,
    this.size = 18,
    this.color = VellinColors.ink62,
    this.box = const Size(18, 18),
  })  : paths = const [],
        fills = [path],
        stroke = VellinGlyphs.stroke,
        progress = 1;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size * box.height / box.width,
      child: CustomPaint(
        painter: _VellinGlyphPainter(
          paths: paths,
          fills: fills,
          color: color,
          box: box,
          stroke: stroke,
          progress: progress,
        ),
      ),
    );
  }
}

class _VellinGlyphPainter extends CustomPainter {
  final List<String> paths;
  final List<String> fills;
  final Color color;
  final Size box;
  final double stroke;
  final double progress;

  _VellinGlyphPainter({
    required this.paths,
    required this.fills,
    required this.color,
    required this.box,
    required this.stroke,
    required this.progress,
  });

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / box.width);

    for (final d in fills) {
      canvas.drawPath(parseSvgPath(d), Paint()..color = color);
    }

    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = VellinGlyphs.cap
      ..strokeJoin = VellinGlyphs.join;

    for (final d in paths) {
      final path = parseSvgPath(d);
      canvas.drawPath(progress >= 1 ? path : _trim(path, progress), paint);
    }
    canvas.restore();
  }

  /// Кусок пути от начала до доли [t] — этим прочерчиваются галочки статуса.
  Path _trim(Path path, double t) {
    final out = Path();
    for (final metric in path.computeMetrics()) {
      out.addPath(metric.extractPath(0, metric.length * t.clamp(0, 1)), Offset.zero);
    }
    return out;
  }

  @override
  bool shouldRepaint(_VellinGlyphPainter old) =>
      old.color != color ||
      old.progress != progress ||
      old.stroke != stroke ||
      old.box != box ||
      !identical(old.paths, paths) ||
      !identical(old.fills, fills);
}
