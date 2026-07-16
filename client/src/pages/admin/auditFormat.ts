import { ADMIN_PERMISSION_LABELS, type AdminPermission, type AuditLogEntryDTO } from '@vellin/shared';

/**
 * Гуманизация записей журнала аудита: превращает технические action + before/after
 * в понятные фразы и список изменений «поле: было → стало». Каждое известное
 * действие имеет свой формат; неизвестные (в т.ч. будущие) деградируют в
 * читаемый дефолт. Одно место правды для отображения журнала.
 */

export type AuditSeverity = 'neutral' | 'warn' | 'danger';

export interface AuditChange {
  label: string;
  from?: string;
  to?: string;
  /** Одиночное значение (без «было») — для патчей/добавлений. */
  value?: string;
}

export interface AuditDescription {
  /** Человеческий заголовок действия. */
  title: string;
  /** Список конкретных изменений. */
  changes: AuditChange[];
  /** Дополнительные пояснения (причина, итог и т.п.). */
  notes: string[];
  severity: AuditSeverity;
}

// ── Утилиты ──────────────────────────────────────────────────────────────────
const onOff = (v: unknown): string => (v ? 'включено' : 'выключено');
const yesNo = (v: unknown): string => (v ? 'да' : 'нет');
const asStr = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'да' : 'нет';
  return String(v);
};
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Дифф двух плоских объектов по заданной карте меток и форматтеру значений. */
function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  labels: Record<string, string>,
  fmt: (v: unknown) => string = asStr,
): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const key of Object.keys(labels)) {
    const b = before[key];
    const a = after[key];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changes.push({ label: labels[key], from: fmt(b), to: fmt(a) });
    }
  }
  return changes;
}

// ── Карты меток ──────────────────────────────────────────────────────────────
const TOGGLE_LABELS: Record<string, string> = {
  registration: 'Регистрация',
  guests: 'Гостевой вход',
  roomCreation: 'Создание комнат',
  uploads: 'Загрузка файлов',
};
const LIMIT_LABELS: Record<string, string> = {
  maxRoomParticipants: 'Макс. участников комнаты',
  avatarMaxMb: 'Аватар, МБ',
  dmImageMaxMb: 'Изображение ЛС, МБ',
  dmVoiceMaxMb: 'Голосовое ЛС, МБ',
  dmVideoMaxMb: 'Видео ЛС, МБ',
};
const ROOM_LABELS: Record<string, string> = {
  name: 'Название',
  slug: 'Slug',
  isPrivate: 'Приватная',
  allowGuests: 'Гости разрешены',
  hostOnlyControl: 'Только владелец управляет',
  maxParticipants: 'Макс. участников',
};
const TEMPLATE_LABELS: Record<string, string> = {
  title: 'Заголовок', body: 'Текст', url: 'URL открытия', icon: 'Иконка', badge: 'Badge',
  ttl: 'TTL, сек', urgency: 'Срочность', tag: 'Tag', requireInteraction: 'Require Interaction',
  silent: 'Silent', enabled: 'Включён', sound: 'Звук', image: 'Картинка',
};
const REPORT_REASON: Record<string, string> = {
  spam: 'спам', harassment: 'оскорбления', nsfw: 'непристойный контент', illegal: 'противозаконное', other: 'другое',
};

function permList(v: unknown): string[] {
  return arr(v).map((p) => ADMIN_PERMISSION_LABELS[p as AdminPermission] ?? String(p));
}

const PROFILE_LABELS: Record<string, string> = {
  email: 'Email', city: 'Город', gender: 'Пол', birthDate: 'Дата рождения',
};
const GENDER_RU: Record<string, string> = { male: 'муж.', female: 'жен.', other: 'другой' };
function profileVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  const s = String(v);
  return GENDER_RU[s] ?? s;
}
/** Человеческая длительность из секунд (без знака). */
function fmtDurAbs(sec: number): string {
  const s = Math.abs(Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  if (h > 0) return `${h} ч ${m} м`;
  if (m > 0) return `${m} м ${r ? `${r} с` : ''}`.trim();
  return `${r} с`;
}

// ── Основной гуманизатор ─────────────────────────────────────────────────────
export function describeAudit(e: AuditLogEntryDTO): AuditDescription {
  const meta = rec(e.meta);
  const before = rec(e.before);
  const after = rec(e.after);
  const label = e.targetLabel ?? e.targetId ?? '';
  const D = (title: string, changes: AuditChange[] = [], notes: string[] = [], severity: AuditSeverity = 'neutral'): AuditDescription =>
    ({ title, changes, notes, severity });

  switch (e.action) {
    // ── Пользователи ──
    case 'user.block':
      return D(`Блокировка пользователя ${label}`, [], [meta.reason ? `Причина: ${meta.reason}` : 'Без указания причины'], 'danger');
    case 'user.unblock':
      return D(`Разблокировка пользователя ${label}`);
    case 'user.delete':
      return D(`Удаление пользователя ${label}`, [], [], 'danger');
    case 'user.reset_avatar':
      return D(`Сброс аватара пользователя ${label}`);
    case 'user.reset_bio':
      return D(`Очистка «О себе» пользователя ${label}`);
    case 'user.reset_favorites':
      return D(`Очистка избранных фильмов пользователя ${label}`, [], meta.count != null ? [`Удалено фильмов: ${meta.count}`] : []);
    case 'user.edit_profile':
      return D(`Редактирование профиля ${label}`, diffFields(before, after, PROFILE_LABELS, profileVal));
    case 'user.favorite_remove':
      return D(`Удаление фильма из избранного ${label}`, [], meta.kpId != null ? [`Кинопоиск ID: ${asStr(meta.kpId)}`] : []);
    case 'user.favorites_reorder':
      return D(`Изменение порядка избранного ${label}`);
    case 'user.shared_time_adjust': {
      const delta = Number(meta.deltaSeconds) || 0;
      const verb = delta >= 0 ? 'Начисление' : 'Списание';
      return D(
        `${verb} совместного времени: ${label} ↔ ${asStr(meta.peerName)}`,
        [{ label: delta >= 0 ? 'Начислено' : 'Списано', value: fmtDurAbs(delta) }],
        meta.totalSeconds != null ? [`Итог по паре: ${fmtDurAbs(Number(meta.totalSeconds))}`] : [],
        'warn',
      );
    }
    case 'user.shared_time_reset':
      return D(`Аннулирование совместного времени: ${label} ↔ ${asStr(meta.peerName)}`, [], [], 'warn');
    case 'user.push_disable':
      return D(`Отключение push пользователю ${label}`);
    case 'user.session_revoke':
      return D(`Завершение сессии пользователя ${label}`);
    case 'user.sessions_revoke_all':
      return D(`Завершение всех сессий пользователя ${label}`, [], meta.count != null ? [`Завершено сессий: ${meta.count}`] : []);

    // ── Комнаты ──
    case 'room.update':
      return D(`Изменение комнаты ${label}`, diffFields(before, after, ROOM_LABELS), [], 'neutral');
    case 'room.delete':
      return D(`Удаление комнаты ${label}`, [], [], 'danger');
    case 'room.close':
      return D(`Закрытие комнаты ${label}`, [], meta.kicked != null ? [`Отключено участников: ${meta.kicked}`] : [], 'warn');
    case 'room.call_end':
      return D(`Завершение звонка в комнате ${label}`, [], meta.ended != null ? [`Отключено из звонка: ${meta.ended}`] : [], 'warn');
    case 'room.member_role':
      return D(
        `Смена роли участника ${asStr(meta.targetName)} в комнате ${label}`,
        [{ label: 'Роль', value: meta.role === 'admin' ? 'админ' : 'участник' }],
        [], 'warn',
      );
    case 'room.member_remove':
      return D(`Удаление участника ${asStr(meta.targetName)} из комнаты ${label}`, [], [], 'warn');
    case 'room.access_ticket':
      return D(
        meta.mode === 'shadow' ? `Скрытый вход в комнату ${label}` : `Вход администратором в комнату ${label}`,
        [], [meta.mode === 'shadow' ? 'Режим наблюдения (невидимо для участников)' : 'Обычный режим'],
      );

    // ── Рассылки / push ──
    case 'broadcast.send':
      return D('Системное сообщение во все комнаты', [], [
        meta.roomsDelivered != null ? `Доставлено в комнат: ${meta.roomsDelivered}` : '',
        meta.body ? `Текст: «${meta.body}»` : '',
      ].filter(Boolean) as string[]);
    case 'push.template_update':
      return D(`Изменение push-шаблона «${label}»`, Object.keys(meta).map((k) => ({ label: TEMPLATE_LABELS[k] ?? k, value: asStr(meta[k]) })));
    case 'push.broadcast':
      return D(`Push-рассылка «${label}»`, [], [
        meta.type ? `Тип: ${asStr(meta.type)}` : '',
        audienceNote(meta.audience),
        meta.totalTargets != null ? `Получателей: ${meta.totalTargets}` : '',
      ].filter(Boolean) as string[]);

    // ── Роли и доступ ──
    case 'role.create':
      return D(`Создана роль «${asStr(after.name) !== '—' ? after.name : label}»`, permList(after.permissions).map((p) => ({ label: 'Право', value: p })));
    case 'role.update': {
      const changes: AuditChange[] = [];
      if (before.name !== after.name && (before.name || after.name)) changes.push({ label: 'Название', from: asStr(before.name), to: asStr(after.name) });
      const bp = new Set(permList(before.permissions));
      const ap = new Set(permList(after.permissions));
      for (const p of ap) if (!bp.has(p)) changes.push({ label: 'Добавлено право', value: p });
      for (const p of bp) if (!ap.has(p)) changes.push({ label: 'Убрано право', value: p });
      return D(`Изменение роли «${label}»`, changes);
    }
    case 'role.delete':
      return D(`Удаление роли «${label}»`, [], [], 'danger');
    case 'staff.assign_role': {
      const from = asStr(before.role);
      const to = asStr(after.role);
      const title = to === '—' ? `Снятие роли у ${label}` : `Назначение роли пользователю ${label}`;
      return D(title, [{ label: 'Роль', from, to }], [], 'warn');
    }

    // ── Модерация ──
    case 'dm.view':
      return D(`Просмотр личной переписки: ${label}`, [], ['Чувствительный доступ к личным сообщениям'], 'warn');
    case 'report.resolve': {
      const accepted = meta.decision === 'accept';
      const notes: string[] = [];
      if (meta.block) notes.push('Нарушитель заблокирован');
      if (meta.warn) notes.push('Отправлено предупреждение');
      return D(
        accepted ? `Жалоба принята — ${label}` : `Жалоба отклонена — ${label}`,
        [], notes, accepted ? 'warn' : 'neutral',
      );
    }

    // ── Платформа ──
    case 'platform.update': {
      const changes = [
        ...diffFields(rec(before.toggles), rec(after.toggles), TOGGLE_LABELS, onOff),
        ...maintenanceDiff(rec(before.maintenance), rec(after.maintenance)),
        ...diffFields(rec(before.limits), rec(after.limits), LIMIT_LABELS),
      ];
      return D('Изменение настроек платформы', changes, changes.length === 0 ? ['Сохранено без изменений'] : []);
    }
    case 'flag.update':
      if (meta.deleted) return D(`Удаление feature-флага «${label}»`, [], [], 'warn');
      return D(`Feature-флаг «${label}»: ${onOff(after.enabled)}`);
    case 'announcement.update':
      if (meta.deleted) return D(`Удаление объявления «${label}»`, [], [], 'warn');
      return D(`Объявление «${label}»`, [], [
        after.active != null ? (after.active ? 'Активно' : 'Черновик') : '',
        after.kind ? `Тип: ${asStr(after.kind)}` : '',
      ].filter(Boolean) as string[]);

    // ── Медиа / задачи ──
    case 'media.purge':
      if (meta.single) return D(`Удаление записи медиа-кэша`, [], [label ? `Ссылка: ${label}` : ''].filter(Boolean) as string[]);
      return D('Очистка всего медиа-кэша', [], meta.count != null ? [`Удалено записей: ${meta.count}`] : [], 'warn');
    case 'jobs.retry':
      return D(`Повтор фоновой задачи (${label})`);
    case 'jobs.cancel':
      return D(`Отмена фоновой задачи (${label})`, [], [], 'warn');
    case 'jobs.purge':
      return D('Очистка завершённых задач', [], meta.count != null ? [`Удалено задач: ${meta.count}`] : []);

    default:
      return defaultDescription(e);
  }
}

function maintenanceDiff(before: Record<string, unknown>, after: Record<string, unknown>): AuditChange[] {
  const changes: AuditChange[] = [];
  if (before.enabled !== after.enabled) changes.push({ label: 'Режим обслуживания', from: onOff(before.enabled), to: onOff(after.enabled) });
  if ((before.message ?? '') !== (after.message ?? '')) changes.push({ label: 'Сообщение обслуживания', from: asStr(before.message), to: asStr(after.message) });
  return changes;
}

function audienceNote(a: unknown): string {
  const aud = rec(a);
  if (aud.kind === 'all') return 'Аудитория: все';
  if (aud.kind === 'role') return `Аудитория: роль ${asStr(aud.role)}`;
  if (aud.kind === 'users') return `Аудитория: ${arr(aud.userIds).length} пользователей`;
  return '';
}

/**
 * Дефолт для неизвестных/будущих действий: превращает `домен.действие` в
 * читаемую фразу и добавляет объект. Так новые действия сразу выглядят прилично,
 * даже до добавления специального формата.
 */
function defaultDescription(e: AuditLogEntryDTO): AuditDescription {
  const [domain, verb] = e.action.split('.');
  const VERB: Record<string, string> = {
    create: 'создание', update: 'изменение', delete: 'удаление', view: 'просмотр',
    block: 'блокировка', unblock: 'разблокировка', resolve: 'решение', send: 'отправка',
    retry: 'повтор', cancel: 'отмена', purge: 'очистка', assign_role: 'назначение роли',
  };
  const DOMAIN: Record<string, string> = {
    user: 'пользователь', room: 'комната', role: 'роль', flag: 'флаг', config: 'настройки',
    announcement: 'объявление', media: 'медиа', job: 'задача', report: 'жалоба',
    conversation: 'переписка', broadcast: 'рассылка', staff: 'сотрудник',
  };
  const v = VERB[verb] ?? verb ?? '';
  const d = DOMAIN[domain] ?? domain ?? e.targetType;
  const parts = [v, d].filter(Boolean);
  const phrase = parts.length ? parts.join(' · ') : e.action;
  const title = e.targetLabel ? `${cap(phrase)}: ${e.targetLabel}` : cap(phrase);
  return { title, changes: [], notes: [], severity: 'neutral' };
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
