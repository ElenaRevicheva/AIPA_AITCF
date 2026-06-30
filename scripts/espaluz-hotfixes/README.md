# EspaLuz hotfix deploy scripts (Oracle)

Phone-friendly deploys via **GitHub Actions → Deploy to Oracle VM** (see `scripts/oracle-resilience/CLOUD_AGENT_DEPLOY.md`).

| Script | Product | Use when |
|--------|---------|----------|
| `deploy-whatsapp-checkout-and-restart.sh` | WhatsApp | Any WA code fix on `main` — set `deploy_files` |
| `deploy-telegram-checkout-and-restart.sh` | Telegram | Any TG code fix on `main` — set `deploy_files` |
| `deploy-kinder-fix-on-oracle.sh` | WhatsApp | Kinder → preferences false positive (fixed) |

**Preset deploy_files (WhatsApp):** `espaluz_bridge.py espaluz_memory.py espaluz_rag.py`  
**Preset deploy_files (Telegram):** `main.py espaluz_memory.py espaluz_rag.py`

---

## Kinder preference bug (reference)

Messages containing **"kinder"** or **"kindergarten"** were intercepted by the learning-preferences handler. The parser matched the substring `kind` inside `kinder`, so the bot replied:

> Got it! I've noted your preferences: Correction Style: gentle

…instead of answering the user's actual question (e.g. bilingual schools in Panama City).

## Root cause

`espaluz_advanced_features.py` → `parse_preference_update()` used naive substring matching (`'kind' in text_lower`).

## Fix

Use whole-word/phrase matching via `_contains_preference_term()` (regex word boundaries).

## Apply on Oracle

**Preferred (from phone — no laptop):** GitHub → AIPA_AITCF → Actions → **Deploy to Oracle VM** → Run workflow. Requires `ORACLE_SSH_KEY` secret (see `scripts/oracle-resilience/CLOUD_AGENT_DEPLOY.md`).

**SSH from laptop:**

```bash
cd /home/ubuntu/cto-aipa
git fetch origin main
git checkout origin/main -- scripts/espaluz-hotfixes/
bash scripts/espaluz-hotfixes/deploy-kinder-fix-on-oracle.sh
```

Or sync from EspaLuzWhatsApp main directly (fix is on GitHub `main`):

```bash
cd /home/ubuntu/EspaLuzWhatsApp
git fetch origin main
git checkout origin/main -- espaluz_advanced_features.py scripts/tests/test_preference_parsing.py
./venv/bin/python scripts/tests/test_preference_parsing.py
sudo systemctl restart espaluz-whatsapp
```

## Verify

```bash
python3 scripts/tests/test_preference_parsing.py
```

Then send the bot: `I need to know about kinder bilingual schools in Panama city` — should get a real tutor answer, not the preferences confirmation.
