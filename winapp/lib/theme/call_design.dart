import 'package:flutter/material.dart';

/// Дизайн экрана звонка.
///
/// Значения взяты один в один из спецификации «Экран звонка Vellin — хендофф
/// для разработки» и живут отдельно от общих токенов приложения: у звонка своя
/// палитра — тёплая, с золотым акцентом вместо красного, — и смешивать их
/// нельзя, иначе разговор перестанет читаться как отдельное пространство.
///
/// Базовый кадр макета — 1440×810 логических пикселей; все размеры даны при
/// нём. Окно меньше — раскладка сжимается, значения не пересчитываются.
class CallColors {
  /// Фон приложения за окном разговора.
  static const bgApp = Color(0xFF050505);

  /// Фон самого окна разговора.
  static const bgWindow = Color(0xFF0A0908);

  /// Матовые панели (настройки, выбор источника) — 80 % непрозрачности.
  static const panelGlass = Color(0xCC0D0C0B);

  /// Приподнятая поверхность: карточки, кадры видео.
  static const surfaceRaised = Color(0xFF131110);

  /// Акцент — всё, что связано с трансляцией и вниманием.
  static const gold = Color(0xFFE2C99B);

  /// Свечение акцента: тени и ореолы.
  static const goldGlow = Color(0xFFD6AE6E);

  /// Сброс звонка — единственный цветной элемент интерфейса.
  static const danger = Color(0xEBBA423A);

  /// Выключенные микрофон и камера.
  static const dangerSoft = Color(0xFFD65C52);

  // Текст — белый с прозрачностью.
  static const textPrimary = Colors.white;
  static final textStrong = Colors.white.withValues(alpha: 0.92);
  static final textBody = Colors.white.withValues(alpha: 0.78);
  static final textMuted = Colors.white.withValues(alpha: 0.55);
  static final textFaint = Colors.white.withValues(alpha: 0.42);
  static final textLabel = Colors.white.withValues(alpha: 0.32);

  // Поверхности и границы.
  static final surface = Colors.white.withValues(alpha: 0.045);
  static final surfaceHover = Colors.white.withValues(alpha: 0.11);
  static final stroke = Colors.white.withValues(alpha: 0.07);
  static final strokeSoft = Colors.white.withValues(alpha: 0.10);
  static final divider = Colors.white.withValues(alpha: 0.06);
  static final goldStroke = gold.withValues(alpha: 0.55);
}

/// Движение интерфейса звонка.
///
/// Кривая одна на весь продукт: ни `Curves.linear`, ни отскоков. Дыхательные
/// циклы (свечение, точки состояния, фон) — `easeInOut` с разворотом.
class CallMotion {
  static const ease = Cubic(0.16, 1.0, 0.30, 1.0);

  /// Наведение, иконки.
  static const fast = Duration(milliseconds: 400);

  /// Кнопки, смена состояний.
  static const base = Duration(milliseconds: 500);

  /// Панели, раскладка.
  static const slow = Duration(milliseconds: 600);
}

/// Радиусы и отступы каркаса.
class CallGeometry {
  /// Карточки и кадры видео.
  static const radiusCard = 18.0;

  /// Малые превью и поля ввода.
  static const radiusSmall = 12.0;
  static const radiusMedium = 16.0;

  /// Ширина панели настроек справа.
  static const panelWidth = 400.0;

  /// На столько уезжает влево своё превью, когда панель открыта.
  static const panelShift = 408.0;
}

/// Гарнитура и начертания экрана звонка.
///
/// Цифры таймера и процентов идут табличными: иначе строка дёргается на каждой
/// секунде, потому что знаки разной ширины.
class CallText {
  static const family = 'Manrope';
  static const _tabular = [FontFeature.tabularFigures()];

  /// Имя на пустом кадре.
  static final displayName = TextStyle(
    fontFamily: family,
    fontSize: 26,
    fontWeight: FontWeight.w200,
    letterSpacing: 0.26,
    color: CallColors.textPrimary,
  );

  /// Заголовок панели.
  static final panelTitle = TextStyle(
    fontFamily: family,
    fontSize: 19,
    fontWeight: FontWeight.w400,
    letterSpacing: 0.19,
    color: CallColors.textPrimary,
  );

  /// Строка настройки.
  static final row = TextStyle(
    fontFamily: family,
    fontSize: 13.5,
    fontWeight: FontWeight.w400,
    color: CallColors.textBody,
  );

  /// Подпись под строкой настройки.
  static final rowHint = TextStyle(
    fontFamily: family,
    fontSize: 11.5,
    fontWeight: FontWeight.w400,
    color: CallColors.textLabel,
  );

  /// Таймер разговора.
  static final timer = TextStyle(
    fontFamily: family,
    fontSize: 12,
    fontWeight: FontWeight.w400,
    letterSpacing: 1.2,
    fontFeatures: _tabular,
    color: Colors.white.withValues(alpha: 0.72),
  );

  /// Заголовок секции — прописными, с разрядкой.
  static final section = TextStyle(
    fontFamily: family,
    fontSize: 10.5,
    fontWeight: FontWeight.w400,
    letterSpacing: 1.47,
    color: CallColors.textLabel,
  );

  /// Надпись на пилюле состояния.
  static final pill = TextStyle(
    fontFamily: family,
    fontSize: 11.5,
    fontWeight: FontWeight.w500,
    letterSpacing: 0.46,
    color: CallColors.textMuted,
  );

  /// Мелкая надпись прописными на плашке.
  static final plaque = TextStyle(
    fontFamily: family,
    fontSize: 10.5,
    fontWeight: FontWeight.w400,
    letterSpacing: 1.05,
    color: Colors.white.withValues(alpha: 0.52),
  );

  static final tabularSmall = TextStyle(
    fontFamily: family,
    fontSize: 12,
    fontWeight: FontWeight.w400,
    fontFeatures: _tabular,
    color: CallColors.textFaint,
  );
}
