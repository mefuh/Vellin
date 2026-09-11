import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import '../models/notification.dart';
import '../runtime/notification_router.dart';
import '../state/notifications_controller.dart';
import '../theme/vellin_design.dart';
import '../theme/vellin_glyphs.dart';
import 'ui/vellin_avatar.dart';
import 'ui/vellin_button.dart';
import 'ui/vellin_hover.dart';
import 'ui/vellin_icon.dart';
import 'ui/vellin_surfaces.dart';

/// «Сколько прошло» коротким текстом — как в вебе.
String _timeAgo(String iso) {
  final at = DateTime.tryParse(iso);
  if (at == null) return '';
  final m = DateTime.now().difference(at.toLocal()).inMinutes;
  if (m < 1) return 'только что';
  if (m < 60) return '$m мин назад';
  final h = m ~/ 60;
  if (h < 24) return '$h ч назад';
  return '${h ~/ 24} дн назад';
}

/// Колокольчик с бейджем непрочитанных. Живёт в заголовке окна, слева от
/// кнопок управления окном, и занимает такую же ячейку 46×36.
class NotificationsBellButton extends StatefulWidget {
  const NotificationsBellButton({super.key});
  @override
  State<NotificationsBellButton> createState() => _NotificationsBellButtonState();
}

class _NotificationsBellButtonState extends State<NotificationsBellButton> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final unread = context.select<NotificationsController, int>((c) => c.unreadCount);
    final open = context.select<NotificationsController, bool>((c) => c.panelOpen);

    return MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: context.read<NotificationsController>().togglePanel,
        child: AnimatedContainer(
          duration: VellinMotion.hover,
          curve: VellinMotion.standard,
          width: VellinLayout.titleCell.width,
          height: VellinLayout.titleCell.height,
          color: open || _hover ? VellinColors.surface : const Color(0x00000000),
          alignment: Alignment.center,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              VellinIcon(
                VellinGlyphs.bell,
                size: 17,
                color: unread > 0
                    ? VellinColors.accent
                    : open || _hover
                        ? VellinColors.ink72
                        : VellinColors.ink45,
              ),
              if (unread > 0)
                Positioned(
                  top: -6,
                  right: -8,
                  child: VellinBadge(
                    count: unread,
                    height: 15,
                    fontSize: 9,
                    bedColor: VellinColors.chrome,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Панель уведомлений: выпадает из-под колокольчика, кликом мимо закрывается.
///
/// Собственный [Overlay]: слой живёт ВЫШЕ навигатора приложения, а подсказки
/// внутри ищут ближайший Overlay-предок — без него они падают.
class NotificationsPanelOverlay extends StatelessWidget {
  const NotificationsPanelOverlay({super.key});

  @override
  Widget build(BuildContext context) {
    final open = context.select<NotificationsController, bool>((c) => c.panelOpen);
    if (!open) return const SizedBox.shrink();

    return Overlay(
      initialEntries: [
        OverlayEntry(
          builder: (context) {
            final c = context.watch<NotificationsController>();
            // Панель и перехват щелчков начинаются под заголовком окна: иначе
            // панель ложится на кнопки свернуть и закрыть, а подложка
            // съедает нажатия по ним, пока панель открыта.
            return Stack(
              children: [
                Positioned(
                  top: VellinLayout.titleBarHeight,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: GestureDetector(behavior: HitTestBehavior.opaque, onTap: c.closePanel),
                ),
                Positioned(top: VellinLayout.titleBarHeight + 6, right: 8, child: _Panel(c: c)),
              ],
            );
          },
        ),
      ],
    );
  }
}

class _Panel extends StatefulWidget {
  final NotificationsController c;
  const _Panel({required this.c});

  @override
  State<_Panel> createState() => _PanelState();
}

class _PanelState extends State<_Panel> with SingleTickerProviderStateMixin {
  late final AnimationController _in = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 450),
  )..forward();

  @override
  void dispose() {
    _in.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.c;

    return AnimatedBuilder(
      animation: _in,
      builder: (context, child) {
        final t = VellinMotion.standard.transform(_in.value);
        return Opacity(
          opacity: t,
          child: Transform.translate(offset: Offset(0, -10 * (1 - t)), child: child),
        );
      },
      child: SizedBox(
        width: VellinLayout.notifPanel.width,
        child: VellinGlass(
          color: VellinColors.glassPanel,
          radius: BorderRadius.circular(VellinRadius.card),
          shadow: VellinShadow.menu,
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: VellinLayout.notifPanel.height),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Уведомления',
                          style: VellinType.cardTitle.copyWith(fontWeight: FontWeight.w600),
                        ),
                      ),
                      if (c.notifications.isNotEmpty)
                        VellinButton(
                          label: 'Прочитать все',
                          tone: VellinButtonTone.ghost,
                          height: 28,
                          radius: VellinRadius.chip,
                          onPressed: c.markAllRead,
                        ),
                    ],
                  ),
                ),
                const ColoredBox(
                  color: VellinColors.line06,
                  child: SizedBox(height: 1, width: double.infinity),
                ),
                Flexible(
                  child: c.notifications.isEmpty
                      ? Padding(
                          padding: const EdgeInsets.symmetric(vertical: 36, horizontal: 16),
                          child: Text(
                            'Пока нет уведомлений',
                            textAlign: TextAlign.center,
                            style: VellinType.caption.copyWith(fontSize: 12.5),
                          ),
                        )
                      : ListView.builder(
                          shrinkWrap: true,
                          padding: const EdgeInsets.all(8),
                          itemCount: c.notifications.length,
                          itemBuilder: (_, i) => _NotificationTile(n: c.notifications[i], c: c),
                        ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  final AppNotification n;
  final NotificationsController c;
  const _NotificationTile({required this.n, required this.c});

  @override
  Widget build(BuildContext context) {
    final busy = c.busy.contains(n.id);
    final isRequest = n.type == NotificationTypes.friendRequest;
    final br = BorderRadius.circular(VellinRadius.row);

    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: VellinInteractive(
        onTap: () => openNotification(n),
        focusRadius: br,
        builder: (context, s) {
          final hot = s.hovered || s.pressed;
          return AnimatedContainer(
            duration: VellinMotion.hover,
            curve: VellinMotion.standard,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              // Непрочитанное лежит на приподнятой поверхности, прочитанное —
              // прозрачное: так их видно списком, без отдельной пометки.
              color: n.read
                  ? (hot ? VellinColors.fill045 : const Color(0x00000000))
                  : VellinColors.surface,
              borderRadius: br,
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                VellinAvatar(
                  username: n.actor?.username ?? '?',
                  avatarUrl: n.actor?.avatarUrl,
                  size: 36,
                  bedColor: VellinColors.surface,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(n.text, style: VellinType.body.copyWith(fontSize: 13, height: 1.4)),
                      const SizedBox(height: 3),
                      Text(
                        _timeAgo(n.createdAt),
                        style: VellinType.caption.copyWith(fontSize: 11),
                      ),
                      if (isRequest) ...[
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            VellinButton(
                              label: 'Принять',
                              tone: VellinButtonTone.primary,
                              height: 30,
                              radius: VellinRadius.chip,
                              onPressed: busy ? null : () => c.respondToFriendRequest(n, accept: true),
                            ),
                            const SizedBox(width: 8),
                            VellinButton(
                              label: 'Отклонить',
                              height: 30,
                              radius: VellinRadius.chip,
                              onPressed: busy ? null : () => c.respondToFriendRequest(n, accept: false),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 4),
                VellinIconButton(
                  glyph: VellinGlyphs.closeSmall,
                  onPressed: () => c.dismiss(n.id),
                  size: 24,
                  radius: 12,
                  glyphSize: 9,
                  filled: false,
                  tooltip: 'Убрать уведомление',
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
