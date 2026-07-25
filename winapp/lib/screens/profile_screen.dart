import 'dart:async';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/auth_api.dart';
import '../api/catalog_api.dart';
import '../app_config.dart';
import '../models/models.dart';
import '../models/title.dart';
import '../state/auth_controller.dart';
import '../theme/vellin_theme.dart';
import '../widgets/back_dismiss.dart';
import '../widgets/common.dart';

String? _resolveAvatar(String? url) {
  if (url == null || url.isEmpty) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) return '${AppConfig.serverUrl}$url';
  return url;
}

String _errText(Object e) => e is ApiException ? e.message : 'Что-то пошло не так';

/// Страница настроек профиля (редактирование личных данных, email, пароля).
/// Открывается из вкладки «Профиль» через `context.push('/settings')`.
class ProfileSettingsScreen extends StatelessWidget {
  const ProfileSettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final user = auth.user;
    if (user == null) return const SizedBox.shrink();

    void back() => context.canPop() ? context.pop() : context.go('/profile');

    return BackDismissible(
      onBack: back,
      child: Scaffold(
      backgroundColor: VellinColors.bg0,
      appBar: AppBar(
        backgroundColor: VellinColors.bg0,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: VellinColors.text1),
          tooltip: 'Назад',
          onPressed: back,
        ),
        title: const Text('Настройки профиля',
            style: TextStyle(color: VellinColors.text0, fontSize: 17, fontWeight: FontWeight.w600)),
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 620),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(24, 12, 24, 48),
            children: [
              _IdentityCard(user: user),
              const SizedBox(height: 16),
              const _FavoriteTitlesCard(),
              const SizedBox(height: 16),
              _EmailCard(user: user),
              const SizedBox(height: 16),
              const _PasswordCard(),
              const SizedBox(height: 20),
              Center(
                child: Text('Vellin для Windows · v${AppConfig.appVersion}',
                    style: const TextStyle(color: VellinColors.text3, fontSize: 12)),
              ),
            ],
          ),
        ),
      ),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  final String title;
  final List<Widget> children;
  const _Card({required this.title, required this.children});
  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: VellinColors.bg1,
        borderRadius: BorderRadius.circular(VellinRadius.lg),
        border: Border.all(color: VellinColors.line2),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: VellinColors.text0)),
          const SizedBox(height: 16),
          ...children,
        ],
      ),
    );
  }
}

// ── Личные данные + аватар ──────────────────────────────────────────────────
class _IdentityCard extends StatefulWidget {
  final AuthUser user;
  const _IdentityCard({required this.user});
  @override
  State<_IdentityCard> createState() => _IdentityCardState();
}

class _IdentityCardState extends State<_IdentityCard> {
  late final _username = TextEditingController(text: widget.user.username);
  late final _bio = TextEditingController(text: widget.user.bio ?? '');
  late String? _gender = widget.user.gender;
  late String? _birthDate = widget.user.birthDate;
  late String? _city = widget.user.city;
  bool _busy = false;
  String? _error;
  String? _ok;

  AuthApi get _api => context.read<AuthApi>();

  @override
  void dispose() {
    _username.dispose();
    _bio.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() { _busy = true; _error = null; _ok = null; });
    final auth = context.read<AuthController>();
    try {
      final res = await _api.updateProfile({
        'username': _username.text.trim(),
        'bio': _bio.text.trim().isEmpty ? null : _bio.text.trim(),
        'gender': _gender,
        'birthDate': _birthDate,
        'city': (_city == null || _city!.trim().isEmpty) ? null : _city!.trim(),
      });
      await auth.applyResult(res);
      setState(() => _ok = 'Сохранено');
    } catch (e) {
      setState(() => _error = _errText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickAvatar() async {
    final picked = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['jpg', 'jpeg', 'png', 'webp'],
    );
    final path = picked?.files.single.path;
    if (path == null || !mounted) return;
    setState(() { _busy = true; _error = null; _ok = null; });
    final auth = context.read<AuthController>();
    try {
      final res = await _api.uploadAvatar(path);
      await auth.applyResult(res);
      setState(() => _ok = 'Аватар обновлён');
    } catch (e) {
      setState(() => _error = _errText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final initial = _birthDate != null ? DateTime.tryParse(_birthDate!) ?? DateTime(2000) : DateTime(2000);
    final d = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(1900),
      lastDate: now,
    );
    if (d != null) {
      setState(() => _birthDate =
          '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}');
    }
  }

  @override
  Widget build(BuildContext context) {
    final avatar = _resolveAvatar(widget.user.avatarUrl);
    return _Card(
      title: 'Профиль',
      children: [
        Row(children: [
          CircleAvatar(
            radius: 36,
            backgroundColor: VellinColors.bg3,
            backgroundImage: avatar != null ? NetworkImage(avatar) : null,
            child: avatar == null
                ? Text(
                    widget.user.username.isNotEmpty ? widget.user.username[0].toUpperCase() : '?',
                    style: const TextStyle(fontSize: 26, color: VellinColors.text1, fontWeight: FontWeight.w600),
                  )
                : null,
          ),
          const SizedBox(width: 16),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(widget.user.username, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: VellinColors.text0)),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: _busy ? null : _pickAvatar,
              style: OutlinedButton.styleFrom(
                foregroundColor: VellinColors.text0,
                side: const BorderSide(color: VellinColors.line2),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(VellinRadius.sm)),
              ),
              child: const Text('Сменить аватар'),
            ),
          ]),
        ]),
        const SizedBox(height: 18),
        VellinField(label: 'Имя пользователя', controller: _username),
        const SizedBox(height: 14),
        VellinField(label: 'О себе', controller: _bio, hint: 'Пара слов о вас'),
        const SizedBox(height: 14),
        _GenderPicker(value: _gender, onChanged: (v) => setState(() => _gender = v)),
        const SizedBox(height: 14),
        _DateField(value: _birthDate, onTap: _pickDate),
        const SizedBox(height: 14),
        _CityField(initial: _city, onChanged: (v) => _city = v),
        const SizedBox(height: 16),
        ErrorBanner(_error),
        if (_error != null) const SizedBox(height: 12),
        SuccessBanner(_ok),
        if (_ok != null) const SizedBox(height: 12),
        PrimaryButton(label: 'Сохранить', loading: _busy, onPressed: _save),
      ],
    );
  }
}

class _GenderPicker extends StatelessWidget {
  final String? value;
  final ValueChanged<String?> onChanged;
  const _GenderPicker({required this.value, required this.onChanged});
  @override
  Widget build(BuildContext context) {
    const items = {
      null: 'Не указан',
      'male': 'Мужской',
      'female': 'Женский',
      'other': 'Другой',
    };
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('ПОЛ', style: TextStyle(fontSize: 11, letterSpacing: 0.6, color: VellinColors.text2, fontWeight: FontWeight.w600)),
      const SizedBox(height: 6),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: VellinColors.bg2,
          borderRadius: BorderRadius.circular(VellinRadius.md),
          border: Border.all(color: VellinColors.line2),
        ),
        child: DropdownButtonHideUnderline(
          child: DropdownButton<String?>(
            value: value,
            isExpanded: true,
            dropdownColor: VellinColors.bg3,
            style: const TextStyle(color: VellinColors.text0, fontSize: 15),
            items: items.entries
                .map((e) => DropdownMenuItem<String?>(value: e.key, child: Text(e.value)))
                .toList(),
            onChanged: onChanged,
          ),
        ),
      ),
    ]);
  }
}

class _DateField extends StatelessWidget {
  final String? value;
  final VoidCallback onTap;
  const _DateField({required this.value, required this.onTap});
  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('ДАТА РОЖДЕНИЯ', style: TextStyle(fontSize: 11, letterSpacing: 0.6, color: VellinColors.text2, fontWeight: FontWeight.w600)),
      const SizedBox(height: 6),
      InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(VellinRadius.md),
        child: Container(
          height: 47,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          alignment: Alignment.centerLeft,
          decoration: BoxDecoration(
            color: VellinColors.bg2,
            borderRadius: BorderRadius.circular(VellinRadius.md),
            border: Border.all(color: VellinColors.line2),
          ),
          child: Text(value ?? 'Выбрать дату',
              style: TextStyle(color: value != null ? VellinColors.text0 : VellinColors.text3, fontSize: 15)),
        ),
      ),
    ]);
  }
}

// ── Смена email ─────────────────────────────────────────────────────────────
class _EmailCard extends StatefulWidget {
  final AuthUser user;
  const _EmailCard({required this.user});
  @override
  State<_EmailCard> createState() => _EmailCardState();
}

class _EmailCardState extends State<_EmailCard> {
  late final _email = TextEditingController(text: widget.user.email ?? '');
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;
  String? _ok;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() { _busy = true; _error = null; _ok = null; });
    final api = context.read<AuthApi>();
    final auth = context.read<AuthController>();
    try {
      final res = await api.changeEmail(_email.text.trim(), _password.text);
      await auth.applyResult(res);
      _password.clear();
      setState(() => _ok = 'Email обновлён');
    } catch (e) {
      setState(() => _error = _errText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return _Card(title: 'Email', children: [
      VellinField(label: 'Новый email', controller: _email, keyboardType: TextInputType.emailAddress),
      const SizedBox(height: 14),
      VellinField(label: 'Текущий пароль', controller: _password, obscure: true, hint: 'Для подтверждения'),
      const SizedBox(height: 16),
      ErrorBanner(_error),
      if (_error != null) const SizedBox(height: 12),
      SuccessBanner(_ok),
      if (_ok != null) const SizedBox(height: 12),
      PrimaryButton(label: 'Сменить email', secondary: true, loading: _busy, onPressed: _submit),
    ]);
  }
}

// ── Смена пароля ────────────────────────────────────────────────────────────
class _PasswordCard extends StatefulWidget {
  const _PasswordCard();
  @override
  State<_PasswordCard> createState() => _PasswordCardState();
}

class _PasswordCardState extends State<_PasswordCard> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  bool _busy = false;
  String? _error;
  String? _ok;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() { _busy = true; _error = null; _ok = null; });
    final api = context.read<AuthApi>();
    final auth = context.read<AuthController>();
    try {
      final res = await api.changePassword(_current.text, _next.text);
      await auth.applyResult(res);
      _current.clear();
      _next.clear();
      setState(() => _ok = 'Пароль обновлён. Остальные сессии завершены.');
    } catch (e) {
      setState(() => _error = _errText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return _Card(title: 'Пароль', children: [
      VellinField(label: 'Текущий пароль', controller: _current, obscure: true),
      const SizedBox(height: 14),
      VellinField(label: 'Новый пароль (от 8 символов)', controller: _next, obscure: true),
      const SizedBox(height: 16),
      ErrorBanner(_error),
      if (_error != null) const SizedBox(height: 12),
      SuccessBanner(_ok),
      if (_ok != null) const SizedBox(height: 12),
      PrimaryButton(label: 'Сменить пароль', secondary: true, loading: _busy, onPressed: _submit),
    ]);
  }
}

// ── Город (автодополнение из гео-справочника) ───────────────────────────────
class _CityField extends StatefulWidget {
  final String? initial;
  final ValueChanged<String?> onChanged;
  const _CityField({required this.initial, required this.onChanged});
  @override
  State<_CityField> createState() => _CityFieldState();
}

class _CityFieldState extends State<_CityField> {
  late final _ctrl = TextEditingController(text: widget.initial ?? '');
  final _focus = FocusNode();
  Timer? _debounce;
  List<String> _suggestions = [];
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _focus.addListener(() { if (!_focus.hasFocus) setState(() => _suggestions = []); });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _onChanged(String v) {
    widget.onChanged(v);
    _debounce?.cancel();
    if (v.trim().length < 2) {
      setState(() { _suggestions = []; _loading = false; });
      return;
    }
    setState(() => _loading = true);
    _debounce = Timer(const Duration(milliseconds: 300), () => _search(v.trim()));
  }

  Future<void> _search(String q) async {
    try {
      final r = await context.read<CatalogApi>().searchCities(q);
      if (mounted) setState(() { _suggestions = r; _loading = false; });
    } catch (_) {
      if (mounted) setState(() { _suggestions = []; _loading = false; });
    }
  }

  void _pick(String label) {
    _ctrl.value = TextEditingValue(text: label, selection: TextSelection.collapsed(offset: label.length));
    widget.onChanged(label);
    setState(() => _suggestions = []);
    _focus.unfocus();
  }

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('ГОРОД', style: TextStyle(fontSize: 11, letterSpacing: 0.6, color: VellinColors.text2, fontWeight: FontWeight.w600)),
      const SizedBox(height: 6),
      TextField(
        controller: _ctrl,
        focusNode: _focus,
        onChanged: _onChanged,
        style: const TextStyle(color: VellinColors.text0, fontSize: 15),
        decoration: InputDecoration(
          hintText: 'Начните вводить город',
          hintStyle: const TextStyle(color: VellinColors.text3),
          filled: true,
          fillColor: VellinColors.bg2,
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
          suffixIcon: _loading
              ? const Padding(
                  padding: EdgeInsets.all(12),
                  child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: VellinColors.accentHi)),
                )
              : (_ctrl.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.close, size: 18, color: VellinColors.text2),
                      onPressed: () { _ctrl.clear(); widget.onChanged(null); setState(() => _suggestions = []); },
                    )
                  : null),
          enabledBorder: _border(VellinColors.line2),
          focusedBorder: _border(VellinColors.accentHi),
        ),
      ),
      if (_suggestions.isNotEmpty) ...[
        const SizedBox(height: 6),
        Container(
          decoration: BoxDecoration(
            color: VellinColors.bg2,
            borderRadius: BorderRadius.circular(VellinRadius.md),
            border: Border.all(color: VellinColors.line2),
          ),
          child: Column(
            children: _suggestions
                .map((s) => InkWell(
                      onTap: () => _pick(s),
                      borderRadius: BorderRadius.circular(VellinRadius.md),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                        child: Row(children: [
                          const Icon(Icons.place_outlined, size: 17, color: VellinColors.text2),
                          const SizedBox(width: 10),
                          Expanded(child: Text(s, style: const TextStyle(color: VellinColors.text0, fontSize: 14))),
                        ]),
                      ),
                    ))
                .toList(),
          ),
        ),
      ],
    ]);
  }

  OutlineInputBorder _border(Color c) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(VellinRadius.md),
        borderSide: BorderSide(color: c),
      );
}

// ── Любимое кино (редактор избранного) ──────────────────────────────────────
class _FavoriteTitlesCard extends StatefulWidget {
  const _FavoriteTitlesCard();
  @override
  State<_FavoriteTitlesCard> createState() => _FavoriteTitlesCardState();
}

class _FavoriteTitlesCardState extends State<_FavoriteTitlesCard> {
  final _searchCtrl = TextEditingController();
  Timer? _debounce;
  List<TitleItem> _titles = [];
  List<TitleItem> _results = [];
  bool _loading = true;
  bool _searching = false;
  bool _saving = false;
  bool _unavailable = false;
  String? _error;
  String? _ok;

  CatalogApi get _api => context.read<CatalogApi>();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final t = await _api.favorites();
      if (mounted) setState(() { _titles = t; _loading = false; });
    } catch (_) {
      // Раздел может быть выключен фича-флагом на сервере — прячем редактор.
      if (mounted) setState(() { _unavailable = true; _loading = false; });
    }
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
      final r = await _api.searchTitles(q);
      if (mounted) setState(() { _results = r; _searching = false; });
    } catch (_) {
      if (mounted) setState(() { _results = []; _searching = false; });
    }
  }

  void _add(TitleItem t) {
    if (_titles.any((x) => x.kpId == t.kpId)) return;
    if (_titles.length >= 100) return;
    setState(() {
      _titles = [..._titles, t];
      _results = [];
      _ok = null;
    });
    _searchCtrl.clear();
  }

  void _remove(TitleItem t) => setState(() { _titles = _titles.where((x) => x.kpId != t.kpId).toList(); _ok = null; });

  Future<void> _save() async {
    setState(() { _saving = true; _error = null; _ok = null; });
    try {
      final saved = await _api.setFavorites(_titles);
      if (mounted) setState(() { _titles = saved; _ok = 'Сохранено'; });
    } catch (e) {
      if (mounted) setState(() => _error = _errText(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_unavailable) return const SizedBox.shrink();
    return _Card(title: 'Любимое кино', children: [
      if (_loading)
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 12),
          child: Center(child: CircularProgressIndicator(color: VellinColors.accentHi)),
        )
      else ...[
        _searchBox(),
        if (_searching || _results.isNotEmpty) ...[
          const SizedBox(height: 8),
          _searchResults(),
        ],
        const SizedBox(height: 14),
        if (_titles.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Text('Пока пусто. Найдите фильмы и сериалы через поиск выше.',
                style: TextStyle(color: VellinColors.text3, fontSize: 13)),
          )
        else
          ..._titles.map(_titleRow),
        const SizedBox(height: 12),
        ErrorBanner(_error),
        if (_error != null) const SizedBox(height: 12),
        SuccessBanner(_ok),
        if (_ok != null) const SizedBox(height: 12),
        PrimaryButton(label: 'Сохранить', secondary: true, loading: _saving, onPressed: _save),
      ],
    ]);
  }

  Widget _searchBox() => TextField(
        controller: _searchCtrl,
        onChanged: _onSearchChanged,
        style: const TextStyle(color: VellinColors.text0, fontSize: 15),
        decoration: InputDecoration(
          hintText: 'Найти фильм или сериал…',
          hintStyle: const TextStyle(color: VellinColors.text3),
          prefixIcon: const Icon(Icons.search, color: VellinColors.text2, size: 20),
          filled: true,
          fillColor: VellinColors.bg2,
          contentPadding: const EdgeInsets.symmetric(vertical: 13),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(VellinRadius.md), borderSide: const BorderSide(color: VellinColors.line2)),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(VellinRadius.md), borderSide: const BorderSide(color: VellinColors.accentHi)),
        ),
      );

  Widget _searchResults() {
    if (_searching) {
      return const Padding(
        padding: EdgeInsets.all(12),
        child: Center(child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: VellinColors.accentHi))),
      );
    }
    if (_results.isEmpty) {
      return const Padding(padding: EdgeInsets.all(8), child: Text('Ничего не найдено', style: TextStyle(color: VellinColors.text3, fontSize: 13)));
    }
    return Container(
      decoration: BoxDecoration(color: VellinColors.bg2, borderRadius: BorderRadius.circular(VellinRadius.md), border: Border.all(color: VellinColors.line2)),
      child: Column(children: _results.take(6).map((t) {
        final added = _titles.any((x) => x.kpId == t.kpId);
        return InkWell(
          onTap: added ? null : () => _add(t),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            child: Row(children: [
              _poster(t, 34, 48),
              const SizedBox(width: 10),
              Expanded(child: _titleText(t)),
              added
                  ? const Icon(Icons.check, color: VellinColors.ok, size: 20)
                  : const Icon(Icons.add, color: VellinColors.accentHi, size: 20),
            ]),
          ),
        );
      }).toList()),
    );
  }

  Widget _titleRow(TitleItem t) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(children: [
          _poster(t, 40, 56),
          const SizedBox(width: 12),
          Expanded(child: _titleText(t)),
          IconButton(
            icon: const Icon(Icons.close, size: 18, color: VellinColors.text2),
            tooltip: 'Убрать',
            onPressed: () => _remove(t),
          ),
        ]),
      );

  Widget _titleText(TitleItem t) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(t.title, maxLines: 1, overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: VellinColors.text0, fontSize: 14, fontWeight: FontWeight.w500)),
          if (t.year != null)
            Text('${t.year}', style: const TextStyle(color: VellinColors.text3, fontSize: 12)),
        ],
      );

  Widget _poster(TitleItem t, double w, double h) => ClipRRect(
        borderRadius: BorderRadius.circular(VellinRadius.xs),
        child: t.posterUrl != null
            ? Image.network(t.posterUrl!, width: w, height: h, fit: BoxFit.cover, errorBuilder: (_, _, _) => _posterStub(w, h))
            : _posterStub(w, h),
      );

  Widget _posterStub(double w, double h) =>
      Container(width: w, height: h, color: VellinColors.bg3, child: const Icon(Icons.movie_outlined, color: VellinColors.text3, size: 16));
}
