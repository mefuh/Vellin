import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart' show InputDecoration, TextField;
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../../runtime/clipboard_images.dart';
import '../../theme/vellin_design.dart';
import '../../theme/vellin_glyphs.dart';
import '../ui/vellin_button.dart';
import '../ui/vellin_icon.dart';
import 'message_dialogs.dart';

/// Что отправить: фото по порядку и подпись.
class PhotoDraft {
  final List<String> paths;
  final String caption;
  const PhotoDraft(this.paths, this.caption);
}

/// Окно отправки фото: превью, добавление из других папок и из буфера,
/// подпись. Возвращает черновик или null, если окно закрыли.
Future<PhotoDraft?> showPhotoSendDialog(
  BuildContext context, {
  required List<String> initial,
  String caption = '',
  int max = 10,
}) {
  return showVellinModal<PhotoDraft>(
    context,
    width: 468,
    builder: (context, close) => _PhotoSendBody(
      initial: initial,
      caption: caption,
      max: max,
      onClose: close,
    ),
  );
}

class _Photo {
  final int id;
  final String path;
  bool removing = false;

  /// Пришло при открытии окна — появляется лесенкой вместе с ним; добавленное
  /// потом — сразу, без задержки.
  final int stagger;

  _Photo(this.id, this.path, {this.stagger = -1});
}

class _PhotoSendBody extends StatefulWidget {
  final List<String> initial;
  final String caption;
  final int max;
  final void Function([PhotoDraft? result]) onClose;

  const _PhotoSendBody({
    required this.initial,
    required this.caption,
    required this.max,
    required this.onClose,
  });

  @override
  State<_PhotoSendBody> createState() => _PhotoSendBodyState();
}

class _PhotoSendBodyState extends State<_PhotoSendBody> with SingleTickerProviderStateMixin {
  late final TextEditingController _caption = TextEditingController(text: widget.caption);
  final _captionFocus = FocusNode();
  final List<_Photo> _photos = [];
  int _seq = 0;

  /// Подсказка о потолке: вспыхивает, когда добавили больше, чем влезает.
  late final AnimationController _limit = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2200),
  );

  List<_Photo> get _alive => _photos.where((p) => !p.removing).toList();

  @override
  void initState() {
    super.initState();
    _add(widget.initial, initial: true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _captionFocus.requestFocus();
    });
  }

  @override
  void dispose() {
    _caption.dispose();
    _captionFocus.dispose();
    _limit.dispose();
    super.dispose();
  }

  void _add(Iterable<String> paths, {bool initial = false}) {
    final room = widget.max - _alive.length;
    final fresh = paths.where(isPhotoPath).toList();
    if (fresh.length > room) _limit.forward(from: 0);
    final taken = fresh.take(room < 0 ? 0 : room).toList();
    if (taken.isEmpty) return;
    setState(() {
      for (var i = 0; i < taken.length; i++) {
        _photos.add(_Photo(_seq++, taken[i], stagger: initial ? i : -1));
      }
    });
  }

  Future<void> _pick() async {
    final picked = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: photoExtensions,
      allowMultiple: true,
    );
    if (!mounted) return;
    _add((picked?.files ?? const []).map((f) => f.path).whereType<String>());
  }

  Future<void> _paste() async {
    final photos = await readClipboardPhotos();
    if (mounted && photos.isNotEmpty) _add(photos);
  }

  void _remove(_Photo p) => setState(() => p.removing = true);

  void _gone(_Photo p) {
    if (mounted) setState(() => _photos.remove(p));
  }

  void _send() {
    final alive = _alive;
    if (alive.isEmpty) return;
    widget.onClose(PhotoDraft([for (final p in alive) p.path], _caption.text));
  }

  /// Ctrl+V в окне — вставить фото из буфера. Текст при этом по-прежнему
  /// вставляется в подпись: событие не гасится, фото добавятся следом.
  KeyEventResult _onKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    final ctrl = HardwareKeyboard.instance.isControlPressed;
    if (ctrl && event.logicalKey == LogicalKeyboardKey.keyV) _paste();
    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    final count = _alive.length;
    return Focus(
      canRequestFocus: false,
      skipTraversal: true,
      onKeyEvent: _onKey,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(22, 18, 22, 18),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(child: Text('Отправить фото', style: VellinType.cardTitle)),
                _Counter(count: count, max: widget.max, limit: _limit),
                const SizedBox(width: 6),
                VellinIconButton(
                  glyph: VellinGlyphs.cross,
                  onPressed: () => widget.onClose(),
                  size: 30,
                  radius: VellinRadius.mini,
                  glyphSize: 15,
                  filled: false,
                ),
              ],
            ),
            const SizedBox(height: 14),
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 330),
              child: SingleChildScrollView(
                child: AnimatedSize(
                  duration: VellinMotion.hover,
                  curve: VellinMotion.standard,
                  alignment: Alignment.topLeft,
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final p in _photos)
                        _PhotoTile(
                          key: ValueKey(p.id),
                          path: p.path,
                          removing: p.removing,
                          stagger: p.stagger,
                          onRemove: () => _remove(p),
                          onGone: () => _gone(p),
                        ),
                      _AddTile(visible: count < widget.max, onTap: _pick),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Text(
              'Ещё фото — кнопкой «Добавить» из любой папки или Ctrl+V из буфера обмена',
              style: VellinType.caption.copyWith(fontSize: 11.5, color: VellinColors.ink34),
            ),
            const SizedBox(height: 14),
            _CaptionField(controller: _caption, focusNode: _captionFocus, onSubmit: _send),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                VellinButton(
                  label: 'Отмена',
                  tone: VellinButtonTone.ghost,
                  height: 38,
                  onPressed: () => widget.onClose(),
                ),
                const SizedBox(width: 8),
                VellinButton(
                  label: 'Отправить',
                  glyph: VellinGlyphs.send,
                  tone: VellinButtonTone.primary,
                  height: 38,
                  onPressed: count == 0 ? null : _send,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// «3 из 10». При попытке добавить сверх потолка подпись вздрагивает и на
/// пару секунд становится сигнальной.
class _Counter extends StatelessWidget {
  final int count;
  final int max;
  final AnimationController limit;

  const _Counter({required this.count, required this.max, required this.limit});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: limit,
      builder: (context, _) {
        final v = limit.value;
        final active = limit.isAnimating;
        // Три затухающих качания в первые 400 мс, потом цвет медленно гаснет.
        final shake = active && v < 0.18 ? (1 - v / 0.18) * 3 * _wave(v * 40) : 0.0;
        final warn = active ? (v < 0.7 ? 1.0 : 1 - (v - 0.7) / 0.3) : 0.0;
        return Transform.translate(
          offset: Offset(shake, 0),
          child: Text(
            active ? 'не больше $max' : '$count из $max',
            style: VellinType.caption.copyWith(
              fontSize: 12,
              fontFeatures: VellinType.tabular,
              color: Color.lerp(VellinColors.ink45, VellinColors.warning, warn),
            ),
          ),
        );
      },
    );
  }

  static double _wave(double x) {
    final f = x % 2;
    return f < 1 ? f * 2 - 1 : 1 - (f - 1) * 2;
  }
}

class _PhotoTile extends StatefulWidget {
  final String path;
  final bool removing;
  final int stagger;
  final VoidCallback onRemove;
  final VoidCallback onGone;

  const _PhotoTile({
    super.key,
    required this.path,
    required this.removing,
    required this.stagger,
    required this.onRemove,
    required this.onGone,
  });

  @override
  State<_PhotoTile> createState() => _PhotoTileState();
}

class _PhotoTileState extends State<_PhotoTile> with SingleTickerProviderStateMixin {
  static const _size = 98.0;

  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 440),
    reverseDuration: VellinMotion.quick,
  );
  bool _hover = false;

  @override
  void initState() {
    super.initState();
    if (widget.stagger < 0) {
      _c.forward();
    } else {
      // Первые фото приходят за окном лесенкой, а не все разом.
      Future<void>.delayed(const Duration(milliseconds: 120) + VellinMotion.stagger * widget.stagger, () {
        if (mounted) _c.forward();
      });
    }
  }

  @override
  void didUpdateWidget(_PhotoTile old) {
    super.didUpdateWidget(old);
    if (widget.removing && !old.removing) {
      _c.reverse().whenComplete(() {
        if (mounted) widget.onGone();
      });
    }
  }

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
        final reverse = _c.status == AnimationStatus.reverse;
        final t = reverse ? VellinMotion.exit.transform(_c.value) : VellinMotion.standard.transform(_c.value);
        // Уходящее фото схлопывает место — соседи съезжаются, а не прыгают.
        return ClipRect(
          child: Align(
            alignment: Alignment.centerLeft,
            widthFactor: reverse ? t : 1,
            child: Opacity(
              opacity: t.clamp(0.0, 1.0),
              child: Transform.scale(scale: 0.86 + 0.14 * t, child: child),
            ),
          ),
        );
      },
      child: MouseRegion(
        onEnter: (_) => setState(() => _hover = true),
        onExit: (_) => setState(() => _hover = false),
        child: SizedBox(
          width: _size,
          height: _size,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(VellinRadius.row),
            child: Stack(
              fit: StackFit.expand,
              children: [
                const ColoredBox(color: VellinColors.skeleton),
                AnimatedScale(
                  duration: VellinMotion.state,
                  curve: VellinMotion.standard,
                  scale: _hover ? 1.06 : 1,
                  child: Image.file(
                    File(widget.path),
                    fit: BoxFit.cover,
                    cacheWidth: 240,
                    errorBuilder: (_, _, _) => const ColoredBox(color: VellinColors.skeleton),
                  ),
                ),
                // Крестик проявляется при наведении — в покое превью чистое.
                Positioned(
                  top: 5,
                  right: 5,
                  child: AnimatedOpacity(
                    duration: VellinMotion.hover,
                    curve: VellinMotion.standard,
                    opacity: _hover ? 1 : 0,
                    child: AnimatedScale(
                      duration: VellinMotion.hover,
                      curve: VellinMotion.standard,
                      scale: _hover ? 1 : 0.7,
                      child: _RemoveButton(onTap: widget.onRemove),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _RemoveButton extends StatefulWidget {
  final VoidCallback onTap;
  const _RemoveButton({required this.onTap});

  @override
  State<_RemoveButton> createState() => _RemoveButtonState();
}

class _RemoveButtonState extends State<_RemoveButton> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: VellinMotion.micro,
          curve: VellinMotion.standard,
          width: 22,
          height: 22,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: _hover ? VellinColors.danger : const Color(0xCC0C0B0A),
            border: Border.all(color: VellinColors.line10),
          ),
          alignment: Alignment.center,
          child: const VellinIcon(
            VellinGlyphs.closeSmall,
            size: 9,
            box: Size(11, 11),
            color: VellinColors.ink92,
            stroke: 1.6,
          ),
        ),
      ),
    );
  }
}

/// Плитка «Добавить». Исчезает, когда набран потолок, и возвращается, когда
/// фото убрали.
class _AddTile extends StatefulWidget {
  final bool visible;
  final VoidCallback onTap;
  const _AddTile({required this.visible, required this.onTap});

  @override
  State<_AddTile> createState() => _AddTileState();
}

class _AddTileState extends State<_AddTile> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(end: widget.visible ? 1 : 0),
      duration: widget.visible ? VellinMotion.hover : VellinMotion.quick,
      curve: widget.visible ? VellinMotion.standard : VellinMotion.exit,
      builder: (context, t, child) {
        if (t == 0) return const SizedBox.shrink();
        return ClipRect(
          child: Align(
            alignment: Alignment.centerLeft,
            widthFactor: t,
            child: Opacity(opacity: t, child: Transform.scale(scale: 0.86 + 0.14 * t, child: child)),
          ),
        );
      },
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        onEnter: (_) => setState(() => _hover = true),
        onExit: (_) => setState(() => _hover = false),
        child: GestureDetector(
          onTap: widget.onTap,
          child: AnimatedContainer(
            duration: VellinMotion.hover,
            curve: VellinMotion.standard,
            width: 98,
            height: 98,
            decoration: BoxDecoration(
              color: _hover ? const Color(0x14E2C99B) : VellinColors.fill03,
              borderRadius: BorderRadius.circular(VellinRadius.row),
              border: Border.all(color: _hover ? VellinColors.accentLine : VellinColors.line09),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                AnimatedRotation(
                  duration: VellinMotion.state,
                  curve: VellinMotion.standard,
                  turns: _hover ? 0.25 : 0,
                  child: VellinIcon(
                    VellinGlyphs.plus,
                    size: 20,
                    color: _hover ? VellinColors.accent : VellinColors.ink45,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Добавить',
                  style: VellinType.caption.copyWith(
                    fontSize: 11.5,
                    color: _hover ? VellinColors.accent : VellinColors.ink45,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Подпись к фото: Enter отправляет, Shift+Enter переносит строку.
class _CaptionField extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode focusNode;
  final VoidCallback onSubmit;

  const _CaptionField({required this.controller, required this.focusNode, required this.onSubmit});

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 44),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
      decoration: BoxDecoration(
        color: VellinColors.fill045,
        borderRadius: BorderRadius.circular(VellinRadius.row),
        border: Border.all(color: VellinColors.line09),
      ),
      child: Focus(
        canRequestFocus: false,
        skipTraversal: true,
        onKeyEvent: (node, event) {
          if (event is! KeyDownEvent) return KeyEventResult.ignored;
          final enter = event.logicalKey == LogicalKeyboardKey.enter || event.logicalKey == LogicalKeyboardKey.numpadEnter;
          if (!enter || HardwareKeyboard.instance.isShiftPressed) return KeyEventResult.ignored;
          onSubmit();
          return KeyEventResult.handled;
        },
        child: TextField(
          controller: controller,
          focusNode: focusNode,
          minLines: 1,
          maxLines: 4,
          style: TextStyle(fontFamily: VellinType.family, fontSize: 13.5, height: 1.4, color: VellinColors.ink92),
          cursorColor: VellinColors.accent,
          cursorWidth: 1.4,
          decoration: InputDecoration.collapsed(
            hintText: 'Подпись…',
            hintStyle: TextStyle(fontFamily: VellinType.family, fontSize: 13.5, color: const Color(0x5CFFFFFF)),
          ),
        ),
      ),
    );
  }
}
