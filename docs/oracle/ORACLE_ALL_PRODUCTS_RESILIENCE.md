# Oracle Instance Resilience — All Products (Fix Bots Dying Silently)

**Purpose:** Stop all AI bots on Oracle from silently dying. One plan, one deployment, covers every product on `170.9.242.90`. This file also lists **canonical Git repos**, **Oracle VM directories**, and **authoritative local Windows clones** so nothing is duplicated or misplaced across machines.

**Note:** These details are synced to [aideazz-private-docs / docs/plans/oracle-infrastructure](https://github.com/ElenaRevicheva/aideazz-private-docs/tree/docs/docs/plans/oracle-infrastructure). In this repo, the export lives in `docs/plans/oracle-infrastructure/` (README, OVERVIEW, RESILIENCE). Copy that folder to the private repo’s `docs/plans/oracle-infrastructure/` and push to the `docs` branch. See `docs/plans/oracle-infrastructure/SYNC_TO_PRIVATE_REPO.md`.

---

## 🟢 LLM resilience + VibeJobHunter pipeline (June 23-24 2026)

- **Sprinter (AWS Lambda `sprint-briefing-agent`, us-east-1, EventBridge `cron(0 13 * * ? *)` = 8AM Panama):** narrative + clustering chain is now **Claude → Groq → Gemini → OpenAI `gpt-4o-mini`** (`src/sprint-briefing/synthesize.ts`). It failed to fire June 23 because all of Claude(400 dead)/Groq(429 capped)/Gemini(429 depleted) failed — added OpenAI as the reliable backstop (key already in the Lambda env, 19 vars). **Verified June 24:** force-test logged `OpenAI (gpt-4o-mini) returned 1926 chars → narrative fallback succeeded`, `{"ok":true}`. **Rebuild+deploy:** `npx esbuild src/lambda/sprint-briefing-aws.ts --bundle --platform=node --target=node20 --format=cjs --external:@aws-sdk/signature-v4-crt --external:encoding --outfile=dist-lambda/sprint/lambda-pkg/handler.js` → `py` zipfile (handler.js at zip root) → `node scripts/deploy-lambda.mjs`. **Force-test** = set Lambda env `SPRINT_BRIEFING_FORCE=1`, invoke (boto3, creds in `~/.aws`), then REMOVE the var. Deploy step 4 may transiently `ResourceConflict` ("update in progress") — code still uploaded; retry config update or ignore (it only re-sets an already-set var).
- **Provider reality:** the **Anthropic** key AND the **Gemini** key are OUT OF CREDITS (`400` / `429 prepayment depleted`). Working free/cheap: **Groq** (`llama-3.3-70b-versatile`, free) + **OpenAI** (`gpt-4o-mini`, cheap). Every AI path now falls back: `claude_helper`→Groq; VJH `response_detector` classify→Groq; VJH **LLM judge → OpenAI → Groq**. **Keys are read from each repo's `.env` directly** (bots do NOT export them to `os.environ`, which would otherwise fail-open/degrade). Groq sits behind Cloudflare → **must send a browser `User-Agent`** or it 403s the default urllib UA.
- **Atlas Shifted (`whitespace` PM2, port 8095) — added June 25 2026; performance bridge June 29 2026:** the marketing-angle radar (repo [`atlas-shifted`](https://github.com/ElenaRevicheva/atlas-shifted), Oracle `/home/ubuntu/whitespace`). Most complete LLM chain in the fleet: **Claude → Groq → OpenAI → Grok** (text/JSON, per-process circuit breaker) + **OpenAI `text-embedding-3-small`** for the angle classifier (⚠️ embeddings are **OpenAI-only — no failover**; if OpenAI dies, classification halts). Image: Flux (Replicate) → OpenAI `gpt-image-1`. Video: Runway → **Luma Agents API** (`ray-3.2` i2v fallback). **Jun 29 performance bridge:** Atlas exports **`concept_id` + UTM tags**; CTO AIPA **`POST /cto/api/performance-event`** → Oracle **`atlas_performance_events`**; Atlas UI shows ROAS/CPA/leads when hub wired (`ATLAS_PERFORMANCE_SECRET` = `OUTREACH_SECRET`). Detect→create pipeline **unchanged**. **Gotcha fixed June 25:** a standalone CLI that reads `process.env.*` directly (e.g. `video.ts`) **must `import 'dotenv/config'`** or every key is undefined and providers skip silently (looked like "dry credits"; it wasn't).
- **Fleet LLM failover — UNIVERSAL `Claude → Groq` spine (re-audited in code June 25):** **every** agent falls to **Groq (free `llama-3.3-70b-versatile`)** on Claude 400/credit-exhaustion — EspaLuz Telegram (`main.py` ~L4255), EspaLuz WhatsApp (`espaluz_bridge.py` ~L2880 + `whatsapp_convo_mode.py`), EspaLuz Influencer (`cto_milestone_module.py`), VJH (`claude_helper` / `response_detector` / judge `OpenAI→Groq`), cto-aipa (`claudeWithGroqFallback`, `src/llm-resilience.ts`), Algom, Atlas. **Extended tiers** in higher-volume/critical paths: **Grok (xAI)** in cto-aipa / Algom / Atlas (`XAI_MODEL` default `grok-4.20-0309-non-reasoning`); **OpenAI** in Atlas / Sprinter / VJH-judge; **Gemini** in Sprinter / blog-es. Fullest chain = Atlas (**Claude → Groq → OpenAI → Grok**). **CORRECTION (June 25):** an earlier draft of this note wrongly stated EspaLuz was "Claude + OpenAI only, no Groq/Grok" — that was a grep artifact (matched backup files). EspaLuz has the Claude→Groq fallback; "free grok" = **Groq**, the free Llama provider (not xAI Grok). The fleet is uniformly resilient to a single Anthropic outage.
- **VibeJobHunter (`vibejobhunter` systemd):** honest-LEAD mode — surfaces right-fit (fully-remote · LATAM-open · AI-augmented · no-coding) jobs to Telegram + HubSpot "🔥 I Act TODAY", **capped at 6/cycle** (`VJH_SURFACE_CAP`). Deploy: `cd /home/ubuntu/VibeJobHunterAIPA_AIMCF && git pull && sudo systemctl restart vibejobhunter`. Full chain + the "0-surfacing" bug-chain gotchas: VJH `CLAUDE.md` → "CURRENT PIPELINE". **Dedup stores:** `autonomous_data/seen_jobs.json` (`seen_jobs_v2`) + `vjh_checkpoint.db` — clearing them WITHOUT the surface cap **floods Telegram** (happened June 23; cap added).

---

## Server

| Field     | Value |
|----------|--------|
| **Public IP** | `170.9.242.90` |
| **SSH**  | `ssh -i ~/.ssh/ssh-key-2026-01-07private.key ubuntu@170.9.242.90` |
| **OS**   | Ubuntu 24.04, 12 GB RAM, VM.Standard.E5.Flex |

---

## All 11 AI Agents on Oracle (Canonical List)

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
| 11 | **Atlas Shifted** (Marketing Strategist) | [atlas-shifted](https://github.com/ElenaRevicheva/atlas-shifted) | [live radar](https://webhook.aideazz.xyz/whitespace/atlas.html) | PM2 | `whitespace` (port 8095) | `http://127.0.0.1:8095/healthz` | via `webhook.aideazz.xyz/whitespace/` (nginx → :8095) | — | `D:\aideazz\whitespace` (Oracle `/home/ubuntu/whitespace`; folder ≠ repo). Data backup repo: `atlas-captures` |

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
| [atlas-shifted](https://github.com/ElenaRevicheva/atlas-shifted) | `/home/ubuntu/whitespace` (folder ≠ repo; renamed whitespace→atlas-aipa→atlas-shifted, GitHub redirects) | 11 |

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
| [atlas-shifted](https://github.com/ElenaRevicheva/atlas-shifted) | `D:\aideazz\whitespace` | **Atlas Shifted** marketing-angle radar. Folder **`whitespace`** ≠ repo `atlas-shifted` (renamed whitespace→atlas-aipa→atlas-shifted). Oracle `/home/ubuntu/whitespace`, PM2 `whitespace`:8095. Data time-series backup repo: **`atlas-captures`** (private; daily cron pushes `captures.jsonl`). |

**Verify anytime:** `git remote -v` should show `ElenaRevicheva/<repo>` — if two folders point at the same remote, delete or repurpose the duplicate spare checkout.

#### How CTO AIPA accesses all repos — including private ones

**On your Windows dev machine:** every repo is cloned at the canonical path in the table above. Git credentials are configured locally — `git pull` and `git push` work without additional login.

**On Oracle VM (`170.9.242.90`):** use **HTTPS + `GITHUB_TOKEN`** (PAT in `/home/ubuntu/cto-aipa/.env`). GitHub **deploy keys are one-repo-only** — the atlas key cannot pull private repos like `EspaLuzFamilybot`. Do **not** rely on `https://github.com/...` without credentials (fails with `could not read Username`).

**One-time fix (refresh PAT or after token rotation):**

```bash
# On Oracle VM — pass new PAT once (also updates cto-aipa/.env + ~/.git-credentials):
TOKEN=ghp_YOUR_NEW_PAT bash ~/oracle-fix-git-https-auth.sh

# Or from Windows:
scp -i ~/.ssh/ssh-key-2026-01-07private.key \
  scripts/oracle-resilience/oracle-fix-git-https-auth.sh ubuntu@170.9.242.90:~/
ssh -i ~/.ssh/ssh-key-2026-01-07private.key ubuntu@170.9.242.90 \
  "TOKEN=ghp_YOUR_NEW_PAT bash ~/oracle-fix-git-https-auth.sh"
```

**Verify:** `cd /home/ubuntu/EspaLuzFamilybot && git fetch origin main` (no username prompt).

**EspaLuz deploy note:** runtime JSON (`subscribers.json`, `paguelofacil_payments.json`, trials) may differ from git — prefer `git fetch` + `git checkout origin/main -- <code-files>` for code-only deploys, or stash before pull. See `EspaLuzFamilybot/deploy/BACKUP_AND_ROLLBACK_PAGUELOFACIL_WA.md`.

**Operating rule:** Never clone a fresh copy or create a new folder. Go directly to the canonical local path and work there.

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

## Last Verified (June 16, 2026) — Fleet-wide Claude model-retirement fix

**June 15–16 2026: Anthropic decommissioned the May-2025 model IDs `claude-sonnet-4-20250514` and `claude-opus-4-20250514` (also older `claude-3-5-*`, `claude-3-*`, `claude-2*`, `claude-instant*`).** Every agent hardcoding them got `404 not_found_error` (a *fallback-class* failure — silent until you read logs). Swept the entire fleet; all fixed + deployed + verified live.

| Agent | Status | Fix (commit / change) |
|-------|--------|------------------------|
| **CTO AIPA + Atuona** | ✅ Fixed + running | `claude-opus-4-8` / `claude-sonnet-4-6` / `claude-haiku-4-5-20251001` across all call paths (AIPA_AITCF `10337e1`, `9c453ec`). **Atuona `/create`** got a **Grok (xAI) tier-3 fallback** (`95c359a`) so a Claude credit dip + Groq free-tier cap (429/413) no longer breaks page creation. Atuona film **Phase 2** also shipped (`d6ed8a8`: title cards + on-screen poem text + crossfades). Blog delivery buffer fix (`946e165`). |
| **EspaLuz Telegram** | ✅ Fixed + restarted | `claude-sonnet-4-20250514` → `claude-sonnet-4-5-20250929` in `main.py` ×3 (EspaLuzFamilybot `88a36d0`). systemd `espaluz-familybot` restarted. |
| **EspaLuz WhatsApp** | ✅ Fixed + restarted | same swap in `espaluz_bridge.py` ×2, `main.py`, `whatsapp_convo_mode.py` (EspaLuzWhatsApp `997d5c8`). systemd `espaluz-whatsapp` restarted; live RU→ES translation verified. |
| **VibeJob Hunter + CMO** | ✅ Fixed + restarted | **~22 active call sites** `claude-sonnet-4-20250514` → `claude-sonnet-4-5-20250929` + rebuilt the broken fallback chain in `src/utils/claude_helper.py` (was 4× the SAME dead model → now 4 distinct live models) (VibeJobHunterAIPA_AIMCF `43ebdfd`). systemd `vibejobhunter` + `vibejobhunter-web` restarted (`:8080` HTTP 200). **Was 404ing its whole autonomous apply/message pipeline.** |
| **Algom Alpha** | ✅ Fixed + restarted | 2 calls in `aideazz-content-generator.js` → `claude-sonnet-4-5-20250929` (dragontrade-agent `7447949`). PM2 `dragontrade-main` restarted. |
| **Sprinter (AWS Lambda)** | ✅ Fixed (env override) | Lambda DID fire (EventBridge OK) but synthesis 404'd. `synthesize.ts` reads `process.env.SPRINT_BRIEFING_CLAUDE_MODEL`, which was unset → **set Lambda env `SPRINT_BRIEFING_CLAUDE_MODEL=claude-sonnet-4-6` (no rebuild needed)** via AWS SDK from the dev machine (Oracle has no AWS creds). Force-tested → `{"ok":true}`, briefing delivered. Helper scripts in `scripts/`: `diagnose-lambda.mjs`, `fix-sprinter-model.mjs`, `check-sprinter-logs.mjs`, `deploy-lambda.mjs`. |
| **EspaLuz Influencer** | ✅ Clean | No hardcoded dead model ID — uses Groq/current. |
| **OpenClaw** | ✅ Clean | No hardcoded dead model ID. |

**Current entitled Claude model IDs** (keep these): Opus `claude-opus-4-8` · Sonnet `claude-sonnet-4-6` / `claude-sonnet-4-5-20250929` · Haiku `claude-haiku-4-5-20251001`. **Dead (will 404):** anything `*-20250514`, `claude-3-*`, `claude-2*`, `claude-instant*`, `claude-3-5-haiku-20241022`. Probe a key: `curl https://api.anthropic.com/v1/messages -H "x-api-key: $K" -H "anthropic-version: 2023-06-01" -d '{"model":"<id>","max_tokens":4,"messages":[{"role":"user","content":"hi"}]}'`.

**✅ Resolved (June 19 2026):** Sprinter Lambda `GITHUB_TOKEN` was expired (every `/repos/...` query 401'd, repo section degraded). Refreshed the Lambda env var (`aws lambda update-function-configuration`, us-east-1, function `sprint-briefing-agent`) with the valid Oracle `.env` `GITHUB_TOKEN` (user ElenaRevicheva, `repo` scope, verified 200). Native invoke confirmed: dedup OK, `/sprint-knowledge` proxy OK (4369 chars), Trello OK, **no more GitHub 401**. To refresh again: `GH=<valid-pat> py scripts/update-sprinter-token.py` (merges env, preserves all 18 vars). **Durability — RESOLVED June 19 2026 (commit `e52f6a1`):** the Lambda's narrative gen now carries a free **`gemini-2.5-flash` fallback** in BOTH steps (`clusterSignalsWithGroq` + `writeBriefingNarrative`, `src/sprint-briefing/synthesize.ts`). It was Claude→Groq only — and Anthropic credits are permanently dry, so it effectively rode on Groq alone and died on Groq-capped mornings. Now **Claude → Groq → Gemini**; `GEMINI_API_KEY` added to the Lambda env (19 vars). Rebuild recipe (no committed build script): `npx esbuild src/lambda/sprint-briefing-aws.ts --bundle --platform=node --target=node20 --format=cjs --external:@aws-sdk/signature-v4-crt --external:encoding` → zip the single `handler.js` → `update-function-code` (boto3/`py`; AWS creds in `~/.aws`, no CLI installed). Back up the prior `dist-lambda/sprint/handler-fixed.zip` first. Test-invoke validates the bundle even under quota exhaustion (reaching the Gemini call proves it loaded).

**RULE reinforced (June 16):** edit the **canonical local clone** (paths in the table above) → push to GitHub → deploy on Oracle (EspaLuz/VJH carry runtime-state drift in their repo dirs, so deploy specific code files via `git checkout origin/main -- <file>` or in-place `sed`, never a blind `git pull`). Hotfixing directly on Oracle without committing to git leaves the repo behind the running code.

---

## Last Verified (May 15, 2026)

| Agent | Status | Notes |
|-------|--------|-------|
| CTO AIPA + Atuona | ✅ Running | **Multi-agent HubSpot hub + BrightData live May 14–15**: `/api/crm-event` unified hub (all agents POST, Bearer OUTREACH_SECRET); `/api/crm-pipeline/setup` + `/api/crm-pipeline/ids`; `src/brightdata-enrich.ts` (NEW — zone `web_unlocker1`, max 10/run, 1 req/s); `src/hubspot-client.ts` additions: `HS_HIRING_PIPELINE_ID`, `HS_HIRING_STAGE_IDS`, `HiringStage`, `createHiringPipeline()`, `pushHiringDealToHubSpot()`. Free-tier hiring pipeline: `[HIRING] {jobTitle} @ {company}`. Oracle env: `BRIGHTDATA_API_TOKEN`, `BRIGHTDATA_ZONE=web_unlocker1`. **HubSpot CRM + multi-source fresh leads engine live May 9**. **X webhook handler live May 10**: receives Follow/DM/Mention/Like events, broadcasts to Telegram, fires auto-follow back. Body parser fixed (express.json verify callback — raw body saved before json() consumes stream). twitter-api-v2 added as dependency. **HubSpot duplicate posting loop fixed May 10** (see §11). Board Trello briefing + task management live May 8–9. CTO→CMO pipeline May 1. |
| EspaLuz Telegram | ✅ Running + **2-layer memory live (Apr 25)** | LangChain retrieval + pgvector RAG wired. `espaluz_rag.py` + `espaluz_embeddings` (pgvector, ivfflat, 1536 dims). Confirmed in logs. |
| EspaLuz WhatsApp | ✅ Running + **2-layer memory live (Apr 25)** | LangChain + pgvector RAG wired (`espaluz_rag.py`, two save blocks). PayPal webhook signature verification still disabled — free/paid detection unreliable. Pre-existing `Enhancement error: slice(None, 5, None)` — non-critical. |
| EspaLuz Influencer | ✅ Running + **CTO milestone posts live (May 1)** + **me_01–me_32 rotation fix (Jun 27)** | **Odd** days → EspaLuz tutor images (`image_urls`). **Even** days → AI Marketing Engine **round-robin** through 36 assets (4 legacy PNGs + [32 agent cards](https://github.com/ElenaRevicheva/EspaLuz_Influencer/tree/main/marketing_engine_images)); Groq copy uses `marketing_engine_image_meta.py` focus hints. **CTO milestone** (even days, `sprinter.jpg`) **max once per 7 days** — was blocking every even day when the CMO queue had pending items (Jun logs: 77 milestone vs 23 marketing posts). `content_memory.json` tracks `marketing_image_rotation_index` + `last_milestone_influencer_post`. |
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

### /api/performance-event hub (Atlas ↔ AIdeazz — June 29, 2026)

Sidecar outcome ledger for Atlas creatives. Auth: `Bearer OUTREACH_SECRET` (same secret as CRM hub).

```
POST https://webhook.aideazz.xyz/cto/api/performance-event
Body: { source, concept_id, vertical, angle_id?, metrics: { spend?, clicks?, conversions?, revenue?, sessions?, leads? },
        period_start?, period_end?, notes? }

GET https://webhook.aideazz.xyz/cto/api/atlas-performance?vertical=&concept_id=
```

Writes Oracle **`atlas_performance_events`**. Atlas **`/api/atlas`** reads aggregated totals when `ATLAS_PERFORMANCE_SECRET` is set in `whitespace/.env`. Lead adapter: `~/cto-aipa/scripts/sync-atlas-business-leads.mjs` (ingests `business_leads` where `utm_campaign LIKE 'atlas_%'`).

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


---

## NEW May 24 2026 (evening) — FAQPage schema (AEO) + Groq 413/429 fixes + Remote Control

### FAQPage JSON-LD schema (AEO discoverability)

Was: ARTICLE_SYSTEM prompt required `## Frequently Asked Questions` (3-5 Q&A pairs) and validateArticle gated publication on it. Content was visible to humans as headings + paragraphs, but the static-HTML generator only emitted BlogPosting JSON-LD. Crawlers couldn't recognize the Q&A as discrete answerable entities.

Now: `cto-aipa/src/blog-static-pages.ts` has `extractFaqPairs()` that parses the markdown FAQ section and emits a second `<script type="application/ld+json">` with FAQPage schema. Purely additive — BlogPosting unchanged. Falls back gracefully (no FAQPage emitted) if article lacks the section.

Verified live: every blog URL on aideazz.xyz now serves both BlogPosting + FAQPage JSON-LD blocks. Google AI Overview / Perplexity / Bing Chat now pull from your Q&A as authoritative.

### Groq 413 (request too large) pre-check

Code-review path was sending full PR diffs to Llama 3.3 70B on Groq, exceeding ~8K token context. Returned 413 repeatedly. Fallback to Claude Haiku worked, but warnings flooded logs.

Fix in `cto-aipa.ts`: pre-check `aiPrompt.length > 24_000` chars before calling Groq. If too big, throw a typed pre-check error logged quietly (not warn). Saves ~100 noisy log lines per cycle.

### Groq 429 (rate limit) 60-second cooldown

Free-tier Groq has per-minute rate limits. When 429 hit, fallback worked but next call also tried Groq, also 429'd, etc — log flood.

Fix in `cto-aipa.ts`: module-scope `groqCooldownUntil` timestamp. On 429, set cooldown 60s into future. Pre-check skips Groq during cooldown (1 quiet log per skip). After cooldown expires, retries Groq normally. Genuine unexpected errors (network/auth) still warn loudly.

### Claude Code Remote Control activation (works on Windows)

Successfully activated `claude remote-control` for working from phone while away from laptop. Stack:
- Claude Code v2.1.149 installed via MSIX (Windows Store package, at `C:\\Users\\kirav\\AppData\\Local\\Packages\\Claude_pzs8sxrjxfjjc\\LocalCache\\Roaming\\Claude\\claude-code\\2.1.149\\claude.exe`)
- Auth: `claude auth login --claudeai` (browser OAuth to elena.revicheva2016@gmail.com Pro account)
- TUI requires Windows Terminal (not raw cmd.exe — MSIX symlink + ConPTY issues)
- Workspace trust dialog accepted by running interactive Claude in the worktree path once
- Desktop launcher: `claude-remote.bat` (PowerShell wrapper, auto-finds latest claude.exe version)

Ritual: plug in laptop → double-click `claude-remote.bat` → press `y` + Enter (default spawn mode) → press SPACE for QR → Win+L to lock screen → take phone (Claude app, Code tab, scan QR) → continue work from phone.

Security: phone session has FULL access to SSH/git/HubSpot. If phone lost during away time, come back to laptop, Ctrl+C the terminal window, session dies immediately.

### Operational verification commands

```bash
# FAQ schema live on any article:
curl -s 'https://aideazz.xyz/blog/<slug>/' | python3 -c "import sys,re; html=sys.stdin.read(); print('FAQPage:', 'YES' if 'FAQPage' in html else 'NO')"

# Groq cooldown active:
pm2 logs cto-aipa --nostream --lines 100 | grep -E 'pre-check|429 hit|cooldown'

# Remote control auth + version:
& 'C:\\Users\\kirav\\AppData\\Local\\Packages\\Claude_pzs8sxrjxfjjc\\LocalCache\\Roaming\\Claude\\claude-code\\2.1.149\\claude.exe' auth status
```

### Commits

- `c053548` feat(blog-seo): emit FAQPage JSON-LD schema from article markdown
- `44c26bc` fix(code-review): option-a Groq 60s cooldown after 429 to silence rate-limit noise
- `7d5c01f` fix(code-review): pre-check prompt size before Groq call to avoid 413 noise


### XAI status update — May 25 2026 — Grok wiring complete in dragontrade-agent

The May 20 2026 note above said the `XAI_API_KEY` (rhino-sneezing-lemon
team, X account `1910676161845186560`) was "in env, not yet wired to any
code." That's now superseded for **option (1) Algom backup / Grok routing**:

**Wired in `dragontrade-agent` commit `294efee`** (pushed to origin/main):

- New file `grok-content.js` — minimal xAI Chat Completions wrapper using
  model `grok-4.20-0309-non-reasoning`. Consecutive-failure cutoff at 3
  prevents burning credits on a depleted account; HTTP 402 (credits
  depleted) and 429 (rate limit) raised with specific error messages for
  log triage.
- `index.js` switch: educational posts try Grok first
  (`generateEducationalWithGrok()`), fall back to the 7-month-old CMC
  engine (`this.cmcEngine.generateRealInsight(...)`) on any Grok error.
  `isGrokTemporarilyDisabled()` short-circuits Grok calls after the
  cutoff fires.

**Verification anchors in logs** (`pm2 logs dragontrade-main`):
- Success: `✅ Generated via Grok (xAI)`
- Graceful fallback: `⚠️ Grok failed (...) — falling back to CMC/Claude`
- Cutoff active: `ℹ️ Grok temporarily disabled (consecutive failures) — using CMC/Claude`

**Posting identity unchanged.** The bot still posts from `@reviceva`
(Elena's personal X dev account via existing `TWITTER_API_KEY` /
`TWITTER_ACCESS_TOKEN` in `dragontrade-agent/.env`). The rhino-sneezing-
lemon team account ID `1910676161845186560` is **not** used for posting —
only the team's xAI key is consumed, for the educational slot only.

**Cadence note for future ops.** `POST_INTERVAL_MIN` and
`POST_INTERVAL_MAX` are read from `process.env` first with `'300'`/`'420'`
as fallbacks. `dragontrade-agent/.env` was previously set to `120`/`180`
which silently overrode the new code defaults. Both `.env` and code now
agree on `300`/`420` (≈4 posts/day). If you tweak cadence, update both
or remove the `.env` lines so the code defaults take effect.

**Still pending wiring** for the same xAI key (separate future sessions):
(2) Grok-as-LLM in CTO AIPA model routing,
(3) xAI team-level X API access (would change posting identity — defer
unless brand strategy says otherwise).


### check_oracle_health.sh status update — May 25 2026 — jq fix for dragontrade loop

The dragontrade-* loop in `/home/ubuntu/check_oracle_health.sh` previously
used `pm2 describe "$app" | grep -q "status: online"`. That grep NEVER
matched because pm2's actual output is box-drawing-character formatted
(`│ status │ online │`), not colon-separated. The script wrongly restarted
every dragontrade-* app on EVERY 5-min cron tick for weeks, creating a
silent 5-min crashloop that prevented Algom Alpha's engagement loop from
ever completing a cycle (first run is delayed 5 min after bot startup —
exactly when the cron restart fired).

**Patched live (live state on Oracle VM):**

```bash
# 4. Algom Alpha (dragontrade PM2 apps)
# May 25 2026 FIX: use jq on pm2 jlist. Previous grep "status: online"
# NEVER matched because pm2 describe uses box-drawing chars (no colon).
for app in dragontrade-main dragontrade-dashboard; do
  status=$(pm2 jlist 2>/dev/null | jq -r --arg app "$app" '.[] | select(.name==$app) | .pm2_env.status' 2>/dev/null)
  if [ -z "$status" ]; then
    echo "Algom Alpha / $app (4) MISSING from pm2 list, skipping (deleted or never started)"
  elif [ "$status" != "online" ]; then
    echo "Algom Alpha / $app (4) status=$status, restarting..."
    pm2 restart "$app"
  fi
done
```

Also: `dragontrade-bybit` and `dragontrade-binance` removed from the loop
(both deleted from pm2 via `pm2 delete` + `pm2 save` and commented out of
`dragontrade-agent/ecosystem.config.cjs` — the new 20-post cycle is 0%
paper_trading so they're orphaned).

**Companion fix in cto-aipa:** `src/daily-blog-publisher.ts` now uses
sliding-window mutex + prefix-collision dedup + always-fire Telegram
notification on every outcome. Env knobs:
`HASHNODE_DAILY_MIN_HOURS_BETWEEN_PUBLISHES` (default 12),
`HASHNODE_DAILY_SLUG_PREFIX_LEN` (default 30). Prevents the May 24 issue
where two BrightData articles published 20 min apart with no Telegram
notification.

**Verification anchors in logs:**

- Engagement cycle success: `[Engagement] Done — N replies sent, M new follows` in `pm2 logs dragontrade-main`
- Engagement state file exists at `/home/ubuntu/dragontrade-agent/engagement_state.json`
- Blog publish success: `📰 Article published.` followed by Telegram notify
- Blog publish skipped: `📰 Daily blog SKIPPED: ...` + dedicated skip notify to Telegram

**Lesson rule documented in SKILL.md** (Interview story #5): "Verify from
logs, never claim from config." Before reporting agent behavior, grep
historical logs for the ACTION line (not the SETUP line). If the action
signature count is 0, the behavior isn't happening regardless of config.


### Daily blog publisher — Hashnode->DailyBlog rename (May 25 2026 late-evening)

Internal symbol cleanup: the publisher hasn't written to Hashnode in weeks,
it publishes to Dev.to + aideazz.xyz only. Renamed everything in commit
`1565895` to match reality. Backward compat preserved for all env vars and
HTTP routes.

**Canonical names going forward:**

| Old | New |
|---|---|
| `HASHNODE_DAILY_ENABLED` | `DAILY_BLOG_ENABLED` |
| `HASHNODE_DAILY_CRON` | `DAILY_BLOG_CRON` |
| `HASHNODE_DAILY_TZ` | `DAILY_BLOG_TZ` |
| `HASHNODE_DAILY_TRIGGER_SECRET` | `DAILY_BLOG_TRIGGER_SECRET` |
| `HASHNODE_DAILY_PUBLIC` | `DAILY_BLOG_PUBLIC` |
| `HASHNODE_DAILY_DELISTED` | `DAILY_BLOG_DELISTED` |
| `HASHNODE_DAILY_DEVTO_ONLY` | `DAILY_BLOG_DEVTO_ONLY` |
| `HASHNODE_DAILY_MIN_HOURS_BETWEEN_PUBLISHES` | `DAILY_BLOG_MIN_HOURS_BETWEEN_PUBLISHES` |
| `HASHNODE_DAILY_SLUG_PREFIX_LEN` | `DAILY_BLOG_SLUG_PREFIX_LEN` |
| `HASHNODE_DAILY_RUN_ON_START` | `DAILY_BLOG_RUN_ON_START` |
| `HASHNODE_ARTICLE_MODEL` | `DAILY_BLOG_ARTICLE_MODEL` |
| `HASHNODE_TOPIC_STATE_DIR` | `DAILY_BLOG_TOPIC_STATE_DIR` |
| `TELEGRAM_HASHNODE_NOTIFY_CHAT_ID` | `TELEGRAM_DAILY_BLOG_NOTIFY_CHAT_ID` |

**HTTP routes:**

| Operation | Canonical (new) | Deprecated alias (still works, 307-redirects) |
|---|---|---|
| Status | `GET /blog/daily-status` | `GET /hashnode/daily-status` |
| Manual trigger | `POST /blog/daily-run` | `POST /hashnode/daily-run` |

The deprecation alias responses include an `X-Deprecation:` header indicating
the new canonical path. 307 status preserves the POST method + body, so any
existing webhook with `Authorization: Bearer ...` header continues to work
unchanged through the redirect.

**Out of scope** for this rename (separate future cleanup): `HASHNODE_ACCESS_TOKEN`,
`HASHNODE_HOST`, `HASHNODE_PUBLICATION_ID`, `HASHNODE_SUBDOMAIN` — these belong
to `src/blog-es-bundle.ts`, which uses Hashnode public GraphQL as a vestigial
*source* for legacy Spanish translation cache. Not a publish target.

**Verification anchors:**

- Startup log: `📰 Daily blog: scheduled 30 14 * * * (America/Panama) — mode: Dev.to + aideazz.xyz cross-post — listed: yes`
- Successful publish: `📰 Daily blog published` (Telegram notify text starts with this)
- Failure: `🚨 Daily blog FAILED` (Telegram notify text)
- Skip (mutex): `📰 Daily blog SKIPPED: last publish was N.Nh ago (< 12h cooldown)`


### Outreach bogus-retry-loop fix — May 25 2026 evening (later)

The daily Phase 4 outreach Telegram summary kept showing the same Resend
422 "invalid email" failures every day even after the May 25 morning
isBogusOutreachEmail filter shipped. Root cause: the morning filter ran
only at draft-CREATION time (`generateBatchDrafts`). The actual SEND step
(`sendApprovedDrafts`) iterates `outreach_log` status='draft' and sends
ALL of them without checking — old bogus drafts retried every cron run
forever.

**Three-layer fix in commit `daf757b`:**

| Layer | What | Where |
|---|---|---|
| 1 | `getOutreachDrafts` SQL excludes targets with status='invalid_email'/'archived'/'dismissed' | `src/database.ts` |
| 2 | `sendApprovedDrafts` pre-send check via `isBogusOutreachEmail`; on bogus -> mark target invalid_email + draft rejected_bogus_email | `src/outreach.ts` |
| 3 | `sendApprovedDrafts` on Resend 422 (invalid email format) -> auto-mark target invalid_email + draft rejected_by_resend_422 (so it never retries) | `src/outreach.ts` |

**DB backfill done live**: 1 stuck bogus draft (`leeex1 / katex@0.16.9` — a
npm package version captured as email by the fresh-leads parser) was
marked invalid. Verified: bogus drafts remaining = 0.

**Verification anchors in logs**:
- Pre-send bogus auto-mark: `[outreach] auto-marked bogus draft invalid: <name> / <company> / <email>`
- Resend 422 auto-mark: `[outreach] Resend 422 auto-marked invalid: <name> / <company> / <email>`
- Phase 4 Telegram summary: new line `Auto-marked invalid (bogus or Resend 422): N — won't retry`

**Lesson rule extension** (in SKILL.md): "Verify from logs, never claim
from config" -> extended to "...and for stateful agents, query the actual
DB before claiming the bug isn't fixed (or that it is)." The DB query
showed exactly 1 bogus draft (not 20, not 0), which made the fix surgical
and the backfill trivial.


### Telegram-usefulness refactor — May 25 2026 evening (final)

The 4 daily Telegram messages from CTO AIPA (prospect ingest, AIdeazz inbound,
Lead Brief, Phase 4 outreach) all used to read from Oracle tables that are
now empty / all-archived because real lead activity flows into HubSpot since
May 24 (response_detector + crm-event wiring). Result: technically-correct
but useless "no signals" / "0 new" daily noise.

**Fix shipped in commit `4c40349`:**

- **New helper** `getActionableHubSpotDeals()` in `src/hubspot-client.ts`
  queries HubSpot for deals in stages that mean "needs my attention":
  client `qualifiedtobuy` + `contractsent`; hiring `recruiter_responded` +
  `interview_scheduled` + `offer_received`.
- **Lead Brief** (`src/lead-triage.ts buildDailyBrief`) returns `string | null`;
  null when 0 Oracle signals AND 0 HubSpot actionable. Otherwise renders
  HubSpot deals with stage hints (🔥 act today, 💬 they replied, 🎯 recruiter,
  📅 interview, 🏆 offer) + days-since-modified.
- **Silent-skip** applied to prospect-ingest (0 new), marketing-weekly-digest
  (0 inquiries), outreach Phase 4 (0 actionable activity).

**Verification anchors in logs**:
- `📥 Lead Brief: 0 Oracle signals + 0 HubSpot actionable deals — Telegram SUPPRESSED` (quiet)
- `🔍 Prospect ingestion: 0 new (all N fetched were dupes) — Telegram SUPPRESSED`
- `📣 Weekly marketing digest: 0 inquiries in last 7d — Telegram SUPPRESSED`
- `📧 Phase 4 outreach: quiet cycle (0 actionable signals) — Telegram SUPPRESSED`
- `🎯 [cron] Triage: quiet day (0 Oracle signals + 0 HubSpot actionable) — Telegram SUPPRESSED`

**Required env vars for hiring-stage filtering** (already configured):
- `HUBSPOT_API_KEY`
- `HUBSPOT_HIRING_PIPELINE_ID`
- `HUBSPOT_HIRING_STAGE_RECRUITER_RESPONDED`
- `HUBSPOT_HIRING_STAGE_INTERVIEW_SCHEDULED`
- `HUBSPOT_HIRING_STAGE_OFFER_RECEIVED`

If any hiring-stage env is unset, that stage is silently excluded from the filter (no error).


### Research agent + BrightData operations — May 25 2026 evening (post-final)

CTO AIPA now exposes 3 autonomous research commands powered by Claude
tool-use over BrightData. Implementation: `src/research-agent.ts` (the
loop + tool dispatcher) + `src/brightdata-enrich.ts` (the BD primitives:
`bdFetch`, `bdSerpSearch`, `bdScrapingBrowserFetch`, `bdSmartFetch`).

**Telegram commands** (all gated by `TELEGRAM_AUTHORIZED_USERS`):
- `/research_company <name>` — client prospect mode
- `/research_employer <name>` — hiring target mode
- `/research_competitor <domain>` — SEO/AEO competitor mode

**Env vars required (single set — all 4 BD products share):**
- `BRIGHTDATA_API_TOKEN` (already set since May 14-15)
- `BRIGHTDATA_ZONE` (= `web_unlocker1` since May 14-15)
- `ANTHROPIC_API_KEY` (Claude Sonnet 4.5 for the agent's tool-use)

**Operational characteristics:**
- Loop budget: max 8 BD tool calls per command, 120s timeout
- Returns structured markdown report (sent to Telegram chunked at 4000 char)
- Falls back gracefully on any single BD call failure
- Telegram reply format: `📊 Research: <target> (<mode>) · N BD calls · Ns · model claude-sonnet-4-5`

**Verification anchors in logs:**
- Bot startup: standard initTelegramBot output (no special line)
- Successful run: `🔍 Researching <target> (<mode>) via Bright Data + Claude tool-use loop` then `[BrightData] ...` / `[BD-SERP] ...` lines per tool call
- Errors: `❌ Research agent error: ...`

**MCP Server config for IDE-side use (`.mcp.json` at cto-aipa repo root):**
```json
{
  "mcpServers": {
    "Bright Data": {
      "command": "npx",
      "args": ["@brightdata/mcp"],
      "env": {
        "API_TOKEN": "${BRIGHTDATA_API_TOKEN}",
        "WEB_UNLOCKER_ZONE": "${BRIGHTDATA_ZONE}",
        "GROUPS": "browser,advanced_scraping"
      }
    }
  }
}
```
This gives Claude Code (developer side) direct access to BD tools via MCP
when working in the repo. NOT a production wiring — the production loop
is in `src/research-agent.ts`.

**Audit fix (May 25 post-final, commit `4f786d2`):** `/triage` Telegram
command now guards against `null` return from `buildDailyBrief`. Same
pattern as `/triage_urgent`. Surfaced by the non-destructive change audit.

---

## NEW May 28 2026 — Groq free-fallback on EVERY Anthropic call site (no agent dies on credit exhaustion)

**Operator goal (verbatim):** "all my agents do not silently die — none of their
features and functionalities die or hallucinate when I run out of Anthropic tokens —
let Grok truly work with its fallback."

**Problem.** A resilience audit found the codebase had *some* Groq fallbacks
(reviewCode, lead-triage, sprint-briefing, atuona, dragontrade, daily-blog
generation) but **12 Anthropic call sites had NO fallback** — they threw on the
Anthropic `400 "credit balance is too low"` error and the feature silently died.
That is why, on credit-exhaustion days, `/research_company`, outreach drafts,
prospect enrichment, LinkedIn drafts, and several Telegram commands degraded.

**Canonical helper — `src/llm-resilience.ts` (NEW).** One shared module all call
sites import. Exports:
- `isAnthropicCreditExhaustion(e)` — true only for `400` + `credit`/`balance`/`billing`
  (transient 429/503/529 are NOT treated as exhaustion — those still retry upstream).
- `claudeWithGroqFallback(anthropic, model, maxTokens, system, userPrompt, label)` —
  try Anthropic → on credit exhaustion route to **Groq `llama-3.3-70b-versatile`**
  via the official `groq-sdk` (Cloudflare-safe UA — avoids the urllib 1010 bug).
  Non-credit errors re-throw so existing retry/error handling is unchanged.

**All 12 newly-protected call sites (commit `dbc8b90`):**

| File:fn | Model (primary) | Fallback label |
|---------|-----------------|----------------|
| `cto-aipa.ts` askCTO strategic Q&A | Opus | `cto-aipa/strategic-qa` |
| `lead-triage.ts` urgency≥4 refine | Sonnet | `lead-triage/refine` |
| `trello-voice.ts` card classify | Haiku | `trello-voice/classify` |
| `research-agent.ts` tool loop | Sonnet | Groq single-shot summary on exhaustion mid-loop |
| `daily-blog-publisher.ts` GSC topic picker | Haiku | `daily-blog/topic-picker` |
| `doc-ingest.ts` prospect extract | Haiku | `doc-ingest/extract` |
| `fresh-leads-ingest.ts` pain classify | Haiku | `fresh-leads/pain-classify` |
| `outreach.ts` cold email draft | Sonnet | `outreach/email-draft` (skips retry on exhaustion) |
| `prospect-ingest.ts` pain scoring | Sonnet | `prospect-ingest/classify` (skips retry on exhaustion) |
| `prospect-places.ts` places enrich | Haiku | `prospect-places/pain-classify` |
| `telegram-bot.ts` LinkedIn draft | Haiku | `telegram-bot/linkedin-draft` |
| `trello-kanban.ts` Kanban analysis | Opus | `trello-kanban/analyze` |

`research-agent.ts` is special: its multi-turn Bright Data tool loop can't run on
Groq (no tool API parity), so on credit exhaustion it does a **Groq single-shot
summary** of whatever it gathered so far — returns a usable (if thinner) report
instead of `ok:false`.

**Already-fixed paths (context, not re-touched):**
- VJH `src/utils/claude_helper.py` `call_groq_fallback()` — fixed 2026-05-27
  (urllib→requests + UA; powers resume + cover-letter generation).
- EspaLuz WhatsApp `espaluz_bridge.py:2891` — fixed 2026-05-27 (same Cloudflare 1010 fix).
- `daily-blog-publisher.ts` main article generation — `generateTextWithGroqFallback`
  (commit `84e7486`).

**Verification — isolation test (does NOT touch the live key).**
`scripts/test-llm-resilience.ts` mocks an Anthropic client that throws the exact
`400 credit balance` error, then calls `claudeWithGroqFallback` for every label and
asserts Groq returns a non-empty response. Run on Oracle (where `GROQ_API_KEY` is set):

```bash
ssh oracle-cto-aipa "cd /home/ubuntu/cto-aipa && npx ts-node scripts/test-llm-resilience.ts"
```

**Result on Oracle May 28 2026:** `11 passed, 0 failed` — every path logged
`Anthropic credit exhausted — falling back to Groq llama-3.3-70b-versatile` and
returned real content. Deployed: `git pull` → `npm run build` → `pm2 restart cto-aipa`
(online, build clean, `tsc --noEmit` zero errors).

**Pattern earned:** *"graceful degradation is not resilience — a feature that
silently returns empty when Claude fails never actually ran Groq. Wire the fallback,
then prove it fires with an isolation test."*

---

## NEW May 28 2026 — Buffer GraphQL social distribution (ADDITIVE, parallel to Make.com CMO)

**Goal.** Turn the daily GEO/SEO/AEO blog output into multi-channel social reach with
closed-loop attribution, WITHOUT disturbing the existing CMO path.

**Two parallel social paths now exist (by design):**
1. **VJH CMO → Make.com → Buffer → LinkedIn/IG** (milestone posts) — *unchanged, untouched.*
2. **cto-aipa → Buffer GraphQL API → LinkedIn** (blog-article distribution) — *new this release.*

They are different processes (`vibejobhunter-web` vs `cto-aipa`) posting different content.
Only shared resource is the Buffer account posting queue (handled by graceful skip).

**Buffer API facts (verified live 2026-05-28):**
- Endpoint `https://api.buffer.com`, auth `Authorization: Bearer <BUFFER_API_TOKEN>`.
- Org `6837714cc8be66c3825d0904`. Channels: LinkedIn `68389647d6d25b49a18a0de2`,
  Instagram `68389b15d6d25b49a1d75b8e`, YouTube `68389437d6d25b49a1665d44`, TikTok (LOCKED).
- Mutations: `createPost` (input requires `channelId`, `schedulingType: automatic`,
  `mode: addToQueue|shareNow|shareNext|customScheduled|recommendedTime`, `assets: []`;
  optional `saveToDraft: true`, `dueAt`), `createIdea`, `editPost`, `deletePost`.
- **No analytics query** — attribution is UTM-side, not Buffer-side.

**Code (commits `41808c3` Stage A, `6e306c7` Stage B):**
- `src/buffer-publisher.ts` — standalone module: `bufferGetChannels`, `bufferPostableChannels`,
  `bufferCreatePost`, `bufferCreateIdea`, `generateSocialVariant` (Claude→Groq via
  `claudeWithGroqFallback`), `buildUtmLink`, `distributeArticleToBuffer`, `isBufferSocialEnabled`.
- `scripts/buffer-cli.ts` — manual CLI: `channels | idea | dry | draft | post`.
- `src/daily-blog-publisher.ts` — ONE added fire-and-forget block after `saveBlogPostCache`,
  gated on `BUFFER_SOCIAL_ENABLED`, try-catch wrapped (cannot break the blog cycle).
  Mirrors the existing `blog-static-pages` additive pattern.

**UTM loop (the measurement):** each post carries
`aideazz.xyz/blog/{slug}?utm_source=linkedin&utm_medium=buffer_cmo&utm_campaign={slug}` →
click-through → `/marketing/inquiry` → lead-triage → HubSpot. Wires the pending `[CLIENT-CMO]`
attribution from the UTM side (no LinkedIn API needed).

**Env (gitignored, set local + Oracle):** `BUFFER_API_TOKEN`, `BUFFER_ORG_ID`,
`BUFFER_TARGET_SERVICES=linkedin`, `BUFFER_SOCIAL_ENABLED=true` (live on Oracle).

**Verified on Oracle:** `createIdea` test OK; `channels` lists 4; `dry` generated a real
LinkedIn variant w/ UTM link; `draft` created Buffer draft `6a18a026c50122d5a577c8cc`
(saveToDraft, not published). Build clean, `tsc --noEmit` zero errors, `cto-aipa` online
after restart. Next daily blog cron (14:30 Panama) auto-distributes via `addToQueue`.

**Safety verification command (run anytime):**
```bash
ssh oracle-cto-aipa "cd /home/ubuntu/cto-aipa && npx ts-node scripts/buffer-cli.ts dry"
```

**Pattern earned:** *"a new distribution arm should be a second parallel path, never a
rewrite of the working one — gate it off by default, prove it with draft mode, then flip on."*

---

## NEW May 29-30 2026 — AIdeazz Voice Growth Engine + Podcast (additive, gated, in cto-aipa)

**What it is:** Voice/topic → bilingual omnichannel campaign + an actual auto-publishing podcast.
All additive in the `cto-aipa` (AIPA_AITCF) process; existing agents untouched. Full design +
build history in [[project_voice_growth_engine]] memory + the marketing roadmap doc.

**Telegram commands (in `cto-aipa`, gated by env flags):**
- `/campaign` (reply to a voice note) → Speechmatics transcribe+translate → Claude→Groq atomizer →
  bilingual blog + LinkedIn/IG, UTM-tagged → publish. Flag `VOICE_ENGINE_ENABLED=true`.
- `/podcast` (reply to audio) + `/podcast_ai <topic>` → same + show notes/chapters + **publishes an
  audio episode to the podcast feed**. Flags `PODCAST_ENGINE_ENABLED=true`, `PODCAST_PUBLISH_ENABLED=true`.

**Key files (cto-aipa/src):** `speechmatics.ts` (ASR+translation+diarization), `voice-growth-engine.ts`
(atomizer), `voice-campaign-publish.ts` (blog+Buffer), `podcast-engine.ts` + `podcast-command.ts` +
`podcast-ai-command.ts`, `podcast-feed.ts` (RSS+site+SEO), `podcast-publish.ts` (GitHub-API publish).
CLIs: `scripts/voice-engine-cli.ts`, `scripts/podcast-host-cli.ts` (init|info|reseed).

**External infra (NEW):**
- **Podcast site/repo:** `ElenaRevicheva/aideazz-podcast` (separate repo) → **4everland** → `https://podcast.aideazz.xyz`
  (Cloudflare CNAME `podcast` → ddnsweb3.com, DNS-only). Feed `…/feed.xml`. Episodes commit via GitHub API → 4everland auto-redeploys.
- **Distribution LIVE:** Spotify for Creators (auto-polls feed) + YouTube @AIdeazz podcast (Public, auto-uploads). Apple pending.
- **Fonts:** Figtree TTF installed on Oracle `~/.fonts/Figtree.ttf` (+`fc-cache`) — required for the
  server-rendered cover PNG (sharp/librsvg via fontconfig). If cover reverts to Arial, re-install.

**Env added to `/home/ubuntu/cto-aipa/.env` (gitignored):** `SPEECHMATICS_API_KEY`, `SPEECHMATICS_REGION=eu1`,
`BUFFER_API_TOKEN`, `BUFFER_ORG_ID`, `BUFFER_TARGET_SERVICES`, `BUFFER_SOCIAL_ENABLED`, `VOICE_ENGINE_ENABLED`,
`PODCAST_ENGINE_ENABLED`, `PODCAST_PUBLISH_ENABLED`, `PODCAST_SITE_URL=https://podcast.aideazz.xyz`.
(Rotate Speechmatics + Buffer keys — they appeared in chat during setup.)

**Verify command:** `ssh oracle-cto-aipa "cd /home/ubuntu/cto-aipa && npx ts-node scripts/voice-engine-cli.ts health"`
(Speechmatics auth) and `npx ts-node scripts/podcast-host-cli.ts info`.

**Pattern earned:** *"distribute once, prove each leg from evidence — feed item, Dev.to URL, Buffer
'sent' status, UTM in content, 200 from /marketing/inquiry — never claim propagation from config."*

## NEW June 12 2026 — blog-static deploy semantics fix (`1cc388a`, deployed + verified online)

**Incident:** `aideazz.xyz/blog/0-to-1-transferable-skills` returned a raw IPFS resolution error
("no link named … under bafybei…"). The article's static page WAS committed to the aideazz repo —
but by `src/blog-static-pages.ts` with `[skip ci]`, so 4everland never rebuilt. Every NEW article
404'd on its own URL until an unrelated commit happened to trigger a deploy.

**Fix (cto-aipa `1cc388a`):** `[skip ci]` is appended only when UPDATING an existing page (GitHub
Contents API returned a `sha`). A NEW page commits normally → exactly one deploy per new article.
Bulk-regenerate deploy-storm protection preserved (unchanged files produce no commits at all).

**Deploy:** `git pull` + `npm run build` (tsc clean) + `pm2 restart cto-aipa` on Oracle.
**Verified:** `pm2 jlist | jq -r '.[] | select(.name==$n) | .pm2_env.status'` → `online`,
restart count 11; boot logs show full startup (business_leads ready, scheduled tasks, SerpProspects).

**Rule earned:** *"A new public artifact must trigger its own deploy — the pipeline that creates
something linkable owns making it reachable."*

**Same-day public proof layer refresh (aideazz repo `83fd5df`→`d742a6c`):** SOP EN+ES actualized to
June 2026 (Grok tier-3 failover, Bright Data layer, bilingual blog pipeline, NEW "engagement loop
that never ran" postmortem — this doc's verify-from-logs story is now public); root `favicon.ico`
regenerated from the real AIdeazz logo (multi-size) + crisp 32px/apple-touch icons wired sitewide;
portfolio diagram labels corrected + honest "9 live 24/7" count enforced in 8 places EN+ES.

## NEW June 13 2026 — Atuona Ray-3 swap + operator-selectable video providers (`cbc3a49`, deployed)

**Backup before touching the live creative agent:** tag `atuona-pre-ray3-multiprovider-20260613` +
branch `backup/atuona-pre-multiprovider-20260613` pushed to GitHub. Restore: `git checkout <tag>`.

**Shipped in `src/atuona-creative-ai.ts`:**
- **Luma Ray-2 → Ray-3** (`VIDEO_MODELS.lumaDirect`), env-overridable `LUMA_VIDEO_MODEL`. Ray-3 =
  native 1080p, ~3x cheaper, 16-bit HDR, best-in-class video-to-video. Replicate fallback deliberately
  KEPT on `ray-2-720p` so the fallback never shares a Ray-3 enum/schema surprise.
- **Operator-selectable engine:** `/visualize <provider> NNN` where provider ∈ luma | runway | veo
  (aliases ray3/gen4/google). Explicit provider runs FIRST, then falls back through
  Luma→Replicate→Runway with honest provider labeling on the delivered clip. Bare `/visualize NNN`
  unchanged (default chain).
- **NEW `generateWithVeo`** — Google Veo 3.1 via Gemini API (image→video, native audio), self-contained
  submit+poll, returns ready videoUrl (same delivery path as Luma-via-Replicate). Activates when
  `GEMINI_API_KEY`/`GOOGLE_API_KEY` is set; without it returns clean failure → falls through to the chain.
  **STATUS: wired but UNTESTED — no GEMINI key on Oracle yet; Veo's Gemini response shape needs one live
  confirmation once a key is added (response parse has defensive fallbacks).**
- `tryRunway()` extracted so Runway can run primary OR fallback; call-site direct-URL delivery generalized.

**Deploy:** pull + `npm run build` (tsc clean) + `pm2 restart cto-aipa`. Verified `online` (restart 12),
boot log `🎭 Atuona Creative AI started: @Atuona_AI_CCF_AIdeazz_bot` — clean init, no crash.

**Root cause of the June 12 Atuona failure (same as Algom): billing.** Luma API wallet hit
`{"detail":"Insufficient credits"}` — Direct + Modify (Director's Cut) both 402; Replicate fallback
delivered the base cut. Luma API wallet is SEPARATE from the consumer app: top up at
https://lumalabs.ai/dream-machine/api/billing/overview (not Account→Subscription).

**Fallback truth (answer to "do I fall back to runway/dalle?"):** video falls back Luma→Replicate→Runway
(yes Runway). Images are **Flux-only** (Ultra→Pro→Dev) — **no DALL-E** anywhere in /visualize.

## NEW June 13 2026 — Luma migrated to current API (agents.lumalabs.ai/v1 + ray-3.2), commit `e523b8b`

**Root cause of the "Insufficient credits" / 403 confusion:** Luma runs TWO APIs.
- LEGACY (what Atuona used): `api.lumalabs.ai/dream-machine/v1`, ray-2, old keys — wallet $0, being phased out.
- CURRENT (now migrated to): `https://agents.lumalabs.ai/v1` — console `platform.lumalabs.ai`, per-project
  billing (`proj_…`), `luma-api-` keys, models `ray-3.2` (video) / `uni-1` (image). This is where the
  operator's $8 lives. Billing is per-platform — the old key's wallet ≠ the new $8.

**New-API schema (verified live, gen `fe0de54f…` → completed on the $8):** POST `/generations` requires
top-level **`type:"video"`** + `model:"ray-3.2"` + `keyframes.frame0.{type:image,url}` + resolution/
duration/aspect_ratio. Poll GET `/generations/{id}`; finished URL at **`output[].url`** (legacy was
`assets.video`). `extractLumaVideoUrl` now handles both. Base overridable `LUMA_API_BASE`, model `LUMA_VIDEO_MODEL`.

**Key write gotcha:** the .env key came in 53 chars ending `n` — a stray `\n` literalized into the value.
Real key 52 chars. Fixed in place (`${K%n}` + `tr -d "[:space:]"`); never re-typed the secret.

**Deploy:** pull + build (tsc clean) + `pm2 restart cto-aipa` → online (restart 14), boot log
`🎭 Atuona Creative AI started`. Director's Cut (Modify) still on legacy schema — skips gracefully,
open follow-up. Veo 3.1 needs GEMINI_API_KEY + billing; Runway keyed, needs Runway credits.

## June 13 2026 (cont.) — Director's Cut (Modify Video) working on new Luma API (`7a8531c`)

Migrated the fashion/editorial restyle pass to agents.lumalabs.ai/v1: POST `/generations` with
`model:"ray-3.2"` + `type:"video"` + `mode:"flex_1"` + `media:{url:<base video>}` (replaces legacy
`/generations/video/modify` + `generation_type:modify_video`, model ray-2). Verified live — a ray-3.2
modify completed in ~25s (faster than base generation, confirming the source video was actually used).
Poll uses the output[]-aware `extractLumaVideoUrl`. Deployed, cto-aipa online (restart 15), boot clean.
Full /visualize pipeline now end-to-end on the new platform: Flux image → ray-3.2 base video →
ray-3.2 Modify Director's Cut.

## June 14 2026 — Atuona engine expansion: Flux 2 Pro (image) + Kling (4th video engine), verified live

Surgical/additive (commits `8af553c` code, `a499200` polish; backup tag `atuona-pre-flux2-kling-20260613`):
- **Image: Flux 2 Pro** (`black-forest-labs/flux-2-pro`, env `FLUX2_MODEL`, empty=disable) is the new top
  tier; Flux 1.1 Ultra→Pro→Dev kept intact as fallback. Verified: `Trying Flux 2 Pro → Image generated
  with Flux 2 Pro` every run (no fallback).
- **Video: Kling** (4th selectable engine, `/visualize kling NNN`) via Replicate `kwaivgi/kling-v2.1-master`
  (env `KLING_REPLICATE_MODEL`, existing REPLICATE_API_TOKEN — no new key). Verified: `✅ Kling via
  Replicate succeeded` (~3 min/render). For stylized/arthouse motion. Falls back to Luma→Replicate→Runway.
- Existing Luma ray-3.2 / Runway / Veo 3.1 / Director's Cut all untouched.

**Full Atuona engine matrix now:** image = Flux 2 Pro (→1.1 fallback); video = Luma ray-3.2 · Runway
Gen-4.5 · Veo 3.1 (native audio) · Kling — all operator-selectable via `/visualize <provider> NNN` and /menu.
All three codebases (local / GitHub / Oracle) synced at `a499200`.

## June 15 2026 — Atuona FILM COMPILER (`/film build`) live + first film made

New isolated module `src/atuona-film-compiler.ts` (commits `8d549eb`, `42d94bd`). Turns Atuona's
per-poem shots into a finished film, all on Oracle via ffmpeg (ffmpeg 6.1.1 + ffprobe present):
- `persistShot()` saves each base cut to `data/atuona/films/shots/<pageId>.mp4` as generated (fixes
  CDN URL expiry); hooked into the 3 base-video success paths.
- `buildFilm()` = staged ffmpeg: normalize 720p + last-frame-hold → bake OpenAI-TTS poem voiceover per
  clip → hard-cut concat → ducked music bed → mp4. `/film build [pages]` command; delivers to Telegram
  (<49MB) or saves to server.
- Music: royalty-free library in `data/atuona/films/music/` (Suno gated on SUNO_API_KEY).
- **Hang fix:** first run froze on a no-timeout network call after shot 1 → `withTimeout` added
  (TTS 45s / GitHub 15s / ffmpeg 150s); a hung call now skips the shot, film always completes.
- **Recovery:** past shot URLs (Luma cdn-luma.com) often outlive their 1h signature — recovered 18/22
  prior shots by probing `atuona-state.json` (repo root) and curling live URLs into shots/.

**First film: `finding-paradise` — 97s, 5 shots, 12.8MB, full poem VO + melancholic ambient score.**
Backup tag `atuona-pre-filmcompiler-20260615`. Restore points clean; existing engines untouched.
