import 'package:flutter/widgets.dart';
import 'package:window_manager/window_manager.dart';

/// Перетаскивание окна — без разворота по двойному щелчку.
///
/// `DragToMoveArea` из window_manager на двойной щелчок разворачивает окно
/// всегда, не спрашивая, разрешён ли разворот. Установщику он не разрешён:
/// вёрстка рассчитана на точный размер окна.
class WindowDragArea extends StatelessWidget {
  final Widget child;
  const WindowDragArea({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onPanStart: (_) => windowManager.startDragging(),
      child: child,
    );
  }
}

/// Страж окна постоянного размера: `setMaximizable(false)` убирает кнопку и
/// пункт системного меню, но программный разворот всё равно проходит. Страж
/// возвращает окно обратно, чем бы разворот ни был вызван.
class FixedWindowGuard with WindowListener {
  FixedWindowGuard._();
  static final instance = FixedWindowGuard._();

  void enable() => windowManager.addListener(this);

  @override
  void onWindowMaximize() => windowManager.unmaximize();

  @override
  void onWindowEnterFullScreen() => windowManager.setFullScreen(false);
}
