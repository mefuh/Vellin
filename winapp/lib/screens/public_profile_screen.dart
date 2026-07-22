import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/friends_api.dart';
import '../models/social.dart';
import '../state/dm_controller.dart';
import '../state/friends_controller.dart';
import '../theme/vellin_theme.dart';
import '../widgets/common.dart';

/// Полноценная страница публичного профиля пользователя (по publicId).
/// Открывается поверх оболочки через `context.push('/u/<publicId>')`.
class PublicProfileScreen extends StatefulWidget {
  final String publicId;
  const PublicProfileScreen({super.key, required this.publicId});

  @override
  State<PublicProfileScreen> createState() => _PublicProfileScreenState();
}

class _PublicProfileScreenState extends State<PublicProfileScreen> {
  PublicProfile? _profile;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final p = await context.read<FriendsApi>().profile(widget.publicId);
      if (mounted) setState(() { _profile = p; _error = null; });
    } catch (e) {
      if (mounted) setState(() => _error = e is ApiException ? e.message : 'Не удалось загрузить профиль');
    }
  }

  Future<void> _addFriend(PublicProfile p) async {
    setState(() => _busy = true);
    try {
      await context.read<FriendsController>().sendRequest(userId: p.user.id);
      await _load();
    } catch (_) {}
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _acceptFriend(PublicProfile p) async {
    if (p.friendshipId == null) return;
    setState(() => _busy = true);
    try {
      await context.read<FriendsController>().accept(p.friendshipId!);
      await _load();
    } catch (_) {}
    if (mounted) setState(() => _busy = false);
  }

  void _message(PublicProfile p) {
    context.read<DmController>().openThread(p.user.publicId);
    context.go('/messages');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: VellinColors.bg0,
      appBar: AppBar(
        backgroundColor: VellinColors.bg0,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: VellinColors.text1),
          tooltip: 'Назад',
          onPressed: () => context.canPop() ? context.pop() : context.go('/messages'),
        ),
        title: const Text('Профиль',
            style: TextStyle(color: VellinColors.text0, fontSize: 17, fontWeight: FontWeight.w600)),
      ),
      body: _error != null
          ? ProfileErrorState(_error!)
          : _profile == null
              ? const Center(child: CircularProgressIndicator(color: VellinColors.accentHi))
              : ProfileView(profile: _profile!, actions: _actions(_profile!)),
    );
  }

  Widget _actions(PublicProfile p) {
    if (p.relationship == 'self') return const SizedBox.shrink();
    Widget? friendAction;
    switch (p.relationship) {
      case 'incoming':
        friendAction = PrimaryButton(label: 'Принять заявку', secondary: true, loading: _busy, onPressed: () => _acceptFriend(p));
        break;
      case 'friends':
      case 'outgoing':
      case 'blocked':
        friendAction = null;
        break;
      default:
        friendAction = PrimaryButton(label: 'Добавить в друзья', secondary: true, loading: _busy, onPressed: () => _addFriend(p));
    }
    return Row(children: [
      Expanded(child: PrimaryButton(label: 'Написать сообщение', onPressed: () => _message(p))),
      if (friendAction != null) ...[const SizedBox(width: 12), Expanded(child: friendAction)],
    ]);
  }
}

/// Переиспользуемое тело профиля (публичного и собственного): хедер с аватаром,
/// слот действий, «О себе», факты и любимое кино. Оформление одинаково везде.
class ProfileView extends StatelessWidget {
  final PublicProfile profile;

  /// Блок кнопок под хедером (написать/в друзья или «настройки профиля»).
  final Widget actions;

  const ProfileView({super.key, required this.profile, required this.actions});

  @override
  Widget build(BuildContext context) {
    final p = profile;
    return LayoutBuilder(builder: (context, constraints) {
      final wide = constraints.maxWidth >= 720;
      return SingleChildScrollView(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 760),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 12, 24, 48),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                _header(p, wide),
                const SizedBox(height: 20),
                actions,
                if (p.bio != null && p.bio!.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  _card(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      _cardLabel('О себе'),
                      const SizedBox(height: 10),
                      Text(p.bio!, style: const TextStyle(fontSize: 15, color: VellinColors.text1, height: 1.5)),
                    ]),
                  ),
                ],
                const SizedBox(height: 16),
                _facts(p),
                if (p.favoriteTitles.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  _card(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      _cardLabel('Любимое кино'),
                      const SizedBox(height: 14),
                      _favorites(p.favoriteTitles),
                    ]),
                  ),
                ],
              ]),
            ),
          ),
        ),
      );
    });
  }

  Widget _header(PublicProfile p, bool wide) {
    final u = p.user;
    final name = Column(
      crossAxisAlignment: wide ? CrossAxisAlignment.start : CrossAxisAlignment.center,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(u.username,
            textAlign: wide ? TextAlign.start : TextAlign.center,
            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: VellinColors.text0, letterSpacing: -0.6)),
        const SizedBox(height: 8),
        Row(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 8, height: 8,
            decoration: BoxDecoration(color: p.online ? VellinColors.ok : VellinColors.text3, shape: BoxShape.circle),
          ),
          const SizedBox(width: 7),
          Text(p.online ? 'В сети' : _lastSeen(p.lastSeenAt),
              style: TextStyle(fontSize: 13.5, color: p.online ? VellinColors.ok : VellinColors.text2)),
        ]),
        const SizedBox(height: 10),
        _relationshipBadge(p.relationship),
      ],
    );

    final avatar = VellinAvatar(username: u.username, avatarSeed: u.avatarSeed, avatarUrl: u.avatarUrl, size: 104);

    return _card(
      padding: const EdgeInsets.all(24),
      child: wide
          ? Row(children: [avatar, const SizedBox(width: 24), Expanded(child: name)])
          : Column(children: [avatar, const SizedBox(height: 16), name]),
    );
  }

  Widget _relationshipBadge(String rel) {
    final (String, Color)? spec = switch (rel) {
      'friends' => ('В друзьях', VellinColors.ok),
      'outgoing' => ('Заявка отправлена', VellinColors.text2),
      'incoming' => ('Ждёт вашего ответа', VellinColors.warn),
      'blocked' => ('Заблокирован', VellinColors.text3),
      _ => null,
    };
    if (spec == null) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      decoration: BoxDecoration(
        color: VellinColors.bg2,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: VellinColors.line2),
      ),
      child: Text(spec.$1, style: TextStyle(color: spec.$2, fontSize: 12.5, fontWeight: FontWeight.w600)),
    );
  }

  Widget _facts(PublicProfile p) {
    final items = <(String, String)>[];
    void add(String label, String? value) {
      if (value != null && value.isNotEmpty) items.add((label, value));
    }

    add('Пол', _genderRu(p.gender));
    add('Дата рождения', _dateRu(p.birthDate));
    add('Город', p.city);
    add('На Vellin с', _yearOf(p.createdAt));
    if (items.isEmpty) return const SizedBox.shrink();

    return LayoutBuilder(builder: (context, c) {
      final cols = c.maxWidth >= 520 ? 2 : 1;
      const gap = 12.0;
      final tileW = (c.maxWidth - gap * (cols - 1)) / cols;
      return Wrap(
        spacing: gap,
        runSpacing: gap,
        children: items.map((it) => SizedBox(width: tileW, child: _factCard(it.$1, it.$2))).toList(),
      );
    });
  }

  Widget _factCard(String label, String value) => _card(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Text(label.toUpperCase(),
              style: const TextStyle(fontSize: 10.5, letterSpacing: 0.6, color: VellinColors.text2, fontWeight: FontWeight.w600)),
          const SizedBox(height: 5),
          Text(value, style: const TextStyle(fontSize: 15, color: VellinColors.text0)),
        ]),
      );

  Widget _favorites(List<FavoriteTitle> titles) => SizedBox(
        height: 176,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: titles.length,
          separatorBuilder: (_, _) => const SizedBox(width: 14),
          itemBuilder: (_, i) => _poster(titles[i]),
        ),
      );

  Widget _poster(FavoriteTitle t) => SizedBox(
        width: 104,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(VellinRadius.md),
            child: t.posterUrl != null
                ? Image.network(t.posterUrl!, width: 104, height: 148, fit: BoxFit.cover, errorBuilder: (_, _, _) => _posterStub())
                : _posterStub(),
          ),
          const SizedBox(height: 8),
          Text(t.title, maxLines: 2, overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12.5, color: VellinColors.text1, height: 1.25)),
          if (t.year != null)
            Text('${t.year}', style: const TextStyle(fontSize: 11.5, color: VellinColors.text3)),
        ]),
      );

  Widget _posterStub() => Container(
        width: 104, height: 148, color: VellinColors.bg3,
        child: const Icon(Icons.movie_outlined, color: VellinColors.text3, size: 30),
      );

  Widget _card({required Widget child, EdgeInsets? padding}) => Container(
        padding: padding ?? const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: VellinColors.bg1,
          borderRadius: BorderRadius.circular(VellinRadius.lg),
          border: Border.all(color: VellinColors.line2),
        ),
        child: child,
      );

  Widget _cardLabel(String text) => Text(text.toUpperCase(),
      style: const TextStyle(fontSize: 11, letterSpacing: 0.6, color: VellinColors.text2, fontWeight: FontWeight.w600));
}

/// Состояние ошибки загрузки профиля.
class ProfileErrorState extends StatelessWidget {
  final String message;
  const ProfileErrorState(this.message, {super.key});
  @override
  Widget build(BuildContext context) => Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 360),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.person_off_outlined, color: VellinColors.text3, size: 44),
              const SizedBox(height: 14),
              Text(message, textAlign: TextAlign.center, style: const TextStyle(color: VellinColors.text2, fontSize: 14)),
            ]),
          ),
        ),
      );
}

String _genderRu(String? g) => switch (g) { 'male' => 'Мужской', 'female' => 'Женский', 'other' => 'Другой', _ => '' };

String _dateRu(String? iso) {
  if (iso == null || iso.length < 10) return '';
  final parts = iso.substring(0, 10).split('-');
  if (parts.length != 3) return '';
  const months = ['', 'января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  final m = int.tryParse(parts[1]) ?? 0;
  return '${int.tryParse(parts[2]) ?? ''} ${m >= 1 && m <= 12 ? months[m] : ''} ${parts[0]}';
}

String _yearOf(String iso) => iso.length >= 4 ? iso.substring(0, 4) : '';

String _lastSeen(String? iso) {
  if (iso == null) return 'Не в сети';
  final d = _dateRu(iso);
  return d.isEmpty ? 'Не в сети' : 'Был(а) в сети $d';
}
