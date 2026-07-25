# Build custom Vellin installer.
# 1) release build of the app -> 2) pack into assets/payload.zip ->
# 3) release build of the installer (payload embedded as asset) ->
# 4) (if 7-Zip SFX available) glue into one self-extracting exe.
# ASCII-only strings on purpose: PowerShell 5.1 reads .ps1 as ANSI.
$ErrorActionPreference = 'Stop'
$installer = $PSScriptRoot
$repo = Split-Path -Parent $installer
$winapp = Join-Path $repo 'winapp'

Write-Host '== 1. release build (winapp) =='
Push-Location $winapp
try { flutter build windows --release } finally { Pop-Location }

Write-Host '== 2. pack payload.zip =='
$release = Join-Path $winapp 'build\windows\x64\runner\Release'
$payload = Join-Path $installer 'assets\payload.zip'
if (Test-Path $payload) { Remove-Item $payload -Force }
Compress-Archive -Path (Join-Path $release '*') -DestinationPath $payload
Write-Host ("   payload.zip: {0:N1} MB" -f ((Get-Item $payload).Length / 1MB))

Write-Host '== 3. release build (installer) =='
Push-Location $installer
try { flutter build windows --release } finally { Pop-Location }

$out = Join-Path $installer 'build\windows\x64\runner\Release'
Write-Host "== Done (folder): $out\vellin_installer.exe =="

# 4. Single-file: NSIS silent self-extractor (invisible; extracts to temp and
#    runs the branded installer, so the user sees only the Vellin window).
$makensis = @("${env:ProgramFiles(x86)}\NSIS\makensis.exe", "$env:ProgramFiles\NSIS\makensis.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if ($makensis) {
  Write-Host '== 4. single-file via NSIS =='
  $ver = (Select-String -Path (Join-Path $installer 'lib\installer_engine.dart') -Pattern "installerAppVersion = '([0-9.]+)'").Matches[0].Groups[1].Value
  New-Item -ItemType Directory -Force -Path (Join-Path $installer 'dist') | Out-Null
  Push-Location $installer
  try { & $makensis "/DVER=$ver" 'sfx.nsi' | Select-Object -Last 3 } finally { Pop-Location }
  Write-Host "== Single file: $installer\dist\Vellin-Setup-$ver.exe =="
} else {
  Write-Host 'note: NSIS (makensis) not found - installer stays a folder.'
}
