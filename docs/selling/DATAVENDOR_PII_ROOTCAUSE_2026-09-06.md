# pii_qc_llm — what is actually wrong, 6 Sep 2026

Read after `DATAVENDOR_QC_2026-09-05.md`. This supersedes the "stale snapshot" hypothesis:
**the snapshots are fresh.** Elena re-attached every asset; the numbers below were read out
of the live vendor UI and independently reproduced against local `HEAD`.

## 1. The check IS reading current HEAD — proof

Independent scan of what `git ls-files` tracks today vs what the vendor UI reports:

| repo | HUD says | local scan says | verdict |
| --- | --- | --- | --- |
| dragontrade-agent | EMAIL 2 | EMAIL 2 | exact |
| atlas-captures | EMAIL 19 · PHONE 21 | EMAIL 19 · PHONE 16 | exact on email |
| EspaLuz_Influencer | PHONE 1 | PHONE 1 | exact |
| EspaLuzWhatsApp | PHONE 177 · EMAIL 17 | PHONE 125 · EMAIL 4 | same shape |
| VibeJobHunterAIPA_AIMCF | EMAIL 75 · PHONE 71 | EMAIL 73 · PHONE 8 | same shape |
| AIPA_AITCF-licensed | EMAIL 84 · PHONE 31 · URL_CRED 6 | EMAIL 85 · PHONE 20 · URL_CRED 5 | same shape |

So the failures are real findings in today's code, not a cached grade.

## 2. Megan's 5 Sep numbers vs today — the clean-room worked, the in-place edits did not

| repo | 5 Sep | 6 Sep | |
| --- | ---: | ---: | --- |
| AIPA_AITCF → `-licensed` | 1890 | 122 | **−94%** — clean-room rebuild worked |
| EspaLuzWhatsApp | 219 | 207 | barely moved |
| VibeJobHunterAIPA_AIMCF | 144 | 150 | went up |
| EspaLuzFamilybot | 37 | 56 | went up |
| dragontrade-agent | 2 | 2 | unchanged |

## 3. ROOT CAUSE #1 — the WhatsApp session store was never untracked

`.wwebjs_auth/` is listed in `EspaLuzWhatsApp/.gitignore` (line 6) **and is still tracked**:

    git ls-files | grep -c wwebjs_auth   →  380
    git log --diff-filter=D -- .wwebjs_auth  →  (empty: never removed)

`HEAD` carries **380 files / 180 MB** of an authenticated WhatsApp Web profile — 338
extensionless LevelDB records, 8 `.ldb`, a `.db`, a `.gz`, plus media. HUD reports this
verbatim as two `error`-severity blind spots:

> Scan could not fully inspect material marked preflight:binary_or_unknown
> (314x `<no_ext>`, 8x `.ldb`, 4x `.mp4`, 1x `.db-journal`, 1x `.ogg`).
> Unscanned bytes cannot be certified as clean.

Two named failure modes, both mine:

1. **`.gitignore` filters new files; it does not retract tracked ones.** Adding the rule
   made the directory invisible to `git status` while it stayed in every clone.
2. **`git rm --cached` is atomic and I hid its exit code.** One bad pathspec in the batch
   (`telegram_subscribers.json`, which does not exist in this repo) aborted the *whole*
   command, and the trailing `|| true` turned the failure into a green line. Nothing was
   removed and nothing said so.

## 4. ROOT CAUSE #2 — the scrubber's own replacement value is a finding

In `AIPA_AITCF-licensed`, **all 84 EMAIL_ADDRESS findings are one string**:
`ElenaRevicheva@users.noreply.github.com`, in 45 files — the value **my scrubber wrote in**
to replace her real address. A GitHub noreply address is still an email address to a
detector. *Optimising for "the real value is gone" instead of "the detector sees nothing".*

## 5. ROOT CAUSE #3 — the phone harvester only matched contiguous E.164

Redacted: `+5070000071`, `+5070000003`, `+5070000050` … Survived, in the same files:

    +507 214-5776   +507 6509-5139   +507 6671-2131   +57 313 695 2776
    +1 (619) 906-7481   +507 599-5962   +507 6339-6599   +507 6851-6654

Real third-party business numbers in `scripts/stage-manual-prospect.cjs`,
`_stage-rapid-tires.cjs`, `hs-fix-nomad-note.cjs`. Same family as the case-sensitivity bug:
**a harvester that reads one format leaves every other format behind.**

## 6. What is NOT a real problem

Verified line by line — every credential-shaped hit in `AIPA_AITCF-licensed` is a comment
in the scrubber describing its own rules:

- `URL_WITH_CREDENTIALS` ×5 → doc comments in `build-license-bundle.cjs` /
  `rebuild-license-history.cjs`, plus a `${TOKEN}` placeholder in a setup script
- `AUTHORIZATION_BEARER_TOKEN` ×3 → `Bearer SPRINT_BRIEFING_SECRET`,
  `Bearer ATLAS_OUTCOMES_TOKEN` — env var **names**
- `ANTHROPIC_API_KEY` ×1 → the regex literal `/\bsk-ant-api\d{2}-…/`

Same in the Python repos: the `postgresql://…@` hits are `${RAILWAY_PASSWORD}` /
`${DB_PASSWORD}` template references. The two live passwords are gone and rotated.
`sk-ant-your-c…` in the API-key guides is placeholder text.

## 7. What the checker MISSED — do not confuse a green check with clean

- `EspaLuz_Influencer/main.py:69` — a **live hardcoded shared secret**:
  `_CRM_AUTH = "Bearer <48 hex>"`, the `OUTREACH_SECRET` guarding
  `POST /api/crm-event` on cto-aipa. HUD reported one PHONE_NUMBER for this repo and
  nothing else.
- `EspaLuz_Influencer/main.py:62` — a live Make.com inbound webhook URL. Anyone holding it
  can post into the automation. No detector covers "secret URL".

Both must be rotated and moved to env regardless of what any listing says.

## 8. The fix list, smallest to largest

| repo | work | score now |
| --- | --- | ---: |
| dragontrade-agent | drop one stray `cmo-aipa-integration.patch` (its 2 emails are the entire finding) | 51 |
| EspaLuz_Influencer | 1 phone in `main.py` **+ rotate the CRM secret and the Make URL** | 55 |
| atlas-captures | 3 advertiser contacts inside `captures.jsonl` | 33.8 |
| EspaLuzFamilybot | ~19 phones (12 in `espaluz_enhancements.py` are public embassy numbers), 1 email | 31.8 |
| AIPA_AITCF-licensed | swap the noreply address for a non-address token; catch the spaced/dashed phones | 27.4 |
| VibeJobHunterAIPA_AIMCF | `aipa@aideazz.xyz` in 30 files + her own number in the resume templates | 26.2 |
| EspaLuzWhatsApp | **untrack `.wwebjs_auth/` (380 files, 180 MB)** + real numbers | 24.3 |

Pass mark is **71**. `AILA` passes at 9 tracked files and one `aipa@aideazz.xyz`, which
tells us a lone business address is survivable; density is what sinks a score.

## 9. Should the listing be archived and rebuilt?

**No.** Megan wrote that on 5 Sep, before any cleaning, about a listing whose repos were
dirty. Archiving replaces the *wrapper*. `pii_qc_llm` grades the *repos*. A brand-new
listing pointed at the same seven repos fails identically — and throws away the $74,851
build, the tags, and the URL Megan already has. The substantive half of her advice
("upload with the PII cleaned") is already done for the worst asset: `AIPA_AITCF` →
`AIPA_AITCF-licensed`, 1890 → 122.

Clean the repos, press **Re-run** per check. That is the whole job.
