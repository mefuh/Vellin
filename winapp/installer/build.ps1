# Сборка установщика Vellin: release-билд Flutter + компиляция Inno Setup.
# Версия берётся из winapp/pubspec.yaml. Результат — installer/dist/Vellin-Setup-<ver>.exe
$ErrorActionPreference = 'Stop'
$winapp = Split-Path -Parent $PSScriptRoot

$verLine = Select-String -Path "$winapp\pubspec.yaml" -Pattern '^version:\s*([0-9]+\.[0-9]+\.[0-9]+)'
$ver = $verLine.Matches[0].Groups[1].Value
Write-Host "Vellin version: $ver"

Push-Location $winapp
try {
  Write-Host "== flutter build windows --release =="
  flutter build windows --release
} finally {
  Pop-Location
}

$isccCandidates = @(
  "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
  "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
  "C:\Program Files\Inno Setup 6\ISCC.exe"
)
$iscc = $isccCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw "ISCC.exe не найден: установите Inno Setup (winget install JRSoftware.InnoSetup)" }

Write-Host "== ISCC =="
& $iscc "/DAppVersion=$ver" "$PSScriptRoot\vellin.iss"
Write-Host "Готово: $PSScriptRoot\dist\Vellin-Setup-$ver.exe"
