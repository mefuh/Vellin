import 'dart:math' as math;
import 'dart:ui';

/// Разбор строки `d` из SVG в `Path`.
///
/// Нужен, чтобы иконки звонка рисовались ровно теми же кривыми, что в макете:
/// пути из спецификации переносятся в код как есть, без перерисовки на глаз.
/// Поддержаны все команды, встречающиеся в макете: M/L/H/V/C/S/Q/T/A/Z и их
/// относительные варианты.
Path parseSvgPath(String d) {
  final path = Path();
  final tokens = _Scanner(d);
  var current = Offset.zero;
  var start = Offset.zero;
  // Опорная точка для сокращённых кривых (S и T): отражение предыдущей.
  Offset? lastCubicControl;
  Offset? lastQuadControl;
  var command = '';

  while (!tokens.atEnd) {
    final next = tokens.peekCommand();
    if (next != null) {
      command = next;
      tokens.takeCommand();
    } else if (command.isEmpty) {
      break;
    } else if (command == 'M') {
      // Лишние пары координат после M — это неявные L.
      command = 'L';
    } else if (command == 'm') {
      command = 'l';
    }

    final relative = command.toLowerCase() == command;
    Offset point(double x, double y) => relative ? current + Offset(x, y) : Offset(x, y);

    switch (command.toUpperCase()) {
      case 'M':
        current = point(tokens.number(), tokens.number());
        path.moveTo(current.dx, current.dy);
        start = current;
        lastCubicControl = null;
        lastQuadControl = null;
      case 'L':
        current = point(tokens.number(), tokens.number());
        path.lineTo(current.dx, current.dy);
        lastCubicControl = null;
        lastQuadControl = null;
      case 'H':
        final x = tokens.number();
        current = Offset(relative ? current.dx + x : x, current.dy);
        path.lineTo(current.dx, current.dy);
        lastCubicControl = null;
        lastQuadControl = null;
      case 'V':
        final y = tokens.number();
        current = Offset(current.dx, relative ? current.dy + y : y);
        path.lineTo(current.dx, current.dy);
        lastCubicControl = null;
        lastQuadControl = null;
      case 'C':
        final c1 = point(tokens.number(), tokens.number());
        final c2 = point(tokens.number(), tokens.number());
        current = point(tokens.number(), tokens.number());
        path.cubicTo(c1.dx, c1.dy, c2.dx, c2.dy, current.dx, current.dy);
        lastCubicControl = c2;
        lastQuadControl = null;
      case 'S':
        final c1 = lastCubicControl == null ? current : current * 2 - lastCubicControl;
        final c2 = point(tokens.number(), tokens.number());
        current = point(tokens.number(), tokens.number());
        path.cubicTo(c1.dx, c1.dy, c2.dx, c2.dy, current.dx, current.dy);
        lastCubicControl = c2;
        lastQuadControl = null;
      case 'Q':
        final c = point(tokens.number(), tokens.number());
        current = point(tokens.number(), tokens.number());
        path.quadraticBezierTo(c.dx, c.dy, current.dx, current.dy);
        lastQuadControl = c;
        lastCubicControl = null;
      case 'T':
        final c = lastQuadControl == null ? current : current * 2 - lastQuadControl;
        current = point(tokens.number(), tokens.number());
        path.quadraticBezierTo(c.dx, c.dy, current.dx, current.dy);
        lastQuadControl = c;
        lastCubicControl = null;
      case 'A':
        final rx = tokens.number();
        final ry = tokens.number();
        final rotation = tokens.number();
        final largeArc = tokens.flag();
        final sweep = tokens.flag();
        final end = point(tokens.number(), tokens.number());
        _arcTo(path, current, end, rx, ry, rotation, largeArc, sweep);
        current = end;
        lastCubicControl = null;
        lastQuadControl = null;
      case 'Z':
        path.close();
        current = start;
        lastCubicControl = null;
        lastQuadControl = null;
      default:
        // Незнакомая команда — дальше разбирать бессмысленно.
        return path;
    }
  }
  return path;
}

/// Дуга из SVG (задана концом и радиусами) в набор кубических кривых.
///
/// `Path.arcToPoint` умеет это сам, но падает на вырожденных случаях, которые
/// в иконках встречаются (полукруг с точным совпадением радиуса и хорды), —
/// поэтому пересчёт делаем руками, по формулам из спецификации SVG.
void _arcTo(
  Path path,
  Offset from,
  Offset to,
  double rx,
  double ry,
  double rotationDeg,
  bool largeArc,
  bool sweep,
) {
  if (from == to) return;
  if (rx == 0 || ry == 0) {
    path.lineTo(to.dx, to.dy);
    return;
  }
  rx = rx.abs();
  ry = ry.abs();

  final phi = rotationDeg * math.pi / 180.0;
  final cosPhi = math.cos(phi);
  final sinPhi = math.sin(phi);

  final dx2 = (from.dx - to.dx) / 2.0;
  final dy2 = (from.dy - to.dy) / 2.0;
  final x1 = cosPhi * dx2 + sinPhi * dy2;
  final y1 = -sinPhi * dx2 + cosPhi * dy2;

  // Радиусы могут не дотягивать до хорды — тогда их растягивают.
  final lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    final scale = math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
  }

  final sign = largeArc == sweep ? -1.0 : 1.0;
  final numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  final denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  final coefficient = denominator == 0 ? 0.0 : sign * math.sqrt(math.max(0, numerator / denominator));
  final cx1 = coefficient * rx * y1 / ry;
  final cy1 = -coefficient * ry * x1 / rx;

  final cx = cosPhi * cx1 - sinPhi * cy1 + (from.dx + to.dx) / 2.0;
  final cy = sinPhi * cx1 + cosPhi * cy1 + (from.dy + to.dy) / 2.0;

  double angle(double ux, double uy, double vx, double vy) {
    final dot = ux * vx + uy * vy;
    final len = math.sqrt(ux * ux + uy * uy) * math.sqrt(vx * vx + vy * vy);
    if (len == 0) return 0;
    var a = math.acos((dot / len).clamp(-1.0, 1.0));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  }

  final startAngle = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  var sweepAngle = angle(
    (x1 - cx1) / rx,
    (y1 - cy1) / ry,
    (-x1 - cx1) / rx,
    (-y1 - cy1) / ry,
  );
  if (!sweep && sweepAngle > 0) sweepAngle -= 2 * math.pi;
  if (sweep && sweepAngle < 0) sweepAngle += 2 * math.pi;

  // Дугу режем на куски не длиннее четверти оборота: на больших кусках
  // кубическое приближение заметно уводит линию.
  final segments = math.max(1, (sweepAngle.abs() / (math.pi / 2)).ceil());
  final delta = sweepAngle / segments;
  final t = 4 / 3 * math.tan(delta / 4);

  var theta = startAngle;
  for (var i = 0; i < segments; i++) {
    final theta2 = theta + delta;
    final cosT1 = math.cos(theta);
    final sinT1 = math.sin(theta);
    final cosT2 = math.cos(theta2);
    final sinT2 = math.sin(theta2);

    Offset toGlobal(double ex, double ey) => Offset(
          cosPhi * rx * ex - sinPhi * ry * ey + cx,
          sinPhi * rx * ex + cosPhi * ry * ey + cy,
        );

    final p1 = toGlobal(cosT1 - t * sinT1, sinT1 + t * cosT1);
    final p2 = toGlobal(cosT2 + t * sinT2, sinT2 - t * cosT2);
    final p3 = toGlobal(cosT2, sinT2);
    path.cubicTo(p1.dx, p1.dy, p2.dx, p2.dy, p3.dx, p3.dy);
    theta = theta2;
  }
}

/// Простейший разборщик чисел и команд пути.
class _Scanner {
  final String _s;
  int _i = 0;
  _Scanner(this._s);

  bool get atEnd {
    _skip();
    return _i >= _s.length;
  }

  void _skip() {
    while (_i < _s.length) {
      final c = _s.codeUnitAt(_i);
      // Пробелы, переводы строк и запятые — разделители.
      if (c == 32 || c == 9 || c == 10 || c == 13 || c == 44) {
        _i++;
      } else {
        break;
      }
    }
  }

  String? peekCommand() {
    _skip();
    if (_i >= _s.length) return null;
    final c = _s[_i];
    final code = c.codeUnitAt(0);
    final isLetter = (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    return isLetter ? c : null;
  }

  void takeCommand() => _i++;

  double number() {
    _skip();
    final startIndex = _i;
    if (_i < _s.length && (_s[_i] == '-' || _s[_i] == '+')) _i++;
    while (_i < _s.length) {
      final c = _s.codeUnitAt(_i);
      final isDigit = c >= 48 && c <= 57;
      final isDot = c == 46;
      final isExp = c == 101 || c == 69;
      if (isDigit || isDot || isExp) {
        _i++;
        // Знак после экспоненты — часть числа.
        if (isExp && _i < _s.length && (_s[_i] == '-' || _s[_i] == '+')) _i++;
      } else {
        break;
      }
    }
    return double.tryParse(_s.substring(startIndex, _i)) ?? 0;
  }

  /// Флаг дуги — всегда одна цифра, и она может стоять вплотную к следующей.
  bool flag() {
    _skip();
    if (_i >= _s.length) return false;
    final c = _s[_i];
    _i++;
    return c == '1';
  }
}
