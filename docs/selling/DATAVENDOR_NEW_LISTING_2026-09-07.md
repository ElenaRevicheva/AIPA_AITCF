# New DataVendor listing — built 7 Sep 2026, awaiting Elena's submit

**Draft:** https://datavendor.ai/listings/35b705ff-4141-4c9d-bf10-777602ec1145/edit
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

## ⚠️ Decide before submitting: AILA

`ElenaRevicheva/AILA` default branch holds **one file, README.md**. The content lives on
the `docs` branch. The listing prices it at **$4,264** and describes it as a "paused
life-assistant AI codebase with governed longitudinal memory".

A buyer who downloads it gets a README. This is very likely part of why `verify claims`
fails. Three options, all Elena's call:

1. Leave as is — same as the old listing, and it is the only asset that passes PII today.
2. Merge `docs` into `main` so the asset matches the description — then it must be
   PII-scanned first (`node scripts/pii-guard.cjs --listing` covers it).
3. Drop AILA from the listing — total becomes $70,587.

## Order of operations

1. Elena presses **Submit for review** on the draft.
2. QC runs (~1 hour based on yesterday).
3. If the eight come back clean → **Go live**, then archive the old listing, then send
   Megan the new URL using `drafts/megan-hud-stale-snapshot-2026-09-07.txt` (update it to
   report the fix rather than the bug).
4. If the new listing shows the SAME stale findings, the snapshot is cached per repository
   on their side and only they can clear it — send the letter as written.

**Do not archive the old listing until step 3.** It is the only reference Megan has.
