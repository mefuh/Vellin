import 'package:flutter/widgets.dart';

import '../../theme/vellin_design.dart';

/// Состояния указателя и клавиатуры для одного элемента.
class VellinInteractionState {
  final bool hovered;
  final bool pressed;
  final bool focused;
  const VellinInteractionState({this.hovered = false, this.pressed = false, this.focused = false});
}

/// Обёртка интерактивного элемента: наведение, нажатие и — отдельно от них —
/// фокус с клавиатуры.
///
/// Фокус рисуется своим кольцом, а не подсветкой наведения: это десктоп, и
/// проход табом обязан быть виден, даже когда мышь лежит на другом элементе.
class VellinInteractive extends StatefulWidget {
  final Widget Function(BuildContext context, VellinInteractionState state) builder;
  final VoidCallback? onTap;
  final VoidCallback? onSecondaryTap;
  final String? tooltip;
  final MouseCursor cursor;

  /// Радиус кольца фокуса. null — кольцо не рисуется (элемент сам его рисует).
  final BorderRadius? focusRadius;

  /// Участвует ли элемент в обходе табом.
  final bool focusable;

  const VellinInteractive({
    super.key,
    required this.builder,
    this.onTap,
    this.onSecondaryTap,
    this.tooltip,
    this.cursor = SystemMouseCursors.click,
    this.focusRadius,
    this.focusable = true,
  });

  @override
  State<VellinInteractive> createState() => _VellinInteractiveState();
}

class _VellinInteractiveState extends State<VellinInteractive> {
  bool _hovered = false;
  bool _pressed = false;
  bool _focused = false;

  bool get _enabled => widget.onTap != null || widget.onSecondaryTap != null;

  @override
  Widget build(BuildContext context) {
    final state = VellinInteractionState(
      hovered: _hovered && _enabled,
      pressed: _pressed && _enabled,
      focused: _focused,
    );

    Widget child = widget.builder(context, state);

    if (widget.focusRadius != null) {
      child = Stack(
        clipBehavior: Clip.none,
        children: [
          child,
          if (_focused)
            Positioned.fill(
              child: IgnorePointer(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: widget.focusRadius,
                    border: Border.all(color: VellinColors.focusRing, width: 1),
                    boxShadow: VellinShadow.focus,
                  ),
                ),
              ),
            ),
        ],
      );
    }

    return Focus(
      canRequestFocus: widget.focusable && _enabled,
      onFocusChange: (v) => setState(() => _focused = v),
      child: MouseRegion(
        cursor: _enabled ? widget.cursor : MouseCursor.defer,
        onEnter: (_) => setState(() => _hovered = true),
        onExit: (_) => setState(() {
          _hovered = false;
          _pressed = false;
        }),
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: widget.onTap,
          onSecondaryTap: widget.onSecondaryTap,
          onTapDown: (_) => setState(() => _pressed = true),
          onTapUp: (_) => setState(() => _pressed = false),
          onTapCancel: () => setState(() => _pressed = false),
          child: child,
        ),
      ),
    );
  }
}
