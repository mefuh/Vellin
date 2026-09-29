import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../theme/vellin_design.dart';
import '../../widgets/ui/vellin_surfaces.dart';
import 'save_button.dart';

/// Категория приватности и то, как её называть человеку.
class _Category {
  final String id;
  final String title;
  final String hint;
  const _Category(this.id, this.title, this.hint);
}

const _categories = [
  _Category('online', 'Статус в сети', 'Кто видит, что вы сейчас в сети'),
  _Category('friends', 'Список друзей', 'Кто видит, с кем вы дружите'),
  _Category('personalInfo', 'Личные данные', 'Пол, дата рождения и город в профиле'),
  _Category('favorites', 'Витрина кино', 'Кто видит ваши любимые фильмы'),
  _Category('messages', 'Сообщения', 'Кто может вам писать'),
  _Category('calls', 'Звонки', 'Кто может вам звонить'),
];

const _options = [
  ('everyone', 'Все'),
  ('friends', 'Друзья'),
  ('nobody', 'Никто'),
];

/// «Приватность»: по правилу на категорию. Списки исключений (кому видно
/// всегда и кому скрыто всегда) сервер хранит, но правит их пока веб — здесь
/// они сохраняются как есть, чтобы не затереть чужой настройкой.
class SettingsPrivacy extends StatefulWidget {
  const SettingsPrivacy({super.key});

  @override
  State<SettingsPrivacy> createState() => _SettingsPrivacyState();
}

class _SettingsPrivacyState extends State<SettingsPrivacy> {
  Map<String, dynamic> _privacy = {};
  bool _loading = true;
  SaveState _save = SaveState.idle;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final j = await context.read<ApiClient>().get('/auth/privacy') as Map<String, dynamic>;
      if (mounted) {
        setState(() {
          _privacy = Map<String, dynamic>.from(j['privacy'] as Map? ?? {});
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Не удалось загрузить настройки';
          _loading = false;
        });
      }
    }
  }

  String _visibilityOf(String id) {
    final rule = _privacy[id];
    if (rule is Map && rule['visibility'] is String) return rule['visibility'] as String;
    return 'everyone';
  }

  void _set(String id, String visibility) {
    setState(() {
      final rule = _privacy[id];
      final allow = rule is Map ? (rule['allow'] as List? ?? []) : [];
      final deny = rule is Map ? (rule['deny'] as List? ?? []) : [];
      _privacy = {
        ..._privacy,
        // Исключения сохраняем как есть: их правят в вебе, и молча стирать их
        // сменой видимости нельзя.
        id: {'visibility': visibility, 'allow': allow, 'deny': deny},
      };
    });
  }

  Future<void> _submit() async {
    setState(() {
      _save = SaveState.saving;
      _error = null;
    });
    try {
      // Досылаем все категории, а не только тронутые: сервер принимает объект
      // целиком и дополняет отсутствующие значением по умолчанию.
      final body = {
        for (final c in _categories)
          c.id: {
            'visibility': _visibilityOf(c.id),
            'allow': (_privacy[c.id] is Map ? (_privacy[c.id]['allow'] as List? ?? []) : []),
            'deny': (_privacy[c.id] is Map ? (_privacy[c.id]['deny'] as List? ?? []) : []),
          },
      };
      await context.read<ApiClient>().patch('/auth/privacy', {'privacy': body});
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

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const VellinCard(
        children: [
          VellinSkeleton(width: 240, height: 12),
          VellinSkeleton(width: 380, height: 34, radius: 10, color: Color(0xFF161413)),
          VellinSkeleton(width: 240, height: 12),
          VellinSkeleton(width: 380, height: 34, radius: 10, color: Color(0xFF161413)),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        VellinCard(
          title: 'Кто что видит',
          children: [
            for (final c in _categories)
              _Row(
                category: c,
                value: _visibilityOf(c.id),
                onChanged: (v) => _set(c.id, v),
              ),
            if (_error != null)
              Text(_error!, style: VellinType.caption.copyWith(color: VellinColors.warning)),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                SaveButton(
                  state: _save,
                  label: 'Сохранить',
                  onPressed: _submit,
                  onSettled: () => setState(() => _save = SaveState.idle),
                ),
              ],
            ),
          ],
        ),
      ],
    );
  }
}

class _Row extends StatelessWidget {
  final _Category category;
  final String value;
  final ValueChanged<String> onChanged;

  const _Row({required this.category, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(category.title, style: VellinType.body.copyWith(height: 1.3)),
              const SizedBox(height: 3),
              Text(category.hint, style: VellinType.caption),
            ],
          ),
        ),
        const SizedBox(width: 14),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final o in _options) ...[
              if (o != _options.first) const SizedBox(width: 6),
              VellinPill(
                label: o.$2,
                selected: value == o.$1,
                onTap: () => onChanged(o.$1),
              ),
            ],
          ],
        ),
      ],
    );
  }
}
