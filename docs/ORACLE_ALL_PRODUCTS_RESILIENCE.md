# Oracle Instance Resilience — All Products (Fix Bots Dying Silently)

**Purpose:** Stop all AI bots on Oracle from silently dying. One plan, one deployment, covers every product on `170.9.242.90`.

**Note:** These details are synced to [aideazz-private-docs / docs/plans/oracle-infrastructure](https://github.com/ElenaRevicheva/aideazz-private-docs/tree/docs/docs/plans/oracle-infrastructure). In this repo, the export lives in `docs/plans/oracle-infrastructure/` (README, OVERVIEW, RESILIENCE). Copy that folder to the private repo’s `docs/plans/oracle-infrastructure/` and push to the `docs` branch. See `docs/plans/oracle-infrastructure/SYNC_TO_PRIVATE_REPO.md`.

---

## Server

| Field     | Value |
|----------|--------|
| **Public IP** | `170.9.242.90` |
| **SSH**  | `ssh -i ~/.ssh/ssh-key-2026-01-07private.key ubuntu@170.9.242.90` |
| **OS**   | Ubuntu 24.04, 12 GB RAM, VM.Standard.E5.Flex |

---

## All 8 AI Agents on Oracle (Canonical List)

Every agent on this instance **must** have: (1) restart hardening, (2) a health-check (HTTP or process liveness) that restarts if unhealthy, (3) included in OCI keep-alive.

| # | Name | Repo | Try it / See it | Process manager | Service / PM2 name | Health URL or check |
|---|------|------|------------------|------------------|--------------------|----------------------|
| 1 | **EspaLuz WhatsApp** | [EspaLuzWhatsApp](https://github.com/ElenaRevicheva/EspaLuzWhatsApp) | [wa.me/50766623757](http://wa.me/50766623757) | systemd | `espaluz-whatsapp` | `http://127.0.0.1:8081/webhook` |
| 2 | **EspaLuz Telegram** | [EspaLuzFamilybot](https://github.com/ElenaRevicheva/EspaLuzFamilybot) | [t.me/EspaLuzFamily_bot](https://t.me/EspaLuzFamily_bot) | systemd | `espaluz-familybot` or TBD | Add `/health` or use `systemctl is-active` |
| 3 | **EspaLuz Influencer** | [EspaLuz_Influencer](https://github.com/ElenaRevicheva/EspaLuz_Influencer) | [t.me/Influencer_EspaLuz_bot](https://t.me/Influencer_EspaLuz_bot) | systemd | `espaluz-influencer` | Confirm port on server; add block in script |
| 4 | **Algom Alpha** | [dragontrade-agent](https://github.com/ElenaRevicheva/dragontrade-agent) | Automated posting on @reviceva | PM2 or systemd | e.g. `dragontrade` or `algom-alpha` | Add HTTP health or process check |
| 5 | **VibeJob Hunter** | [VibeJobHunterAIPA_AIMCF](https://github.com/ElenaRevicheva/VibeJobHunterAIPA_AIMCF) | [t.me/vibejob_hunter_bot](https://t.me/vibejob_hunter_bot) | PM2 or systemd (when on Oracle) | e.g. `vibejob` | e.g. `http://127.0.0.1:PORT/health` |
| 6 | **AI Marketing Co-Founder** | [VibeJobHunterAIPA_AIMCF](https://github.com/ElenaRevicheva/VibeJobHunterAIPA_AIMCF) (same repo as 5) | [LinkedIn](https://linkedin.com/in/elenarevicheva), [Instagram](https://instagram.com/elena_revicheva) | Same process as 5 when on Oracle | (same as 5) | (same as 5) |
| 7 | **Tech Co-Founder (CTO AIPA)** | [AIPA_AITCF](https://github.com/ElenaRevicheva/AIPA_AITCF) | [t.me/aitcf_aideazz_bot](https://t.me/aitcf_aideazz_bot) | PM2 | `cto-aipa` | `http://127.0.0.1:3000/` |
| 8 | **Creative Co-Founder Atuona** | [AIPA_AITCF](https://github.com/ElenaRevicheva/AIPA_AITCF) (same repo as 7) | [@Atuona_AI_CCF_AIdeazz_bot](https://t.me/Atuona_AI_CCF_AIdeazz_bot) | PM2 (same process as 7) | `cto-aipa` | `http://127.0.0.1:3000/` |

**Repos (4):** EspaLuzWhatsApp, EspaLuzFamilybot, EspaLuz_Influencer, dragontrade-agent, VibeJobHunterAIPA_AIMCF, AIPA_AITCF (6 repos for 8 agents; 7+8 share AIPA_AITCF, 5+6 share VibeJobHunterAIPA_AIMCF).

**Action:** On the server run `pm2 list` and `systemctl list-units --type=service --all | grep -E 'espaluz|cto|vibe|dragon|algom'` and set the exact service/PM2 names and ports in the health script. Add a simple HTTP health endpoint in any bot that doesn’t have one (e.g. `/health` returning 200) so the cron can detect hangs, not only crashes.

**DragonTrade (Algom Alpha) on Oracle:** PM2 app names are `dragontrade-main`, `dragontrade-dashboard`, `dragontrade-bybit`, `dragontrade-binance`. In the app's `.env` on the server set `COINGECKO_USE_DIRECT_API_ONLY=1` and `COINGECKO_API_KEY=<key>` to avoid crash-loops from CoinGecko MCP (mcp.api.coingecko.com 500/SSE errors). See `docs/DRAGONTRADE_ORACLE_SILENT_DEATH_FIX.md` for the full diagnosis.

---

## Root Causes We Fix

1. **Process crashes** — systemd/PM2 not restarting (or start limit hit).
2. **Process hangs** — process up but not responding (health check detects and restarts).
3. **Oracle reclaiming instance** — free-tier “idle” reclamation (keep-alive).
4. **Not starting after reboot** — services not enabled (ensure `enable` + PM2 startup).

---

## 1. Systemd Services (EspaLuz WhatsApp, Telegram, Influencer; others if using systemd)

Apply to every systemd-run bot: **Restart:** `Restart=always`, `RestartSec=10`, `StartLimitIntervalSec=300`, `StartLimitBurst=10`. **Do not add** `WatchdogSec` unless the app calls `sd_notify(WATCHDOG=1)` (see `ORACLE_RESILIENCE_PLAN_REVIEW.md`).

Example (adjust service name and paths for each):

```ini
[Service]
Restart=always
RestartSec=10
StartLimitIntervalSec=300
StartLimitBurst=10
# No MemoryMax needed (12 GB RAM). No WatchdogSec unless app supports it.
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable espaluz-whatsapp   # and espaluz-influencer
sudo systemctl restart espaluz-whatsapp
```

---

## 2. PM2 (CTO AIPA + Atuona; VibeJob/CMO, Algom Alpha if run with PM2)

- Ensure PM2 starts on boot: `pm2 startup` (run the command it prints), then `pm2 save`.
- Use an ecosystem file with `max_restarts` and `autorestart: true` (default) for each app.
- Health-check cron will restart if HTTP check fails (see below). For apps without HTTP, cron can still `pm2 restart <name>` when `pm2 jlist` shows status not "online".

---

## 3. One Health-Check Script (All Services)

Single script that checks every product and restarts only the unhealthy ones. Run from cron every 5 minutes.

**Path on server:** `/home/ubuntu/check_oracle_health.sh`

```bash
#!/bin/bash
# Oracle 170.9.242.90 — health check all products, restart if unhealthy
LOG=/var/log/oracle-health.log
exec >> "$LOG" 2>&1

echo "=== $(date -Iseconds) ==="

# CTO AIPA + Atuona (PM2, port 3000)
HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://127.0.0.1:3000/ 2>/dev/null || echo "000")
if [ "$HTTP" != "200" ]; then
  echo "CTO AIPA/Atuona unhealthy (HTTP $HTTP), restarting PM2..."
  pm2 restart cto-aipa
fi

# EspaLuz WhatsApp (systemd, port 8081)
HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://127.0.0.1:8081/webhook 2>/dev/null || echo "000")
if [ "$HTTP" != "200" ]; then
  echo "EspaLuz WhatsApp unhealthy (HTTP $HTTP), restarting..."
  sudo systemctl restart espaluz-whatsapp
fi

# EspaLuz Influencer (systemd) — UPDATE port/path to match your deployment
# HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://127.0.0.1:PORT/health 2>/dev/null || echo "000")
# if [ "$HTTP" != "200" ]; then
#   echo "EspaLuz Influencer unhealthy (HTTP $HTTP), restarting..."
#   sudo systemctl restart espaluz-influencer
# fi

echo "Health check done."
```

- Make executable: `chmod +x /home/ubuntu/check_oracle_health.sh`
- Cron: `*/5 * * * * /home/ubuntu/check_oracle_health.sh`

---

## 4. OCI Keep-Alive (Prevent Instance Reclamation)

- Light CPU/IO + optional curl to your own services so the instance doesn’t look idle.

**Path on server:** `/home/ubuntu/oci_keepalive.sh`

```bash
#!/bin/bash
# Prevent Oracle from reclaiming free-tier instance
LOG=/var/log/oci-keepalive.log
dd if=/dev/urandom bs=1M count=10 of=/dev/null 2>/dev/null
curl -s -o /dev/null --max-time 5 http://127.0.0.1:3000/ || true
curl -s -o /dev/null --max-time 5 http://127.0.0.1:8081/webhook || true
echo "$(date -Iseconds): keepalive" >> "$LOG"
```

- Cron: `0 */4 * * * /home/ubuntu/oci_keepalive.sh`

---

## 5. Deployment Checklist (One-Pass Fix)

Do this once on the server (SSH as above).

- [ ] **Systemd units** (for every bot run by systemd: EspaLuz WhatsApp, EspaLuz Telegram, EspaLuz Influencer, and any others)  
  - [ ] Add `Restart=always`, `RestartSec=10`, `StartLimitIntervalSec=300`, `StartLimitBurst=10`; no `WatchdogSec`.  
  - [ ] `sudo systemctl daemon-reload` and `enable <service>` for each.

- [ ] **PM2**  
  - [ ] `pm2 startup` (apply the printed command).  
  - [ ] `pm2 save`.

- [ ] **Health script**  
  - [ ] Create `/home/ubuntu/check_oracle_health.sh` (content above).  
  - [ ] Uncomment/fix EspaLuz Influencer block when port/path known.  
  - [ ] `chmod +x /home/ubuntu/check_oracle_health.sh`.  
  - [ ] Crontab: `*/5 * * * * /home/ubuntu/check_oracle_health.sh`.

- [ ] **Keep-alive**  
  - [ ] Create `/home/ubuntu/oci_keepalive.sh` (content above).  
  - [ ] `chmod +x /home/ubuntu/oci_keepalive.sh`.  
  - [ ] Crontab: `0 */4 * * * /home/ubuntu/oci_keepalive.sh`.

- [ ] **Verify**  
  - [ ] `sudo systemctl status espaluz-whatsapp espaluz-influencer` (and any other systemd bots)  
  - [ ] `pm2 list` (all 8 agents: 7+8 = cto-aipa; 5+6 = one app if on Oracle; 4 = dragontrade/algom if PM2)  
  - [ ] Wait 5 minutes and `tail -50 /var/log/oracle-health.log`

---

## 6. When You Add or Change Agents

- Keep the "All 8 AI Agents" table updated with exact service names and health URLs.- In `check_oracle_health.sh`: add or uncomment a block for that agent (curl health URL then restart if non-200, or systemctl/pm2 restart if process check only).
- In `oci_keepalive.sh`: add a curl to each agent's health URL so keep-alive touches every service that has HTTP.

---

## References

- Plan (EspaLuz-focused): `.cursor/plans/oracle_instance_resilience_d6cfcf8b.plan.md`
- CTO review (WatchdogSec, all products): `docs/ORACLE_RESILIENCE_PLAN_REVIEW.md`
- Migration/ports: `docs/RAILWAY_TO_ORACLE_MIGRATION.md`
- Private infra docs (may not list all products): [aideazz-private-docs / oracle-infrastructure](https://github.com/ElenaRevicheva/aideazz-private-docs/tree/docs/docs/plans/oracle-infrastructure)
