import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import '../../state/dm_controller.dart';
import '../../state/notifications_controller.dart';
import '../../state/shell_controller.dart';

/// Esc для всего окна: закрывает верхний открытый слой, по одному за нажатие —
/// настройки, панель уведомлений, профиль и в конце саму переписку.
///
/// Стоит над всем содержимым, а не в оболочке раздела. Событие клавиатуры
/// всплывает только от узла с фокусом к его предкам: пока обработчик жил в
/// оболочке, он срабатывал лишь при фокусе в поле ввода, а фрейм настроек
/// лежит соседним слоем и до него не доходило вовсе. Отсюда до обработчика
/// всплывает всё — поля, списки, фрейм настроек и наложения. Меню, окна и
/// лайтбокс ловят Esc раньше, у себя, и сюда он уже не приходит.
class EscapeScope extends StatefulWidget {
  final Widget child;
  const EscapeScope({super.key, required this.child});

  @override
  State<EscapeScope> createState() => _EscapeScopeState();
}

class _EscapeScopeState extends State<EscapeScope> {
  final _node = FocusNode(debugLabel: 'escape-scope', skipTraversal: true);

  @override
  void initState() {
    super.initState();
    FocusManager.instance.addListener(_reclaim);
    WidgetsBinding.instance.addPostFrameCallback((_) => _reclaim());
  }

  @override
  void dispose() {
    FocusManager.instance.removeListener(_reclaim);
    _node.dispose();
    super.dispose();
  }

  /// Фокус «нигде» — у корня окна, выше этого узла: так бывает после закрытия
  /// переписки, меню или окна, когда узел с фокусом исчез. Тогда Esc не
  /// всплыл бы сюда, поэтому фокус забираем себе. Узел ничего не рисует и в
  /// обход табом не входит.
  void _reclaim() {
    final primary = FocusManager.instance.primaryFocus;
    if (primary != null && primary != FocusManager.instance.rootScope) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final now = FocusManager.instance.primaryFocus;
      if (now == null || now == FocusManager.instance.rootScope) _node.requestFocus();
    });
  }

  KeyEventResult _onKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent || event.logicalKey != LogicalKeyboardKey.escape) {
      return KeyEventResult.ignored;
    }
    final shell = context.read<ShellController>();
    if (shell.settingsOpen) {
      // Через просьбу, а не сразу: фрейм должен доиграть уход, как по кнопке.
      shell.requestCloseSettings();
      return KeyEventResult.handled;
    }
    final notifications = context.read<NotificationsController>();
    if (notifications.panelOpen) {
      notifications.closePanel();
      return KeyEventResult.handled;
    }
    final dm = context.read<DmController>();
    switch (shell.pane) {
      case RightPaneKind.profile:
        shell.closeProfile(hasOpenChat: dm.activePeerPublicId != null);
        return KeyEventResult.handled;
      case RightPaneKind.chat:
        dm.closeThread();
        shell.showEmpty();
        return KeyEventResult.handled;
      case RightPaneKind.empty:
        return KeyEventResult.ignored;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Focus(focusNode: _node, onKeyEvent: _onKey, child: widget.child);
  }
}
