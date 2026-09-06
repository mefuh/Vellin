import 'package:flutter/widgets.dart';

import '../../state/shell_controller.dart';
import '../../theme/vellin_design.dart';
import '../../theme/vellin_glyphs.dart';
import '../ui/vellin_hover.dart';
import '../ui/vellin_icon.dart';
import '../ui/vellin_surfaces.dart';

/// Рейл разделов: 68 в ширину, кнопки 44×44 без подписей.
///
/// Подписей нет намеренно: русские слова разной длины («Сообщения» против
/// «Друзья») тянули рейл за собой и вся раскладка ездила при переключении.
class VellinNavRail extends StatelessWidget {
  final RailSection section;
  final ValueChanged<RailSection> onSelect;

  /// Счётчики на кнопках: непрочитанные диалоги и необработанные заявки.
  final int unreadMessages;
  final int pendingRequests;

  const VellinNavRail({
    super.key,
    required this.section,
    required this.onSelect,
    this.unreadMessages = 0,
    this.pendingRequests = 0,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: VellinLayout.railWidth,
      decoration: const BoxDecoration(
        color: VellinColors.chrome,
        border: Border(right: BorderSide(color: VellinColors.line05)),
      ),
      child: Column(
        children: [
          const SizedBox(height: 18),
          _RailButton(
            glyph: VellinGlyphs.messages,
            selected: section == RailSection.messages,
            badge: unreadMessages,
            tooltip: 'Сообщения',
            onTap: () => onSelect(RailSection.messages),
          ),
          const SizedBox(height: 8),
          _RailButton(
            glyph: VellinGlyphs.friends,
            selected: section == RailSection.friends,
            badge: pendingRequests,
            tooltip: 'Друзья',
            onTap: () => onSelect(RailSection.friends),
          ),
          const SizedBox(height: 8),
          _RailButton(
            glyph: VellinGlyphs.calls,
            selected: section == RailSection.calls,
            tooltip: 'Звонки',
            onTap: () => onSelect(RailSection.calls),
          ),
        ],
      ),
    );
  }
}

class _RailButton extends StatelessWidget {
  final List<String> glyph;
  final bool selected;
  final int badge;
  final String tooltip;
  final VoidCallback onTap;

  const _RailButton({
    required this.glyph,
    required this.selected,
    required this.tooltip,
    required this.onTap,
    this.badge = 0,
  });

  @override
  Widget build(BuildContext context) {
    final br = BorderRadius.circular(VellinRadius.control);

    return SizedBox(
      width: VellinLayout.railWidth,
      height: VellinLayout.railButton,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.center,
        children: [
          // Полоска у левого края — метка выбранного раздела. Живёт всегда,
          // меняется только прозрачность: так она проявляется, а не прыгает.
          Positioned(
            left: -1,
            top: 13,
            child: AnimatedOpacity(
              duration: const Duration(milliseconds: 450),
              curve: VellinMotion.standard,
              opacity: selected ? 1 : 0,
              child: Container(
                width: 3,
                height: 18,
                decoration: const BoxDecoration(
                  color: VellinColors.accent,
                  borderRadius: BorderRadius.only(
                    topRight: Radius.circular(3),
                    bottomRight: Radius.circular(3),
                  ),
                ),
              ),
            ),
          ),
          VellinInteractive(
            onTap: onTap,
            focusRadius: br,
            builder: (context, s) {
              final hot = s.hovered || s.pressed;
              return AnimatedContainer(
                duration: VellinMotion.hover,
                curve: VellinMotion.standard,
                width: VellinLayout.railButton,
                height: VellinLayout.railButton,
                decoration: BoxDecoration(
                  color: selected
                      ? VellinColors.accentWash
                      : hot
                          ? VellinColors.fill055
                          : const Color(0x00000000),
                  borderRadius: br,
                  border: Border.all(
                    color: selected ? VellinColors.accentLine : const Color(0x00000000),
                  ),
                ),
                alignment: Alignment.center,
                child: VellinIcon(
                  glyph,
                  size: 18,
                  color: selected
                      ? VellinColors.accent
                      : hot
                          ? VellinColors.ink72
                          : VellinColors.ink45,
                ),
              );
            },
          ),
          if (badge > 0)
            Positioned(
              top: -3,
              right: 9,
              child: VellinBadge(
                count: badge,
                height: 17,
                fontSize: 10.5,
                bedColor: VellinColors.chrome,
              ),
            ),
        ],
      ),
    );
  }
}
