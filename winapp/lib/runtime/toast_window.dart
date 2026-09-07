// Окно уведомлений («тосты») в фирменном стиле Vellin — вместо системных
// тостов Windows. Того же семейства, что апдейтер, окно входа и установщик:
// тёмная подложка #0B0908, тёплая засветка, бумажный текст.
//
// Живёт в ОТДЕЛЬНОМ процессе того же exe (аргументы `--toast <порт>`): у
// Flutter на Windows одно окно на процесс, а главное окно занято приложением.
// Дочерний процесс подключается к локальному сокету главного и получает
// команды показа; клик по тосту уходит обратно событием (см. toast_host.dart).
//
// На экране всегда ОДИН тост фиксированного размера: следующее уведомление
// сменяет содержимое на месте, окно не меняет границ. Это принципиально —
// именно смена размеров окна приводила к залипшим пикселям на экране.
//
// Уведомления, пришедшие подряд, ждут очереди: текущее гарантированно висит
// [_minReadTime], иначе пачка сообщений промотала бы тосты слишком быстро.

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:screen_retriever/screen_retriever.dart';
import 'package:window_manager/window_manager.dart';

import '../theme/avatar_tint.dart';
import '../theme/vellin_glyphs.dart';
import '../widgets/ui/vellin_icon.dart';

/// Размер карточки уведомления (и всего окна — оно ровно по ней).
const double kToastWidth = 384;
const double kToastHeight = 104;


/// Отступ от угла рабочей области (над панелью задач).
const double _screenMargin = 16;

/// Позиция вне экрана — для первого (прогревочного) показа окна.
const Offset _offscreen = Offset(-4000, -4000);

/// Сколько тост висит на экране, если его не сменили и по нему не кликнули.
const Duration _toastLifetime = Duration(seconds: 6);

/// Гарантированное время на прочтение: новое уведомление не заменит текущее
/// раньше, чем оно провисит столько. Иначе пачка сообщений подряд промотала бы
/// тосты так быстро, что прочитать их было бы нельзя.
const Duration _minReadTime = Duration(seconds: 5);

const Duration _enterDuration = Duration(milliseconds: 260);
const Duration _leaveDuration = Duration(milliseconds: 180);

/// Фон карточки — тот же тёмный тон, что у окна входа и апдейтера. Окно
/// прозрачное, поэтому фон есть только у самих карточек.
const Color _card = Color(0xFF131110);
const Color _paper = Color(0xFFF7F6F4);
/// Золото — общий акцент клиента; красный остался только у сброса звонка.
const Color _accent = Color(0xFFE2C99B);
const Color _declineRed = Color(0xFFBA423A);
const Color _acceptGreen = Color(0xFF93B08A);

TextStyle _t({
  double size = 13,
  FontWeight weight = FontWeight.w400,
  double alpha = 1,
  double? height,
  double? spacing,
}) => TextStyle(
  fontFamily: 'Manrope',
  fontSize: size,
  fontWeight: weight,
  height: height,
  letterSpacing: spacing,
  color: _paper.withValues(alpha: alpha),
);

/// Данные одного уведомления, как они приходят от главного процесса.
class ToastData {
  final String id;
  final String title;
  final String body;
  final String? avatarUrl;
  final String avatarSeed;

  /// 'message' — обычное уведомление, 'call' — входящий звонок с кнопками
  /// ответа. Звонок ведёт себя иначе: показывается сразу и висит, пока звонят.
  final String kind;

  const ToastData({
    required this.id,
    required this.title,
    required this.body,
    required this.avatarUrl,
    required this.avatarSeed,
    this.kind = 'message',
  });

  bool get isCall => kind == 'call';

  factory ToastData.fromJson(Map<String, dynamic> j) => ToastData(
        id: j['id'] as String? ?? '',
        title: j['title'] as String? ?? 'Vellin',
        body: j['body'] as String? ?? '',
        avatarUrl: j['avatarUrl'] as String?,
        avatarSeed: j['avatarSeed'] as String? ?? '',
        kind: j['kind'] as String? ?? 'message',
      );
}

/// Точка входа процесса-тостера (`vellin_winapp.exe --toast <порт>`).
///
/// Окно создаётся сразу, но остаётся скрытым до первого уведомления: так показ
/// мгновенный, без ожидания старта Flutter.
Future<void> runToastApp(int port) async {
  WidgetsFlutterBinding.ensureInitialized();
  await windowManager.ensureInitialized();

  await windowManager.waitUntilReadyToShow(
    WindowOptions(
      size: Size(kToastWidth, kToastHeight),
      // Окно непрозрачное и ровно по карточке: прозрачных областей нет вовсе,
      // а значит нет и залипших пикселей — Windows не перерисовывает то, что
      // оказалось под прозрачной частью переиспользуемого окна.
      backgroundColor: _card,
      titleBarStyle: TitleBarStyle.hidden,
      windowButtonVisibility: false,
      title: 'Vellin',
    ),
    () async {
      await windowManager.setResizable(false);
      await windowManager.setMinimizable(false);
      await windowManager.setMaximizable(false);
      // Тень окна легла бы прямоугольником вокруг всей стопки.
      await windowManager.setHasShadow(false);
      // Без системной рамки: по контуру вырезанного региона DWM рисовал бы её
      // светлой каймой вокруг каждой карточки.
      await windowManager.setAsFrameless();
      await windowManager.setSkipTaskbar(true);
      await windowManager.setAlwaysOnTop(true);
    },
  );

  // Процесс запущен из приложения, и Windows применяет к ПЕРВОМУ показу окна
  // режим из параметров запуска процесса (скрытый) — обычный show() тогда
  // молча не срабатывает. Первый показ «расходуем» за пределами экрана (там же
  // прогревается первый кадр, см. _warmUp), чтобы настоящие уведомления
  // показывались надёжно и без рывка.
  await windowManager.setPosition(_offscreen);

  runApp(_ToastApp(port: port));
}

class _ToastApp extends StatefulWidget {
  final int port;
  const _ToastApp({required this.port});
  @override
  State<_ToastApp> createState() => _ToastAppState();
}

class _ToastAppState extends State<_ToastApp> with TickerProviderStateMixin {
  Socket? _socket;

  /// Уведомление на экране. Тост всегда один: следующее заменяет текущее.
  ToastData? _current;

  /// Когда текущее уведомление появилось — от этого считается гарантированное
  /// время на прочтение перед заменой.
  DateTime? _shownAt;

  /// Ожидающие уведомления: показываются по очереди, каждое не раньше, чем
  /// предыдущее провисит [_minReadTime].
  final _queue = <ToastData>[];

  /// Появление/уход карточки. Контроллер один — карточка тоже одна.
  late final AnimationController _anim = AnimationController(
    vsync: this,
    duration: _enterDuration,
    reverseDuration: _leaveDuration,
  );

  Timer? _hideTimer;

  /// Ждём, пока текущий тост дослужит своё, чтобы заменить его следующим.
  Timer? _replaceTimer;

  /// Тост уходит — новые уведомления в этот момент ждут очереди.
  bool _leaving = false;

  /// Идёт прогрев за экраном — команды показа тоже ждут.
  bool _warming = false;

  @override
  void initState() {
    super.initState();
    _connect();
    WidgetsBinding.instance.addPostFrameCallback((_) => _warmUp());
  }

  @override
  void dispose() {
    _hideTimer?.cancel();
    _replaceTimer?.cancel();
    _anim.dispose();
    _socket?.destroy();
    super.dispose();
  }

  // ── Связь с приложением ───────────────────────────────────────────────────

  Future<void> _connect() async {
    try {
      final socket = await Socket.connect(InternetAddress.loopbackIPv4, widget.port);
      _socket = socket;
      socket
          .cast<List<int>>()
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .listen(_onLine, onDone: _exit, onError: (_) => _exit());
    } catch (_) {
      _exit();
    }
  }

  /// Главный процесс закрылся или порвалась связь — тостеру жить незачем.
  void _exit() => exit(0);

  void _onLine(String line) {
    Map<String, dynamic> msg;
    try {
      msg = jsonDecode(line) as Map<String, dynamic>;
    } catch (_) {
      return;
    }
    switch (msg['cmd']) {
      case 'show':
        _enqueue(ToastData.fromJson(msg));
        break;
      case 'hide':
        // С идентификатором — снять конкретное уведомление (звонок отменили или
        // на него ответили с другого устройства), без него — всё сразу.
        final id = msg['id'] as String?;
        if (id != null) {
          _queue.removeWhere((t) => t.id == id);
          if (_current?.id == id) _dismiss();
        } else {
          _queue.clear();
          _dismiss();
        }
        break;
      case 'quit':
        _exit();
        break;
    }
  }

  void _send(Map<String, dynamic> msg) {
    try {
      _socket?.write('${jsonEncode(msg)}\n');
    } catch (_) {}
  }

  // ── Показ ─────────────────────────────────────────────────────────────────

  void _enqueue(ToastData t) {
    // Прогрев или уход текущего — новое ждёт в очереди, иначе оно появилось бы
    // посреди чужой анимации.
    if (_warming || _leaving) {
      _queue.add(t);
      return;
    }
    if (_current == null) {
      _present(t);
      return;
    }
    // Звонок ждать не может: пока сообщение дослуживает своё время, звонящий
    // успеет положить трубку. Он вытесняет текущий тост немедленно.
    if (t.isCall) {
      _queue.removeWhere((q) => q.isCall);
      _present(t);
      return;
    }
    // Тост на экране один: новое встаёт в очередь и заменит текущий, но не
    // раньше, чем текущий провисит _minReadTime — иначе первое уведомление
    // мелькнёт, и его не успеют прочитать.
    _queue.add(t);
    _scheduleReplace();
  }

  /// Запланировать замену текущего тоста следующим из очереди: сразу, если
  /// текущий уже провисел положенное, иначе — когда провисит.
  void _scheduleReplace() {
    if (_queue.isEmpty || _current == null || _leaving) return;
    // Звонок на экране не сменяют сообщениями — они подождут.
    if (_current!.isCall) return;
    final shownFor = DateTime.now().difference(_shownAt ?? DateTime.now());
    final left = _minReadTime - shownFor;
    _replaceTimer?.cancel();
    _replaceTimer = Timer(left.isNegative ? Duration.zero : left, () {
      if (_queue.isEmpty || !mounted) return;
      _present(_queue.removeAt(0));
    });
  }

  /// Показать уведомление: если на экране уже есть тост — сменить содержимое
  /// (окно то же и того же размера, поэтому без скрытия и без мигания).
  Future<void> _present(ToastData t) async {
    _hideTimer?.cancel();
    _replaceTimer?.cancel();

    final replacing = _current != null;
    if (replacing) {
      // Старое уводим, затем на его месте показываем новое.
      await _anim.reverse();
      if (!mounted) return;
    }

    setState(() => _current = t);

    if (!replacing) {
      await _applyBounds();
      await windowManager.show(inactive: true);
      if (!mounted) return;
      // Ждём настоящий кадр: у скрытого окна кадров нет, и без этой паузы
      // анимация стартовала бы из уже конечного состояния.
      await WidgetsBinding.instance.endOfFrame;
      if (!mounted) return;
    }

    await _anim.forward(from: 0);
    if (!mounted) return;
    _shownAt = DateTime.now();
    if (!replacing) {
      // «Поверх всех» пере-выставляем ПОСЛЕ анимации: этот вызов синхронно
      // ходит в нативную часть и, попав в начало показа, съедал первые кадры.
      await windowManager.setAlwaysOnTop(true);
    }
    // Звонок висит, пока звонят: снимет его сам звонок — ответом, отказом или
    // командой от приложения. Уводить его по таймеру нельзя.
    if (!t.isCall) {
      _restartLifetime();
      // Пока показывали этот тост, мог накопиться следующий.
      _scheduleReplace();
    }
  }

  void _restartLifetime() {
    _hideTimer?.cancel();
    _hideTimer = Timer(_toastLifetime, _dismiss);
  }

  /// Размер и позиция окна: правый нижний угол рабочей области. Размер всегда
  /// один и тот же — окно не меняет границ, пока живёт процесс.
  Future<void> _applyBounds() async {
    try {
      final display = await screenRetriever.getPrimaryDisplay();
      final origin = display.visiblePosition ?? Offset.zero;
      final area = display.visibleSize ?? display.size;
      await windowManager.setBounds(Rect.fromLTWH(
        origin.dx + area.width - kToastWidth - _screenMargin,
        origin.dy + area.height - kToastHeight - _screenMargin,
        kToastWidth,
        kToastHeight,
      ));
    } catch (_) {
      // Не смогли определить экран — оставляем окно там, где его поставила ОС.
    }
  }

  // ── Уход ──────────────────────────────────────────────────────────────────

  /// Клик по карточке: сообщаем приложению и убираем тост — пользователь
  /// уходит в приложение, очередь ему уже не нужна.
  void _onCardTap(ToastData t) {
    _send({'event': 'click', 'id': t.id});
    _queue.clear();
    _dismiss();
  }

  /// Ответ или отказ по звонку: решение уходит приложению, тост снимаем сами —
  /// дальше разговор ведётся в главном окне.
  void _onCallAction(ToastData t, String action) {
    _send({'event': 'call', 'id': t.id, 'action': action});
    _dismiss();
  }

  /// Убрать тост: показать следующий из очереди либо спрятать окно.
  Future<void> _dismiss() async {
    if (_leaving || _current == null) return;
    _hideTimer?.cancel();
    _replaceTimer?.cancel();

    if (_queue.isNotEmpty) {
      await _present(_queue.removeAt(0));
      return;
    }

    _leaving = true;
    await _anim.reverse();
    if (!mounted) return;
    setState(() => _current = null);
    await _hideWindow();
    _leaving = false;
    // Пока уходил — могло прийти новое.
    if (_queue.isNotEmpty) _present(_queue.removeAt(0));
  }

  Future<void> _hideWindow() async {
    try {
      await windowManager.hide();
    } catch (_) {}
  }

  // ── Прогрев ───────────────────────────────────────────────────────────────

  /// Прогрев первого кадра: рисуем карточку за пределами экрана и сразу
  /// прячем. Без этого ПЕРВОЕ уведомление появлялось рывком — на него
  /// приходились растеризация шрифтов и компиляция шейдеров.
  Future<void> _warmUp() async {
    _warming = true;
    setState(() {
      _current = const ToastData(
          id: '', title: 'Vellin', body: 'Прогрев', avatarUrl: null, avatarSeed: '');
    });
    _anim.value = 1;
    try {
      await windowManager.setPosition(_offscreen);
      await windowManager.show(inactive: true);
      // Несколько кадров, чтобы прогрелся весь конвейер отрисовки.
      for (var i = 0; i < 3; i++) {
        await WidgetsBinding.instance.endOfFrame;
      }
      await windowManager.hide();
    } catch (_) {
      // Прогрев необязателен — при сбое просто работаем как есть.
    }
    _anim.value = 0;
    if (mounted) setState(() => _current = null);
    _warming = false;
    if (_queue.isNotEmpty) _present(_queue.removeAt(0));
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Material(
        color: _card,
        child: _current == null
            ? const SizedBox.shrink()
            : _ToastCard(
                data: _current!,
                progress: _anim,
                onTap: () => _onCardTap(_current!),
                onClose: _dismiss,
                onCallAction: (action) => _onCallAction(_current!, action),
              ),
      ),
    );
  }
}

/// Карточка уведомления: аватар, имя, текст. Скругления рисуем сами — окно
/// прямоугольное, а стопка должна читаться как отдельные плитки.
class _ToastCard extends StatefulWidget {
  final ToastData data;

  /// 0 — карточки нет, 1 — показана полностью.
  final Animation<double> progress;
  final VoidCallback onTap;
  final VoidCallback onClose;

  /// 'accept' | 'decline' — только для тоста входящего звонка.
  final void Function(String action) onCallAction;
  const _ToastCard({
    required this.data,
    required this.progress,
    required this.onTap,
    required this.onClose,
    required this.onCallAction,
  });

  @override
  State<_ToastCard> createState() => _ToastCardState();
}

class _ToastCardState extends State<_ToastCard> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final call = widget.data.isCall;
    final curve = CurvedAnimation(
      parent: widget.progress,
      curve: Curves.easeOutCubic,
      reverseCurve: Curves.easeInCubic,
    );

    return AnimatedBuilder(
      animation: curve,
      builder: (_, child) {
        final t = curve.value.clamp(0.0, 1.0);
        return Opacity(
          opacity: t,
          child: Transform.translate(offset: Offset(24 * (1 - t), 0), child: child),
        );
      },
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        onEnter: (_) => setState(() => _hover = true),
        onExit: (_) => setState(() => _hover = false),
        child: GestureDetector(
          onTap: widget.onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            width: kToastWidth,
            height: kToastHeight,
            // Прямоугольник без скруглений: окно ровно по карточке, поэтому
            // скругление показывало бы углы фона окна.
            decoration: BoxDecoration(
              color: _hover ? const Color(0xFF181312) : _card,
              border: Border.all(color: const Color(0x1AFFF5EB)),
            ),
            clipBehavior: Clip.antiAlias,
            child: Stack(children: [
              // Тёплое световое пятно — общий приём семейства окон Vellin.
              const Positioned(
                left: -60,
                top: -80,
                width: 240,
                height: 240,
                child: IgnorePointer(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: RadialGradient(
                        radius: 0.7071,
                        colors: [Color(0x1FFFF6E8), Color(0x00FFF6E8)],
                        stops: [0, 0.62],
                      ),
                    ),
                  ),
                ),
              ),
              // Акцентная кромка слева — бренд-штрих.
              Positioned(left: 0, top: 0, bottom: 0, width: 3, child: Container(color: _accent)),
              // Аватар и текст выровнены по общему центру карточки. Именно
              // Positioned.fill: Stack не растягивает обычных детей, и блок
              // прижимался бы к верхнему краю.
              Positioned.fill(
                child: Padding(
                padding: EdgeInsets.fromLTRB(16, 12, call ? 12 : 42, 12),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    _ToastAvatar(data: widget.data, size: call ? 46 : 54),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.center,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            widget.data.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: _t(size: 15.5, weight: FontWeight.w600, spacing: -0.1),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            widget.data.body,
                            maxLines: call ? 1 : 2,
                            overflow: TextOverflow.ellipsis,
                            style: _t(size: 14, alpha: 0.72, height: 1.35),
                          ),
                        ],
                      ),
                    ),
                    // Ответить и отклонить прямо из тоста: главное окно сейчас
                    // не в фокусе, и поднимать его ради двух кнопок незачем.
                    if (call) ...[
                      const SizedBox(width: 8),
                      _CallActionButton(
                        glyph: VellinGlyphs.calls,
                        rotate: true,
                        color: _declineRed,
                        onTap: () => widget.onCallAction('decline'),
                      ),
                      const SizedBox(width: 8),
                      _CallActionButton(
                        glyph: VellinGlyphs.calls,
                        color: _acceptGreen,
                        onTap: () => widget.onCallAction('accept'),
                      ),
                    ],
                  ],
                ),
                ),
              ),
              // У звонка крестика нет: отказ — это кнопка, а не закрытие.
              if (!call)
                Positioned(top: 10, right: 10, child: _CloseButton(onTap: widget.onClose)),
              // Подпись семейства окон Vellin — тост должен читаться как «от
              // приложения», раз системной плашки с именем больше нет.
              if (!call)
                Positioned(
                  bottom: 10,
                  right: 12,
                  child: Text('VELLIN',
                      style: _t(size: 8, weight: FontWeight.w600, alpha: 0.3, spacing: 2.2)),
                ),
            ]),
          ),
        ),
      ),
    );
  }
}

/// Аватар отправителя: загруженная картинка либо градиентная заглушка с
/// инициалом — та же логика и тот же цвет, что в приложении (VellinAvatar).
class _ToastAvatar extends StatelessWidget {
  final ToastData data;
  final double size;
  const _ToastAvatar({required this.data, required this.size});

  @override
  Widget build(BuildContext context) {
    final url = data.avatarUrl;
    final hasImage = url != null && url.isNotEmpty;
    final initial = data.title.isNotEmpty ? data.title[0].toUpperCase() : '?';
    final tint = avatarTint(data.avatarSeed, data.title);

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: const Color(0xFF1A1614),
        border: Border.all(color: const Color(0x1AFFF5EB)),
        image: hasImage ? DecorationImage(image: NetworkImage(url), fit: BoxFit.cover) : null,
        gradient: hasImage ? null : LinearGradient(colors: [tint, tint.withValues(alpha: 0.6)]),
      ),
      alignment: Alignment.center,
      child: hasImage ? null : Text(initial, style: _t(size: size * 0.4, weight: FontWeight.w600)),
    );
  }
}

/// Круглая кнопка ответа или отказа в тосте входящего звонка.
class _CallActionButton extends StatefulWidget {
  final List<String> glyph;
  final Color color;
  final VoidCallback onTap;

  /// Отказ — та же трубка, повёрнутая: отдельного глифа сброса в наборе нет, а
  /// поворот читается однозначно.
  final bool rotate;

  const _CallActionButton({
    required this.glyph,
    required this.color,
    required this.onTap,
    this.rotate = false,
  });
  @override
  State<_CallActionButton> createState() => _CallActionButtonState();
}

class _CallActionButtonState extends State<_CallActionButton> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        // Кнопка не должна заодно открывать приложение по клику на карточку.
        onTap: widget.onTap,
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: _hover ? widget.color : widget.color.withValues(alpha: 0.85),
          ),
          alignment: Alignment.center,
          child: Transform.rotate(
            angle: widget.rotate ? 2.36 : 0,
            child: VellinIcon(widget.glyph, size: 17, color: const Color(0xFF14100B)),
          ),
        ),
      ),
    );
  }
}

class _CloseButton extends StatefulWidget {
  final VoidCallback onTap;
  const _CloseButton({required this.onTap});
  @override
  State<_CloseButton> createState() => _CloseButtonState();
}

class _CloseButtonState extends State<_CloseButton> {
  bool _hover = false;
  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        // Крестик не должен открывать уведомление вместе с закрытием.
        onTap: widget.onTap,
        behavior: HitTestBehavior.opaque,
        child: Container(
          width: 24,
          height: 24,
          decoration: BoxDecoration(
            color: _hover ? const Color(0x1AFFF5EB) : Colors.transparent,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Icon(Icons.close, size: 14, color: _paper.withValues(alpha: _hover ? 0.9 : 0.45)),
        ),
      ),
    );
  }
}
