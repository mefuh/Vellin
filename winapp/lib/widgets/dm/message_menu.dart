import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../../theme/vellin_design.dart';
import '../../theme/vellin_glyphs.dart';
import '../ui/vellin_icon.dart';

/// Пункт контекстного меню сообщения.
class MessageMenuItem {
  final List<String> glyph;
  final String label;
  final VoidCallback onSelect;

  /// Удаление: подпись и глиф сигнальным красным.
  final bool danger;

  const MessageMenuItem({
    required this.glyph,
    required this.label,
    required this.onSelect,
    this.danger = false,
  });
}

/// Строка подвала меню: когда прочитано, прослушано, изменено.
class MessageMenuFact {
  final List<String> glyph;
  final Size glyphBox;
  final String text;

  const MessageMenuFact({required this.glyph, required this.text, this.glyphBox = const Size(18, 18)});
}

/// «сегодня в 11:44», «вчера в 09:05», «3 сентября в 18:20», с годом — если не этот.
String formatMoment(String iso) {
  final t = DateTime.tryParse(iso)?.toLocal();
  if (t == null) return '';
  final hm = '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
  final now = DateTime.now();
  final days = DateTime(now.year, now.month, now.day).difference(DateTime(t.year, t.month, t.day)).inDays;
  if (days == 0) return 'сегодня в $hm';
  if (days == 1) return 'вчера в $hm';
  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ];
  final date = '${t.day} ${months[t.month - 1]}';
  return t.year == now.year ? '$date в $hm' : '$date ${t.year} в $hm';
}

/// Показать меню у курсора. Живёт в корневом Overlay — поверх ленты, шапки и
/// поля ввода. Возвращается, когда меню доиграло уход.
Future<void> showMessageMenu(
  BuildContext context, {
  required Offset position,
  required List<MessageMenuItem> items,
  List<MessageMenuFact> facts = const [],
}) {
  final overlay = Overlay.of(context, rootOverlay: true);
  late final OverlayEntry entry;
  var removed = false;
  final done = Completer<void>();
  entry = OverlayEntry(
    builder: (_) => _MessageMenu(
      position: position,
      items: items,
      facts: facts,
      onDismissed: () {
        if (removed) return;
        removed = true;
        entry.remove();
        done.complete();
      },
    ),
  );
  overlay.insert(entry);
  return done.future;
}

const double _menuWidth = 232;
const double _rowHeight = 36;
const double _pad = 6;
const double _factHeight = 26;

class _MessageMenu extends StatefulWidget {
  final Offset position;
  final List<MessageMenuItem> items;
  final List<MessageMenuFact> facts;
  final VoidCallback onDismissed;

  const _MessageMenu({
    required this.position,
    required this.items,
    required this.facts,
    required this.onDismissed,
  });

  @override
  State<_MessageMenu> createState() => _MessageMenuState();
}

class _MessageMenuState extends State<_MessageMenu> with SingleTickerProviderStateMixin {
  // Приход длиннее ухода: меню раскрывается от курсора, а закрывается
  // быстро — действие уже выбрано, ждать нечего.
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 340),
    reverseDuration: const Duration(milliseconds: 170),
  )..forward();

  final _focus = FocusNode();

  /// Подсвеченная строка: наведение мышью и стрелки клавиатуры двигают одну и
  /// ту же отметку, чтобы не было двух подсветок сразу.
  int _active = -1;
  bool _closing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focus.requestFocus();
    });
  }

  @override
  void dispose() {
    _c.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _close({VoidCallback? then}) async {
    if (_closing) return;
    _closing = true;
    await _c.reverse();
    widget.onDismissed();
    // Действие — после ухода меню: окно пересылки или удаления не должно
    // появляться поверх ещё гаснущего меню.
    then?.call();
  }

  KeyEventResult _onKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent && event is! KeyRepeatEvent) return KeyEventResult.ignored;
    final n = widget.items.length;
    switch (event.logicalKey) {
      case LogicalKeyboardKey.escape:
        _close();
        return KeyEventResult.handled;
      case LogicalKeyboardKey.arrowDown:
        setState(() => _active = (_active + 1) % n);
        return KeyEventResult.handled;
      case LogicalKeyboardKey.arrowUp:
        setState(() => _active = _active <= 0 ? n - 1 : _active - 1);
        return KeyEventResult.handled;
      case LogicalKeyboardKey.enter:
      case LogicalKeyboardKey.numpadEnter:
      case LogicalKeyboardKey.space:
        if (_active >= 0) _close(then: widget.items[_active].onSelect);
        return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  double get _height {
    final facts = widget.facts.isEmpty ? 0 : 11 + widget.facts.length * _factHeight + 4;
    return _pad * 2 + widget.items.length * _rowHeight + facts;
  }

  @override
  Widget build(BuildContext context) {
    final screen = MediaQuery.sizeOf(context);
    final h = _height;
    // Меню открывается от курсора вправо-вниз, а у края окна — зеркально,
    // чтобы не уехать за границу. Точка роста — всегда угол у курсора.
    final flipX = widget.position.dx + _menuWidth > screen.width - 8;
    final flipY = widget.position.dy + h > screen.height - 8;
    final left = (flipX ? widget.position.dx - _menuWidth : widget.position.dx)
        .clamp(8.0, screen.width - _menuWidth - 8);
    final top = (flipY ? widget.position.dy - h : widget.position.dy).clamp(8.0, screen.height - h - 8);
    final origin = Alignment(flipX ? 1 : -1, flipY ? 1 : -1);

    return Focus(
      focusNode: _focus,
      onKeyEvent: _onKey,
      child: Stack(
        children: [
          // Щелчок мимо меню — любой кнопкой — закрывает его.
          Positioned.fill(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: _close,
              onSecondaryTap: _close,
            ),
          ),
          Positioned(
            left: left,
            top: top,
            width: _menuWidth,
            child: AnimatedBuilder(
              animation: _c,
              builder: (context, child) {
                final reverse = _c.status == AnimationStatus.reverse;
                final t = reverse ? VellinMotion.exit.transform(_c.value) : VellinMotion.standard.transform(_c.value);
                return Opacity(
                  opacity: t.clamp(0.0, 1.0),
                  child: Transform.scale(
                    // Уход сжимается меньше, чем приход растёт: закрытие — это
                    // гашение, а не обратное раскрытие на всю амплитуду.
                    scale: reverse ? 0.96 + 0.04 * t : 0.9 + 0.1 * t,
                    alignment: origin,
                    child: child,
                  ),
                );
              },
              // Плотная подложка без блюра: блюр в клиенте разрешён только в
              // перечисленных местах, а меню над лентой читается и так.
              child: Container(
                decoration: BoxDecoration(
                  color: VellinColors.glassDock,
                  borderRadius: BorderRadius.circular(VellinRadius.raised),
                  border: Border.all(color: VellinColors.line10),
                  boxShadow: VellinShadow.menu,
                ),
                padding: const EdgeInsets.all(_pad),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (var i = 0; i < widget.items.length; i++)
                      _Staggered(
                        controller: _c,
                        index: i,
                        count: widget.items.length + (widget.facts.isEmpty ? 0 : 1),
                        child: _Row(
                          item: widget.items[i],
                          active: _active == i,
                          onHover: (on) => setState(() => _active = on ? i : (_active == i ? -1 : _active)),
                          onTap: () => _close(then: widget.items[i].onSelect),
                        ),
                      ),
                    if (widget.facts.isNotEmpty)
                      _Staggered(
                        controller: _c,
                        index: widget.items.length,
                        count: widget.items.length + 1,
                        child: _Facts(facts: widget.facts),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Лесенка прихода: строки подтягиваются снизу по очереди, уход — разом.
class _Staggered extends StatelessWidget {
  final AnimationController controller;
  final int index;
  final int count;
  final Widget child;

  const _Staggered({required this.controller, required this.index, required this.count, required this.child});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, child) {
        if (controller.status == AnimationStatus.reverse) return child!;
        // Каждая строка стартует на 5 % позже предыдущей и доигрывает к концу.
        final start = (index * 0.05).clamp(0.0, 0.5);
        final local = ((controller.value - start) / (1 - start)).clamp(0.0, 1.0);
        final t = VellinMotion.standard.transform(local);
        return Opacity(
          opacity: t,
          child: Transform.translate(offset: Offset(0, 5 * (1 - t)), child: child),
        );
      },
      child: child,
    );
  }
}

class _Row extends StatelessWidget {
  final MessageMenuItem item;
  final bool active;
  final ValueChanged<bool> onHover;
  final VoidCallback onTap;

  const _Row({required this.item, required this.active, required this.onHover, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final ink = item.danger ? VellinColors.danger : (active ? VellinColors.ink94 : VellinColors.ink82);
    final glyph = item.danger ? VellinColors.danger : (active ? VellinColors.accent : VellinColors.ink55);

    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => onHover(true),
      onExit: (_) => onHover(false),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: AnimatedContainer(
          duration: VellinMotion.micro,
          curve: VellinMotion.standard,
          height: _rowHeight,
          padding: const EdgeInsets.symmetric(horizontal: 10),
          decoration: BoxDecoration(
            color: active
                ? (item.danger ? const Color(0x1FD65C52) : VellinColors.fill055)
                : const Color(0x00000000),
            borderRadius: BorderRadius.circular(VellinRadius.button),
          ),
          child: Row(
            children: [
              // Глиф чуть сдвигается при наведении — строка откликается не
              // только цветом.
              AnimatedSlide(
                duration: VellinMotion.micro,
                curve: VellinMotion.standard,
                offset: Offset(active ? 0.08 : 0, 0),
                child: VellinIcon(item.glyph, size: 16, color: glyph),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: AnimatedDefaultTextStyle(
                  duration: VellinMotion.micro,
                  curve: VellinMotion.standard,
                  style: VellinType.body.copyWith(fontSize: 13, height: 1.2, color: ink),
                  child: Text(item.label, maxLines: 1, overflow: TextOverflow.ellipsis),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Facts extends StatelessWidget {
  final List<MessageMenuFact> facts;
  const _Facts({required this.facts});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(4, 5, 4, 5),
          child: ColoredBox(color: VellinColors.line06, child: SizedBox(height: 1)),
        ),
        for (final f in facts)
          SizedBox(
            height: _factHeight,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10),
              child: Row(
                children: [
                  SizedBox(
                    width: 16,
                    child: Center(
                      child: VellinIcon(
                        f.glyph,
                        size: f.glyphBox.width == 18 && f.glyphBox.height == 18 ? 14 : 15,
                        box: f.glyphBox,
                        color: VellinColors.ink34,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      f.text,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: VellinType.caption.copyWith(
                        fontSize: 11.5,
                        color: VellinColors.ink45,
                        fontFeatures: VellinType.tabular,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        const SizedBox(height: 4),
      ],
    );
  }
}

/// Готовые строки подвала — чтобы лента не собирала глифы и подписи сама.
class MessageFacts {
  static MessageMenuFact read(String? at) => MessageMenuFact(
        glyph: VellinGlyphs.tickDouble,
        glyphBox: const Size(18, 11),
        text: at == null ? 'Прочитано' : 'Прочитано ${formatMoment(at)}',
      );

  static MessageMenuFact listened(String at) =>
      MessageMenuFact(glyph: VellinGlyphs.listened, text: 'Прослушано ${formatMoment(at)}');

  static MessageMenuFact viewed(String at) =>
      MessageMenuFact(glyph: VellinGlyphs.viewed, text: 'Просмотрено ${formatMoment(at)}');

  static MessageMenuFact edited(String at) =>
      MessageMenuFact(glyph: VellinGlyphs.edit, text: 'Изменено ${formatMoment(at)}');
}
