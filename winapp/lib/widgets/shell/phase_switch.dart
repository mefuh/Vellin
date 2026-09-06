import 'package:flutter/widgets.dart';

import '../../theme/vellin_design.dart';

/// Смена содержимого в две фазы: уходящее играет обратную анимацию и только
/// потом монтируется новое.
///
/// Кроссфейд `AnimatedSwitcher` тут не годится: два слоя видны одновременно, и
/// на плотных списках это читается как рябь, а не как смена раздела.
class PhaseSwitch extends StatefulWidget {
  /// Что считать сменой: раздел рейла, вкладка, идентификатор диалога.
  final Object phaseKey;

  final Widget child;

  /// Уход: гашение со сдвигом влево.
  final Duration out;

  /// Приход: выезд справа налево до нуля.
  final Duration inDuration;

  /// На сколько сдвигается уходящее и откуда приезжает новое.
  final double shift;

  const PhaseSwitch({
    super.key,
    required this.phaseKey,
    required this.child,
    this.out = VellinMotion.quick,
    this.inDuration = const Duration(milliseconds: 420),
    this.shift = 14,
  });

  @override
  State<PhaseSwitch> createState() => _PhaseSwitchState();
}

class _PhaseSwitchState extends State<PhaseSwitch> with TickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: widget.inDuration,
    reverseDuration: widget.out,
    value: 1,
  );

  late Object _shownKey = widget.phaseKey;
  late Widget _shown = widget.child;

  @override
  void didUpdateWidget(PhaseSwitch old) {
    super.didUpdateWidget(old);
    if (widget.phaseKey != _shownKey) {
      // Сначала уводим прежнее, и только по завершении подменяем содержимое.
      _c.reverse().whenComplete(() {
        if (!mounted) return;
        setState(() {
          _shownKey = widget.phaseKey;
          _shown = widget.child;
        });
        _c.forward();
      });
    } else {
      // Тот же раздел — просто обновляем содержимое, без анимации.
      _shown = widget.child;
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, child) {
        final t = VellinMotion.standard.transform(_c.value);
        return Opacity(
          opacity: t,
          child: Transform.translate(
            offset: Offset(-widget.shift * (1 - t), 0),
            child: child,
          ),
        );
      },
      child: _shown,
    );
  }
}
