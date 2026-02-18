# Sync job-list-filter to Oracle (170.9.242.90) and fix run_shortlist.sh line endings on server.
# Run from Windows. Requires: OpenSSH (scp, ssh). Key: ~/.ssh/ssh-key-2026-01-07private.key
$ErrorActionPreference = "Stop"
$Key = Join-Path $env:USERPROFILE ".ssh\ssh-key-2026-01-07private.key"
$HostName = "170.9.242.90"
$User = "ubuntu"
$JobListFilter = "D:\aideazz\ai-cofounders\job-list-filter"

if (-not (Test-Path $Key)) {
  Write-Host "SSH key not found: $Key" -ForegroundColor Red
  exit 1
}
if (-not (Test-Path $JobListFilter)) {
  Write-Host "job-list-filter not found: $JobListFilter" -ForegroundColor Red
  exit 1
}

Write-Host "Syncing job-list-filter to ${User}@${HostName}:~/job-list-filter ..." -ForegroundColor Cyan
# Ensure run_shortlist.sh has LF before copy (avoid re-introducing CRLF)
$shPath = Join-Path $JobListFilter "run_shortlist.sh"
$content = [System.IO.File]::ReadAllText($shPath) -replace "`r`n", "`n"
[System.IO.File]::WriteAllText($shPath, $content)

& scp -i $Key -o StrictHostKeyChecking=accept-new "$(Join-Path $JobListFilter 'run_shortlist.sh')" "${User}@${HostName}:~/job-list-filter/run_shortlist.sh"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& scp -i $Key -o StrictHostKeyChecking=accept-new "$(Join-Path $JobListFilter '.gitattributes')" "${User}@${HostName}:~/job-list-filter/.gitattributes"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Fixing line endings on server (strip CR)..." -ForegroundColor Cyan
& ssh -i $Key "${User}@${HostName}" "cd ~/job-list-filter && sed -i 's/\r$//' run_shortlist.sh && chmod +x run_shortlist.sh && echo OK"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Done. run_shortlist.sh on Oracle has LF; Telegram bot should work." -ForegroundColor Green
