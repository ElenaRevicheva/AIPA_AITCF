# One-shot: wire phone + Cloud Agent deploy to Oracle (170.9.242.90)
# Run from PowerShell on your laptop (repo root or this folder):
#   .\scripts\oracle-resilience\setup-remote-deploy-from-laptop.ps1
#
# What it does:
#   1. Finds your Oracle SSH private key in ~\.ssh
#   2. Tests SSH to ubuntu@170.9.242.90
#   3. Stores ORACLE_SSH_KEY in GitHub Actions secrets (AIPA_AITCF)
#   4. Triggers fleet-verify workflow (health check, no code deploy)
#
# Requires: OpenSSH (ssh), GitHub CLI (gh) logged in as ElenaRevicheva

$ErrorActionPreference = "Stop"
$OracleHost = "170.9.242.90"
$OracleUser = "ubuntu"
$Repo = "ElenaRevicheva/AIPA_AITCF"

function Find-OracleKey {
  $sshDir = Join-Path $env:USERPROFILE ".ssh"
  $candidates = @(
    "ssh-key-2025-01-07-private.key",
    "ssh-key-2026-01-07private.key",
    "ssh-key-2026-01-07-private.key",
    "ssh-key-2026-01-07.key"
  )
  foreach ($name in $candidates) {
    $path = Join-Path $sshDir $name
    if (Test-Path $path) {
      $content = Get-Content -Raw $path
      if ($content -match "BEGIN (OPENSSH |RSA )?PRIVATE KEY") {
        return $path
      }
    }
  }
  $keys = Get-ChildItem -Path $sshDir -Filter "*.key" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match "private" -or $_.Name -notmatch "\.pub$" }
  foreach ($f in $keys) {
    $content = Get-Content -Raw $f.FullName -ErrorAction SilentlyContinue
    if ($content -match "BEGIN (OPENSSH |RSA )?PRIVATE KEY") {
      return $f.FullName
    }
  }
  return $null
}

Write-Host ""
Write-Host "=== Oracle remote deploy setup ===" -ForegroundColor Cyan
Write-Host ""

# --- gh ---
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Host "Install GitHub CLI: https://cli.github.com/" -ForegroundColor Red
  exit 1
}
$ghUser = gh api user -q .login 2>$null
if (-not $ghUser) {
  Write-Host "Run: gh auth login" -ForegroundColor Yellow
  gh auth login
  $ghUser = gh api user -q .login
}
Write-Host "GitHub CLI: logged in as $ghUser" -ForegroundColor Green
if ($ghUser -ne "ElenaRevicheva") {
  Write-Host "WARNING: secrets must be set on ElenaRevicheva/AIPA_AITCF." -ForegroundColor Yellow
  Write-Host "If this is not Elena's account, run: gh auth login" -ForegroundColor Yellow
}

# --- SSH key ---
$Key = Find-OracleKey
if (-not $Key) {
  Write-Host "No Oracle private key found in $env:USERPROFILE\.ssh" -ForegroundColor Red
  Write-Host "Expected something like: ssh-key-2025-01-07-private.key" -ForegroundColor Red
  exit 1
}
Write-Host "SSH key: $Key" -ForegroundColor Green

# --- Test SSH ---
Write-Host ""
Write-Host "Testing SSH to ${OracleUser}@${OracleHost} ..." -ForegroundColor Cyan
$sshTest = & ssh -i $Key -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o BatchMode=yes `
  "${OracleUser}@${OracleHost}" "echo OK && hostname && uptime" 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "SSH failed:" -ForegroundColor Red
  Write-Host $sshTest
  Write-Host ""
  Write-Host "Fix: ensure this public key is in Oracle ~/.ssh/authorized_keys for ubuntu." -ForegroundColor Yellow
  exit 1
}
Write-Host $sshTest -ForegroundColor Green

# --- GitHub secret ---
Write-Host ""
Write-Host "Setting ORACLE_SSH_KEY secret on $Repo ..." -ForegroundColor Cyan
Get-Content -Raw $Key | gh secret set ORACLE_SSH_KEY --repo $Repo
if ($LASTEXITCODE -ne 0) {
  Write-Host "Failed to set secret. Ensure you have admin on $Repo." -ForegroundColor Red
  exit 1
}
Write-Host "ORACLE_SSH_KEY saved (encrypted in GitHub — not in git)." -ForegroundColor Green

# --- Trigger fleet verify ---
Write-Host ""
Write-Host "Triggering Deploy to Oracle VM (fleet-verify) ..." -ForegroundColor Cyan
gh workflow run "Deploy to Oracle VM" --repo $Repo -f product=fleet-verify -f notes="laptop-setup-$(Get-Date -Format yyyy-MM-dd)"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Workflow trigger failed. Set secret manually, then run Actions from GitHub UI." -ForegroundColor Yellow
  exit 1
}

Write-Host "Workflow started. Watch:" -ForegroundColor Green
Write-Host "  https://github.com/$Repo/actions/workflows/deploy-oracle.yml" -ForegroundColor White

Start-Sleep -Seconds 8
gh run list --repo $Repo --workflow=deploy-oracle.yml --limit 1

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "Phone deploy: GitHub -> Actions -> Deploy to Oracle VM -> pick product" -ForegroundColor White
Write-Host "Cloud Agent: push code -> then run workflow (or use phone)" -ForegroundColor White
Write-Host ""
Write-Host "Optional — refresh Oracle git auth (new PAT, run on Oracle via SSH):" -ForegroundColor Yellow
Write-Host "  ssh -i `"$Key`" ${OracleUser}@${OracleHost}" -ForegroundColor Gray
Write-Host "  TOKEN=ghp_YOUR_NEW_PAT bash ~/oracle-fix-git-https-auth.sh" -ForegroundColor Gray
Write-Host "  cd ~/cto-aipa && pm2 restart cto-aipa" -ForegroundColor Gray
Write-Host ""
