import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../../models/social.dart';
import '../../theme/vellin_design.dart';
import '../../theme/vellin_glyphs.dart';
import '../ui/vellin_avatar.dart';
import '../ui/vellin_button.dart';
import '../ui/vellin_field.dart';
import '../ui/vellin_icon.dart';

/// Модальное окно поверх всего клиента: затемнение и карточка по центру.
///
/// Карточка приходит с лёгким подъёмом и ростом, уходит быстрее и мельче —
/// так же, как меню, из которого окно обычно и открывают. Блюра под окном нет:
/// в клиенте он разрешён только в перечисленных местах.
Future<T?> showVellinModal<T>(
  BuildContext context, {
  required Widget Function(BuildContext context, void Function([T? result]) close) builder,
  double width = 380,
}) {
  final overlay = Overlay.of(context, rootOverlay: true);
  final done = Completer<T?>();
  late final OverlayEntry entry;
  entry = OverlayEntry(
    builder: (_) => _Modal<T>(
      width: width,
      builder: builder,
      onDismissed: (result) {
        entry.remove();
        if (!done.isCompleted) done.complete(result);
      },
    ),
  );
  overlay.insert(entry);
  return done.future;
}

class _Modal<T> extends StatefulWidget {
  final double width;
  final Widget Function(BuildContext context, void Function([T? result]) close) builder;
  final void Function(T? result) onDismissed;

  const _Modal({required this.width, required this.builder, required this.onDismissed});

  @override
  State<_Modal<T>> createState() => _ModalState<T>();
}

class _ModalState<T> extends State<_Modal<T>> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 420),
    reverseDuration: const Duration(milliseconds: 220),
  )..forward();

  final _focus = FocusNode();
  bool _closing = false;

  @override
  void dispose() {
    _c.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _close([T? result]) async {
    if (_closing) return;
    _closing = true;
    await _c.reverse();
    widget.onDismissed(result);
  }

  @override
  Widget build(BuildContext context) {
    return Focus(
      focusNode: _focus,
      autofocus: true,
      onKeyEvent: (node, event) {
        if (event is KeyDownEvent && event.logicalKey == LogicalKeyboardKey.escape) {
          _close();
          return KeyEventResult.handled;
        }
        return KeyEventResult.ignored;
      },
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, child) {
          final reverse = _c.status == AnimationStatus.reverse;
          final t = reverse ? VellinMotion.exit.transform(_c.value) : VellinMotion.standard.transform(_c.value);
          return Stack(
            children: [
              Positioned.fill(
                child: GestureDetector(
                  onTap: _close,
                  child: ColoredBox(color: VellinColors.scrim.withValues(alpha: 0.72 * t)),
                ),
              ),
              Center(
                child: Opacity(
                  opacity: t.clamp(0.0, 1.0),
                  child: Transform.translate(
                    offset: Offset(0, (reverse ? 4 : 12) * (1 - t)),
                    child: Transform.scale(scale: (reverse ? 0.98 : 0.95) + (reverse ? 0.02 : 0.05) * t, child: child),
                  ),
                ),
              ),
            ],
          );
        },
        child: Container(
          width: widget.width,
          decoration: BoxDecoration(
            color: VellinColors.surface,
            borderRadius: BorderRadius.circular(VellinRadius.card),
            border: Border.all(color: VellinColors.line09),
            boxShadow: VellinShadow.menu,
          ),
          child: Builder(builder: (context) => widget.builder(context, _close)),
        ),
      ),
    );
  }
}

/// Как удалить: у обоих или только у себя.
enum DeleteScope { everyone, me }

/// Подтверждение удаления. Выбор делается кнопкой, а не галочкой: действие
/// необратимое, и оба варианта должны читаться сразу, без лишнего клика.
Future<DeleteScope?> showDeleteMessagesDialog(
  BuildContext context, {
  required int count,
  required String peerName,
}) {
  return showVellinModal<DeleteScope>(
    context,
    width: 360,
    builder: (context, close) => Padding(
      padding: const EdgeInsets.fromLTRB(22, 22, 22, 18),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            count == 1 ? 'Удалить сообщение?' : 'Удалить ${_plural(count)}?',
            style: VellinType.cardTitle.copyWith(fontFeatures: VellinType.tabular),
          ),
          const SizedBox(height: 8),
          Text(
            peerName.isEmpty
                ? 'Удалить у обоих или только у вас.'
                : 'Удалить у вас и у $peerName или только у вас.',
            style: VellinType.caption.copyWith(fontSize: 12.5, height: 1.55, color: VellinColors.ink45),
          ),
          const SizedBox(height: 18),
          _Staggered(
            controller: null,
            index: 0,
            child: VellinButton(
              label: 'Удалить у всех',
              glyph: VellinGlyphs.trash,
              tone: VellinButtonTone.danger,
              height: 40,
              expand: true,
              onPressed: () => close(DeleteScope.everyone),
            ),
          ),
          const SizedBox(height: 8),
          _Staggered(
            controller: null,
            index: 1,
            child: VellinButton(
              label: 'Удалить только у меня',
              tone: VellinButtonTone.secondary,
              height: 40,
              expand: true,
              onPressed: () => close(DeleteScope.me),
            ),
          ),
          const SizedBox(height: 4),
          _Staggered(
            controller: null,
            index: 2,
            child: VellinButton(
              label: 'Отмена',
              tone: VellinButtonTone.ghost,
              height: 38,
              expand: true,
              onPressed: () => close(),
            ),
          ),
        ],
      ),
    ),
  );
}

String _plural(int n) {
  final mod10 = n % 10;
  final mod100 = n % 100;
  final word = mod10 == 1 && mod100 != 11
      ? 'сообщение'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
          ? 'сообщения'
          : 'сообщений';
  return '$n $word';
}

/// Кандидат для пересылки: собеседник диалога либо друг без переписки.
class ForwardTarget {
  final PublicUser user;

  /// Это открытый сейчас диалог — подписываем, чтобы не гадать.
  final bool current;

  const ForwardTarget({required this.user, this.current = false});
}

/// Окно «Переслать»: поиск и список людей. Возвращает выбранного.
Future<PublicUser?> showForwardDialog(
  BuildContext context, {
  required List<ForwardTarget> targets,
  required int count,
}) {
  return showVellinModal<PublicUser>(
    context,
    width: 380,
    builder: (context, close) => _ForwardBody(targets: targets, count: count, onPick: close),
  );
}

class _ForwardBody extends StatefulWidget {
  final List<ForwardTarget> targets;
  final int count;
  final void Function([PublicUser? user]) onPick;

  const _ForwardBody({required this.targets, required this.count, required this.onPick});

  @override
  State<_ForwardBody> createState() => _ForwardBodyState();
}

class _ForwardBodyState extends State<_ForwardBody> with SingleTickerProviderStateMixin {
  final _query = TextEditingController();

  /// Лесенка строк списка — отдельно от прихода окна, чтобы строки
  /// подтягивались, когда карточка уже встала.
  late final AnimationController _rows = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 520),
  )..forward();

  String _shownQuery = '';

  @override
  void dispose() {
    _query.dispose();
    _rows.dispose();
    super.dispose();
  }

  List<ForwardTarget> get _filtered {
    final q = _query.text.trim().toLowerCase();
    if (q.isEmpty) return widget.targets;
    return widget.targets.where((t) => t.user.username.toLowerCase().contains(q)).toList();
  }

  void _onQuery(String value) {
    // Новый запрос — список перестраивается заново, с той же лесенкой.
    if (value.trim() != _shownQuery) {
      _shownQuery = value.trim();
      _rows.forward(from: 0.35);
    }
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final list = _filtered;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(22, 20, 14, 0),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  widget.count == 1 ? 'Переслать сообщение' : 'Переслать ${_plural(widget.count)}',
                  style: VellinType.cardTitle.copyWith(fontFeatures: VellinType.tabular),
                ),
              ),
              VellinIconButton(
                glyph: VellinGlyphs.cross,
                onPressed: () => widget.onPick(),
                size: 30,
                radius: VellinRadius.mini,
                glyphSize: 15,
                filled: false,
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 10),
          child: VellinSearchField(controller: _query, placeholder: 'Кому переслать', onChanged: _onQuery),
        ),
        ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 360, minHeight: 120),
          child: list.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      widget.targets.isEmpty ? 'Пока некому переслать' : 'Никого не нашли',
                      style: VellinType.caption.copyWith(fontSize: 12.5),
                    ),
                  ),
                )
              : ListView.builder(
                  shrinkWrap: true,
                  padding: const EdgeInsets.fromLTRB(10, 0, 10, 12),
                  itemCount: list.length,
                  itemBuilder: (context, i) => _Staggered(
                    controller: _rows,
                    index: i,
                    child: _TargetRow(target: list[i], onTap: () => widget.onPick(list[i].user)),
                  ),
                ),
        ),
      ],
    );
  }
}

class _TargetRow extends StatefulWidget {
  final ForwardTarget target;
  final VoidCallback onTap;
  const _TargetRow({required this.target, required this.onTap});

  @override
  State<_TargetRow> createState() => _TargetRowState();
}

class _TargetRowState extends State<_TargetRow> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final u = widget.target.user;
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: VellinMotion.micro,
          curve: VellinMotion.standard,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: _hover ? VellinColors.fill055 : const Color(0x00000000),
            borderRadius: BorderRadius.circular(VellinRadius.row),
          ),
          child: Row(
            children: [
              VellinAvatar(username: u.username, avatarUrl: u.avatarUrl, size: 34, bedColor: VellinColors.surface),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(u.username, style: VellinType.rowTitle, maxLines: 1, overflow: TextOverflow.ellipsis),
                    if (widget.target.current) ...[
                      const SizedBox(height: 2),
                      Text('Этот диалог', style: VellinType.rowSub.copyWith(fontSize: 11.5)),
                    ],
                  ],
                ),
              ),
              AnimatedOpacity(
                duration: VellinMotion.micro,
                curve: VellinMotion.standard,
                opacity: _hover ? 1 : 0,
                child: AnimatedSlide(
                  duration: VellinMotion.hover,
                  curve: VellinMotion.standard,
                  offset: Offset(_hover ? 0 : -0.3, 0),
                  child: const VellinIcon(VellinGlyphs.forward, size: 16, color: VellinColors.accent),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Лесенка прихода строк. Без контроллера играет сама, один раз при монтаже.
class _Staggered extends StatefulWidget {
  final AnimationController? controller;
  final int index;
  final Widget child;

  const _Staggered({required this.controller, required this.index, required this.child});

  @override
  State<_Staggered> createState() => _StaggeredState();
}

class _StaggeredState extends State<_Staggered> with SingleTickerProviderStateMixin {
  AnimationController? _own;

  AnimationController get _c => widget.controller ?? _own!;

  @override
  void initState() {
    super.initState();
    if (widget.controller == null) {
      _own = AnimationController(vsync: this, duration: const Duration(milliseconds: 520))..forward();
    }
  }

  @override
  void dispose() {
    _own?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, child) {
        final start = (0.12 + widget.index * 0.06).clamp(0.0, 0.6);
        final local = ((_c.value - start) / (1 - start)).clamp(0.0, 1.0);
        final t = VellinMotion.standard.transform(local);
        return Opacity(
          opacity: t,
          child: Transform.translate(offset: Offset(0, 6 * (1 - t)), child: child),
        );
      },
      child: widget.child,
    );
  }
}
