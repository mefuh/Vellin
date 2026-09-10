import 'package:flutter/widgets.dart';

/// Токены единого визуального языка клиента Vellin (Windows).
/// Ложатся рядом с call_design.dart: значения намеренно совпадают там, где
/// приложение и звонок должны читаться как одно пространство.
///
/// Правило: ни одного цвета, радиуса, кегля и длительности мимо этого файла.

// ─────────────────────────────────────────────────────────────────────────────
// Цвет
// ─────────────────────────────────────────────────────────────────────────────
class VellinColors {
  VellinColors._();

  /// Фон за окном и подложка модальных слоёв. Самая глубокая ступень.
  static const bg0 = Color(0xFF060505);

  /// Фон приложения — правая область, тело настроек.
  static const bg1 = Color(0xFF0A0807);

  /// Хром: заголовок окна и рейл. На полтона теплее тела.
  static const chrome = Color(0xFF0A0908);

  /// Левая панель и сайдбар настроек — отделяются от тела на один шаг.
  static const panel = Color(0xFF0D0C0B);

  /// Полосы под контентом: шапка чата, поле ввода, подвал левой панели.
  static const strip = Color(0xFF0B0A09);

  /// Приподнятая поверхность: карточки, строка «я», непрочитанное уведомление.
  static const surface = Color(0xFF131110);

  /// Чужой баббл — на ступень ниже карточки, чтобы не спорить с ней.
  static const bubble = Color(0xFF161413);

  /// Скелеты загрузки и крупные заглушки.
  static const skeleton = Color(0xFF1A1716);

  /// Подложка аватара в ленте, тёплый уровень.
  static const avatarBed = Color(0xFF211C18);

  /// Верхняя ступень фона: заглушка постера, разделители в плотных списках.
  static const bg5 = Color(0xFF2B2421);

  /// Акцент всего клиента — золото звонка.
  static const accent = Color(0xFFE2C99B);

  /// Только тени и ореолы вокруг акцента, самостоятельно не заливать.
  static const accentGlow = Color(0xFFD6AE6E);

  /// Заливка выбранного и акцентных пилюль.
  static const accentWash = Color(0x1AE2C99B); // 10 %

  /// Граница акцентных поверхностей.
  static const accentLine = Color(0x33E2C99B); // 20 %

  /// Сильная граница акцентной кнопки (тон gold из call_bits).
  static const accentLineStrong = Color(0x80E2C99B); // 50 %

  /// Текст и глифы поверх золота. Белый по контрасту не проходит.
  static const onAccent = Color(0xFF14100B);

  /// Присутствие: в сети / не беспокоить / не в сети.
  ///
  /// «Не беспокоить» рисуется месяцем, а не точкой, — форма и отличает его от
  /// двух других статусов, поэтому цвет тёплый жёлтый, а не сигнальный красный.
  static const online = Color(0xFF93B08A);
  static const dnd = Color(0xFFD6AE6E);
  static const offline = Color(0xFF5A514C);

  /// Сигналы. danger — выключено, пропущено, отклонено, выход.
  static const danger = Color(0xFFD65C52);

  /// Единственная «жёсткая» кнопка: закрыть окно, сбросить звонок.
  static const destructive = Color(0xFFBA423A);

  /// Ошибка и потеря связи — тёплый терракотовый из семьи системных окон.
  static const warning = Color(0xFFE8A08C);

  // Текст: белый с прозрачностью. Ниже .55 — только служебное и подписи.
  static const ink94 = Color(0xF0FFFFFF);
  static const ink92 = Color(0xEBFFFFFF);
  static const ink88 = Color(0xE0FFFFFF);
  static const ink82 = Color(0xD1FFFFFF);
  static const ink72 = Color(0xB8FFFFFF);
  static const ink62 = Color(0x9EFFFFFF);
  static const ink55 = Color(0x8CFFFFFF);
  static const ink45 = Color(0x73FFFFFF);
  static const ink42 = Color(0x6BFFFFFF);
  static const ink34 = Color(0x57FFFFFF);
  static const ink32 = Color(0x52FFFFFF);
  static const ink28 = Color(0x47FFFFFF);
  static const ink24 = Color(0x3DFFFFFF);

  // Границы. line05 — все разделители каркаса, line07 — кнопки и поля,
  // line09 — поле ввода в покое, line12/14 — стекло поверх содержимого.
  static const line05 = Color(0x0DFFFFFF);
  static const line06 = Color(0x0FFFFFFF);
  static const line07 = Color(0x12FFFFFF);
  static const line09 = Color(0x17FFFFFF);
  static const line10 = Color(0x1AFFFFFF);
  static const line12 = Color(0x1FFFFFFF);
  static const line14 = Color(0x24FFFFFF);

  // Заливки кнопок и полей (рецепт call_bits.dart).
  static const fill03 = Color(0x08FFFFFF);
  static const fill045 = Color(0x0BFFFFFF);
  static const fill055 = Color(0x0EFFFFFF); // наведение по строке
  static const fill11 = Color(0x1CFFFFFF);  // наведение по кнопке
  static const fill12 = Color(0x1FFFFFFF);  // дорожка выключенного тумблера

  /// Кольцо фокуса с клавиатуры. Рисуется отдельно от наведения: проход табом
  /// обязан быть виден, даже когда мышь лежит на другом элементе.
  static const focusRing = accentLineStrong; // 50 %

  /// Стекло: цвет подложки уже с прозрачностью, поверх — блюр [VellinBlur].
  static const glassPanel = Color(0x9E0A0908);  // 62 % — панель уведомлений
  static const glassMenu = Color(0xD10C0B0A);   // 82 % — меню статуса
  static const glassToast = Color(0xDB0C0B0A);  // 86 % — тост в панели
  static const glassPill = Color(0xE0100E0D);   // 88 % — мини-плеер, пилюли
  static const glassDock = Color(0xF00B0A09);   // 94 % — док мини-плеера
  static const scrim = Color(0xB8060505);       // 72 % — затемнение лайтбокса
}

/// Радиусы блюра. Блюр дорогой — площадь ограничена этими местами.
class VellinBlur {
  VellinBlur._();
  /// Панели, меню, тосты, стеклянные кнопки поверх скролла.
  static const panel = 9.0;
  /// Мини-плеер и тулбар лайтбокса.
  static const pill = 10.0;
  /// Подложка лайтбокса — единственный блюр на весь экран.
  static const overlay = 11.0;
  /// Подложка профиля: считать один раз на статичной картинке, не в кадре.
  static const backdrop = 30.0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Геометрия
// ─────────────────────────────────────────────────────────────────────────────
class VellinRadius {
  VellinRadius._();
  static const pill = 999.0;
  static const card = 16.0;     // карточки настроек, панель уведомлений
  static const raised = 14.0;   // карточка «я», меню статуса, тулбар лайтбокса
  static const control = 13.0;  // кнопка рейла, баббл (кроме верхнего левого угла)
  static const row = 12.0;      // строки списков, поле ввода, тост
  static const field = 11.0;    // поля формы, кнопка настроек
  static const button = 10.0;   // мелкие кнопки, поиск в шапке панели
  static const mini = 9.0;      // мини-кнопки 30×30
  static const chip = 8.0;      // чипы, квадрат иконки «назад»
  static const check = 7.0;     // чекбокс в поиске фильмов

  /// Баббл сообщения: острый верхний левый угол — «хвост» к аватару.
  static const bubble = BorderRadius.only(
    topLeft: Radius.circular(4),
    topRight: Radius.circular(13),
    bottomLeft: Radius.circular(13),
    bottomRight: Radius.circular(13),
  );
}

class VellinLayout {
  VellinLayout._();
  static const windowBase = Size(1180, 760);
  static const windowMin = Size(940, 640);

  /// Ниже этой ширины рейл уходит в узкий режим, левая панель сжимается до 300.
  static const breakpoint = 1040.0;

  static const titleBarHeight = 36.0;
  static const titleCell = Size(46, 36);
  static const railWidth = 68.0;
  static const railButton = 44.0;
  static const panelWidth = 344.0;
  static const panelWidthNarrow = 300.0;
  static const settingsSidebar = 232.0;
  static const chatHeader = 60.0;
  static const settingsHeader = 56.0;
  static const paneMaxWidth = 660.0;
  static const notifPanel = Size(380, 460);
  static const composerMinHeight = 46.0;
  static const fieldHeight = 42.0;
  static const searchHeight = 36.0;

  /// Отступы: 8 между строками списка, 12 внутри строки, 14 между карточками,
  /// 16/18 по краям панели, 24/36 по краям контента и профиля.
  static const gapRow = 8.0;
  static const gapInner = 12.0;
  static const gapCard = 14.0;
  static const padPanel = 16.0;
  static const padContent = 24.0;
  static const padProfile = 36.0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Типографика — Manrope, один шрифт на весь клиент
// ─────────────────────────────────────────────────────────────────────────────
class VellinType {
  VellinType._();
  static const family = 'Manrope';

  /// Табличные цифры. Ставить везде, где число меняется на месте.
  static const tabular = [FontFeature.tabularFigures()];

  static TextStyle _s(double size, FontWeight w, Color c,
          {double? height, double? spacing, bool nums = false}) =>
      TextStyle(
        fontFamily: family,
        fontSize: size,
        fontWeight: w,
        color: c,
        height: height,
        letterSpacing: spacing,
        fontFeatures: nums ? tabular : null,
      );

  /// Имя в профиле. Крупно и тонко — единственное место такого кегля.
  static final displayName = _s(38, FontWeight.w200, VellinColors.ink94, height: 1.05, spacing: .19);

  /// Цифры в полосе статистики профиля.
  static final statNumber = _s(26, FontWeight.w200, VellinColors.ink92, height: 1, nums: true);

  /// Заголовок настроечной панели и шапки левой панели.
  static final paneTitle = _s(17, FontWeight.w500, VellinColors.ink92);

  /// Имя в шапке чата.
  static final chatName = _s(14.5, FontWeight.w500, VellinColors.ink92);

  /// Заголовок карточки, шапка панели уведомлений (600).
  static final cardTitle = _s(15, FontWeight.w500, VellinColors.ink92);

  /// Текст сообщения и базовый кегль форм.
  static final body = _s(13.5, FontWeight.w400, VellinColors.ink88, height: 1.55);

  /// Строка списка: имя диалога, пункт настроек.
  static final rowTitle = _s(13.5, FontWeight.w500, VellinColors.ink92);
  static final rowTitleUnread = _s(13.5, FontWeight.w600, VellinColors.ink92);

  /// Превью последней реплики, подпись под именем.
  static final rowSub = _s(12, FontWeight.w400, VellinColors.ink34);

  /// Подписи, счётчики, служебное.
  static final caption = _s(11.5, FontWeight.w400, VellinColors.ink32);

  /// Автор реплики над бабблом.
  static final author = _s(11.5, FontWeight.w500, VellinColors.ink62);

  /// Время сообщения.
  static final time = _s(10.5, FontWeight.w400, VellinColors.ink28, nums: true);

  /// Заголовок секции: прописные, разрядка 14 % (10.5 × .14 = 1.47).
  static final sectionLabel = _s(10.5, FontWeight.w400, VellinColors.ink34, spacing: 1.47);

  /// Заголовок группы в списке: разрядка 13 %.
  static final groupLabel = _s(10.5, FontWeight.w400, VellinColors.ink34, spacing: 1.365);

  /// Подпись поля формы: прописные, разрядка 9 %.
  static final fieldLabel = _s(10.5, FontWeight.w400, VellinColors.ink42, spacing: .945);

  /// Текст на золоте — кнопки, бейджи.
  static final onAccent = _s(13.5, FontWeight.w600, VellinColors.onAccent);
  static final badge = _s(10.5, FontWeight.w700, VellinColors.onAccent, nums: true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Движение
// ─────────────────────────────────────────────────────────────────────────────
class VellinMotion {
  VellinMotion._();

  /// Единственная кривая клиента. Та же, что в звонке.
  static const standard = Cubic(0.16, 1.0, 0.30, 1.0);

  /// Разгонная — только для уходов лайтбокса и мини-плеера: на standard
  /// всё гасло за первые 100 мс и читалось как рывок.
  static const exit = Cubic(0.4, 0.0, 0.7, 1.0);

  /// Дыхание и пульс — с разворотом.
  static const breathe = Curves.easeInOut;

  static const micro = Duration(milliseconds: 180);   // строки меню, мелкие уходы
  static const quick = Duration(milliseconds: 220);   // уход раздела и диалога
  static const short = Duration(milliseconds: 300);   // уход панели, фрейма
  static const hover = Duration(milliseconds: 400);   // наведение, иконки, приход
  static const state = Duration(milliseconds: 500);   // кнопки, смена состояний
  static const layout = Duration(milliseconds: 600);  // панели и раскладка

  /// Циклы.
  static const typingDots = Duration(milliseconds: 1200);
  static const voiceBars = Duration(milliseconds: 900);
  static const playerPulse = Duration(milliseconds: 2400);
  static const introBreath = Duration(milliseconds: 3600);

  /// Лесенка появления строк в меню (уход — 30 мс в обратном порядке).
  static const stagger = Duration(milliseconds: 45);
}

// ─────────────────────────────────────────────────────────────────────────────
// Тени
// ─────────────────────────────────────────────────────────────────────────────
class VellinShadow {
  VellinShadow._();

  /// Под золотой кнопкой — не тень, а отсвет.
  static const accentButton = [
    BoxShadow(color: Color(0xE6D6AE6E), blurRadius: 26, offset: Offset(0, 10), spreadRadius: -14),
  ];

  /// Ореол вокруг кольца фокуса: `0 0 0 2 rgba(226,201,155,.14)`.
  static const focus = [
    BoxShadow(color: Color(0x24E2C99B), blurRadius: 0, spreadRadius: 2),
  ];

  /// Всплывающие панели и меню.
  static const menu = [BoxShadow(color: Color(0x99000000), blurRadius: 28, offset: Offset(0, 12))];

  /// Мини-плеер и тост.
  static const pill = [BoxShadow(color: Color(0x80000000), blurRadius: 26, offset: Offset(0, 10))];

  /// Окно целиком в макете-презентации.
  static const window = [BoxShadow(color: Color(0xFF000000), blurRadius: 100, offset: Offset(0, 40), spreadRadius: -40)];
}

/// Аватар: рецепт из call_bits.dart → CallAvatar, плюс точка присутствия,
/// которой в звонке нет, но которая нужна спискам.
class VellinAvatarSpec {
  VellinAvatarSpec._();
  static const gradientBegin = Color(0x1CFFFFFF); // белый 11 %
  static const gradientEnd = Color(0x05FFFFFF);   // белый 2 %
  static const border = VellinColors.line09;
  /// Кегль инициала = размер × 0.297, вес 300, разрядка 4 % от кегля.
  static double initialSize(double size) => size * 0.297;
  /// Точка присутствия = размер × 0.24, минимум 8; обводка 2 цветом фона под аватаром.
  static double dotSize(double size) => size * 0.24 < 8 ? 8 : size * 0.24;
}
