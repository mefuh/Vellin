import 'dart:io';
import 'dart:ui' as ui;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/gestures.dart';
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
    builder: (_) =>
        _Lightbox(images: images, initialIndex: index, onClose: entry.remove),
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

class _LightboxState extends State<_Lightbox> with TickerProviderStateMixin {
  late int _index = widget.initialIndex;

  /// Масштаб, к которому идём: от 100 % и вверх, шагом из [_step].
  /// Он же стоит в тулбаре — подпись меняется сразу, а не догоняет анимацию.
  int _zoom = 100;

  /// Масштаб, который нарисован прямо сейчас. Между шагами едет по кривой.
  double _shown = 1;

  double _zoomFrom = 1;
  double _zoomTo = 1;

  /// Точка снимка, которую держим в центре во время приближения, долей от
  /// кадра. Считается один раз на старте шага: пока идёт анимация, центр
  /// «уезжал» бы сам от себя.
  Offset _anchor = const Offset(0.5, 0.5);

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

  /// Шаг зума короткий: кривая и так почти весь путь проходит в первой трети,
  /// а хвост в триста миллисекунд читался как ожидание после нажатия.
  /// Длительность подстраивается под размах шага — см. [_setZoom].
  late final AnimationController _zoomCtl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 170),
    value: 1,
  )..addListener(_onZoomTick);

  final _focus = FocusNode();

  /// Смещение кадра при увеличении — им же двигают снимок мышью.
  final _view = TransformationController();

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
    _zoomCtl.dispose();
    _focus.dispose();
    _view.dispose();
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
      _shown = 1;
    });
    // Новый снимок показываем целиком: масштаб и смещение прежнего к нему
    // отношения не имеют, и уезжать к единице на глазах тут нечему — кадр
    // всё равно сменился.
    _zoomCtl.value = 1;
    _view.value = Matrix4.identity();
    _page.forward(from: 0);
  }

  /// Шаг увеличения. Мелкий у начала шкалы и крупный дальше: от 400 % к 425 %
  /// разницы не видно, а нажатий до крупного плана набегает два десятка.
  int _step(int zoom) => zoom < 300 ? 25 : (zoom < 1000 ? 100 : 200);

  void _zoomIn() => _setZoom(_zoom + _step(_zoom));

  void _zoomOut() => _setZoom(_zoom - _step(_zoom - 1));

  void _setZoom(int value) {
    // Потолка у увеличения нет — только предохранитель, за которым снимок
    // всё равно уже рассыпан на пиксели.
    final next = value.clamp(100, 1600);
    if (next == _zoom) return;
    // Едем от того, что нарисовано сейчас, а не от прежней цели: щелчки колеса
    // идут чаще, чем успевает доиграть шаг.
    _zoomFrom = _shown;
    _zoomTo = next / 100;
    _anchor = _centerFraction();
    setState(() => _zoom = next);
    // Время — по размаху шага, а не одно на всё: щелчок колеса догоняет
    // недоигранный кадр за считанные миллисекунды и потому кажется мгновенным,
    // а редкий большой скачок всё же успевает прочитаться движением.
    final ratio = _zoomTo > _zoomFrom
        ? _zoomTo / _zoomFrom
        : _zoomFrom / _zoomTo;
    _zoomCtl.duration = Duration(
      milliseconds: (90 + 190 * (ratio - 1)).clamp(90, 220).round(),
    );
    _zoomCtl.forward(from: 0);
  }

  /// Точка снимка в центре кадра — долей от его размера.
  Offset _centerFraction() {
    if (_viewport == Size.zero) return const Offset(0.5, 0.5);
    final content = _contentSize(_shown);
    final t = _view.value.getTranslation();
    return Offset(
      (-t.x + _viewport.width / 2) / content.width,
      (-t.y + _viewport.height / 2) / content.height,
    );
  }

  void _onZoomTick() {
    final t = VellinMotion.standard.transform(_zoomCtl.value);
    setState(() => _shown = _zoomFrom + (_zoomTo - _zoomFrom) * t);
    _holdAnchor();
  }

  /// Удержать [_anchor] в центре кадра на текущем масштабе: без этого снимок
  /// при приближении уползал бы к своему левому верхнему углу.
  void _holdAnchor() {
    if (_viewport == Size.zero) return;
    final content = _contentSize(_shown);
    final maxX = content.width - _viewport.width;
    final maxY = content.height - _viewport.height;
    if (maxX <= 0 && maxY <= 0) {
      _view.value = Matrix4.identity();
      return;
    }
    final x = (_anchor.dx * content.width - _viewport.width / 2).clamp(
      0.0,
      maxX < 0 ? 0.0 : maxX,
    );
    final y = (_anchor.dy * content.height - _viewport.height / 2).clamp(
      0.0,
      maxY < 0 ? 0.0 : maxY,
    );
    _view.value = Matrix4.identity()..translateByDouble(-x, -y, 0, 1);
  }

  Future<void> _download() async {
    final url = widget.images[_index];
    final name = Uri.parse(url).pathSegments.isEmpty
        ? 'image.jpg'
        : Uri.parse(url).pathSegments.last;
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
                    onTap: _fullscreen
                        ? () => setState(() => _fullscreen = false)
                        : _close,
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
                  child: Transform.scale(
                    scale: 0.92 + 0.08 * t,
                    child: _image(),
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
                        if (_index < widget.images.length - 1)
                          _arrow(left: false),
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
      // Растёт само изображение, а не картинка внутри неподвижной рамки:
      // масштаб задаётся размером кадра, поэтому при 175 % снимок становится
      // больше окна и по нему можно возить, а не смотреть в обрезанный кусок.
      child: LayoutBuilder(
        builder: (context, box) {
          _viewport = Size(box.maxWidth, box.maxHeight);
          final frame = _frameSize(_shown);
          final content = _contentSize(_shown);
          return Listener(
            // Колесо мыши — привычный способ приблизить снимок; кнопками в
            // тулбаре до крупного плана добираться долго.
            onPointerSignal: (signal) {
              if (signal is! PointerScrollEvent) return;
              if (signal.scrollDelta.dy < 0) {
                _zoomIn();
              } else {
                _zoomOut();
              }
            },
            child: SizedBox.expand(
              child: InteractiveViewer(
                transformationController: _view,
                constrained: false,
                panEnabled: _shown > 1,
                scaleEnabled: false,
                minScale: 1,
                maxScale: 1,
                // Внешняя коробка не меньше кадра: пока снимок мельче окна, он
                // держится по центру, а не липнет к левому верхнему углу.
                child: SizedBox(
                  width: content.width,
                  height: content.height,
                  child: Center(
                    child: SizedBox(
                      width: frame.width,
                      height: frame.height,
                      child: Image.network(
                        widget.images[_index],
                        fit: BoxFit.contain,
                        errorBuilder: (_, _, _) => const SizedBox.shrink(),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  /// Размер видимого кадра — по нему считается смещение при увеличении.
  Size _viewport = Size.zero;

  /// Поля вокруг вписанного снимка: при 100 % он не должен лезть под счётчик,
  /// стрелки и тулбар. Это множитель, а не отступ у рамки, — иначе на переходе
  /// через 100 % кадр прыгал бы на ширину полей.
  double _inset() {
    // В полноэкранном режиме обвязки нет — и полей под неё тоже.
    if (_viewport == Size.zero || _fullscreen) return 1;
    final w = (_viewport.width - 144) / _viewport.width;
    final h = (_viewport.height - 128) / _viewport.height;
    // Нижняя граница — для узкого окна, где поля съели бы весь кадр.
    return w < h ? w.clamp(0.5, 1.0) : h.clamp(0.5, 1.0);
  }

  /// Размер самого снимка при данном масштабе.
  Size _frameSize(double scale) {
    final k = _inset() * scale;
    return Size(_viewport.width * k, _viewport.height * k);
  }

  /// Размер прокручиваемой области: снимок, но не меньше окна.
  Size _contentSize(double scale) {
    final frame = _frameSize(scale);
    return Size(
      frame.width < _viewport.width ? _viewport.width : frame.width,
      frame.height < _viewport.height ? _viewport.height : frame.height,
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
              transform: Matrix4.translationValues(
                hot ? (left ? -2 : 2) : 0,
                0,
                0,
              ),
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: hot ? const Color(0x29E2C99B) : const Color(0xB80E0C0B),
                border: Border.all(
                  color: hot ? VellinColors.accentLine : VellinColors.line10,
                ),
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
                onTap: _zoom > 100 ? _zoomOut : null,
              ),
              SizedBox(
                // Ширина под «1600%», иначе тулбар дёргается на каждом шаге.
                width: 62,
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
                onTap: _zoom < 1600 ? _zoomIn : null,
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

  const _ToolButton({
    required this.glyph,
    this.box = const Size(18, 18),
    this.onTap,
  });

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
