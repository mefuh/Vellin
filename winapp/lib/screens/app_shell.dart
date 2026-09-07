import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import '../api/friends_api.dart';
import '../app_config.dart';
import '../models/social.dart';
import '../state/auth_controller.dart';
import '../state/call_controller.dart';
import '../state/dm_controller.dart';
import '../state/friends_controller.dart';
import '../state/playback_controller.dart';
import '../state/presence_controller.dart';
import '../state/shell_controller.dart';
import '../theme/vellin_design.dart';
import '../widgets/dm/chat_pane.dart';
import '../widgets/dm/dm_list.dart';
import '../widgets/dm/mini_player.dart';
import '../widgets/friends/friends_panel.dart';
import '../widgets/media/lightbox.dart';
import '../widgets/shell/me_card.dart';
import '../widgets/shell/nav_rail.dart';
import '../widgets/shell/panel_header.dart';
import '../widgets/shell/phase_switch.dart';

/// Каркас авторизованной части: рейл 68 · левая панель 344 · правая область.
///
/// Раздел рейла меняет только левую панель — открытый диалог в правой области
/// при переключении разделов остаётся на месте.
class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> with WidgetsBindingObserver {
  DmController? _dm;
  PresenceController? _presence;

  final _dmSearch = TextEditingController();
  final _friendsSearch = TextEditingController();
  String _dmQuery = '';
  String _friendsQuery = '';
  FriendsTab _friendsTab = FriendsTab.all;

  List<SearchUser> _searchResults = [];
  bool _searching = false;
  Timer? _searchDebounce;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final user = context.read<AuthController>().user;
      if (user == null) return;
      _dm = context.read<DmController>()..start(user.id);
      _presence = context.read<PresenceController>()
        ..start()
        ..setActive(true);
      context.read<FriendsController>().load();
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Свёрнуто/на фоне → офлайн для собеседников; развёрнуто → снова в сети.
    _presence?.setActive(state == AppLifecycleState.resumed);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _searchDebounce?.cancel();
    _dmSearch.dispose();
    _friendsSearch.dispose();
    _dm?.stop();
    _presence?.stop();
    super.dispose();
  }

  void _onFriendsSearch(String q) {
    setState(() => _friendsQuery = q.trim());
    _searchDebounce?.cancel();
    if (_friendsQuery.length < 2) {
      setState(() {
        _searchResults = [];
        _searching = false;
      });
      return;
    }
    setState(() => _searching = true);
    // Ждём паузы в наборе: иначе на каждое нажатие уходит запрос.
    _searchDebounce = Timer(const Duration(milliseconds: 320), () async {
      try {
        final res = await context.read<FriendsApi>().search(_friendsQuery);
        if (mounted) {
          setState(() {
            _searchResults = res;
            _searching = false;
          });
        }
      } catch (_) {
        if (mounted) setState(() => _searching = false);
      }
    });
  }

  void _openChat(String publicId) {
    context.read<DmController>().openThread(publicId);
    context.read<ShellController>().showChat();
  }

  @override
  Widget build(BuildContext context) {
    final shell = context.watch<ShellController>();
    final dm = context.watch<DmController>();
    final friends = context.watch<FriendsController>();
    final user = context.watch<AuthController>().user;

    final narrow = MediaQuery.sizeOf(context).width < VellinLayout.breakpoint;
    final panelWidth = narrow ? VellinLayout.panelWidthNarrow : VellinLayout.panelWidth;

    return ColoredBox(
      color: VellinColors.bg1,
      child: Row(
        children: [
          VellinNavRail(
            section: shell.section,
            onSelect: shell.selectSection,
            unreadMessages: dm.unreadTotal,
            pendingRequests: friends.incoming.length,
          ),
          SizedBox(
            width: panelWidth,
            child: Container(
              decoration: const BoxDecoration(
                color: VellinColors.panel,
                border: Border(right: BorderSide(color: VellinColors.line05)),
              ),
              child: Column(
                children: [
                  Expanded(
                    // Раздел меняется в две фазы: прежний список уезжает и
                    // гаснет, и только потом монтируется новый.
                    child: PhaseSwitch(
                      phaseKey: shell.section,
                      child: _panelBody(shell, dm, friends),
                    ),
                  ),
                  if (user != null)
                    MeCard(
                      user: user,
                      onOpenSettings: () => shell.openSettings(),
                      onOpenProfile: () => shell.showProfile(null),
                    ),
                ],
              ),
            ),
          ),
          Expanded(child: _rightWithPlayer(shell, dm)),
        ],
      ),
    );
  }

  Widget _panelBody(ShellController shell, DmController dm, FriendsController friends) {
    switch (shell.section) {
      case RailSection.messages:
        final list = _dmQuery.isEmpty
            ? dm.conversations
            : dm.conversations
                .where((c) => c.peer.username.toLowerCase().contains(_dmQuery.toLowerCase()))
                .toList();
        return Column(
          key: const ValueKey('messages'),
          children: [
            PanelHeader(
              title: 'Сообщения',
              counter: dm.unreadTotal > 0 ? '${dm.unreadTotal} непрочитанных' : null,
              searchController: _dmSearch,
              searchPlaceholder: 'Поиск по диалогам',
              onSearch: (q) => setState(() => _dmQuery = q.trim()),
            ),
            Expanded(
              child: DmList(
                conversations: list,
                activePublicId: dm.activePeerPublicId,
                loading: dm.loadingConversations,
                presence: context.watch<PresenceController>(),
                onOpen: (c) => _openChat(c.peer.publicId),
              ),
            ),
          ],
        );

      case RailSection.friends:
        return Column(
          key: const ValueKey('friends'),
          children: [
            PanelHeader(
              title: 'Друзья',
              counter: friends.friends.isNotEmpty ? '${friends.friends.length} в друзьях' : null,
              searchController: _friendsSearch,
              searchPlaceholder: 'Найти человека',
              onSearch: _onFriendsSearch,
              footer: FriendsTabs(
                tab: _friendsTab,
                requests: friends.incoming.length,
                onSelect: (t) => setState(() => _friendsTab = t),
              ),
            ),
            Expanded(
              child: FriendsPanel(
                friends: friends,
                presence: context.watch<PresenceController>(),
                tab: _friendsTab,
                query: _friendsQuery,
                searchResults: _searchResults,
                searching: _searching,
                onMessage: (u) => _openChat(u.publicId),
                onCall: (u) => context.read<CallController>().invite(u.id, video: false),
                onOpenProfile: (u) => context.read<ShellController>().showProfile(u.publicId),
                onRespond: (r, accept) async {
                  final c = context.read<FriendsController>();
                  if (accept) {
                    await c.accept(r.id);
                  } else {
                    await c.decline(r.id);
                  }
                },
                onAdd: (u) async {
                  await context.read<FriendsController>().sendRequest(userId: u.id);
                  if (mounted) _onFriendsSearch(_friendsQuery);
                },
              ),
            ),
          ],
        );

      case RailSection.calls:
        return Column(
          key: const ValueKey('calls'),
          children: [
            PanelHeader(
              title: 'Звонки',
              searchController: TextEditingController(),
              searchPlaceholder: 'Поиск по звонкам',
            ),
            const Expanded(
              child: Padding(
                padding: EdgeInsets.symmetric(horizontal: 10, vertical: 20),
                child: Text(
                  'История звонков появится здесь',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontFamily: VellinType.family,
                    fontSize: 12.5,
                    color: VellinColors.ink32,
                  ),
                ),
              ),
            ),
          ],
        );
    }
  }

  /// Правая область вместе с мини-плеером: в своём чате он висит пилюлей над
  /// лентой, вне его — доком, который сдвигает содержимое вниз.
  Widget _rightWithPlayer(ShellController shell, DmController dm) {
    final playback = context.watch<PlaybackController>();
    final item = playback.item;
    final own = item != null &&
        shell.pane == RightPaneKind.chat &&
        item.peerPublicId == dm.activePeerPublicId;

    return Stack(
      children: [
        Column(
          children: [
            if (item != null && !own) MiniPlayer(openPeerPublicId: dm.activePeerPublicId),
            Expanded(child: _rightArea(shell, dm)),
          ],
        ),
        if (own)
          Positioned(
            top: VellinLayout.chatHeader + 8,
            left: 0,
            right: 0,
            child: MiniPlayer(openPeerPublicId: dm.activePeerPublicId),
          ),
      ],
    );
  }

  Widget _rightArea(ShellController shell, DmController dm) {
    switch (shell.pane) {
      case RightPaneKind.chat:
        if (dm.activePeerPublicId == null) return const _EmptyRight();
        return ChatPane(
          key: ValueKey(dm.activePeerPublicId),
          dm: dm,
          onOpenProfile: () => shell.showProfile(dm.activePeerPublicId),
          onOpenImage: (url) {
            // Листать можно по всем картинкам переписки, а не только по той,
            // на которую нажали.
            final images = dm.activeMessages
                .where((m) => m.imageUrl != null)
                .map((m) => AppConfig.mediaUrl(m.imageUrl))
                .whereType<String>()
                .toList();
            final at = images.indexOf(url);
            showVellinLightbox(context, images: images, index: at < 0 ? 0 : at);
          },
        );
      case RightPaneKind.profile:
      case RightPaneKind.empty:
        return const _EmptyRight();
    }
  }
}

/// Правая область без открытого диалога.
class _EmptyRight extends StatelessWidget {
  const _EmptyRight();

  @override
  Widget build(BuildContext context) {
    return const ColoredBox(
      color: VellinColors.bg1,
      child: Center(
        child: Text(
          'Выберите диалог',
          style: TextStyle(
            fontFamily: VellinType.family,
            fontSize: 13,
            color: VellinColors.ink28,
          ),
        ),
      ),
    );
  }
}
