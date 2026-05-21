# HubSpot Deal Name Convention

> Deployed May 20 2026 — see project_hubspot_dashboard.md in Claude memory for fuller context.

Every HubSpot deal is prefixed with `[STREAM-AGENT]` so the dashboard is scannable. Adding a new writer? Pick a prefix from the table below (or add a new one), then pass it as `sourcePrefix` to `pushHiringDealToHubSpot` / `pushLeadToHubSpot` (or include it in the `/api/crm-event` payload).

## Active prefixes

| Prefix | Source file | Pipeline |
|--------|-------------|----------|
| `[HIRING-VJH]` | `crm_hub.py` (VJH LangGraph) | HIRING |
| `[HIRING-VJH-SERP]` | `serpapi_jobs_ingest.py` (VJH) | HIRING |
| `[CLIENT-CTO-INGEST]` | `fresh-leads-ingest.ts` + `lead-triage.ts` | CLIENT |
| `[CLIENT-CTO-SERP]` | `serpapi-prospects.ts` | CLIENT |
| `[CLIENT-ALGOM]` | `algom-poll.js` + `stream-listener.js` (dragontrade-agent) | CLIENT |

## Reserved (not yet wired)

| Prefix | Will be used by |
|--------|-----------------|
| `[HIRING-OPENCLAW]` | OpenClaw YC AI shortlist (Phase B2) |
| `[CLIENT-CTO-INQUIRY]` | aideazz.xyz contact form submissions |
| `[CLIENT-CMO]` | LinkedIn engagement responses (Make.com return webhook) |
| `[CLIENT-PLACES]` | Google Places auto-cron (local-business clients) |
| `[ESPALUZ-PAID]` | New PayPal subscriber |
| `[ESPALUZ-CHAT]` | New WhatsApp chat user |

## How it works in code

```typescript
// hubspot-client.ts — both helpers accept optional sourcePrefix
pushHiringDealToHubSpot({ jobTitle, company, sourcePrefix: 'HIRING-VJH', ... })
// → dealname becomes: [HIRING-VJH] {jobTitle} @ {company}

pushLeadToHubSpot({ name, sourcePrefix: 'CLIENT-ALGOM', ... })
// → dealname becomes: [CLIENT-ALGOM] {name}
```

For HTTP callers (Algom, VJH from Python), include `sourcePrefix` in the JSON body to `POST /api/crm-event`.

## Backwards compatibility

Omitting `sourcePrefix` keeps the legacy naming behavior — never breaks existing callers. The HIRING pipeline previously used a hardcoded `[HIRING]` prefix; absent `sourcePrefix`, that fallback still applies.

---

## 🆕 May 21 2026 update — HIRING prefixes renamed to honest LEAD mode

After May 21 audit: VJH has **never actually submitted an application** in its ~6-month lifetime (0 emails sent, 0 ATS form deliveries, 0 recruiter responses despite 707 application records claiming otherwise). The "auto-apply" was simulated.

**Prefixes renamed to reflect reality:**

| Old (misleading) | New (honest) | What it actually means |
|------------------|--------------|------------------------|
| `[HIRING-VJH]` | `[HIRING-VJH-LEAD]` | VJH found this job + generated cover letter; Elena must manually apply |
| `[HIRING-VJH-SERP]` | `[HIRING-VJH-SERP-LEAD]` | VJH SerpAPI found this job; Elena must manually apply (no cover letter pre-gen for this path) |

**Stage routing changed:** new LEAD deals land in `🔥 YOU act TODAY` (not `📥 AI working`) because Elena IS the one who needs to act.

**Notes field added** to each new VJH deal: "⚠️ MANUAL APPLY REQUIRED — VJH found this job and generated a cover letter, but did NOT submit. Click the job URL + paste the cover letter."

**`ATS_SUBMISSION_ENABLED=false`** in VJH `.env` — the fake-submission attempts that produced 1-9 cycle errors each cycle are now disabled.

### What's actually working in VJH (the honest list)

✅ Fetches ~1,900 jobs/cycle from ATS APIs
✅ Filters via JobGate (career-aligned + new May 21 hard-reject filters: coding tests, pedigree, location, AI-augmented bonus)
✅ Scores via 4-layer eval harness (131 tests, $0.03/run, Claude Haiku as L4 judge)
✅ Generates tailored cover letters (saved as .txt files to disk)
✅ Pushes lead to HubSpot with all context
❌ Does NOT auto-submit (intentionally — option (b) honest mode)
