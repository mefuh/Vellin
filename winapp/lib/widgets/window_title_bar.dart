import 'package:flutter/material.dart';
import 'package:window_manager/window_manager.dart';
import '../theme/vellin_theme.dart';

/// Собственный заголовок окна (нативный скрыт): бренд слева, перетаскивание за
/// пустую область, свои кнопки свернуть/развернуть/закрыть — как в Discord/VS
/// Code. Ставится сверху всего приложения через `MaterialApp.router builder`.
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
    return Material(
      color: VellinColors.bg0,
      child: SizedBox(
        height: 36,
        child: Row(children: [
          // Перетаскивание окна за пустую область + бренд слева.
          Expanded(
            child: DragToMoveArea(
              child: Padding(
                padding: const EdgeInsets.only(left: 12),
                child: Row(children: [
                  Container(
                    width: 18,
                    height: 18,
                    decoration: BoxDecoration(color: VellinColors.accent, borderRadius: BorderRadius.circular(5)),
                    alignment: Alignment.center,
                    child: const Text('V',
                        style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800, height: 1)),
                  ),
                  const SizedBox(width: 8),
                  const Text('Vellin',
                      style: TextStyle(color: VellinColors.text2, fontSize: 12.5, fontWeight: FontWeight.w600)),
                ]),
              ),
            ),
          ),
          _WinBtn(icon: Icons.remove, onTap: windowManager.minimize),
          _WinBtn(icon: _maximized ? Icons.filter_none : Icons.crop_square, onTap: _toggleMaximize, iconSize: _maximized ? 13 : 15),
          _WinBtn(icon: Icons.close, onTap: windowManager.close, danger: true),
        ]),
      ),
    );
  }
}

class _WinBtn extends StatefulWidget {
  final IconData icon;
  final VoidCallback onTap;
  final bool danger;
  final double iconSize;
  const _WinBtn({required this.icon, required this.onTap, this.danger = false, this.iconSize = 16});
  @override
  State<_WinBtn> createState() => _WinBtnState();
}

class _WinBtnState extends State<_WinBtn> {
  bool _hover = false;
  @override
  Widget build(BuildContext context) {
    final bg = _hover ? (widget.danger ? const Color(0xFFE23B3B) : VellinColors.bg2) : Colors.transparent;
    final fg = _hover && widget.danger ? Colors.white : VellinColors.text2;
    return MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: Container(
          width: 46,
          height: 36,
          color: bg,
          alignment: Alignment.center,
          child: Icon(widget.icon, size: widget.iconSize, color: fg),
        ),
      ),
    );
  }
}
