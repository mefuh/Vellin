import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/friends_api.dart';
import '../models/social.dart';
import '../state/friends_controller.dart';
import '../theme/vellin_theme.dart';
import '../widgets/common.dart';

class FriendsScreen extends StatefulWidget {
  const FriendsScreen({super.key});
  @override
  State<FriendsScreen> createState() => _FriendsScreenState();
}

class _FriendsScreenState extends State<FriendsScreen> {
  final _searchCtrl = TextEditingController();
  Timer? _debounce;
  List<SearchUser> _results = [];
  bool _searching = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<FriendsController>().load());
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  void _onSearchChanged(String q) {
    _debounce?.cancel();
    if (q.trim().length < 2) {
      setState(() { _results = []; _searching = false; });
      return;
    }
    setState(() => _searching = true);
    _debounce = Timer(const Duration(milliseconds: 400), () => _runSearch(q.trim()));
  }

  Future<void> _runSearch(String q) async {
    try {
      final r = await context.read<FriendsApi>().search(q);
      if (mounted) setState(() { _results = r; _searching = false; });
    } catch (_) {
      if (mounted) setState(() { _results = []; _searching = false; });
    }
  }

  Future<void> _addFriend(SearchUser u) async {
    try {
      await context.read<FriendsController>().sendRequest(userId: u.user.id);
      if (mounted) _runSearch(_searchCtrl.text.trim()); // обновить relationship в выдаче
    } catch (e) {
      if (mounted) _snack(e is Exception ? '$e' : 'Не удалось отправить заявку');
    }
  }

  void _snack(String msg) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: VellinColors.bg3));

  @override
  Widget build(BuildContext context) {
    final ctrl = context.watch<FriendsController>();
    return Scaffold(
      backgroundColor: VellinColors.bg0,
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 620),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(24, 28, 24, 48),
            children: [
              const Text('Друзья',
                  style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: VellinColors.text0, letterSpacing: -0.5)),
              const SizedBox(height: 20),
              _searchBox(),
              if (_searching || _results.isNotEmpty) ...[
                const SizedBox(height: 8),
                _searchResults(),
              ],
              const SizedBox(height: 24),
              if (ctrl.error != null) ...[
                ErrorBanner('Не удалось загрузить: ${ctrl.error}'),
                const SizedBox(height: 16),
              ],
              if (ctrl.incoming.isNotEmpty) ...[
                _sectionTitle('Заявки в друзья', ctrl.incoming.length),
                const SizedBox(height: 10),
                ...ctrl.incoming.map((r) => _requestTile(r)),
                const SizedBox(height: 24),
              ],
              _sectionTitle('Мои друзья', ctrl.friends.length),
              const SizedBox(height: 10),
              if (ctrl.loading && ctrl.friends.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(child: CircularProgressIndicator(color: VellinColors.accentHi)),
                )
              else if (ctrl.friends.isEmpty)
                _empty('Пока никого. Найдите друзей через поиск выше.')
              else
                ...ctrl.friends.map((f) => _friendTile(f)),
              if (ctrl.outgoing.isNotEmpty) ...[
                const SizedBox(height: 24),
                _sectionTitle('Исходящие заявки', ctrl.outgoing.length),
                const SizedBox(height: 10),
                ...ctrl.outgoing.map((r) => _outgoingTile(r)),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _searchBox() {
    return TextField(
      controller: _searchCtrl,
      onChanged: _onSearchChanged,
      style: const TextStyle(color: VellinColors.text0, fontSize: 15),
      decoration: InputDecoration(
        hintText: 'Найти пользователя по имени…',
        hintStyle: const TextStyle(color: VellinColors.text3),
        prefixIcon: const Icon(Icons.search, color: VellinColors.text2, size: 20),
        filled: true,
        fillColor: VellinColors.bg2,
        contentPadding: const EdgeInsets.symmetric(vertical: 13),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(VellinRadius.md),
          borderSide: const BorderSide(color: VellinColors.line2),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(VellinRadius.md),
          borderSide: const BorderSide(color: VellinColors.accentHi),
        ),
      ),
    );
  }

  Widget _searchResults() {
    if (_searching) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: VellinColors.accentHi))),
      );
    }
    if (_results.isEmpty) return _empty('Никого не найдено');
    return Column(children: _results.where((u) => u.relationship != 'self').map(_resultTile).toList());
  }

  Widget _resultTile(SearchUser u) {
    Widget trailing;
    switch (u.relationship) {
      case 'friends':
        trailing = _label('В друзьях', VellinColors.ok);
        break;
      case 'outgoing':
        trailing = _label('Заявка отправлена', VellinColors.text2);
        break;
      case 'incoming':
        trailing = _label('Ждёт ответа', VellinColors.warn);
        break;
      case 'blocked':
        trailing = _label('Заблокирован', VellinColors.text3);
        break;
      default:
        trailing = _smallButton('Добавить', () => _addFriend(u));
    }
    return _row(u.user, online: u.online, trailing: trailing);
  }

  Widget _requestTile(FriendRequest r) => _row(
        r.user,
        trailing: Row(mainAxisSize: MainAxisSize.min, children: [
          _smallButton('Принять', () => context.read<FriendsController>().accept(r.id)),
          const SizedBox(width: 8),
          _smallButton('Отклонить', () => context.read<FriendsController>().decline(r.id), secondary: true),
        ]),
      );

  Widget _outgoingTile(FriendRequest r) => _row(r.user, trailing: _label('Ожидает', VellinColors.text2));

  Widget _friendTile(FriendUser f) => _row(
        f.user,
        online: f.online,
        trailing: IconButton(
          icon: const Icon(Icons.person_remove_outlined, size: 20, color: VellinColors.text2),
          tooltip: 'Удалить из друзей',
          onPressed: () => context.read<FriendsController>().removeFriend(f.user.id),
        ),
      );

  Widget _row(PublicUser u, {bool? online, required Widget trailing}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: VellinColors.bg1,
        borderRadius: BorderRadius.circular(VellinRadius.md),
        border: Border.all(color: VellinColors.line2),
      ),
      child: Row(children: [
        VellinAvatar(username: u.username, avatarSeed: u.avatarSeed, avatarUrl: u.avatarUrl, size: 40, online: online),
        const SizedBox(width: 12),
        Expanded(
          child: Text(u.username,
              style: const TextStyle(color: VellinColors.text0, fontSize: 15, fontWeight: FontWeight.w500), overflow: TextOverflow.ellipsis),
        ),
        const SizedBox(width: 8),
        trailing,
      ]),
    );
  }

  Widget _sectionTitle(String text, int count) => Row(children: [
        Text(text, style: const TextStyle(color: VellinColors.text1, fontSize: 14, fontWeight: FontWeight.w600)),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(color: VellinColors.bg3, borderRadius: BorderRadius.circular(999)),
          child: Text('$count', style: const TextStyle(color: VellinColors.text2, fontSize: 12, fontWeight: FontWeight.w600)),
        ),
      ]);

  Widget _label(String text, Color color) =>
      Text(text, style: TextStyle(color: color, fontSize: 12.5, fontWeight: FontWeight.w600));

  Widget _smallButton(String label, VoidCallback onTap, {bool secondary = false}) => SizedBox(
        height: 34,
        child: FilledButton(
          onPressed: onTap,
          style: FilledButton.styleFrom(
            backgroundColor: secondary ? VellinColors.bg3 : VellinColors.accent,
            foregroundColor: secondary ? VellinColors.text0 : Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(VellinRadius.sm)),
            textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          ),
          child: Text(label),
        ),
      );

  Widget _empty(String text) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 20),
        child: Center(child: Text(text, style: const TextStyle(color: VellinColors.text3, fontSize: 14))),
      );
}
