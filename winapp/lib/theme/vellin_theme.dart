import 'package:flutter/material.dart';

/// Дизайн-токены Vellin (тёмная палитра — основная), перенесённые из
/// design/tokens.css. Единый источник цветов/радиусов для всего клиента.
class VellinColors {
  static const bg0 = Color(0xFF0A0807);
  static const bg1 = Color(0xFF0E0B0A);
  static const bg2 = Color(0xFF14100E);
  static const bg3 = Color(0xFF1A1614);
  static const bg4 = Color(0xFF221C19);
  static const bg5 = Color(0xFF2B2421);

  static const line1 = Color(0x0FFFF5EB); // rgba(255,245,235,0.06)
  static const line2 = Color(0x1AFFF5EB); // 0.10
  static const line3 = Color(0x29FFF5EB); // 0.16

  static const text0 = Color(0xFFF6F1ED);
  static const text1 = Color(0xFFC8BDB5);
  static const text2 = Color(0xFF8A7F78);
  static const text3 = Color(0xFF5A504A);

  static const accent = Color(0xFFD1271B);
  static const accentHi = Color(0xFFE8462A);
  static const accentLo = Color(0xFFA01A12);
  static const accentSoft = Color(0x24D1271B); // 0.14
  static const accentGlow = Color(0x59D1271B); // 0.35

  static const ok = Color(0xFF4ADE80);
  static const warn = Color(0xFFFACC15);
}

/// Радиусы (r-* токены).
class VellinRadius {
  static const xs = 6.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 22.0;
  static const xxl = 28.0;
}

ThemeData buildVellinTheme() {
  const scheme = ColorScheme.dark(
    surface: VellinColors.bg1,
    primary: VellinColors.accentHi,
    onPrimary: Colors.white,
    error: VellinColors.accentHi,
    onSurface: VellinColors.text0,
  );

  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: VellinColors.bg0,
    colorScheme: scheme,
    fontFamily: 'Segoe UI',
    textTheme: const TextTheme(
      bodyMedium: TextStyle(color: VellinColors.text0, fontSize: 15),
      bodySmall: TextStyle(color: VellinColors.text1, fontSize: 13),
    ),
    splashFactory: InkRipple.splashFactory,
  );
}
