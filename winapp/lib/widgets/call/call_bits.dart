import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/material.dart';

import '../../app_config.dart';
import '../../theme/call_design.dart';
import 'call_glyphs.dart';

/// Живой тёплый фон окна разговора: очень медленно дрейфующее пятно света и
/// статичная виньетка поверх него. Дыхание фона — единственное, что движется в
/// кадре само по себе, поэтому цикл длинный: 34 секунды.
class CallBackdrop extends StatefulWidget {
  const CallBackdrop({super.key});

  @override
  State<CallBackdrop> createState() => _CallBackdropState();
}

class _CallBackdropState extends State<CallBackdrop> with SingleTickerProviderStateMixin {
  late final AnimationController _drift = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 34),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _drift.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Stack(fit: StackFit.expand, children: [
        Container(color: CallColors.bgWindow),
        AnimatedBuilder(
          animation: _drift,
          builder: (context, _) {
            final t = Curves.easeInOut.transform(_drift.value);
            final scale = 1.05 + 0.09 * t;
            // Сдвиг ±3 % от размера кадра — считаем через доли выравнивания.
            final shift = Alignment(-0.02 + 0.05 * t, -0.08 + 0.03 * t);
            return Transform.scale(
              scale: scale,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    center: shift,
                    radius: 0.62,
                    colors: const [Color(0x6B7A6044), Color(0x333C3024), Color(0x00000000)],
                    stops: const [0, 0.38, 0.72],
                  ),
                ),
              ),
            );
          },
        ),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              radius: 1.0,
              colors: [Color(0x00000000), Color(0x8C000000)],
              stops: [0.45, 1],
            ),
          ),
        ),
      ]),
    );
  }
}

/// Матовая подложка. Единственные три места, где она уместна: капсула
/// управления, панель настроек и модальные плашки — каждый размытый слой стоит
/// кадров.
class Glass extends StatelessWidget {
  final Widget child;
  final double blur;
  final Color color;
  final Color? border;
  final BorderRadius radius;
  final EdgeInsets padding;
  final List<BoxShadow> shadows;

  const Glass({
    super.key,
    required this.child,
    required this.radius,
    this.blur = 18,
    this.color = const Color(0x9E0A0908),
    this.border,
    this.padding = EdgeInsets.zero,
    this.shadows = const [],
  });

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(borderRadius: radius, boxShadow: shadows),
      child: ClipRRect(
        borderRadius: radius,
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: blur / 2, sigmaY: blur / 2),
          child: Container(
            padding: padding,
            decoration: BoxDecoration(
              color: color,
              borderRadius: radius,
              border: Border.all(color: border ?? CallColors.strokeSoft),
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}

/// Пилюля из матового стекла: состояние сети, плашки трансляции, подсказки.
class GlassPill extends StatelessWidget {
  final Widget child;
  final EdgeInsets padding;
  final Color? border;
  final Color color;
  final VoidCallback? onTap;

  const GlassPill({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
    this.border,
    this.color = const Color(0x9E0A0908),
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final pill = Glass(
      radius: BorderRadius.circular(999),
      color: color,
      border: border,
      padding: padding,
      child: child,
    );
    if (onTap == null) return pill;
    return _Lift(onTap: onTap!, child: pill);
  }
}

/// Подъём на 2–3 пикселя под курсором — движение, общее для всего, что
/// нажимается: пилюль, карточек и кнопок.
class _Lift extends StatefulWidget {
  final Widget child;
  final VoidCallback onTap;
  const _Lift({required this.child, required this.onTap});
  @override
  State<_Lift> createState() => _LiftState();
}

class _LiftState extends State<_Lift> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedSlide(
          offset: Offset(0, _hover ? -0.06 : 0),
          duration: CallMotion.base,
          curve: CallMotion.ease,
          child: widget.child,
        ),
      ),
    );
  }
}

/// Состояние круглой кнопки управления. Подписей у кнопок нет — состояние
/// читается только по ним самим, это осознанное решение макета.
enum CallButtonTone {
  /// Обычная: белая заливка 4.5 %.
  plain,

  /// Выключенные микрофон или камера: красноватая подложка и внутренняя обводка.
  off,

  /// Идёт демонстрация: золотая подложка.
  gold,

  /// Открыта панель: белая подложка поплотнее.
  active,
}

/// Круглая кнопка капсулы управления, 54×54.
class CallButton extends StatefulWidget {
  final CallGlyph glyph;
  final String tooltip;
  final VoidCallback? onTap;
  final CallButtonTone tone;

  /// Кольцо говорящего вокруг кнопки микрофона.
  final bool speaking;

  const CallButton({
    super.key,
    required this.glyph,
    required this.tooltip,
    required this.onTap,
    this.tone = CallButtonTone.plain,
    this.speaking = false,
  });

  @override
  State<CallButton> createState() => _CallButtonState();
}

class _CallButtonState extends State<CallButton> {
  bool _hover = false;
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onTap != null;
    final overlay = switch (widget.tone) {
      CallButtonTone.off => (
          fill: CallColors.dangerSoft.withValues(alpha: 0.10),
          ring: CallColors.dangerSoft.withValues(alpha: 0.45),
        ),
      CallButtonTone.gold => (
          fill: CallColors.gold.withValues(alpha: 0.12),
          ring: CallColors.gold.withValues(alpha: 0.50),
        ),
      CallButtonTone.active => (
          fill: Colors.white.withValues(alpha: 0.08),
          ring: Colors.white.withValues(alpha: 0.28),
        ),
      CallButtonTone.plain => (fill: Colors.transparent, ring: Colors.transparent),
    };

    return Tooltip(
      message: widget.tooltip,
      child: MouseRegion(
        cursor: enabled ? SystemMouseCursors.click : SystemMouseCursors.basic,
        onEnter: (_) => setState(() => _hover = true),
        onExit: (_) => setState(() => _hover = false),
        child: GestureDetector(
          onTap: widget.onTap,
          onTapDown: (_) => setState(() => _pressed = true),
          onTapUp: (_) => setState(() => _pressed = false),
          onTapCancel: () => setState(() => _pressed = false),
          child: AnimatedSlide(
            // Сдвиг задаётся долей своего размера: −3 из 54.
            offset: Offset(0, _hover && enabled ? -3 / 54 : 0),
            duration: CallMotion.base,
            curve: CallMotion.ease,
            child: AnimatedScale(
              scale: _pressed ? 0.96 : 1.0,
              duration: CallMotion.base,
              curve: CallMotion.ease,
              child: AnimatedContainer(
                duration: CallMotion.base,
                curve: CallMotion.ease,
                width: 54,
                height: 54,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: _hover && enabled ? CallColors.surfaceHover : CallColors.surface,
                  border: Border.all(color: CallColors.stroke),
                ),
                child: Stack(alignment: Alignment.center, clipBehavior: Clip.none, children: [
                  // Кольцо говорящего — позади кнопки, а не поверх неё: иначе
                  // свечение ложится пеленой на саму иконку.
                  if (widget.speaking) const _SpeakingHalo(radius: 33),
                  // Подложка состояния поверх обычной заливки — тогда переход
                  // «включено → выключено» проявляется, а не перекрашивается
                  // рывком.
                  AnimatedContainer(
                    duration: CallMotion.base,
                    curve: CallMotion.ease,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: overlay.fill,
                      border: Border.all(color: overlay.ring),
                    ),
                  ),
                  AnimatedSwitcher(
                    duration: CallMotion.base,
                    switchInCurve: CallMotion.ease,
                    child: CallIcon(
                      widget.glyph,
                      key: ValueKey(widget.glyph),
                      size: 19,
                      color: enabled ? Colors.white : Colors.white.withValues(alpha: 0.35),
                    ),
                  ),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Сброс звонка: 74×54, единственный цветной элемент интерфейса.
class EndCallButton extends StatefulWidget {
  final VoidCallback onTap;
  final double width;
  final double height;
  const EndCallButton({super.key, required this.onTap, this.width = 74, this.height = 54});

  @override
  State<EndCallButton> createState() => _EndCallButtonState();
}

class _EndCallButtonState extends State<EndCallButton> {
  bool _hover = false;
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: 'Завершить звонок',
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        onEnter: (_) => setState(() => _hover = true),
        onExit: (_) => setState(() => _hover = false),
        child: GestureDetector(
          onTap: widget.onTap,
          onTapDown: (_) => setState(() => _pressed = true),
          onTapUp: (_) => setState(() => _pressed = false),
          onTapCancel: () => setState(() => _pressed = false),
          child: AnimatedSlide(
            offset: Offset(0, _hover ? -3 / widget.height : 0),
            duration: CallMotion.base,
            curve: CallMotion.ease,
            child: AnimatedScale(
              scale: _pressed ? 0.97 : 1.0,
              duration: CallMotion.base,
              curve: CallMotion.ease,
              child: AnimatedContainer(
                duration: CallMotion.base,
                curve: CallMotion.ease,
                width: widget.width,
                height: widget.height,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: _hover ? const Color(0xFFCE4A42) : CallColors.danger,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: const Color(0x38FF8C84)),
                  boxShadow: [
                    BoxShadow(
                      color: CallColors.danger.withValues(alpha: _hover ? 0.85 : 0.7),
                      blurRadius: _hover ? 54 : 44,
                      offset: Offset(0, _hover ? 22 : 18),
                      spreadRadius: -14,
                    ),
                  ],
                ),
                child: CallIcon(CallGlyphs.hangup, size: widget.height * 0.39),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Переключатель настройки: 44×25, костяшка 18.
class CallSwitch extends StatelessWidget {
  final bool value;
  final ValueChanged<bool> onChanged;
  const CallSwitch({super.key, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: () => onChanged(!value),
        child: AnimatedContainer(
          duration: CallMotion.base,
          curve: CallMotion.ease,
          width: 44,
          height: 25,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            color: value ? Colors.white.withValues(alpha: 0.88) : Colors.white.withValues(alpha: 0.05),
            border: Border.all(
              color: value ? Colors.white.withValues(alpha: 0.22) : Colors.white.withValues(alpha: 0.10),
            ),
          ),
          child: Stack(children: [
            AnimatedPositioned(
              duration: CallMotion.base,
              curve: CallMotion.ease,
              top: 2.5,
              left: value ? 21.5 : 2.5,
              child: Container(
                width: 18,
                height: 18,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: value ? const Color(0xFF12100F) : Colors.white.withValues(alpha: 0.55),
                ),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

/// Выбор одного значения из ряда: разрешение, частота кадров.
class CallSegmented<T> extends StatelessWidget {
  final T value;
  final List<({T value, String label})> items;
  final ValueChanged<T> onChanged;
  const CallSegmented({
    super.key,
    required this.value,
    required this.items,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.035),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withValues(alpha: 0.055)),
      ),
      child: Row(children: [
        for (final item in items)
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(right: 3),
              child: _Segment(
                label: item.label,
                active: item.value == value,
                onTap: () => onChanged(item.value),
              ),
            ),
          ),
      ]),
    );
  }
}

class _Segment extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _Segment({required this.label, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: CallMotion.fast,
          curve: CallMotion.ease,
          padding: const EdgeInsets.symmetric(vertical: 9),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: active ? Colors.white : Colors.transparent,
            borderRadius: BorderRadius.circular(9),
            boxShadow: active
                ? [
                    BoxShadow(
                      color: Colors.white.withValues(alpha: 0.5),
                      blurRadius: 18,
                      offset: const Offset(0, 6),
                      spreadRadius: -8,
                    ),
                  ]
                : const [],
          ),
          child: Text(
            label,
            style: TextStyle(
              fontFamily: CallText.family,
              fontSize: 12.5,
              letterSpacing: 0.25,
              fontWeight: active ? FontWeight.w600 : FontWeight.w400,
              color: active ? const Color(0xFF14120F) : CallColors.textMuted,
            ),
          ),
        ),
      ),
    );
  }
}

/// Дышащая точка состояния. Период задаёт смысл: 3.4 с — сеть в норме, 1.5 с —
/// слабая, 1 с — потеря связи.
class PulseDot extends StatefulWidget {
  final Color color;
  final Duration period;
  final double size;
  const PulseDot({
    super.key,
    required this.color,
    this.period = const Duration(milliseconds: 3400),
    this.size = 5,
  });

  @override
  State<PulseDot> createState() => _PulseDotState();
}

class _PulseDotState extends State<PulseDot> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: widget.period)
    ..repeat(reverse: true);

  @override
  void didUpdateWidget(PulseDot old) {
    super.didUpdateWidget(old);
    if (old.period != widget.period) {
      _c.duration = widget.period;
      _c.repeat(reverse: true);
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
      builder: (context, _) {
        final opacity = 0.35 + 0.65 * Curves.easeInOut.transform(_c.value);
        return Container(
          width: widget.size,
          height: widget.size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: widget.color.withValues(alpha: opacity),
            boxShadow: [
              BoxShadow(
                color: widget.color.withValues(alpha: 0.8 * opacity),
                blurRadius: 10,
              ),
            ],
          ),
        );
      },
    );
  }
}

/// Кольцо говорящего: пульсирующая обводка и две расходящиеся волны.
///
/// Занимает зарезервированное место (inset −12 внутри своего бокса) — при
/// включении и выключении звука аватар не смещается.
class _SpeakingHalo extends StatefulWidget {
  /// Радиус кольца: половина стороны бокса плюс вылет 12.
  final double radius;
  const _SpeakingHalo({required this.radius});

  @override
  State<_SpeakingHalo> createState() => _SpeakingHaloState();
}

class _SpeakingHaloState extends State<_SpeakingHalo> with TickerProviderStateMixin {
  late final AnimationController _glow = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1900),
  )..repeat(reverse: true);

  late final AnimationController _ripple = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2100),
  )..repeat();

  @override
  void dispose() {
    _glow.dispose();
    _ripple.dispose();
    super.dispose();
  }

  Widget _wave(double delay) {
    return AnimatedBuilder(
      animation: _ripple,
      builder: (context, _) {
        final t = (_ripple.value + delay) % 1.0;
        // Волна расходится за 70 % цикла, остаток — пауза.
        final p = (t / 0.7).clamp(0.0, 1.0);
        final eased = CallMotion.ease.transform(p);
        return Opacity(
          opacity: (0.6 * (1 - p)).clamp(0.0, 1.0),
          child: Transform.scale(
            scale: 1 + 0.26 * eased,
            child: Container(
              width: widget.radius * 2,
              height: widget.radius * 2,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0xFFE8CF9E).withValues(alpha: 0.55), width: 1.5),
              ),
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: SizedBox(
        width: widget.radius * 2,
        height: widget.radius * 2,
        child: Stack(alignment: Alignment.center, children: [
          _wave(0),
          _wave(1 / 3),
          AnimatedBuilder(
            animation: _glow,
            builder: (context, _) {
              final opacity = 0.6 + 0.4 * Curves.easeInOut.transform(_glow.value);
              return Opacity(
                opacity: opacity,
                child: Container(
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: const Color(0xFFE8CF9E).withValues(alpha: 0.9), width: 2),
                    boxShadow: [
                      BoxShadow(
                        color: CallColors.goldGlow.withValues(alpha: 0.55),
                        blurRadius: 44,
                      ),
                    ],
                    // Внутреннее свечение: тени внутрь Flutter не умеет, и оно
                    // рисуется градиентом от края к центру.
                    gradient: RadialGradient(
                      colors: [
                        Colors.transparent,
                        CallColors.goldGlow.withValues(alpha: 0.28),
                      ],
                      stops: const [0.62, 1],
                    ),
                  ),
                ),
              );
            },
          ),
        ]),
      ),
    );
  }
}

/// Аватар участника с кольцом говорящего.
class CallAvatar extends StatelessWidget {
  final String username;
  final String? avatarUrl;
  final double size;
  final bool speaking;

  /// Своё лицо приглушено: макет отличает собеседника от себя плотностью.
  final bool dim;

  const CallAvatar({
    super.key,
    required this.username,
    required this.avatarUrl,
    required this.size,
    this.speaking = false,
    this.dim = false,
  });

  @override
  Widget build(BuildContext context) {
    final url = AppConfig.mediaUrl(avatarUrl);
    final initial = username.isNotEmpty ? username[0].toUpperCase() : '?';

    return SizedBox(
      // Место под кольцо зарезервировано, чтобы аватар не прыгал.
      width: size + 24,
      height: size + 24,
      child: Stack(alignment: Alignment.center, children: [
        // Кольцо говорящего рисуется ПОД аватаром: поверх оно затягивало лицо
        // золотой пеленой от внутреннего свечения.
        if (speaking) _SpeakingHalo(radius: size / 2 + 12),
        Container(
          width: size,
          height: size,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: dim
                  ? [Colors.white.withValues(alpha: 0.08), Colors.white.withValues(alpha: 0.015)]
                  : [Colors.white.withValues(alpha: 0.11), Colors.white.withValues(alpha: 0.02)],
            ),
            border: Border.all(color: Colors.white.withValues(alpha: dim ? 0.07 : 0.09)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.9),
                blurRadius: 70,
                offset: const Offset(0, 30),
                spreadRadius: -30,
              ),
            ],
          ),
          foregroundDecoration: url == null
              ? null
              : BoxDecoration(
                  shape: BoxShape.circle,
                  image: DecorationImage(image: NetworkImage(url), fit: BoxFit.cover),
                ),
          child: url == null ? _initial(initial) : null,
        ),
      ]),
    );
  }

  /// Инициал: 44 при аватаре 148, начертание светлое, разрядка 0.04em.
  Widget _initial(String initial) => Center(
        child: Text(
          initial,
          style: TextStyle(
            fontFamily: CallText.family,
            fontSize: size * 0.297,
            fontWeight: FontWeight.w300,
            letterSpacing: size * 0.297 * 0.04,
            color: Colors.white.withValues(alpha: dim ? 0.72 : 0.82),
          ),
        ),
      );
}

/// Кадр говорящего: свечение вокруг плитки и тонкая обводка по её краю.
///
/// Свечение лежит ПОД кадром и видно только тем, что выходит за его границы.
/// Поверх остаётся одна обводка: тень, положенная сверху, размывалась внутрь и
/// затягивала картинку жёлтой пеленой.
class SpeakingRect extends StatefulWidget {
  final Widget child;
  final double radius;
  final bool active;
  const SpeakingRect({
    super.key,
    required this.child,
    required this.radius,
    required this.active,
  });

  @override
  State<SpeakingRect> createState() => _SpeakingRectState();
}

class _SpeakingRectState extends State<SpeakingRect> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1900),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.active) return widget.child;
    return AnimatedBuilder(
      animation: _c,
      builder: (context, child) {
        final opacity = 0.6 + 0.4 * Curves.easeInOut.transform(_c.value);
        return Stack(children: [
          Positioned.fill(
            child: IgnorePointer(
              child: Opacity(
                opacity: opacity,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(widget.radius),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFFCEA668).withValues(alpha: 0.45),
                        blurRadius: 44,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          child!,
          Positioned.fill(
            child: IgnorePointer(
              child: Opacity(
                opacity: opacity,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(widget.radius),
                    border: Border.all(
                      color: const Color(0xFFE8CF9E).withValues(alpha: 0.9),
                      width: 2.5,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ]);
      },
      child: widget.child,
    );
  }
}

/// Полоса-скелет с бегущим бликом — кадр на время подключения.
class SkeletonShimmer extends StatefulWidget {
  final double width;
  final double height;
  final BorderRadius radius;
  const SkeletonShimmer({
    super.key,
    required this.width,
    required this.height,
    required this.radius,
  });

  @override
  State<SkeletonShimmer> createState() => _SkeletonShimmerState();
}

class _SkeletonShimmerState extends State<SkeletonShimmer> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2400),
  )..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, _) {
        return Container(
          width: widget.width,
          height: widget.height,
          decoration: BoxDecoration(
            borderRadius: widget.radius,
            gradient: LinearGradient(
              begin: Alignment(-1 + 3 * _c.value, 0),
              end: Alignment(1 + 3 * _c.value, 0),
              colors: [
                Colors.white.withValues(alpha: 0.035),
                Colors.white.withValues(alpha: 0.085),
                Colors.white.withValues(alpha: 0.035),
              ],
              stops: const [0.08, 0.2, 0.33],
            ),
          ),
        );
      },
    );
  }
}

/// Шкала уровня микрофона из 16 полосок.
class MicLevelBars extends StatelessWidget {
  /// Уровень 0..1. Пока проверка не идёт — полоски лежат.
  final double level;
  final bool active;
  const MicLevelBars({super.key, required this.level, required this.active});

  @override
  Widget build(BuildContext context) {
    const count = 16;
    return SizedBox(
      height: 34,
      child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
        for (var i = 0; i < count; i++) ...[
          Expanded(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 90),
              curve: CallMotion.ease,
              height: _height(i, count),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(2),
                color: const Color(0xFFE8D5B2).withValues(alpha: 0.75 - i * 0.022),
              ),
            ),
          ),
          if (i != count - 1) const SizedBox(width: 3),
        ],
      ]),
    );
  }

  /// Полоски убывают слева направо: первая показывает уровень целиком,
  /// последняя — только его вершину. Так шкала читается как громкость, а не
  /// как набор равных столбиков.
  double _height(int i, int count) {
    if (!active) return 2;
    final falloff = 1 - i / (count * 1.35);
    final value = (level * falloff).clamp(0.0, 1.0);
    return math.max(2, 34 * value);
  }
}

/// Заголовок секции панели — прописными, с разрядкой.
class CallSectionLabel extends StatelessWidget {
  final String text;
  const CallSectionLabel(this.text, {super.key});

  @override
  Widget build(BuildContext context) => Text(text.toUpperCase(), style: CallText.section);
}

/// Тонкая линия между секциями.
class CallDivider extends StatelessWidget {
  const CallDivider({super.key});

  @override
  Widget build(BuildContext context) =>
      Container(height: 1, color: Colors.white.withValues(alpha: 0.055));
}
