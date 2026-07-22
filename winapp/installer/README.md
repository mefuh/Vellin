# Установщик и автообновление WinApp

## Установщик (Inno Setup)

`vellin.iss` собирает установщик из release-билда Flutter. Приложение ставится в
`%LOCALAPPDATA%\Vellin` **без прав администратора** — это важно для
автообновления (переустановка поверх идёт без запроса UAC).

Сборка:

```powershell
# нужен Inno Setup (winget install JRSoftware.InnoSetup) и Flutter в PATH
powershell -File winapp/installer/build.ps1
# → winapp/installer/dist/Vellin-Setup-<версия>.exe
```

`build.ps1` берёт версию из `winapp/pubspec.yaml`, делает
`flutter build windows --release` и компилирует установщик.

Каталог `installer/dist/` не коммитится (см. `.gitignore`).

## Автообновление

Самохостинг через уже существующий `GET /api/config` — без внешних сервисов и
ключей подписи.

Как это работает:
1. На старте клиент запрашивает `/api/config` и читает `update.windows`
   (`{ latestVersion, url, mandatory }`), сравнивает `latestVersion` со своей
   версией (`AppConfig.appVersion`).
2. Если сервер объявляет более новую версию — показывается диалог «Доступно
   обновление». По кнопке «Обновить» клиент скачивает установщик по `url`,
   запускает его в тихом режиме (`/SILENT`) и закрывается, чтобы файлы
   заменились. `mandatory: true` делает обновление блокирующим (без «Позже»).
3. Отдельно от этого работает **версионный гейтинг**: если версия клиента ниже
   `MIN_APP_VERSION_WINDOWS`, сервер отвечает `426` и клиент показывает экран
   принудительного обновления (см. `runtime`/`api_client`).

Поле `update.windows` в `/api/config` заполняется из окружения сервера
(`server/src/config/routes.ts`); `null`, если не заданы обе переменные.

## Релиз новой версии — по шагам

1. Поднять версию в `winapp/pubspec.yaml` (`version: X.Y.Z+N`) и
   `AppConfig.appVersion` (`winapp/lib/app_config.dart`) — держать синхронно.
2. Собрать установщик: `powershell -File winapp/installer/build.ps1`.
3. Выложить `Vellin-Setup-X.Y.Z.exe` на хостинг (напр. `https://vellin.ru/winapp/`).
4. На проде задать переменные окружения сервера и перезапустить:
   ```
   WINAPP_LATEST_VERSION=X.Y.Z
   WINAPP_DOWNLOAD_URL=https://vellin.ru/winapp/Vellin-Setup-X.Y.Z.exe
   WINAPP_UPDATE_MANDATORY=0   # 1 — обязательное обновление
   ```
5. Клиенты со старой версией на следующем запуске увидят диалог обновления.

## На будущее (hardening)

- **Подпись Authenticode** установщика и exe — иначе SmartScreen показывает
  предупреждение «неизвестный издатель». Подписанный установщик обновляется
  бесшумно и без предупреждений.
- Проверка контрольной суммы/подписи скачанного установщика перед запуском.
