# Oracle Infrastructure — Overview

## Server

| Field | Value |
|-------|--------|
| **Public IP** | `170.9.242.90` |
| **SSH** | `ssh -i ~/.ssh/ssh-key-2026-01-07private.key ubuntu@170.9.242.90` |
| **User** | `ubuntu` |
| **OS** | Canonical Ubuntu 24.04 |
| **Shape** | VM.Standard.E5.Flex |
| **OCPUs** | 1 |
| **RAM** | 12 GB |
| **Region** | us-chicago-1 |
| **Compartment** | aideazz (root) |
| **Instance name** | instance-20260107-1316 |

---

## All 9 AI Agents on Oracle (deployed)

Every agent is covered by: (1) restart hardening (systemd drop-in or PM2), (2) health-check cron every 5 min, (3) OCI keep-alive every 4 h. See [RESILIENCE.md](./RESILIENCE.md).

| # | Name | Repo | Try it / See it | Process manager | Service / PM2 name | How we check (deployed) |
|---|------|------|------------------|------------------|--------------------|--------------------------|
| 1 | **EspaLuz WhatsApp** | [EspaLuzWhatsApp](https://github.com/ElenaRevicheva/EspaLuzWhatsApp) | [wa.me/50766623757](http://wa.me/50766623757) | systemd | `espaluz-whatsapp` | HTTP `http://127.0.0.1:8081/webhook` → restart if not 200 |
| 2 | **EspaLuz Telegram** | [EspaLuzFamilybot](https://github.com/ElenaRevicheva/EspaLuzFamilybot) | [t.me/EspaLuzFamily_bot](https://t.me/EspaLuzFamily_bot) | systemd | `espaluz-familybot` | `systemctl is-active` → restart if inactive |
| 3 | **EspaLuz Influencer** | [EspaLuz_Influencer](https://github.com/ElenaRevicheva/EspaLuz_Influencer) | [t.me/Influencer_EspaLuz_bot](https://t.me/Influencer_EspaLuz_bot) | systemd | `espaluz-influencer` | `systemctl is-active` → restart if inactive |
| 4 | **Algom Alpha** | [dragontrade-agent](https://github.com/ElenaRevicheva/dragontrade-agent) | Automated posting on @reviceva — [posting recovery](#algom-alpha-dragontrade--posting-recovery) | PM2 | `dragontrade-main`, `dragontrade-dashboard`, `dragontrade-bybit`, `dragontrade-binance` | `pm2 describe` → restart each if not online |
| 5 | **VibeJob Hunter** | [VibeJobHunterAIPA_AIMCF](https://github.com/ElenaRevicheva/VibeJobHunterAIPA_AIMCF) | [t.me/vibejob_hunter_bot](https://t.me/vibejob_hunter_bot) | systemd | `vibejobhunter-web`, `vibejobhunter` | `systemctl is-active` → restart if inactive |
| 6 | **AI Marketing Co-Founder** | [VibeJobHunterAIPA_AIMCF](https://github.com/ElenaRevicheva/VibeJobHunterAIPA_AIMCF) (same repo as 5) | [LinkedIn](https://linkedin.com/in/elenarevicheva), [Instagram](https://instagram.com/elena_revicheva) | systemd (same as 5) | (same as 5) | (same as 5) |
| 7 | **Tech Co-Founder (CTO AIPA)** | [AIPA_AITCF](https://github.com/ElenaRevicheva/AIPA_AITCF) | [t.me/aitcf_aideazz_bot](https://t.me/aitcf_aideazz_bot) | PM2 | `cto-aipa` | HTTP `http://127.0.0.1:3000/` → restart if not 200 |
| 8 | **Creative Co-Founder Atuona** | [AIPA_AITCF](https://github.com/ElenaRevicheva/AIPA_AITCF) (same repo as 7) | [@Atuona_AI_CCF_AIdeazz_bot](https://t.me/Atuona_AI_CCF_AIdeazz_bot) | PM2 (same process as 7) | `cto-aipa` | (same as 7) |
| 9 | **OpenClaw Vibejob Shortlist** | [openclaw-vibejob-shortlist](https://github.com/ElenaRevicheva/openclaw-vibejob-shortlist) | Telegram (OpenClaw job shortlist + voice) | systemd | `openclaw-gateway` | HTTP `http://127.0.0.1:18789/` → restart if not 200 |

**Extra (EspaLuz stack):** `espaluz-webhook` — systemd, checked and restarted if inactive.

**Repos (7 for 9 agents):** EspaLuzWhatsApp, EspaLuzFamilybot, EspaLuz_Influencer, dragontrade-agent, VibeJobHunterAIPA_AIMCF, AIPA_AITCF, openclaw-vibejob-shortlist. Agents 7+8 share AIPA_AITCF; 5+6 share VibeJobHunterAIPA_AIMCF.

---

## How we fixed "agents silently die" (deployed)

1. **Health-check script** (`/home/ubuntu/check_oracle_health.sh`) — runs every **5 minutes** from cron. For each agent above: if HTTP check fails or process is not active/online, the script restarts that service or PM2 app. Log: `/var/log/oracle-health.log`.

2. **Systemd restart hardening** — Drop-in `resilience.conf` for every systemd agent: `Restart=always`, `RestartSec=10`, `StartLimitIntervalSec=300`, `StartLimitBurst=10` (no WatchdogSec). Applied to: `espaluz-whatsapp`, `espaluz-influencer`, `espaluz-familybot`, `espaluz-webhook`, `vibejobhunter-web`, `vibejobhunter`, `openclaw-gateway`. All enabled on boot.

3. **PM2** — `cto-aipa` and all `dragontrade-*` apps. PM2 startup on boot is configured (`pm2-ubuntu.service`); `pm2 save` used so the list survives reboot.

4. **OCI keep-alive** (`/home/ubuntu/oci_keepalive.sh`) — runs every **4 hours**. Light CPU/IO and curl to `http://127.0.0.1:3000/`, `http://127.0.0.1:8081/webhook`, `http://127.0.0.1:3001/`, `http://127.0.0.1:18789/` so the instance does not appear idle to Oracle.

**One-command deploy (from AIPA_AITCF repo):** `.\scripts\oracle-resilience\deploy_from_windows.ps1` (then complete `pm2 startup` on server if prompted). Script source: [AIPA_AITCF](https://github.com/ElenaRevicheva/AIPA_AITCF) `scripts/oracle-resilience/`.

---

## Algom Alpha (DragonTrade) — Posting recovery

When **@reviceva** has not posted for days despite the bot running, the cause is usually **Twitter rate limiting (HTTP 429)**. The bot keeps trying → 429 → 15 min pause → retry → 429.

**Full diagnosis (crash loops, MCP + 429):** [DRAGONTRADE_ORACLE_SILENT_DEATH_FIX.md](../../DRAGONTRADE_ORACLE_SILENT_DEATH_FIX.md)

### Symptoms

- Error log: `❌ [THREAD 1/4] Failed to post: Request failed with code 429`
- `⏰ [RATE LIMIT] Pausing bot for 15 minutes`
- stdout shows `Posts: 0 | Reposts: 0` for a long time
- If restart count climbs: MCP crash loops (see CoinGecko env below)

### Required env (prevents crash loops)

In `/home/ubuntu/dragontrade-agent/.env`:

```
COINGECKO_USE_DIRECT_API_ONLY=1
COINGECKO_API_KEY=<your key>
```

Without these, CoinGecko MCP can crash the process; combined with 429, the bot never stabilizes.

### Monitor logs

```bash
ssh -i ~/.ssh/ssh-key-2026-01-07private.key ubuntu@170.9.242.90 "tail -80 /home/ubuntu/.pm2/logs/dragontrade-main-out.log"
ssh -i ~/.ssh/ssh-key-2026-01-07private.key ubuntu@170.9.242.90 "tail -80 /home/ubuntu/.pm2/logs/dragontrade-main-error.log"
```

### Strategies to reset rate limit

Repeated attempts can keep the account in a bad state. To let the limit fully reset (often 24–48 hours):

**Important:** The health-check cron restarts any PM2 app that is not `online` every 5 minutes. So `pm2 stop` will be undone by the cron. Prefer **DISABLE_POSTING** or **long intervals**.

| Option | Command / action |
|--------|-------------------|
| **Disable posting** (best) | Add `DISABLE_POSTING=1` to `/home/ubuntu/dragontrade-agent/.env` — bot stays online (cron happy), skips posting. Requires code support in dragontrade-agent. |
| **Long intervals** | Set `POST_INTERVAL_MIN=1440` and `POST_INTERVAL_MAX=2880` (minutes) to reduce attempts. |
| **Stop bot** | `pm2 stop dragontrade-main` — **caveat:** health cron will restart it within 5 min. To truly stop, temporarily comment out the dragontrade block in `/home/ubuntu/check_oracle_health.sh` first. |

### After reset

1. Keep posting disabled or stopped for 24–48 hours.
2. Check [developer.twitter.com](https://developer.twitter.com) for app tier and rate-limit usage.
3. Remove `DISABLE_POSTING=1` or restore intervals, then restart all four apps:
   ```bash
   pm2 restart dragontrade-main dragontrade-dashboard dragontrade-bybit dragontrade-binance
   ```

### Key paths

| Item | Path |
|------|------|
| App dir | `/home/ubuntu/dragontrade-agent` |
| PM2 stdout | `~/.pm2/logs/dragontrade-main-out.log` |
| PM2 stderr | `~/.pm2/logs/dragontrade-main-error.log` |
| Env | `/home/ubuntu/dragontrade-agent/.env` |
| Health script | `/home/ubuntu/check_oracle_health.sh` |

---

## On the server: verify

```bash
pm2 list
systemctl list-units --type=service | grep -E 'espaluz|vibe|pm2|openclaw'
tail -50 /var/log/oracle-health.log
crontab -l
```
