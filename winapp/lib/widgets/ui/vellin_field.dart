import 'package:flutter/material.dart' show InputDecoration, TextField;
import 'package:flutter/widgets.dart';

import '../../theme/vellin_design.dart';
import '../../theme/vellin_glyphs.dart';
import 'vellin_icon.dart';

/// Ввод текста. Оформление целиком наше — контейнер, рамка, кольцо фокуса;
/// от Material берётся только сам `TextField` с `InputDecoration.collapsed`,
/// то есть механика курсора, выделения и IME без единого его украшения.
/// Так же сделано в уже принятом окне входа.
TextStyle _inputStyle(double size, Color color) => TextStyle(
      fontFamily: VellinType.family,
      fontSize: size,
      fontWeight: FontWeight.w400,
      color: color,
    );

/// Поле формы: подпись прописными, рамка, подсказка или ошибка снизу.
class VellinField extends StatefulWidget {
  final String? label;
  final TextEditingController controller;
  final String? placeholder;

  /// Подсказка под полем — 11.5, приглушённая.
  final String? hint;

  /// Текст ошибки: красит рамку и подпись в терракотовый.
  final String? error;

  final bool obscure;
  final bool enabled;
  final TextInputType? keyboardType;
  final int maxLines;
  final ValueChanged<String>? onChanged;
  final VoidCallback? onSubmitted;
  final FocusNode? focusNode;

  const VellinField({
    super.key,
    required this.controller,
    this.label,
    this.placeholder,
    this.hint,
    this.error,
    this.obscure = false,
    this.enabled = true,
    this.keyboardType,
    this.maxLines = 1,
    this.onChanged,
    this.onSubmitted,
    this.focusNode,
  });

  @override
  State<VellinField> createState() => _VellinFieldState();
}

class _VellinFieldState extends State<VellinField> {
  late final FocusNode _focus = widget.focusNode ?? FocusNode();

  @override
  void initState() {
    super.initState();
    _focus.addListener(_repaint);
  }

  void _repaint() => setState(() {});

  @override
  void dispose() {
    _focus.removeListener(_repaint);
    if (widget.focusNode == null) _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final focused = _focus.hasFocus;
    final bad = widget.error != null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (widget.label != null) ...[
          Text(widget.label!.toUpperCase(), style: VellinType.fieldLabel),
          const SizedBox(height: 8),
        ],
        AnimatedContainer(
          duration: VellinMotion.hover,
          curve: VellinMotion.standard,
          constraints: const BoxConstraints(minHeight: VellinLayout.fieldHeight),
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 11),
          decoration: BoxDecoration(
            color: VellinColors.fill045,
            borderRadius: BorderRadius.circular(VellinRadius.field),
            border: Border.all(
              color: bad
                  ? const Color(0x59E8A08C)
                  : focused
                      ? VellinColors.focusRing
                      : VellinColors.line09,
            ),
            boxShadow: focused && !bad ? VellinShadow.focus : null,
          ),
          child: TextField(
            controller: widget.controller,
            focusNode: _focus,
            enabled: widget.enabled,
            obscureText: widget.obscure,
            keyboardType: widget.keyboardType,
            maxLines: widget.maxLines,
            style: _inputStyle(13.5, widget.enabled ? VellinColors.ink92 : VellinColors.ink45),
            cursorColor: VellinColors.accent,
            cursorWidth: 1.4,
            onChanged: widget.onChanged,
            onSubmitted: (_) => widget.onSubmitted?.call(),
            decoration: InputDecoration.collapsed(
              hintText: widget.placeholder,
              hintStyle: _inputStyle(13.5, const Color(0x5CFFFFFF)),
            ),
          ),
        ),
        if (widget.error != null || widget.hint != null) ...[
          const SizedBox(height: 6),
          Text(
            widget.error ?? widget.hint!,
            style: VellinType.caption.copyWith(
              color: bad ? VellinColors.warning : VellinColors.ink32,
            ),
          ),
        ],
      ],
    );
  }
}

/// Поиск: высота 36, лупа слева, крестик очистки справа.
class VellinSearchField extends StatefulWidget {
  final TextEditingController controller;
  final String placeholder;
  final ValueChanged<String>? onChanged;
  final double height;

  const VellinSearchField({
    super.key,
    required this.controller,
    this.placeholder = 'Поиск',
    this.onChanged,
    this.height = VellinLayout.searchHeight,
  });

  @override
  State<VellinSearchField> createState() => _VellinSearchFieldState();
}

class _VellinSearchFieldState extends State<VellinSearchField> {
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _focus.addListener(_repaint);
    widget.controller.addListener(_repaint);
  }

  void _repaint() => setState(() {});

  @override
  void dispose() {
    widget.controller.removeListener(_repaint);
    _focus.removeListener(_repaint);
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final focused = _focus.hasFocus;

    return AnimatedContainer(
      duration: VellinMotion.hover,
      curve: VellinMotion.standard,
      height: widget.height,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: VellinColors.fill045,
        borderRadius: BorderRadius.circular(VellinRadius.button),
        border: Border.all(color: focused ? VellinColors.focusRing : VellinColors.line07),
        boxShadow: focused ? VellinShadow.focus : null,
      ),
      child: Row(
        children: [
          const VellinIcon(VellinGlyphs.search, size: 15, color: VellinColors.ink32),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              controller: widget.controller,
              focusNode: _focus,
              style: _inputStyle(12.5, VellinColors.ink92),
              cursorColor: VellinColors.accent,
              cursorWidth: 1.4,
              onChanged: widget.onChanged,
              decoration: InputDecoration.collapsed(
                hintText: widget.placeholder,
                hintStyle: _inputStyle(12.5, const Color(0x61FFFFFF)),
              ),
            ),
          ),
          if (widget.controller.text.isNotEmpty)
            MouseRegion(
              cursor: SystemMouseCursors.click,
              child: GestureDetector(
                onTap: () {
                  widget.controller.clear();
                  widget.onChanged?.call('');
                },
                child: const Padding(
                  padding: EdgeInsets.only(left: 6),
                  child: VellinIcon(
                    VellinGlyphs.closeSmall,
                    size: 11,
                    box: Size(11, 11),
                    color: VellinColors.ink32,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
