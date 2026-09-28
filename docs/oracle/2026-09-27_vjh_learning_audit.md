# Does VJH learn from Elena's rejections? — audit from production, 27 Sep 2026

Elena: *"VJH should be self evolving truly, not on words."* Read from HubSpot (all 370 HIRING deals in ❌ No fit,
their notes and attachments) and from Oracle (`judge_feedback.json`, `judge_feedback_sync.log`,
`screenshot_reasons.json`, `scripts/judge_feedback_sync.py`, `src/core/llm_judge.py` — deployed = `main`).

## Verdict: it learns in words only

| Mechanism | Fact | Effect |
|---|---|---|
| Sync window | reads the 400 most recently **modified** HIRING deals | window reaches back to **19 Sep** (8 days); **18 of 370** rejections inside |
| Example cap | `MAX_EXAMPLES = 12` | at most 12 rejections reach the judge; 5 no-reason Jerry.ai deals took 5 slots, pushing out Cohere + Mesh |
| How it is used | few-shot lines in the LLM judge prompt, labelled *"refine your judgment but do NOT override criteria 1-7"* | a rule like "only hires people born in LATAM" can never veto anything |
| Screenshot reader | `gpt-4o-mini`, prompt asks what the role *demands* | micro1 "Remote (US, CA, UK, IE, AU, NZ)" summarised without the location; Byldd "This job post is closed" never read (not in cache) |
| Arootah | note "Look at screenshot" | **no file ever reached HubSpot** — nothing to read |
| Measurement | none | nothing shows whether her rejection rate falls over time |

`judge_feedback.json` on 27 Sep 21:17: 2,535 bytes · 6 positives · 12 negatives (10 with her reason, 1 from a screenshot).

## Her reasons, all 370 rejections (64 carry a written reason)

| Reason (her words) | ≈ count | Machine-checkable rule |
|---|---|---|
| Hand-coding / CS degree / senior engineering ("manual coding required", "CS needed", "require experienced engineering", senior backend Node/AWS) | 12 | requirement-text veto (degree in CS required; N+ yrs software engineering; senior backend) — titles already vetoed since 20 Sep, requirement text is not |
| Location / eligibility (Philippines; "Location only Colombia"; US/CA/UK/IE/AU/NZ; "born in LATAM"; India) | 7 | explicit country list that excludes Panama/LATAM-wide → veto; birth/citizenship/W2 phrases → veto |
| Torre → LinkedIn → elsewhere ("suspicious website", "maybe a scam") | ~15 notes | resolve Torre's apply chain at ingest; unresolved / off-domain → do not promote |
| Tool she does not use (monday.com, Airtable/Zapier, Workato, GCP) | 4 | single-tool-specialist title/requirement veto (tool not in her stack) |
| Posting closed ("no longer open", Byldd closed) | 2 (+4 found 23 Sep by the apply-kit) | liveness check before 🔥 I Act TODAY |
| Wrong field / pay too low (growth marketing & paid media; Mercor $30) | 2 | out-of-lane title veto; stated pay below floor ($3,000/mo) → veto |
| ML / research engineer titles (1 Aug bulk) | ~27 | already vetoed by title ✅ |
| "Look at screenshot" | ~17 | reader must also extract location, eligibility, closed status, pay |

(The 1 Aug bulk entries carry only VJH's own "NEEDS MANUAL APPLY" note — the sync must not mistake that for her reason.)

## What "truly self-evolving" requires (proposed, not built)

1. **Durable decision ledger** — every decision appended once, forever (`autonomous_data/decisions.jsonl`),
   synced by a `hs_lastmodifieddate` cursor. No 400-deal window, no 12-example cap.
2. **Reasons → enforced rules** — each reason classified into a rule code; rules live in
   `autonomous_data/learned_rules.json` with provenance (which deals taught each rule) and run in the gate
   BEFORE the LLM judge. A company she rejected 3+ times is suppressed.
3. **Screenshot reader v4** — extracts location/eligibility, closed status, stated pay and demands.
4. **Proof by replay** — the gate re-run over all decisions: share of her rejections it now blocks, and positives it
   wrongly blocks (must stay 0). Becomes an eval test in `evals/`.
5. **Weekly precision metric** to Telegram — of deals VJH put in 🔥 I Act TODAY, how many she applied to vs rejected.

---

## Deeper dig (same day) — the learning EXISTS; it is wired where it cannot decide

Correction to the section above: the loop is real and was proven end to end on 1 Sep 2026 (memory
`project_vjh_self_learning`): her note + screenshot → `judge_feedback_sync.py` (hourly, `17 * * * *`) →
gpt-4o-mini reads the image → `judge_feedback.json` → `_feedback_block()` in the live judge prompt. Location is
also not "only a hint": `iron_clad_fit` has a hard `COUNTRY_LOCK` (hand-written, not learned).

Every learning mechanism in VJH `main` (34 branches checked — nothing learning-related stranded):

| Mechanism | State in production (27 Sep) |
|---|---|
| Notes + screenshots → judge prompt | ✅ runs hourly; ⚠️ 8-day window, 12 examples |
| LLM judge (`judge_fit`) — the ONLY reader of her lessons | runs at the LangGraph submit node + runner + borderline rescue: **16 verdicts in 7 days**; none of the 11 vetoes cites a learned lesson — all cite fixed criteria (2, 3c, 3e, 3h, 4) |
| Google-Jobs ingest (`serpapi_jobs_ingest.py`) — creates most deals | `iron_clad_fit` + salary floor decide 🔥 I Act TODAY; the judge is asked **only when the gate says NO** (rescue), **never to veto a gate-pass** |
| Hourly scorer (`job_matcher.py` "AI Analysis …/100") | its own prompt — **does not read `judge_feedback.json`**; 22 analyses in 7 days |
| `learning_metrics` table ("track what works") | defined in `database_models.py`, **written by no code — 0 rows** in both prod DBs (`job_listings`, `interviews` also 0) |
| "Success prediction model" (`response_detector.py`) | saves 385 `detected_responses`; **no model reads them** |
| Rule edits after her feedback (fit_gate / job_gate / lanes) | ✅ the evolution that actually changed behaviour — but by agents hand-editing code (e.g. `18d3bf1` Georgia IT, `5c50c09` generic AI Engineer), not by VJH |

**So:** her lessons reach one component (the judge), which sits on the smallest path and is told they cannot
override its fixed criteria; the path that fills 🔥 I Act TODAY never asks it.

## Fix — build on what exists (not a rewrite)

1. **Judge on every door into 🔥 I Act TODAY** — Google-Jobs ingest asks the judge on a gate-PASS too (veto, not
   only rescue); the hourly scorer's prompt gets the same `_feedback_block()`.
2. **Full memory** — cursor-based sync over all decisions (no 400-deal window); prompt gets a compact
   "lessons by reason" summary of ALL rejections + the 12 most recent examples.
3. **Lessons → enforced rules** with provenance (country list excluding Panama, born-in / citizenship, CS degree /
   manual coding, tool not in her stack, closed posting, pay below floor, company rejected 3+ times).
4. **Screenshot prompt v4** — also extract location / eligibility / closed / pay.
5. **Proof** — replay over all decisions (rejections caught, applied jobs wrongly blocked = 0) as an eval test;
   finally WRITE `learning_metrics` weekly and send the precision number to Telegram.

---

## ✅ Built and deployed 28 Sep 2026 (VJH `38d65d2` → `5ee5af0` → `6f130f2` → `cb9ea92`)

Local repo → GitHub `main` → Oracle (`git merge --ff-only`; Oracle's HEAD first re-aligned from `40b32e9` to
`18d3bf1` after proving every tracked file on disk already equalled it — no file content touched; backup
`~/backups/vjh-pre-learning-20260928-0043`). Restarted `vibejobhunter` (systemd) + `serpapi-jobs` (PM2) 00:57 UTC.

- **Permanent memory:** `autonomous_data/judge_decisions.json` — 554 decided deals, 370 rejections, 35 with her reason.
- **Rules learned** (`autonomous_data/learned_rules.json`, each with `taught_by`): closed_posting (Byldd, Storyblok) ·
  eligibility born_in / citizenship / w2_only (HireLATAM, Tech9) · country_code_list (micro1) · tools_not_hers
  airtable, monday.com · rejected_companies jerry ai, stripe · out_of_field_titles growth marketing & paid media.
- **Judge prompt** now carries lessons from ALL rejections, may reject on them only when the listing STATES the fact,
  and ends with a reminder that silence on location is not a restriction.
- **Every door into 🔥 I Act TODAY:** Google-Jobs ingest (Bright Data) = iron_clad + pay floor + learned rules + judge
  veto; LangGraph submit = learned rules + iron_clad + judge.
- **`learning_metrics`:** 8 weekly rows written (first ever). Precision (applied ÷ decided, VJH-found): 0.143 · 0.3 ·
  0.6 · 0.133 for the weeks of 31 Aug → 21 Sep. This is the number that must rise.
- **Replay proof** (`scripts/replay_learning.py --judge 20`, Oracle): rules catch 12/370 rejections, wrongly block 0/35
  applications; judge on her rejections 19/20 → **20/20**, on her applications 2/20 → **2/20** (same jobs).
- **Evals:** 13 new tests; Oracle suite **546 passed**, 1 failed = the deliberate `[claude]` (credits 0).
- **Found by the new eval:** the SERP-LEAD note template ("VJH SerpAPI found this job") was being learned as her reason.
- **Found by the replay:** lessons + location-heavy examples together turned silence on location into a veto (Rove
  Concepts, applied, 2/2) — fixed by a reminder placed nearest the job; re-run the replay after any prompt change.
