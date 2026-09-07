import 'dart:ui' as ui;

import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import '../api/friends_api.dart';
import '../app_config.dart';
import '../models/social.dart';
import '../state/auth_controller.dart';
import '../state/call_controller.dart';
import '../state/friends_controller.dart';
import '../state/presence_controller.dart';
import '../theme/vellin_design.dart';
import '../theme/vellin_glyphs.dart';
import '../widgets/ui/vellin_avatar.dart';
import '../widgets/ui/vellin_button.dart';
import '../widgets/ui/vellin_hover.dart';
import '../widgets/ui/vellin_icon.dart';
import '../widgets/ui/vellin_surfaces.dart';

/// Профиль в правой области — свой и чужой одним телом.
///
/// Отличается только блок действий: у себя настройки, у другого — написать,
/// позвонить и работа с дружбой.
class ProfilePane extends StatefulWidget {
  /// Чей профиль. null — свой.
  final String? publicId;

  final VoidCallback onClose;
  final void Function(String publicId) onMessage;
  final VoidCallback onOpenSettings;

  const ProfilePane({
    super.key,
    required this.publicId,
    required this.onClose,
    required this.onMessage,
    required this.onOpenSettings,
  });

  @override
  State<ProfilePane> createState() => _ProfilePaneState();
}

class _ProfilePaneState extends State<ProfilePane> {
  final _scroll = ScrollController();
  PublicProfile? _profile;
  bool _loading = true;
  String? _error;
  bool _busy = false;

  /// Прокрутка прошла отметку, после которой в неподвижной полосе появляется
  /// имя: до неё оно и так видно в шапке.
  bool _titleShown = false;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      final shown = _scroll.hasClients && _scroll.offset > 96;
      if (shown != _titleShown) setState(() => _titleShown = shown);
    });
    _load();
  }

  @override
  void didUpdateWidget(ProfilePane old) {
    super.didUpdateWidget(old);
    if (old.publicId != widget.publicId) _load();
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final id = widget.publicId ?? context.read<AuthController>().user?.publicId;
    if (id == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final p = await context.read<FriendsApi>().profile(id);
      if (mounted) {
        setState(() {
          _profile = p;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Не удалось загрузить профиль';
          _loading = false;
        });
      }
    }
  }

  Future<void> _friendAction(PublicProfile p) async {
    setState(() => _busy = true);
    final friends = context.read<FriendsController>();
    try {
      switch (p.relationship) {
        case 'incoming':
          if (p.friendshipId != null) await friends.accept(p.friendshipId!);
        case 'friends':
          await friends.removeFriend(p.user.id);
        case 'none':
          await friends.sendRequest(userId: p.user.id);
      }
      await _load();
    } catch (_) {
      // Состояние перечитается при следующем открытии профиля.
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = context.watch<AuthController>().user;
    final isSelf = widget.publicId == null || widget.publicId == me?.publicId;

    if (_loading && _profile == null) return const _ProfileSkeleton();
    final p = _profile;
    if (p == null) {
      return _ProfileError(message: _error ?? 'Профиль не найден', onRetry: _load, onClose: widget.onClose);
    }

    final presence = context.watch<PresenceController>();
    final state = presenceFromStatus(
      isSelf
          ? me?.presenceStatus
          : presence.of(p.user.id)?.status ?? (p.online ? 'online' : 'offline'),
    );

    return ColoredBox(
      color: VellinColors.bg1,
      child: Stack(
        children: [
          ListView(
            controller: _scroll,
            padding: EdgeInsets.zero,
            children: [
              _Header(profile: p, presence: state),
              _Actions(
                profile: p,
                isSelf: isSelf,
                busy: _busy,
                onMessage: () => widget.onMessage(p.user.publicId),
                onCall: () => context.read<CallController>().invite(p.user.id, video: false),
                onFriendAction: () => _friendAction(p),
                onOpenSettings: widget.onOpenSettings,
              ),
              _Stats(profile: p),
              if ((p.bio ?? '').trim().isNotEmpty) _About(text: p.bio!.trim()),
              if (p.favoriteTitles.isNotEmpty) _Favorites(titles: p.favoriteTitles),
              const SizedBox(height: 48),
            ],
          ),
          _TopBar(
            profile: p,
            showTitle: _titleShown,
            onClose: widget.onClose,
          ),
        ],
      ),
    );
  }
}

/// Боковой отступ содержимого: на узком окне колонка прижимается к краям.
double _pad(BuildContext context) =>
    MediaQuery.sizeOf(context).width < VellinLayout.breakpoint ? 24 : VellinLayout.padProfile;

/// Неподвижная полоса поверх скролла: назад и — после прокрутки — имя.
class _TopBar extends StatelessWidget {
  final PublicProfile profile;
  final bool showTitle;
  final VoidCallback onClose;

  const _TopBar({required this.profile, required this.showTitle, required this.onClose});

  @override
  Widget build(BuildContext context) {
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      height: 56,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 18),
        child: Row(
          children: [
            _GlassButton(glyph: VellinGlyphs.back, onTap: onClose),
            const SizedBox(width: 12),
            AnimatedOpacity(
              duration: VellinMotion.hover,
              curve: VellinMotion.standard,
              opacity: showTitle ? 1 : 0,
              child: AnimatedSlide(
                duration: VellinMotion.hover,
                curve: VellinMotion.standard,
                offset: Offset(0, showTitle ? 0 : 0.3),
                child: VellinGlass(
                  color: const Color(0x9E0A0908),
                  radius: BorderRadius.circular(VellinRadius.pill),
                  border: VellinColors.line14,
                  padding: const EdgeInsets.fromLTRB(5, 4, 14, 4),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      VellinAvatar(
                        username: profile.user.username,
                        avatarUrl: profile.user.avatarUrl,
                        size: 24,
                        bedColor: VellinColors.bg1,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        profile.user.username,
                        style: VellinType.rowTitle.copyWith(fontSize: 12.5),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Круглая стеклянная кнопка поверх подложки.
class _GlassButton extends StatelessWidget {
  final List<String> glyph;
  final VoidCallback onTap;
  const _GlassButton({required this.glyph, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return VellinInteractive(
      onTap: onTap,
      focusRadius: BorderRadius.circular(17),
      builder: (context, s) {
        final hot = s.hovered || s.pressed;
        return VellinGlass(
          color: hot ? const Color(0xB8141110) : const Color(0x9E0A0908),
          radius: BorderRadius.circular(17),
          border: VellinColors.line14,
          child: SizedBox(
            width: 34,
            height: 34,
            child: Center(
              child: VellinIcon(
                glyph,
                size: 16,
                color: hot ? VellinColors.accent : VellinColors.ink72,
              ),
            ),
          ),
        );
      },
    );
  }
}

/// Шапка: подложка из постеров, аватар, имя и строка фактов.
class _Header extends StatelessWidget {
  final PublicProfile profile;
  final VellinPresence presence;

  const _Header({required this.profile, required this.presence});

  @override
  Widget build(BuildContext context) {
    // На узком окне шапка ужимается: иначе имя в 38 пунктов и аватар 104
    // вытесняют строку фактов за край.
    final narrow = MediaQuery.sizeOf(context).width < VellinLayout.breakpoint;
    final avatar = narrow ? 84.0 : 104.0;
    final pad = narrow ? 24.0 : VellinLayout.padProfile;

    return SizedBox(
      height: narrow ? 264 : 300,
      child: Stack(
        fit: StackFit.expand,
        children: [
          _Backdrop(titles: profile.favoriteTitles),
          Padding(
            padding: EdgeInsets.fromLTRB(pad, narrow ? 76 : 92, pad, 0),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Container(
                  padding: const EdgeInsets.all(4),
                  decoration: const BoxDecoration(
                    color: Color(0xFF0F0D0C),
                    shape: BoxShape.circle,
                  ),
                  child: VellinAvatar(
                    username: profile.user.username,
                    avatarUrl: profile.user.avatarUrl,
                    size: avatar,
                    bedColor: const Color(0xFF0F0D0C),
                  ),
                ),
                const SizedBox(width: 22),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 6,
                            height: 6,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: presence.color,
                            ),
                          ),
                          const SizedBox(width: 7),
                          Text(
                            presence.label.toUpperCase(),
                            style: VellinType.caption.copyWith(letterSpacing: 1.15),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        profile.user.username,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: VellinType.displayName.copyWith(fontSize: narrow ? 30 : 38),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        '@${profile.user.publicId}',
                        style: VellinType.caption.copyWith(fontSize: 12.5, color: VellinColors.ink42),
                      ),
                      const SizedBox(height: 10),
                      _Facts(profile: profile),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Строка фактов через точки-разделители.
class _Facts extends StatelessWidget {
  final PublicProfile profile;
  const _Facts({required this.profile});

  @override
  Widget build(BuildContext context) {
    final parts = <String>[
      if (profile.gender != null) _gender(profile.gender!),
      if (profile.birthDate != null) _birth(profile.birthDate!),
      if ((profile.city ?? '').isNotEmpty) profile.city!,
      if (profile.createdAt.isNotEmpty) 'на Vellin с ${_year(profile.createdAt)}',
    ];
    if (parts.isEmpty) return const SizedBox.shrink();

    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        for (var i = 0; i < parts.length; i++) ...[
          if (i > 0)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Container(
                width: 3,
                height: 3,
                decoration: const BoxDecoration(shape: BoxShape.circle, color: VellinColors.ink24),
              ),
            ),
          Text(parts[i], style: VellinType.rowSub.copyWith(color: VellinColors.ink34)),
        ],
      ],
    );
  }

  static String _gender(String g) => switch (g) {
        'male' => 'мужской',
        'female' => 'женский',
        _ => 'другой',
      };

  static String _birth(String iso) {
    final d = DateTime.tryParse(iso);
    if (d == null) return '';
    const months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
    ];
    return '${d.day} ${months[d.month - 1]} ${d.year}';
  }

  static String _year(String iso) => '${DateTime.tryParse(iso)?.year ?? ''}';
}

/// Подложка шапки: веер постеров под сильным размытием.
///
/// Размывается статичный слой, а не кадр целиком: блюр дорогой, и пересчитывать
/// его на каждой прокрутке незачем.
class _Backdrop extends StatelessWidget {
  final List<FavoriteTitle> titles;
  const _Backdrop({required this.titles});

  @override
  Widget build(BuildContext context) {
    final posters = titles
        .map((t) => AppConfig.mediaUrl(t.posterUrl))
        .whereType<String>()
        .take(6)
        .toList();

    return Stack(
      fit: StackFit.expand,
      children: [
        if (posters.isNotEmpty)
          ImageFiltered(
            imageFilter: ui.ImageFilter.blur(
              sigmaX: VellinBlur.backdrop,
              sigmaY: VellinBlur.backdrop,
              tileMode: TileMode.decal,
            ),
            child: Row(
              children: [
                for (final url in posters)
                  Expanded(
                    child: Image.network(
                      url,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => const ColoredBox(color: VellinColors.bg5),
                    ),
                  ),
              ],
            ),
          ),
        // Золотое пятно и градиент в фон: без них подложка спорит с именем.
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              center: Alignment(-0.55, -0.5),
              radius: 0.7,
              colors: [Color(0x21E2C99B), Color(0x00E2C99B)],
            ),
          ),
        ),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0x1F0A0807), Color(0x940A0807), Color(0xF00A0807), Color(0xFF0A0807)],
              stops: [0, 0.54, 0.84, 1],
            ),
          ),
        ),
      ],
    );
  }
}

/// Действия под шапкой.
class _Actions extends StatelessWidget {
  final PublicProfile profile;
  final bool isSelf;
  final bool busy;
  final VoidCallback onMessage;
  final VoidCallback onCall;
  final VoidCallback onFriendAction;
  final VoidCallback onOpenSettings;

  const _Actions({
    required this.profile,
    required this.isSelf,
    required this.busy,
    required this.onMessage,
    required this.onCall,
    required this.onFriendAction,
    required this.onOpenSettings,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(_pad(context), 26, _pad(context), 0),
      child: Row(
        children: [
          if (isSelf) ...[
            VellinButton(
              label: 'Настройки профиля',
              glyph: VellinGlyphs.settings,
              tone: VellinButtonTone.primary,
              onPressed: onOpenSettings,
            ),
          ] else ...[
            VellinButton(
              label: 'Написать',
              glyph: VellinGlyphs.messages,
              tone: VellinButtonTone.primary,
              onPressed: onMessage,
            ),
            const SizedBox(width: 10),
            VellinButton(
              label: 'Позвонить',
              glyph: VellinGlyphs.calls,
              onPressed: onCall,
            ),
            const SizedBox(width: 10),
            if (_friendLabel != null)
              VellinButton(
                label: _friendLabel,
                tone: profile.relationship == 'friends'
                    ? VellinButtonTone.secondary
                    : VellinButtonTone.goldTint,
                busy: busy,
                onPressed: profile.relationship == 'outgoing' ? null : onFriendAction,
              ),
          ],
        ],
      ),
    );
  }

  String? get _friendLabel => switch (profile.relationship) {
        'none' => 'Добавить в друзья',
        'incoming' => 'Принять заявку',
        'outgoing' => 'Заявка отправлена',
        'friends' => 'В друзьях',
        _ => null,
      };
}

/// Полоса цифр: три колонки с волосяными линиями сверху и снизу.
class _Stats extends StatelessWidget {
  final PublicProfile profile;
  const _Stats({required this.profile});

  @override
  Widget build(BuildContext context) {
    final friends = profile.friends?.length;
    final items = <(String, String, bool)>[
      (friends?.toString() ?? '—', 'друзей', true),
      (profile.favoriteTitles.length.toString(), 'в витрине кино', false),
      (_year(profile.createdAt), 'на Vellin с', false),
    ];

    return Container(
      margin: EdgeInsets.fromLTRB(_pad(context), 34, _pad(context), 0),
      decoration: const BoxDecoration(
        border: Border(
          top: BorderSide(color: VellinColors.line05),
          bottom: BorderSide(color: VellinColors.line05),
        ),
      ),
      child: IntrinsicHeight(
        child: Row(
          children: [
            for (var i = 0; i < items.length; i++) ...[
              if (i > 0)
                const ColoredBox(color: VellinColors.line05, child: SizedBox(width: 1)),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        items[i].$1,
                        style: VellinType.statNumber.copyWith(
                          color: items[i].$3 ? VellinColors.accent : VellinColors.ink92,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(items[i].$2, style: VellinType.caption.copyWith(color: VellinColors.ink34)),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  static String _year(String iso) => '${DateTime.tryParse(iso)?.year ?? '—'}';
}

/// «О себе».
class _About extends StatelessWidget {
  final String text;
  const _About({required this.text});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(_pad(context), 34, _pad(context), 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const VellinSectionTitle('О себе'),
          const SizedBox(height: 14),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 620),
            child: Text(
              text,
              style: TextStyle(
                fontFamily: VellinType.family,
                fontSize: 15,
                fontWeight: FontWeight.w300,
                height: 1.7,
                color: VellinColors.ink82,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Витрина кино: горизонтальная лента постеров.
class _Favorites extends StatelessWidget {
  final List<FavoriteTitle> titles;
  const _Favorites({required this.titles});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 34),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: EdgeInsets.symmetric(horizontal: _pad(context)),
            child: const VellinSectionTitle('Любимое кино'),
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 240,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: EdgeInsets.symmetric(horizontal: _pad(context)),
              itemCount: titles.length,
              separatorBuilder: (_, _) => const SizedBox(width: 14),
              itemBuilder: (context, i) => _Poster(title: titles[i]),
            ),
          ),
        ],
      ),
    );
  }
}

class _Poster extends StatelessWidget {
  final FavoriteTitle title;
  const _Poster({required this.title});

  @override
  Widget build(BuildContext context) {
    final url = AppConfig.mediaUrl(title.posterUrl);

    return SizedBox(
      width: 132,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(17),
            child: Container(
              width: 132,
              height: 196,
              color: VellinColors.bg5,
              child: url == null
                  ? null
                  : Image.network(
                      url,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => const SizedBox.shrink(),
                    ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            title.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: VellinType.rowSub.copyWith(fontSize: 12.5, color: VellinColors.ink72),
          ),
          if (title.year != null)
            Text(
              '${title.year}',
              style: VellinType.time.copyWith(fontSize: 11, color: VellinColors.ink32),
            ),
        ],
      ),
    );
  }
}

/// Скелет профиля — те же пятна, что и содержимое, а не крутящийся кружок.
class _ProfileSkeleton extends StatelessWidget {
  const _ProfileSkeleton();

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: VellinColors.bg1,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(36, 92, 36, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                const VellinSkeleton.circle(112),
                const SizedBox(width: 22),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const VellinSkeleton(width: 90, height: 10),
                    const SizedBox(height: 12),
                    const VellinSkeleton(width: 260, height: 30, radius: 8),
                    const SizedBox(height: 12),
                    const VellinSkeleton(width: 180, height: 10, color: Color(0xFF161413)),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 40),
            const VellinSkeleton(width: 320, height: 44, radius: 12),
            const SizedBox(height: 34),
            const VellinSkeleton(width: double.infinity, height: 76, radius: 12, color: Color(0xFF161413)),
          ],
        ),
      ),
    );
  }
}

class _ProfileError extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  final VoidCallback onClose;

  const _ProfileError({required this.message, required this.onRetry, required this.onClose});

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: VellinColors.bg1,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message, style: VellinType.body.copyWith(color: VellinColors.warning)),
            const SizedBox(height: 16),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                VellinButton(label: 'Попробовать снова', onPressed: onRetry),
                const SizedBox(width: 10),
                VellinButton(label: 'Закрыть', tone: VellinButtonTone.ghost, onPressed: onClose),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
