import 'package:flutter/material.dart';
import '../app_config.dart';
import '../theme/vellin_theme.dart';

/// Аватар пользователя: загруженная картинка или градиент-заглушка с инициалом.
/// Опционально — индикатор «онлайн».
class VellinAvatar extends StatelessWidget {
  final String username;
  final String avatarSeed;
  final String? avatarUrl;
  final double size;
  final bool? online;

  const VellinAvatar({
    super.key,
    required this.username,
    required this.avatarSeed,
    this.avatarUrl,
    this.size = 40,
    this.online,
  });

  @override
  Widget build(BuildContext context) {
    final url = AppConfig.mediaUrl(avatarUrl);
    final initial = username.isNotEmpty ? username[0].toUpperCase() : '?';
    // Детерминированный оттенок заглушки по seed.
    final hue = (avatarSeed.isEmpty ? username : avatarSeed).hashCode % 360;
    final grad = HSLColor.fromAHSL(1, hue.abs().toDouble(), 0.5, 0.4).toColor();

    final avatar = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: VellinColors.bg3,
        image: url != null ? DecorationImage(image: NetworkImage(url), fit: BoxFit.cover) : null,
        gradient: url == null ? LinearGradient(colors: [grad, grad.withValues(alpha: 0.6)]) : null,
      ),
      alignment: Alignment.center,
      child: url == null
          ? Text(initial, style: TextStyle(color: Colors.white, fontSize: size * 0.4, fontWeight: FontWeight.w600))
          : null,
    );

    if (online == null) return avatar;
    return Stack(clipBehavior: Clip.none, children: [
      avatar,
      Positioned(
        right: -1,
        bottom: -1,
        child: Container(
          width: size * 0.28,
          height: size * 0.28,
          decoration: BoxDecoration(
            color: online! ? VellinColors.ok : VellinColors.text3,
            shape: BoxShape.circle,
            border: Border.all(color: VellinColors.bg0, width: 2),
          ),
        ),
      ),
    ]);
  }
}

/// Поле ввода в стиле Vellin (label капсом + тёмный инпут).
class VellinField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final bool obscure;
  final String? hint;
  final TextInputType? keyboardType;
  final bool enabled;

  const VellinField({
    super.key,
    required this.label,
    required this.controller,
    this.obscure = false,
    this.hint,
    this.keyboardType,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: const TextStyle(
            fontSize: 11,
            letterSpacing: 0.6,
            color: VellinColors.text2,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          obscureText: obscure,
          enabled: enabled,
          keyboardType: keyboardType,
          style: const TextStyle(color: VellinColors.text0, fontSize: 15),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: const TextStyle(color: VellinColors.text3),
            filled: true,
            fillColor: VellinColors.bg2,
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
            enabledBorder: _border(VellinColors.line2),
            focusedBorder: _border(VellinColors.accentHi),
            disabledBorder: _border(VellinColors.line1),
          ),
        ),
      ],
    );
  }

  OutlineInputBorder _border(Color c) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(VellinRadius.md),
        borderSide: BorderSide(color: c),
      );
}

/// Первичная кнопка (акцентная, во всю ширину).
class PrimaryButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final bool secondary;

  const PrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.secondary = false,
  });

  @override
  Widget build(BuildContext context) {
    final bg = secondary ? VellinColors.bg3 : VellinColors.accent;
    final fg = secondary ? VellinColors.text0 : Colors.white;
    return SizedBox(
      width: double.infinity,
      height: 46,
      child: FilledButton(
        onPressed: loading ? null : onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: bg,
          foregroundColor: fg,
          disabledBackgroundColor: bg.withValues(alpha: 0.5),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(VellinRadius.md)),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
        child: loading
            ? const SizedBox(
                width: 18, height: 18,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
              )
            : Text(label),
      ),
    );
  }
}

/// Баннер ошибки (красный).
class ErrorBanner extends StatelessWidget {
  final String? message;
  const ErrorBanner(this.message, {super.key});
  @override
  Widget build(BuildContext context) {
    if (message == null) return const SizedBox.shrink();
    return _Banner(message!, VellinColors.accentHi, const Color(0x1FD1271B));
  }
}

/// Баннер успеха (зелёный).
class SuccessBanner extends StatelessWidget {
  final String? message;
  const SuccessBanner(this.message, {super.key});
  @override
  Widget build(BuildContext context) {
    if (message == null) return const SizedBox.shrink();
    return _Banner(message!, VellinColors.ok, const Color(0x1F4ADE80));
  }
}

class _Banner extends StatelessWidget {
  final String text;
  final Color fg;
  final Color bg;
  const _Banner(this.text, this.fg, this.bg);
  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(VellinRadius.md),
        border: Border.all(color: fg.withValues(alpha: 0.3)),
      ),
      child: Text(text, style: TextStyle(color: fg, fontSize: 13)),
    );
  }
}

/// Каркас экранов входа/регистрации: центрированная карточка на тёмном фоне.
class AuthShell extends StatelessWidget {
  final String title;
  final String subtitle;
  final List<Widget> children;
  final Widget footer;

  const AuthShell({
    super.key,
    required this.title,
    required this.subtitle,
    required this.children,
    required this.footer,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: VellinColors.bg0,
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Container(
              padding: const EdgeInsets.fromLTRB(32, 32, 32, 28),
              decoration: BoxDecoration(
                color: VellinColors.bg1,
                borderRadius: BorderRadius.circular(VellinRadius.xl),
                border: Border.all(color: VellinColors.line2),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  const _WordmarkVellin(),
                  const SizedBox(height: 22),
                  Text(title,
                      style: const TextStyle(
                          fontSize: 24, fontWeight: FontWeight.w600, color: VellinColors.text0, letterSpacing: -0.4)),
                  const SizedBox(height: 6),
                  Text(subtitle, style: const TextStyle(fontSize: 14, color: VellinColors.text1)),
                  const SizedBox(height: 22),
                  ...children,
                  const SizedBox(height: 18),
                  Align(alignment: Alignment.center, child: footer),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Простой словесный логотип «Vellin» с акцентной точкой.
class _WordmarkVellin extends StatelessWidget {
  const _WordmarkVellin();
  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          width: 10, height: 10,
          decoration: const BoxDecoration(color: VellinColors.accent, shape: BoxShape.circle),
        ),
        const SizedBox(width: 8),
        const Text('Vellin',
            style: TextStyle(
                fontSize: 20, fontWeight: FontWeight.w700, color: VellinColors.text0, letterSpacing: -0.5)),
      ],
    );
  }
}
