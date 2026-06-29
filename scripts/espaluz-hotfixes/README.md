# EspaLuz WhatsApp — Kinder preference bug fix

## Problem

Messages containing **"kinder"** or **"kindergarten"** were intercepted by the learning-preferences handler. The parser matched the substring `kind` inside `kinder`, so the bot replied:

> Got it! I've noted your preferences: Correction Style: gentle

…instead of answering the user's actual question (e.g. bilingual schools in Panama City).

## Root cause

`espaluz_advanced_features.py` → `parse_preference_update()` used naive substring matching (`'kind' in text_lower`).

## Fix

Use whole-word/phrase matching via `_contains_preference_term()` (regex word boundaries).

## Apply on Oracle (fastest)

```bash
cd /home/ubuntu/AIPA_AITCF
git fetch origin cursor/fix-espaluz-kinder-preference-bug-10ea
git checkout origin/cursor/fix-espaluz-kinder-preference-bug-10ea -- scripts/espaluz-hotfixes/
bash scripts/espaluz-hotfixes/deploy-kinder-fix-on-oracle.sh
```

## Apply in EspaLuzWhatsApp repo (canonical)

```bash
cd EspaLuzWhatsApp
git am /path/to/kinder-preference-fix.diff
git push origin main
# On Oracle:
cd /home/ubuntu/EspaLuzWhatsApp && git fetch && git checkout origin/main -- espaluz_advanced_features.py scripts/tests/test_preference_parsing.py
sudo systemctl restart espaluz-whatsapp
```

## Verify

```bash
python3 scripts/tests/test_preference_parsing.py
```

Then send the bot: `I need to know about kinder bilingual schools in Panama city` — should get a real tutor answer, not the preferences confirmation.
