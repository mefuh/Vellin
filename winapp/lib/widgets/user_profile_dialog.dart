import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/friends_api.dart';
import '../models/social.dart';
import '../state/dm_controller.dart';
import '../state/friends_controller.dart';
import '../theme/vellin_theme.dart';
import 'common.dart';

/// Открывает диалог публичного профиля пользователя по publicId.
Future<void> showUserProfile(BuildContext context, String publicId) {
  return showDialog<void>(context: context, builder: (_) => _UserProfileDialog(publicId: publicId));
}

class _UserProfileDialog extends StatefulWidget {
  final String publicId;
  const _UserProfileDialog({required this.publicId});
  @override
  State<_UserProfileDialog> createState() => _UserProfileDialogState();
}

class _UserProfileDialogState extends State<_UserProfileDialog> {
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
      if (mounted) setState(() => _profile = p);
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
    Navigator.of(context).pop();
    context.go('/messages');
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: VellinColors.bg1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(VellinRadius.xl)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
        child: _error != null
            ? Padding(padding: const EdgeInsets.all(28), child: Text(_error!, style: const TextStyle(color: VellinColors.text2)))
            : _profile == null
                ? const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator(color: VellinColors.accentHi)))
                : _content(_profile!),
      ),
    );
  }

  Widget _content(PublicProfile p) {
    final u = p.user;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(28),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          VellinAvatar(username: u.username, avatarSeed: u.avatarSeed, avatarUrl: u.avatarUrl, size: 72, online: p.online),
          const SizedBox(width: 16),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(u.username,
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: VellinColors.text0), overflow: TextOverflow.ellipsis),
              const SizedBox(height: 4),
              Text(p.online ? 'В сети' : _lastSeen(p.lastSeenAt),
                  style: TextStyle(fontSize: 13, color: p.online ? VellinColors.ok : VellinColors.text2)),
            ]),
          ),
        ]),
        if (p.bio != null && p.bio!.isNotEmpty) ...[
          const SizedBox(height: 18),
          Text(p.bio!, style: const TextStyle(fontSize: 14, color: VellinColors.text1, height: 1.4)),
        ],
        const SizedBox(height: 18),
        ..._facts(p),
        if (p.favoriteTitles.isNotEmpty) ...[
          const SizedBox(height: 18),
          const Text('Любимое кино', style: TextStyle(fontSize: 12, letterSpacing: 0.6, color: VellinColors.text2, fontWeight: FontWeight.w600)),
          const SizedBox(height: 10),
          _favorites(p.favoriteTitles),
        ],
        const SizedBox(height: 22),
        Row(children: [
          Expanded(
            child: PrimaryButton(label: 'Написать', onPressed: () => _message(p)),
          ),
          const SizedBox(width: 10),
          Expanded(child: _friendButton(p)),
        ]),
      ]),
    );
  }

  List<Widget> _facts(PublicProfile p) {
    final rows = <Widget>[];
    void add(String label, String? value) {
      if (value == null || value.isEmpty) return;
      rows.add(Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 120, child: Text(label, style: const TextStyle(fontSize: 13, color: VellinColors.text2))),
          Expanded(child: Text(value, style: const TextStyle(fontSize: 13, color: VellinColors.text0))),
        ]),
      ));
    }

    add('Пол', _genderRu(p.gender));
    add('Дата рождения', _dateRu(p.birthDate));
    add('Город', p.city);
    add('На Vellin с', _yearOf(p.createdAt));
    return rows;
  }

  Widget _friendButton(PublicProfile p) {
    switch (p.relationship) {
      case 'friends':
        return _statusChip('В друзьях', VellinColors.ok);
      case 'outgoing':
        return _statusChip('Заявка отправлена', VellinColors.text2);
      case 'incoming':
        return PrimaryButton(label: 'Принять', secondary: true, loading: _busy, onPressed: () => _acceptFriend(p));
      case 'self':
        return const SizedBox.shrink();
      case 'blocked':
        return _statusChip('Заблокирован', VellinColors.text3);
      default:
        return PrimaryButton(label: 'В друзья', secondary: true, loading: _busy, onPressed: () => _addFriend(p));
    }
  }

  Widget _statusChip(String text, Color color) => Container(
        height: 46,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: VellinColors.bg2, borderRadius: BorderRadius.circular(VellinRadius.md), border: Border.all(color: VellinColors.line2)),
        child: Text(text, style: TextStyle(color: color, fontSize: 13, fontWeight: FontWeight.w600)),
      );

  Widget _favorites(List<FavoriteTitle> titles) => SizedBox(
        height: 130,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: titles.length,
          separatorBuilder: (_, _) => const SizedBox(width: 10),
          itemBuilder: (_, i) => _poster(titles[i]),
        ),
      );

  Widget _poster(FavoriteTitle t) => SizedBox(
        width: 74,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(VellinRadius.sm),
            child: t.posterUrl != null
                ? Image.network(t.posterUrl!, width: 74, height: 104, fit: BoxFit.cover, errorBuilder: (_, _, _) => _posterStub())
                : _posterStub(),
          ),
          const SizedBox(height: 4),
          Text(t.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, color: VellinColors.text1)),
        ]),
      );

  Widget _posterStub() => Container(width: 74, height: 104, color: VellinColors.bg3, child: const Icon(Icons.movie_outlined, color: VellinColors.text3, size: 22));
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
  final d = DateTime.tryParse(iso);
  if (d == null) return 'Не в сети';
  return 'Был(а) в сети ${_dateRu(iso).isEmpty ? '' : _dateRu(iso)}'.trim();
}
