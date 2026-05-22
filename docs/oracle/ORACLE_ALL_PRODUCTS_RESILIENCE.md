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

Every agent on this instance **must** have: (1) restart hardening, (2) a health-check (HTTP or process liveness) that restarts if unhealthy, (3) included in OCI keep-alive — **except AWS-only modules** (Sprinter), which use CloudWatch + EventBridge instead.

| # | Name | Repo | Try it / See it | Process manager | Service / PM2 name | Health URL or check | Public web (4everland) | Web repo (`main` deploy) | Local checkout note |
|---|------|------|------------------|------------------|--------------------|----------------------|--------------------------|---------------------------|---------------------|
| 1 | **EspaLuz WhatsApp** | [EspaLuzWhatsApp](https://github.com/ElenaRevicheva/EspaLuzWhatsApp) | [wa.me/50766623757](http://wa.me/50766623757) | systemd | `espaluz-whatsapp` | `http://127.0.0.1:8081/webhook` | — | — | — |
| 2 | **EspaLuz Telegram** | [EspaLuzFamilybot](https://github.com/ElenaRevicheva/EspaLuzFamilybot) | [t.me/EspaLuzFamily_bot](https://t.me/EspaLuzFamily_bot) | systemd | `espaluz-familybot` or TBD | Add `/health` or use `systemctl is-active` | — | — | — |
| 3 | **EspaLuz Influencer** | [EspaLuz_Influencer](https://github.com/ElenaRevicheva/EspaLuz_Influencer) | [t.me/Influencer_EspaLuz_bot](https://t.me/Influencer_EspaLuz_bot) | systemd | `espaluz-influencer` | Confirm port on server; add block in script | — | — | — |
| 4 | **Algom Alpha** | [dragontrade-agent](https://github.com/ElenaRevicheva/dragontrade-agent) | Automated posting on @reviceva | PM2 or systemd | e.g. `dragontrade` or `algom-alpha` | Add HTTP health or process check | — | — | — |
| 5 | **VibeJob Hunter** | [VibeJobHunterAIPA_AIMCF](https://github.com/ElenaRevicheva/VibeJobHunterAIPA_AIMCF) | [t.me/vibejob_hunter_bot](https://t.me/vibejob_hunter_bot) | systemd | `vibejobhunter` | `systemctl is-active vibejobhunter` (autonomous loop; no HTTP) | — | — | — |
| 6 | **AI Marketing Co-Founder (CMO)** | [VibeJobHunterAIPA_AIMCF](https://github.com/ElenaRevicheva/VibeJobHunterAIPA_AIMCF) (same repo as 5) | [LinkedIn](https://linkedin.com/in/elenarevicheva), [Instagram](https://instagram.com/elena_revicheva) | systemd | `vibejobhunter-web` | `http://127.0.0.1:8080/health` (FastAPI: CTO `/api/tech-update`, `/health`) | [aideazz.xyz](https://aideazz.xyz) | [aideazz](https://github.com/ElenaRevicheva/aideazz) | `D:\aideazz\aideazz` |
| 7 | **OpenClaw Vibejob Shortlist** | [openclaw-vibejob-shortlist](https://github.com/ElenaRevicheva/openclaw-vibejob-shortlist) | [t.me/OpenClaw_VibeJobsList_bot](https://t.me/OpenClaw_VibeJobsList_bot) | systemd | `openclaw-gateway` | `http://127.0.0.1:18789/` | — | — | — |
| 8 | **Tech Co-Founder (CTO AIPA)** | [AIPA_AITCF](https://github.com/ElenaRevicheva/AIPA_AITCF) | [t.me/aitcf_aideazz_bot](https://t.me/aitcf_aideazz_bot) | PM2 | `cto-aipa` | `http://127.0.0.1:3000/` | — | — | — |
| 8.1 | **Sprint Briefing (Sprinter)** *(CTO AIPA — AWS)* | [AIPA_AITCF](https://github.com/ElenaRevicheva/AIPA_AITCF) (`src/sprint-briefing/`); packaging workspace `D:\aideazz\SprintBriefingAgent` | Private Telegram (Sprint Briefing audio) | AWS Lambda | `sprint-briefing-agent` | CloudWatch `/aws/lambda/sprint-briefing-agent` · EventBridge schedule `cron(0 13 * * ? *)` (~8:00 America/Panama) | — | — | **Sprinter:** Lambda/SAM workspace — not an Oracle systemd/PM2 process (see [AILA symphony §8.1](https://github.com/ElenaRevicheva/AILA/blob/docs/docs/planning/AILA_SYMPHONY_ANALYSIS.md)) |
| 9 | **Creative Co-Founder Atuona** | [AIPA_AITCF](https://github.com/ElenaRevicheva/AIPA_AITCF) (same repo as 8) | [@Atuona_AI_CCF_AIdeazz_bot](https://t.me/Atuona_AI_CCF_AIdeazz_bot) | PM2 (same process as 8) | `cto-aipa` | `http://127.0.0.1:3000/` | [atuona.xyz](https://atuona.xyz) | [atuona](https://github.com/ElenaRevicheva/atuona) | *No local web checkout — deploy site from GitHub `main` only (4everland)* |
| 10 | **AILA** (Adaptive Intelligent Life Assistant) | [AILA](https://github.com/ElenaRevicheva/AILA) | *Not deployed as its own process on Oracle yet* — repo holds architecture, blueprint, Hive integration notes | — | — | — | — | — | `D:\aideazz\AILA` (planning repo) |

**Repos (8 on Oracle VM):** EspaLuzWhatsApp, EspaLuzFamilybot, EspaLuz_Influencer, dragontrade-agent, VibeJobHunterAIPA_AIMCF, openclaw-vibejob-shortlist, AIPA_AITCF, AILA (8 repos for agents **on the VM**; 8+9 share AIPA_AITCF, 5+6 share VibeJobHunterAIPA_AIMCF). **Sprinter** uses the same **AIPA_AITCF** codebase path plus optional **`D:\aideazz\SprintBriefingAgent`** workspace for AWS packaging — runtime on **AWS Lambda**, not under `/home/ubuntu/` PM2/systemd.

**Public sites:** [aideazz.xyz](https://aideazz.xyz) and [atuona.xyz](https://atuona.xyz) — **4everland** hosting, deploy from GitHub **`main`**. Not Oracle processes; columns above tie each site to its owning agent narrative.

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

**Sprinter (#8.1):** Runs on **AWS Lambda** (`sprint-briefing-agent`), **not** under systemd/PM2 on this VM. Product narrative and architecture match **[AILA — `AILA_SYMPHONY_ANALYSIS.md` §8.1](https://github.com/ElenaRevicheva/AILA/blob/docs/docs/planning/AILA_SYMPHONY_ANALYSIS.md)**. Ship pipeline code from **[AIPA_AITCF](https://github.com/ElenaRevicheva/AIPA_AITCF)** `src/sprint-briefing/`; optional local packaging folder **`D:\aideazz\SprintBriefingAgent`**.

**Wallet / DB (CTO only):** Autonomous DB wallet for CTO AIPA lives under **`/home/ubuntu/cto-aipa/wallet/`** (see §7).

### Canonical local folders + Git remotes (development machine)

> **⚠️ AI ASSISTANT RULE:** This section is the **single source of truth** for all local folder paths and GitHub repos. **Never ask Elena where a repo lives — look here first.** Never create duplicate checkouts. If a path below says "no local checkout", that means no local folder exists — work from GitHub directly.

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
| [AILA](https://github.com/ElenaRevicheva/AILA) | `D:\aideazz\AILA` | Repo-only until deployed on Oracle; symphony inventory source on branch **`docs`**: [`AILA_SYMPHONY_ANALYSIS.md`](https://github.com/ElenaRevicheva/AILA/blob/docs/docs/planning/AILA_SYMPHONY_ANALYSIS.md). |
| [aideazz](https://github.com/ElenaRevicheva/aideazz) | `D:\aideazz\aideazz` | **[aideazz.xyz](https://aideazz.xyz)** — **4everland** hosting, deploy from GitHub **`main`**. Pages: [`/portfolio`](https://aideazz.xyz/portfolio) (AI products portfolio card), [`/pitch.html`](https://aideazz.xyz/pitch.html) (pitch page). i18n content in `src/i18n/locales/en.json` + `es.json`. Static assets / PDFs in `public/`. |
| [atuona](https://github.com/ElenaRevicheva/atuona) | **No local checkout** | **[atuona.xyz](https://atuona.xyz)** — **4everland**, deploy from GitHub `main` **only**. No `D:\aideazz\atuona` folder exists — edit via GitHub or clone fresh if needed. |
| **Sprinter** (Lambda workspace; pairs with AIPA_AITCF) | `D:\aideazz\SprintBriefingAgent` | AWS SAM/Lambda packaging for Sprint Briefing — mirrors **`src/sprint-briefing/`** in AIPA_AITCF (see §8.1 in symphony doc). |

**Verify anytime:** `git remote -v` should show `ElenaRevicheva/<repo>` — if two folders point at the same remote, delete or repurpose the duplicate spare checkout.

#### How CTO AIPA accesses all repos — including private ones

Every repo (public **and** private) is already cloned at the canonical path in the table above. Git credentials are configured on this machine — `git pull` and `git push` work without additional login on all repos.

**Operating rule:** Never clone a fresh copy or create a new folder. Go directly to the canonical local path and work there. Private repos are treated identically to public — same paths, same git operations, no extra steps.

| What you need | Where to go |
|---------------|-------------|
| Any repo file | `cd /d/aideazz/<canonical-path>` (see table above) |
| AILA (private docs branch) | `cd /d/aideazz/AILA` — already on branch `docs` |
| CTO AIPA / Atuona / Sprinter | `D:\aideazz\ai-cofounders\cto-aipa` |
| atuona.xyz site (no local checkout) | Push changes via GitHub directly — no local folder |

If a path says **"no local checkout"** in the table → use GitHub API or browser only, do **not** create a new local clone.

**Cross-links:** Planning inventory — [AILA `AILA_SYMPHONY_ANALYSIS.md`](https://github.com/ElenaRevicheva/AILA/blob/docs/docs/planning/AILA_SYMPHONY_ANALYSIS.md). Ops / health — this file on **[AIPA_AITCF `main`](https://github.com/ElenaRevicheva/AIPA_AITCF/blob/main/docs/oracle/ORACLE_ALL_PRODUCTS_RESILIENCE.md)**.

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

## 8. Sprinter (Sprint Briefing Lambda) — Oracle Wallet & Knowledge Access (April 2026)

**Context:** Sprinter runs as **AWS Lambda** (`sprint-briefing-agent`), not on the Oracle VM. It needs to read voice-note tasks and diary entries from `knowledge_base` in Oracle Autonomous DB to include them in the morning briefing. Two approaches were tried; only the REST proxy works reliably.

### Wallet files (for reference)

Oracle wallet for CTO AIPA lives at **`/home/ubuntu/cto-aipa/wallet/`** on the Oracle VM (9 files):

| File | Purpose |
|------|---------|
| `cwallet.sso` | Auto-login wallet — thick mode only (no password needed). Works on the Oracle VM via Instant Client. |
| `ewallet.p12` | PKCS12 encrypted wallet — thin mode (Lambda). **Requires wallet password.** |
| `ewallet.pem` | PEM-encoded wallet — thin mode (Lambda). **Requires wallet password.** |
| `sqlnet.ora` | Connection config — `WALLET_LOCATION` must point to absolute path (e.g. `/home/ubuntu/cto-aipa/wallet`). |
| `tnsnames.ora` | TNS aliases (e.g. `ctoaipadb2025_high`). |
| Others | `keystore.jks`, `truststore.jks`, `ojdbc.properties`, `README` |

**Critical:** `ewallet.p12` and `ewallet.pem` are encrypted with a wallet password. The server `.env` has `#WALLET_PASSWORD=disabled` — the thick-mode Oracle server uses `cwallet.sso` (auto-login, no password). The wallet password for PKCS12 files is **not stored anywhere** and was never set in `.env`. Do NOT attempt thin-mode from Lambda using these files.

### Why thin-mode from Lambda doesn't work

- Lambda uses **oracledb v6 thin mode** (pure JS, no Instant Client) — requires `ewallet.p12` with a password.
- `cwallet.sso` is thick-mode only and cannot be used in Lambda.
- The wallet password is unknown/lost — attempts to use an empty string or `DB_PASSWORD` both fail with `NJS-505: bad decrypt`.

### Solution: REST proxy endpoint on CTO AIPA server

Lambda calls the Oracle server **directly via HTTPS** instead of connecting to Oracle. The CTO AIPA server already has a working thick-mode Oracle connection (via `cwallet.sso`, no password needed).

**Endpoint:** `GET https://webhook.aideazz.xyz/cto/sprint-knowledge?userIds=<id1>,<id2>`  
**Auth:** `Authorization: Bearer <OUTREACH_SECRET>`  
**Response:** `{ ok: true, context: "### Personal context (Oracle knowledge_base)\nUser ... pending tasks:\n- ..." }`

Returns last 5 diary entries + up to 15 pending tasks per user from `knowledge_base`.

**Lambda env vars required:**

| Var | Value |
|-----|-------|
| `SPRINT_KNOWLEDGE_API_URL` | `https://webhook.aideazz.xyz/cto/sprint-knowledge` |
| `OUTREACH_SECRET` | (see server `.env` — the shared outreach auth secret) |
| `SPRINT_BRIEFING_KNOWLEDGE_USER_IDS` | `5481526862` (Elena's Telegram user ID — **required** so `parseUserIdsEnv()` returns a non-empty array) |

**⚠️ Critical: `SPRINT_BRIEFING_SKIP_ORACLE=1` is set in the Lambda handler code (`src/lambda/sprint-briefing-aws.ts` line 19) to prevent direct Oracle connections from Lambda. The flag must NOT be used to gate the HTTP proxy path.** Fixed May 3, 2026: `SKIP_ORACLE` gate moved inside `knowledge-context.ts` so it only blocks paths 2 & 3 (Oracle direct), leaving path 1 (HTTP proxy) always reachable. Without this fix, voice notes were always missing from the briefing even though they were saved correctly in Oracle.

**Code path:** `src/sprint-briefing/knowledge-context.ts` — checks `SPRINT_KNOWLEDGE_API_URL` first (HTTP proxy), then falls back to `ORACLE_WALLET_S3_BUCKET` (oracle-thin, disabled in practice), then thick-mode pool (server only).

### Row format in `knowledge_base`

Oracle thick mode returns rows as **arrays**, not objects. `getKnowledgeByCategory` returns:

```
row[0] = id (hex string)
row[1] = category  
row[2] = title
row[3] = content
row[4] = status
row[5] = project
row[6] = source  ('voice', 'telegram', etc.)
row[7] = created_at (ISO string)
```

Always use `row[2]` / `row[3]` for title/content in the `/sprint-knowledge` endpoint — NOT `row.title` / `row.TITLE` (those return undefined).

### Voice notes → briefing flow

1. User sends voice message to CTO AIPA Telegram bot
2. Whisper transcribes → `detectPersonalAIIntent` → `handlePersonalAIAction` → `saveKnowledge(userId, 'task'|'diary', title, content, 'pending', ...)`
3. Knowledge saved to Oracle `knowledge_base` with `source='voice'`
4. Next morning: Lambda Sprinter fires (EventBridge `cron(0 13 * * ? *)` = 8AM Panama / UTC-5)
5. Lambda calls `/sprint-knowledge` → gets tasks → includes in briefing prompt → Claude generates script → OpenAI TTS → audio sent to Telegram

---

## References

- Plan (EspaLuz-focused): `.cursor/plans/oracle_instance_resilience_d6cfcf8b.plan.md`
- CTO review (WatchdogSec, all products): `docs/oracle/ORACLE_RESILIENCE_PLAN_REVIEW.md`
- Migration/ports: `docs/RAILWAY_TO_ORACLE_MIGRATION.md`
- **CTO AIPA + Places + Oracle (April 2026):** [AIDEAZZ_AI_MARKETING_ENGINE_FULL_ROADMAP.md](./AIDEAZZ_AI_MARKETING_ENGINE_FULL_ROADMAP.md#postmortem--april-14-2026-why-it-looked-like-google-api-encoding-broke-oracle-and-how-it-was-fixed)
- Private infra docs (may not list all products): [aideazz-private-docs / oracle-infrastructure](https://github.com/ElenaRevicheva/aideazz-private-docs/tree/docs/docs/plans/oracle-infrastructure)
- **Symphony inventory (planning source):** [AILA — `AILA_SYMPHONY_ANALYSIS.md` (`docs` branch)](https://github.com/ElenaRevicheva/AILA/blob/docs/docs/planning/AILA_SYMPHONY_ANALYSIS.md)

---

## Last Verified (May 15, 2026)

| Agent | Status | Notes |
|-------|--------|-------|
| CTO AIPA + Atuona | ✅ Running | **Multi-agent HubSpot hub + BrightData live May 14–15**: `/api/crm-event` unified hub (all agents POST, Bearer OUTREACH_SECRET); `/api/crm-pipeline/setup` + `/api/crm-pipeline/ids`; `src/brightdata-enrich.ts` (NEW — zone `web_unlocker1`, max 10/run, 1 req/s); `src/hubspot-client.ts` additions: `HS_HIRING_PIPELINE_ID`, `HS_HIRING_STAGE_IDS`, `HiringStage`, `createHiringPipeline()`, `pushHiringDealToHubSpot()`. Free-tier hiring pipeline: `[HIRING] {jobTitle} @ {company}`. Oracle env: `BRIGHTDATA_API_TOKEN`, `BRIGHTDATA_ZONE=web_unlocker1`. **HubSpot CRM + multi-source fresh leads engine live May 9**. **X webhook handler live May 10**: receives Follow/DM/Mention/Like events, broadcasts to Telegram, fires auto-follow back. Body parser fixed (express.json verify callback — raw body saved before json() consumes stream). twitter-api-v2 added as dependency. **HubSpot duplicate posting loop fixed May 10** (see §11). Board Trello briefing + task management live May 8–9. CTO→CMO pipeline May 1. |
| EspaLuz Telegram | ✅ Running + **2-layer memory live (Apr 25)** | LangChain retrieval + pgvector RAG wired. `espaluz_rag.py` + `espaluz_embeddings` (pgvector, ivfflat, 1536 dims). Confirmed in logs. |
| EspaLuz WhatsApp | ✅ Running + **2-layer memory live (Apr 25)** | LangChain + pgvector RAG wired (`espaluz_rag.py`, two save blocks). PayPal webhook signature verification still disabled — free/paid detection unreliable. Pre-existing `Enhancement error: slice(None, 5, None)` — non-critical. |
| EspaLuz Influencer | ✅ Running + **CTO milestone posts live (May 1)** | On even calendar days, checks for pending CTO milestone before AI Marketing Engine. If found: generates Instagram caption (zero jargon, HR/founder tone, Groq), posts with `sprinter.jpg` via Make.com → Instagram. Falls through to regular content if no milestone. `cto_milestone_module.py` — additive, never breaks existing schedule. |
| VibeJob Hunter + CMO | ✅ Running (Oracle) + **CTO collab live (May 1)** + **HubSpot CRM push live May 14–15** | `vibejobhunter-web` (port 8080). **NEW: `src/langgraph_pipeline/crm_hub.py`** — after each job application, posts to `/api/crm-event` (pipeline=hiring). Env vars added: `OUTREACH_SECRET`, `CTO_AIPA_WEBHOOK_URL=https://webhook.aideazz.xyz/cto`. `nodes.py` modified to call CRM push after submit. CMO now picks up pending CTO milestones at daily 20:00 Panama post — generates LinkedIn post, then fires dev.to blog crosspost (`blog_publisher.py`, fire-and-forget). `sprinter.jpg` added to image rotation pool. |
| Algom Alpha (dragontrade @reviceva) | ✅ Running (PM2) + **X Activity API full automation live May 10** + **HubSpot CRM push live May 14–15** | **NEW: `pushProspectToCRM()` in `stream-listener.js`** — high-intent keyword matches (`need_cto`, `ai_engineer_hiring`, `crm_pain`, `ai_founder`, `fractional_cto`) POST to `/api/crm-event` → Client Pipeline in HubSpot. Env vars added: `OUTREACH_SECRET`, `CTO_AIPA_WEBHOOK_URL`. Every 5th tweet, `x-tech-updater.js` checks `/api/x-updates` for a pending CTO milestone. **X webhook automation May 10**: Account Activity API subscription active — Follow/DM/Mention/Like events stream to CTO AIPA in real-time → Elena's personal Telegram (@aitcf_aideazz_bot). Auto-follow back: when @reviceva gets a new follower → `v2.follow()` fires instantly. Engagement bot (`engagement-bot.js`): replies to mentions every 45min (max 2/run), auto-follows substantive commenters. Filtered stream (`stream-listener.js`): monitors "fractional CTO", "AI engineer hiring", "HubSpot CRM pain" keywords across all X in real-time → auto-like + follow prospects. **DM auto-reply**: Claude Haiku generates contextual reply — blocked at PPU tier (X API 403, requires Basic $100/mo). Profile events subscribed via X Activity API console: Bio/Pic/Screenname. Credentials: `TWITTER_API_KEY/SECRET/ACCESS_TOKEN/SECRET` in both `/home/ubuntu/dragontrade-agent/.env` AND `/home/ubuntu/cto-aipa/.env`. Elena's correct Twitter user ID: `1563632998863577092`. |
| Sprint Briefing (Sprinter) | ✅ AWS Lambda — **voice notes fixed May 3** | Bug: `SPRINT_BRIEFING_SKIP_ORACLE=1` in Lambda handler was gating the ENTIRE personal-context load (including HTTP proxy). Fix: gate moved to `knowledge-context.ts` paths 2/3 only. `SPRINT_BRIEFING_KNOWLEDGE_USER_IDS=5481526862` confirmed set in Lambda. Code + Lambda bundle redeployed May 3. Voice notes from prior day will appear in next 8AM briefing. See §8 for full architecture. |
| AILA | ❌ Not deployed | Repo exists, no code. CTO AIPA serves as interim conductor via `agent_outcomes` table. |

### CTO AIPA → All Posting Channels Pipeline (live May 1, 2026)

When CTO AIPA ships a meaningful milestone, the following happens automatically — no manual intervention:

| Step | What happens | Where |
|------|-------------|--------|
| 1 | CTO AIPA detects real milestone (commit to monitored repos) | `cto-aipa` PM2, `src/cto-aipa.ts` |
| 2 | Notifies CMO AIPA via `POST http://127.0.0.1:8080/api/tech-update` | Same Oracle VM, localhost |
| 3 | Milestone queued in `pending_tech_updates.json` | `/home/ubuntu/VibeJobHunterAIPA_AIMCF/cto_aipa_updates/` |
| 4 | **LinkedIn** — CMO picks it up at 20:00 Panama, generates post via Claude, sends via Make.com | `linkedin_cmo_v4.py`, `vibejobhunter-web` |
| 5 | **Dev.to only** — blog crosspost fires after LinkedIn, fire-and-forget (Hashnode dropped — paid plan only; NOT in use) | `blog_publisher.py` |
| 6 | **X @reviceva** — dragontrade posts tweet on next 5th-post slot | `x-tech-updater.js`, `dragontrade-main` PM2 |
| 7 | **Instagram** — EspaLuz Influencer uses milestone on next even day at 18:00 Panama (23:00 UTC) | `cto_milestone_module.py`, `espaluz-influencer` systemd |

**Guard: only real milestones post.** Only commits prefixed `feat:`, `launch:`, or `release:` trigger CMO notification. `fix:`, `docs:`, `chore:`, `refactor:` commits are silently skipped — they are internal developer work, not audience-facing announcements. When a milestone does post, the tweet is written in plain language by Claude Haiku (Groq fallback) — no commit syntax, no jargon, no raw technical details.

**Critical items needing server verification:**
- `grep ATS_DRY_RUN /home/ubuntu/VibeJobHunterAIPA_AIMCF/.env` — is VJH actually submitting applications or just generating local artifacts?
- EspaLuz PayPal signature verification — still disabled per WIRING_CONDUCTOR_WEEK1 audit.

---

## 9. HubSpot CRM + Multi-Source Fresh Leads Engine (May 9, 2026)

### What shipped

| File | Role |
|------|------|
| `src/hubspot-client.ts` | HubSpot CRM API v3 wrapper — `upsertContact`, `upsertCompany`, `createDeal`, v4 associations (contact↔company, deal↔contact, deal↔company), `addNoteToContact`, `pushLeadToHubSpot()` full pipeline, `getHubSpotStats()` |
| `src/fresh-leads-ingest.ts` | Multi-source prospecting engine — 3 live sources, pain-point classification via Claude Haiku, dedup vs Oracle, HubSpot push for verified emails only |
| `src/prospect-ingest.ts` | Updated — only pushes to HubSpot if Hunter.io found a real email (not pattern `founder@domain`) |
| `src/lead-triage.ts` | Updated — pushes `client_lead`/`partnership` signals with urgency ≥3 to HubSpot; urgency 4-5 → stage `engaged`, urgency 3 → stage `contacted` |

### Fresh leads sources (all free, no paid API)

| Source | How it works | Volume |
|--------|-------------|--------|
| **Hacker News "Who is Hiring"** | Monthly thread — Algolia API, no key needed. Parses company name, email, website, description from top-level comments. | ~150–250 companies/month |
| **GitHub repo search** | Searches repos tagged `ai-agent`, `automation`, `llm` with contact email in README. GitHub token (free, already have it) for higher rate limits. | ~20–30/run |
| **Product Hunt AI launches** | GraphQL API, personal developer token. Fetches recent AI-category launches, extracts maker name + website. Token: `JqSMu_wrfci5Anxe1RV7QcaJyO9EfIWIw7QBLk305Eg` (env: `PRODUCT_HUNT_TOKEN`, added May 9). | ~30–50/run |

### Filters — real data only
- Pattern emails (`founder@domain.com`) never pushed to HubSpot — company record still created
- Test entries (E2E, demo, fake) skipped entirely
- `/hubspot sync` reports pushed vs skipped counts explicitly

### Telegram commands
| Command | Action |
|---------|--------|
| `/fresh_leads` | HN + GitHub (default, no extra token needed) |
| `/fresh_leads all` | HN + GitHub + Product Hunt |
| `/hubspot` | Live CRM stats (contacts · companies · deals) |
| `/hubspot sync` | Backfill all existing Oracle outreach_targets → HubSpot |

### Cron schedule
- **Tue + Fri 7:00 AM Panama** — automatic fresh leads pull (HN + GitHub)
- After each run: `/triage` classifies new signals → qualified leads auto-push to HubSpot

### HubSpot account
- Account: `aipa@aideazz.xyz`
- Service Key: stored in Oracle `.env` as `HUBSPOT_API_KEY` (pat-na1-… format, never commit in plaintext)
- Scopes: `crm.objects.contacts`, `crm.objects.companies`, `crm.objects.deals` read+write
- Free tier: 1M contacts, unlimited companies/deals, 100 req/10s rate limit

### BrightData Web Unlocker (added May 14–15, 2026)

Oracle `.env` additions:

| Var | Value |
|-----|-------|
| `BRIGHTDATA_API_TOKEN` | `77c17e6d-bb2d-42da-84d5-f300420a1721` |
| `BRIGHTDATA_ZONE` | `web_unlocker1` |

Zone: `web_unlocker1`, $1.50/CPM, 30-day trial active. Max 10 enrichments/run, 1 req/sec throttle. Integrated in `src/brightdata-enrich.ts` → called from `fresh-leads-ingest.ts` after dedup, before Claude pain classification.

### Multi-agent CRM hub (added May 14–15, 2026)

New CTO AIPA endpoints:

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /api/crm-event` | `Bearer OUTREACH_SECRET` | Unified hub — all agents route here; validates, deduplicates, writes to HubSpot, logs to `crm_event_log` |
| `GET /api/crm-pipeline/setup` | `Bearer OUTREACH_SECRET` | Returns free-tier strategy (`[HIRING] {jobTitle} @ {company}` naming, stage map) |
| `GET /api/crm-pipeline/ids` | `Bearer OUTREACH_SECRET` | Reads existing pipeline IDs from HubSpot |

VJH + Algom Alpha env vars added: `OUTREACH_SECRET`, `CTO_AIPA_WEBHOOK_URL=https://webhook.aideazz.xyz/cto`.

---

## 10. Board Briefing + Task Management (May 8–9, 2026)

| Feature | File | What it does |
|---------|------|-------------|
| Daily Trello briefing | `src/board-briefing.ts` | Every morning (13:00 UTC = 8AM Panama): fetches Kira* + VibeJob boards, categorises cards (overdue/today/dueSoon/dueWeek/undated), Claude Haiku generates one actionable suggestion. Sent as a separate Telegram message after Sprinter. |
| Weekly Trello digest | `src/board-briefing.ts` | Every Monday 9AM Panama: full board snapshot + Claude Haiku insight paragraph (patterns, bottlenecks, what to tackle first). |
| `/done N` | `telegram-bot.ts` | Delete task(s) by number from `/tasks` list. `/done 1,4,7` removes three at once. |
| `/cleartasks auto` | `telegram-bot.ts` | Claude reads all tasks, identifies stale ones, proposes a list to delete. |
| `/cleartasks confirm N,M` | `telegram-bot.ts` | Executes Claude's suggestion. |

---

## 11. X Full Automation + HubSpot Duplicate Loop Fix (May 10, 2026)

### X Webhook & Automation — What Shipped

| Component | File | Status |
|-----------|------|--------|
| Account Activity API subscription | Script: `POST /2/account_activity/webhooks/{id}/subscriptions/all` (OAuth 1.0a) | ✅ Active — Follow/DM/Mention/Like stream to CTO AIPA webhook |
| Webhook body parser fix | `src/cto-aipa.ts` — `express.json({ verify: (req,_,buf) => { req.rawBody=buf } })` | ✅ HMAC signature verification working — was failing because global `express.json()` consumed body stream before route-level `express.raw()` could capture it |
| Auto-follow back | `src/cto-aipa.ts` — `client.v2.follow('1563632998863577092', userId)` | ✅ Live on PPU tier — fires instantly on every new follower event |
| Telegram follow alerts | `src/cto-aipa.ts` | ✅ Follow/Mention/Like events previewed in Elena's Telegram (`@aitcf_aideazz_bot`) |
| DM auto-reply | — | ❌ Blocked at PPU tier (X API 403 on both v1 + v2 endpoints). Requires Basic tier ($100/mo). Elena handles DMs manually in X inbox; Telegram previews DM text so she knows when to check. |
| Filtered stream | `dragontrade-agent/stream-listener.js` | ✅ App-Only Bearer token (OAuth 2.0 `client_credentials` grant) — separate from OAuth 1.0a. 5 keyword rules: `fractional_cto`, `need_cto`, `ai_engineer_hiring`, `crm_pain`, `ai_founder`. Auto-like + auto-follow prospects. |
| Stream retry loop | `dragontrade-agent/index.js` | ✅ 5-attempt retry with 90s delay — handles X "subscription provisioning" delay on first connect |
| Engagement bot | `dragontrade-agent/engagement-bot.js` | ✅ Runs every 45min — max 2 replies + 3 follows per run. State in `engagement_state.json`. |
| Elena's correct Twitter user ID | All files | ✅ `1563632998863577092` — confirmed via `client.v2.me()`. Was incorrectly `30551469` in prior versions. |

**Credentials location:** `TWITTER_API_KEY/SECRET/ACCESS_TOKEN/SECRET/BEARER_TOKEN` in **both** `/home/ubuntu/dragontrade-agent/.env` AND `/home/ubuntu/cto-aipa/.env`.

---

### HubSpot Duplicate Posting Loop — Root Cause & Fix

**Symptom:** Same tweet posted twice, ~6 minutes apart. HubSpot milestone items kept reappearing as "pending" on every `x-tech-updater.js` cycle.

**Root causes (three compounding issues):**

| # | Bug | Detail |
|---|-----|--------|
| 1 | **Field name mismatch** | JSON file used `"posted": true` (written by legacy path). GET `/api/x-updates` filtered on `"posted_x"` only → items with only `posted=true` passed the filter every cycle. |
| 2 | **Timestamp field mismatch** | Mark endpoint matched on `repo + timestamp`. Old HubSpot items had no `timestamp` field — only `received_at`. Match always failed → `posted_x` never set → items stayed "pending" forever. |
| 3 | **5 backlog items with no `posted_x`** | Already-posted items accumulated `posted: true` but never got `posted_x: true`. Backfill needed. |

**Fixes applied — `VibeJobHunterAIPA_AIMCF/src/api/app.py`:**

```python
# GET /api/x-updates — now excludes BOTH fields
pending = [u for u in updates if not u.get("posted_x", False) and not u.get("posted", False)]

# POST /api/x-updates/mark — 3-tier matching
for u in updates:
    ts_match = (u.get("timestamp") == ts) or (u.get("received_at") == ts)
    repo_match = u.get("repo") == repo or repo in u.get("repo", "")
    already = u.get("posted_x") or u.get("posted")
    if repo_match and ts_match and not already:
        u["posted_x"] = True
        u["posted_x_at"] = datetime.utcnow().isoformat() + "Z"
        marked = True; break
# Fallback: match by title if timestamp matching fails
if not marked and body.get("title"):
    for u in updates:
        if u.get("title") == title and not u.get("posted_x") and not u.get("posted"):
            u["posted_x"] = True; marked = True; break
```

**Fix in `x-tech-updater.js`** (both dragontrade-agent + VibeJobHunterAIPA_AIMCF copies): mark body now sends `title` field alongside `repo` and `timestamp`, enabling fallback matching.

**Backfill:** 5 items in `pending_tech_updates.json` that had `posted: true` but no `posted_x` were manually set to `posted_x: true`.

**Verified state after fix:**
```json
{"ok": true, "pending": [], "total": 0, "held": true}
```
All 4 HubSpot items: `posted_x=True AND posted=True`. Queue clean. Future milestone items (tasks/trello/voice features) will post cleanly — one per 5th-tweet cycle, no duplicates.

---

## 12. Blog Publishing Pipeline (May 2026)

### What fires and where

| Channel | Status | Notes |
|---------|--------|-------|
| **Dev.to** | ✅ Active | Primary blog channel — all posts published here via `DEVTO_API_KEY` |
| **aideazz.xyz/blog** | ✅ Active | Auto-populated from Dev.to crosspost via existing sync mechanism |
| **Hashnode** | ❌ NOT IN USE | Dropped — paid plan only. `HASHNODE_ACCESS_TOKEN` is NOT set in `.env` |

> **Important:** The source file is `src/hashnode-daily.ts` — **misleading name**. It runs in Dev.to-only mode whenever `HASHNODE_ACCESS_TOKEN` is absent from env. Do not rename without a full audit; the PM2 config references this file directly.

### Source file

`/home/ubuntu/cto-aipa/src/hashnode-daily.ts`

When `HASHNODE_ACCESS_TOKEN` is not set → Dev.to-only mode (calls `publishToDevTo()` only, skips `publishToHashnode()`).

### PM2 process

| Process | Script | Schedule |
|---------|--------|---------|
| `cto-aipa` | `dist/cto-aipa.js` | Runs blog generation on schedule (daily) |

Logs: `pm2 logs cto-aipa --lines 200 | grep -i blog`

### GSC integration

| Env var | Value |
|---------|-------|
| `GOOGLE_ANALYTICS_CREDENTIALS` | JSON string — service account key from GCP project `vaulted-circle-368018` |
| `GSC_SITE_URL` | `sc-domain:aideazz.xyz` |

Function: `fetchGscTopQueries()` in `src/gsc-client.ts` — returns top search queries to inform blog topic selection.
Service account added to GSC property as `siteFullUser` (verified May 16 2026).

### GA4 integration

| Env var | Value |
|---------|-------|
| `GOOGLE_ANALYTICS_CREDENTIALS` | Same service account JSON as GSC (reused) |
| `GA4_PROPERTY_ID` | `515154124` |

GCP property: `vaulted-circle-368018` ("My First Project"). Service account added as Viewer in GA4 (verified May 16 2026).
Analytics Data API enabled. Returns 30-day traffic data (e.g. 1151 homepage views, 172 portfolio views).

### VJH CMO crosspost

`blog_publisher.py` in `VibeJobHunterAIPA_AIMCF/` — fire-and-forget Dev.to crosspost after LinkedIn posts.
Called from `linkedin_cmo.py` via the `POST /api/crm-event` hub endpoint.

### Env vars summary

| Var | Required | Purpose |
|-----|----------|---------|
| `DEVTO_API_KEY` | ✅ Yes | Publishes to Dev.to |
| `HASHNODE_ACCESS_TOKEN` | ❌ Not set | Leave unset — Hashnode is dropped |
| `GOOGLE_ANALYTICS_CREDENTIALS` | ✅ Yes | GSC + GA4 auth (same service account) |
| `GSC_SITE_URL` | ✅ Yes | `sc-domain:aideazz.xyz` |
| `GA4_PROPERTY_ID` | ✅ Yes | `515154124` |


## 13. HubSpot Income Dashboard + BrightData Full Wiring (May 14–16, 2026)

### What shipped

All agents now feed HubSpot as a unified income dashboard. Three deal types in one pipeline (free tier), separated by name prefix:

| Prefix | Source agents | HubSpot stage on arrival |
|--------|--------------|--------------------------|
| `[HIRING]` | VJH LangGraph after each application | Appointment Scheduled (= Applied) |
| `[CLIENT]` | SEO inquiry form, Algom Alpha X stream, EspaLuz Influencer (marketing days) | Appointment Scheduled (= Prospected) |
| `[ESPALUZ]` | EspaLuz WhatsApp `user_trial_system.py`, EspaLuz Telegram `espaluz_database.py`, EspaLuz Influencer (EspaLuz days) | Appointment Scheduled (= Trial Started) |

Stage progression mapping (free-tier stage names → real meaning):
- Appointment Scheduled = Applied / Prospected / Trial Started
- Qualified to Buy = Recruiter Responded / Contacted / Trial Active
- Presentation Scheduled = Interview / Demo Call / Personal Outreach Sent
- Decision Maker Bought In = Offer / Proposal / Payment Link Sent
- Contract Sent = Negotiating
- Closed Won / Closed Lost = final outcomes

### /api/crm-event hub (CTO AIPA)

Single POST endpoint all agents call. Auth: `Bearer OUTREACH_SECRET`.

```
POST https://webhook.aideazz.xyz/cto/api/crm-event
Body: { source, type, pipeline: "hiring"|"client", stage?, email?, domain?,
        name?, context?, jobTitle?, company?, recruiterEmail?, jobUrl?, score?, urgency?, notes? }
```

Logs to Oracle `agent_outcomes` table. Routes to `pushHiringDealToHubSpot()` or `pushLeadToHubSpot()` based on pipeline. Non-fatal — 500 from HubSpot never breaks caller.

### BrightData enrichment layers (brightdata-enrich.ts)

Zone: `web_unlocker1` | Token: `BRIGHTDATA_API_TOKEN` | Cost: ~$1.50/CPM (web_unlocker)

| Function | What it fetches | When triggered |
|----------|----------------|----------------|
| `enrichLeadWebsite(url)` | Company homepage → founders, tech stack, team size, funding signal | Algom Alpha CLIENT deals with a domain |
| `enrichLinkedInCompany(url)` | `linkedin.com/company/{slug}` → employee range, type, HQ, founded, recent open roles | CLIENT deals where context contains a LI company URL |
| `enrichCrunchbase(slug)` | `crunchbase.com/organization/{slug}` → total funding, last round, investors | CLIENT deals where context contains a CB org URL |
| `enrichCompanyFull({websiteUrl, linkedinUrl, crunchbaseSlug})` | All three in parallel, non-fatal per source | Auto-triggered in /api/crm-event for CLIENT pipeline |
| `bdFetch(url)` | Any URL via BrightData Web Unlocker (raw HTML) | Base primitive for all above |

All results appended to HubSpot deal notes as structured sections (`--- LinkedIn ---`, `--- Crunchbase ---`).

### VJH → HubSpot wiring (crm_hub.py)

File: `src/langgraph_pipeline/crm_hub.py`

```python
push_application_to_crm(job_title, company, job_url, recruiter_email, stage, score)
```

Called from `nodes.py` after every LangGraph application. POSTs to `/api/crm-event` with `pipeline=hiring`. Deal notes include score and apply URL. `human_pending` jobs get a `⚠️ NEEDS MANUAL APPLY` note.

### BrightData LinkedIn Jobs (VJH job_monitor.py)

Method: `_search_brightdata_linkedin()` — added to secondary sources pool, 60s timeout.

- Queries 3 LinkedIn search URLs (founding AI engineer, fractional CTO, AI automation engineer)
- URL: `linkedin.com/jobs/search/?keywords=...&location=Worldwide&f_WT=2&f_JT=F&f_TPR=r86400`
- Returns ~120 jobs per cycle from LinkedIn SSR HTML (confirmed working May 16)
- Enriches top 5 gate-passing candidates with individual job page fetch → salary, applicant count, seniority level
- Env: `BRIGHTDATA_API_TOKEN`, `BRIGHTDATA_ZONE` added to VJH `.env`

### Gate additions (job_gate.py)

Two new gates added May 16:

```python
# Gate 4.1 — applicant count (from BrightData LinkedIn enrichment)
if applicant_count > 200: return False  # too crowded for cold apply

# Gate 4.2 — LinkedIn seniority field (catches what title regex misses)
BLOCKED_SENIORITY = {"director", "executive", "c-suite", "vp", "not applicable"}
if seniority_level in BLOCKED_SENIORITY: return False
```

### Eval harness (VJH evals/)

Fixed May 16:
- Layer 4 LLM judge: model updated `claude-3-haiku-20240307` (404) → `claude-haiku-4-5-20251001`
- `test_full_pipeline.py`: `SCORER_GOLDEN_SET` (scorer cases) split from `GATE_ONLY_CASES` (gate cases)
- New `test_gate_blocks_excluded_title` test validates gate on VP/Director titles
- Golden set updated: 20 scorer cases + 2 gate-only cases (v4_002 VP Eng, v4_004 Dir Eng)
- **129/129 passing**, ~$0.03/run, ~76 seconds

### aipa@aideazz.xyz email — status

SMTP: `smtp.zoho.com:587` ✅ authenticated  
IMAP: `imappro.zoho.com:993` ✅ authenticated (403 messages in inbox)  
Response detector: `src/autonomous/response_detector.py` — scans inbox every VJH cycle for recruiter replies, alerts via Telegram with `🔥🔥🔥 INTERVIEW REQUEST DETECTED`

### EspaLuz bots → HubSpot wiring

`EspaLuzWhatsApp/user_trial_system.py` — `start_trial()` PostgreSQL path: after `conn.commit()`, fires `threading.Thread` to POST `[ESPALUZ] WA {phone} — trial day 1` to `/api/crm-event`.

`EspaLuzFamilybot/espaluz_database.py` — same pattern, `[ESPALUZ] TG {user_id} — {N}d trial`.

`EspaLuz_Influencer/main.py` — `send_automated_daily_promo()`: after Make.com webhook, fires CRM signal. EspaLuz days → `[ESPALUZ] Influencer post — YYYY-MM-DD`. Marketing engine days → `[CLIENT] AIdeazz tech content — YYYY-MM-DD`.

### Commits (May 14–16, 2026)

| Repo | Commit | Description |
|------|--------|-------------|
| cto-aipa | `e66a1f0` | SEO inquiry form → HubSpot [CLIENT] |
| cto-aipa | `f32d315` | BrightData LinkedIn + Crunchbase enrichment |
| VibeJobHunterAIPA_AIMCF | `9b214e1` | Gate VP/Director/Manager + crm_hub score field |
| VibeJobHunterAIPA_AIMCF | `150ec07` | Eval harness: LLM judge model fix + golden set v4 |
| VibeJobHunterAIPA_AIMCF | `0c1151a` | test_full_pipeline: gate-only cases split |
| VibeJobHunterAIPA_AIMCF | `92e3eba` | BrightData LinkedIn Jobs source + gate 4.1/4.2 |
| VibeJobHunterAIPA_AIMCF | `b33f7d1` | Fix LinkedIn URL (SSR search page, not guest API) |
| VibeJobHunterAIPA_AIMCF | `ec4e072` | Fix nodes.py f-string syntax error (was killing pipeline) |
| EspaLuzWhatsApp | `887f419` | Trial start → HubSpot [ESPALUZ] |
| EspaLuzFamilybot | `80be496` | Trial start → HubSpot [ESPALUZ] |
| EspaLuz_Influencer | `d1534d9` | Daily posts → HubSpot CRM signal |


---

## 🆕 May 20 2026 — HubSpot prefix architecture + Sprinter voice fix + xAI key in env

### HubSpot dealname prefix system (deployed May 20 2026)

Every HubSpot deal is now stamped with a `[STREAM-AGENT]` prefix so the dashboard is scannable by source. Helper functions live in:

- `/home/ubuntu/cto-aipa/src/hubspot-client.ts` — `pushHiringDealToHubSpot` and `pushLeadToHubSpot` both accept `sourcePrefix?: string`. When set, dealname is wrapped as `[<sourcePrefix>] <baseName>`.
- `/home/ubuntu/cto-aipa/src/cto-aipa.ts` — `/api/crm-event` endpoint destructures `sourcePrefix` from body and passes through to the right helper.

Active prefixes (full reference: `docs/HUBSPOT_NAMING.md`):

| Prefix | Writer | Pipeline |
|--------|--------|----------|
| `[HIRING-VJH]` | `crm_hub.py` (VJH) | HIRING |
| `[HIRING-VJH-SERP]` | `serpapi_jobs_ingest.py` (VJH) | HIRING |
| `[CLIENT-CTO-INGEST]` | `fresh-leads-ingest.ts` + `lead-triage.ts` (CTO) | CLIENT |
| `[CLIENT-CTO-SERP]` | `serpapi-prospects.ts` (CTO) | CLIENT |
| `[CLIENT-ALGOM]` | `algom-poll.js` + `stream-listener.js` (dragontrade) | CLIENT |

Backwards compatible: callers without `sourcePrefix` keep legacy naming. New writers MUST set `sourcePrefix` — pick from the table or add a new reserved prefix.

**Smoke test (verifies end-to-end):**
```bash
S=$(grep '^OUTREACH_SECRET=' /home/ubuntu/cto-aipa/.env | cut -d= -f2-)
curl -s -X POST https://webhook.aideazz.xyz/cto/api/crm-event \
  -H "Authorization: Bearer $S" -H 'Content-Type: application/json' \
  -d '{"source":"smoke","type":"application","pipeline":"hiring","sourcePrefix":"TEST","jobTitle":"x","company":"y","domain":"z.io","jobUrl":"https://z","stage":"applied"}'
# Then DELETE the resulting deal+company via /crm/v3/objects/{deals,companies}/{id}
```

### Sprinter voice-knowledge fix (deployed May 20 2026)

The Telegram voice handler in `telegram-bot.ts` previously created Trello cards from voice notes but never persisted them to Oracle `knowledge_base`. The Lambda morning briefing therefore had zero voice context. Fixed in two places:

1. `src/telegram-bot.ts`: both Trello return paths (`processMultiAction` and `createTrelloCardFromTranscript`) now call `saveKnowledge(userId, 'voice_note', ...)` before returning.
2. `src/cto-aipa.ts`: `/sprint-knowledge` endpoint now fetches `getKnowledgeByCategory(uid, 'voice_note', 10)` alongside existing `diary` and `task` queries, and renders them under "recent voice notes" in the Lambda context.

### XAI_API_KEY env requirement (added May 20 2026)

xAI team key for `rhino-sneezing-lemon` (X account `1910676161845186560`) is now in env on both:

- `/home/ubuntu/cto-aipa/.env` — `XAI_API_KEY`, `XAI_TEAM_NAME`, `XAI_TEAM_X_ACCOUNT_ID`
- `/home/ubuntu/dragontrade-agent/.env` — same 3 keys

**Status:** key available in env, **not yet wired to any code**. Three pending wiring options (each its own session): (1) Algom backup Twitter listener with higher rate limits, (2) Grok-as-LLM in CTO AIPA model routing, (3) xAI team-level X API access.

**Security note:** key was shared in chat on May 20 2026; rotate before production use.


---

## NEW May 22 2026 - Blog SEO fix (per-article static HTML pages)

### Root cause confirmed by audit

aideazz.xyz blog URLs were all serving identical generic SPA shell HTML to Google. All 30+ articles looked like duplicate content - zero organic discovery. The previous sitemap fix (commit 8c65f07) was correct, but the URLs it pointed to had no per-article content.

### What changed (2 commits across 2 repos)

**cto-aipa commit 8984a02:**
- NEW file src/blog-static-pages.ts - reads data/blog-posts-cache.json, renders markdown to HTML inline (no new npm deps), generates per-article static HTML with article-specific title/OG tags/JSON-LD/article body, pushes to ElenaRevicheva/aideazz/public/blog/SLUG/index.html via GitHub Contents API.
- RENAMED src/hashnode-daily.ts to src/daily-blog-publisher.ts (file name now matches function; Hashnode was already removed in b30c334).
- WIRED into the renamed file alongside pushSitemapToGithub (fire-and-forget; auto-fires after every blog publish).
- 14 cached articles backfilled (one-shot run).

**aideazz commit e4fe4ee:**
- 1-line additive rule in public/_redirects: `/blog/:slug    /blog/:slug/index.html    200`
- Inserted ABOVE the SPA catch-all so /blog/SLUG (no trailing slash) serves the static HTML.
- All other existing rules preserved.

### Verification (live)

```bash
curl -s 'https://aideazz.xyz/blog/what-a-fractional-cto-actually-does-for-ai-startups' | grep -oE '<title>[^<]+</title>'
# Returns: <title>What a Fractional CTO Actually Does for AI Startups | AIdeazz</title>
```

Was: `<title>AIdeazz - AI Personal Assistants That Evolve With You</title>` (generic).
Now: article-specific title, OG tags, JSON-LD, real article body in HTML.

### Operational notes

- Future articles auto-generate static HTML when daily-blog-publisher cron fires (no manual action)
- If GITHUB_TOKEN expires, BlogStatic logs a warning and skips - daily blog publish still works
- 4everland deploy lag: ~90-180 seconds after GitHub commit
- Google re-crawl + ranking impact: ~1-2 weeks
