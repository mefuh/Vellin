import 'package:file_picker/file_picker.dart';
import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import '../../api/auth_api.dart';
import '../../api/catalog_api.dart';
import '../../state/auth_controller.dart';
import '../../theme/vellin_design.dart';
import '../../theme/vellin_glyphs.dart';
import '../../widgets/ui/vellin_avatar.dart';
import '../../widgets/ui/vellin_button.dart';
import '../../widgets/ui/vellin_field.dart';
import '../../widgets/ui/vellin_hover.dart';
import '../../widgets/ui/vellin_surfaces.dart';
import 'save_button.dart';

/// «Мой профиль»: аватар, имя, о себе, пол, дата рождения, город.
class SettingsProfile extends StatefulWidget {
  const SettingsProfile({super.key});

  @override
  State<SettingsProfile> createState() => _SettingsProfileState();
}

class _SettingsProfileState extends State<SettingsProfile> {
  late final _username = TextEditingController(text: _user?.username ?? '');
  late final _bio = TextEditingController(text: _user?.bio ?? '');
  late String? _gender = _user?.gender;
  late String? _birthDate = _user?.birthDate;
  late String? _city = _user?.city;

  SaveState _save = SaveState.idle;
  String? _error;

  dynamic get _user => context.read<AuthController>().user;

  @override
  void dispose() {
    _username.dispose();
    _bio.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _save = SaveState.saving;
      _error = null;
    });
    try {
      final res = await context.read<AuthApi>().updateProfile({
        'username': _username.text.trim(),
        'bio': _bio.text.trim().isEmpty ? null : _bio.text.trim(),
        'gender': _gender,
        'birthDate': _birthDate,
        'city': (_city ?? '').trim().isEmpty ? null : _city!.trim(),
      });
      if (!mounted) return;
      await context.read<AuthController>().applyResult(res);
      if (mounted) setState(() => _save = SaveState.saved);
    } catch (e) {
      if (mounted) {
        setState(() {
          _save = SaveState.idle;
          _error = 'Не удалось сохранить: $e';
        });
      }
    }
  }

  Future<void> _pickAvatar() async {
    final picked = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['jpg', 'jpeg', 'png', 'webp'],
    );
    final path = picked?.files.single.path;
    if (path == null || !mounted) return;
    try {
      final res = await context.read<AuthApi>().uploadAvatar(path);
      if (mounted) await context.read<AuthController>().applyResult(res);
    } catch (e) {
      if (mounted) setState(() => _error = 'Не удалось загрузить аватар: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthController>().user;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        VellinCard(
          title: 'Профиль',
          children: [
            Row(
              children: [
                VellinAvatar(
                  username: user?.username ?? '',
                  avatarUrl: user?.avatarUrl,
                  size: 64,
                  bedColor: VellinColors.surface,
                ),
                const SizedBox(width: 16),
                VellinButton(
                  label: 'Сменить аватар',
                  glyph: VellinGlyphs.image,
                  height: 38,
                  onPressed: _pickAvatar,
                ),
              ],
            ),
            VellinField(label: 'Имя пользователя', controller: _username),
            VellinField(
              label: 'О себе',
              controller: _bio,
              placeholder: 'Пара слов о вас',
              maxLines: 3,
            ),
            _GenderPicker(value: _gender, onChanged: (v) => setState(() => _gender = v)),
            _DateField(value: _birthDate, onChanged: (v) => setState(() => _birthDate = v)),
            _CityField(initial: _city, onChanged: (v) => _city = v),
            if (_error != null)
              Text(_error!, style: VellinType.caption.copyWith(color: VellinColors.warning)),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [SaveButton(
                state: _save,
                label: 'Сохранить',
                onPressed: _submit,
                onSettled: () => setState(() => _save = SaveState.idle),
              )],
            ),
          ],
        ),
      ],
    );
  }
}

/// Пол: три пилюли вместо выпадающего списка — вариантов всего три.
class _GenderPicker extends StatelessWidget {
  final String? value;
  final ValueChanged<String?> onChanged;
  const _GenderPicker({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    const options = [(null, 'Не указан'), ('male', 'Мужской'), ('female', 'Женский'), ('other', 'Другой')];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('ПОЛ', style: VellinType.fieldLabel),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final o in options)
              VellinPill(
                label: o.$2,
                selected: value == o.$1,
                onTap: () => onChanged(o.$1),
              ),
          ],
        ),
      ],
    );
  }
}

/// Дата рождения: три поля вместо системного календаря — он приходит из
/// Material со своим оформлением и в этом языке выглядит чужим.
class _DateField extends StatefulWidget {
  final String? value;
  final ValueChanged<String?> onChanged;
  const _DateField({required this.value, required this.onChanged});

  @override
  State<_DateField> createState() => _DateFieldState();
}

class _DateFieldState extends State<_DateField> {
  late final _day = TextEditingController(text: _part(2));
  late final _month = TextEditingController(text: _part(1));
  late final _year = TextEditingController(text: _part(0));

  String _part(int index) {
    final v = widget.value;
    if (v == null || v.length < 10) return '';
    return v.split('-')[index];
  }

  void _emit() {
    final y = _year.text.trim();
    final m = _month.text.trim().padLeft(2, '0');
    final d = _day.text.trim().padLeft(2, '0');
    if (y.length != 4 || m.length != 2 || d.length != 2) {
      widget.onChanged(null);
      return;
    }
    widget.onChanged('$y-$m-$d');
  }

  @override
  void dispose() {
    _day.dispose();
    _month.dispose();
    _year.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('ДАТА РОЖДЕНИЯ', style: VellinType.fieldLabel),
        const SizedBox(height: 8),
        Row(
          children: [
            SizedBox(
              width: 78,
              child: VellinField(controller: _day, placeholder: 'ДД', onChanged: (_) => _emit()),
            ),
            const SizedBox(width: 8),
            SizedBox(
              width: 78,
              child: VellinField(controller: _month, placeholder: 'ММ', onChanged: (_) => _emit()),
            ),
            const SizedBox(width: 8),
            SizedBox(
              width: 96,
              child: VellinField(controller: _year, placeholder: 'ГГГГ', onChanged: (_) => _emit()),
            ),
          ],
        ),
      ],
    );
  }
}

/// Город: поле с подсказками сервера. Сохранить можно только значение из
/// списка — сервер чужие строки не принимает.
class _CityField extends StatefulWidget {
  final String? initial;
  final ValueChanged<String?> onChanged;
  const _CityField({required this.initial, required this.onChanged});

  @override
  State<_CityField> createState() => _CityFieldState();
}

class _CityFieldState extends State<_CityField> {
  late final _controller = TextEditingController(text: widget.initial ?? '');
  List<String> _suggestions = [];
  bool _picked = true;

  Future<void> _search(String q) async {
    widget.onChanged(_picked ? q : null);
    if (q.trim().length < 2) {
      setState(() => _suggestions = []);
      return;
    }
    try {
      final res = await context.read<CatalogApi>().searchCities(q.trim());
      if (mounted) setState(() => _suggestions = res.take(6).toList());
    } catch (_) {
      if (mounted) setState(() => _suggestions = []);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        VellinField(
          label: 'Город',
          controller: _controller,
          placeholder: 'Начните вводить название',
          onChanged: (v) {
            _picked = false;
            _search(v);
          },
        ),
        if (_suggestions.isNotEmpty) ...[
          const SizedBox(height: 8),
          Container(
            decoration: BoxDecoration(
              color: VellinColors.bubble,
              borderRadius: BorderRadius.circular(VellinRadius.field),
              border: Border.all(color: VellinColors.line07),
            ),
            child: Column(
              children: [
                for (final city in _suggestions)
                  VellinInteractive(
                    onTap: () {
                      _controller.text = city;
                      _picked = true;
                      widget.onChanged(city);
                      setState(() => _suggestions = []);
                    },
                    builder: (context, s) => Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                      color: s.hovered ? VellinColors.fill055 : const Color(0x00000000),
                      child: Text(city, style: VellinType.body.copyWith(fontSize: 13)),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}
