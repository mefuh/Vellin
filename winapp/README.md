# Vellin WinApp

Полностью нативный десктоп-клиент Vellin для Windows на **Flutter** (Dart).
UI отрисовывается собственным движком Flutter (Impeller/Direct3D через
`flutter_windows.dll`) — **без WebView и HTML/JS-рантайма**. Один стек ведёт ко
всем целям: Windows (сейчас), затем macOS/iOS/Android.

Реализованы **авторизация/регистрация** (только зарегистрированные
пользователи — гостевого входа в клиентах нет) и **профиль** (личные данные,
аватар, смена email/пароля). Комнат пока нет.

## Архитектура (`lib/`)

- `app_config.dart` — адрес бэкенда (`--dart-define=SERVER_URL=...`, по умолчанию
  прод), версия/платформа клиента для заголовков `X-App-Platform`/`X-App-Version`.
- `models/` — Dart-модели, зеркалящие типы `@vellin/shared` (источник истины —
  общий TS-пакет бэкенда).
- `api/` — `ApiClient` (базовый URL, заголовки платформы/версии, Bearer-токен,
  разбор ошибок и `426 → экран обновления`) + `AuthApi` (register/login/me/
  профиль). Гостевой вход не проброшен.
- `storage/session_store.dart` — хранилище сессии (token + user).
- `state/auth_controller.dart` — состояние (ChangeNotifier), только
  зарегистрированные; восстановление сессии асинхронное.
- `theme/vellin_theme.dart` — дизайн-токены Vellin (цвета/радиусы из
  `design/tokens.css`).
- `screens/` — `login`, `register`, `profile`; `router.dart` — go_router с
  guard'ом, сплэшем и экраном force-update.

### Hardening-TODO: хранение токена

Сейчас `SessionStore` использует `shared_preferences` (на Windows — pure-Dart
`win32` FFI, без C++/ATL). Значения не шифруются — приемлемый MVP. Следующий
шаг — ОС-хранилище секретов (Windows Credential Manager через
`flutter_secure_storage`); оно требует компонента **ATL** в Visual Studio Build
Tools. Точка изоляции — только `storage/session_store.dart`.

## Требования к тулчейну (уже установлены на машине разработки)

- **Flutter SDK** (stable) в `C:\src\flutter` (в PATH — `C:\src\flutter\bin`).
- **Visual Studio Build Tools 2019** с workload «Desktop C++» (MSVC + Windows
  SDK) — Flutter Windows-десктоп собирается через CMake/MSVC.
- **Developer Mode** Windows включён (Flutter-плагинам нужны симлинки).

`flutter doctor` по Windows-десктопу — зелёный.

## Разработка и сборка

```bash
cd winapp

# запуск против прод-бэкенда (по умолчанию https://vellin.ru)
flutter run -d windows

# против локального бэкенда :3001
flutter run -d windows --dart-define=SERVER_URL=http://localhost:3001

# сборка релизного exe
flutter build windows            # build/windows/x64/runner/Release/
```

## Продакшн (заложено на будущее)

- **Версионный гейтинг** — заголовки `X-App-*`; сервер отдаёт `426`, клиент
  показывает экран обновления (сверка с `/api/config.minVersions.windows`).
- Установщик (MSIX/Inno Setup) + подпись Authenticode, автообновление,
  телеметрия (Sentry), CI/CD — отдельные шаги.
