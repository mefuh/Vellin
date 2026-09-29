import 'package:flutter/material.dart';

import 'vellin_design.dart';

/// Тема Material — только для служебной обвязки: выделение текста, контекстное
/// меню поля ввода, подсказки, полосы прокрутки.
///
/// Интерфейс собран на своих виджетах и берёт цвета из [VellinColors]; здесь
/// задаётся лишь то, что Flutter рисует сам и мимо наших примитивов не пройдёт.
/// Своих цветов эта тема не заводит — иначе язык разъехался бы на два набора.
ThemeData buildVellinTheme() {
  const scheme = ColorScheme.dark(
    surface: VellinColors.bg1,
    primary: VellinColors.accent,
    onPrimary: VellinColors.onAccent,
    error: VellinColors.danger,
    onSurface: VellinColors.ink92,
  );

  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: VellinColors.bg1,
    colorScheme: scheme,
    // Шрифт один на весь клиент. Segoe UI снят: он был системной подменой и
    // рядом с экраном звонка читался как чужой.
    fontFamily: VellinType.family,
    textTheme: const TextTheme(
      bodyMedium: TextStyle(color: VellinColors.ink92, fontSize: 13.5),
      bodySmall: TextStyle(color: VellinColors.ink62, fontSize: 12),
    ),
    // Выделение и курсор в полях ввода — золотом, как всё выбранное.
    textSelectionTheme: const TextSelectionThemeData(
      cursorColor: VellinColors.accent,
      selectionColor: VellinColors.accentWash,
      selectionHandleColor: VellinColors.accent,
    ),
    splashFactory: InkRipple.splashFactory,
    // Подсказки Material по умолчанию светлые — на тёмном интерфейсе они
    // вспыхивают белой табличкой. Задаём фирменный тёмный вид один раз здесь,
    // чтобы это не приходилось повторять на каждой кнопке.
    tooltipTheme: TooltipThemeData(
      waitDuration: const Duration(milliseconds: 400),
      textStyle: VellinType.caption.copyWith(fontSize: 12.5, color: VellinColors.ink88),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: VellinColors.surface,
        borderRadius: BorderRadius.circular(VellinRadius.chip),
        border: Border.all(color: VellinColors.line10),
      ),
    ),
  );
}
