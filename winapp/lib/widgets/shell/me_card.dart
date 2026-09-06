import 'package:flutter/widgets.dart';

import '../../models/models.dart';
import '../../theme/vellin_design.dart';
import '../../theme/vellin_glyphs.dart';
import '../ui/vellin_avatar.dart';
import '../ui/vellin_button.dart';
import '../ui/vellin_hover.dart';

/// Карточка «я» внизу левой панели: аватар с присутствием, имя, статус и
/// кнопка настроек.
class MeCard extends StatelessWidget {
  final AuthUser user;
  final VoidCallback onOpenSettings;
  final VoidCallback onOpenProfile;

  const MeCard({
    super.key,
    required this.user,
    required this.onOpenSettings,
    required this.onOpenProfile,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: const BoxDecoration(
        color: VellinColors.strip,
        border: Border(top: BorderSide(color: VellinColors.line05)),
      ),
      child: VellinInteractive(
        onTap: onOpenProfile,
        focusRadius: BorderRadius.circular(VellinRadius.raised),
        builder: (context, s) {
          final hot = s.hovered || s.pressed;
          return AnimatedContainer(
            duration: VellinMotion.hover,
            curve: VellinMotion.standard,
            padding: const EdgeInsets.fromLTRB(10, 9, 9, 9),
            decoration: BoxDecoration(
              color: VellinColors.surface,
              borderRadius: BorderRadius.circular(VellinRadius.raised),
              border: Border.all(color: hot ? VellinColors.line12 : VellinColors.line07),
            ),
            child: Row(
              children: [
                VellinAvatar(
                  username: user.username,
                  avatarUrl: user.avatarUrl,
                  size: 38,
                  presence: VellinPresence.online,
                  bedColor: VellinColors.surface,
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        user.username,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: VellinType.rowTitle.copyWith(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 2),
                      Text('В сети', style: VellinType.caption),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                VellinIconButton(
                  glyph: VellinGlyphs.settings,
                  onPressed: onOpenSettings,
                  size: 34,
                  radius: VellinRadius.field,
                  glyphSize: 16,
                  goldHover: true,
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
