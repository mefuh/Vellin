import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:window_manager/window_manager.dart';
import '../app_config.dart';
import '../models/notification.dart';
import '../router.dart';
import '../state/dm_controller.dart';
import '../state/notifications_controller.dart';

/// Куда ведёт уведомление: общий переход и для панели колокольчика, и для
/// клика по системному тосту Windows. Работает через корневой навигатор,
/// поэтому вызываться может откуда угодно, в том числе из колбэка тоста, где
/// своего BuildContext нет.
Future<void> openNotification(AppNotification n) async {
  final context = rootNavigatorKey.currentContext;
  if (context == null || !context.mounted) return;

  context.read<NotificationsController>().closePanel();

  switch (n.type) {
    case NotificationTypes.directMessage:
      final publicId = n.actor?.publicId;
      if (publicId == null || publicId.isEmpty) return;
      // Прочтение диалога снимет уведомление через WS; убираем и локально сразу.
      context.read<NotificationsController>().dismiss(n.id);
      context.go('/messages');
      await context.read<DmController>().openThread(publicId);
      break;

    case NotificationTypes.roomInvite:
      // Комнат в десктоп-клиенте пока нет — открываем комнату на сайте.
      final slug = n.roomSlug;
      if (slug == null || slug.isEmpty) return;
      context.read<NotificationsController>().dismiss(n.id);
      await launchUrl(Uri.parse('${AppConfig.siteUrl}/room/$slug'), mode: LaunchMode.externalApplication);
      break;

    default:
      // Заявки в друзья и подтверждения — на профиль автора.
      final publicId = n.actor?.publicId;
      if (publicId == null || publicId.isEmpty) return;
      context.go('/u/$publicId');
  }
}

/// Развернуть и сфокусировать окно — при клике по системному тосту, когда
/// приложение свёрнуто или перекрыто.
Future<void> restoreWindow() async {
  if (await windowManager.isMinimized()) await windowManager.restore();
  await windowManager.show();
  await windowManager.focus();
}
