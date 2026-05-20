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
