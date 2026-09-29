import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';

import '../theme/call_design.dart';
import '../webrtc/screen_share.dart';
import 'call/call_bits.dart';
import 'call/call_glyphs.dart';

/// Что выбрал пользователь в окне демонстрации.
typedef ScreenSharePick = ({
  ScreenShareSource source,
  ScreenShareOptions options,
  bool showPreview,
});

/// Выбор того, что показать: экран целиком или отдельное окно, со звуком или
/// без, и с каким качеством.
///
/// Не `showDialog`: экран звонка живёт выше навигатора приложения — в
/// собственном слое, — и обычный диалог там открыть не из чего. Поэтому это
/// просто виджет, который слой звонка рисует поверх себя.
class ScreenSharePicker extends StatefulWidget {
  final ValueChanged<ScreenSharePick> onPick;
  final VoidCallback onCancel;

  /// Кому показываем — имя идёт в подзаголовок.
  final String peerName;

  /// Настройка уже идущей демонстрации: показываем её нынешние значения и
  /// заранее отмечаем показываемый источник.
  final ScreenShareOptions? initialOptions;
  final String? initialSourceId;
  final bool adjusting;

  /// Показывается ли сейчас своё превью — переключатель в окне отражает это.
  final bool showPreview;

  const ScreenSharePicker({
    super.key,
    required this.onPick,
    required this.onCancel,
    required this.peerName,
    this.initialOptions,
    this.initialSourceId,
    this.adjusting = false,
    this.showPreview = false,
  });

  @override
  State<ScreenSharePicker> createState() => _ScreenSharePickerState();
}

class _ScreenSharePickerState extends State<ScreenSharePicker> {
  List<ScreenShareSource> _sources = const [];
  String? _selectedId;
  ScreenShareOptions _options = const ScreenShareOptions();
  late bool _showPreview = widget.showPreview;
  bool _loading = true;
  Timer? _refresh;

  @override
  void initState() {
    super.initState();
    _selectedId = widget.initialSourceId;
    final initial = widget.initialOptions;
    if (initial != null) _options = initial;
    _load();
    // Окна открываются и закрываются, пока окно выбора висит: подновляем список.
    _refresh = Timer.periodic(const Duration(seconds: 3), (_) => _load(quiet: true));
  }

  @override
  void dispose() {
    _refresh?.cancel();
    super.dispose();
  }

  Future<void> _load({bool quiet = false}) async {
    if (!quiet) {
      // У идущей демонстрации свои значения — запомненные их не перебивают.
      if (widget.initialOptions == null) {
        final saved = await ScreenShareSettings.load();
        if (mounted) setState(() => _options = saved);
      }
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
      // Ничего не выбрано — берём первый экран: чаще всего показывают именно его.
      _selectedId ??= list.isEmpty ? null : list.first.id;
    });
  }

  ScreenShareSource? get _selected {
    final id = _selectedId;
    if (id == null) return null;
    for (final s in _sources) {
      if (s.id == id) return s;
    }
    return null;
  }

  /// Экраны идут первыми: их показывают чаще, и их всегда единицы.
  List<ScreenShareSource> get _ordered {
    final screens = _sources.where((s) => s.kind == ScreenShareKind.screen).toList();
    final windows = _sources.where((s) => s.kind == ScreenShareKind.window).toList();
    return [...screens, ...windows];
  }

  @override
  Widget build(BuildContext context) {
    final selected = _selected;
    return _ModalScrim(
      onDismiss: widget.onCancel,
      child: Container(
        width: 920,
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height - 80),
        decoration: BoxDecoration(
          color: const Color(0xEB0F0E0D),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.95),
              blurRadius: 140,
              offset: const Offset(0, 60),
              spreadRadius: -40,
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(32, 28, 32, 20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(
                widget.adjusting ? 'Настройка демонстрации' : 'Поделиться экраном',
                style: TextStyle(
                  fontFamily: CallText.family,
                  fontSize: 22,
                  fontWeight: FontWeight.w400,
                  letterSpacing: 0.22,
                  color: CallColors.textPrimary,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Выберите, что увидит ${widget.peerName}',
                style: TextStyle(
                  fontFamily: CallText.family,
                  fontSize: 13,
                  color: CallColors.textFaint,
                ),
              ),
            ]),
          ),
          Flexible(
            child: _loading
                ? const Padding(
                    padding: EdgeInsets.symmetric(vertical: 60),
                    child: Center(child: CircularProgressIndicator(color: CallColors.gold)),
                  )
                : _ordered.isEmpty
                    ? Padding(
                        padding: const EdgeInsets.symmetric(vertical: 60),
                        child: Center(
                          child: Text('Показывать нечего',
                              style: TextStyle(
                                  fontFamily: CallText.family,
                                  fontSize: 13,
                                  color: CallColors.textFaint)),
                        ),
                      )
                    : GridView.builder(
                        shrinkWrap: true,
                        padding: const EdgeInsets.fromLTRB(32, 0, 32, 22),
                        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 3,
                          crossAxisSpacing: 16,
                          mainAxisSpacing: 16,
                          childAspectRatio: 16 / 12.4,
                        ),
                        itemCount: _ordered.length,
                        itemBuilder: (_, i) {
                          final s = _ordered[i];
                          return _SourceCard(
                            source: s,
                            selected: s.id == _selectedId,
                            onTap: () => setState(() => _selectedId = s.id),
                          );
                        },
                      ),
          ),
          Container(height: 1, margin: const EdgeInsets.symmetric(horizontal: 32), color: CallColors.divider),
          Padding(
            padding: const EdgeInsets.fromLTRB(32, 22, 32, 6),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const CallSectionLabel('Разрешение'),
                  const SizedBox(height: 10),
                  CallSegmented<ScreenResolution>(
                    value: _options.resolution,
                    items: ScreenResolution.values.map((r) => (value: r, label: r.label)).toList(),
                    onChanged: (v) => setState(() => _options = _options.copyWith(resolution: v)),
                  ),
                ]),
              ),
              const SizedBox(width: 26),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const CallSectionLabel('Частота кадров'),
                  const SizedBox(height: 10),
                  CallSegmented<int>(
                    value: _options.fps,
                    items: const [(value: 15, label: '15'), (value: 30, label: '30'), (value: 60, label: '60')],
                    onChanged: (v) => setState(() => _options = _options.copyWith(fps: v)),
                  ),
                ]),
              ),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(32, 18, 32, 4),
            child: Column(children: [
              _SettingRow(
                title: selected?.kind == ScreenShareKind.window
                    ? 'Передавать звук приложения'
                    : 'Передавать звук системы',
                hint: selected?.kind == ScreenShareKind.window
                    ? 'Собеседник услышит только это окно'
                    : 'Собеседник услышит звук фильма',
                value: _options.withAudio,
                onChanged: (v) => setState(() => _options = _options.copyWith(withAudio: v)),
              ),
              _SettingRow(
                title: 'Показывать превью демонстрации',
                hint: 'Небольшое окно поверх звонка',
                value: _showPreview,
                onChanged: (v) => setState(() => _showPreview = v),
              ),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(32, 20, 32, 28),
            child: Row(mainAxisAlignment: MainAxisAlignment.end, children: [
              _PillButton(label: 'Отмена', onTap: widget.onCancel),
              const SizedBox(width: 12),
              _PillButton(
                label: widget.adjusting ? 'Применить' : 'Начать демонстрацию',
                primary: true,
                onTap: selected == null
                    ? null
                    : () => widget.onPick(
                          (source: selected, options: _options, showPreview: _showPreview),
                        ),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}

/// Затемнение с размытием и всплывающая карточка: общий вход для модальных
/// окон звонка.
class _ModalScrim extends StatefulWidget {
  final Widget child;
  final VoidCallback onDismiss;
  const _ModalScrim({required this.child, required this.onDismiss});

  @override
  State<_ModalScrim> createState() => _ModalScrimState();
}

class _ModalScrimState extends State<_ModalScrim> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: CallMotion.slow,
  )..forward();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, child) {
        final t = CallMotion.ease.transform(_c.value);
        return Stack(children: [
          // Клик мимо карточки закрывает окно — обычное поведение модального.
          Positioned.fill(
            child: GestureDetector(
              onTap: widget.onDismiss,
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 8 * t, sigmaY: 8 * t),
                child: Container(color: const Color(0x8C040404).withValues(alpha: 0.55 * t)),
              ),
            ),
          ),
          Positioned.fill(
            child: Center(
              child: Opacity(
                opacity: t,
                child: Transform.translate(
                  offset: Offset(0, 22 * (1 - t)),
                  child: Transform.scale(
                    scale: 0.965 + 0.035 * t,
                    // Нажатия по самой карточке не должны закрывать окно.
                    child: GestureDetector(onTap: () {}, child: child),
                  ),
                ),
              ),
            ),
          ),
        ]);
      },
      child: widget.child,
    );
  }
}

/// Карточка источника: миниатюра, имя и пояснение.
class _SourceCard extends StatefulWidget {
  final ScreenShareSource source;
  final bool selected;
  final VoidCallback onTap;
  const _SourceCard({required this.source, required this.selected, required this.onTap});

  @override
  State<_SourceCard> createState() => _SourceCardState();
}

class _SourceCardState extends State<_SourceCard> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final thumb = widget.source.raw.thumbnail;
    final isScreen = widget.source.kind == ScreenShareKind.screen;
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: CallMotion.base,
          curve: CallMotion.ease,
          padding: const EdgeInsets.all(11),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            color: widget.selected
                ? CallColors.gold.withValues(alpha: 0.07)
                : Colors.white.withValues(alpha: _hover ? 0.05 : 0.025),
            border: Border.all(
              color: widget.selected ? CallColors.gold.withValues(alpha: 0.42) : CallColors.stroke,
            ),
            boxShadow: widget.selected
                ? [
                    BoxShadow(
                      color: const Color(0xFFC49E66).withValues(alpha: 0.4),
                      blurRadius: 40,
                      spreadRadius: -12,
                    ),
                  ]
                : const [],
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  color: CallColors.surfaceRaised,
                  child: thumb != null && thumb.isNotEmpty
                      ? Image.memory(thumb, fit: BoxFit.cover, gaplessPlayback: true)
                      : Center(
                          child: CallIcon(
                            isScreen ? CallGlyphs.monitor : CallGlyphs.split,
                            size: 22,
                            color: CallColors.textLabel,
                          ),
                        ),
                ),
              ),
            ),
            const SizedBox(height: 11),
            Text(
              isScreen ? widget.source.name : 'Окно · ${widget.source.name}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontFamily: CallText.family,
                fontSize: 13,
                color: Colors.white.withValues(alpha: 0.86),
              ),
            ),
            const SizedBox(height: 2),
            Text(
              isScreen ? 'Экран целиком' : 'Только это приложение',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontFamily: CallText.family,
                fontSize: 11.5,
                color: CallColors.textLabel,
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

/// Строка настройки с переключателем.
class _SettingRow extends StatelessWidget {
  final String title;
  final String hint;
  final bool value;
  final ValueChanged<bool> onChanged;
  const _SettingRow({
    required this.title,
    required this.hint,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: () => onChanged(!value),
        behavior: HitTestBehavior.opaque,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, style: CallText.row.copyWith(color: Colors.white.withValues(alpha: 0.82))),
                const SizedBox(height: 3),
                Text(hint, style: CallText.rowHint),
              ]),
            ),
            const SizedBox(width: 16),
            CallSwitch(value: value, onChanged: onChanged),
          ]),
        ),
      ),
    );
  }
}

/// Кнопка-пилюля внизу окна. Основная — белая с тёмной надписью.
class _PillButton extends StatefulWidget {
  final String label;
  final VoidCallback? onTap;
  final bool primary;
  const _PillButton({required this.label, required this.onTap, this.primary = false});

  @override
  State<_PillButton> createState() => _PillButtonState();
}

class _PillButtonState extends State<_PillButton> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onTap != null;
    return MouseRegion(
      cursor: enabled ? SystemMouseCursors.click : SystemMouseCursors.basic,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedSlide(
          offset: Offset(0, _hover && enabled && widget.primary ? -0.05 : 0),
          duration: CallMotion.fast,
          curve: CallMotion.ease,
          child: AnimatedContainer(
            duration: CallMotion.fast,
            curve: CallMotion.ease,
            padding: EdgeInsets.symmetric(horizontal: widget.primary ? 30 : 26, vertical: 13),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              color: widget.primary
                  ? (enabled ? Colors.white : Colors.white.withValues(alpha: 0.25))
                  : (_hover ? Colors.white.withValues(alpha: 0.07) : Colors.transparent),
              border: widget.primary ? null : Border.all(color: CallColors.strokeSoft),
              boxShadow: widget.primary && enabled
                  ? [
                      BoxShadow(
                        color: Colors.white.withValues(alpha: _hover ? 0.45 : 0.35),
                        blurRadius: _hover ? 50 : 40,
                        offset: const Offset(0, 16),
                        spreadRadius: -14,
                      ),
                    ]
                  : const [],
            ),
            child: Text(
              widget.label,
              style: TextStyle(
                fontFamily: CallText.family,
                fontSize: 13.5,
                fontWeight: widget.primary ? FontWeight.w600 : FontWeight.w400,
                color: widget.primary
                    ? const Color(0xFF141210)
                    : (_hover ? Colors.white : Colors.white.withValues(alpha: 0.72)),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
