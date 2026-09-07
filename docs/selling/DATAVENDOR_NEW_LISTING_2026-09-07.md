# New DataVendor listing — built 7 Sep 2026, awaiting Elena's submit

**Draft:** https://datavendor.ai/listings/35b705ff-4141-4c9d-bf10-777602ec1145  — saved, 8 assets, $74,851, awaiting **Submit for review**
**Old listing (keep until the new one passes):** .../e568b5c8-2f86-41dc-8338-5e9778cd3443

## Why a new listing at all

Re-attaching assets on the old listing does **not** refresh DataVendor's stored archive.
Proof: its `pii_qc_llm` still reports `314x <no_ext>, 8x .ldb, 1x .db, 1x .gz` for
`EspaLuzWhatsApp`, while GitHub's API says `main` holds **136 blobs and zero** of those.
Same score 24, same 220 findings, byte-identical to the pre-cleanup run.

The `Add codebase` dialog, by contrast, reads GitHub live — the repository picker showed
current push dates, and each attached asset card shows an "Updated" date matching GitHub
(VibeJobHunter `9/7/2026`, i.e. today). So a fresh attach is the way to get a new capture.

This is also what Megan advised on 5 Sep: upload a new listing with the PII cleaned and
archive the old one. It was the wrong move while the repos were still dirty. They are not.

## What is in the draft

| asset | price | tags | GitHub "Updated" |
|---|---:|---|---|
| AILA | $4,264 | Coding/SWE, Enterprise Tool Use | 4/2/2026 |
| AIPA_AITCF-licensed | $12,000 | Coding/SWE, Enterprise Tool Use, MCP Integrations, Scrape | 9/6/2026 |
| EspaLuzFamilybot | $12,000 | Coding/SWE, Enterprise Tool Use | 9/6/2026 |
| EspaLuzWhatsApp | $12,000 | Coding/SWE, Enterprise Tool Use | 9/6/2026 |
| EspaLuz_Influencer | $12,000 | Coding/SWE, Enterprise Tool Use | 9/6/2026 |
| VibeJobHunterAIPA_AIMCF | $12,000 | Coding/SWE, Enterprise Tool Use, MCP Integrations, Scrape | 9/7/2026 |
| atlas-captures | $4,137 | Scrape, Coding/SWE | 9/6/2026 |
| dragontrade-agent | $6,450 | Coding/SWE, Enterprise Tool Use, Quant Trading | 9/6/2026 |

**Buy now total $74,851** — identical to the old listing, and inside DV's own
$20,000–$96,000 range.

Title and one-liner copied verbatim. Description is the polished block from
`DATAVENDOR_LISTING_DESCRIPTION.md`, with **one correction**: "a 131-test four-layer eval
suite" became "a four-layer eval suite of 137 tests, 129 of them fully offline", because
that is what `pytest` actually collects and passes.

Tag parity: AILA and AIPA_AITCF-licensed match the old listing exactly (verified from its
edit screen). The other six were assigned from what each repo does — the old per-asset
tags were not readable without navigating away and losing the draft.

## ✅ AILA — resolved, merged 7 Sep

Elena chose to merge `docs` into `main` so the asset matches its description. Done, but
**not as a plain merge** — git surfaced two conflicts and both sat exactly on a deliberate
security decision from March 2026:

- `2d358a7 security: remove schema specifics, domain enums, and criteria hints from public
  docs` — replaced embedding dimensions, entity-type enums, unique-constraint details and
  the three-layer model with vaguer prose.
- `81554d6 Delete AELA_x_HIVE_INTEGRATION_NOTES.md` — removed that file from main entirely.

The `docs` branch still carried the **pre-scrub** text under the renamed path
`docs/integrations/AILA_x_HIVE_INTEGRATION_NOTES.md`, so a naive merge would have silently
undone both. Resolved to keep the March posture:

- `README.md` → kept main's version, byte-identical to what it was before the merge.
- `AILA_x_HIVE_INTEGRATION_NOTES.md` → stayed deleted. It documents integration with a
  different product and is not needed for this asset to match its description.

`origin/main` went from **1 file to 8**: the blueprint, entity store, judge, and the
inheritance, symphony and marketing docs. Scanned before committing — **zero findings**;
the one business address became the `[at]` form and the example DSN was already a
`${DATABASE_URL}` placeholder. Merge commit `aa477b1`.

Elena's working copy was never touched: it is still on `docs` with its one uncommitted
`AILA_BLUEPRINT.md` change intact. The merge ran in a throwaway worktree, since removed.

**The asset was then detached and re-attached in the draft** so DataVendor captured the new
main — its card now reads `Updated 9/7/2026`, where before it read `4/2/2026`.

## Proof the new captures are genuinely fresh

The rebuilt listing shows LOC figures that only make sense post-cleanup:

| asset | old listing | new draft |
|---|---:|---:|
| EspaLuzFamilybot | 28k LOC | **19k LOC** |
| EspaLuzWhatsApp | 27k LOC | **26k LOC** |

Those drops are the five stray `main.py` copies and the untracked runtime state. The old
listing's archive never saw them go.

## ▶ SUBMITTED — 7 Sep 2026, ~07:10 Panama

Elena asked me to submit; I did. The confirmation dialog said *"Submitting will run all
quality checks again. The listing is locked while they run."* The page now reads
**"Listing submitted — quality checks are running"** and **"Editing unlocks when quality
checks finish."**

Verified immediately before pressing it: **8 assets**, **$74,851**, title correct, both
attestation checkboxes ticked, and the description carrying the corrected eval-suite count.

The previous run took about an hour for a single repository, so allow time. The thing to
read when it lands is the `pii_qc_llm` blind-spot line for `EspaLuzWhatsApp`:

- **`4x .mp4`** → the snapshot is fresh and the cleanup is visible to them. Expect passes.
- **`314x <no_ext>, 8x .ldb`** → their archive is cached per repository, nothing a vendor
  can do from this side, and `drafts/megan-hud-stale-snapshot-2026-09-07.txt` goes out as
  written.

**The old listing is still live and must stay that way until this one passes.**

## 🔑 Submitting does NOT run the PII check — this is the trap

Measured 7 Sep. After **Submit for review** finished, the panel read:

    Quality checks
    All mandatory checks passed
    11 passed        10 mandatory
    26 not gradable on this snapshot

**Eleven passed, zero failed, and `pii_qc_llm` was not among them.** Submitting runs the
**mandatory** set only. `pii_qc_llm`, `verify claims`, `verify rarity` and
`codebase complexity` are **recommended** checks, and they do not start until the
**Run recommended checks** button is pressed. That is a separate, second action.

This is the same screen that was misread on 6 Sep as "it worked, zero failures". It was
never a pass — it was an 11-of-115 run that had not reached the check that matters. A
green panel with no `pii qc llm` row in it is not a result, it is an unfinished run.

**Always check that `pii qc llm` appears by name before believing any verdict.**

Pressed at 07:19 Panama; the panel then read `Quality checks running… 0 of 115 complete`.

## Order of operations

1. Elena presses **Submit for review** on the draft.
2. QC runs (~1 hour based on yesterday).
3. If the eight come back clean → **Go live**, then archive the old listing, then send
   Megan the new URL using `drafts/megan-hud-stale-snapshot-2026-09-07.txt` (update it to
   report the fix rather than the bug).
4. If the new listing shows the SAME stale findings, the snapshot is cached per repository
   on their side and only they can clear it — send the letter as written.

**Do not archive the old listing until step 3.** It is the only reference Megan has.
