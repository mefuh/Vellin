# Vellin

Платформа для совместного просмотра видео в реальном времени. Комнаты, чат, синхронизация плеера, реакции, гостевой режим, плейлист, права участников.

## Стек

- **Frontend**: React 18 + TypeScript + Vite + Zustand + React Router + WebSocket
- **Backend**: Node.js 20 + TypeScript + Fastify + `@fastify/websocket` + `@fastify/jwt`
- **БД**: PostgreSQL 16 + Prisma 5
- **Медиа**: hls.js (HLS), shaka-player (DASH), webtorrent (magnet/torrent), `yt-dlp` (серверный экстрактор)
- **Дизайн**: токены и компоненты перенесены из `design/` (inline styles + CSS-переменные)

## Источники видео

Сервер резолвит любую пользовательскую ссылку в реальный media-stream и кэширует результат в Postgres. Поддержано: прямые `mp4/webm`, HLS `m3u8`, DASH `mpd`, magnet/`.torrent`, плюс всё, что умеет распознавать `yt-dlp` (YouTube, RuTube, Vimeo, VK Video, ~1000 других сайтов). Воспроизведение — только через нативный `<video>`, никаких iframe-плееров.

Монорепо на npm workspaces: `shared/` (общие типы), `server/`, `client/`.

## Структура

```
Vellin/
├── design/                # исходный визуальный макет (не трогаем)
├── shared/                # workspace package @vellin/shared
├── server/                # Fastify API + WebSocket
├── client/                # Vite + React приложение
├── docker-compose.yml
├── package.json           # workspaces корень
└── tsconfig.base.json
```

## Деплой в продакшен

См. [DEPLOY.md](DEPLOY.md): пошаговая инструкция для Ubuntu VPS с Caddy + Let's Encrypt (домен, SSH-хардеринг, Docker, env, миграции, бэкапы).

## Быстрый старт через Docker

```bash
cp .env.example .env
docker compose up --build
```

После запуска:
- Frontend: http://localhost:8080
- Backend: http://localhost:3001
- Postgres: localhost:5432 (vellin/vellin)

## Локальная разработка (без Docker)

Требования: Node.js 20+, PostgreSQL 16 (или Docker для одного только Postgres), `yt-dlp` в `$PATH`.

`yt-dlp` нужен серверу, чтобы вытаскивать стримы из YouTube/RuTube/Vimeo/VK и десятков других сайтов. Без него будут работать только прямые ссылки на `mp4/webm/m3u8/mpd` и magnet'ы. Установка:

- Windows: `winget install yt-dlp.yt-dlp`
- macOS: `brew install yt-dlp`
- Linux: `pip install yt-dlp` или системный пакет

```bash
# 1. Postgres (можно поднять отдельно через docker compose up postgres)
docker compose up -d postgres

# 2. Установить зависимости (корень — npm workspaces)
npm install

# 3. Серверный .env
cp server/.env.example server/.env
# отредактируйте JWT_SECRET (минимум 32 символа)

# 4. Применить миграции и сгенерировать Prisma client
npm run db:migrate

# 5. Запустить dev (shared + server + client параллельно)
npm run dev
```

Откройте http://localhost:5173.

## REST API (префикс `/api`)

| Метод | Путь | Описание | Auth |
|------|------|----------|------|
| POST | `/auth/register` | Регистрация (email, username, password ≥ 8) | — |
| POST | `/auth/login` | Логин email + password | — |
| POST | `/auth/guest` | Получить гостевой JWT (без БД) | — |
| GET | `/auth/me` | Текущий пользователь | JWT |
| POST | `/rooms` | Создать комнату | JWT (не гость) |
| GET | `/rooms` | Мои + публичные комнаты | JWT |
| GET | `/rooms/:slug` | Информация о комнате | JWT |
| POST | `/rooms/join` | Получить wsTicket (пароль/invite) | JWT |
| POST | `/rooms/:id/video` | Сменить URL видео | JWT, host |
| POST | `/rooms/resolve` | Резолвнуть медиа-URL (для re-resolve по истечении TTL) | JWT |
| POST | `/rooms/:id/invites` | Создать invite-ссылку | JWT, host |
| GET | `/rooms/:id/messages` | История чата | JWT |

## WebSocket `/ws?ticket=<wsTicket>`

Соединение требует короткоживущий wsTicket (60 сек), получаемый через `POST /rooms/join`. Это позволяет не передавать долгоживущий JWT в URL.

**Client → Server**: `hello`, `chat_message`, `video_play`, `video_pause`, `video_seek`, `video_set_url`, `reaction`, `pong`, `sync_request`.

**Server → Client**: `welcome`, `user_join`, `user_leave`, `chat_message`, `video_apply`, `video_sync`, `video_set_url`, `reaction`, `room_state_update`, `ping`, `error`.

Все типы — в `shared/src/protocol.ts`. Сервер authoritative — клиент только эмитит намерения и подчиняется `apply`/`sync`.

## Видео-синхронизация

1. Сервер хранит `RoomVideoState`: `{ positionSec, anchorServerTs, status, lastEventSeq }`.
2. Эффективная позиция при `status='playing'` = `positionSec + (now - anchorServerTs) / 1000`.
3. Любая мутация (`play`/`pause`/`seek`) обновляет anchor и инкрементит `seq`, сразу транслируется как `video_apply`.
4. Каждые 5 сек — `video_sync` (heartbeat) для drift correction.
5. Клиент держит EWMA clockOffset через ping/pong и компенсирует сетевую задержку при seek.
6. Drift correction:
   - `< 0.4с` — игнор (jitter порог);
   - `0.4–2с` — мягкая коррекция `playbackRate=0.94/1.06`;
   - `≥ 2с` — hard seek.
7. Reconnect — exponential backoff (250ms → 5s), `welcome` восстанавливает состояние.

## Безопасность

- bcrypt cost=12 для паролей пользователей и комнат
- JWT в `Authorization: Bearer`, 30-дневная сессия
- WS rate-limit — token bucket 20 msg/sec на сокет (burst 30)
- REST rate-limit — 100 req/min глобально, 5–10/min на `/auth/*`
- CORS allowlist (`CORS_ORIGIN`)
- helmet headers
- Per-room async-mutex предотвращает гонки на видео-стейте
- Гости не сохраняются в БД (ephemeral JWT)
- Сообщения чата ограничены 2000 символов, рендерятся как plain text

## Smoke-тест

1. `docker compose up --build` → дождаться `Vellin server started`.
2. Открыть http://localhost:8080 в двух браузерах (incognito для второго).
3. В первом — Регистрация, во втором — Гость.
4. Из первого создать комнату (можно с URL `https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4`).
5. Скопировать invite-ссылку → открыть во втором браузере → войти.
6. Play в первом — оба клиента стартуют синхронно (drift < 500ms).
7. Pause во втором — оба паузятся.
8. Отправить сообщение и эмодзи-реакцию — приходит мгновенно.
9. Network → Offline на 5 сек → Online — клиент авто-восстанавливается, видео догоняет.
10. `npx prisma studio` (внутри `server/`) — проверить `User`, `Room`, `Message`; в `User` гостей нет.

## Расширения, включённые в MVP

- Reconnection logic (exponential backoff + clockOffset recovery)
- Invite-ссылки (`/rooms/:id/invites`) — обходят пароль приватной комнаты
- Emoji-реакции (overlay поверх плеера)

## Скрипты

```bash
npm run dev          # все три воркспейса параллельно
npm run dev:server   # только сервер
npm run dev:client   # только клиент
npm run build        # сборка shared → server → client
npm run db:migrate   # prisma migrate dev
npm run db:studio    # prisma studio (GUI)
```

## Лицензия

Internal MVP.
