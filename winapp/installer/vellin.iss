; Установщик Vellin (Windows) — Inno Setup.
; Версия передаётся из build.ps1: ISCC.exe /DAppVersion=x.y.z vellin.iss
; Ставится в %LOCALAPPDATA%\Vellin (без прав администратора) — чтобы
; автообновление могло переустановить поверх без запроса UAC.

#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif
#define AppName "Vellin"
#define AppExe "vellin_winapp.exe"
#define SourceDir "..\build\windows\x64\runner\Release"

[Setup]
AppId={{8F3A2C1E-4B5D-4E6F-9A0B-1C2D3E4F5A6B}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Vellin
AppPublisherURL=https://vellin.ru
DefaultDirName={localappdata}\Vellin
DefaultGroupName=Vellin
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=dist
OutputBaseFilename=Vellin-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}
; При обновлении закрываем запущенное приложение, чтобы заменить файлы.
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"

[Tasks]
Name: "desktopicon"; Description: "Создать ярлык на рабочем столе"; GroupDescription: "Дополнительно:"; Flags: unchecked

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{userdesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "Запустить {#AppName}"; Flags: nowait postinstall skipifsilent
