# Cloud agent + phone deploy — full Oracle fleet

Deploy **every AI product on `170.9.242.90`** from your phone or Cursor Cloud Agent — no laptop SSH.

---

## One-time setup (~10 min)

### 1. GitHub secrets (AIPA_AITCF repo)

| Secret | Required for | Value |
|--------|--------------|-------|
| **`ORACLE_SSH_KEY`** | All Oracle products (#1–11) | Full `ssh-key-2026-01-07private.key` |
| **`AWS_ACCESS_KEY_ID`** | Sprinter Lambda (#8.1) only | AWS IAM key with Lambda update |
| **`AWS_SECRET_ACCESS_KEY`** | Sprinter Lambda (#8.1) only | Matching secret |

```powershell
gh auth login
gh secret set ORACLE_SSH_KEY --repo ElenaRevicheva/AIPA_AITCF < "$env:USERPROFILE\.ssh\ssh-key-2026-01-07private.key"
```

### 2. Oracle git auth (one-time per PAT rotation)

```bash
TOKEN=ghp_YOUR_PAT bash ~/oracle-fix-git-https-auth.sh
```

Verify: `git fetch origin main` in each product dir — no username prompt.

---

## Daily use from phone

1. **GitHub** → **ElenaRevicheva/AIPA_AITCF** → **Actions**
2. **Deploy to Oracle VM** → **Run workflow**
3. Pick **product** → optional **deploy_files** → Run

### Product picker

| Product | What it deploys | Default files (if deploy_files empty) |
|---------|-----------------|--------------------------------------|
| **whatsapp** | EspaLuz WhatsApp + restart | `espaluz_bridge.py`, memory, RAG |
| **telegram** | EspaLuz Telegram + payments webhook | `main.py`, memory, RAG, PF |
| **influencer** | EspaLuz Influencer bot | `main.py`, `cto_milestone_module.py` |
| **dragontrade** | Algom Alpha PM2 apps | git pull + PM2 restart all 4 apps |
| **vjh** | VibeJob Hunter loop | `main.py`, claude helpers |
| **vjh_web** | CMO FastAPI :8080 | `web_app.py`, `main.py` |
| **openclaw** | OpenClaw gateway | git pull + restart |
| **cto_aipa** | CTO AIPA + Atuona (PM2) | git pull + npm build + PM2 |
| **atlas** | Atlas Shifted radar (PM2) | git pull + PM2 whitespace |
| **fleet-verify** | Health check all — **no deploy** | — |
| **sprinter-aws** | AWS Lambda (not Oracle SSH) | builds + `deploy-lambda.mjs` |

### Override files (checkout products)

Example — deploy only bridge after cloud agent fix:

```
deploy_files: espaluz_bridge.py espaluz_advanced_features.py
product: whatsapp
```

---

## Cursor Cloud Agent workflow

Cloud agents **cannot SSH to Oracle**. Standard loop:

```
1. Cloud agent edits code → push to product repo main (EspaLuzWhatsApp, VJH, etc.)
2. Cloud agent updates oracle-products.conf / deploy script in AIPA_AITCF if needed → merge
3. Elena (phone) → Actions → Run workflow → pick product
```

**Memory-safe rule:** Python bots use `git checkout origin/main -- <files>` — never overwrite prod JSON (`user_sessions.json`, `family_memory_data/`, trials, PF payments).

**PM2 products** (`cto_aipa`, `atlas`, `dragontrade`): `git pull --ff-only` + build + PM2 restart (`.env` / `wallet/` gitignored).

---

## Products NOT on Oracle SSH

| Product | Deploy path |
|---------|-------------|
| **AILA (#10)** | Not deployed on VM yet — no workflow action |
| **aideazz.xyz** | Push [aideazz](https://github.com/ElenaRevicheva/aideazz) `main` → 4everland auto-deploy |
| **atuona.xyz** | Push [atuona](https://github.com/ElenaRevicheva/atuona) `main` → 4everland |

---

## Architecture

```
Phone / Cloud Agent
       ↓
GitHub Actions (deploy-oracle.yml)
       ↓ SSH (ORACLE_SSH_KEY)
170.9.242.90
       ↓
scripts/oracle-resilience/deploy-product.sh
       ↓
oracle-products.conf  →  per-product dir, mode, restart, health
```

Registry: `scripts/oracle-resilience/oracle-products.conf`  
Universal deploy: `scripts/oracle-resilience/deploy-product.sh`  
Fleet health: `scripts/oracle-resilience/verify-fleet-health.sh`

---

## Security

- Never commit private keys or `.env` to git.
- Rotate `ORACLE_SSH_KEY` / AWS keys if exposed — update GitHub secrets only.
- Prefer **checkout specific files** over blind `git pull` on EspaLuz repos.
