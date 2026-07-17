# Vellin Admin v2 — Архитектура центра управления платформой

Статус: проектирование → поэтапная реализация.
Версия документа: 1.0 · База: приложение v0.25.0, дизайн-код «редизайн профилей/друзей».

Этот документ — контракт на превращение админ-панели из «панели управления» в
центр мониторинга, модерации, аналитики и управления Vellin. Реализация идёт
этапами (см. §9). Каждый этап самодостаточен и оставляет продукт рабочим.

---

## 1. Принципы и ключевые решения

### 1.1 Дизайн: как примирить дизайн-код и админку
Дизайн-код декларирует «НЕ админка / НЕ форма / НЕ таблицы настроек». Админка по
природе плотная. Решение — **разделить два визуальных регистра**, оба на одном
токен-наборе (`tokens.css`: `--bg-*`, `--surface`/`--glass-*`, `--accent`, шрифты
`Onest`/`JetBrains Mono`):

- **«Витринные» экраны** (Обзор, Аналитика, профиль пользователя, System Health) —
  полностью по дизайн-коду: воздух, glow, крупные метрики (`clamp`), карточки без
  бордеров (разделяем светом/тенью), каскадные `fadeUp`-появления, pill-кнопки,
  моно-микролейблы.
- **«Рабочие» экраны** (таблицы, очереди, Audit Log, модерация) — тот же язык, но
  в **плотном под-режиме**: hairline-разделители вместо бордеров, моно-лейблы шапок,
  строки-«карточки» без рамок, sticky-заголовки, pill-фильтры. Никаких серых
  бутстрап-таблиц с рамками (текущая админка их использует — переделываем).

Единый бренд держим через: акцент только на первичном действии и LIVE-элементах,
JetBrains Mono для технических данных (IP, ID, тайминги, статусы), общий glow-фон
на витринных страницах, единые радиусы (pill-кнопки `999px`, карточки `20–28px`).

Текущие токены приложения — `--bg-0..5`, `--line-1..3`, `--text-0..3`, `--accent*`,
`--glass-*`, `--r-*`, `--font-ui|mono|display`. **Дизайн-код и tokens.css уже
согласованы по смыслу** — маппинг: `--surface-1`≈`--bg-2` поверх `--bg-0`,
`--hairline`≈`--line-1/2`, `--text`≈`--text-0`. Новый admin-слой использует токены
приложения (не вводим второй набор переменных).

### 1.2 Безопасность (сквозной инвариант)
- **Сервер — единственный источник истины по правам.** Клиентские проверки — только
  для UX (скрыть кнопку). Каждый admin-роут проходит `requirePermission(key)`.
- **Каждое мутирующее действие → запись в Audit Log** (кто/что/над чем/до/после/IP/UA).
- **Разрушительные действия** (удаление, массовые операции, просмотр ЛС) требуют
  подтверждения на клиенте И отдельного пермишена на сервере.
- **Просмотр ЛС** — привилегия за отдельным пермишеном `moderation.dm.view`, каждое
  открытие диалога логируется, раздел можно выключить глобально feature-флагом.

### 1.3 Минимизация новых сущностей
Аналитика и модерация строятся преимущественно на существующих моделях
(`User`, `Session`, `PushSubscription/Delivery/Job/Broadcast`, `SharedWatchStat`,
`DirectMessage`, `Conversation`, `Friendship`, `Block`, `FavoriteTitle`,
`ResolvedMedia`, `Room`, `Membership`, `Message`). Реально новых моделей — **7**
(§5). Историю блокировок/изменений даёт Audit Log, а не отдельные таблицы.

---

## 2. Архитектура (высокоуровнево)

### 2.1 Backend
```
server/src/admin/
  rbac/
    permissions.ts      // каталог пермишенов (single source), типобезопасные ключи
    roles.ts            // системные роли + seed, резолвинг прав пользователя
    middleware.ts       // requirePermission(key) — заменяет requireAdmin
  audit/
    audit.ts            // writeAudit(actor, action, target, before/after, req)
    routes.ts           // GET /admin/audit (фильтры, поиск, экспорт)
  analytics/
    service.ts          // агрегаты поверх существующих таблиц + DailyStat
    rollup.ts           // фоновый суточный снапшот метрик (интервал/cron)
    routes.ts           // GET /admin/analytics/*
  moderation/
    dm.ts               // диалоги/сообщения (read-only, за пермишеном + аудит)
    reports.ts          // очередь жалоб
    routes.ts
  platform/
    config.ts           // PlatformSetting (maintenance, лимиты, тумблеры)
    flags.ts            // FeatureFlag
    announcements.ts    // баннеры/модалки/новости
    routes.ts
  system/
    health.ts           // проверки БД/WS/очередей/ffmpeg/внешних API/VAPID
    ws.ts               // снапшот UserHub/roomStore (подключения, комнаты, ping)
    perf.ts             // process.memoryUsage/cpu, кольцевой буфер latency
    jobs.ts             // PushJob + очередь транскодирования: список/ретрай/отмена
    routes.ts
  routes.ts             // существующее (users/rooms/stats/broadcast) — мигрируем на RBAC
  service.ts            // существующее
```
Реестр всех admin-плагинов регистрируется в `app.ts` (каждый — отдельный контекст с
`requirePermission`-хуком, как сейчас `adminRoutes`).

**Инструментирование для метрик (лёгкое, in-process):**
- `onResponse`-хук Fastify → кольцевой буфер latency по маршрутам (perf).
- `UserHub`/`roomStore` уже держат presence и рантаймы комнат — читаем напрямую (ws).
- Перф-метрики процесса — из `process.*`, без внешних агентов.

### 2.2 Frontend
```
client/src/pages/admin/
  AdminShell.tsx            // редизайн: витринный сайдбар/навигация + gated пункты
  sections/
    Overview.tsx            // обзор (редизайн текущего дашборда)
    analytics/*             // Users/Rooms/SharedWatch/Social вкладки
    UsersList.tsx           // таблица (виртуализация, server-пагинация, debounce)
    UserProfile.tsx         // полноценный профиль-360 (§раздел 14)
    RoomsList.tsx / RoomDetail.tsx
    moderation/DmList.tsx / DmThread.tsx / Reports.tsx
    Geo.tsx
    MediaCache.tsx
    push/*                  // расширение текущего AdminPush
    system/WebSocket.tsx / Performance.tsx / Jobs.tsx / Health.tsx
    platform/Settings.tsx / Flags.tsx / Announcements.tsx
    Roles.tsx / Audit.tsx
  components/               // переиспользуемый admin-UI-кит (§4)
  api/                      // тонкие клиенты (расширяем client/src/api/admin*.ts)
  hooks/                    // usePagedQuery, useDebounced, usePermissions, useLiveStat
```

**Состояние/данные:** лёгкий query-слой (собственный `usePagedQuery`/`useResource`
на fetch + AbortController + кэш в памяти) — не тянем React Query ради консистентности
со стеком (в проекте нет data-fetch библиотеки). Debounce поиска, курсор-пагинация,
виртуализация больших списков (`react-virtual`-подобный минимальный виртуализатор или
одна зависимость `@tanstack/react-virtual`).

**Права на клиенте:** `GET /admin/me` отдаёт роль + массив пермишенов; `usePermissions()`
гейтит пункты навигации, кнопки и роуты (сервер всё равно перепроверяет).

---

## 3. Каталог пермишенов (RBAC)

Пермишены — плоские ключи `<домен>.<действие>`, единый источник в
`shared/src/admin.ts`. Роль = набор ключей (JSON-массив).

| Ключ | Что разрешает |
|---|---|
| `analytics.view` | Все аналитические разделы |
| `users.view` | Список/профиль пользователя |
| `users.moderate` | Блок/разблок, сброс аватара/bio/избранного, завершить сессии, off push |
| `users.delete` | Удаление аккаунта |
| `rooms.view` | Список/детали комнат |
| `rooms.manage` | Правка настроек, закрыть комнату, завершить звонок, access-ticket |
| `rooms.delete` | Удаление комнаты |
| `moderation.dm.view` | Просмотр ЛС (чувствительно; каждое открытие → аудит) |
| `reports.view` / `reports.handle` | Очередь жалоб / решения по ним |
| `push.view` / `push.send` / `push.templates` | Дашборд / рассылки / шаблоны |
| `media.manage` | Управление кэшем `ResolvedMedia` |
| `system.view` | WebSocket/Performance/Health |
| `jobs.manage` | Ретрай/отмена/очистка фоновых задач |
| `platform.manage` | Режим обслуживания, тумблеры, лимиты, конфиг WebRTC |
| `flags.manage` | Feature flags |
| `announcements.manage` | Объявления/баннеры |
| `roles.manage` | Роли и назначения (только Super Admin по умолчанию) |
| `audit.view` | Журнал аудита |
| `broadcast.send` | Системное сообщение во все комнаты |

**Системные роли (сидируются, редактируемы кроме Super Admin):**
- **Super Admin** — все пермишены, включая `roles.manage`. Нельзя лишить прав/удалить
  последнего. `ADMIN_EMAIL` при старте бутстрапится в эту роль.
- **Administrator** — всё, кроме `roles.manage` и (опц.) `moderation.dm.view`.
- **Moderator** — `users.view/moderate`, `rooms.view/manage`, `reports.*`,
  `moderation.dm.view` (опц.), `audit.view`.
- **Support** — `users.view`, `rooms.view`, `reports.view`, `push.view`.
- **Analyst** — `analytics.view`, `system.view` (read-only во всём).

---

## 4. Переиспользуемый admin-UI-кит (новые компоненты)

Всё инлайн-стилями по дизайн-коду, в `pages/admin/components/`:

| Компонент | Назначение |
|---|---|
| `AdminPage` | Каркас витринной страницы: hero-заголовок, glow-фон, каскад `fadeUp` |
| `StatTile` / `StatRow` | Метрика: гигантская цифра (gradient-clip), дельта, спарклайн |
| `Chart` (`Line/Area/Bar/Sparkline/Heatmap`) | Графики. Кандидат: `recharts` (одна зависимость) либо тонкий SVG-слой. По дизайн-коду — минималистичные, без сеток «в лоб» |
| `DateRangePicker` | Диапазоны: 24ч / 7д / 30д / 90д / кастом |
| `DataTable` | Плотная таблица: server-пагинация, виртуализация, sticky-шапка, закрепляемые колонки, сортировка, мультивыбор, массовые действия, экспорт CSV/XLSX |
| `FilterBar` | Pill-фильтры + debounce-поиск + активные фильтры-чипы |
| `SearchCommand` | Глобальный поиск (Cmd/Ctrl-K): юзер/комната/publicId/email/сообщение/фильм |
| `ConfirmDialog` | Подтверждение разрушительных действий (усиление текущего `ConfirmShell`) |
| `AuditBadge` | Инлайн-метка «кто/когда изменил» на объектах |
| `PermissionGate` | Условный рендер по пермишену |
| `EmptyState` | Пустые состояния в стиле дизайн-кода (не серые заглушки) |
| `CopyableId` / `IpChip` / `DeviceChip` | Моно-примитивы технических данных |
| `LiveIndicator` | LIVE-pip, пульс присутствия/подключения |
| `JsonDiff` | Показ before/after в Audit Log / истории изменений |

Экспорт CSV — на клиенте (Blob), XLSX — либо клиентская библиотека (`xlsx`), либо
сервер отдаёт готовый файл для больших выборок (стрим). Рекомендация: CSV везде,
XLSX опционально там, где просят Excel.

---

## 5. Изменения БД (Prisma) — 7 новых моделей

Минимальный набор. Историю действий/блокировок даёт `AuditLog` (не отдельные таблицы).

```prisma
/// Роль администратора. Пермишены — JSON-массив ключей из каталога (§3).
/// isSystem — предустановленная роль (Super Admin неудаляем/непонижаем).
model AdminRole {
  id             String   @id @default(cuid())
  key            String   @unique      // super_admin | administrator | moderator | support | analyst | custom-*
  name           String
  description    String?
  permissionsJson String  @default("[]")
  isSystem       Boolean  @default(false)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  users          User[]
}
// В model User добавить:
//   adminRoleId String?  + adminRole AdminRole? @relation(fields:[adminRoleId],references:[id],onDelete:SetNull)
//   @@index([adminRoleId])

/// Журнал всех административных действий. before/after — снапшоты JSON.
model AuditLog {
  id          String   @id @default(cuid())
  actorId     String?                    // null — системное действие
  actorEmail  String                     // снапшот на момент действия
  action      String                     // 'user.block' | 'room.delete' | 'dm.view' | ...
  targetType  String                     // user | room | message | conversation | role | flag | config | ...
  targetId    String?
  targetLabel String?                     // человекочитаемое (username/slug) на момент
  beforeJson  String?
  afterJson   String?
  metaJson    String   @default("{}")     // произвольный контекст (reason, mode, count)
  ip          String?
  userAgent   String?
  createdAt   DateTime @default(now())
  @@index([actorId, createdAt])
  @@index([targetType, targetId])
  @@index([action, createdAt])
  @@index([createdAt])
}

/// Жалоба пользователя. snapshotJson замораживает контент (переживает удаление).
model Report {
  id             String   @id @default(cuid())
  reporterId     String?                  // SetNull при удалении жалобщика
  targetType     String                   // message | user | room | image | video | dm
  targetId       String
  targetUserId   String?                  // владелец контента (для группировки по нарушителю)
  reason         String                   // категория
  comment        String?
  snapshotJson   String   @default("{}")  // замороженный контекст контента
  status         String   @default("open")// open | reviewing | accepted | rejected | resolved
  handledById    String?
  handledAt      DateTime?
  resolutionNote String?
  createdAt      DateTime @default(now())
  @@index([status, createdAt])
  @@index([targetUserId])
  @@index([targetType, targetId])
}

/// Feature flag. rolloutJson — {kind:'all'|'role'|'percent'|'users', ...}.
model FeatureFlag {
  key         String   @id
  enabled     Boolean  @default(false)
  description String?
  rolloutJson String   @default("{\"kind\":\"all\"}")
  updatedAt   DateTime @updatedAt
  updatedBy   String?
}

/// Конфиг платформы (key-value). Значение — JSON. Категории через префикс ключа:
/// limits.*, toggles.*, webrtc.*, heartbeat.*, maintenance.*, message.*
model PlatformSetting {
  key       String   @id
  valueJson String
  updatedAt DateTime @updatedAt
  updatedBy String?
}

/// Внутриплатформенное объявление. audienceJson — таргетинг (all|role|users|new-users).
model Announcement {
  id          String    @id @default(cuid())
  kind        String                       // banner | modal | news
  title       String
  body        String
  ctaLabel    String?
  ctaUrl      String?
  style       String    @default("info")   // info | accent | warn
  audienceJson String   @default("{\"kind\":\"all\"}")
  active      Boolean   @default(false)
  startsAt    DateTime?
  endsAt      DateTime?
  createdById String?
  createdAt   DateTime  @default(now())
  @@index([active, startsAt])
}

/// Суточный снапшот метрик — источник исторических рядов (DAU/регистрации/комнаты/
/// сообщения). Пишется фоновым rollup-джобом раз в сутки (и по требованию).
/// Одна строка на дату; json — карта метрик. Даёт time-series без тяжёлого
/// event-логирования и переживает рестарты.
model DailyStat {
  day       String   @id                   // 'YYYY-MM-DD' (UTC)
  json      String                          // {registrations, dau, wau, mau, guests, roomsCreated, messages, ...}
  createdAt DateTime @default(now())
}
```

**Замечания по данным:**
- **DAU/WAU/MAU:** «сегодняшний» онлайн — из `UserHub`/`Session.lastSeenAt`; исторические
  ряды — из `DailyStat` (накапливается с момента внедрения; задним числом недоступно).
- **Гости:** не персистятся → считаем как **live-метрику** (счётчик гостевых WS-сессий
  в `UserHub`) + суточный снапшот в `DailyStat`. Историю до внедрения не восстановить.
- **Удалённые аккаунты:** удаление идёт через админку → фиксируется в `AuditLog`
  (`user.delete`). Отдельного soft-delete не вводим (минимизация).
- **История блокировок/изменений:** полностью из `AuditLog` по `targetType='user'`.
- **Гео:** используем существующий `User.city`; страну выводим маппингом города
  (датасет городов уже есть в `geo/`). Точных координат нет — карта на уровне городов.
- **Dismiss объявлений:** храним на клиенте (localStorage) для баннеров/модалок —
  без новой таблицы. Если понадобится серверный «прочитано» для новостей — добавим
  минимальную `AnnouncementSeen` позже (вынесено из scope v2).

---

## 6. Новые/изменённые API

Все под `/api/admin/*`, каждый — `requirePermission(...)`, мутации → `writeAudit`.

**RBAC / self**
- `GET  /admin/me` → роль, пермишены, флаги доступности разделов.
- `GET/POST/PATCH/DELETE /admin/roles` → CRUD ролей (`roles.manage`).
- `GET  /admin/staff` · `POST /admin/staff/:userId/role` → назначение ролей.

**Audit**
- `GET  /admin/audit` → фильтры (actor, action, targetType, диапазон дат), поиск,
  курсор-пагинация; `?format=csv` → экспорт.

**Analytics** (`analytics.view`)
- `GET /admin/analytics/users` · `/rooms` · `/shared-watch` · `/social`
  — принимают `range` (24h|7d|30d|90d|custom) и `granularity`; отдают ряды + топы.
- `GET /admin/analytics/overview` → сводка для витринного обзора.

**Users (расширение)** (`users.*`)
- `GET  /admin/users/:id/full` → профиль-360: друзья, shared-watch, избранное,
  комнаты, последние сообщения (мета), устройства/сессии/push, история из audit.
- `GET  /admin/users/:id/sessions` · `DELETE /admin/users/:id/sessions/:sid` ·
  `DELETE /admin/users/:id/sessions` (все) — reuse `Session`.
- `POST /admin/users/:id/push/disable` — off push (reuse `NotificationPreference`).
- `POST /admin/users/:id/reset-avatar` · `/reset-bio` · `/reset-favorites`.

**Moderation — DM** (`moderation.dm.view`, каждый вызов → audit `dm.view`)
- `GET /admin/moderation/conversations` → список (фильтр по участнику, типам).
- `GET /admin/moderation/conversations/:id/messages` → сообщения (курсор),
  включая image/voice/video/invite (ссылки на уже существующую статику `/api/uploads`).

**Reports** (`reports.*`)
- Публичный/пользовательский: `POST /reports` (жалоба на message|user|room|image|video).
- Админ: `GET /admin/reports` (очередь, фильтры) · `POST /admin/reports/:id/resolve`
  (accept|reject|resolve + опц. block/warn + comment) → каскад в модерацию + audit.

**Geo** (`analytics.view`)
- `GET /admin/geo` → распределение по городам/странам, топы.

**Media cache** (`media.manage`)
- `GET /admin/media` (список `ResolvedMedia`, размеры/дата) ·
  `DELETE /admin/media/:sourceUrl` · `POST /admin/media/purge`.

**Push (расширение)** (`push.*`)
- `GET /admin/push/analytics` → тепловая карта отправок (по часам/дням), время
  доставки, CTR, платформы/браузеры/устройства, эффективность шаблонов.
  (агрегаты поверх `PushDelivery`/`PushJob`.)

**System** (`system.view` / `jobs.manage`)
- `GET /admin/system/ws` → подключения, online, комнаты, ping, event-rate, ошибки.
- `GET /admin/system/perf` → память/CPU/латентность/RPS/ошибки/долгие запросы.
- `GET /admin/system/health` → статусы БД/WS/очередей/ffmpeg/kinopoisk/VAPID.
- `GET /admin/system/jobs` (PushJob + transcode) · `POST .../:id/retry|cancel` ·
  `POST .../purge`.

**Platform** (`platform.manage` / `flags.manage` / `announcements.manage`)
- `GET/PUT /admin/platform/settings` → maintenance, тумблеры (регистрация/гости/
  создание комнат/загрузки), лимиты файлов, WebRTC, heartbeat, глобальное сообщение.
- `GET/POST/PATCH/DELETE /admin/platform/flags`.
- `GET/POST/PATCH/DELETE /admin/platform/announcements`.

**Public runtime-контракт для тумблеров/флагов/объявлений**
- `GET /api/runtime` (публичный, кэшируемый) → активные объявления для юзера,
  включённые флаги, режим обслуживания. Клиент читает при загрузке и по WS-инвалидации.
- Enforcement тумблеров — в соответствующих роутах (`/auth/register`, `/auth/guest`,
  `/rooms` create, upload-роуты) читают `PlatformSetting` (кэш в памяти + инвалидация).

---

## 7. Список новых страниц (навигация Admin v2)

Витринные (по дизайн-коду) отмечены ◆, рабочие (плотные) — ▤.

1. ◆ **Обзор** — редизайн текущего; сводные метрики + быстрые ссылки + System Health mini.
2. ◆ **Аналитика** — вкладки: Пользователи · Комнаты · Совместный просмотр · Социальное.
3. ▤ **Пользователи** — таблица (виртуализация, фильтры, массовые действия, экспорт).
4. ◆ **Профиль пользователя (360)** — активность, друзья, shared-time, фильмы, комнаты,
   последние сообщения, устройства, push, история блокировок/изменений.
5. ▤ **Комнаты** — список + детальная (редизайн текущего).
6. ▤ **Модерация ЛС** — список диалогов + просмотр треда (за пермишеном, аудит).
7. ▤ **Жалобы** — очередь репортов с действиями.
8. ◆ **География** — карта по городам/странам, топы.
9. ▤ **Media Cache** — управление `ResolvedMedia`.
10. ◆/▤ **Push** — расширение: дашборд + аналитика/тепловая карта + шаблоны + рассылки.
11. ◆ **WebSocket** — live-мониторинг подключений/комнат/ping/event-rate.
12. ◆ **Производительность** — память/CPU/латентность/ошибки.
13. ▤ **Фоновые задачи** — PushJob + транскодирование (retry/cancel/purge).
14. ▤ **Управление платформой** — maintenance, тумблеры, лимиты, WebRTC, глоб. сообщение.
15. ▤ **Feature Flags**.
16. ▤ **Объявления** — баннеры/модалки/новости с таргетингом.
17. ▤ **Роли и доступ** — роли, пермишены, назначения сотрудников.
18. ▤ **Audit Log** — журнал с фильтрами/поиском/экспортом.
19. ◆ **System Health** — сводка доступности зависимостей.
20. **Глобальный поиск (Cmd/Ctrl-K)** — оверлей, не страница.

---

## 8. Этап 0 — уже существует (переносим/редизайним)
Обзор-статистика, Пользователи (список/блок/удаление), Комнаты (CRUD/close/call-end/
access-ticket/shadow), Broadcast, Push (дашборд/шаблоны/рассылки). Всё это
**мигрируется на RBAC + Audit** и редизайнится под новый дизайн-код на своих этапах.

---

## 9. Порядок реализации по этапам

Каждый этап = отдельный релиз, продукт остаётся рабочим.

**Этап 1 — Фундамент (блокирует всё остальное)**
- БД: `AdminRole`, `AuditLog` (+ `User.adminRoleId`). Миграция + сид системных ролей +
  бутстрап `ADMIN_EMAIL`→Super Admin.
- `shared/src/admin.ts`: каталог пермишенов + DTO.
- Backend: `requirePermission()` заменяет `requireAdmin`; `writeAudit()` + оборачивание
  всех существующих мутаций; `GET /admin/me`, роуты ролей/аудита.
- Frontend: редизайн `AdminShell` под дизайн-код, `usePermissions`, `PermissionGate`,
  UI-кит-минимум (`AdminPage`, `DataTable`, `FilterBar`, `ConfirmDialog`), страницы
  **Роли** и **Audit Log**.

**Этап 2 — Модерация пользователей + Профиль-360**
- `GET /admin/users/:id/full`, сессии/устройства/push-действия, reset-*.
- Профиль-360 (витринный), редизайн списка пользователей на `DataTable`.
- Каждое действие в Audit; история блокировок из Audit.

**Этап 3 — Аналитика**
- `DailyStat` + rollup-джоб; analytics-роуты; графики (`Chart`, `DateRangePicker`);
  4 вкладки аналитики; редизайн Обзора.

**Этап 4 — Жалобы + Модерация ЛС**
- `Report`; `POST /reports` (клиент-фичи жалоб в приложении); очередь + действия;
  модерация ЛС за `moderation.dm.view` с обязательным аудитом; feature-flag выключения.

**Этап 5 — Управление платформой**
- `PlatformSetting`, `FeatureFlag`, `Announcement`; `GET /api/runtime`; enforcement
  тумблеров в роутах; страницы Платформа/Флаги/Объявления; рантайм-баннеры в приложении.

**Этап 6 — Системный мониторинг**
- WebSocket/Performance/Health/Jobs; инструментирование latency; health-checks;
  ретраи/отмена фоновых задач.

**Этап 7 — Полировка**
- Media Cache, География, расширенная Push-аналитика, глобальный Cmd/K-поиск,
  экспорт XLSX, виртуализация везде, микро-анимации по дизайн-коду, мобильный UX.

Зависимости: 1 → всё; 3 требует 1; 4 требует 1(+частично 2); 5/6/7 требуют 1.

---

## 10. Потенциальные риски

- **Приватность ЛС.** Просмотр переписки — юридически/этически чувствительно.
  Митигизация: отдельный пермишен, обязательный аудит каждого открытия, глобальный
  выключатель, отсутствие полнотекстового индекса по телу без явного включения.
- **Историческая аналитика недоступна задним числом.** DAU/гости/ретеншн копятся
  только с момента внедрения `DailyStat`/live-счётчиков. Коммуницировать явно.
- **Стоимость агрегатов на больших объёмах.** Тяжёлые аналитические запросы могут
  грузить БД. Митигизация: `DailyStat`-прекомпьют, индексы, кэш ответов, лимиты
  диапазонов, вынос тяжёлого в фоновый rollup.
- **Точность гео.** Только город из профиля (свободный ввод) → страна по маппингу,
  без координат. Карта — приблизительная, по городам.
- **Метрики процесса ≠ инфраструктурные.** `process.*` даёт только один инстанс;
  при масштабировании на несколько нод нужен агрегатор (вне scope v2).
- **RBAC-локаут.** Ошибка в правах может закрыть доступ. Митигизация: Super Admin
  неудаляем/непонижаем, бутстрап из `ADMIN_EMAIL`, «break-glass» через env.
- **Дизайн-конфликт.** Риск сделать либо «скучную админку», либо «красиво, но
  неюзабельно на данных». Митигизация: два регистра (§1.1) на одних токенах.
- **Объём работ.** ~20 страниц, ~7 моделей, ~40 роутов. Только поэтапно, с рабочими
  срезами на каждом этапе.

---

## 11. Рекомендации по дальнейшему развитию

- **AnnouncementSeen / прочтения новостей** — серверный трекинг, когда понадобится.
- **Событийный лог активности** (вместо суточного снапшота) — для точной когортной
  ретенции и воронок, если аналитика станет ключевой.
- **Уведомления модераторам** о новых жалобах (переиспользовать push-инфраструктуру).
- **Правила авто-модерации** (пороги жалоб → авто-скрытие/эскалация).
- **Мульти-роль на пользователя** (сейчас одна роль — достаточно; при росте штата —
  many-to-many).
- **Экспорт в отдельный сервис метрик** (Prometheus/Grafana) при мультинодовости.
- **2FA для админ-аккаунтов** и IP-allowlist на `/admin`.
- **Rate-limit и «cooldown» на разрушительные массовые операции.**
```
```

---

_Документ — живой контракт; уточняется по мере реализации этапов._
