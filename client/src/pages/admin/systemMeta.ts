/**
 * Человеческий слой над техническими данными мониторинга: понятные названия
 * API-маршрутов, расшифровки метрик производительности и статусов фоновых задач.
 */

// ── Маршруты ─────────────────────────────────────────────────────────────────
const ROUTE_RULES: [RegExp, string][] = [
  [/^admin\/system\/perf/, 'Метрики производительности'],
  [/^admin\/system\/health/, 'Проверка состояния сервиса'],
  [/^admin\/system\/ws/, 'Статистика WebSocket'],
  [/^admin\/system\/jobs/, 'Фоновые задачи'],
  [/^admin\/me/, 'Права администратора'],
  [/^admin\/stats/, 'Сводная статистика'],
  [/^admin\/users\/[^/]+\/full/, 'Профиль-360 пользователя'],
  [/^admin\/users\/[^/]+\/block/, 'Блокировка пользователя'],
  [/^admin\/users\/[^/]+\/unblock/, 'Разблокировка пользователя'],
  [/^admin\/users\/[^/]+\/shared-time/, 'Совместное время пользователя'],
  [/^admin\/users\/[^/]+\/favorites/, 'Избранное пользователя'],
  [/^admin\/users\/[^/]+\/profile/, 'Редактирование профиля'],
  [/^admin\/users\/[^/]+/, 'Профиль пользователя'],
  [/^admin\/users/, 'Список пользователей'],
  [/^admin\/rooms\/[^/]+\/members/, 'Участники комнаты'],
  [/^admin\/rooms\/[^/]+/, 'Комната (админ)'],
  [/^admin\/rooms/, 'Список комнат'],
  [/^admin\/audit/, 'Журнал аудита'],
  [/^admin\/reports/, 'Жалобы'],
  [/^admin\/platform\/settings/, 'Настройки платформы'],
  [/^admin\/platform\/flags/, 'Feature-флаги'],
  [/^admin\/platform\/announcements/, 'Объявления'],
  [/^admin\/(analytics|insights)/, 'Аналитика'],
  [/^admin\/push/, 'Push (управление)'],
  [/^admin\/dm/, 'Модерация личных сообщений'],
  [/^admin\/media/, 'Медиа-кэш'],
  [/^admin\/roles/, 'Роли и доступ'],
  [/^admin\/geo/, 'География'],
  [/^push\/vapid-key/, 'Ключ уведомлений (VAPID)'],
  [/^push\/preferences/, 'Настройки уведомлений'],
  [/^push\/subscribe/, 'Подписка на уведомления'],
  [/^push\/devices/, 'Push-устройства'],
  [/^push\/test/, 'Тест уведомления'],
  [/^auth\/login/, 'Вход'],
  [/^auth\/register/, 'Регистрация'],
  [/^auth\/guest/, 'Гостевой вход'],
  [/^auth\/me/, 'Текущий пользователь'],
  [/^auth\/realtime-ticket/, 'Realtime-подключение'],
  [/^auth\/sessions/, 'Сессии устройств'],
  [/^runtime/, 'Конфигурация приложения'],
  [/^rooms\/join/, 'Вход в комнату'],
  [/^rooms\/resolve/, 'Разбор ссылки на видео'],
  [/^rooms\/[^/]+/, 'Комната'],
  [/^rooms/, 'Комнаты'],
  [/^friends/, 'Друзья'],
  [/^notifications/, 'Уведомления (колокольчик)'],
  [/^users\/search/, 'Поиск людей'],
  [/^users\/[^/]+/, 'Публичный профиль'],
  [/^dm/, 'Личные сообщения'],
  [/^titles\/search/, 'Поиск фильмов'],
  [/^titles\/favorites/, 'Избранные фильмы'],
  [/^geo/, 'География'],
  [/^uploads/, 'Файлы и медиа'],
  [/^health/, 'Проверка доступности'],
];

export interface RouteInfo {
  method: string | null;
  path: string;
  label: string;
}

/** Человеческое название маршрута. Принимает как «/api/...», так и «GET /api/...». */
export function describeRoute(raw: string): RouteInfo {
  const trimmed = raw.trim();
  const parts = trimmed.split(/\s+/);
  let method: string | null = null;
  let path = trimmed;
  if (parts.length === 2 && /^[A-Z]+$/.test(parts[0])) {
    method = parts[0];
    path = parts[1];
  }
  const norm = path.replace(/^\/?api\//, '').replace(/^\//, '').replace(/\?.*$/, '');
  for (const [re, label] of ROUTE_RULES) {
    if (re.test(norm)) return { method, path, label };
  }
  // Фолбэк: читаемо из сегментов, чтобы новые маршруты не выглядели «голым» кодом.
  const seg = norm.split('/').filter(Boolean);
  return { method, path, label: seg.length ? seg.slice(0, 2).join(' · ') : path };
}

// ── Метрики производительности ───────────────────────────────────────────────
export const PERF_HINTS = {
  cpu: 'Загрузка процессора сервера',
  rss: 'Вся оперативная память, занятая сервером',
  heap: 'Память под объекты JavaScript (куча)',
  uptime: 'Сколько сервер работает без перезапуска',
  rps: 'Запросов в секунду прямо сейчас',
  errors: 'Доля запросов, завершившихся ошибкой',
  avg: 'Среднее время ответа сервера',
  p95: '95% запросов быстрее этого времени',
} as const;

// ── Статусы фоновых задач ────────────────────────────────────────────────────
type ChipTone = 'neutral' | 'accent' | 'success';

export const JOB_STATUS: Record<string, { label: string; tone: ChipTone }> = {
  sent: { label: 'отправлено', tone: 'success' },
  done: { label: 'готово', tone: 'success' },
  ready: { label: 'готово', tone: 'success' },
  pending: { label: 'в очереди', tone: 'neutral' },
  queued: { label: 'в очереди', tone: 'neutral' },
  processing: { label: 'в работе', tone: 'neutral' },
  retry: { label: 'повтор', tone: 'neutral' },
  failed: { label: 'ошибка', tone: 'accent' },
  dead: { label: 'не доставлено', tone: 'accent' },
};

export function jobStatus(status: string): { label: string; tone: ChipTone } {
  return JOB_STATUS[status] ?? { label: status, tone: 'neutral' };
}
