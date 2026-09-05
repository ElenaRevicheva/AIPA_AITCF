# The QC per-check breakdown — found in the UI, 5 Sep 2026

Elena asked Megan for this and Megan asked whether she could see it. **She can.**
It was never missing: the four rows in the listing's **Owner only → Quality checks**
panel are **collapsed accordions**. Clicking a row expands the full per-check,
per-repo list. Nothing was hidden — the chevron just did not read as one.

Listing: `datavendor.ai/listings/e568b5c8-2f86-41dc-8338-5e9778cd3443`
Status: **Active** · All mandatory checks passed · 0 purchases

```
21 passed   ·   22 failed   ·   40 measured   ·   32 not gradable
```

`certification withheld — publishing unaffected`

## The 22 failures — four checks, not one

| Check | Failing repos | Count |
| --- | --- | ---: |
| `verify claims` | **all 8** | 8 |
| `verify rarity` | all except `AIPA_AITCF` | 7 |
| `pii qc llm` | EspaLuzWhatsApp · VibeJobHunterAIPA_AIMCF · AIPA_AITCF · EspaLuzFamilybot · dragontrade-agent | 5 |
| `codebase complexity` | atlas-captures · AILA | 2 |

## ⚠️ Megan's advice addresses 5 of the 22

Cleaning PII fixes `pii_qc_llm` and nothing else. A perfectly cleaned re-upload
moves the listing from **22 failed → 17 failed** and it stays
*"Not DV quality certified"*.

**That is still the right thing to do first**, because certification and
sellability are different gates:

- **Sellability gate** — `pii_qc_llm`. Megan: *"if the repo failed PII check, it
  cannot be sell."* This is the one blocking revenue.
- **Certification gate** — all 22. Cosmetic by comparison: the panel itself says
  *certification withheld — publishing unaffected*, and **all mandatory checks
  already pass**.

So: clean the PII to become sellable. Treat `verify claims` / `verify rarity` as a
separate, later piece of work about the listing copy, not the code.

### What the other three checks are actually about

- **`verify claims` (8/8)** — the listing Overview makes strong specific claims
  (131-test eval, five-provider failover, "auto-apply was removed", HUD estimator
  $89,481). An AI reviewer could not verify them **from the snapshot**. Note the
  0-LOC repos fail this too, which suggests it grades claims against readable
  source — and there is none to read for those two.
- **`verify rarity` (7/8)** — only `AIPA_AITCF` passes. It is the largest and most
  unusual tree; the rest read as more conventional.
- **`codebase complexity` (2/8)** — `atlas-captures` and `AILA`, both **0 LOC**.
  These are the same two priced at $8,401 combined. Same root cause as their
  `not gradable` reason: *"Too little of the snapshot's source could be read to
  grade against."*

## What PASSED, and the one that matters

- `Repository snapshot` — all 8, **Mandatory**
- `Secrets scan` — **Mandatory, PASSED**
- `Listing metadata / Personal data scan` — **Mandatory**, passed
- `codebase complexity` — the 6 real-LOC repos
- `pii qc llm` — EspaLuz_Influencer, atlas-captures, AILA
- `verify rarity` — AIPA_AITCF

> 🔎 **`Secrets scan` passed while a live Railway Postgres password sat in
> `EspaLuzWhatsApp` HEAD.** The credential was caught by **`pii_qc_llm`** as
> `URL_WITH_CREDENTIALS`, not by the check named "Secrets scan".
>
> **A check's name is not its scope.** Reading "Secrets scan: passed" as "no
> secrets" is the same mistake our own scan made from the other direction —
> it searched vendor key formats and a database URL was not one. Two independent
> scanners, the same blind spot, opposite sides.

## 🚨 The delivery mechanism — zips are the wrong artifact

`Settings → Integrations` shows:

| Integration | State |
| --- | --- |
| hud.ai | Built in |
| **GitHub** | **Connected** — *"Sell repositories you host on GitHub."* |
| GitLab | Not linked |

Assets are identified as `ElenaRevicheva/<repo>` and there is a mandatory
**`Repository snapshot`** check. **DataVendor pulls from GitHub via its GitHub
App and snapshots the repo.** There is no zip upload path for a codebase asset.

**Consequence:** the seven zips built on 5 Sep
(`D:/aideazz/_license-upload-2026-09-05/`) cannot be uploaded anywhere. The
cleaned trees must exist **as GitHub repositories** for the new listing to attach
and re-scan them.

### ❌ Do NOT clean the existing repos in place

`VibeJobHunterAIPA_AIMCF` and `aideazz` **deploy from git** and are held exactly
at `origin/main` (NOW.md PART 1 §3). Rewriting their history to scrub PII would
break the deploy and destroy history that is not ours to destroy. The clean-room
principle already in `build-license-bundle.cjs` still holds — the fix is a
**new repo**, not a rewritten one.

## The corrected plan

1. Push each cleaned tree to a **new private GitHub repo**, history-free, one
   initial commit. Script: `scripts/publish-license-repos.cjs`.
2. Grant the DataVendor GitHub App access to the new repos
   (Integrations → GitHub → **Manage access**).
3. Create the **new listing** selecting those repos. QC re-runs on the snapshot.
4. **Archive the old listing only once the new one reads Active** — Megan
   confirmed the current one may stay live throughout, so there is no window
   where nothing is on the catalog.

**Private, not public.** The listing sells a *licence to a copy*. A public repo
would give the same code away for free and destroy the $74,851.
