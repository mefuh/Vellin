import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'svg_path.dart';

/// Иконки экрана звонка.
///
/// Рисуются по путям из макета, а не подбираются из шрифта Material: в
/// спецификации задана обводочная графика с толщиной 1.25 и своими
/// пропорциями, и ни один готовый набор её не повторяет.
class CallGlyph {
  /// Сторона квадрата, в котором заданы координаты (`viewBox` из макета).
  final double box;
  final List<GlyphStroke> strokes;
  final List<String> fills;

  /// Поворот всей фигуры вокруг центра, в градусах (трубка сброса).
  final double rotation;

  const CallGlyph({
    required this.box,
    this.strokes = const [],
    this.fills = const [],
    this.rotation = 0,
  });
}

/// Одна обводочная линия: путь и толщина.
class GlyphStroke {
  final String d;
  final double width;
  final StrokeJoin join;
  const GlyphStroke(this.d, {this.width = 1.25, this.join = StrokeJoin.round});
}

/// Прямоугольник со скруглением как путь SVG: макет задаёт их тегом `rect`,
/// а разборщику нужна строка `d`.
String _rect(double x, double y, double w, double h, double r) {
  String n(double v) => v.toStringAsFixed(3);
  return 'M${n(x + r)} ${n(y)}'
      'H${n(x + w - r)}A$r $r 0 0 1 ${n(x + w)} ${n(y + r)}'
      'V${n(y + h - r)}A$r $r 0 0 1 ${n(x + w - r)} ${n(y + h)}'
      'H${n(x + r)}A$r $r 0 0 1 ${n(x)} ${n(y + h - r)}'
      'V${n(y + r)}A$r $r 0 0 1 ${n(x + r)} ${n(y)}Z';
}

/// Окружность как путь: две полудуги.
String _circle(double cx, double cy, double r) =>
    'M${cx - r} $cy A$r $r 0 0 1 ${cx + r} $cy A$r $r 0 0 1 ${cx - r} $cy Z';

/// Набор иконок звонка. Пути перенесены из макета дословно.
class CallGlyphs {
  static const mic = CallGlyph(box: 16, strokes: [
    GlyphStroke('M6 3.6a2 2 0 014 0v3.6a2 2 0 01-4 0z'),
    GlyphStroke('M3.8 7.6a4.2 4.2 0 008.4 0M8 11.8V14'),
  ]);

  static const micOff = CallGlyph(box: 16, strokes: [
    GlyphStroke('M2.6 2.6l10.8 10.8'),
    GlyphStroke('M6 3.6a2 2 0 014 0v3.6M6 6.4v2.8a2 2 0 003 1.7'),
    GlyphStroke('M3.8 7.6a4.2 4.2 0 006 3.8M12.2 7.6a4.2 4.2 0 01-.3 1.5M8 11.8V14'),
  ]);

  static final camera = CallGlyph(box: 18, strokes: [
    GlyphStroke(_rect(1.6, 4.6, 10, 8.8, 2.2)),
    const GlyphStroke('M11.6 9l4.8-2.8v5.6L11.6 9z'),
  ]);

  static const cameraOff = CallGlyph(box: 18, strokes: [
    GlyphStroke('M2.4 2.4l13.2 13.2'),
    GlyphStroke('M11.6 9.4v1.8a2.2 2.2 0 01-2.2 2.2H3.8a2.2 2.2 0 01-2.2-2.2V6.8a2.2 2.2 0 012.2-2.2h2.4M11.6 7.2V6.8M11.6 9l4.8-2.8v5.6l-2.2-1.3'),
  ]);

  static final screen = CallGlyph(box: 18, strokes: [
    GlyphStroke(_rect(1.6, 2.8, 14.8, 10.4, 2)),
    const GlyphStroke('M6.4 15.8h5.2'),
  ]);

  static final gear = CallGlyph(box: 24, strokes: [
    GlyphStroke(_circle(12, 12, 3.1), width: 1.5),
    const GlyphStroke(
      'M19.1 14.2a1.6 1.6 0 00.32 1.76l.06.06a1.9 1.9 0 11-2.7 2.7l-.05-.06a1.6 1.6 0 00-1.77-.32 1.6 1.6 0 00-.97 1.47v.16a1.9 1.9 0 11-3.8 0v-.08a1.6 1.6 0 00-1.05-1.47 1.6 1.6 0 00-1.76.32l-.6.06a1.9 1.9 0 11-2.7-2.7l.06-.06a1.6 1.6 0 00.32-1.77 1.6 1.6 0 00-1.47-.97H3.7a1.9 1.9 0 010-3.8h.08a1.6 1.6 0 001.47-1.05 1.6 1.6 0 00-.32-1.76l-.06-.06a1.9 1.9 0 112.7-2.7l.5.06a1.6 1.6 0 001.77.32h.08a1.6 1.6 0 00.97-1.47V3.7a1.9 1.9 0 013.8 0v.08a1.6 1.6 0 00.97 1.47 1.6 1.6 0 001.77-.32l.05-.06a1.9 1.9 0 112.7 2.7l-.6.05a1.6 1.6 0 00-.32 1.77v.08a1.6 1.6 0 001.47.97h.16a1.9 1.9 0 010 3.8h-.08a1.6 1.6 0 00-1.47.97z',
      width: 1.5,
      join: StrokeJoin.round,
    ),
  ]);

  /// Трубка. Ровная — ответ на звонок.
  static const _handset =
      'M7.6 3.4c-.5-.9-1.6-1.2-2.5-.8l-1.4.7C2.6 3.9 2 5.1 2.2 6.3c.6 3.5 2.3 6.8 4.9 9.4 2.6 2.6 5.9 4.3 9.4 4.9 1.2.2 2.4-.4 2.9-1.5l.7-1.4c.4-.9.1-2-.8-2.5l-2.7-1.6c-.8-.5-1.9-.3-2.5.5l-.9 1.1c-1.4-.7-2.7-1.6-3.8-2.7-1.1-1.1-2-2.4-2.7-3.8l1.1-.9c.8-.6 1-1.7.5-2.5L7.6 3.4z';

  /// Трубка сброса — единственная залитая иконка, повёрнута на 133°.
  static const hangup = CallGlyph(box: 24, rotation: 133, fills: [_handset]);

  /// Она же ровно — ответить.
  static const answer = CallGlyph(box: 24, fills: [_handset]);

  static const eyeOff = CallGlyph(box: 16, strokes: [
    GlyphStroke('M2 2l12 12', width: 1.2),
    GlyphStroke(
      'M6.2 4.1A6.9 6.9 0 018 3.9c3.9 0 6.5 4.1 6.5 4.1s-.8 1.3-2.2 2.4M9.7 11.9a6.9 6.9 0 01-1.7.2C4.1 12.1 1.5 8 1.5 8s1-1.6 2.7-2.8',
      width: 1.2,
    ),
  ]);

  static final monitor = CallGlyph(box: 16, strokes: [
    GlyphStroke(_rect(1.4, 2.6, 13.2, 9.4, 1.6), width: 1.2),
    const GlyphStroke('M5.6 14.4h4.8', width: 1.2),
  ]);

  static final split = CallGlyph(box: 14, strokes: [
    GlyphStroke(_rect(1, 3, 5.2, 8, 1.3), width: 1.1),
    GlyphStroke(_rect(7.8, 3, 5.2, 8, 1.3), width: 1.1),
  ]);

  static const chevronDown = CallGlyph(box: 12, strokes: [
    GlyphStroke('M2.5 4.5L6 8l3.5-3.5', width: 1.2),
  ]);

  static const chevronUp = CallGlyph(box: 12, strokes: [
    GlyphStroke('M2.5 7.5L6 4l3.5 3.5', width: 1.2),
  ]);

  static const close = CallGlyph(box: 11, strokes: [
    GlyphStroke('M1.5 1.5l8 8M9.5 1.5l-8 8', width: 1.2),
  ]);

  static const minus = CallGlyph(box: 12, strokes: [
    GlyphStroke('M2 6h8', width: 1.2),
  ]);

  /// Перечёркнутый микрофон в мелком размере — метка «микрофон выключен».
  static const micMutedSmall = CallGlyph(box: 16, strokes: [
    GlyphStroke('M3 3l10 10', width: 1.2),
    GlyphStroke('M8 2.4a1.9 1.9 0 011.9 1.9v3.3M6.1 6v2.3a1.9 1.9 0 002.9 1.6', width: 1.2),
    GlyphStroke('M12 8.4a4 4 0 01-5.6 3.5M4 8.4a4 4 0 00.5 1.9', width: 1.2),
  ]);
}

/// Нарисованная иконка звонка.
class CallIcon extends StatelessWidget {
  final CallGlyph glyph;
  final double size;
  final Color color;

  const CallIcon(this.glyph, {super.key, this.size = 19, this.color = Colors.white});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(painter: _GlyphPainter(glyph, color)),
    );
  }
}

class _GlyphPainter extends CustomPainter {
  final CallGlyph glyph;
  final Color color;
  _GlyphPainter(this.glyph, this.color);

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / glyph.box;
    canvas.save();
    if (glyph.rotation != 0) {
      final center = size.width / 2;
      canvas.translate(center, center);
      canvas.rotate(glyph.rotation * math.pi / 180);
      canvas.translate(-center, -center);
    }
    canvas.scale(scale);

    for (final d in glyph.fills) {
      canvas.drawPath(parseSvgPath(d), Paint()..color = color);
    }
    for (final stroke in glyph.strokes) {
      canvas.drawPath(
        parseSvgPath(stroke.d),
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          // Толщина задана в координатах макета — масштаб её уже растянул.
          ..strokeWidth = stroke.width
          ..strokeCap = StrokeCap.round
          ..strokeJoin = stroke.join,
      );
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_GlyphPainter old) => old.glyph != glyph || old.color != color;
}
