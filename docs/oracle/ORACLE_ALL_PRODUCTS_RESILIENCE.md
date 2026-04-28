# Oracle Instance Resilience — All Products (Fix Bots Dying Silently)

**Purpose:** Stop all AI bots on Oracle from silently dying. One plan, one deployment, covers every product on `170.9.242.90`. This file also lists **canonical Git repos**, **Oracle VM directories**, and **authoritative local Windows clones** so nothing is duplicated or misplaced across machines.

**Note:** These details are synced to [aideazz-private-docs / docs/plans/oracle-infrastructure](https://github.com/ElenaRevicheva/aideazz-private-docs/tree/docs/docs/plans/oracle-infrastructure). In this repo, the export lives in `docs/plans/oracle-infrastructure/` (README, OVERVIEW, RESILIENCE). Copy that folder to the private repo’s `docs/plans/oracle-infrastructure/` and push to the `docs` branch. See `docs/plans/oracle-infrastructure/SYNC_TO_PRIVATE_REPO.md`.

---

## Server

| Field     | Value |
|----------|--------|
| **Public IP** | `170.9.242.90` |
| **SSH**  | `ssh -i ~/.ssh/ssh-key-2026-01-07private.key ubuntu@170.9.242.90` |
| **OS**   | Ubuntu 24.04, 12 GB RAM, VM.Standard.E5.Flex |

---

## All 10 AI Agents on Oracle (Canonical List)

Every agent on this instance **must** have: (1) restart hardening, (2) a health-check (HTTP or process liveness) that restarts if unhealthy, (3) included in OCI keep-alive.

| # | Name | Repo | Try it / See it | Process manager | Service / PM2 name | Health URL or check |
|---|------|------|------------------|------------------|--------------------|----------------------|
| 1 | **EspaLuz WhatsApp** | [EspaLuzWhatsApp](https://github.com/ElenaRevicheva/EspaLuzWhatsApp) | [wa.me/50766623757](http://wa.me/50766623757) | systemd | `espaluz-whatsapp` | `http://127.0.0.1:8081/webhook` |
| 2 | **EspaLuz Telegram** | [EspaLuzFamilybot](https://github.com/ElenaRevicheva/EspaLuzFamilybot) | [t.me/EspaLuzFamily_bot](https://t.me/EspaLuzFamily_bot) | systemd | `espaluz-familybot` or TBD | Add `/health` or use `systemctl is-active` |
| 3 | **EspaLuz Influencer** | [EspaLuz_Influencer](https://github.com/ElenaRevicheva/EspaLuz_Influencer) | [t.me/Influencer_EspaLuz_bot](https://t.me/Influencer_EspaLuz_bot) | systemd | `espaluz-influencer` | Confirm port on server; add block in script |
| 4 | **Algom Alpha** | [dragontrade-agent](https://github.com/ElenaRevicheva/dragontrade-agent) | Automated posting on @reviceva | PM2 or systemd | e.g. `dragontrade` or `algom-alpha` | Add HTTP health or process check |
| 5 | **VibeJob Hunter** | [VibeJobHunterAIPA_AIMCF](https://github.com/ElenaRevicheva/VibeJobHunterAIPA_AIMCF) | [t.me/vibejob_hunter_bot](https://t.me/vibejob_hunter_bot) | systemd | `vibejobhunter` | `systemctl is-active vibejobhunter` (autonomous loop; no HTTP) |
| 6 | **AI Marketing Co-Founder (CMO)** | [VibeJobHunterAIPA_AIMCF](https://github.com/ElenaRevicheva/VibeJobHunterAIPA_AIMCF) (same repo as 5) | [LinkedIn](https://linkedin.com/in/elenarevicheva), [Instagram](https://instagram.com/elena_revicheva) | systemd | `vibejobhunter-web` | `http://127.0.0.1:8080/health` (FastAPI: CTO `/api/tech-update`, `/health`) |
| 7 | **OpenClaw Vibejob Shortlist** | [openclaw-vibejob-shortlist](https://github.com/ElenaRevicheva/openclaw-vibejob-shortlist) | [t.me/OpenClaw_VibeJobsList_bot](https://t.me/OpenClaw_VibeJobsList_bot) | systemd | `openclaw-gateway` | `http://127.0.0.1:18789/` |
| 8 | **Tech Co-Founder (CTO AIPA)** | [AIPA_AITCF](https://github.com/ElenaRevicheva/AIPA_AITCF) | [t.me/aitcf_aideazz_bot](https://t.me/aitcf_aideazz_bot) | PM2 | `cto-aipa` | `http://127.0.0.1:3000/` |
| 9 | **Creative Co-Founder Atuona** | [AIPA_AITCF](https://github.com/ElenaRevicheva/AIPA_AITCF) (same repo as 8) | [@Atuona_AI_CCF_AIdeazz_bot](https://t.me/Atuona_AI_CCF_AIdeazz_bot) | PM2 (same process as 8) | `cto-aipa` | `http://127.0.0.1:3000/` |
| 10 | **AILA** (Adaptive Intelligent Life Assistant) | [AILA](https://github.com/ElenaRevicheva/AILA) | *Not deployed as its own process on Oracle yet* — repo holds architecture, blueprint, Hive integration notes | — | — | — |

**Repos (8):** EspaLuzWhatsApp, EspaLuzFamilybot, EspaLuz_Influencer, dragontrade-agent, VibeJobHunterAIPA_AIMCF, openclaw-vibejob-shortlist, AIPA_AITCF, AILA (8 repos for 10 agents; 8+9 share AIPA_AITCF, 5+6 share VibeJobHunterAIPA_AIMCF).

### Canonical deploy directories on Oracle (`ubuntu@170.9.242.90`)

Each **GitHub repo** has **one** working tree on the VM — **no duplicate clones** for the same product. Agents that share a repo share **one directory** and differ only by **process** (systemd unit or PM2 app name).

| GitHub repo | Deploy path on VM | Agents (#) |
|-------------|-------------------|------------|
| [EspaLuzWhatsApp](https://github.com/ElenaRevicheva/EspaLuzWhatsApp) | `/home/ubuntu/EspaLuzWhatsApp` | 1 |
| [EspaLuzFamilybot](https://github.com/ElenaRevicheva/EspaLuzFamilybot) | `/home/ubuntu/EspaLuzFamilybot` | 2 |
| [EspaLuz_Influencer](https://github.com/ElenaRevicheva/EspaLuz_Influencer) | `/home/ubuntu/EspaLuz_Influencer` | 3 |
| [dragontrade-agent](https://github.com/ElenaRevicheva/dragontrade-agent) | `/home/ubuntu/dragontrade-agent` — if PM2 shows a different cwd, treat that as source of truth | 4 |
| [VibeJobHunterAIPA_AIMCF](https://github.com/ElenaRevicheva/VibeJobHunterAIPA_AIMCF) | `/home/ubuntu/VibeJobHunterAIPA_AIMCF` | 5 + 6 |
| [openclaw-vibejob-shortlist](https://github.com/ElenaRevicheva/openclaw-vibejob-shortlist) | `/home/ubuntu/openclaw-vibejob-shortlist` | 7 |
| [AIPA_AITCF](https://github.com/ElenaRevicheva/AIPA_AITCF) | `/home/ubuntu/cto-aipa` | 8 + 9 |
| [AILA](https://github.com/ElenaRevicheva/AILA) | *not deployed — no canonical path yet* | 10 |

**Same repo, two agents (still one clone):** **#8 + #9** → one checkout **`/home/ubuntu/cto-aipa`**, one PM2 app `cto-aipa`. **#5 + #6** → one checkout **`/home/ubuntu/VibeJobHunterAIPA_AIMCF`**, two units (`vibejobhunter`, `vibejobhunter-web`).

**Wallet / DB (CTO only):** Autonomous DB wallet for CTO AIPA lives under **`/home/ubuntu/cto-aipa/wallet/`** (see §7).

### Canonical local folders + Git remotes (development machine)

This doc is the **single map**: **Oracle VM paths** (above) + **where your authoritative clones live locally** + **which GitHub repo each tracks**. **One clone per repo** — never two working trees with the same `origin` (e.g. do **not** duplicate **VJH** under `ai-cofounders` if `D:\aideazz\VibeJobHunterAIPA_AIMCF` already exists).

| GitHub repo | Canonical local path (Windows) | Notes |
|-------------|----------------------------------|--------|
| [AIPA_AITCF](https://github.com/ElenaRevicheva/AIPA_AITCF) | `D:\aideazz\ai-cofounders\cto-aipa` | Folder name **`cto-aipa`** ≠ repo name — intentional (Cursor/workspace layout). Remote: `ElenaRevicheva/AIPA_AITCF`. |
| [VibeJobHunterAIPA_AIMCF](https://github.com/ElenaRevicheva/VibeJobHunterAIPA_AIMCF) | `D:\aideazz\VibeJobHunterAIPA_AIMCF` | **Authoritative VJH + CMO checkout** — lives under `D:\aideazz\`, not under `ai-cofounders`. |
| [EspaLuzWhatsApp](https://github.com/ElenaRevicheva/EspaLuzWhatsApp) | `D:\aideazz\EspaLuzWhatsApp` | Clone once; matches GitHub repo name. |
| [EspaLuzFamilybot](https://github.com/ElenaRevicheva/EspaLuzFamilybot) | `D:\aideazz\EspaLuzFamilybot` | Same. |
| [EspaLuz_Influencer](https://github.com/ElenaRevicheva/EspaLuz_Influencer) | `D:\aideazz\EspaLuz_Influencer` | Same. |
| [dragontrade-agent](https://github.com/ElenaRevicheva/dragontrade-agent) | `D:\aideazz\dragontrade-agent` | Same. |
| [openclaw-vibejob-shortlist](https://github.com/ElenaRevicheva/openclaw-vibejob-shortlist) | `D:\aideazz\openclaw-vibejob-shortlist` | Same. |
| [AILA](https://github.com/ElenaRevicheva/AILA) | `D:\aideazz\AILA` | Repo-only until deployed on Oracle. |

**Verify anytime:** `git remote -v` should show `ElenaRevicheva/<repo>` — if two folders point at the same remote, delete or repurpose the duplicate spare checkout.

**Canonical doc:** [AIPA_AITCF — `docs/oracle/ORACLE_ALL_PRODUCTS_RESILIENCE.md`](https://github.com/ElenaRevicheva/AIPA_AITCF/blob/main/docs/oracle/ORACLE_ALL_PRODUCTS_RESILIENCE.md) — keep this file in sync across repos that mirror it.

---

**Note on #10:** The [AILA](https://github.com/ElenaRevicheva/AILA) product is listed as the tenth *agent slot* in the canonical inventory (longitudinal personal assistant). There is no separate systemd/PM2 service or health URL until AILA is deployed; add `check_oracle_health.sh` / `oci_keepalive.sh` hooks when a runnable service exists.

**Action:** On the server run `pm2 list` and `systemctl list-units --type=service --all | grep -E 'espaluz|cto|vibe|dragon|algom'` and set the exact service/PM2 names and ports in the health script. Add a simple HTTP health endpoint in any bot that doesn’t have one (e.g. `/health` returning 200) so the cron can detect hangs, not only crashes.

**DragonTrade (Algom Alpha) on Oracle:** PM2 app names are `dragontrade-main`, `dragontrade-dashboard`, `dragontrade-bybit`, `dragontrade-binance`. In the app's `.env` on the server set `COINGECKO_USE_DIRECT_API_ONLY=1` and `COINGECKO_API_KEY=<key>` to avoid crash-loops from CoinGecko MCP (mcp.api.coingecko.com 500/SSE errors). See `docs/DRAGONTRADE_ORACLE_SILENT_DEATH_FIX.md` for the full diagnosis.

---

## Root Causes We Fix

1. **Process crashes** — systemd/PM2 not restarting (or start limit hit).
2. **Process hangs** — process up but not responding (health check detects and restarts).
3. **Oracle reclaiming instance** — free-tier “idle” reclamation (keep-alive).
4. **Not starting after reboot** — services not enabled (ensure `enable` + PM2 startup).
5. **Autonomous DB client misconfiguration (CTO AIPA)** — wrong or stale **wallet**, **`sqlnet.ora`** `WALLET_LOCATION` still pointing at Instant Client’s **`?/network/admin`**, missing **`WALLET_PASSWORD`** for **`ewallet.p12`**, or **ORA-29024** after cert/trust mismatch. Looks like “bots died” because HTTP/Telegram start but DB paths block or time out. *Not caused by Google Places “encoding”* — see [postmortem below](#7-cto-aipa--autonomous-db-april-2026-postmortem).

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

# VibeJob Hunter web + CMO bridge (systemd vibejobhunter-web, port 8080)
HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://127.0.0.1:8080/health 2>/dev/null || echo "000")
if [ "$HTTP" != "200" ]; then
  echo "VibeJobHunter web unhealthy (HTTP $HTTP), restarting vibejobhunter-web + vibejobhunter..."
  sudo systemctl restart vibejobhunter-web vibejobhunter
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
curl -s -o /dev/null --max-time 5 http://127.0.0.1:8080/health || true
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
- [ ] `pm2 list` (all 10 agents: 8+9 = cto-aipa; 5+6 = one app if on Oracle; 4 = dragontrade/algom if PM2; 7 = openclaw-gateway; 10 = AILA when deployed)  
  - [ ] Wait 5 minutes and `tail -50 /var/log/oracle-health.log`

---

## 6. When You Add or Change Agents

- Keep the "All 10 AI Agents" table updated with exact service names and health URLs.
- In `check_oracle_health.sh`: add or uncomment a block for that agent (curl health URL then restart if non-200, or systemctl/pm2 restart if process check only).
- In `oci_keepalive.sh`: add a curl to each agent's health URL so keep-alive touches every service that has HTTP.

---

## 7. CTO AIPA + Autonomous DB — April 2026 postmortem (bots “silent,” ORA-29024 / ORA-28759)

**Context:** Right after **Phase 4c** (Google Places, `/places_ingest`) shipped, CTO AIPA + Atuona (same PM2 app **`cto-aipa`**) showed DB errors, hangs, or unresponsive behavior. **Root cause was not the Places API request encoding.** Places calls Google HTTPS and uses Oracle only for dedup/import; the failure mode was **wallet/TLS client setup** on the VM **combined with** a **`database.ts`** change in the same deploy (pool retry removal, shorter queue timeout), which made outages **more visible**.

**What we fixed**

| Layer | Fix |
|--------|-----|
| **Wallet** | Download **fresh client credentials** from OCI for **`ctoaipadb2025`** → deploy under **`/home/ubuntu/cto-aipa/wallet/`** (flatten nested folders). |
| **`sqlnet.ora`** | Set **`WALLET_LOCATION`** `DIRECTORY` to **`"/home/ubuntu/cto-aipa/wallet"`** (absolute). Default OCI zip often uses **`?/network/admin`**, which does not point at the PM2 wallet directory → **ORA-28759**. Use **LF** line endings. |
| **Secrets** | **`WALLET_PASSWORD`** in **`.env`** (password from wallet download). **`DB_PASSWORD`** is the **database user** password — they differ. Pass **`walletPassword`** into the node-oracledb pool when **`WALLET_PASSWORD`** is set. |
| **Service name** | **`DB_SERVICE_NAME`** must match an alias in **`tnsnames.ora`** (e.g. **`ctoaipadb2025_high`**). |
| **Code** | Restore **ORA-29024** / transient **retry + pool reset** in **`database.ts`**; optional **`TNS_ADMIN`** env override. |
| **Deploy** | **`pm2 restart cto-aipa --update-env`** after **`npm run build`**. |

**Tenancy:** DB may live in **aipa** OCI while the VM is on **aideazz** — that is normal; connectivity is wallet + public ADB endpoint.

**Verify:** **`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/`** → `200`; PM2 logs show **`Connected to Oracle`**; Telegram **`/places_ingest`** completes with **“New targets imported: N”.**

**Full narrative (marketing engine + product context):** [AIDEAZZ_AI_MARKETING_ENGINE_FULL_ROADMAP.md](./AIDEAZZ_AI_MARKETING_ENGINE_FULL_ROADMAP.md#postmortem--april-14-2026-why-it-looked-like-google-api-encoding-broke-oracle-and-how-it-was-fixed).

---

## References

- Plan (EspaLuz-focused): `.cursor/plans/oracle_instance_resilience_d6cfcf8b.plan.md`
- CTO review (WatchdogSec, all products): `docs/oracle/ORACLE_RESILIENCE_PLAN_REVIEW.md`
- Migration/ports: `docs/RAILWAY_TO_ORACLE_MIGRATION.md`
- **CTO AIPA + Places + Oracle (April 2026):** [AIDEAZZ_AI_MARKETING_ENGINE_FULL_ROADMAP.md](./AIDEAZZ_AI_MARKETING_ENGINE_FULL_ROADMAP.md#postmortem--april-14-2026-why-it-looked-like-google-api-encoding-broke-oracle-and-how-it-was-fixed)
- Private infra docs (may not list all products): [aideazz-private-docs / oracle-infrastructure](https://github.com/ElenaRevicheva/aideazz-private-docs/tree/docs/docs/plans/oracle-infrastructure)

---

## Last Verified (April 25, 2026)

| Agent | Status | Notes |
|-------|--------|-------|
| CTO AIPA + Atuona | ✅ Running | Oracle wallet fixed Apr 14. GEO+SEO Marketing Engine Phases 1-5 operational. |
| EspaLuz Telegram | ✅ Running + **2-layer memory live (Apr 25)** | LangChain retrieval + pgvector RAG wired. `espaluz_rag.py` + `espaluz_embeddings` (pgvector, ivfflat, 1536 dims). Confirmed in logs. |
| EspaLuz WhatsApp | ✅ Running + **2-layer memory live (Apr 25)** | LangChain + pgvector RAG wired (`espaluz_rag.py`, two save blocks). PayPal webhook signature verification still disabled — free/paid detection unreliable. Pre-existing `Enhancement error: slice(None, 5, None)` — non-critical. |
| VibeJob Hunter + CMO | ✅ Running (Oracle) | `vibejobhunter` + `vibejobhunter-web`; code at `70ee90a` (Apr 2026). Health: `curl -s http://127.0.0.1:8080/health`. Public `:8080` may be closed; set `CMO_WEBHOOK_URL` on CTO to a reachable URL if CTO must call CMO from outside the VM. |
| AILA | ❌ Not deployed | Repo exists, no code. CTO AIPA serves as interim conductor via `agent_outcomes` table. |

**Critical items needing server verification:**
- `grep ATS_DRY_RUN /home/ubuntu/VibeJobHunterAIPA_AIMCF/.env` — is VJH actually submitting applications or just generating local artifacts?
- EspaLuz PayPal signature verification — still disabled per WIRING_CONDUCTOR_WEEK1 audit.
