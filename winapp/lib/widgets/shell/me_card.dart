import 'package:flutter/widgets.dart';

import '../../models/models.dart';
import '../../theme/vellin_design.dart';
import '../../theme/vellin_glyphs.dart';
import '../ui/vellin_avatar.dart';
import '../ui/vellin_button.dart';
import '../ui/vellin_hover.dart';
import '../ui/vellin_icon.dart';
import '../ui/vellin_surfaces.dart';

/// Карточка «я» внизу левой панели: аватар с присутствием, имя, выбранный
/// статус и кнопка настроек. По клику раскрывается меню статуса и выхода.
class MeCard extends StatefulWidget {
  final AuthUser user;
  final VoidCallback onOpenSettings;
  final VoidCallback onOpenProfile;
  final ValueChanged<String> onSelectStatus;
  final VoidCallback onLogout;

  const MeCard({
    super.key,
    required this.user,
    required this.onOpenSettings,
    required this.onOpenProfile,
    required this.onSelectStatus,
    required this.onLogout,
  });

  @override
  State<MeCard> createState() => _MeCardState();
}

class _MeCardState extends State<MeCard> {
  bool _menuOpen = false;

  VellinPresence get _presence => switch (widget.user.presenceStatus) {
        'dnd' || 'away' => VellinPresence.dnd,
        'offline' => VellinPresence.offline,
        _ => VellinPresence.online,
      };

  /// Привязка меню к карточке: меню живёт в Overlay поверх приложения, а не
  /// в стопке рядом с карточкой. Нарисовать его на месте можно и там, но
  /// нажатия за пределами родителя не доходят — панель их не пропускает.
  final _link = LayerLink();
  OverlayEntry? _menu;

  @override
  void dispose() {
    _closeMenu();
    super.dispose();
  }

  void _toggleMenu() {
    if (_menu != null) {
      _closeMenu();
      return;
    }
    final overlay = Overlay.of(context);
    final entry = OverlayEntry(
      builder: (_) => Stack(
        children: [
          // Клик мимо меню закрывает его — как у выпадающих списков системы.
          Positioned.fill(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: _closeMenu,
            ),
          ),
          CompositedTransformFollower(
            link: _link,
            targetAnchor: Alignment.topLeft,
            followerAnchor: Alignment.bottomLeft,
            offset: const Offset(0, -8),
            child: SizedBox(
              width: _menuWidth,
              child: _StatusMenu(
                current: widget.user.presenceStatus,
                onSelect: (s) {
                  _closeMenu();
                  widget.onSelectStatus(s);
                },
                onLogout: () {
                  _closeMenu();
                  widget.onLogout();
                },
              ),
            ),
          ),
        ],
      ),
    );
    overlay.insert(entry);
    setState(() {
      _menu = entry;
      _menuOpen = true;
    });
  }

  void _closeMenu() {
    _menu?.remove();
    _menu = null;
    if (mounted && _menuOpen) setState(() => _menuOpen = false);
  }

  /// Ширина меню = ширина карточки: меню продолжает её, а не висит отдельно.
  double _menuWidth = 300;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: const BoxDecoration(
        color: VellinColors.strip,
        border: Border(top: BorderSide(color: VellinColors.line05)),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          _menuWidth = constraints.maxWidth;
          return CompositedTransformTarget(link: _link, child: _card());
        },
      ),
    );
  }

  Widget _card() {
    return VellinInteractive(
      onTap: _toggleMenu,
      focusRadius: BorderRadius.circular(VellinRadius.raised),
      builder: (context, s) {
        final hot = s.hovered || s.pressed || _menuOpen;
        return AnimatedContainer(
          duration: VellinMotion.hover,
          curve: VellinMotion.standard,
          padding: const EdgeInsets.fromLTRB(10, 9, 9, 9),
          decoration: BoxDecoration(
            color: VellinColors.surface,
            borderRadius: BorderRadius.circular(VellinRadius.raised),
            border: Border.all(
              color: _menuOpen
                  ? const Color(0x3DE2C99B)
                  : hot
                      ? VellinColors.line12
                      : VellinColors.line07,
            ),
            // Открытое меню «поднимает» карточку: тёплый отсвет под ней.
            boxShadow: _menuOpen
                ? const [
                    BoxShadow(color: Color(0x38D6AE6E), blurRadius: 26, offset: Offset(0, 8), spreadRadius: -10),
                    BoxShadow(color: Color(0x14D6AE6E), blurRadius: 18, offset: Offset(0, 2), spreadRadius: -6),
                  ]
                : null,
          ),
          child: Row(
            children: [
              // Профиль открывается по аватару, а карточка целиком — это меню:
              // два действия на одной строке иначе не развести.
              VellinInteractive(
                onTap: widget.onOpenProfile,
                builder: (context, _) => VellinAvatar(
                  username: widget.user.username,
                  avatarUrl: widget.user.avatarUrl,
                  size: 38,
                  presence: _presence,
                  bedColor: VellinColors.surface,
                ),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      widget.user.username,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: VellinType.rowTitle.copyWith(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Text(_presence.label, style: VellinType.caption),
                        const SizedBox(width: 5),
                        AnimatedRotation(
                          duration: const Duration(milliseconds: 450),
                          curve: VellinMotion.standard,
                          turns: _menuOpen ? 0.5 : 0,
                          child: const VellinIcon(
                            VellinGlyphs.chevronDown,
                            size: 10,
                            box: Size(12, 12),
                            color: VellinColors.ink32,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              VellinIconButton(
                glyph: VellinGlyphs.settings,
                onPressed: widget.onOpenSettings,
                size: 34,
                radius: VellinRadius.field,
                glyphSize: 16,
                goldHover: true,
              ),
            ],
          ),
        );
      },
    );
  }
}

/// Меню над карточкой: три статуса и выход.
class _StatusMenu extends StatelessWidget {
  final String current;
  final ValueChanged<String> onSelect;
  final VoidCallback onLogout;

  const _StatusMenu({required this.current, required this.onSelect, required this.onLogout});

  @override
  Widget build(BuildContext context) {
    const rows = [
      ('online', 'В сети', 'Видно всем друзьям', VellinColors.online),
      ('dnd', 'Не беспокоить', 'Без звука и всплывающих окон', VellinColors.dnd),
      ('offline', 'Не в сети', 'Никто не видит вас в сети', VellinColors.offline),
    ];

    return VellinGlass(
      color: VellinColors.glassMenu,
      radius: BorderRadius.circular(VellinRadius.raised),
      shadow: VellinShadow.menu,
      padding: const EdgeInsets.all(6),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < rows.length; i++)
            _MenuRow(
              index: i,
              dotColor: rows[i].$4,
              // Месяц вместо точки — тот же знак, что стоит на аватаре.
              moon: rows[i].$1 == 'dnd',
              title: rows[i].$2,
              hint: rows[i].$3,
              selected: current == rows[i].$1,
              onTap: () => onSelect(rows[i].$1),
            ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 5),
            child: ColoredBox(color: VellinColors.line06, child: SizedBox(height: 1, width: double.infinity)),
          ),
          _LogoutRow(onTap: onLogout),
        ],
      ),
    );
  }
}

/// Строка меню: въезжает лесенкой, чтобы список не появлялся одним блоком.
class _MenuRow extends StatefulWidget {
  final int index;
  final Color dotColor;

  /// Рисовать месяц вместо точки — у «не беспокоить» знак не круглый.
  final bool moon;
  final String title;
  final String hint;
  final bool selected;
  final VoidCallback onTap;

  const _MenuRow({
    required this.index,
    required this.dotColor,
    this.moon = false,
    required this.title,
    required this.hint,
    required this.selected,
    required this.onTap,
  });

  @override
  State<_MenuRow> createState() => _MenuRowState();
}

class _MenuRowState extends State<_MenuRow> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: VellinMotion.hover,
  );

  @override
  void initState() {
    super.initState();
    Future<void>.delayed(VellinMotion.stagger * widget.index, () {
      if (mounted) _c.forward();
    });
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
        final t = VellinMotion.standard.transform(_c.value);
        return Opacity(
          opacity: t,
          child: Transform.translate(offset: Offset(0, 8 * (1 - t)), child: child),
        );
      },
      child: VellinInteractive(
        onTap: widget.onTap,
        focusRadius: BorderRadius.circular(VellinRadius.button),
        builder: (context, s) {
          final hot = s.hovered || s.pressed;
          return AnimatedContainer(
            duration: VellinMotion.hover,
            curve: VellinMotion.standard,
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
            decoration: BoxDecoration(
              color: hot ? VellinColors.fill055 : const Color(0x00000000),
              borderRadius: BorderRadius.circular(VellinRadius.button),
            ),
            child: Row(
              children: [
                // Ширина под знак одна на все строки: подписи иначе разъезжались
                // бы на пару пикселей между точкой и месяцем.
                SizedBox(
                  width: 11,
                  height: 11,
                  child: Center(
                    child: widget.moon
                        ? VellinIcon.filled(
                            VellinGlyphs.moonFilled,
                            size: 11,
                            box: const Size(12, 12),
                            color: widget.dotColor,
                          )
                        : Container(
                            width: 9,
                            height: 9,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: widget.dotColor,
                              boxShadow: widget.selected
                                  ? [
                                      BoxShadow(
                                        color: widget.dotColor.withValues(alpha: 0.35),
                                        blurRadius: 9,
                                      ),
                                    ]
                                  : null,
                            ),
                          ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(widget.title, style: VellinType.body.copyWith(fontSize: 13, height: 1.2)),
                      const SizedBox(height: 2),
                      Text(widget.hint, style: VellinType.caption.copyWith(fontSize: 11)),
                    ],
                  ),
                ),
                if (widget.selected)
                  const VellinIcon(VellinGlyphs.check, size: 13, color: VellinColors.accent),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _LogoutRow extends StatelessWidget {
  final VoidCallback onTap;
  const _LogoutRow({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return VellinInteractive(
      onTap: onTap,
      focusRadius: BorderRadius.circular(VellinRadius.button),
      builder: (context, s) {
        final hot = s.hovered || s.pressed;
        return AnimatedContainer(
          duration: VellinMotion.hover,
          curve: VellinMotion.standard,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
          decoration: BoxDecoration(
            color: hot ? const Color(0x1FD65C52) : const Color(0x00000000),
            borderRadius: BorderRadius.circular(VellinRadius.button),
          ),
          child: Row(
            children: [
              const VellinIcon(VellinGlyphs.logout, size: 15, color: VellinColors.danger),
              const SizedBox(width: 10),
              Text(
                'Выйти из аккаунта',
                style: VellinType.body.copyWith(fontSize: 13, color: VellinColors.danger),
              ),
            ],
          ),
        );
      },
    );
  }
}
