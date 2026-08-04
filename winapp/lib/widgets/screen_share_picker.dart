import 'dart:async';

import 'package:flutter/material.dart';

import '../theme/vellin_theme.dart';
import '../webrtc/screen_share.dart';

/// Что выбрал пользователь в диалоге демонстрации.
typedef ScreenSharePick = ({ScreenShareSource source, ScreenShareOptions options});

/// Выбор того, что показать: экран целиком или отдельное окно, со звуком или
/// без, и с каким качеством.
///
/// Не `showDialog`: экран звонка живёт выше навигатора приложения — в
/// собственном слое, — и обычный диалог там открыть не из чего. Поэтому это
/// просто виджет, который слой звонка рисует поверх себя.
class ScreenSharePicker extends StatefulWidget {
  final ValueChanged<ScreenSharePick> onPick;
  final VoidCallback onCancel;
  const ScreenSharePicker({super.key, required this.onPick, required this.onCancel});

  @override
  State<ScreenSharePicker> createState() => _ScreenSharePickerState();
}

class _ScreenSharePickerState extends State<ScreenSharePicker> {
  List<ScreenShareSource> _sources = const [];
  ScreenShareKind _tab = ScreenShareKind.screen;
  String? _selectedId;
  ScreenShareOptions _options = const ScreenShareOptions();
  bool _loading = true;
  Timer? _refresh;

  @override
  void initState() {
    super.initState();
    _load();
    // Окна открываются и закрываются, пока диалог висит: подновляем список.
    _refresh = Timer.periodic(const Duration(seconds: 3), (_) => _load(quiet: true));
  }

  @override
  void dispose() {
    _refresh?.cancel();
    super.dispose();
  }

  Future<void> _load({bool quiet = false}) async {
    if (!quiet) {
      final saved = await ScreenShareSettings.load();
      if (mounted) setState(() => _options = saved);
    } else {
      await ScreenShare.refreshThumbnails();
    }
    final list = await ScreenShare.sources();
    if (!mounted) return;
    setState(() {
      _sources = list;
      _loading = false;
      // Выбор мог указывать на закрытое окно — тогда снимаем его.
      if (_selectedId != null && !list.any((s) => s.id == _selectedId)) _selectedId = null;
    });
  }

  List<ScreenShareSource> get _visible => _sources.where((s) => s.kind == _tab).toList();

  ScreenShareSource? get _selected {
    final id = _selectedId;
    if (id == null) return null;
    for (final s in _sources) {
      if (s.id == id) return s;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final selected = _selected;
    return Container(
      color: Colors.black.withValues(alpha: 0.62),
      alignment: Alignment.center,
      child: Container(
        width: 780,
        height: 560,
        decoration: BoxDecoration(
          color: VellinColors.bg1,
          borderRadius: BorderRadius.circular(VellinRadius.xl),
          border: Border.all(color: VellinColors.line2),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 20, 16, 12),
            child: Row(children: [
              const Text('Демонстрация экрана',
                  style: TextStyle(color: VellinColors.text0, fontSize: 18, fontWeight: FontWeight.w600)),
              const Spacer(),
              IconButton(
                icon: const Icon(Icons.close, color: VellinColors.text2),
                tooltip: 'Закрыть',
                onPressed: widget.onCancel,
              ),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Row(children: [
              _Tab(
                label: 'Экраны',
                active: _tab == ScreenShareKind.screen,
                onTap: () => setState(() => _tab = ScreenShareKind.screen),
              ),
              const SizedBox(width: 8),
              _Tab(
                label: 'Окна',
                active: _tab == ScreenShareKind.window,
                onTap: () => setState(() => _tab = ScreenShareKind.window),
              ),
            ]),
          ),
          const SizedBox(height: 14),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: VellinColors.accentHi))
                : _visible.isEmpty
                    ? const Center(
                        child: Text('Ничего не найдено',
                            style: TextStyle(color: VellinColors.text3, fontSize: 14)),
                      )
                    : GridView.builder(
                        padding: const EdgeInsets.symmetric(horizontal: 24),
                        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 3,
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                          childAspectRatio: 16 / 11,
                        ),
                        itemCount: _visible.length,
                        itemBuilder: (_, i) {
                          final s = _visible[i];
                          return _SourceCard(
                            source: s,
                            selected: s.id == _selectedId,
                            onTap: () => setState(() => _selectedId = s.id),
                          );
                        },
                      ),
          ),
          const Divider(height: 24, thickness: 1, color: VellinColors.line2),
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 0, 24, 20),
            child: Row(children: [
              _Dropdown<ScreenResolution>(
                label: 'Разрешение',
                value: _options.resolution,
                items: ScreenResolution.values.map((r) => (value: r, label: r.label)).toList(),
                onChanged: (v) => setState(() => _options = _options.copyWith(resolution: v)),
              ),
              const SizedBox(width: 14),
              _Dropdown<int>(
                label: 'Частота кадров',
                value: _options.fps,
                items: const [(value: 30, label: '30 кадров/с'), (value: 60, label: '60 кадров/с')],
                onChanged: (v) => setState(() => _options = _options.copyWith(fps: v)),
              ),
              const SizedBox(width: 18),
              // Звук: при захвате экрана уходит весь звук системы, при захвате
              // окна — только звук этого приложения.
              Expanded(
                child: InkWell(
                  borderRadius: BorderRadius.circular(VellinRadius.sm),
                  onTap: () => setState(() => _options = _options.copyWith(withAudio: !_options.withAudio)),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
                    child: Row(children: [
                      Checkbox(
                        value: _options.withAudio,
                        onChanged: (v) =>
                            setState(() => _options = _options.copyWith(withAudio: v ?? false)),
                        activeColor: VellinColors.accent,
                      ),
                      Flexible(
                        child: Text(
                          _tab == ScreenShareKind.window
                              ? 'Транслировать звук приложения'
                              : 'Транслировать звук системы',
                          style: const TextStyle(color: VellinColors.text1, fontSize: 13.5),
                        ),
                      ),
                    ]),
                  ),
                ),
              ),
              const SizedBox(width: 14),
              FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: VellinColors.accent,
                  padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 16),
                ),
                onPressed: selected == null
                    ? null
                    : () => widget.onPick((source: selected, options: _options)),
                child: const Text('Начать демонстрацию'),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _Tab extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _Tab({required this.label, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: active ? VellinColors.bg3 : Colors.transparent,
      borderRadius: BorderRadius.circular(VellinRadius.md),
      child: InkWell(
        borderRadius: BorderRadius.circular(VellinRadius.md),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
          child: Text(
            label,
            style: TextStyle(
              color: active ? VellinColors.text0 : VellinColors.text2,
              fontSize: 14,
              fontWeight: active ? FontWeight.w600 : FontWeight.w500,
            ),
          ),
        ),
      ),
    );
  }
}

class _SourceCard extends StatelessWidget {
  final ScreenShareSource source;
  final bool selected;
  final VoidCallback onTap;
  const _SourceCard({required this.source, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final thumb = source.raw.thumbnail;
    return Material(
      color: VellinColors.bg2,
      borderRadius: BorderRadius.circular(VellinRadius.md),
      child: InkWell(
        borderRadius: BorderRadius.circular(VellinRadius.md),
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(VellinRadius.md),
            border: Border.all(
              color: selected ? VellinColors.accent : VellinColors.line2,
              width: selected ? 2 : 1,
            ),
          ),
          padding: const EdgeInsets.all(8),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(VellinRadius.sm),
                child: thumb != null && thumb.isNotEmpty
                    ? Image.memory(thumb, fit: BoxFit.cover, gaplessPlayback: true)
                    : Container(
                        color: VellinColors.bg3,
                        child: Icon(
                          source.kind == ScreenShareKind.screen ? Icons.monitor : Icons.web_asset,
                          color: VellinColors.text3,
                        ),
                      ),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              source.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: VellinColors.text1, fontSize: 12.5),
            ),
          ]),
        ),
      ),
    );
  }
}

class _Dropdown<T> extends StatelessWidget {
  final String label;
  final T value;
  final List<({T value, String label})> items;
  final ValueChanged<T> onChanged;
  const _Dropdown({
    required this.label,
    required this.value,
    required this.items,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: const TextStyle(color: VellinColors.text3, fontSize: 11.5)),
      const SizedBox(height: 4),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: VellinColors.bg2,
          borderRadius: BorderRadius.circular(VellinRadius.sm),
          border: Border.all(color: VellinColors.line2),
        ),
        child: DropdownButton<T>(
          value: value,
          underline: const SizedBox.shrink(),
          dropdownColor: VellinColors.bg2,
          style: const TextStyle(color: VellinColors.text0, fontSize: 13.5),
          items: items
              .map((i) => DropdownMenuItem<T>(value: i.value, child: Text(i.label)))
              .toList(),
          onChanged: (v) {
            if (v != null) onChanged(v);
          },
        ),
      ),
    ]);
  }
}
