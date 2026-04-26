$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$Reports = Join-Path $Root "reports"
New-Item -ItemType Directory -Force -Path $Reports | Out-Null

function Test-HttpOk {
  param([string]$Url)
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
    return [int]$response.StatusCode -ge 200 -and [int]$response.StatusCode -lt 400
  } catch {
    return $false
  }
}

function Wait-HttpOk {
  param([string]$Url, [int]$TimeoutSeconds = 30)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-HttpOk $Url) {
      return
    }
    Start-Sleep -Seconds 1
  }
  throw "Timeout waiting for $Url"
}

if (-not (Test-HttpOk "http://127.0.0.1:5000/health")) {
  $backendOut = Join-Path $Reports "selenium_backend.out"
  $backendErr = Join-Path $Reports "selenium_backend.err"
  Start-Process -FilePath "npm.cmd" -ArgumentList "start" -WorkingDirectory (Join-Path $Root "backend") -RedirectStandardOutput $backendOut -RedirectStandardError $backendErr | Out-Null
  Wait-HttpOk "http://127.0.0.1:5000/health" 45
}

if (-not (Test-HttpOk "http://127.0.0.1:3000")) {
  $frontendOut = Join-Path $Reports "selenium_frontend.out"
  $frontendErr = Join-Path $Reports "selenium_frontend.err"
  Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev", "--", "--host", "127.0.0.1" -WorkingDirectory (Join-Path $Root "frontend") -RedirectStandardOutput $frontendOut -RedirectStandardError $frontendErr | Out-Null
  Wait-HttpOk "http://127.0.0.1:3000" 45
}

Push-Location $PSScriptRoot
try {
  npm test
} finally {
  Pop-Location
}
