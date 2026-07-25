import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Единый механизм «назад» для десктопа: **Esc**, **Alt+←** и **боковая кнопка
/// мыши «назад»** вызывают [onBack]. Оборачивать любой экран/панель, где по
/// смыслу есть возврат (пушевая страница → context.pop; закрытие панели →
/// сброс состояния). Клавиши всплывают от вложенных полей ввода, поэтому
/// срабатывают и во время набора текста.
///
/// Соглашение проекта: во всех новых элементах с возвратом использовать этот
/// виджет, а не заводить обработчики заново.
class BackDismissible extends StatelessWidget {
  final VoidCallback onBack;
  final Widget child;

  /// Забирать фокус при появлении (чтобы клавиши ловились сразу, без клика).
  /// Отключить на экранах, где важен автофокус конкретного поля.
  final bool autofocus;

  const BackDismissible({
    super.key,
    required this.onBack,
    required this.child,
    this.autofocus = true,
  });

  @override
  Widget build(BuildContext context) {
    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.escape): onBack,
        const SingleActivator(LogicalKeyboardKey.arrowLeft, alt: true): onBack,
      },
      child: Focus(
        autofocus: autofocus,
        child: Listener(
          onPointerDown: (e) {
            if (e.buttons & kBackMouseButton != 0) onBack();
          },
          child: child,
        ),
      ),
    );
  }
}
