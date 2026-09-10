import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import '../api/dm_api.dart';
import '../api/friends_api.dart';
import '../app_config.dart';
import '../models/call_history.dart';
import '../models/social.dart';
import '../state/auth_controller.dart';
import '../state/call_controller.dart';
import '../state/dm_controller.dart';
import '../state/friends_controller.dart';
import '../state/notifications_controller.dart';
import '../state/playback_controller.dart';
import '../state/presence_controller.dart';
import '../state/shell_controller.dart';
import '../theme/vellin_design.dart';
import 'profile_pane.dart';
import '../widgets/calls/calls_panel.dart';
import '../widgets/dm/chat_pane.dart';
import '../widgets/dm/circle_pip.dart';
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

  final _callsSearch = TextEditingController();
  String _callsQuery = '';
  List<CallHistoryEntry> _calls = [];
  bool _callsLoading = false;
  bool _callsLoaded = false;

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
    _callsSearch.dispose();
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

  /// История звонков грузится при первом заходе в раздел, а не на старте:
  /// большинству сеансов она не нужна.
  Future<void> _loadCalls({bool force = false}) async {
    if (_callsLoading || (_callsLoaded && !force)) return;
    setState(() => _callsLoading = true);
    try {
      final res = await context.read<DmApi>().callHistory();
      if (mounted) {
        setState(() {
          _calls = res.calls;
          _callsLoaded = true;
        });
      }
    } catch (_) {
      // Раздел покажет пустое состояние — отдельного экрана ошибки у панели нет.
    } finally {
      if (mounted) setState(() => _callsLoading = false);
    }
  }

  void _openChat(String publicId) {
    context.read<DmController>().openThread(publicId);
    context.read<ShellController>().showChat();
  }

  /// Выход: сначала гасим живые каналы, потом сбрасываем сессию — иначе
  /// сокет успевает отвалиться уже после смены окна и роняет лишние ошибки.
  Future<void> _logout() async {
    await context.read<PlaybackController>().stop();
    await _dm?.stop();
    await _presence?.stop();
    if (!mounted) return;
    await context.read<AuthController>().logout();
  }

  @override
  Widget build(BuildContext context) {
    final shell = context.watch<ShellController>();
    final dm = context.watch<DmController>();
    final friends = context.watch<FriendsController>();
    final user = context.watch<AuthController>().user;

    final narrow = MediaQuery.sizeOf(context).width < VellinLayout.breakpoint;
    final panelWidth = narrow ? VellinLayout.panelWidthNarrow : VellinLayout.panelWidth;

    return Focus(
      // Esc закрывает то, что открыто сейчас, — по одному слою за нажатие.
      // Узел не берёт фокус на себя: событие приходит сюда всплытием от поля
      // ввода или списка, где фокус на самом деле и находится.
      canRequestFocus: false,
      skipTraversal: true,
      onKeyEvent: (node, event) => _onEscape(event, shell, dm),
      child: ColoredBox(
      color: VellinColors.bg1,
      child: Row(
        children: [
          VellinNavRail(
            section: shell.section,
            onSelect: (s) {
              shell.selectSection(s);
              if (s == RailSection.calls) _loadCalls();
            },
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
                      onSelectStatus: (s) => context.read<AuthController>().setPresenceStatus(s),
                      onLogout: _logout,
                    ),
                ],
              ),
            ),
          ),
          Expanded(child: _rightWithPlayer(shell, dm)),
        ],
      ),
      ),
    );
  }

  /// Esc закрывает верхний открытый слой: сначала настройки, потом панель
  /// уведомлений, затем профиль, и только в конце — саму переписку.
  KeyEventResult _onEscape(KeyEvent event, ShellController shell, DmController dm) {
    if (event is! KeyDownEvent || event.logicalKey != LogicalKeyboardKey.escape) {
      return KeyEventResult.ignored;
    }

    if (shell.settingsOpen) {
      shell.closeSettings();
      return KeyEventResult.handled;
    }
    final notifications = context.read<NotificationsController>();
    if (notifications.panelOpen) {
      notifications.closePanel();
      return KeyEventResult.handled;
    }
    switch (shell.pane) {
      case RightPaneKind.profile:
        shell.closeProfile(hasOpenChat: dm.activePeerPublicId != null);
        return KeyEventResult.handled;
      case RightPaneKind.chat:
        dm.closeThread();
        shell.showEmpty();
        return KeyEventResult.handled;
      case RightPaneKind.empty:
        return KeyEventResult.ignored;
    }
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
        final list = _callsQuery.isEmpty
            ? _calls
            : _calls
                .where((c) => c.peer.username.toLowerCase().contains(_callsQuery.toLowerCase()))
                .toList();
        return Column(
          key: const ValueKey('calls'),
          children: [
            PanelHeader(
              title: 'Звонки',
              counter: _calls.isNotEmpty ? '${_calls.length} записей' : null,
              searchController: _callsSearch,
              searchPlaceholder: 'Поиск по звонкам',
              onSearch: (q) => setState(() => _callsQuery = q.trim()),
            ),
            Expanded(
              child: CallsPanel(
                calls: list,
                loading: _callsLoading,
                onCallBack: (u) => context.read<CallController>().invite(u.id, video: false),
                onOpenProfile: (u) => context.read<ShellController>().showProfile(u.publicId),
              ),
            ),
          ],
        );
    }
  }

  /// Правая область вместе с мини-плеером: в своём чате он висит пилюлей над
  /// лентой, вне его — доком, который сдвигает содержимое вниз.
  Widget _rightWithPlayer(ShellController shell, DmController dm) {
    // Плеер один на голосовые и кружки — что из них звучит, решает сам плеер.
    final track = MiniPlayerTrack.of(context);
    // Вид зависит от того, что в правой области: над перепиской и над пустым
    // «выберите диалог» плеер парит баблом, в профиле — прижимается полосой,
    // чтобы не висеть поверх лица.
    final dock = shell.pane == RightPaneKind.profile;

    return Stack(
      children: [
        Column(
          children: [
            if (track != null && dock) const MiniPlayer(dock: true),
            Expanded(
              // Профиль и переписка сменяют друг друга в две фазы, как разделы
              // рейла: прежнее уезжает, и лишь потом монтируется новое.
              child: PhaseSwitch(
                phaseKey: '${shell.pane}:${shell.profilePublicId ?? dm.activePeerPublicId ?? ''}',
                out: VellinMotion.short,
                inDuration: VellinMotion.state,
                shift: -18,
                child: _rightArea(shell, dm),
              ),
            ),
          ],
        ),
        if (track != null && !dock)
          Positioned(
            // Над лентой — ниже шапки чата; над пустой областью шапки нет,
            // поэтому пилюля поднимается к самому верху.
            top: shell.pane == RightPaneKind.chat ? VellinLayout.chatHeader + 8 : 12,
            left: 0,
            right: 0,
            child: const MiniPlayer(dock: false),
          ),
        // Кружок, уехавший из видимой части ленты, — окошком справа сверху,
        // под шапкой чата.
        const Positioned(
          top: VellinLayout.chatHeader + 14,
          right: 18,
          child: CirclePip(),
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
        return ProfilePane(
          key: ValueKey(shell.profilePublicId ?? 'me'),
          publicId: shell.profilePublicId,
          onClose: () => shell.closeProfile(hasOpenChat: dm.activePeerPublicId != null),
          onMessage: _openChat,
          onOpenSettings: shell.openSettings,
        );
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
