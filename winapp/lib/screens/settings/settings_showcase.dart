import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import '../../api/catalog_api.dart';
import '../../app_config.dart';
import '../../models/title.dart';
import '../../theme/vellin_design.dart';
import '../../theme/vellin_glyphs.dart';
import '../../widgets/ui/vellin_button.dart';
import '../../widgets/ui/vellin_field.dart';
import '../../widgets/ui/vellin_hover.dart';
import '../../widgets/ui/vellin_icon.dart';
import '../../widgets/ui/vellin_surfaces.dart';
import 'save_button.dart';

/// «Витрина кино»: поиск по каталогу и сетка избранного с порядком.
class SettingsShowcase extends StatefulWidget {
  const SettingsShowcase({super.key});

  @override
  State<SettingsShowcase> createState() => _SettingsShowcaseState();
}

class _SettingsShowcaseState extends State<SettingsShowcase> {
  final _search = TextEditingController();
  Timer? _debounce;

  List<TitleItem> _results = [];
  List<TitleItem> _chosen = [];
  bool _searching = false;
  bool _loading = true;
  SaveState _save = SaveState.idle;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final list = await context.read<CatalogApi>().favorites();
      if (mounted) {
        setState(() {
          _chosen = list;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _onSearch(String q) {
    _debounce?.cancel();
    if (q.trim().length < 2) {
      setState(() {
        _results = [];
        _searching = false;
      });
      return;
    }
    setState(() => _searching = true);
    _debounce = Timer(const Duration(milliseconds: 320), () async {
      try {
        final res = await context.read<CatalogApi>().searchTitles(q.trim());
        if (mounted) {
          setState(() {
            _results = res;
            _searching = false;
          });
        }
      } catch (_) {
        if (mounted) setState(() => _searching = false);
      }
    });
  }

  bool _isChosen(TitleItem t) => _chosen.any((x) => x.kpId == t.kpId);

  void _toggle(TitleItem t) {
    setState(() {
      if (_isChosen(t)) {
        _chosen.removeWhere((x) => x.kpId == t.kpId);
      } else {
        // Предела витрине не ставим: сервер принимает список целиком, а в
        // профиле она листается лентой.
        _chosen = [..._chosen, t];
      }
    });
  }

  void _move(int index, int delta) {
    final to = index + delta;
    if (to < 0 || to >= _chosen.length) return;
    setState(() {
      final list = [..._chosen];
      final item = list.removeAt(index);
      list.insert(to, item);
      _chosen = list;
    });
  }

  Future<void> _submit() async {
    setState(() => _save = SaveState.saving);
    try {
      final saved = await context.read<CatalogApi>().setFavorites(_chosen);
      if (mounted) {
        setState(() {
          _chosen = saved;
          _save = SaveState.saved;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _save = SaveState.idle);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        VellinCard(
          title: 'Найти фильм или сериал',
          children: [
            VellinSearchField(
              controller: _search,
              placeholder: 'Название',
              onChanged: _onSearch,
              height: VellinLayout.fieldHeight,
            ),
            if (_searching)
              const Padding(
                padding: EdgeInsets.only(top: 4),
                child: Column(
                  children: [
                    _ResultSkeleton(),
                    SizedBox(height: 8),
                    _ResultSkeleton(),
                  ],
                ),
              )
            else if (_results.isNotEmpty)
              Column(
                children: [
                  for (final t in _results.take(8))
                    _ResultRow(
                      title: t,
                      chosen: _isChosen(t),
                      onTap: () => _toggle(t),
                    ),
                ],
              ),
          ],
        ),
        const SizedBox(height: VellinLayout.gapCard),
        VellinCard(
          title: 'Витрина · ${_chosen.length}',
          children: [
            if (_loading)
              const _ResultSkeleton()
            else if (_chosen.isEmpty)
              Text(
                'Пока пусто. Найдите фильмы через поиск выше — они появятся в профиле.',
                style: VellinType.caption.copyWith(fontSize: 12.5, height: 1.6),
              )
            else
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  for (var i = 0; i < _chosen.length; i++)
                    _ShowcaseCard(
                      title: _chosen[i],
                      position: i + 1,
                      onRemove: () => _toggle(_chosen[i]),
                      onLeft: i > 0 ? () => _move(i, -1) : null,
                      onRight: i < _chosen.length - 1 ? () => _move(i, 1) : null,
                    ),
                ],
              ),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [SaveButton(
                state: _save,
                label: 'Сохранить витрину',
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

/// Строка результата поиска: постер, название, год и отметка выбора.
class _ResultRow extends StatelessWidget {
  final TitleItem title;
  final bool chosen;
  final VoidCallback onTap;

  const _ResultRow({
    required this.title,
    required this.chosen,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final url = AppConfig.mediaUrl(title.posterUrl);

    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: VellinInteractive(
        onTap: onTap,
        focusRadius: BorderRadius.circular(VellinRadius.row),
        builder: (context, s) {
          final hot = s.hovered || s.pressed;
          return AnimatedContainer(
            duration: VellinMotion.hover,
            curve: VellinMotion.standard,
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: chosen
                  ? const Color(0x17E2C99B)
                  : hot
                      ? VellinColors.fill055
                      : const Color(0x00000000),
              borderRadius: BorderRadius.circular(VellinRadius.row),
              border: Border.all(
                color: chosen ? const Color(0x42E2C99B) : const Color(0x00000000),
              ),
            ),
            child: Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: Container(
                      width: 34,
                      height: 50,
                      color: VellinColors.bg5,
                      child: url == null
                          ? null
                          : Image.network(url, fit: BoxFit.cover,
                              errorBuilder: (_, _, _) => const SizedBox.shrink()),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: VellinType.rowTitle,
                        ),
                        const SizedBox(height: 3),
                        Text(
                          [
                            if (title.year != null) '${title.year}',
                            title.type == 'tv-series' ? 'сериал' : 'фильм',
                          ].join(' · '),
                          style: VellinType.caption.copyWith(fontFeatures: VellinType.tabular),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  _Checkbox(checked: chosen),
                ],
              ),
          );
        },
      ),
    );
  }
}

class _Checkbox extends StatelessWidget {
  final bool checked;
  const _Checkbox({required this.checked});

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: VellinMotion.state,
      curve: VellinMotion.standard,
      width: 20,
      height: 20,
      decoration: BoxDecoration(
        color: checked ? VellinColors.accent : const Color(0x00000000),
        borderRadius: BorderRadius.circular(VellinRadius.check),
        border: Border.all(color: checked ? VellinColors.accent : VellinColors.line12),
      ),
      alignment: Alignment.center,
      child: checked
          ? const VellinIcon(VellinGlyphs.check, size: 12, color: VellinColors.onAccent)
          : null,
    );
  }
}

/// Карточка витрины: постер, номер позиции, удаление и стрелки порядка.
class _ShowcaseCard extends StatelessWidget {
  final TitleItem title;
  final int position;
  final VoidCallback onRemove;
  final VoidCallback? onLeft;
  final VoidCallback? onRight;

  const _ShowcaseCard({
    required this.title,
    required this.position,
    required this.onRemove,
    required this.onLeft,
    required this.onRight,
  });

  @override
  Widget build(BuildContext context) {
    final url = AppConfig.mediaUrl(title.posterUrl);

    return SizedBox(
      width: 104,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Stack(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(VellinRadius.row),
                child: Container(
                  width: 104,
                  height: 152,
                  color: VellinColors.bg5,
                  child: url == null
                      ? null
                      : Image.network(url, fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => const SizedBox.shrink()),
                ),
              ),
              Positioned(
                left: 6,
                top: 6,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: VellinColors.glassPill,
                    borderRadius: BorderRadius.circular(VellinRadius.pill),
                  ),
                  child: Text(
                    '$position',
                    style: VellinType.time.copyWith(color: VellinColors.accent),
                  ),
                ),
              ),
              Positioned(
                right: 4,
                top: 4,
                child: VellinIconButton(
                  glyph: VellinGlyphs.closeSmall,
                  onPressed: onRemove,
                  size: 24,
                  radius: 12,
                  glyphSize: 9,
                  filled: false,
                  color: VellinColors.ink72,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            title.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: VellinType.rowSub.copyWith(fontSize: 12, color: VellinColors.ink72),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              VellinIconButton(
                glyph: VellinGlyphs.arrowLeft,
                onPressed: onLeft,
                size: 26,
                radius: VellinRadius.chip,
                glyphSize: 12,
              ),
              const SizedBox(width: 6),
              VellinIconButton(
                glyph: VellinGlyphs.arrowRight,
                onPressed: onRight,
                size: 26,
                radius: VellinRadius.chip,
                glyphSize: 12,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ResultSkeleton extends StatelessWidget {
  const _ResultSkeleton();

  @override
  Widget build(BuildContext context) {
    return const Row(
      children: [
        VellinSkeleton(width: 34, height: 50, radius: 6),
        SizedBox(width: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            VellinSkeleton(width: 180, height: 10),
            SizedBox(height: 8),
            VellinSkeleton(width: 90, height: 9, color: Color(0xFF161413)),
          ],
        ),
      ],
    );
  }
}
