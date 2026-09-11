import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../../theme/vellin_design.dart';
import '../../theme/vellin_glyphs.dart';
import '../shell/phase_switch.dart';
import '../ui/vellin_button.dart';
import '../ui/vellin_field.dart';
import '../ui/vellin_icon.dart';
import 'emoji_catalog.dart';

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
  MessageMenuReactions? reactions,
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
      reactions: reactions,
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

/// Реакции над меню: короткая полоса и полный каталог.
class MessageMenuReactions {
  /// Короткая полоса — недавние и стандартные.
  final List<String> quick;

  /// Моя реакция на это сообщение: в полосе и каталоге она подсвечена.
  final String? current;
  final ValueChanged<String> onReact;

  const MessageMenuReactions({required this.quick, required this.current, required this.onReact});
}

const double _menuWidth = 232;
const double _rowHeight = 36;
const double _pad = 6;
const double _factHeight = 26;

const double _stripHeight = 46;
const double _stripGap = 8;
const double _emojiCell = 36;
const double _catalogWidth = 328;
const double _catalogHeight = 384;

class _MessageMenu extends StatefulWidget {
  final Offset position;
  final List<MessageMenuItem> items;
  final List<MessageMenuFact> facts;
  final MessageMenuReactions? reactions;
  final VoidCallback onDismissed;

  const _MessageMenu({
    required this.position,
    required this.items,
    required this.facts,
    required this.reactions,
    required this.onDismissed,
  });

  @override
  State<_MessageMenu> createState() => _MessageMenuState();
}

class _MessageMenuState extends State<_MessageMenu> with TickerProviderStateMixin {
  // Приход длиннее ухода: меню раскрывается от курсора, а закрывается
  // быстро — действие уже выбрано, ждать нечего.
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 340),
    reverseDuration: const Duration(milliseconds: 170),
  )..forward();

  /// Меню и каталог сменяют друг друга в две фазы: одно уходит, потом
  /// приходит другое.
  late final AnimationController _menuPhase = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 380),
    reverseDuration: const Duration(milliseconds: 200),
    value: 1,
  );
  late final AnimationController _catalogPhase = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 440),
    reverseDuration: const Duration(milliseconds: 200),
  );
  bool _catalog = false;
  bool _switching = false;

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
    _menuPhase.dispose();
    _catalogPhase.dispose();
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

  Future<void> _openCatalog() async {
    if (_catalog || _switching) return;
    _switching = true;
    await _menuPhase.reverse();
    if (!mounted) return;
    setState(() => _catalog = true);
    await _catalogPhase.forward(from: 0);
    _switching = false;
  }

  Future<void> _closeCatalog() async {
    if (!_catalog || _switching) return;
    _switching = true;
    await _catalogPhase.reverse();
    if (!mounted) return;
    setState(() => _catalog = false);
    _focus.requestFocus();
    await _menuPhase.forward(from: 0);
    _switching = false;
  }

  void _react(String emoji) => _close(then: () => widget.reactions?.onReact(emoji));

  KeyEventResult _onKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent && event is! KeyRepeatEvent) return KeyEventResult.ignored;
    // В каталоге клавиатура принадлежит поиску: перехватываем только Esc,
    // и он возвращает к меню, а не закрывает всё.
    if (_catalog) {
      if (event is KeyDownEvent && event.logicalKey == LogicalKeyboardKey.escape) {
        _closeCatalog();
        return KeyEventResult.handled;
      }
      return KeyEventResult.ignored;
    }
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

  double get _menuHeight {
    final facts = widget.facts.isEmpty ? 0 : 11 + widget.facts.length * _factHeight + 4;
    return _pad * 2 + widget.items.length * _rowHeight + facts;
  }

  double get _stripWidth => RecentReactionsLayout.stripWidth(widget.reactions!.quick.length);

  @override
  Widget build(BuildContext context) {
    final screen = MediaQuery.sizeOf(context);
    final hasStrip = widget.reactions != null;
    final blockW = hasStrip ? (_stripWidth > _menuWidth ? _stripWidth : _menuWidth) : _menuWidth;
    final blockH = (hasStrip ? _stripHeight + _stripGap : 0) + _menuHeight;

    // Блок (полоса реакций + меню) открывается от курсора вправо-вниз, а у
    // края окна — зеркально. Точка роста — всегда угол у курсора.
    final flipX = widget.position.dx + blockW > screen.width - 8;
    final flipY = widget.position.dy + blockH > screen.height - 8;
    final left = (flipX ? widget.position.dx - blockW : widget.position.dx).clamp(8.0, screen.width - blockW - 8);
    final top = (flipY ? widget.position.dy - blockH : widget.position.dy).clamp(8.0, screen.height - blockH - 8);
    final origin = Alignment(flipX ? 1 : -1, flipY ? 1 : -1);

    // Каталог встаёт на место блока и растёт от того же угла.
    final catLeft = (flipX ? left + blockW - _catalogWidth : left).clamp(8.0, screen.width - _catalogWidth - 8);
    final catTop = (flipY ? top + blockH - _catalogHeight : top).clamp(8.0, screen.height - _catalogHeight - 8);

    return Focus(
      focusNode: _focus,
      onKeyEvent: _onKey,
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, child) {
          final reverse = _c.status == AnimationStatus.reverse;
          final t = reverse ? VellinMotion.exit.transform(_c.value) : VellinMotion.standard.transform(_c.value);
          return Stack(
            children: [
              // Щелчок мимо меню — любой кнопкой — закрывает его.
              Positioned.fill(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: _close,
                  onSecondaryTap: _close,
                ),
              ),
              if (!_catalog)
                Positioned(
                  left: left,
                  top: top,
                  width: blockW,
                  child: _phase(
                    controller: _menuPhase,
                    origin: origin,
                    global: t,
                    reverseGlobal: reverse,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      // Полоса шире меню и стоит над ним по центру — как одно целое,
                      // а не два прижатых к курсору куска.
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        if (hasStrip) ...[
                          _ReactionStrip(
                            controller: _c,
                            reactions: widget.reactions!,
                            onPick: _react,
                            onMore: _openCatalog,
                          ),
                          const SizedBox(height: _stripGap),
                        ],
                        SizedBox(width: _menuWidth, child: _menu()),
                      ],
                    ),
                  ),
                ),
              if (_catalog)
                Positioned(
                  left: catLeft,
                  top: catTop,
                  width: _catalogWidth,
                  height: _catalogHeight,
                  child: _phase(
                    controller: _catalogPhase,
                    origin: origin,
                    global: t,
                    reverseGlobal: reverse,
                    child: _ReactionCatalog(
                      controller: _catalogPhase,
                      current: widget.reactions?.current,
                      onPick: _react,
                      onBack: _closeCatalog,
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  /// Общая обёртка прихода и ухода: глобальное открытие меню помножено на
  /// фазу своего содержимого (меню или каталог).
  Widget _phase({
    required AnimationController controller,
    required Alignment origin,
    required double global,
    required bool reverseGlobal,
    required Widget child,
  }) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, child) {
        final reverse = controller.status == AnimationStatus.reverse;
        final p = reverse ? VellinMotion.exit.transform(controller.value) : VellinMotion.standard.transform(controller.value);
        final g = reverseGlobal ? 0.96 + 0.04 * global : 0.9 + 0.1 * global;
        final local = reverse ? 0.96 + 0.04 * p : 0.92 + 0.08 * p;
        return Opacity(
          opacity: (global * p).clamp(0.0, 1.0),
          child: Transform.scale(scale: g * local, alignment: origin, child: child),
        );
      },
      child: child,
    );
  }

  Widget _menu() {
    // Плотная подложка без блюра: блюр в клиенте разрешён только в
    // перечисленных местах, а меню над лентой читается и так.
    return Container(
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
              index: i + (widget.reactions == null ? 0 : 1),
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
              index: widget.items.length + 1,
              count: widget.items.length + 1,
              child: _Facts(facts: widget.facts),
            ),
        ],
      ),
    );
  }
}

/// Геометрия короткой полосы — нужна меню заранее, чтобы уложить блок в окно.
class RecentReactionsLayout {
  static double stripWidth(int count) => 8 + count * _emojiCell + 4 + 30 + 8;
}

/// Короткая полоса реакций над меню.
class _ReactionStrip extends StatelessWidget {
  final AnimationController controller;
  final MessageMenuReactions reactions;
  final ValueChanged<String> onPick;
  final VoidCallback onMore;

  const _ReactionStrip({
    required this.controller,
    required this.reactions,
    required this.onPick,
    required this.onMore,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: _stripHeight,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: VellinColors.glassDock,
        borderRadius: BorderRadius.circular(_stripHeight / 2),
        border: Border.all(color: VellinColors.line10),
        boxShadow: VellinShadow.menu,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < reactions.quick.length; i++)
            _Pop(
              controller: controller,
              index: i,
              child: _EmojiButton(
                emoji: reactions.quick[i],
                selected: reactions.quick[i] == reactions.current,
                size: _emojiCell,
                fontSize: 22,
                onTap: () => onPick(reactions.quick[i]),
              ),
            ),
          const SizedBox(width: 4),
          _Pop(
            controller: controller,
            index: reactions.quick.length,
            child: _MoreButton(onTap: onMore),
          ),
        ],
      ),
    );
  }
}

/// Приход смайлика в полосе: вырастает из точки с небольшой задержкой за
/// соседом слева.
class _Pop extends StatelessWidget {
  final AnimationController controller;
  final int index;
  final Widget child;

  const _Pop({required this.controller, required this.index, required this.child});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, child) {
        if (controller.status == AnimationStatus.reverse) return child!;
        final start = (0.08 + index * 0.05).clamp(0.0, 0.6);
        final local = ((controller.value - start) / (1 - start)).clamp(0.0, 1.0);
        final t = VellinMotion.standard.transform(local);
        return Opacity(
          opacity: t,
          child: Transform.scale(scale: 0.4 + 0.6 * t, child: child),
        );
      },
      child: child,
    );
  }
}

/// Кнопка смайлика: при наведении приподнимается и растёт, выбранный стоит на
/// золотой подложке.
class _EmojiButton extends StatefulWidget {
  final String emoji;
  final bool selected;
  final double size;
  final double fontSize;
  final VoidCallback onTap;

  const _EmojiButton({
    required this.emoji,
    required this.selected,
    required this.size,
    required this.fontSize,
    required this.onTap,
  });

  @override
  State<_EmojiButton> createState() => _EmojiButtonState();
}

class _EmojiButtonState extends State<_EmojiButton> {
  bool _hover = false;
  bool _down = false;

  @override
  Widget build(BuildContext context) {
    final scale = _down ? 0.9 : (_hover ? 1.22 : 1.0);
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() {
        _hover = false;
        _down = false;
      }),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: (_) => setState(() => _down = true),
        onTapCancel: () => setState(() => _down = false),
        onTap: () {
          setState(() => _down = false);
          widget.onTap();
        },
        child: SizedBox(
          width: widget.size,
          height: widget.size,
          child: Stack(
            alignment: Alignment.center,
            children: [
              AnimatedContainer(
                duration: VellinMotion.hover,
                curve: VellinMotion.standard,
                width: widget.selected ? widget.size - 4 : 0,
                height: widget.selected ? widget.size - 4 : 0,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: const Color(0x29E2C99B),
                  border: Border.all(color: VellinColors.accentLine),
                ),
              ),
              AnimatedSlide(
                duration: VellinMotion.hover,
                curve: VellinMotion.standard,
                offset: Offset(0, _hover && !_down ? -0.06 : 0),
                child: AnimatedScale(
                  duration: _down ? VellinMotion.micro : VellinMotion.hover,
                  curve: VellinMotion.standard,
                  scale: scale,
                  child: EmojiGlyph(widget.emoji, size: widget.fontSize + 2),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Кнопка раскрытия полного каталога.
class _MoreButton extends StatefulWidget {
  final VoidCallback onTap;
  const _MoreButton({required this.onTap});

  @override
  State<_MoreButton> createState() => _MoreButtonState();
}

class _MoreButtonState extends State<_MoreButton> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: VellinMotion.hover,
          curve: VellinMotion.standard,
          width: 30,
          height: 30,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: _hover ? const Color(0x29E2C99B) : VellinColors.fill055,
            border: Border.all(color: _hover ? VellinColors.accentLine : VellinColors.line07),
          ),
          alignment: Alignment.center,
          child: AnimatedSlide(
            duration: VellinMotion.hover,
            curve: VellinMotion.standard,
            offset: Offset(0, _hover ? 0.1 : 0),
            child: VellinIcon(
              VellinGlyphs.chevronDown,
              size: 12,
              box: const Size(12, 12),
              color: _hover ? VellinColors.accent : VellinColors.ink62,
            ),
          ),
        ),
      ),
    );
  }
}

/// Полный каталог реакций: поиск, вкладки разделов и сетка.
class _ReactionCatalog extends StatefulWidget {
  final AnimationController controller;
  final String? current;
  final ValueChanged<String> onPick;
  final VoidCallback onBack;

  const _ReactionCatalog({
    required this.controller,
    required this.current,
    required this.onPick,
    required this.onBack,
  });

  @override
  State<_ReactionCatalog> createState() => _ReactionCatalogState();
}

class _ReactionCatalogState extends State<_ReactionCatalog> {
  static const _cols = 8;
  static const _header = 28.0;
  static const _gridPad = 8.0;

  final _query = TextEditingController();
  final _scroll = ScrollController();
  int _section = 0;

  double get _cell => (_catalogWidth - _gridPad * 2) / _cols;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_trackSection);
    _query.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _query.dispose();
    _scroll.dispose();
    super.dispose();
  }

  /// Смещение начала раздела: сетка фиксированная, поэтому оно считается, а
  /// не ищется по построенным виджетам — дальние разделы ещё не построены.
  double _offsetOf(int index) {
    var y = 0.0;
    for (var i = 0; i < index; i++) {
      y += _header + (emojiSections[i].items.length / _cols).ceil() * _cell;
    }
    return y;
  }

  void _trackSection() {
    final y = _scroll.offset + 4;
    var current = 0;
    for (var i = 0; i < emojiSections.length; i++) {
      if (_offsetOf(i) <= y) current = i;
    }
    if (current != _section) setState(() => _section = current);
  }

  void _jump(int index) {
    if (!_scroll.hasClients) return;
    final target = _offsetOf(index).clamp(0.0, _scroll.position.maxScrollExtent);
    _scroll.animateTo(target, duration: VellinMotion.layout, curve: VellinMotion.standard);
  }

  @override
  Widget build(BuildContext context) {
    final searching = _query.text.trim().isNotEmpty;
    return Container(
      decoration: BoxDecoration(
        color: VellinColors.glassDock,
        borderRadius: BorderRadius.circular(VellinRadius.raised),
        border: Border.all(color: VellinColors.line10),
        boxShadow: VellinShadow.menu,
      ),
      clipBehavior: Clip.antiAlias,
      child: AnimatedBuilder(
        animation: widget.controller,
        builder: (context, child) {
          // Содержимое догоняет карточку: сначала встаёт рамка, затем
          // проявляются поиск и сетка.
          final v = widget.controller.value;
          final local = widget.controller.status == AnimationStatus.reverse ? v : ((v - 0.2) / 0.8).clamp(0.0, 1.0);
          final t = VellinMotion.standard.transform(local);
          return Opacity(
            opacity: t,
            child: Transform.translate(offset: Offset(0, 6 * (1 - t)), child: child),
          );
        },
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 8, 6),
              child: Row(
                children: [
                  VellinIconButton(
                    glyph: VellinGlyphs.back,
                    onPressed: widget.onBack,
                    size: 30,
                    radius: VellinRadius.mini,
                    glyphSize: 15,
                    filled: false,
                    tooltip: 'Назад к меню',
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: VellinSearchField(controller: _query, placeholder: 'Поиск', autofocus: true, height: 32),
                  ),
                ],
              ),
            ),
            // Вкладки уходят, пока идёт поиск: разделы в результатах не делятся.
            AnimatedSize(
              duration: VellinMotion.hover,
              curve: VellinMotion.standard,
              child: searching ? const SizedBox(width: double.infinity) : _tabs(),
            ),
            const ColoredBox(color: VellinColors.line06, child: SizedBox(height: 1, width: double.infinity)),
            Expanded(
              child: PhaseSwitch(
                phaseKey: searching,
                shift: 0,
                child: searching ? _results() : _grid(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _tabs() {
    const tab = 36.0;
    return SizedBox(
      height: 38,
      child: Stack(
        children: [
          // Золотая черта переезжает под активный раздел, а не перескакивает.
          AnimatedPositioned(
            duration: VellinMotion.hover,
            curve: VellinMotion.standard,
            left: 10 + _section * tab + 8,
            bottom: 2,
            child: Container(
              width: tab - 16,
              height: 2,
              decoration: BoxDecoration(color: VellinColors.accent, borderRadius: BorderRadius.circular(1)),
            ),
          ),
          Positioned.fill(
            left: 10,
            child: Row(
              children: [
                for (var i = 0; i < emojiSections.length; i++)
                  _TabButton(
                    icon: emojiSections[i].icon,
                    active: i == _section,
                    tooltip: emojiSections[i].title,
                    onTap: () => _jump(i),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _grid() {
    return CustomScrollView(
      controller: _scroll,
      slivers: [
        for (final s in emojiSections) ...[
          SliverToBoxAdapter(
            child: SizedBox(
              height: _header,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
                child: Text(
                  s.title.toUpperCase(),
                  style: VellinType.sectionLabel.copyWith(fontSize: 10, color: VellinColors.ink34),
                ),
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: _gridPad),
            sliver: SliverGrid.builder(
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: _cols,
                mainAxisExtent: _cell,
              ),
              itemCount: s.items.length,
              itemBuilder: (context, i) => _EmojiButton(
                emoji: s.items[i].emoji,
                selected: s.items[i].emoji == widget.current,
                size: _cell,
                fontSize: 22,
                onTap: () => widget.onPick(s.items[i].emoji),
              ),
            ),
          ),
        ],
        const SliverToBoxAdapter(child: SizedBox(height: 8)),
      ],
    );
  }

  Widget _results() {
    final found = searchEmoji(_query.text);
    if (found.isEmpty) {
      return Center(
        child: Text('Ничего не нашлось', style: VellinType.caption.copyWith(fontSize: 12.5)),
      );
    }
    return GridView.builder(
      padding: const EdgeInsets.all(_gridPad),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: _cols, mainAxisExtent: _cell),
      itemCount: found.length,
      itemBuilder: (context, i) => _EmojiButton(
        emoji: found[i].emoji,
        selected: found[i].emoji == widget.current,
        size: _cell,
        fontSize: 22,
        onTap: () => widget.onPick(found[i].emoji),
      ),
    );
  }
}

class _TabButton extends StatefulWidget {
  final String icon;
  final bool active;
  final String tooltip;
  final VoidCallback onTap;

  const _TabButton({required this.icon, required this.active, required this.tooltip, required this.onTap});

  @override
  State<_TabButton> createState() => _TabButtonState();
}

class _TabButtonState extends State<_TabButton> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final lit = widget.active || _hover;
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: widget.onTap,
        child: SizedBox(
          width: 36,
          height: 36,
          child: Center(
            // Неактивные вкладки приглушены: разделы узнаются по силуэту, а
            // цвет остаётся за выбранным.
            child: AnimatedOpacity(
              duration: VellinMotion.hover,
              curve: VellinMotion.standard,
              opacity: lit ? 1 : 0.42,
              child: AnimatedScale(
                duration: VellinMotion.hover,
                curve: VellinMotion.standard,
                scale: widget.active ? 1.08 : 1,
                child: EmojiGlyph(widget.icon, size: 19),
              ),
            ),
          ),
        ),
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
