import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/notification.dart';
import '../runtime/notification_router.dart';
import '../state/notifications_controller.dart';
import '../theme/vellin_theme.dart';
import 'common.dart';

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

/// Кнопка-колокольчик с бейджем непрочитанных. Живёт в заголовке окна, слева
/// от кнопок свернуть/развернуть/закрыть.
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
        child: Container(
          width: 46,
          height: 36,
          color: open || _hover ? VellinColors.bg2 : Colors.transparent,
          alignment: Alignment.center,
          child: Stack(clipBehavior: Clip.none, children: [
            Icon(unread > 0 ? Icons.notifications : Icons.notifications_none,
                size: 17, color: unread > 0 ? VellinColors.text0 : VellinColors.text2),
            if (unread > 0)
              Positioned(
                top: -4,
                right: -6,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  constraints: const BoxConstraints(minWidth: 15),
                  height: 15,
                  decoration: BoxDecoration(
                    color: VellinColors.accent,
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: VellinColors.bg0, width: 1.5),
                  ),
                  alignment: Alignment.center,
                  child: Text(unread > 99 ? '99+' : '$unread',
                      style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w700, height: 1)),
                ),
              ),
          ]),
        ),
      ),
    );
  }
}

/// Панель уведомлений: выпадает из-под колокольчика, кликом мимо закрывается.
/// Кладётся поверх всего приложения (см. Stack в builder'е MaterialApp).
///
/// Собственный [Overlay]: слой живёт ВЫШЕ навигатора приложения, а тултипы
/// (крестик «убрать») ищут ближайший Overlay-предок — без него они падают.
class NotificationsPanelOverlay extends StatelessWidget {
  const NotificationsPanelOverlay({super.key});

  @override
  Widget build(BuildContext context) {
    final open = context.select<NotificationsController, bool>((c) => c.panelOpen);
    if (!open) return const SizedBox.shrink();

    return Overlay(initialEntries: [
      OverlayEntry(builder: (context) {
        final c = context.watch<NotificationsController>();
        return Stack(children: [
          // Клик мимо панели закрывает её.
          Positioned.fill(
            child: GestureDetector(behavior: HitTestBehavior.opaque, onTap: c.closePanel),
          ),
          Positioned(top: 40, right: 8, child: _Panel(c: c)),
        ]);
      }),
    ]);
  }
}

class _Panel extends StatelessWidget {
  final NotificationsController c;
  const _Panel({required this.c});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: Container(
        width: 380,
        constraints: const BoxConstraints(maxHeight: 460),
        decoration: BoxDecoration(
          color: VellinColors.bg1,
          borderRadius: BorderRadius.circular(VellinRadius.lg),
          border: Border.all(color: VellinColors.line2),
          boxShadow: const [BoxShadow(color: Color(0x99000000), blurRadius: 28, offset: Offset(0, 12))],
        ),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 10, 12),
            child: Row(children: [
              const Expanded(
                child: Text('Уведомления',
                    style: TextStyle(color: VellinColors.text0, fontSize: 15, fontWeight: FontWeight.w600)),
              ),
              if (c.notifications.isNotEmpty)
                TextButton(
                  onPressed: c.markAllRead,
                  style: TextButton.styleFrom(
                    foregroundColor: VellinColors.text2,
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: const Text('Прочитать все', style: TextStyle(fontSize: 12)),
                ),
            ]),
          ),
          const Divider(height: 1, thickness: 1, color: VellinColors.line1),
          Flexible(
            child: c.notifications.isEmpty
                ? const Padding(
                    padding: EdgeInsets.symmetric(vertical: 36, horizontal: 16),
                    child: Text('Пока нет уведомлений',
                        textAlign: TextAlign.center, style: TextStyle(color: VellinColors.text3, fontSize: 13)),
                  )
                : ListView.builder(
                    shrinkWrap: true,
                    padding: const EdgeInsets.all(8),
                    itemCount: c.notifications.length,
                    itemBuilder: (_, i) => _NotificationTile(n: c.notifications[i], c: c),
                  ),
          ),
        ]),
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

    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      decoration: BoxDecoration(
        color: n.read ? Colors.transparent : VellinColors.bg2,
        borderRadius: BorderRadius.circular(VellinRadius.md),
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(VellinRadius.md),
        child: InkWell(
          borderRadius: BorderRadius.circular(VellinRadius.md),
          onTap: () => openNotification(n),
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              VellinAvatar(
                username: n.actor?.username ?? '?',
                avatarSeed: n.actor?.avatarSeed ?? '',
                avatarUrl: n.actor?.avatarUrl,
                size: 36,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(n.text,
                      style: const TextStyle(color: VellinColors.text0, fontSize: 13, height: 1.4)),
                  const SizedBox(height: 3),
                  Text(_timeAgo(n.createdAt),
                      style: const TextStyle(color: VellinColors.text3, fontSize: 11)),
                  if (isRequest) ...[
                    const SizedBox(height: 8),
                    Row(children: [
                      _SmallButton(
                        label: 'Принять',
                        primary: true,
                        onTap: busy ? null : () => c.respondToFriendRequest(n, accept: true),
                      ),
                      const SizedBox(width: 8),
                      _SmallButton(
                        label: 'Отклонить',
                        primary: false,
                        onTap: busy ? null : () => c.respondToFriendRequest(n, accept: false),
                      ),
                    ]),
                  ],
                ]),
              ),
              const SizedBox(width: 4),
              IconButton(
                icon: const Icon(Icons.close, size: 14, color: VellinColors.text3),
                tooltip: 'Убрать уведомление',
                visualDensity: VisualDensity.compact,
                constraints: const BoxConstraints.tightFor(width: 24, height: 24),
                padding: EdgeInsets.zero,
                onPressed: () => c.dismiss(n.id),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

class _SmallButton extends StatelessWidget {
  final String label;
  final bool primary;
  final VoidCallback? onTap;
  const _SmallButton({required this.label, required this.primary, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 28,
      child: primary
          ? FilledButton(
              onPressed: onTap,
              style: FilledButton.styleFrom(
                backgroundColor: VellinColors.accent,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(VellinRadius.sm)),
              ),
              child: Text(label),
            )
          : OutlinedButton(
              onPressed: onTap,
              style: OutlinedButton.styleFrom(
                foregroundColor: VellinColors.text1,
                side: const BorderSide(color: VellinColors.line2),
                padding: const EdgeInsets.symmetric(horizontal: 12),
                textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(VellinRadius.sm)),
              ),
              child: Text(label),
            ),
    );
  }
}
