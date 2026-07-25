# Vellin — кастомный установщик

Собственный установщик Vellin со **своим дизайном** (не стандартное окно
Windows). Это отдельное Flutter-приложение с безрамочным окном в фирменном
стиле Vellin: логотип, прогресс, экран «Готово». Ставит приложение в
`%LOCALAPPDATA%\Vellin` **без прав администратора**.

Раздаётся как **один файл** `Vellin-Setup-<версия>.exe` — тонкая NSIS-обёртка,
которая **невидимо** распаковывает установщик во временную папку и запускает
его. Пользователь видит только фирменное окно Vellin, никакого стороннего UI.

## Устройство

- `lib/main.dart` — UI (bitsdojo_window, безрамочное окно + тема Vellin):
  экраны idle → installing → done/error, кнопки «Установить» / «Запустить».
- `lib/installer_engine.dart` — логика: распаковка встроенного `payload.zip`
  (архив release-билда приложения) в целевую папку, ярлыки (меню Пуск +
  рабочий стол), запись деинсталля в реестр (`HKCU\...\Uninstall\Vellin`),
  генерация `uninstall.ps1`.
- `sfx.nsi` — NSIS silent-обёртка в один exe (прокидывает аргументы в
  установщик, поэтому `--silent` идёт насквозь для автообновления).
- `assets/payload.zip` — release-билд приложения (собирается в `build.ps1`,
  в git не хранится).

Флаги установщика:
- без аргументов — показывает фирменное окно;
- `--silent` — тихая установка без окна (используется автообновлением).

## Требования к сборке

- Flutter (в PATH) + VS 2022 Build Tools (как для приложения).
- **NSIS** (`winget install NSIS.NSIS`) — для склейки в один файл. Без NSIS
  установщик остаётся папкой `build/.../Release/`.

## Сборка

```powershell
powershell -ExecutionPolicy Bypass -File installer\build.ps1
# → installer\dist\Vellin-Setup-<версия>.exe  (один файл)
```

Шаги build.ps1: release-билд приложения → упаковка в `assets/payload.zip` →
release-билд установщика → склейка в один exe через NSIS.

## Иконка

Иконка приложения и установщика — брендовая «V» (совпадает с favicon сайта),
источник `winapp/assets/vellin_icon.png`. Перегенерация Windows-иконок:
`dart run flutter_launcher_icons` (в `winapp/` и `installer/`).

## Автообновление

Клиент проверяет `/api/config` (`update.windows`) и при новой версии скачивает
`Vellin-Setup-X.Y.Z.exe`, запускает его с `--silent` и закрывается. Релиз-поток:
поднять версию (`winapp/pubspec.yaml`, `winapp/lib/app_config.dart`,
`installer/lib/installer_engine.dart`), собрать, выложить exe, выставить на
сервере `WINAPP_LATEST_VERSION` / `WINAPP_DOWNLOAD_URL`.

## На будущее (hardening)

- Подпись Authenticode установщика и exe (иначе SmartScreen предупреждает).
- Хранение токена в ОС-хранилище секретов (см. winapp/README.md).
