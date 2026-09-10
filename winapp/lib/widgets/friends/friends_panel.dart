import 'package:flutter/widgets.dart';

import '../../models/social.dart';
import '../../state/friends_controller.dart';
import '../../state/presence_controller.dart';
import '../../theme/vellin_design.dart';
import '../../theme/vellin_glyphs.dart';
import '../ui/vellin_avatar.dart';
import '../ui/vellin_button.dart';
import '../ui/vellin_hover.dart';
import '../ui/vellin_surfaces.dart';

/// Вкладка списка друзей.
enum FriendsTab { all, online, requests }

/// Список друзей и заявок в левой панели.
class FriendsPanel extends StatelessWidget {
  final FriendsController friends;
  final PresenceController presence;
  final FriendsTab tab;
  final String query;

  /// Найденные поиском люди (пусто — поиск не запускали).
  final List<SearchUser> searchResults;
  final bool searching;

  final void Function(PublicUser user) onMessage;
  final void Function(PublicUser user) onCall;
  final void Function(PublicUser user) onOpenProfile;
  final void Function(FriendRequest request, bool accept) onRespond;
  final void Function(PublicUser user) onAdd;

  const FriendsPanel({
    super.key,
    required this.friends,
    required this.presence,
    required this.tab,
    required this.query,
    required this.searchResults,
    required this.searching,
    required this.onMessage,
    required this.onCall,
    required this.onOpenProfile,
    required this.onRespond,
    required this.onAdd,
  });

  @override
  Widget build(BuildContext context) {
    if (query.isNotEmpty) return _searchList();

    if (tab == FriendsTab.requests) {
      final incoming = friends.incoming;
      final outgoing = friends.outgoing;
      if (incoming.isEmpty && outgoing.isEmpty) {
        return const _Empty('Заявок нет');
      }
      return ListView(
        padding: const EdgeInsets.symmetric(horizontal: 10),
        children: [
          if (incoming.isNotEmpty) ...[
            _GroupLabel('Входящие', incoming.length),
            for (final r in incoming)
              _PersonRow(
                user: r.user,
                subtitle: 'хочет добавить вас в друзья',
                presence: presenceFromStatus(presence.of(r.user.id)?.status),
                onTap: () => onOpenProfile(r.user),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    VellinIconButton(
                      glyph: VellinGlyphs.check,
                      onPressed: () => onRespond(r, true),
                      size: 30,
                      radius: VellinRadius.mini,
                      glyphSize: 15,
                      goldHover: true,
                      color: VellinColors.accent,
                    ),
                    const SizedBox(width: 6),
                    VellinIconButton(
                      glyph: VellinGlyphs.cross,
                      onPressed: () => onRespond(r, false),
                      size: 30,
                      radius: VellinRadius.mini,
                      glyphSize: 15,
                    ),
                  ],
                ),
              ),
          ],
          if (outgoing.isNotEmpty) ...[
            _GroupLabel('Исходящие', outgoing.length),
            for (final r in outgoing)
              _PersonRow(
                user: r.user,
                subtitle: 'заявка отправлена',
                presence: presenceFromStatus(presence.of(r.user.id)?.status),
                onTap: () => onOpenProfile(r.user),
                trailing: const _WaitingPill(),
              ),
          ],
        ],
      );
    }

    // «В сети» — только зелёный статус: отошедших этот таб не показывает,
    // иначе он ничем не отличался бы от «Все».
    final list = tab == FriendsTab.online
        ? friends.friends
            .where((f) => (presence.of(f.user.id)?.status ?? (f.online ? 'online' : 'offline')) == 'online')
            .toList()
        : friends.friends;

    if (friends.loading && friends.friends.isEmpty) return const _FriendsSkeleton();
    if (list.isEmpty) {
      return _Empty(tab == FriendsTab.online ? 'Никого нет в сети' : 'Пока никого');
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      itemCount: list.length,
      itemBuilder: (context, i) {
        final f = list[i];
        final info = presence.of(f.user.id);
        final state = presenceFromStatus(info?.status ?? (f.online ? 'online' : 'offline'));
        return _PersonRow(
          user: f.user,
          subtitle: switch (state) {
            VellinPresence.online => 'в сети',
            VellinPresence.dnd => 'не беспокоить',
            VellinPresence.offline =>
              presenceLabel(online: false, lastSeenAt: info?.lastSeenAt ?? f.lastSeenAt),
          },
          presence: state,
          onTap: () => onOpenProfile(f.user),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              VellinIconButton(
                glyph: VellinGlyphs.messages,
                onPressed: () => onMessage(f.user),
                size: 30,
                radius: VellinRadius.mini,
                glyphSize: 15,
              ),
              const SizedBox(width: 6),
              VellinIconButton(
                glyph: VellinGlyphs.calls,
                onPressed: () => onCall(f.user),
                size: 30,
                radius: VellinRadius.mini,
                glyphSize: 15,
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _searchList() {
    if (searching) return const _FriendsSkeleton();
    if (searchResults.isEmpty) return const _Empty('Никого не нашли');

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      itemCount: searchResults.length,
      itemBuilder: (context, i) {
        final r = searchResults[i];
        return _PersonRow(
          user: r.user,
          subtitle: _relationLabel(r.relationship),
          presence: presenceFromStatus(presence.of(r.user.id)?.status),
          onTap: () => onOpenProfile(r.user),
          trailing: r.relationship == 'none'
              ? VellinIconButton(
                  glyph: VellinGlyphs.check,
                  onPressed: () => onAdd(r.user),
                  size: 30,
                  radius: VellinRadius.mini,
                  glyphSize: 15,
                  goldHover: true,
                )
              : null,
        );
      },
    );
  }

  static String _relationLabel(String relationship) => switch (relationship) {
        'friends' => 'в друзьях',
        'outgoing' => 'заявка отправлена',
        'incoming' => 'ждёт вашего ответа',
        'blocked' => 'заблокирован',
        'self' => 'это вы',
        _ => '',
      };
}

/// Табы разделов «Друзей».
class FriendsTabs extends StatelessWidget {
  final FriendsTab tab;
  final int requests;
  final ValueChanged<FriendsTab> onSelect;

  const FriendsTabs({
    super.key,
    required this.tab,
    required this.requests,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        VellinPill(
          label: 'Все',
          selected: tab == FriendsTab.all,
          onTap: () => onSelect(FriendsTab.all),
        ),
        const SizedBox(width: 8),
        VellinPill(
          label: 'В сети',
          selected: tab == FriendsTab.online,
          onTap: () => onSelect(FriendsTab.online),
        ),
        const SizedBox(width: 8),
        VellinPill(
          label: requests > 0 ? 'Заявки · $requests' : 'Заявки',
          selected: tab == FriendsTab.requests,
          onTap: () => onSelect(FriendsTab.requests),
        ),
      ],
    );
  }
}

class _PersonRow extends StatelessWidget {
  final PublicUser user;
  final String subtitle;
  final VellinPresence presence;
  final Widget? trailing;
  final VoidCallback onTap;

  const _PersonRow({
    required this.user,
    required this.subtitle,
    required this.presence,
    required this.onTap,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    final br = BorderRadius.circular(VellinRadius.row);

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
              color: hot ? const Color(0x0AFFFFFF) : const Color(0x00000000),
              borderRadius: br,
            ),
            child: Row(
              children: [
                VellinAvatar(
                  username: user.username,
                  avatarUrl: user.avatarUrl,
                  size: 40,
                  presence: presence,
                  bedColor: VellinColors.panel,
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user.username,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: VellinType.rowTitle,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: VellinType.caption,
                      ),
                    ],
                  ),
                ),
                if (trailing != null) ...[const SizedBox(width: 8), trailing!],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _WaitingPill extends StatelessWidget {
  const _WaitingPill();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: const Color(0x0AFFFFFF),
        borderRadius: BorderRadius.circular(VellinRadius.pill),
        border: Border.all(color: const Color(0x14FFFFFF)),
      ),
      child: Text('Ждёт', style: VellinType.caption.copyWith(color: VellinColors.ink55)),
    );
  }
}

class _GroupLabel extends StatelessWidget {
  final String label;
  final int count;
  const _GroupLabel(this.label, this.count);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 14, 10, 6),
      child: Row(
        children: [
          Text(label.toUpperCase(), style: VellinType.groupLabel),
          const SizedBox(width: 8),
          Text(
            '$count',
            style: VellinType.groupLabel.copyWith(
              color: VellinColors.ink24,
              fontFeatures: VellinType.tabular,
            ),
          ),
        ],
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  final String label;
  const _Empty(this.label);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 20),
      child: Text(
        label,
        textAlign: TextAlign.center,
        style: VellinType.caption.copyWith(fontSize: 12.5),
      ),
    );
  }
}

class _FriendsSkeleton extends StatelessWidget {
  const _FriendsSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      itemCount: 6,
      itemBuilder: (_, _) => const Padding(
        padding: EdgeInsets.symmetric(horizontal: 10, vertical: 9),
        child: Row(
          children: [
            VellinSkeleton.circle(40),
            SizedBox(width: 11),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                VellinSkeleton(width: 120, height: 10),
                SizedBox(height: 8),
                VellinSkeleton(width: 80, height: 9, color: Color(0xFF161413)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
