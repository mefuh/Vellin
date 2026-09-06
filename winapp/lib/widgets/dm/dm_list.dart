import 'package:flutter/widgets.dart';

import '../../models/dm.dart';
import '../../state/presence_controller.dart';
import '../../theme/vellin_design.dart';
import '../../theme/vellin_glyphs.dart';
import '../ui/vellin_avatar.dart';
import '../ui/vellin_hover.dart';
import '../ui/vellin_icon.dart';
import '../ui/vellin_surfaces.dart';

/// Список диалогов в левой панели.
class DmList extends StatelessWidget {
  final List<DmConversation> conversations;
  final String? activePublicId;
  final bool loading;
  final PresenceController presence;
  final ValueChanged<DmConversation> onOpen;

  const DmList({
    super.key,
    required this.conversations,
    required this.activePublicId,
    required this.loading,
    required this.presence,
    required this.onOpen,
  });

  @override
  Widget build(BuildContext context) {
    if (loading && conversations.isEmpty) return const _DmListSkeleton();

    if (conversations.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(horizontal: 10, vertical: 20),
        child: Text(
          'Нет диалогов',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontFamily: VellinType.family,
            fontSize: 12.5,
            color: VellinColors.ink32,
          ),
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      itemCount: conversations.length,
      itemBuilder: (_, i) {
        final c = conversations[i];
        return DmListRow(
          conversation: c,
          active: c.peer.publicId == activePublicId,
          online: presence.of(c.peer.id)?.online ?? c.online,
          onTap: () => onOpen(c),
        );
      },
    );
  }
}

/// Строка диалога: аватар, имя, превью с глифом, время и счётчик.
class DmListRow extends StatelessWidget {
  final DmConversation conversation;
  final bool active;
  final bool online;
  final VoidCallback onTap;

  const DmListRow({
    super.key,
    required this.conversation,
    required this.active,
    required this.online,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final c = conversation;
    final unread = c.unreadCount > 0;
    final br = BorderRadius.circular(VellinRadius.row);
    final missed = c.lastKind == DmPreviewKind.callMissed;

    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: VellinInteractive(
        onTap: onTap,
        focusRadius: br,
        builder: (context, s) {
          final hot = s.hovered || s.pressed;
          return AnimatedContainer(
            duration: VellinMotion.hover,
            curve: VellinMotion.standard,
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
            decoration: BoxDecoration(
              color: active
                  ? const Color(0x17E2C99B)
                  : hot
                      ? const Color(0x0AFFFFFF)
                      : const Color(0x00000000),
              borderRadius: br,
              border: Border.all(
                color: active ? const Color(0x2EE2C99B) : const Color(0x00000000),
              ),
            ),
            child: Row(
              children: [
                VellinAvatar(
                  username: c.peer.username,
                  avatarUrl: c.peer.avatarUrl,
                  size: 42,
                  presence: online ? VellinPresence.online : VellinPresence.offline,
                  bedColor: VellinColors.panel,
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              c.peer.username,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: unread ? VellinType.rowTitleUnread : VellinType.rowTitle,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(_shortTime(c.lastMessageAt), style: VellinType.time),
                        ],
                      ),
                      const SizedBox(height: 3),
                      Row(
                        children: [
                          if (_previewGlyph(c.lastKind) != null) ...[
                            VellinIcon(
                              _previewGlyph(c.lastKind)!,
                              size: 13,
                              box: _previewBox(c.lastKind),
                              color: missed
                                  ? VellinColors.danger
                                  : unread
                                      ? VellinColors.ink62
                                      : VellinColors.ink34,
                            ),
                            const SizedBox(width: 6),
                          ],
                          Expanded(
                            child: Text(
                              c.lastBody ?? '',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: VellinType.rowSub.copyWith(
                                color: missed
                                    ? VellinColors.danger
                                    : unread
                                        ? VellinColors.ink72
                                        : VellinColors.ink34,
                              ),
                            ),
                          ),
                          if (unread) ...[
                            const SizedBox(width: 8),
                            VellinBadge(count: c.unreadCount),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  static List<String>? _previewGlyph(DmPreviewKind kind) => switch (kind) {
        DmPreviewKind.text => null,
        DmPreviewKind.image => VellinGlyphs.image,
        DmPreviewKind.voice => VellinGlyphs.mic,
        DmPreviewKind.video => VellinGlyphs.camera,
        DmPreviewKind.invite => VellinGlyphs.screen,
        DmPreviewKind.call || DmPreviewKind.callMissed => VellinGlyphs.calls,
      };

  static Size _previewBox(DmPreviewKind kind) =>
      kind == DmPreviewKind.voice ? const Size(16, 16) : const Size(18, 18);
}

/// «Сегодня» показываем часами, вчерашнее — словом, дальше — датой.
String _shortTime(String iso) {
  final t = DateTime.tryParse(iso)?.toLocal();
  if (t == null) return '';
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final that = DateTime(t.year, t.month, t.day);
  final days = today.difference(that).inDays;
  if (days == 0) {
    return '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
  }
  if (days == 1) return 'вчера';
  const months = [
    'янв', 'фев', 'мар', 'апр', 'мая', 'июн',
    'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
  ];
  return '${t.day} ${months[t.month - 1]}';
}

/// Скелет списка: шесть строк той же формы, что приедут данные.
class _DmListSkeleton extends StatelessWidget {
  const _DmListSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      itemCount: 6,
      itemBuilder: (_, _) => const Padding(
        padding: EdgeInsets.symmetric(horizontal: 10, vertical: 9),
        child: Row(
          children: [
            VellinSkeleton.circle(42),
            SizedBox(width: 11),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                VellinSkeleton(width: 130, height: 10),
                SizedBox(height: 8),
                VellinSkeleton(width: 180, height: 9, color: Color(0xFF161413)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
