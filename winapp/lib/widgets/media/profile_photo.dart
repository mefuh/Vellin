import 'package:flutter/widgets.dart';

import '../../app_config.dart';
import 'lightbox.dart';

/// Открыть фотографию профиля тем же просмотрщиком, что и снимки в переписке.
///
/// Подпись отличает её от обычного фото: в лайтбоксе нет ни отправителя, ни
/// даты, и без неё непонятно, откуда снимок взялся.
///
/// Сам аватар делает нажимаемым `VellinAvatar.onOpenPhoto` — затемнение под
/// курсором там рисует сам круг аватара, поэтому расходиться с ним нечему.
void showProfilePhoto(
  BuildContext context, {
  required String username,
  required String? avatarUrl,
}) {
  final url = AppConfig.mediaUrl(avatarUrl);
  if (url == null) return;
  showVellinLightbox(
    context,
    images: [url],
    index: 0,
    caption: 'Фото профиля $username',
  );
}
