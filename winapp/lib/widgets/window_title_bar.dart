import 'package:flutter/widgets.dart';
import 'package:window_manager/window_manager.dart';

import '../theme/vellin_design.dart';
import '../theme/vellin_glyphs.dart';
import 'notifications_bell.dart';
import 'ui/vellin_icon.dart';

/// Высота заголовка окна. Экран звонка и фрейм настроек отступают на неё
/// сверху: оба рисуются поверх приложения, а кнопки окна должны оставаться
/// доступными.
const double kWindowTitleBarHeight = VellinLayout.titleBarHeight;

/// Собственный заголовок окна: знак и подпись слева, зона перетаскивания,
/// колокольчик и три ячейки управления окном.
class WindowTitleBar extends StatefulWidget {
  const WindowTitleBar({super.key});
  @override
  State<WindowTitleBar> createState() => _WindowTitleBarState();
}

class _WindowTitleBarState extends State<WindowTitleBar> with WindowListener {
  bool _maximized = false;

  @override
  void initState() {
    super.initState();
    windowManager.addListener(this);
    windowManager.isMaximized().then((v) {
      if (mounted) setState(() => _maximized = v);
    });
  }

  @override
  void dispose() {
    windowManager.removeListener(this);
    super.dispose();
  }

  @override
  void onWindowMaximize() => setState(() => _maximized = true);
  @override
  void onWindowUnmaximize() => setState(() => _maximized = false);

  Future<void> _toggleMaximize() async {
    if (await windowManager.isMaximized()) {
      await windowManager.unmaximize();
    } else {
      await windowManager.maximize();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: kWindowTitleBarHeight,
      decoration: const BoxDecoration(
        color: VellinColors.chrome,
        border: Border(bottom: BorderSide(color: VellinColors.line05)),
      ),
      child: Row(
        children: [
          Expanded(
            child: DragToMoveArea(
              child: Padding(
                padding: const EdgeInsets.only(left: 12),
                child: Row(
                  children: [
                    Image.asset('assets/vellin_icon.png',
                        width: 18, height: 18, filterQuality: FilterQuality.high),
                    const SizedBox(width: 8),
                    Text(
                      'Vellin',
                      style: TextStyle(
                        fontFamily: VellinType.family,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        color: VellinColors.ink72,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const NotificationsBellButton(),
          _WinCell(
            glyph: VellinGlyphs.winMinimize,
            box: const Size(12, 12),
            glyphSize: 12,
            onTap: windowManager.minimize,
          ),
          _WinCell(
            glyph: _maximized ? VellinGlyphs.winRestore : VellinGlyphs.winMaximize,
            box: const Size(16, 16),
            glyphSize: 11,
            onTap: _toggleMaximize,
          ),
          _WinCell(
            glyph: VellinGlyphs.winClose,
            box: const Size(11, 11),
            glyphSize: 10,
            onTap: windowManager.close,
            danger: true,
          ),
        ],
      ),
    );
  }
}

/// Ячейка управления окном 46×36. Наведение — приподнятая поверхность,
/// у закрытия — единственная «жёсткая» красная заливка во всём клиенте.
class _WinCell extends StatefulWidget {
  final List<String> glyph;
  final Size box;
  final double glyphSize;
  final VoidCallback onTap;
  final bool danger;

  const _WinCell({
    required this.glyph,
    required this.box,
    required this.glyphSize,
    required this.onTap,
    this.danger = false,
  });

  @override
  State<_WinCell> createState() => _WinCellState();
}

class _WinCellState extends State<_WinCell> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final background = !_hover
        ? const Color(0x00000000)
        : widget.danger
            ? VellinColors.destructive
            : VellinColors.surface;
    final color = _hover && widget.danger ? const Color(0xFFFFFFFF) : VellinColors.ink62;

    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: VellinMotion.hover,
          curve: VellinMotion.standard,
          width: VellinLayout.titleCell.width,
          height: VellinLayout.titleCell.height,
          color: background,
          alignment: Alignment.center,
          child: VellinIcon(
            widget.glyph,
            size: widget.glyphSize,
            box: widget.box,
            color: color,
          ),
        ),
      ),
    );
  }
}
