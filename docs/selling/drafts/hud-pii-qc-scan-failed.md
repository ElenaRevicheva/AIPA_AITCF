# HUD / DataVendor — `pii_qc_llm` returns `scan.failed` on every asset

**Vendor:** Aldeazz AI Lab (Elena Revicheva) · Tier 2
**Listings:** `1e119ff6-fca3-4d1f-99a9-847dee93b697` (current, fresh capture)
and `5ebac623-74e4-4a31-8d9a-a4df8c4e3c40` (earlier)
**Date:** 9 September 2026

## What happens

`pii_qc_llm` returns **score 0** on all eight assets, in every run, with the same two
findings and no evidence attached:

```json
"findings": [
  { "code": "scan.failed", "severity": "error", "summary": "unknown error",
    "remediation": "Re-run QC after fixing the listing artifact URI or packaging." },
  { "code": "agent_triage.not_attempted", "severity": "warning",
    "summary": "N finding(s) were offered for review and none were judged, so this
                score reflects the raw detector output rather than a completed review." }
],
"evaluator": {
  "scan_complete": false,
  "triage_status": "scan_incomplete",
  "verdict": "failed",
  "review_coverage": {},
  "confidence_factors": {},
  "notes": ["Scan failed; the verdict carries no evidence."]
},
"confidence": 0
```

## Why this is not our packaging

1. **`repo_archive_ready` passes on all eight**, in the same run. That is your own
   mandatory packaging check, and it contradicts the `scan.failed` remediation text.
2. **`pii_clean` and `secrets_clean` both pass** on the same eight snapshots.
3. **`AILA-licensed` is 9 files, 716 lines of source, 40 commits, about 1 MB.** It failed
   identically to a 1,001-commit repository, and took minutes to do it. There is no
   content in a nine-file repository that ends a PII scan with "unknown error".
4. It reproduced **three times**, across **two separate listings**, including one built
   from scratch with a verified-fresh capture (snapshot commit counts match the
   repositories exactly: 1001 / 544 / 392 / 214 / 176 / 127 / 40 / 40).
5. `attempt` is `1` on every row, so no retry is being made internally.

## Why it matters to us

The raw counts in the summary line are, by your own wording, *"the raw detector output
rather than a completed review"*. The review step that would clear review-only labels —
a vendor's own name on their own repository, for instance — **has never run once**, on
any asset, in any listing. So the number shown to a buyer is a pre-review count being
presented next to a failing score.

## What we would like

- A retry of `pii_qc_llm` on listing `1e119ff6-fca3-4d1f-99a9-847dee93b697` from your
  side, or the underlying error behind "unknown error".
- If the scan is failing on something specific in these snapshots, the file or the class
  of file would let us fix it in an hour. We have already removed, from every commit in
  history: credentials, résumé documents, client correspondence, customer records and
  chat logs, a server IP, and personal names of non-parties — verified by three
  independent gates before publishing.

Happy to grant any access you need.
