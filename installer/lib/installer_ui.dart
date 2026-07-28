// Окно установщика Vellin: интро-анимация знака, мастер из трёх шагов,
// экран установки и финал. Нативная реализация макета `vellin_installer.html`.

import 'package:flutter/material.dart';
import 'package:window_manager/window_manager.dart';

import 'installer_mark.dart';

/// Размер окна установщика и его фон (из макета).
const Size kInstallerSize = Size(720, 500);
const Color kInstallerBackground = Color(0xFF0B0908);

/// Момент завершения интро и длительность затухания окна.
const int kIntroDoneMs = 2150;
const int _introTotalMs = 2600;
const Duration kInstallerFadeOut = Duration(milliseconds: 440);

/// Шаги мастера.
enum InstallStep { welcome, path, options, installing, done, error }

const _wizardOrder = [InstallStep.welcome, InstallStep.path, InstallStep.options];

/// Высота строки «поле пути + Обзор…» (в макете — 42 px вместе с рамкой).
const double _fieldHeight = 42;

/// Дополнительные действия установки.
class InstallOptions {
  const InstallOptions({this.shortcut = true, this.autostart = false});
  final bool shortcut;
  final bool autostart;

  InstallOptions copyWith({bool? shortcut, bool? autostart}) =>
      InstallOptions(shortcut: shortcut ?? this.shortcut, autostart: autostart ?? this.autostart);
}

/// Приводит клиентскую область окна ровно к [kInstallerSize].
///
/// Вызывать ПОСЛЕ `setAsFrameless()`: у безрамочного окна клиентская область
/// совпадает с внешним размером, поэтому достаточно задать его напрямую. До
/// снятия рамки `WindowOptions.size` включал бы её, и вёрстка оказалась бы уже.
Future<void> fitInstallerClientSize() async {
  await windowManager.setSize(kInstallerSize);
  await windowManager.center();
}

TextStyle _t({
  double size = 13,
  FontWeight weight = FontWeight.w400,
  double alpha = 1,
  double? spacing,
  double? height,
  Color color = kPaper,
}) =>
    TextStyle(
      fontFamily: 'Onest',
      fontFamilyFallback: const ['Segoe UI Variable Display', 'Segoe UI'],
      fontSize: size,
      fontWeight: weight,
      height: height,
      letterSpacing: spacing,
      color: color.withValues(alpha: alpha),
    );

class VellinInstallerUi extends StatefulWidget {
  const VellinInstallerUi({
    super.key,
    required this.step,
    required this.version,
    required this.pathController,
    this.progress = 0,
    this.status = 'Установка Vellin…',
    this.detail = '',
    this.errorText = '',
    this.diskNeed = '150 МБ',
    this.diskFree = '',
    this.fadingOut = false,
    this.onStep,
    this.onBrowse,
    this.onInstall,
    this.onLaunch,
    this.onCancel,
    this.onClose,
    this.onRetry,
    this.onIntroDone,
  });

  final InstallStep step;
  final String version;

  /// Поле пути живёт снаружи: «Обзор…» подставляет туда выбранную папку,
  /// не пересоздавая виджет (иначе оборвалась бы интро-анимация).
  final TextEditingController pathController;
  final double progress;
  final String status;
  final String detail;
  final String errorText;
  final String diskNeed;
  final String diskFree;
  final bool fadingOut;

  final ValueChanged<InstallStep>? onStep;
  final ValueChanged<String>? onBrowse;
  final void Function(String path, InstallOptions options)? onInstall;
  final VoidCallback? onLaunch;
  final VoidCallback? onCancel;
  final VoidCallback? onClose;
  final VoidCallback? onRetry;
  final VoidCallback? onIntroDone;

  @override
  State<VellinInstallerUi> createState() => _VellinInstallerUiState();
}

class _VellinInstallerUiState extends State<VellinInstallerUi> with TickerProviderStateMixin {
  late final AnimationController _intro;
  late final AnimationController _glow;
  late final AnimationController _build; // сборка слоёв, 2,55 с
  late final AnimationController _scan; // световой скан, 1,7 с
  late final AnimationController _sheen; // финальный перелив, 3,2 с
  late final AnimationController _morph; // цельный знак ⇄ сборка

  InstallOptions _options = const InstallOptions();
  bool _introFired = false;

  /// Фокус поля пути — по нему подсвечивается рамка (как :focus в макете).
  late final FocusNode _pathFocus = FocusNode()..addListener(_onFocus);
  void _onFocus() => setState(() {});

  bool get _installing => widget.step == InstallStep.installing;
  bool get _done => widget.step == InstallStep.done;

  @override
  void initState() {
    super.initState();
    _intro = AnimationController(vsync: this, duration: const Duration(milliseconds: _introTotalMs))
      ..addListener(_watchIntro)
      ..forward();
    _glow = AnimationController(vsync: this, duration: const Duration(milliseconds: 2300))
      ..repeat(reverse: true);
    // Циклы шагов установки и финала запускаем только на своих шагах: иначе
    // знак перерисовывается каждый кадр на всех экранах и переходы подтормаживают.
    _build = AnimationController(vsync: this, duration: const Duration(milliseconds: 2550));
    _scan = AnimationController(vsync: this, duration: const Duration(milliseconds: 1700));
    _sheen = AnimationController(vsync: this, duration: const Duration(milliseconds: 3200));
    _morph = AnimationController(vsync: this, duration: const Duration(milliseconds: 340));
  }

  void _watchIntro() {
    if (_introFired) return;
    if (_intro.value * _introTotalMs >= kIntroDoneMs) {
      _introFired = true;
      widget.onIntroDone?.call();
    }
  }

  @override
  void didUpdateWidget(VellinInstallerUi old) {
    super.didUpdateWidget(old);
    if (_installing && old.step != InstallStep.installing) {
      _build.repeat();
      _scan.repeat();
      _morph.forward();
    } else if (!_installing && old.step == InstallStep.installing) {
      // Слои гасим только после того, как знак снова соберётся в целый.
      _morph.reverse().whenComplete(() {
        _build.stop();
        _scan.stop();
      });
    }
    if (_done && old.step != InstallStep.done) {
      _sheen.repeat();
    } else if (!_done && old.step == InstallStep.done) {
      _sheen.stop();
    }
  }

  @override
  void dispose() {
    _intro.removeListener(_watchIntro);
    for (final c in [_intro, _glow, _build, _scan, _sheen, _morph]) {
      c.dispose();
    }
    _pathFocus.removeListener(_onFocus);
    _pathFocus.dispose();
    super.dispose();
  }

  void _go(InstallStep step) => widget.onStep?.call(step);

  void _next() {
    final i = _wizardOrder.indexOf(widget.step);
    if (i >= 0 && i < _wizardOrder.length - 1) _go(_wizardOrder[i + 1]);
  }

  void _back() {
    final i = _wizardOrder.indexOf(widget.step);
    if (i > 0) _go(_wizardOrder[i - 1]);
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedOpacity(
      opacity: widget.fadingOut ? 0 : 1,
      duration: kInstallerFadeOut,
      curve: Curves.easeOut,
      child: AnimatedScale(
        scale: widget.fadingOut ? 0.988 : 1,
        duration: kInstallerFadeOut,
        curve: Curves.easeOut,
        child: Material(
          type: MaterialType.transparency,
          child: CustomPaint(
            painter: const InstallerBackdropPainter(),
            child: Stack(
              children: [
                _glowLayer(),
                Column(
                  children: [
                    _brand(),
                    const SizedBox(height: 34),
                    Expanded(child: _stage()),
                    _bottomBar(),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// Тёплое световое пятно за знаком (440 px, центр на 20 % высоты).
  Widget _glowLayer() {
    const d = 440.0;
    return Positioned(
      left: kInstallerSize.width / 2 - d / 2,
      top: kInstallerSize.height * 0.20 - d / 2,
      width: d,
      height: d,
      child: AnimatedBuilder(
        animation: Listenable.merge([_intro, _glow]),
        builder: (context, _) {
          final t = _intro.value * _introTotalMs;
          final appear = seg(t, 350, 900, Curves.ease);
          final breathe = t < 1400 ? 0.0 : Curves.easeInOut.transform(_glow.value);
          return IgnorePointer(
            child: Opacity(
              opacity: (appear * (0.82 + 0.18 * breathe)).clamp(0.0, 1.0),
              child: Transform.scale(
                scale: 1 + 0.06 * breathe,
                child: const DecoratedBox(
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    // 0.707 = «farthest-corner»: в CSS 100 % радиуса — до угла блока.
                    gradient: RadialGradient(
                      radius: 0.7071,
                      colors: [Color(0x21FFF6E8), Color(0x00FFF6E8)],
                      stops: [0, 0.62],
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

  /// Шапка: знак и слово VELLIN. За неё же таскается окно.
  Widget _brand() {
    return DragToMoveArea(
      child: Padding(
        padding: const EdgeInsets.only(top: 46),
        child: Column(
          children: [
            SizedBox(
              width: 84,
              height: 84,
              child: AnimatedBuilder(
                animation: Listenable.merge([_intro, _build, _scan, _sheen, _morph]),
                builder: (context, _) => CustomPaint(
                  painter: InstallerMarkPainter(
                    introMs: _intro.value * _introTotalMs,
                    building: Curves.easeOut.transform(_morph.value),
                    build: _build.value,
                    scan: _scan.value,
                    done: _done ? 1 : 0,
                    sheen: _sheen.value,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 18),
            _word(),
          ],
        ),
      ),
    );
  }

  /// «VELLIN» раскрывается от центра, разрядка сжимается .70em → .42em.
  Widget _word() {
    return AnimatedBuilder(
      animation: _intro,
      builder: (context, _) {
        final t = _intro.value * _introTotalMs;
        final p = seg(t, 1100, 840, const Cubic(0.16, 1, 0.3, 1));
        final inset = 0.5 - 0.6 * p;
        final spacing = 19 * (0.70 - 0.28 * p);
        return Opacity(
          opacity: (p / 0.3).clamp(0.0, 1.0),
          child: ClipRect(
            clipper: _InsetClipper(inset),
            // Хвостовой интервал Flutter учитывает иначе, чем CSS: центрируем
            // сдвигом, повторяющим смещение макета.
            child: Transform.translate(
              offset: Offset((19 * 0.42 - spacing) / 2, 0),
              child: Text('VELLIN',
                  style: _t(size: 19, weight: FontWeight.w500, height: 1, spacing: spacing)),
            ),
          ),
        );
      },
    );
  }

  /// Область шагов: карточки сменяют друг друга кроссфейдом со сдвигом.
  Widget _stage() {
    return AnimatedBuilder(
      animation: _intro,
      builder: (context, child) => Opacity(
        opacity: seg(_intro.value * _introTotalMs, 1720, 600, Curves.ease),
        child: child,
      ),
      child: Align(
        alignment: Alignment.topCenter,
        child: SizedBox(
          width: 452,
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 400),
            reverseDuration: const Duration(milliseconds: 300),
            switchInCurve: const Cubic(0.2, 0.85, 0.25, 1),
            // Шаги разной высоты, поэтому слои прижимаем к верху: со
            // стандартным центрированием Stack менял высоту по ходу перехода
            // и содержимое дёргалось. В макете шаги тоже прибиты к top:0.
            layoutBuilder: (current, previous) => Stack(
              alignment: Alignment.topCenter,
              children: [...previous, if (current != null) current],
            ),
            transitionBuilder: (child, anim) => FadeTransition(
              opacity: anim,
              child: SlideTransition(
                position: Tween(begin: const Offset(0, 0.06), end: Offset.zero).animate(anim),
                child: child,
              ),
            ),
            child: KeyedSubtree(key: ValueKey(widget.step), child: _stepContent()),
          ),
        ),
      ),
    );
  }

  Widget _stepContent() {
    switch (widget.step) {
      case InstallStep.welcome:
        return _column([
          Text('Установка Vellin', style: _t(size: 21, weight: FontWeight.w500, spacing: 0.105, height: 1.3)),
          _lede('Программа установит Vellin на этот компьютер. Перед началом закройте другие приложения.'),
          _meta(widget.version.isEmpty
              ? 'Windows 10 и новее · 64-бит'
              : 'Версия ${widget.version} · Windows 10 и новее · 64-бит'),
        ]);

      case InstallStep.path:
        return _column([
          Text('Папка установки', style: _t(size: 21, weight: FontWeight.w500, spacing: 0.105, height: 1.3)),
          _pathField(),
          _meta('Требуется ${widget.diskNeed}'
              '${widget.diskFree.isEmpty ? '' : ' · Доступно ${widget.diskFree}'}'),
        ]);

      case InstallStep.options:
        return _column(gap: 12, [
          Text('Дополнительно', style: _t(size: 21, weight: FontWeight.w500, spacing: 0.105, height: 1.3)),
          Column(children: [
            _option(
              value: _options.shortcut,
              onChanged: (v) => setState(() => _options = _options.copyWith(shortcut: v)),
              title: 'Ярлык на рабочем столе',
              subtitle: 'Создать ярлык Vellin на рабочем столе',
            ),
            _option(
              value: _options.autostart,
              onChanged: (v) => setState(() => _options = _options.copyWith(autostart: v)),
              title: 'Запускать при входе в систему',
              subtitle: 'Vellin будет стартовать вместе с Windows',
            ),
          ]),
        ]);

      case InstallStep.installing:
        return _column([
          Text(widget.status,
              // Ключ по шагу: проценты меняются на месте, кроссфейд — только
              // при смене самой подписи.
              key: const ValueKey('status'),
              style: _t(size: 13, alpha: 0.72, spacing: 0.52)),
          _track(),
          Text('${(widget.progress * 100).round()}%',
              style: _t(size: 11.5, alpha: 0.42, spacing: 0.92).copyWith(
                fontFeatures: const [FontFeature.tabularFigures()],
              )),
          SizedBox(
            width: 420,
            child: Text(
              widget.detail,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontFamily: 'Cascadia Mono',
                fontFamilyFallback: ['Consolas', 'monospace'],
                fontSize: 11,
                color: Color(0x4DF7F6F4),
              ),
            ),
          ),
        ]);

      case InstallStep.done:
        return _column([
          Text('Vellin установлен', style: _t(size: 21, weight: FontWeight.w500, spacing: 0.105, height: 1.3)),
          _lede('Приложение готово к работе. Можно запустить его прямо сейчас.'),
          _meta(widget.version.isEmpty ? '' : 'Версия ${widget.version}'),
        ]);

      case InstallStep.error:
        return _column([
          Text('Установка не завершена',
              style: _t(size: 21, weight: FontWeight.w500, spacing: 0.105, height: 1.3, color: const Color(0xFFE8A08C))),
          _lede(widget.errorText.isEmpty
              ? 'Не удалось записать файлы в выбранную папку. Проверьте права доступа и попробуйте снова.'
              : widget.errorText),
        ]);
    }
  }

  Widget _column(List<Widget> children, {double gap = 16}) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0) SizedBox(height: gap),
            children[i],
          ],
        ],
      );

  // В макете предел 400 px, но Flutter отрисовывает эту строку примерно на 3 %
  // шире Chrome, и подпись финального экрана срывалась на вторую строку.
  // 420 px возвращает перенос ровно туда же, где он в макете.
  Widget _lede(String text) => ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
        child: Text(text, textAlign: TextAlign.center, style: _t(size: 13, alpha: 0.6, height: 1.6)),
      );

  Widget _meta(String text) =>
      Text(text, textAlign: TextAlign.center, style: _t(size: 11.5, alpha: 0.38, spacing: 0.575));

  Widget _pathField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('ПУТЬ', style: _t(size: 11.5, alpha: 0.45, spacing: 1.035)),
        const SizedBox(height: 9),
        // Высота строки — 42 px, как в макете (padding 11 + текст + рамка).
        // Рамку и подложку рисуем сами, а поле кладём в Container с
        // выравниванием по центру: у TextField с expands вертикальное
        // выравнивание не работает и текст прижимается к низу.
        SizedBox(
          height: _fieldHeight,
          child: Row(children: [
            Expanded(
              child: Container(
                alignment: Alignment.centerLeft,
                padding: const EdgeInsets.symmetric(horizontal: 13),
                decoration: BoxDecoration(
                  color: kPaper.withValues(alpha: 0.05),
                  border: Border.all(
                    color: kPaper.withValues(alpha: _pathFocus.hasFocus ? 0.42 : 0.16),
                  ),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: TextField(
                  controller: widget.pathController,
                  focusNode: _pathFocus,
                  style: _t(size: 13),
                  cursorColor: kPaper,
                  decoration: const InputDecoration.collapsed(hintText: ''),
                ),
              ),
            ),
            const SizedBox(width: 8),
            _Button(
              label: 'Обзор…',
              primary: false,
              height: _fieldHeight,
              onTap: () => widget.onBrowse?.call(widget.pathController.text),
            ),
          ]),
        ),
      ],
    );
  }

  Widget _option({
    required bool value,
    required ValueChanged<bool> onChanged,
    required String title,
    required String subtitle,
  }) =>
      _OptionRow(value: value, onChanged: onChanged, title: title, subtitle: subtitle);

  Widget _track() => SizedBox(
        width: 320,
        height: 2,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(2),
          child: ColoredBox(
            color: kPaper.withValues(alpha: 0.13),
            child: Align(
              alignment: Alignment.centerLeft,
              child: AnimatedFractionallySizedBox(
                duration: const Duration(milliseconds: 400),
                curve: const Cubic(0.3, 0.9, 0.3, 1),
                widthFactor: widget.progress.clamp(0.0, 1.0),
                heightFactor: 1,
                child: const ColoredBox(color: kPaper),
              ),
            ),
          ),
        ),
      );

  /// Низ окна: точки прогресса мастера слева, кнопки справа.
  Widget _bottomBar() {
    final wizard = _wizardOrder.contains(widget.step);
    return AnimatedBuilder(
      animation: _intro,
      builder: (context, child) => Opacity(
        opacity: seg(_intro.value * _introTotalMs, 1850, 600, Curves.ease),
        child: child,
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(32, 0, 32, 30),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            AnimatedOpacity(
              opacity: wizard ? 1 : 0,
              duration: const Duration(milliseconds: 300),
              child: Row(children: [
                for (final s in _wizardOrder) ...[
                  if (s != _wizardOrder.first) const SizedBox(width: 7),
                  _Dot(on: widget.step == s),
                ],
              ]),
            ),
            Row(children: _actions()),
          ],
        ),
      ),
    );
  }

  List<Widget> _actions() {
    final buttons = <Widget>[];
    void add(Widget w) {
      if (buttons.isNotEmpty) buttons.add(const SizedBox(width: 10));
      buttons.add(w);
    }

    switch (widget.step) {
      case InstallStep.welcome:
        add(_Button(label: 'Отмена', primary: false, onTap: widget.onCancel));
        add(_Button(label: 'Далее', primary: true, onTap: _next));
      case InstallStep.path:
        add(_Button(label: 'Отмена', primary: false, onTap: widget.onCancel));
        add(_Button(label: 'Назад', primary: false, onTap: _back));
        add(_Button(label: 'Далее', primary: true, onTap: _next));
      case InstallStep.options:
        add(_Button(label: 'Отмена', primary: false, onTap: widget.onCancel));
        add(_Button(label: 'Назад', primary: false, onTap: _back));
        add(_Button(
          label: 'Установить',
          primary: true,
          onTap: () => widget.onInstall?.call(widget.pathController.text.trim(), _options),
        ));
      case InstallStep.installing:
        break;
      case InstallStep.done:
        add(_Button(label: 'Закрыть', primary: false, onTap: widget.onClose));
        add(_Button(label: 'Запустить Vellin', primary: true, onTap: widget.onLaunch));
      case InstallStep.error:
        add(_Button(label: 'Закрыть', primary: false, onTap: widget.onClose));
        add(_Button(label: 'Повторить', primary: true, onTap: widget.onRetry));
    }
    return buttons;
  }
}

/// Горизонтальный клип от центра: [inset] — доля ширины с каждой стороны.
class _InsetClipper extends CustomClipper<Rect> {
  const _InsetClipper(this.inset);
  final double inset;

  @override
  Rect getClip(Size size) =>
      Rect.fromLTRB(size.width * inset, -size.height, size.width * (1 - inset), size.height * 2);

  @override
  bool shouldReclip(_InsetClipper old) => old.inset != inset;
}

class _Dot extends StatelessWidget {
  const _Dot({required this.on});
  final bool on;
  @override
  Widget build(BuildContext context) {
    return AnimatedScale(
      scale: on ? 1.25 : 1,
      duration: const Duration(milliseconds: 250),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 250),
        width: 5,
        height: 5,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: on ? kPaper : kPaper.withValues(alpha: 0.18),
        ),
      ),
    );
  }
}

class _Button extends StatefulWidget {
  const _Button({required this.label, required this.primary, this.onTap, this.height});
  final String label;
  final bool primary;
  final VoidCallback? onTap;

  /// Фиксированная высота — для кнопки рядом с полем ввода: в макете `.row`
  /// растягивает её по высоте поля (align-items: stretch).
  final double? height;
  @override
  State<_Button> createState() => _ButtonState();
}

class _ButtonState extends State<_Button> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final primary = widget.primary;
    final bg = primary
        ? (_hover ? Colors.white : kPaper)
        : kPaper.withValues(alpha: _hover ? 0.11 : 0.05);
    final border = primary ? bg : kPaper.withValues(alpha: _hover ? 0.36 : 0.2);
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          height: widget.height,
          alignment: widget.height == null ? null : Alignment.center,
          padding: EdgeInsets.symmetric(
            horizontal: 22,
            vertical: widget.height == null ? 10 : 0,
          ),
          decoration: BoxDecoration(
            color: bg,
            border: Border.all(color: border),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            widget.label,
            style: _t(
              size: 12.5,
              spacing: 0.375,
              color: primary ? kInstallerBackground : kPaper,
            ),
          ),
        ),
      ),
    );
  }
}

class _OptionRow extends StatefulWidget {
  const _OptionRow({
    required this.value,
    required this.onChanged,
    required this.title,
    required this.subtitle,
  });
  final bool value;
  final ValueChanged<bool> onChanged;
  final String title;
  final String subtitle;

  @override
  State<_OptionRow> createState() => _OptionRowState();
}

class _OptionRowState extends State<_OptionRow> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: () => widget.onChanged(!widget.value),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 10),
          decoration: BoxDecoration(
            color: _hover ? kPaper.withValues(alpha: 0.04) : Colors.transparent,
            border: Border.all(
              color: _hover ? kPaper.withValues(alpha: 0.1) : Colors.transparent,
            ),
            borderRadius: BorderRadius.circular(9),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 1),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 160),
                  width: 17,
                  height: 17,
                  decoration: BoxDecoration(
                    color: widget.value ? kPaper : kPaper.withValues(alpha: 0.04),
                    border: Border.all(
                      color: widget.value ? kPaper : kPaper.withValues(alpha: 0.3),
                    ),
                    borderRadius: BorderRadius.circular(5),
                  ),
                  child: widget.value
                      ? const CustomPaint(painter: _CheckPainter())
                      : const SizedBox.shrink(),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(widget.title, style: _t(size: 13, height: 1.35)),
                    const SizedBox(height: 3),
                    Text(widget.subtitle, style: _t(size: 11.5, alpha: 0.42, height: 1.4)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Галочка внутри чекбокса (путь из макета, viewBox 12×12).
class _CheckPainter extends CustomPainter {
  const _CheckPainter();
  @override
  void paint(Canvas canvas, Size size) {
    final k = size.width / 12;
    final path = Path()
      ..moveTo(1.6 * k, 6.2 * k)
      ..lineTo(4.4 * k, 9 * k)
      ..lineTo(10.4 * k, 3 * k);
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.9 * k
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..color = kInstallerBackground,
    );
  }

  @override
  bool shouldRepaint(_CheckPainter old) => false;
}
