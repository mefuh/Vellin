; NSIS-обёртка: невидимый (silent) самораспаковщик. Распаковывает собранный
; кастомный установщик во временную папку и запускает его — пользователь видит
; только фирменное окно Vellin, никакого стороннего UI. Версия — makensis /DVER=x.y.z
Unicode true
!include "FileFunc.nsh"
!ifndef VER
  !define VER "0.1.0"
!endif

Name "Vellin"
OutFile "dist\Vellin-Setup-${VER}.exe"
Icon "windows\runner\resources\app_icon.ico"
SilentInstall silent
RequestExecutionLevel user
SetCompressor /SOLID lzma

VIProductVersion "${VER}.0"
VIAddVersionKey "ProductName" "Vellin"
VIAddVersionKey "FileDescription" "Установщик Vellin"
VIAddVersionKey "FileVersion" "${VER}"
VIAddVersionKey "CompanyName" "Vellin"

Section
  SetOutPath "$TEMP\VellinSetup"
  File /r "build\windows\x64\runner\Release\*.*"
  ; Прокидываем аргументы обёртки в кастомный установщик: пусто → фирменное
  ; окно; "--silent" (автообновление) → тихая установка без окна.
  ${GetParameters} $0
  ExecWait '"$TEMP\VellinSetup\vellin_installer.exe" $0'
  SetOutPath "$TEMP"
  RMDir /r "$TEMP\VellinSetup"
SectionEnd
