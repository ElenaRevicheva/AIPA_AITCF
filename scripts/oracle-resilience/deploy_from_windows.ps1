# Run this from Windows to deploy Oracle resilience to 170.9.242.90 in one go.
# Requires: OpenSSH client (ssh, scp). Key: ~/.ssh/ssh-key-2026-01-07private.key
$ErrorActionPreference = "Stop"
$Key = Join-Path $env:USERPROFILE ".ssh\ssh-key-2026-01-07private.key"
$Host = "170.9.242.90"
$User = "ubuntu"

if (-not (Test-Path $Key)) {
  Write-Host "SSH key not found: $Key" -ForegroundColor Red
  exit 1
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DeployScript = Join-Path $ScriptDir "deploy_on_server.sh"

if (-not (Test-Path $DeployScript)) {
  Write-Host "Deploy script not found: $DeployScript" -ForegroundColor Red
  exit 1
}

Write-Host "Copying deploy script to $User@${Host}..." -ForegroundColor Cyan
& scp -i $Key -o StrictHostKeyChecking=accept-new $DeployScript "${User}@${Host}:~/deploy_on_server.sh"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Running deploy on server..." -ForegroundColor Cyan
& ssh -i $Key "${User}@${Host}" "bash ~/deploy_on_server.sh"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Deploy finished. Complete any 'pm2 startup' step shown above on the server." -ForegroundColor Green
