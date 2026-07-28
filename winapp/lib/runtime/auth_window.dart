// Окно входа в Vellin — отдельное окно того же семейства, что апдейтер и
// установщик: тёмная подложка с тёплой засветкой, знак и слово VELLIN сверху.
//
// Два способа входа работают одновременно и не переключаются: слева обычная
// форма email/пароль (основной путь, поэтому шире), справа — QR для входа с
// телефона. Регистрации в приложении нет: кнопка ведёт на сайт.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:window_manager/window_manager.dart';

import '../api/api_client.dart';
import '../api/auth_api.dart';
import '../app_config.dart';
import '../state/auth_controller.dart';
import 'updater_splash.dart';

/// Размер окна авторизации (клиентская область).
const Size kAuthSize = Size(840, 560);

const Color _paper = Color(0xFFF7F6F4);

/// Ставит окну размер входа: клиентская область ровно [kAuthSize], центр
/// сохраняется.
///
/// Всё делается ОДНИМ вызовом `setBounds`. Толщину рамки считаем заранее — по
/// разнице текущих внешних границ и клиентской области, — иначе окно пришлось
/// бы менять дважды (размер, затем компенсация рамки) и оно заметно дёргалось
/// бы на месте. Позицию задаём вместе с размером: `setSize` тянет окно от
/// левого-верхнего угла и сместило бы его вбок.
Future<void> applyAuthWindowSize() async {
  final view = WidgetsBinding.instance.platformDispatcher.views.first;
  final client = view.physicalSize / view.devicePixelRatio;
  final b = await windowManager.getBounds();
  final frameW = b.width - client.width;
  final frameH = b.height - client.height;
  await windowManager.setBounds(
    Rect.fromCenter(
      center: b.center,
      width: kAuthSize.width + frameW,
      height: kAuthSize.height + frameH,
    ),
  );
}

TextStyle _t({
  double size = 13,
  FontWeight weight = FontWeight.w400,
  double alpha = 1,
  double? spacing,
  double? height,
  Color color = _paper,
}) => TextStyle(
  fontFamily: 'Onest',
  fontFamilyFallback: const ['Segoe UI Variable Display', 'Segoe UI'],
  fontSize: size,
  fontWeight: weight,
  height: height,
  letterSpacing: spacing,
  color: color.withValues(alpha: alpha),
);

/// Состояние заявки на вход по QR. Истёкшего состояния нет: код обновляется
/// сам, поэтому пользователь видит либо действующий код, либо ошибку сети.
enum _QrState { loading, active, approved, failed }

class AuthWindow extends StatefulWidget {
  const AuthWindow({super.key, required this.auth, required this.authApi});

  final AuthController auth;
  final AuthApi authApi;

  @override
  State<AuthWindow> createState() => _AuthWindowState();
}

class _AuthWindowState extends State<AuthWindow> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _emailFocus = FocusNode();
  final _passwordFocus = FocusNode();

  bool _busy = false;
  String? _error;

  _QrState _qrState = _QrState.loading;
  QrLoginStart? _qr;
  Timer? _poll;
  Timer? _refresh;

  @override
  void initState() {
    super.initState();
    for (final f in [_emailFocus, _passwordFocus]) {
      f.addListener(_onFocus);
    }
    _startQr();
  }

  void _onFocus() => setState(() {});

  @override
  void dispose() {
    _poll?.cancel();
    _refresh?.cancel();
    for (final f in [_emailFocus, _passwordFocus]) {
      f.removeListener(_onFocus);
      f.dispose();
    }
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  // ── Вход по QR ──────────────────────────────────────────────────────────

  /// Берёт новую заявку. При [silent] прежний код остаётся на экране до самой
  /// подмены — обновление проходит незаметно, без мигания пустым квадратом.
  Future<void> _startQr({bool silent = false}) async {
    _poll?.cancel();
    _refresh?.cancel();
    if (!silent) {
      setState(() {
        _qrState = _QrState.loading;
        _qr = null;
      });
    }
    try {
      final start = await widget.authApi.qrStart();
      if (!mounted) return;
      setState(() {
        _qr = start;
        _qrState = _QrState.active;
      });
      // Опрашиваем нечасто: заявка живёт минуты, а не секунды.
      _poll = Timer.periodic(const Duration(seconds: 2), (_) => _pollQr());
      _scheduleRefresh(start);
    } catch (_) {
      if (!mounted) return;
      // Сеть могла моргнуть — пробуем снова, не оставляя мёртвый код навсегда.
      if (!silent) setState(() => _qrState = _QrState.failed);
      _refresh = Timer(const Duration(seconds: 5), () => _startQr(silent: silent));
    }
  }

  /// Просит следующий код заранее, до того как текущий сгорит.
  void _scheduleRefresh(QrLoginStart start) {
    const lead = Duration(seconds: 5);
    final left = start.expiresAt.difference(DateTime.now()) - lead;
    _refresh = Timer(left.isNegative ? Duration.zero : left, () => _startQr(silent: true));
  }

  Future<void> _pollQr() async {
    final qr = _qr;
    if (qr == null) return;
    try {
      final res = await widget.authApi.qrPoll(qr.pollToken);
      if (!mounted) return;
      if (res.status == 'approved' && res.result != null) {
        _poll?.cancel();
        _refresh?.cancel();
        setState(() => _qrState = _QrState.approved);
        await widget.auth.applyResult(res.result!);
      } else if (res.status == 'expired') {
        // Не ждём таймера обновления — код уже недействителен.
        await _startQr(silent: true);
      }
    } catch (_) {
      // Сетевые сбои не считаем провалом заявки — продолжаем опрос.
    }
  }

  // ── Вход по паролю ──────────────────────────────────────────────────────

  Future<void> _login() async {
    if (_busy) return;
    final email = _email.text.trim();
    final password = _password.text;
    if (email.isEmpty || password.isEmpty) {
      setState(() => _error = 'Введите email и пароль');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.auth.login(email, password);
      // Дальше окно закроет главный экран приложения.
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _error = e.status == 401 ? 'Неверный email или пароль' : e.message);
      }
    } catch (_) {
      if (mounted) setState(() => _error = 'Не удалось войти. Проверьте подключение.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openSite(String path) async {
    final uri = Uri.parse('${AppConfig.siteUrl}$path');
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      type: MaterialType.transparency,
      child: DragToMoveArea(
        child: CustomPaint(
          painter: const VellinBackdropPainter(),
          child: Stack(
            children: [
              _glow(),
              // Окно переезжает в размер входа кадром позже смены фазы, и до
              // этого вёрстка не влезает в маленькое окно апдейтера. Держим
              // собственную высоту, чтобы этот кадр просто обрезался.
              SingleChildScrollView(
                physics: const NeverScrollableScrollPhysics(),
                child: SizedBox(
                  height: kAuthSize.height,
                  child: Column(
                    children: [
                      const SizedBox(height: 34),
                      _brand(),
                      const SizedBox(height: 30),
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(44, 0, 44, 34),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // Основной путь входа — форме отдаём больше места.
                              Expanded(flex: 7, child: _passwordForm()),
                              const SizedBox(width: 30),
                              Container(
                                width: 1,
                                height: 232,
                                color: _paper.withValues(alpha: 0.08),
                              ),
                              const SizedBox(width: 30),
                              Expanded(flex: 5, child: _qrPanel()),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Positioned(top: 6, right: 6, child: _closeButton()),
            ],
          ),
        ),
      ),
    );
  }

  Widget _closeButton() => _IconButton(icon: Icons.close, onTap: () => windowManager.close());

  /// Тёплое световое пятно за знаком — как в апдейтере и установщике.
  Widget _glow() {
    const d = 440.0;
    return Positioned(
      left: kAuthSize.width / 2 - d / 2,
      top: kAuthSize.height * 0.16 - d / 2,
      width: d,
      height: d,
      child: const IgnorePointer(
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
    );
  }

  /// Знак и слово VELLIN — тот же ассет, что в апдейтере и установщике.
  Widget _brand() {
    return Column(
      children: [
        SizedBox(
          width: 72,
          height: 72,
          // introMs больше длительности интро — знак сразу собранный.
          child: CustomPaint(painter: VellinMarkPainter(introMs: 5000, morph: 0, hg: 0, sand: 0)),
        ),
        const SizedBox(height: 16),
        Text(
          'VELLIN',
          style: _t(size: 17, weight: FontWeight.w500, height: 1, spacing: 17 * 0.42),
        ),
      ],
    );
  }

  // ── Левая колонка: обычный вход ─────────────────────────────────────────

  Widget _passwordForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Вход в аккаунт', style: _t(size: 19, weight: FontWeight.w500, height: 1.2)),
        const SizedBox(height: 8),
        Text(
          'Email и пароль от вашего аккаунта Vellin.',
          style: _t(size: 13, alpha: 0.6, height: 1.6),
        ),
        const SizedBox(height: 20),
        _label('EMAIL'),
        const SizedBox(height: 8),
        _field(
          controller: _email,
          focus: _emailFocus,
          hint: 'you@example.com',
          onSubmit: () => _passwordFocus.requestFocus(),
        ),
        const SizedBox(height: 14),
        _label('ПАРОЛЬ'),
        const SizedBox(height: 8),
        _field(
          controller: _password,
          focus: _passwordFocus,
          hint: '••••••••',
          obscure: true,
          onSubmit: _login,
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(_error!, style: _t(size: 12.5, color: const Color(0xFFE8A08C), height: 1.4)),
        ],
        const SizedBox(height: 20),
        _PrimaryButton(label: _busy ? 'Входим…' : 'Войти', onTap: _busy ? null : _login),
        const SizedBox(height: 14),
        Row(
          children: [
            Text('Нет аккаунта?', style: _t(size: 12.5, alpha: 0.5)),
            const SizedBox(width: 6),
            // Регистрации в приложении нет — уводим на сайт.
            _LinkButton(label: 'Зарегистрируйтесь', onTap: () => _openSite('/register')),
          ],
        ),
      ],
    );
  }

  Widget _label(String text) => Text(text, style: _t(size: 11, alpha: 0.45, spacing: 11 * 0.09));

  Widget _field({
    required TextEditingController controller,
    required FocusNode focus,
    required String hint,
    bool obscure = false,
    VoidCallback? onSubmit,
  }) {
    return SizedBox(
      height: 42,
      child: Container(
        alignment: Alignment.centerLeft,
        padding: const EdgeInsets.symmetric(horizontal: 13),
        decoration: BoxDecoration(
          color: _paper.withValues(alpha: 0.05),
          border: Border.all(color: _paper.withValues(alpha: focus.hasFocus ? 0.42 : 0.16)),
          borderRadius: BorderRadius.circular(8),
        ),
        child: TextField(
          controller: controller,
          focusNode: focus,
          obscureText: obscure,
          style: _t(size: 13),
          cursorColor: _paper,
          onSubmitted: (_) => onSubmit?.call(),
          decoration: InputDecoration.collapsed(
            hintText: hint,
            hintStyle: _t(size: 13, alpha: 0.28),
          ),
        ),
      ),
    );
  }

  // ── Правая колонка: вход по QR ──────────────────────────────────────────

  Widget _qrPanel() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Вход по QR-коду', style: _t(size: 19, weight: FontWeight.w500, height: 1.2)),
        const SizedBox(height: 8),
        Text(
          'Наведите камеру телефона или отсканируйте код в приложении: Профиль → Устройства.',
          style: _t(size: 13, alpha: 0.6, height: 1.6),
        ),
        const SizedBox(height: 20),
        Center(child: _qrBox()),
      ],
    );
  }

  Widget _qrBox() {
    const size = 168.0;
    Widget inner;
    switch (_qrState) {
      case _QrState.active:
        inner = QrImageView(
          data: _qr!.url,
          size: size - 24,
          padding: EdgeInsets.zero,
          backgroundColor: Colors.transparent,
          eyeStyle: const QrEyeStyle(eyeShape: QrEyeShape.square, color: Color(0xFF0B0908)),
          dataModuleStyle: const QrDataModuleStyle(
            dataModuleShape: QrDataModuleShape.square,
            color: Color(0xFF0B0908),
          ),
        );
      case _QrState.loading:
        inner = const SizedBox(
          width: 22,
          height: 22,
          child: CircularProgressIndicator(strokeWidth: 2.2, color: Color(0xFF0B0908)),
        );
      case _QrState.approved:
        inner = const Icon(Icons.check_rounded, size: 46, color: Color(0xFF0B0908));
      case _QrState.failed:
        inner = Padding(
          padding: const EdgeInsets.all(14),
          child: Text(
            'Код недоступен',
            textAlign: TextAlign.center,
            style: _t(size: 12.5, color: const Color(0xFF0B0908), alpha: 0.7),
          ),
        );
    }

    return Column(
      children: [
        // Светлая подложка — так код читается камерой куда увереннее.
        Container(
          width: size,
          height: size,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: _paper, borderRadius: BorderRadius.circular(14)),
          child: inner,
        ),
        const SizedBox(height: 14),
        SizedBox(
          height: 34,
          child: switch (_qrState) {
            _QrState.approved => Text('Вход подтверждён', style: _t(size: 12.5, alpha: 0.7)),
            _QrState.active => Text(
              'Код обновляется автоматически',
              style: _t(size: 12, alpha: 0.42),
            ),
            _QrState.loading => const SizedBox.shrink(),
            _QrState.failed => Text('Переподключаемся…', style: _t(size: 12, alpha: 0.42)),
          },
        ),
      ],
    );
  }
}

// ── Примитивы в стиле апдейтера и установщика ────────────────────────────

class _PrimaryButton extends StatefulWidget {
  const _PrimaryButton({required this.label, this.onTap});
  final String label;
  final VoidCallback? onTap;
  @override
  State<_PrimaryButton> createState() => _PrimaryButtonState();
}

class _PrimaryButtonState extends State<_PrimaryButton> {
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
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          height: 44,
          width: double.infinity,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: enabled ? (_hover ? Colors.white : _paper) : _paper.withValues(alpha: 0.45),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            widget.label,
            style: _t(size: 13.5, weight: FontWeight.w600, color: const Color(0xFF0B0908)),
          ),
        ),
      ),
    );
  }
}

class _LinkButton extends StatefulWidget {
  const _LinkButton({required this.label, this.onTap});
  final String label;
  final VoidCallback? onTap;
  @override
  State<_LinkButton> createState() => _LinkButtonState();
}

class _LinkButtonState extends State<_LinkButton> {
  bool _hover = false;
  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: Text(
          widget.label,
          style: _t(size: 12.5, weight: FontWeight.w600).copyWith(
            decoration: _hover ? TextDecoration.underline : TextDecoration.none,
            decorationColor: _paper,
          ),
        ),
      ),
    );
  }
}

class _IconButton extends StatefulWidget {
  const _IconButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;
  @override
  State<_IconButton> createState() => _IconButtonState();
}

class _IconButtonState extends State<_IconButton> {
  bool _hover = false;
  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: Container(
          width: 42,
          height: 34,
          alignment: Alignment.center,
          color: _hover ? const Color(0xFFE23B3B) : Colors.transparent,
          child: Icon(widget.icon, size: 16, color: _paper.withValues(alpha: _hover ? 1 : 0.55)),
        ),
      ),
    );
  }
}
