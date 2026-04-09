# Sets RESEND_API_KEY on Oracle (170.9.242.90) ~/cto-aipa/.env and restarts PM2.
#
# Usage:
#   $env:RESEND_API_KEY = 're_xxxxxxxx'
#   Optional:
#   $env:MARKETING_INQUIRY_FROM = 'AIdeazz <noreply@aideazz.xyz>'
#   .\scripts\oracle-resilience\set_resend_on_oracle.ps1
#
$ErrorActionPreference = "Stop"
$KeyPath = Join-Path $env:USERPROFILE ".ssh\ssh-key-2026-01-07private.key"
$HostAddr = "170.9.242.90"
$User = "ubuntu"

$Resend = if ($env:RESEND_API_KEY) { $env:RESEND_API_KEY.Trim() } else { "" }
if (-not $Resend) {
  Write-Host "Set RESEND_API_KEY first:" -ForegroundColor Yellow
  Write-Host '  $env:RESEND_API_KEY = "re_..."' -ForegroundColor Cyan
  Write-Host '  .\scripts\oracle-resilience\set_resend_on_oracle.ps1' -ForegroundColor Cyan
  exit 1
}
if (-not (Test-Path $KeyPath)) {
  Write-Host "SSH key not found: $KeyPath" -ForegroundColor Red
  exit 1
}

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Py = Join-Path $ScriptRoot "merge_resend_env.py"
if (-not (Test-Path $Py)) {
  Write-Host "Missing $Py" -ForegroundColor Red
  exit 1
}

$tmpKey = [System.IO.Path]::GetTempFileName()
$tmpFrom = $null
try {
  Set-Content -LiteralPath $tmpKey -Value $Resend -Encoding utf8NoBOM -NoNewline
  $RemoteKey = "/tmp/.resend_key_aipa_$(Get-Random)"
  & scp -i $KeyPath -o StrictHostKeyChecking=accept-new $tmpKey "${User}@${HostAddr}:${RemoteKey}"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  $from = if ($env:MARKETING_INQUIRY_FROM) { $env:MARKETING_INQUIRY_FROM.Trim() } else { "" }
  $RemoteFrom = ""
  if ($from) {
    $tmpFrom = [System.IO.Path]::GetTempFileName()
    Set-Content -LiteralPath $tmpFrom -Value $from -Encoding utf8NoBOM -NoNewline
    $RemoteFrom = "/tmp/.from_aipa_$(Get-Random)"
    & scp -i $KeyPath -o StrictHostKeyChecking=accept-new $tmpFrom "${User}@${HostAddr}:${RemoteFrom}"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }

  & scp -i $KeyPath -o StrictHostKeyChecking=accept-new $Py "${User}@${HostAddr}:/tmp/merge_resend_env.py"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  if ($RemoteFrom) {
    & ssh -i $KeyPath "${User}@${HostAddr}" "python3 /tmp/merge_resend_env.py ${RemoteKey} ${RemoteFrom}"
  } else {
    & ssh -i $KeyPath "${User}@${HostAddr}" "python3 /tmp/merge_resend_env.py ${RemoteKey}"
  }
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  & ssh -i $KeyPath "${User}@${HostAddr}" "cd ~/cto-aipa && pm2 restart cto-aipa --update-env && sleep 2 && curl -sS http://127.0.0.1:3000/marketing/inquiry-status"
} finally {
  Remove-Item -LiteralPath $tmpKey -Force -ErrorAction SilentlyContinue
  if ($tmpFrom) { Remove-Item -LiteralPath $tmpFrom -Force -ErrorAction SilentlyContinue }
}

Write-Host ""
Write-Host "Done. emailNotifyConfigured should be true above." -ForegroundColor Green
