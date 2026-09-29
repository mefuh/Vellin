import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:screen_retriever/screen_retriever.dart';
import 'package:window_manager/window_manager.dart';

import '../storage/prefs.dart';

/// Где и каким было окно приложения в прошлый раз.
///
/// Запоминаются обычные границы (положение и размер), разворот и полный экран.
/// В развёрнутом окне и в полном экране границы НЕ перезаписываются: иначе
/// после сворачивания обратно окно получило бы размер во весь экран, и кнопка
/// «восстановить» перестала бы что-либо восстанавливать.
class WindowPlacement with WindowListener {
  WindowPlacement._();
  static final instance = WindowPlacement._();

  static const _kX = 'vellin_window_x';
  static const _kY = 'vellin_window_y';
  static const _kW = 'vellin_window_w';
  static const _kH = 'vellin_window_h';
  static const _kMaximized = 'vellin_window_maximized';
  static const _kFullScreen = 'vellin_window_fullscreen';

  /// Пауза перед записью: перетаскивание и растягивание сыплют событиями,
  /// и писать файл настроек на каждое из них незачем.
  static const _debounce = Duration(milliseconds: 350);

  bool _tracking = false;
  Timer? _pending;

  /// Запоминать ли положение прямо сейчас. Окна апдейтера и входа намеренно
  /// маленькие и фиксированные — их размер к делу не относится.
  void start() {
    if (_tracking) return;
    _tracking = true;
    windowManager.addListener(this);
  }

  void stop() {
    if (!_tracking) return;
    _tracking = false;
    _pending?.cancel();
    _pending = null;
    windowManager.removeListener(this);
  }

  /// Вернуть окну прошлые положение и размер. Возвращает false, когда
  /// запомненного нет — вызывающий ставит окно по умолчанию.
  ///
  /// Границы сверяются с реально подключёнными экранами: монитор, на котором
  /// окно стояло в прошлый раз, мог исчезнуть, и без проверки окно уехало бы
  /// за пределы видимого, откуда его не достать.
  Future<bool> restore() async {
    try {
      final p = await openPrefs();
      final x = p.getDouble(_kX);
      final y = p.getDouble(_kY);
      final w = p.getDouble(_kW);
      final h = p.getDouble(_kH);
      if (x == null || y == null || w == null || h == null) return false;

      final wanted = Rect.fromLTWH(x, y, w, h);
      final bounds = await _onScreen(wanted);
      if (bounds == null) return false;
      await windowManager.setBounds(bounds);

      // Полный экран и разворот — поверх обычных границ: под ними останется
      // то, что окно займёт по кнопке «восстановить».
      if (p.getBool(_kFullScreen) ?? false) {
        await windowManager.setFullScreen(true);
      } else if (p.getBool(_kMaximized) ?? false) {
        await windowManager.maximize();
      }
      return true;
    } catch (_) {
      // Настройки не прочитались — окно откроется как в первый раз.
      return false;
    }
  }

  /// Границы, приведённые к видимой области. null — подходящего экрана нет.
  ///
  /// Окно должно пересекаться с рабочей областью заметным куском: уголок в
  /// пару пикселей формально «на экране», но мышью за него не ухватиться.
  Future<Rect?> _onScreen(Rect wanted) async {
    final displays = await screenRetriever.getAllDisplays();
    if (displays.isEmpty) return wanted;

    for (final d in displays) {
      final origin = d.visiblePosition ?? Offset.zero;
      final size = d.visibleSize ?? d.size;
      final area = Rect.fromLTWH(origin.dx, origin.dy, size.width, size.height);
      final seen = area.intersect(wanted);
      if (seen.width >= 120 && seen.height >= 60) {
        // Экран тот же, но стал меньше — ужимаем окно до рабочей области.
        final w = wanted.width.clamp(0.0, area.width);
        final h = wanted.height.clamp(0.0, area.height);
        final x = wanted.left.clamp(area.left, area.right - w);
        final y = wanted.top.clamp(area.top, area.bottom - h);
        return Rect.fromLTWH(x, y, w, h);
      }
    }
    return null;
  }

  /// Записать состояние окна. [now] — без паузы: перед закрытием ждать нечего.
  Future<void> save({bool now = false}) async {
    if (!_tracking) return;
    _pending?.cancel();
    if (!now) {
      _pending = Timer(_debounce, () => save(now: true));
      return;
    }
    try {
      final full = await windowManager.isFullScreen();
      final max = await windowManager.isMaximized();
      final p = await openPrefs();
      await p.setBool(_kFullScreen, full);
      await p.setBool(_kMaximized, max);
      // Границы запоминаем только у обычного окна: у развёрнутого они равны
      // экрану и затёрли бы то, куда окно должно вернуться.
      if (!full && !max) {
        final b = await windowManager.getBounds();
        // Свёрнутое окно Windows отдаёт координатами вида −32000. Запомнить
        // такие — значит потерять окно при следующем запуске.
        if (b.left > -30000 && b.top > -30000 && b.width >= 200 && b.height >= 200) {
          await p.setDouble(_kX, b.left);
          await p.setDouble(_kY, b.top);
          await p.setDouble(_kW, b.width);
          await p.setDouble(_kH, b.height);
        }
      }
    } catch (_) {
      // Не записалось — в следующий раз окно откроется на прежнем месте.
    }
  }

  @override
  void onWindowResized() => save();

  @override
  void onWindowMoved() => save();

  // Разворот, полный экран и сворачивание — состояние меняется разом и
  // окончательно, ждать паузы незачем.
  @override
  void onWindowMaximize() => save(now: true);

  @override
  void onWindowUnmaximize() => save(now: true);

  @override
  void onWindowEnterFullScreen() => save(now: true);

  @override
  void onWindowLeaveFullScreen() => save(now: true);

  /// Окно уходит из фокуса — часто последнее событие перед закрытием.
  @override
  void onWindowBlur() => save(now: true);
}
