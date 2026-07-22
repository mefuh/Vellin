# Vellin WinApp

Десктоп-клиент Vellin для Windows на **Tauri 2 + React + TypeScript**. Живёт
воркспейсом в монорепо и переиспользует общие типы `@vellin/shared`, дизайн-
токены и примитивы веб-клиента.

На текущем этапе реализованы **авторизация/регистрация** (только
зарегистрированные пользователи — гостевого входа в клиентах нет) и **профиль**
(личные данные, аватар, смена email/пароля). Комнат пока нет.

## Архитектура

- `src/runtime/` — различия сред: определение Tauri, версия/платформа клиента
  (заголовки `X-App-Platform: windows` / `X-App-Version`), безопасное хранилище
  сессии, резолвинг адресов бэкенда и media-URL.
- `src/api/` — HTTP-клиент. Нативно запросы идут через Tauri HTTP-плагин (минуя
  CORS WebView); в браузер-dev — обычный `fetch` + Vite-прокси. Ответ `426` →
  экран принудительного обновления.
- `src/stores/authStore.ts` — сессия (Zustand), только зарегистрированные.
- `src/pages/` — `Login`, `Register`, `Profile`, каркас `AuthShell`.
- `src-tauri/` — нативная оболочка (Rust): плагины `os`, `store`, `http`.

Хранилище токена: сейчас плагин `store` (JSON в приватном каталоге приложения).
**Hardening на следующий шаг** — переезд на ОС-хранилище секретов (Windows
Credential Manager). Точка изоляции — `src/runtime/secureStore.ts`.

## Разработка UI в браузере (Rust не нужен)

Быстрый цикл разработки интерфейса — обычный Vite против локального бэкенда:

```bash
# из корня монорепо (нужен запущенный сервер :3001 и Postgres)
npm run dev:server
npm run dev:winapp        # Vite на http://127.0.0.1:1420, прокси /api → :3001
```

Токен в этом режиме хранится в `localStorage` (fallback), запросы идут через
Vite-прокси. Полноценная нативная оболочка (ОС-хранилище, HTTP без CORS) —
только под Tauri (см. ниже).

## Нативная сборка (Tauri) — требуется тулчейн

Для `tauri dev` / `tauri build` нужен **Rust** и **MSVC C++ build tools**
(на этой машине пока не установлены):

```powershell
# 1. Rust (per-user, без прав администратора)
winget install Rustlang.Rustup

# 2. MSVC C++ build tools (нужен линковщик MSVC; несколько ГБ, требует UAC)
winget install --id Microsoft.VisualStudio.2022.BuildTools ^
  --override "--quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"

# 3. WebView2 Runtime — уже присутствует на Windows 11
```

После установки:

```bash
npm run dev:winapp -- --help          # sanity
npm run winapp:tauri dev              # запустить нативное окно
npm run winapp:tauri build            # собрать установщик (NSIS)
npm run tauri:icon -w @vellin/winapp  # перегенерировать иконки из src-tauri/icons/source.png
```

Иконки в `src-tauri/icons/` сейчас плейсхолдеры (сплошной брендовый квадрат) —
заменить реальным логотипом через `tauri icon`.

## Продакшн (заложено на будущее)

- **Автообновление** — Tauri Updater (подписанные апдейты); версия сверяется с
  `/api/config.minVersions.windows`, устаревший клиент ловит `426`.
- **Подпись** — Authenticode для установщика.
- **Телеметрия/краши** — Sentry.
- **CI/CD** — GitHub Actions (матрица + подпись).
