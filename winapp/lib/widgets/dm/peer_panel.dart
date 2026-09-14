import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import '../../api/dm_api.dart';
import '../../api/friends_api.dart';
import '../../app_config.dart';
import '../../models/dm.dart';
import '../../models/social.dart';
import '../../state/dm_controller.dart';
import '../../state/presence_controller.dart';
import '../../theme/vellin_design.dart';
import '../../theme/vellin_glyphs.dart';
import '../media/lightbox.dart';
import '../media/profile_photo.dart';
import '../ui/vellin_avatar.dart';
import '../ui/vellin_button.dart';
import '../ui/vellin_hover.dart';
import '../ui/vellin_icon.dart';
import '../ui/vellin_surfaces.dart';
import '../ui/vellin_toggle.dart';

/// Боковая панель собеседника: кто он, уведомления диалога и витрина
/// присланных снимков.
///
/// Живёт только внутри переписки и знает ровно один диалог — тот, что открыт.
/// Полный профиль отсюда открывается в правой области, панель для этого не
/// дублирует его целиком: здесь только то, что нужно по ходу разговора.
class PeerPanel extends StatefulWidget {
  final DmController dm;

  /// Чей мини-профиль показан. Приходит от переписки, а не из контроллера:
  /// диалоги сменяются в две фазы, и до самой подмены панель обязана
  /// оставаться при прежнем человеке.
  final String? publicId;

  final PublicUser? peer;
  final String? peerUserId;

  /// Уведомления этого диалога выключены.
  final bool muted;

  /// Открыть полный профиль собеседника.
  final VoidCallback onOpenProfile;

  /// Закрыть панель (крестик в её шапке).
  final VoidCallback onClose;

  const PeerPanel({
    super.key,
    required this.dm,
    required this.publicId,
    required this.peer,
    required this.peerUserId,
    required this.muted,
    required this.onOpenProfile,
    required this.onClose,
  });

  @override
  State<PeerPanel> createState() => _PeerPanelState();
}

class _PeerPanelState extends State<PeerPanel> {
  final _scroll = ScrollController();

  PublicProfile? _profile;
  bool _profileLoading = true;

  List<DmMediaItem> _media = [];
  bool _mediaLoading = true;
  bool _mediaMore = false;
  bool _loadingMore = false;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (!_scroll.hasClients) return;
      final p = _scroll.position;
      if (p.pixels >= p.maxScrollExtent - 240) _loadMore();
    });
    _load();
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  String? get _publicId => widget.publicId;

  Future<void> _load() async {
    final id = _publicId;
    if (id == null) return;
    final friends = context.read<FriendsApi>();
    final dmApi = context.read<DmApi>();

    unawaited(() async {
      try {
        final p = await friends.profile(id);
        if (mounted && _publicId == id) setState(() => _profile = p);
      } catch (_) {
        // Панель проживёт и без карточки: имя со статусом есть из треда.
      } finally {
        if (mounted) setState(() => _profileLoading = false);
      }
    }());

    try {
      final page = await dmApi.media(id);
      if (mounted && _publicId == id) {
        setState(() {
          _media = page.items;
          _mediaMore = page.hasMore;
        });
      }
    } catch (_) {
      // Витрина останется пустой — отдельного экрана ошибки у неё нет.
    } finally {
      if (mounted) setState(() => _mediaLoading = false);
    }
  }

  Future<void> _loadMore() async {
    final id = _publicId;
    if (id == null || _loadingMore || !_mediaMore || _media.isEmpty) return;
    setState(() => _loadingMore = true);
    try {
      final page = await context.read<DmApi>().media(id, before: _media.last.createdAt);
      if (mounted && _publicId == id) {
        final seen = _media.map((m) => m.url).toSet();
        setState(() {
          _media = [..._media, ...page.items.where((m) => !seen.contains(m.url))];
          _mediaMore = page.hasMore;
        });
      }
    } catch (_) {
      // Следующая прокрутка попробует снова.
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  /// Витрина вместе со снимками, пришедшими уже при открытой панели: страницу
  /// ради них не перезапрашиваем, берём из самой ленты.
  List<DmMediaItem> get _shown {
    // Лента в контроллере одна и уже может принадлежать другому диалогу —
    // тогда брать из неё нечего, витрина живёт своей страницей.
    if (widget.dm.activePeerPublicId != widget.publicId) return _media;
    final fresh = <DmMediaItem>[];
    final seen = _media.map((m) => m.url).toSet();
    for (final m in widget.dm.activeMessages.reversed) {
      for (final img in m.images) {
        if (img.url.isEmpty || !seen.add(img.url)) continue;
        fresh.add(DmMediaItem(
          messageId: m.id,
          url: img.url,
          width: img.width,
          height: img.height,
          senderId: m.senderId,
          createdAt: m.createdAt,
        ));
      }
    }
    if (fresh.isEmpty) return _media;
    // Свежие — сверху, в том же порядке «новые первыми», что и страница.
    return [...fresh, ..._media];
  }

  void _openShot(List<DmMediaItem> items, int index) {
    final urls = items.map((m) => AppConfig.mediaUrl(m.url)).whereType<String>().toList();
    if (urls.isEmpty) return;
    showVellinLightbox(context, images: urls, index: index.clamp(0, urls.length - 1));
  }

  @override
  Widget build(BuildContext context) {
    final dm = context.watch<DmController>();
    final presence = context.watch<PresenceController>();
    final peer = widget.peer;
    final peerId = widget.peerUserId;
    final info = peerId != null ? presence.of(peerId) : null;
    final state = presenceFromStatus(info?.status);
    final items = _shown;

    return Container(
      decoration: const BoxDecoration(
        color: VellinColors.panel,
        border: Border(left: BorderSide(color: VellinColors.line05)),
      ),
      child: Column(
        children: [
          _PanelBar(onClose: widget.onClose),
          Expanded(
            child: CustomScrollView(
              controller: _scroll,
              slivers: [
                SliverToBoxAdapter(
                  child: _Appear(
                    order: 0,
                    child: _Identity(
                      peer: peer,
                      presence: state,
                      lastSeenAt: info?.lastSeenAt,
                      onOpenProfile: widget.onOpenProfile,
                    ),
                  ),
                ),
                SliverToBoxAdapter(
                  child: _Appear(
                    order: 1,
                    child: _NotificationsRow(
                      muted: widget.muted,
                      onChanged: (on) => dm.setMuted(!on),
                    ),
                  ),
                ),
                SliverToBoxAdapter(
                  child: _Appear(
                    order: 2,
                    child: _Facts(profile: _profile, loading: _profileLoading),
                  ),
                ),
                SliverToBoxAdapter(
                  child: _Appear(
                    order: 3,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 22, 16, 12),
                      child: VellinSectionTitle(
                        items.isEmpty ? 'Вложения' : 'Вложения · ${items.length}',
                      ),
                    ),
                  ),
                ),
                if (_mediaLoading)
                  const SliverToBoxAdapter(child: _MediaSkeleton())
                else if (items.isEmpty)
                  const SliverToBoxAdapter(child: _NoMedia())
                else
                  SliverPadding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    sliver: SliverGrid(
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 3,
                        mainAxisSpacing: 4,
                        crossAxisSpacing: 4,
                      ),
                      delegate: SliverChildBuilderDelegate(
                        (context, i) => _Shot(
                          key: ValueKey(items[i].url),
                          item: items[i],
                          order: i,
                          onTap: () => _openShot(items, i),
                        ),
                        childCount: items.length,
                      ),
                    ),
                  ),
                const SliverToBoxAdapter(child: SizedBox(height: 28)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Шапка панели: название и крестик.
class _PanelBar extends StatelessWidget {
  final VoidCallback onClose;
  const _PanelBar({required this.onClose});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: VellinLayout.chatHeader,
      padding: const EdgeInsets.fromLTRB(16, 0, 10, 0),
      decoration: const BoxDecoration(
        color: VellinColors.strip,
        border: Border(bottom: BorderSide(color: VellinColors.line05)),
      ),
      child: Row(
        children: [
          Expanded(child: Text('О собеседнике', style: VellinType.chatName)),
          VellinIconButton(
            glyph: VellinGlyphs.closeSmall,
            onPressed: onClose,
            size: 30,
            radius: VellinRadius.button,
            glyphSize: 11,
            glyphBox: const Size(11, 11),
            filled: false,
            tooltip: 'Скрыть панель',
          ),
        ],
      ),
    );
  }
}

/// Аватар, имя, полный статус и вход в профиль.
class _Identity extends StatelessWidget {
  final PublicUser? peer;
  final VellinPresence presence;
  final String? lastSeenAt;
  final VoidCallback onOpenProfile;

  const _Identity({
    required this.peer,
    required this.presence,
    required this.lastSeenAt,
    required this.onOpenProfile,
  });

  @override
  Widget build(BuildContext context) {
    final status = switch (presence) {
      VellinPresence.online => 'в сети',
      VellinPresence.dnd => 'не беспокоить',
      VellinPresence.offline => presenceLabel(online: false, lastSeenAt: lastSeenAt),
    };
    final color = switch (presence) {
      VellinPresence.online => const Color(0xE693B08A),
      VellinPresence.dnd => const Color(0xCCD6AE6E),
      VellinPresence.offline => VellinColors.ink34,
    };

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 22, 16, 0),
      child: Column(
        children: [
          Builder(
            builder: (context) => VellinAvatar(
              username: peer?.username ?? '',
              avatarUrl: peer?.avatarUrl,
              size: 88,
              presence: presence,
              bedColor: VellinColors.panel,
              onOpenPhoto: () => showProfilePhoto(
                context,
                username: peer?.username ?? '',
                avatarUrl: peer?.avatarUrl,
              ),
            ),
          ),
          const SizedBox(height: 14),
          Text(
            peer?.username ?? '',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: VellinType.displayName.copyWith(fontSize: 19),
          ),
          const SizedBox(height: 5),
          Text(status, style: VellinType.caption.copyWith(color: color)),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: VellinButton(
              label: 'Профиль',
              glyph: VellinGlyphs.profile,
              onPressed: onOpenProfile,
            ),
          ),
        ],
      ),
    );
  }
}

/// Уведомления этого диалога. Выключенные гасят звук и всплывающее окно —
/// сами сообщения приходят как обычно, поэтому подпись говорит именно об этом.
class _NotificationsRow extends StatelessWidget {
  final bool muted;
  final ValueChanged<bool> onChanged;

  const _NotificationsRow({required this.muted, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 11, 12, 11),
        decoration: BoxDecoration(
          color: VellinColors.fill045,
          borderRadius: BorderRadius.circular(VellinRadius.card),
          border: Border.all(color: VellinColors.line06),
        ),
        child: Row(
          children: [
            // Колокольчик меняется вместе с переключателем, двумя фазами:
            // прежний гаснет, перечёркнутый приходит.
            AnimatedSwitcher(
              duration: VellinMotion.hover,
              switchInCurve: VellinMotion.standard,
              switchOutCurve: VellinMotion.standard,
              child: VellinIcon(
                muted ? VellinGlyphs.bellOff : VellinGlyphs.bell,
                key: ValueKey(muted),
                size: 16,
                color: muted ? VellinColors.ink34 : VellinColors.ink72,
              ),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Уведомления', style: VellinType.body.copyWith(height: 1.3)),
                  const SizedBox(height: 3),
                  Text(
                    muted ? 'Беззвучно, без всплывающих окон' : 'Звук и всплывающие окна',
                    style: VellinType.caption,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            VellinToggle(value: !muted, onChanged: onChanged),
          ],
        ),
      ),
    );
  }
}

/// Краткие сведения из профиля: день рождения, «о себе», идентификатор.
class _Facts extends StatelessWidget {
  final PublicProfile? profile;
  final bool loading;

  const _Facts({required this.profile, required this.loading});

  @override
  Widget build(BuildContext context) {
    if (loading && profile == null) {
      return const Padding(
        padding: EdgeInsets.fromLTRB(16, 22, 16, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            VellinSkeleton(width: 120, height: 10),
            SizedBox(height: 12),
            VellinSkeleton(width: 180, height: 10, color: Color(0xFF161413)),
          ],
        ),
      );
    }

    final p = profile;
    final rows = <(String, String)>[
      if (p?.birthDate != null) ('День рождения', _birth(p!.birthDate!)),
      if ((p?.bio ?? '').trim().isNotEmpty) ('О себе', p!.bio!.trim()),
      if ((p?.user.publicId ?? '').isNotEmpty) ('Идентификатор', '@${p!.user.publicId}'),
    ];
    if (rows.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 22, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0) const SizedBox(height: 14),
            Text(rows[i].$1, style: VellinType.caption.copyWith(color: VellinColors.ink34)),
            const SizedBox(height: 4),
            Text(
              rows[i].$2,
              style: VellinType.body.copyWith(fontSize: 13, height: 1.5, color: VellinColors.ink82),
            ),
          ],
        ],
      ),
    );
  }

  static String _birth(String iso) {
    final d = DateTime.tryParse(iso);
    if (d == null) return '';
    const months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
    ];
    return '${d.day} ${months[d.month - 1]} ${d.year}';
  }
}

/// Один снимок витрины: приходит лесенкой за соседом, при наведении чуть
/// приближается внутри своей рамки.
class _Shot extends StatefulWidget {
  final DmMediaItem item;
  final int order;
  final VoidCallback onTap;

  const _Shot({super.key, required this.item, required this.order, required this.onTap});

  @override
  State<_Shot> createState() => _ShotState();
}

class _ShotState extends State<_Shot> with SingleTickerProviderStateMixin {
  late final AnimationController _in = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 420),
  );

  @override
  void initState() {
    super.initState();
    // Лесенка только у первых рядов: на сотне снимков ожидание стало бы
    // заметной паузой вместо оживления.
    final delay = VellinMotion.stagger * (widget.order < 12 ? widget.order : 0);
    Future<void>.delayed(delay, () {
      if (mounted) _in.forward();
    });
  }

  @override
  void dispose() {
    _in.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final url = AppConfig.mediaUrl(widget.item.url);

    return AnimatedBuilder(
      animation: _in,
      builder: (context, child) {
        final t = VellinMotion.standard.transform(_in.value);
        return Opacity(
          opacity: t,
          child: Transform.scale(scale: 0.94 + 0.06 * t, child: child),
        );
      },
      child: VellinInteractive(
        onTap: widget.onTap,
        cursor: SystemMouseCursors.click,
        focusRadius: BorderRadius.circular(8),
        builder: (context, s) => ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: ColoredBox(
            color: VellinColors.bg5,
            child: url == null
                ? const SizedBox.expand()
                : AnimatedScale(
                    duration: VellinMotion.hover,
                    curve: VellinMotion.standard,
                    scale: s.hovered || s.pressed ? 1.06 : 1,
                    child: Image.network(
                      url,
                      fit: BoxFit.cover,
                      width: double.infinity,
                      height: double.infinity,
                      frameBuilder: (context, child, frame, sync) => AnimatedOpacity(
                        duration: VellinMotion.hover,
                        curve: VellinMotion.standard,
                        opacity: frame == null && !sync ? 0 : 1,
                        child: child,
                      ),
                      errorBuilder: (_, _, _) => const SizedBox.expand(),
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}

/// Витрина на загрузке: те же плитки, что приедут, а не крутящийся кружок.
class _MediaSkeleton extends StatelessWidget {
  const _MediaSkeleton();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: GridView.count(
        crossAxisCount: 3,
        mainAxisSpacing: 4,
        crossAxisSpacing: 4,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        children: [
          for (var i = 0; i < 6; i++)
            VellinSkeleton(
              width: double.infinity,
              height: double.infinity,
              radius: 8,
              // Через одну плитка глуше: ровная сетка одинаковых пятен читается
              // как ошибка отрисовки, а не как ожидание.
              color: i.isEven ? const Color(0xFF1B1918) : const Color(0xFF161413),
            ),
        ],
      ),
    );
  }
}

class _NoMedia extends StatelessWidget {
  const _NoMedia();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          VellinIcon(VellinGlyphs.image, size: 18, color: VellinColors.ink24),
          const SizedBox(height: 10),
          Text(
            'Фотографий в этом диалоге пока нет',
            style: VellinType.caption.copyWith(color: VellinColors.ink34, height: 1.5),
          ),
        ],
      ),
    );
  }
}

/// Появление блока панели лесенкой: та же кривая и тот же сдвиг, что у
/// остальных списков клиента.
class _Appear extends StatefulWidget {
  final int order;
  final Widget child;

  const _Appear({required this.order, required this.child});

  @override
  State<_Appear> createState() => _AppearState();
}

class _AppearState extends State<_Appear> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: VellinMotion.state,
  );

  @override
  void initState() {
    super.initState();
    Future<void>.delayed(VellinMotion.stagger * widget.order, () {
      if (mounted) _c.forward();
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, child) {
        final t = VellinMotion.standard.transform(_c.value);
        return Opacity(
          opacity: t,
          child: Transform.translate(offset: Offset(0, 10 * (1 - t)), child: child),
        );
      },
      child: widget.child,
    );
  }
}
