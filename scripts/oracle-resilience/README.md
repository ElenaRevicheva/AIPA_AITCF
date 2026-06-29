# Oracle resilience — one-time deploy (agents never silently die)

**Server:** `ubuntu@170.9.242.90` (key: `ssh-key-2026-01-07private.key`)

## One command from Windows (recommended)

From the **cto-aipa** repo root (or from `scripts/oracle-resilience/`):

```powershell
.\scripts\oracle-resilience\deploy_from_windows.ps1
```

This copies `deploy_on_server.sh` to the server and runs it. It will:

- Install **health-check** script (every 5 min: curl CTO AIPA, EspaLuz WhatsApp, EspaLuz Influencer → restart if unhealthy)
- Install **keep-alive** script (every 4 h: light CPU + curl so Oracle doesn’t reclaim the instance)
- Add **crontab** entries
- Add **systemd drop-ins** for `espaluz-whatsapp` and `espaluz-influencer` (Restart=always, no WatchdogSec)
- Enable and restart those systemd services
- Run **pm2 startup** (you must run the command it prints, then `pm2 save`)

After the script finishes, SSH in and complete the PM2 step if prompted:

```bash
ssh -i ~/.ssh/ssh-key-2026-01-07private.key ubuntu@170.9.242.90
# Run the sudo env ... command that pm2 startup printed, then:
pm2 save
```

## Manual deploy (if you prefer)

1. Copy `deploy_on_server.sh` to the server and run it there:
   ```powershell
   scp -i $env:USERPROFILE\.ssh\ssh-key-2026-01-07private.key scripts\oracle-resilience\deploy_on_server.sh ubuntu@170.9.242.90:~/
   ssh -i $env:USERPROFILE\.ssh\ssh-key-2026-01-07private.key ubuntu@170.9.242.90 "bash ~/deploy_on_server.sh"
   ```
2. On the server: run the `pm2 startup` command that was printed, then `pm2 save`.

## Verify

After 5 minutes:

```bash
ssh -i ~/.ssh/ssh-key-2026-01-07private.key ubuntu@170.9.242.90 "tail -30 /var/log/oracle-health.log"
```

See `docs/ORACLE_ALL_PRODUCTS_RESILIENCE.md` for the full plan and adding more agents (2, 4, 5+6) when you have their ports/service names.

## GitHub auth on Oracle (fix `git pull` / `git fetch`)

**Root cause:** HTTPS remotes without credentials → `could not read Username`. Deploy keys are **one repo each** (atlas key ≠ EspaLuzFamilybot).

**Fix:** PAT in `cto-aipa/.env` + `oracle-fix-git-https-auth.sh` (sets `~/.git-credentials` + `url.insteadOf`).

```powershell
scp -i $env:USERPROFILE\.ssh\ssh-key-2026-01-07private.key `
  scripts\oracle-resilience\oracle-fix-git-https-auth.sh ubuntu@170.9.242.90:~/
ssh -i $env:USERPROFILE\.ssh\ssh-key-2026-01-07private.key ubuntu@170.9.242.90 `
  "TOKEN=ghp_YOUR_PAT bash ~/oracle-fix-git-https-auth.sh"
```

When PAT expires (~2026-09-01), regenerate at GitHub → Settings → Developer settings → PATs, then re-run the script.

Legacy: `oracle-setup-github-ssh-fleet.sh` (SSH deploy keys) — only works for repos that registered that specific key (e.g. atlas-shifted).
