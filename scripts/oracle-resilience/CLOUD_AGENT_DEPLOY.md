# Cloud agent deploys to Oracle (from phone or Cursor Cloud)

Deploy **without your laptop SSH key on the cloud VM** — GitHub Actions SSHs to Oracle using a repo secret.

---

## One-time setup (~5 min on laptop)

### 1. Add `ORACLE_SSH_KEY` secret (required)

**GitHub → [AIPA_AITCF](https://github.com/ElenaRevicheva/AIPA_AITCF) → Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|------|--------|
| `ORACLE_SSH_KEY` | **Entire contents** of `ssh-key-2026-01-07private.key` (including `-----BEGIN ... KEY-----` lines) |

**From laptop (after `gh auth login`):**

```powershell
gh secret set ORACLE_SSH_KEY --repo ElenaRevicheva/AIPA_AITCF `
  < "$env:USERPROFILE\.ssh\ssh-key-2026-01-07private.key"
```

**Verify:** Actions → **Deploy to Oracle VM** → Run workflow → pick **verify only** → green = secret works.

### 2. Oracle git fetch (no password prompts)

```bash
ssh ubuntu@170.9.242.90 "cd /home/ubuntu/cto-aipa && git fetch origin main"
```

If fetch fails, set `GITHUB_TOKEN` PAT on VM — see `docs/oracle/ORACLE_ALL_PRODUCTS_RESILIENCE.md`.

---

## Deploy from your phone (daily use)

1. Open **GitHub** app or browser → **ElenaRevicheva/AIPA_AITCF**
2. **Actions** → **Deploy to Oracle VM** → **Run workflow**
3. Pick script + files (presets below)
4. Green check = live on Oracle

### Preset: WhatsApp hotfix

| Field | Value |
|-------|--------|
| **deploy_script** | `espaluz-hotfixes/deploy-whatsapp-checkout-and-restart.sh` |
| **deploy_files** | `espaluz_bridge.py espaluz_memory.py espaluz_rag.py` |

### Preset: Telegram hotfix

| Field | Value |
|-------|--------|
| **deploy_script** | `espaluz-hotfixes/deploy-telegram-checkout-and-restart.sh` |
| **deploy_files** | `main.py espaluz_memory.py espaluz_rag.py` |

### Preset: Health check only (no restart)

| Field | Value |
|-------|--------|
| **deploy_script** | `oracle-resilience/verify-espaluz-memory-only.sh` |
| **deploy_files** | *(leave default)* |

### Preset: Memory module + verify

| Field | Value |
|-------|--------|
| **deploy_script** | `oracle-resilience/deploy-memory-hardening-on-oracle.sh` |

---

## Cursor Cloud Agent workflow

Cloud agents **cannot SSH to Oracle** (no private key on cloud VM). Use this pattern:

```
1. Fix → push to EspaLuzWhatsApp or EspaLuzFamilybot main
2. Cloud agent → PR/merge to AIPA_AITCF (deploy scripts if needed)
3. Elena → phone → Actions → Run workflow
```

**Memory-safe rule:** deploy scripts use `git checkout origin/main -- <specific files>` — never overwrite prod JSON (`user_sessions.json`, `family_memory_data/`, trials).

---

## Workflow

`.github/workflows/deploy-oracle.yml` — `appleboy/ssh-action` + `secrets.ORACLE_SSH_KEY`

**Server:** `ubuntu@170.9.242.90`

| Script | What it does |
|--------|----------------|
| `deploy-whatsapp-checkout-and-restart.sh` | Pull WA files from GitHub + restart |
| `deploy-telegram-checkout-and-restart.sh` | Pull TG files from GitHub + restart |
| `deploy-kinder-fix-on-oracle.sh` | Kinder preference fix + test |
| `deploy-memory-hardening-on-oracle.sh` | Memory UUID + RAG migration + verify |
| `verify-espaluz-memory-only.sh` | Read-only health (safe anytime) |

---

## Product paths on Oracle

| Product | Path | systemd |
|---------|------|---------|
| EspaLuz WhatsApp | `/home/ubuntu/EspaLuzWhatsApp` | `espaluz-whatsapp` |
| EspaLuz Telegram | `/home/ubuntu/EspaLuzFamilybot` | `espaluz-familybot` |
| Payments webhook | *(Familybot)* | `espaluz-payments-webhook` |
| CTO AIPA | `/home/ubuntu/cto-aipa` | PM2 `cto-aipa` |

---

## Security

- Never commit the private key to git.
- Rotate `ORACLE_SSH_KEY` if exposed; update GitHub secret only.
- Prefer **checkout specific files** over blind `git pull` on EspaLuz repos.
