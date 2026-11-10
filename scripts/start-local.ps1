$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskUrl = 'http://127.0.0.1:8082/home'
function Test-AtlasPreview {
  try {
    $taskResponse = Invoke-WebRequest -Uri $taskUrl -UseBasicParsing -TimeoutSec 2
    return $taskResponse.StatusCode -eq 200 -and $taskResponse.Content -match 'homeSearchInput'
  } catch { return $false }
}
if (Test-AtlasPreview) { Write-Output "Atlas is running: $taskUrl"; exit 0 }
$taskListener = Get-NetTCPConnection -LocalPort 8082 -State Listen -ErrorAction SilentlyContinue
if ($taskListener) { throw 'Port 8082 is already occupied by another service. No process was stopped.' }
$taskNode = (Get-Command node -ErrorAction Stop).Source
if ((& $taskNode --version) -notmatch '^v24\.') { throw 'Atlas local preview requires Node 24.' }
$taskLogs = Join-Path $taskRoot 'artifacts'
New-Item -ItemType Directory -Path $taskLogs -Force | Out-Null
$env:NODE_ENV = 'development'
$env:PORT = '8082'
$env:HOST = '127.0.0.1'
$env:PUBLIC_ORIGIN = 'http://127.0.0.1:8082'
$env:ENABLE_IPV4_MIRROR = 'false'
$taskProcess = Start-Process -FilePath $taskNode -ArgumentList '--env-file-if-exists=.env','server.mjs' -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskLogs 'local-preview.stdout.log') -RedirectStandardError (Join-Path $taskLogs 'local-preview.stderr.log') -PassThru
for ($taskAttempt = 0; $taskAttempt -lt 30; $taskAttempt++) {
  if ($taskProcess.HasExited) { throw 'Atlas exited during startup. See artifacts/local-preview.stderr.log.' }
  if (Test-AtlasPreview) { Write-Output "Atlas is running: $taskUrl"; exit 0 }
  Start-Sleep -Milliseconds 200
}
throw 'Atlas did not become ready. See artifacts/local-preview.stderr.log.'
