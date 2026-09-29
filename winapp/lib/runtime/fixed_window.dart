import 'package:flutter/widgets.dart';
import 'package:window_manager/window_manager.dart';

/// Перетаскивание окна за его полосу — без разворота по двойному щелчку.
///
/// `DragToMoveArea` из window_manager на двойной щелчок разворачивает окно
/// всегда, не спрашивая, разрешён ли разворот вообще. Окнам входа, апдейтера и
/// установщика он не разрешён: их вёрстка рассчитана на точный размер, и на
/// весь экран они растягиваются уродливо. Поэтому таскать их надо этим
/// виджетом, а не тем.
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

/// Страж окна постоянного размера.
///
/// Запрета мало: `setMaximizable(false)` убирает кнопку и системный пункт
/// меню, но программный разворот всё равно проходит — его может позвать и
/// чужой код, и жест, и подсказка Windows «прицепить окно к краю». Страж
/// возвращает окно обратно, чем бы разворот ни был вызван.
class FixedWindowGuard with WindowListener {
  FixedWindowGuard._();
  static final instance = FixedWindowGuard._();

  bool _on = false;

  /// Окно с этого момента держится своего размера.
  void enable() {
    if (_on) return;
    _on = true;
    windowManager.addListener(this);
  }

  /// Окну снова можно менять размер — это переход в окно приложения.
  void disable() {
    if (!_on) return;
    _on = false;
    windowManager.removeListener(this);
  }

  @override
  void onWindowMaximize() {
    if (_on) windowManager.unmaximize();
  }

  @override
  void onWindowEnterFullScreen() {
    if (_on) windowManager.setFullScreen(false);
  }
}
