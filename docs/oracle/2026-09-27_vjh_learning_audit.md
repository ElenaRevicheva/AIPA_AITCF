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
