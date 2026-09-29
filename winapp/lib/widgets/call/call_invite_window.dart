import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/material.dart';

import '../../state/call_controller.dart';
import '../../theme/call_design.dart';
import 'call_bits.dart';
import 'call_glyphs.dart';

/// Что показывает окно вызова. Отдельный неизменяемый снимок, а не ссылка на
/// контроллер: окно доживает свою анимацию ухода уже после того, как звонка
/// не стало, и рисовать ему в этот момент нечего, кроме запомненного.
@immutable
class CallInviteData {
  /// Один из трёх этапов до разговора.
  final CallPhase phase;
  final String username;
  final String? avatarUrl;
  final bool video;

  const CallInviteData({
    required this.phase,
    required this.username,
    required this.avatarUrl,
    required this.video,
  });

  @override
  bool operator ==(Object other) =>
      other is CallInviteData &&
      other.phase == phase &&
      other.username == username &&
      other.avatarUrl == avatarUrl &&
      other.video == video;

  @override
  int get hashCode => Object.hash(phase, username, avatarUrl, video);
}

/// Окно вызова: входящий, дозвон и подключение — одной карточкой посреди
/// приложения.
///
/// Раньше это был экран во весь кадр, и короткое событие выглядело как смена
/// раздела. Карточка над затемнённым приложением честнее: разговор ещё не
/// начался, из приложения никто не уходил.
class CallInviteWindow extends StatelessWidget {
  final CallInviteData data;

  /// Ход появления и ухода: 0 — окна нет, 1 — окно на месте.
  final Animation<double> t;

  /// Уходим не потому, что звонок кончился, а потому, что он начался: карточка
  /// тогда раскрывается вверх и растворяется навстречу экрану разговора, а не
  /// оседает вниз, как при отбое.
  final bool expanding;

  /// Отклонить входящий или отменить свой вызов.
  final VoidCallback onDecline;

  /// Ответить. У исходящего отвечать нечего — тогда `null`.
  final void Function({required bool video})? onAccept;

  const CallInviteWindow({
    super.key,
    required this.data,
    required this.t,
    required this.expanding,
    required this.onDecline,
    this.onAccept,
  });

  @override
  Widget build(BuildContext context) {
    return Positioned.fill(
      child: AnimatedBuilder(
        animation: t,
        builder: (context, child) {
          final raw = t.value.clamp(0.0, 1.0);
          // Уход идёт другой кривой: вход выплывает мягко, уход собирается и
          // уходит решительно — иначе отбой кажется нерешённым.
          final v = t.status == AnimationStatus.reverse
              ? Curves.easeInCubic.transform(raw)
              : CallMotion.ease.transform(raw);
          // Уезд при раскрытии — вверх и с увеличением, при отбое — вниз и с
          // уменьшением. Появление в обоих случаях одно.
          final rising = expanding && t.status != AnimationStatus.forward;
          final dy = rising ? -26 * (1 - v) : 26 * (1 - v);
          final scale = rising ? 1 + 0.06 * (1 - v) : 0.94 + 0.06 * v;

          return Stack(children: [
            // Затемнение с размытием: приложение видно, но отодвинуто. Клики
            // до него не доходят — на звонок надо ответить или отказаться.
            Positioned.fill(
              child: IgnorePointer(
                ignoring: v < 0.01,
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 16 * v, sigmaY: 16 * v),
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () {},
                    child: Container(color: const Color(0xFF050505).withValues(alpha: 0.62 * v)),
                  ),
                ),
              ),
            ),
            Center(
              child: Opacity(
                opacity: v.clamp(0.0, 1.0),
                child: Transform.translate(
                  offset: Offset(0, dy),
                  child: Transform.scale(scale: scale, child: child),
                ),
              ),
            ),
          ]);
        },
        child: _InviteCard(data: data, onDecline: onDecline, onAccept: onAccept),
      ),
    );
  }
}

/// Ширина карточки вызова.
const double _cardWidth = 520;

class _InviteCard extends StatelessWidget {
  final CallInviteData data;
  final VoidCallback onDecline;
  final void Function({required bool video})? onAccept;

  const _InviteCard({required this.data, required this.onDecline, this.onAccept});

  @override
  Widget build(BuildContext context) {
    final incoming = data.phase == CallPhase.incoming;
    final connecting = data.phase == CallPhase.connecting;

    // Ширину задаём явно. Одного `maxWidth` мало: карточка стоит по центру, в
    // свободных ограничениях, и сжималась бы по содержимому — то есть по
    // ширине аватара, — сколько ей ни разреши.
    return LayoutBuilder(
      builder: (context, box) {
        // В узком окне карточка ужимается, но к краям не прилипает.
        final width = math.min(_cardWidth, box.maxWidth - 48);
        return SizedBox(
          width: width,
          child: Glass(
            blur: 30,
            radius: BorderRadius.circular(26),
            color: const Color(0xF00E0D0C),
            border: Colors.white.withValues(alpha: 0.085),
            shadows: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.85),
                blurRadius: 110,
                offset: const Offset(0, 44),
                spreadRadius: -34,
              ),
              // Тёплый ореол под карточкой — от неё же и идёт единственный свет
              // в затемнённом окне.
              BoxShadow(
                color: CallColors.goldGlow.withValues(alpha: connecting ? 0.10 : 0.14),
                blurRadius: 90,
                offset: const Offset(0, 24),
                spreadRadius: -46,
              ),
            ],
            padding: const EdgeInsets.fromLTRB(38, 32, 38, 30),
            // Этапы сменяют друг друга внутри одной карточки, и её высота идёт
            // за ними плавно — иначе на ответе карточка дёргается.
            child: AnimatedSize(
              duration: CallMotion.base,
              curve: CallMotion.ease,
              alignment: Alignment.topCenter,
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                _PhaseLabel(phase: data.phase, video: data.video),
                const SizedBox(height: 22),
                _InviteAvatar(
                  username: data.username,
                  avatarUrl: data.avatarUrl,
                  phase: data.phase,
                ),
                const SizedBox(height: 18),
                Text(
                  data.username,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: CallText.displayName.copyWith(fontSize: 26),
                ),
                const SizedBox(height: 8),
                _StatusLine(phase: data.phase, video: data.video),
                const SizedBox(height: 28),
                _Actions(
                  incoming: incoming,
                  video: data.video,
                  onDecline: onDecline,
                  onAccept: onAccept,
                ),
              ]),
            ),
          ),
        );
      },
    );
  }
}

/// Метка этапа над аватаром — прописными, с точкой состояния.
class _PhaseLabel extends StatelessWidget {
  final CallPhase phase;
  final bool video;
  const _PhaseLabel({required this.phase, required this.video});

  @override
  Widget build(BuildContext context) {
    final (text, color, period) = switch (phase) {
      CallPhase.incoming => (
          video ? 'ВХОДЯЩИЙ ВИДЕОЗВОНОК' : 'ВХОДЯЩИЙ ЗВОНОК',
          CallColors.gold,
          const Duration(milliseconds: 900),
        ),
      CallPhase.outgoing => (
          video ? 'ИСХОДЯЩИЙ ВИДЕОЗВОНОК' : 'ИСХОДЯЩИЙ ЗВОНОК',
          CallColors.gold,
          const Duration(milliseconds: 1400),
        ),
      _ => ('СОЕДИНЕНИЕ', Colors.white.withValues(alpha: 0.6), const Duration(milliseconds: 700)),
    };

    return Row(mainAxisSize: MainAxisSize.min, children: [
      PulseDot(color: color, period: period, size: 5),
      const SizedBox(width: 9),
      // Смена подписи — перелистыванием, а не подменой на месте.
      AnimatedSwitcher(
        duration: CallMotion.base,
        switchInCurve: CallMotion.ease,
        transitionBuilder: (child, anim) => FadeTransition(
          opacity: anim,
          child: SizeTransition(axis: Axis.horizontal, sizeFactor: anim, child: child),
        ),
        child: Text(text, key: ValueKey(text), style: CallText.section.copyWith(fontSize: 10)),
      ),
    ]);
  }
}

/// Строка под именем: что сейчас происходит.
class _StatusLine extends StatelessWidget {
  final CallPhase phase;
  final bool video;
  const _StatusLine({required this.phase, required this.video});

  @override
  Widget build(BuildContext context) {
    final text = switch (phase) {
      CallPhase.incoming => video ? 'Хочет поговорить с камерой' : 'Вызывает вас',
      CallPhase.outgoing => 'Ждём ответа',
      _ => 'Устанавливаем связь',
    };

    return AnimatedSwitcher(
      duration: CallMotion.base,
      switchInCurve: CallMotion.ease,
      transitionBuilder: (child, anim) => FadeTransition(
        opacity: anim,
        child: SlideTransition(
          position: Tween(begin: const Offset(0, 0.35), end: Offset.zero).animate(anim),
          child: child,
        ),
      ),
      child: Row(
        key: ValueKey(text),
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(text, style: CallText.pill.copyWith(color: CallColors.textFaint)),
          // Троеточие живёт само: без него ожидание выглядит замершим.
          const _Ellipsis(),
        ],
      ),
    );
  }
}

/// Три точки, вспыхивающие по очереди.
class _Ellipsis extends StatefulWidget {
  const _Ellipsis();
  @override
  State<_Ellipsis> createState() => _EllipsisState();
}

class _EllipsisState extends State<_Ellipsis> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1500))..repeat();

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
        return Row(mainAxisSize: MainAxisSize.min, children: [
          for (var i = 0; i < 3; i++)
            Opacity(
              opacity: 0.25 + 0.75 * _wave((_c.value + 1 - i * 0.18) % 1.0),
              child: Text('.', style: CallText.pill.copyWith(color: CallColors.textFaint)),
            ),
        ]);
      },
    );
  }

  /// Вспышка на первой трети цикла, дальше покой.
  double _wave(double t) {
    if (t > 0.45) return 0;
    return math.sin(t / 0.45 * math.pi);
  }
}

/// Аватар вызова: кольца на дозвоне, вращающаяся дуга на подключении.
class _InviteAvatar extends StatefulWidget {
  final String username;
  final String? avatarUrl;
  final CallPhase phase;

  const _InviteAvatar({required this.username, required this.avatarUrl, required this.phase});

  @override
  State<_InviteAvatar> createState() => _InviteAvatarState();
}

class _InviteAvatarState extends State<_InviteAvatar> with TickerProviderStateMixin {
  /// Расходящиеся кольца — только пока звонят.
  late final AnimationController _rings = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2600),
  )..repeat();

  /// Дуга подключения.
  late final AnimationController _spin = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1500),
  )..repeat();

  /// Дыхание аватара на входящем: карточка не должна выглядеть снимком.
  late final AnimationController _breath = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2200),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _rings.dispose();
    _spin.dispose();
    _breath.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const size = 118.0;
    final ringing = widget.phase != CallPhase.connecting;

    return SizedBox(
      width: size + 44,
      height: size + 44,
      child: Stack(alignment: Alignment.center, children: [
        // Кольца и дуга занимают одно место и сменяют друг друга: на ответе
        // ожидание переходит в работу, а карточка не перестраивается.
        AnimatedSwitcher(
          duration: CallMotion.base,
          switchInCurve: CallMotion.ease,
          child: ringing
              ? _Rings(key: const ValueKey('rings'), t: _rings, size: size)
              : _ConnectingArc(key: const ValueKey('arc'), t: _spin, size: size + 20),
        ),
        AnimatedBuilder(
          animation: _breath,
          builder: (context, child) {
            final b = Curves.easeInOut.transform(_breath.value);
            return Transform.scale(scale: ringing ? 1 + 0.018 * b : 1, child: child);
          },
          child: CallAvatar(
            username: widget.username,
            avatarUrl: widget.avatarUrl,
            size: size,
          ),
        ),
      ]),
    );
  }
}

/// Две волны, расходящиеся от аватара.
class _Rings extends StatelessWidget {
  final AnimationController t;
  final double size;
  const _Rings({super.key, required this.t, required this.size});

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: t,
        builder: (context, _) {
          return Stack(alignment: Alignment.center, children: [
            for (final delay in const [0.0, 0.5]) _ring((t.value + delay) % 1.0),
          ]);
        },
      ),
    );
  }

  Widget _ring(double p) {
    // Волна расходится за три четверти цикла, остаток — пауза.
    final run = (p / 0.75).clamp(0.0, 1.0);
    final eased = CallMotion.ease.transform(run);
    return Opacity(
      opacity: (0.5 * (1 - run)).clamp(0.0, 1.0),
      child: Container(
        width: size + 34 * eased,
        height: size + 34 * eased,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: CallColors.gold.withValues(alpha: 0.5), width: 1.4),
        ),
      ),
    );
  }
}

/// Дуга, бегущая по кругу: связь поднимается.
class _ConnectingArc extends StatelessWidget {
  final AnimationController t;
  final double size;
  const _ConnectingArc({super.key, required this.t, required this.size});

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: t,
        builder: (context, _) => CustomPaint(
          size: Size.square(size),
          painter: _ArcPainter(turn: t.value),
        ),
      ),
    );
  }
}

class _ArcPainter extends CustomPainter {
  final double turn;
  _ArcPainter({required this.turn});

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final base = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.6
      ..color = Colors.white.withValues(alpha: 0.07);
    canvas.drawCircle(rect.center, size.width / 2, base);

    final arc = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round
      ..shader = SweepGradient(
        startAngle: 0,
        endAngle: math.pi * 2,
        colors: [
          CallColors.gold.withValues(alpha: 0),
          CallColors.gold.withValues(alpha: 0.9),
        ],
        transform: GradientRotation(turn * math.pi * 2),
      ).createShader(rect);

    canvas.drawArc(
      rect.deflate(1),
      turn * math.pi * 2,
      math.pi * 0.6,
      false,
      arc,
    );
  }

  @override
  bool shouldRepaint(_ArcPainter old) => old.turn != turn;
}

/// Кнопки вызова крупнее, чем в разговоре: в карточке они — главное, и
/// промахиваться по ним на входящем звонке человек не должен.
const double _buttonWidth = 98;
const double _buttonHeight = 56;

/// Кнопки этапа. Набор меняется на ответе — с перелистыванием, чтобы было
/// видно, что произошло.
class _Actions extends StatelessWidget {
  final bool incoming;
  final bool video;
  final VoidCallback onDecline;
  final void Function({required bool video})? onAccept;

  const _Actions({
    required this.incoming,
    required this.video,
    required this.onDecline,
    this.onAccept,
  });

  @override
  Widget build(BuildContext context) {
    final accept = onAccept;

    return AnimatedSwitcher(
      duration: CallMotion.base,
      switchInCurve: CallMotion.ease,
      transitionBuilder: (child, anim) => FadeTransition(
        opacity: anim,
        child: ScaleTransition(scale: Tween(begin: 0.92, end: 1.0).animate(anim), child: child),
      ),
      child: Wrap(
        key: ValueKey(incoming && accept != null),
        alignment: WrapAlignment.center,
        spacing: 26,
        runSpacing: 16,
        children: [
          _Action(
            label: incoming ? 'Отклонить' : 'Отменить',
            child: EndCallButton(
              onTap: onDecline,
              width: _buttonWidth,
              height: _buttonHeight,
              tooltip: incoming ? 'Отклонить звонок' : 'Отменить вызов',
            ),
          ),
          if (incoming && accept != null) ...[
            if (video)
              _Action(
                label: 'С камерой',
                child: _AnswerButton(
                  glyph: CallGlyphs.camera,
                  tooltip: 'Ответить с камерой',
                  filled: false,
                  onTap: () => accept(video: true),
                ),
              ),
            _Action(
              label: 'Ответить',
              child: _AnswerButton(
                glyph: CallGlyphs.answer,
                tooltip: 'Ответить',
                onTap: () => accept(video: false),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Кнопка с подписью под ней.
class _Action extends StatelessWidget {
  final String label;
  final Widget child;
  const _Action({required this.label, required this.child});

  @override
  Widget build(BuildContext context) {
    return Column(mainAxisSize: MainAxisSize.min, children: [
      child,
      const SizedBox(height: 9),
      Text(label, style: CallText.section.copyWith(fontSize: 9.5)),
    ]);
  }
}

/// Ответ на звонок. Белая — действие по умолчанию; обводкой — ответ с камерой.
class _AnswerButton extends StatefulWidget {
  final CallGlyph glyph;
  final String tooltip;
  final VoidCallback onTap;
  final bool filled;

  const _AnswerButton({
    required this.glyph,
    required this.tooltip,
    required this.onTap,
    this.filled = true,
  });

  @override
  State<_AnswerButton> createState() => _AnswerButtonState();
}

class _AnswerButtonState extends State<_AnswerButton> {
  bool _hover = false;
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final filled = widget.filled;

    return Tooltip(
      message: widget.tooltip,
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
            offset: Offset(0, _hover ? -3 / _buttonHeight : 0),
            duration: CallMotion.base,
            curve: CallMotion.ease,
            child: AnimatedScale(
              scale: _pressed ? 0.96 : 1,
              duration: CallMotion.base,
              curve: CallMotion.ease,
              child: AnimatedContainer(
                duration: CallMotion.base,
                curve: CallMotion.ease,
                width: _buttonWidth,
                height: _buttonHeight,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: filled
                      ? (_hover ? Colors.white : const Color(0xFFF2EFEA))
                      : Colors.white.withValues(alpha: _hover ? 0.12 : 0.05),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: filled
                        ? Colors.white.withValues(alpha: 0.35)
                        : Colors.white.withValues(alpha: 0.14),
                  ),
                  boxShadow: filled
                      ? [
                          BoxShadow(
                            color: Colors.white.withValues(alpha: _hover ? 0.4 : 0.26),
                            blurRadius: 46,
                            offset: const Offset(0, 18),
                            spreadRadius: -16,
                          ),
                        ]
                      : const [],
                ),
                child: CallIcon(
                  widget.glyph,
                  size: 20,
                  color: filled ? const Color(0xFF141210) : Colors.white,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
