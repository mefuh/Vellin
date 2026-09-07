import 'dart:io';
import 'dart:ui' as ui;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:http/http.dart' as http;

import '../../theme/vellin_design.dart';
import '../../theme/vellin_glyphs.dart';
import '../ui/vellin_hover.dart';
import '../ui/vellin_icon.dart';

/// Показать изображение поверх всего окна.
///
/// Живёт в корневом Overlay, а не маршрутом: лайтбокс должен лежать выше
/// фрейма настроек и экрана звонка, а маршрут встал бы под ними.
void showVellinLightbox(
  BuildContext context, {
  required List<String> images,
  required int index,
}) {
  final overlay = Overlay.of(context, rootOverlay: true);
  late final OverlayEntry entry;
  entry = OverlayEntry(
    builder: (_) => _Lightbox(
      images: images,
      initialIndex: index,
      onClose: entry.remove,
    ),
  );
  overlay.insert(entry);
}

class _Lightbox extends StatefulWidget {
  final List<String> images;
  final int initialIndex;
  final VoidCallback onClose;

  const _Lightbox({
    required this.images,
    required this.initialIndex,
    required this.onClose,
  });

  @override
  State<_Lightbox> createState() => _LightboxState();
}

class _LightboxState extends State<_Lightbox> with SingleTickerProviderStateMixin {
  late int _index = widget.initialIndex;

  /// Масштаб в процентах: 100–300 шагом 25.
  int _zoom = 100;

  bool _fullscreen = false;

  /// Направление последнего листания: +1 вправо, −1 влево, 0 — открытие.
  int _slide = 0;

  late final AnimationController _open = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 500),
    reverseDuration: const Duration(milliseconds: 420),
  )..forward();

  late final AnimationController _page = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 460),
    value: 1,
  );

  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    // Фокус нужен сразу: листание и закрытие идут с клавиатуры.
    WidgetsBinding.instance.addPostFrameCallback((_) => _focus.requestFocus());
  }

  @override
  void dispose() {
    _open.dispose();
    _page.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _close() {
    // Уход — на разгонной кривой: на основной он гас за первые сто миллисекунд
    // и читался как рывок.
    _open.reverse().whenComplete(widget.onClose);
  }

  void _go(int delta) {
    final next = _index + delta;
    if (next < 0 || next >= widget.images.length) return;
    setState(() {
      _index = next;
      _slide = delta;
      _zoom = 100;
    });
    _page.forward(from: 0);
  }

  void _setZoom(int value) => setState(() => _zoom = value.clamp(100, 300));

  Future<void> _download() async {
    final url = widget.images[_index];
    final name = Uri.parse(url).pathSegments.isEmpty ? 'image.jpg' : Uri.parse(url).pathSegments.last;
    final target = await FilePicker.platform.saveFile(fileName: name);
    if (target == null) return;
    try {
      final res = await http.get(Uri.parse(url));
      if (res.statusCode == 200) await File(target).writeAsBytes(res.bodyBytes);
    } catch (_) {
      // Молча: пользователь увидит, что файла нет, а модалку с ошибкой поверх
      // лайтбокса показывать некуда.
    }
  }

  KeyEventResult _onKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    switch (event.logicalKey) {
      case LogicalKeyboardKey.escape:
        // Из полноэкранного режима Esc сначала возвращает обвязку: иначе
        // выйти из него нечем — все кнопки в этот момент скрыты.
        if (_fullscreen) {
          setState(() => _fullscreen = false);
        } else {
          _close();
        }
        return KeyEventResult.handled;
      case LogicalKeyboardKey.arrowLeft:
        _go(-1);
        return KeyEventResult.handled;
      case LogicalKeyboardKey.arrowRight:
        _go(1);
        return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    return Focus(
      focusNode: _focus,
      onKeyEvent: _onKey,
      child: AnimatedBuilder(
        animation: _open,
        builder: (context, _) {
          final t = _open.status == AnimationStatus.reverse
              ? VellinMotion.exit.transform(_open.value)
              : VellinMotion.standard.transform(_open.value);

          return Opacity(
            opacity: t,
            child: Stack(
              children: [
                // Подложка: единственный блюр на весь экран во всём клиенте.
                Positioned.fill(
                  child: GestureDetector(
                    onTap: _fullscreen ? () => setState(() => _fullscreen = false) : _close,
                    child: BackdropFilter(
                      filter: ui.ImageFilter.blur(
                        sigmaX: VellinBlur.overlay * t,
                        sigmaY: VellinBlur.overlay * t,
                      ),
                      child: const ColoredBox(color: VellinColors.scrim),
                    ),
                  ),
                ),
                Positioned.fill(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(72, 64, 72, 64),
                    child: Center(
                      child: Transform.scale(
                        scale: 0.92 + 0.08 * t,
                        child: _image(),
                      ),
                    ),
                  ),
                ),
                // Вся обвязка гаснет в полноэкранном режиме.
                AnimatedOpacity(
                  duration: VellinMotion.hover,
                  curve: VellinMotion.standard,
                  opacity: _fullscreen ? 0 : 1,
                  child: IgnorePointer(
                    ignoring: _fullscreen,
                    child: Stack(
                      children: [
                        if (widget.images.length > 1) _counter(),
                        if (_index > 0) _arrow(left: true),
                        if (_index < widget.images.length - 1) _arrow(left: false),
                        _toolbar(),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _image() {
    return AnimatedBuilder(
      animation: _page,
      builder: (context, child) {
        final p = VellinMotion.standard.transform(_page.value);
        return Opacity(
          opacity: p,
          child: Transform.translate(
            offset: Offset(_slide * 46 * (1 - p), 0),
            child: child,
          ),
        );
      },
      child: InteractiveViewer(
        minScale: 1,
        maxScale: 3,
        panEnabled: _zoom > 100,
        scaleEnabled: false,
        child: Transform.scale(
          scale: _zoom / 100,
          child: Image.network(
            widget.images[_index],
            fit: BoxFit.contain,
            errorBuilder: (_, _, _) => const SizedBox.shrink(),
          ),
        ),
      ),
    );
  }

  Widget _counter() {
    return Positioned(
      top: 44,
      left: 0,
      right: 0,
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          decoration: BoxDecoration(
            color: VellinColors.glassPill,
            borderRadius: BorderRadius.circular(VellinRadius.pill),
            border: Border.all(color: VellinColors.line10),
          ),
          child: Text(
            '${_index + 1} из ${widget.images.length}',
            style: VellinType.caption.copyWith(
              color: VellinColors.ink62,
              fontFeatures: VellinType.tabular,
            ),
          ),
        ),
      ),
    );
  }

  Widget _arrow({required bool left}) {
    return Positioned(
      left: left ? 18 : null,
      right: left ? null : 18,
      top: 0,
      bottom: 0,
      child: Center(
        child: VellinInteractive(
          onTap: () => _go(left ? -1 : 1),
          focusRadius: BorderRadius.circular(21),
          builder: (context, s) {
            final hot = s.hovered || s.pressed;
            return AnimatedContainer(
              duration: VellinMotion.hover,
              curve: VellinMotion.standard,
              transform: Matrix4.translationValues(hot ? (left ? -2 : 2) : 0, 0, 0),
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: hot ? const Color(0x29E2C99B) : const Color(0xB80E0C0B),
                border: Border.all(color: hot ? VellinColors.accentLine : VellinColors.line10),
              ),
              alignment: Alignment.center,
              child: VellinIcon(
                left ? VellinGlyphs.arrowLeft : VellinGlyphs.arrowRight,
                size: 16,
                color: hot ? VellinColors.accent : VellinColors.ink72,
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _toolbar() {
    return Positioned(
      left: 0,
      right: 0,
      bottom: 40,
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          decoration: BoxDecoration(
            color: const Color(0xC70E0C0B),
            borderRadius: BorderRadius.circular(VellinRadius.raised),
            border: Border.all(color: VellinColors.line10),
            boxShadow: VellinShadow.pill,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              _ToolButton(
                glyph: VellinGlyphs.zoomOut,
                box: const Size(16, 16),
                onTap: _zoom > 100 ? () => _setZoom(_zoom - 25) : null,
              ),
              SizedBox(
                width: 46,
                child: Text(
                  '$_zoom%',
                  textAlign: TextAlign.center,
                  style: VellinType.caption.copyWith(
                    color: VellinColors.ink62,
                    fontFeatures: VellinType.tabular,
                  ),
                ),
              ),
              _ToolButton(
                glyph: VellinGlyphs.zoomIn,
                box: const Size(16, 16),
                onTap: _zoom < 300 ? () => _setZoom(_zoom + 25) : null,
              ),
              const SizedBox(width: 6),
              _ToolButton(glyph: VellinGlyphs.download, onTap: _download),
              _ToolButton(
                glyph: VellinGlyphs.fullscreen,
                onTap: () => setState(() => _fullscreen = true),
              ),
              _ToolButton(glyph: VellinGlyphs.cross, onTap: _close),
            ],
          ),
        ),
      ),
    );
  }
}

class _ToolButton extends StatelessWidget {
  final List<String> glyph;
  final Size box;
  final VoidCallback? onTap;

  const _ToolButton({required this.glyph, this.box = const Size(18, 18), this.onTap});

  @override
  Widget build(BuildContext context) {
    return VellinInteractive(
      onTap: onTap,
      focusRadius: BorderRadius.circular(VellinRadius.button),
      builder: (context, s) {
        final hot = (s.hovered || s.pressed) && onTap != null;
        return AnimatedContainer(
          duration: VellinMotion.hover,
          curve: VellinMotion.standard,
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: hot ? const Color(0x29E2C99B) : const Color(0x00000000),
            borderRadius: BorderRadius.circular(VellinRadius.button),
          ),
          alignment: Alignment.center,
          child: VellinIcon(
            glyph,
            size: 16,
            box: box,
            color: onTap == null
                ? VellinColors.ink24
                : hot
                    ? VellinColors.accent
                    : VellinColors.ink62,
          ),
        );
      },
    );
  }
}
