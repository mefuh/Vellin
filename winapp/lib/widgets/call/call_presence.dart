import 'package:flutter/widgets.dart';

import '../../theme/call_design.dart';

/// Показ слоя звонка с анимацией входа и — главное — выхода.
///
/// Обычное `if (звонок != null) Виджет()` уходу анимироваться не даёт: как
/// только звонок кончился, данных для отрисовки уже нет, и слой пропадает
/// рывком. Здесь последнее непустое [data] запоминается и держится до конца
/// обратной анимации, поэтому карточка вызова успевает уехать, а экран
/// разговора — погаснуть.
///
/// [builder] получает ход анимации 0→1 и решает сам, как его отработать:
/// прозрачностью, масштабом, сдвигом — у разных слоёв движение своё.
class CallPresence<T extends Object> extends StatefulWidget {
  /// Что показывать. `null` — начать уход.
  final T? data;

  /// Появление и уход разной длины: входит слой степенно, уходит быстрее —
  /// ожидание конца анимации на завершённом звонке читается как подвисание.
  final Duration inDuration;
  final Duration outDuration;

  final Widget Function(BuildContext context, T data, Animation<double> t) builder;

  const CallPresence({
    super.key,
    required this.data,
    required this.builder,
    this.inDuration = CallMotion.slow,
    this.outDuration = CallMotion.base,
  });

  @override
  State<CallPresence<T>> createState() => _CallPresenceState<T>();
}

class _CallPresenceState<T extends Object> extends State<CallPresence<T>>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: widget.inDuration,
    reverseDuration: widget.outDuration,
  );

  /// Последнее, что было показано: по нему рисуется уход.
  T? _shown;

  @override
  void initState() {
    super.initState();
    _shown = widget.data;
    if (widget.data != null) _c.forward();
    // Пока идёт уход, слой ещё в дереве — по его концу он должен исчезнуть.
    _c.addStatusListener((s) {
      if (s == AnimationStatus.dismissed && mounted && widget.data == null) {
        setState(() => _shown = null);
      }
    });
  }

  @override
  void didUpdateWidget(CallPresence<T> old) {
    super.didUpdateWidget(old);
    final next = widget.data;
    if (next != null) {
      // Данные обновляются и на ходу — например, «дозвон» сменился
      // «подключением» внутри одной карточки.
      if (next != _shown) setState(() => _shown = next);
      _c.forward();
    } else if (_shown != null) {
      _c.reverse();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final shown = _shown;
    if (shown == null) return const SizedBox.shrink();
    return widget.builder(context, shown, _c);
  }
}
