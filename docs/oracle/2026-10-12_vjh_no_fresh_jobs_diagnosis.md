# Why VJH stopped delivering fresh jobs into I Act TODAY (diagnosis, 12 Oct 2026)

**Short answer:** the Bright Data account was **suspended for unpaid balance on 7 Oct at 14:28 UTC**. From then on
every job search VJH sent came back empty — 180 of 180 searches over 10 runs — and every run still printed an ordinary
`Done — new jobs: 0`, so it looked like a quiet day. The hourly engine kept running but had little new supply, and
Torre has refused outside requests since 2 Oct. **Elena topped up $10 on 12 Oct; Bright Data answers again** (verified
below). Nothing broke in cto-aipa, HubSpot or the AI models.

Method: 5 read-only investigators (HubSpot timeline, hourly engine, Bright Data ingest, cto-aipa receiver, LLM
providers), one synthesis, two adversarial verifiers (timeline + mechanism). Times UTC; Panama = UTC−5.
Same method as `2026-10-06_vjh_no_delivery_diagnosis.md`.

## 1. Timeline (HubSpot dealstage history = ground truth)

- **Last VJH job into I Act TODAY:** `[HIRING-VJH-LEAD] HQ AI Enablement Lead @ Everfield`, 2026-10-10 00:44:14
  (hourly engine). Elena closed it 11 Oct 11:23. Before it: Liminal 8 Oct 08:41; the last Bright Data deals were DEUNA
  and Robots & Pencils, 7 Oct 06:25–06:26.
- New VJH deals into I Act TODAY per day: 6 Oct 8 (one-off burst after the 6 Oct fix) · 7 Oct 2 · 8 Oct 1 · 9 Oct 0 ·
  10 Oct 1 · 11 Oct 0 · 12 Oct 0.
- Nothing was delivered and then taken away: every VJH exit since 6 Oct was Elena's own click (CRM_UI). (One non-VJH
  deal, Allied Revenue `[HIRING-MANUAL]`, was closed by VJH's dead-posting sweep on 9 Oct 12:55 — "posting closed".)

## 2. Causes, ranked

### 1 — Bright Data account suspended for unpaid balance (NEW) — fixed by Elena's top-up 12 Oct
- Bright Data's own emails: 4 Oct "$1.80 left", 6 Oct "$0.79 left", **7 Oct 14:28 "Your account has been suspended due
  to insufficient funds"** — they went to an inbox nobody watches for the pipeline.
- `GET /status` before the top-up: `{"status":"suspended",…,"auth_fail_reason":"customer_suspended"}`.
- serpapi-jobs: the 7 Oct morning run `Done — new jobs: 32`; every run after: `BrightData error (…): empty body — retry
  failed too` → `→ 0 results` → `Done — new jobs: 0` (10 runs × 18 searches). Last POST to HubSpot 7 Oct 06:28:04.
- Same token feeds cto-aipa's client-prospect search (`[BD-SERP] non-JSON after retry`), which was already degrading
  from 3 Oct and went fully dark on 7 Oct.
- **After the top-up (12 Oct, Claude Code probes):** `/status` → `"status":"active"`; a Google search through
  web_unlocker1 → HTTP 200, ~20 KB, `x-brd-status-code: 200`; VJH's exact job-board query (site filter) → 10 results
  in 3 s (Wellfound, Lever). The first probes in the minutes right after the top-up still failed (empty body, then
  `x-brd-error: waiting for selector "#main" failed`, 502) — reinstatement took a few minutes.
- Next scheduled serpapi-jobs run: ~18:50 UTC 12 Oct (process sleeps 12 h; last run 06:49). **Proof it worked:**
  `[SerpJobs]   → N results` with N > 0 and `Done — new jobs: N`.

### 2 — Torre refuses every outside request since 2 Oct (same as 6 Oct cause #1) — no code fix allowed
- History: 28–29 Sep we fixed two real Torre bugs — `5af1858` (20 s timeout was discarding 610 LATAM jobs; now 90 s)
  and `b755f13` (closed-banner). Torre then delivered ~590 jobs per check (30 Sep–1 Oct, 45–47 good checks a day).
- **2 Oct ~02:56 Torre changed its door**: every request now gets `HTTP 400 {"meta":{"message":"Invalid request"}}`.
  It answers only its own app; getting around that means pretending to be Torre's client, which its terms forbid
  (6 Oct decision: never circumvent). The 6 Oct fix (`83d8d04`) only made the failure honest in the log:
  `❌ Torre.ai: 0 jobs — 3/3 requests failed (HTTP 400 …)` — still the line on 12 Oct 11:18.
- Torre supplied 5 of the hourly engine's 9 deliveries 27 Sep–2 Oct and 3 of the 6 jobs Elena sent.
- Only legitimate route: ask Torre for partner/API access (Elena's call).

### 3 — Thin supply on the hourly engine (partly novelty decay)
- New jobs accepted per day 7–12 Oct: 67 / 52 / 23 / 13 / 9 / 8; iron-clad gate passes 6 / 2 / 2 / 1 / 1 / 0. Sources
  are flat at ~4,300 postings an hour; most are already seen. The 6 Oct burst used up the newly added Puente/Himalayas
  postings. Since Everfield: 27 failed the iron-clad gate, 1 passed (Tether) and the judge vetoed it.
- The gate's FAIL line does not say WHICH sub-check failed (remote / LATAM / US-only / AI-augmented) —
  `nodes.py:137-145`, `fit_gate.py:367-437`. Measure before changing anything.
- **Hacker News source is dead (silent):** `job_monitor.py:610-617` asks Algolia for "who is hiring" sorted by
  RELEVANCE, which returns the 2020 thread (objectID 22665398) every cycle — the October thread is never read.

### 4 — Judge time-zone gap (same family as 6 Oct cause #4)
- `parked by judge VETO (… three hours of overlap with Pacific Time, which is incompatible with her UTC-5 schedule.):
  Epoch AI - Product Manager, Website` — wrong: in October Panama is 2 h AHEAD of Pacific (9–17 PT = 11–19 Panama).
  `llm_judge.py:176-177` lists only ET/CT/UTC-5/UTC-6 as compatible.
- Parked deals worth one human look in "🤖 AI working — ignore": Epoch AI, Airtm (approved 4 Oct, vetoed 6 Oct).

### 5 — Silent failure (same family as Torre's old "✅ 0 jobs")
- An all-failed run prints the same `Done — new jobs: 0, client prospects: 0` as a quiet day
  (`serpapi_jobs_ingest.py:903`); there is no alert path for search failures.
- Also silent (old, since 26 Sep): on-lane postings the gate passes as "UNVERIFIED — needs a human look" get scored on
  an empty posting and discarded (7 of 9 since 23 Sep), so a human never sees them.

## 3. Healthy — do not re-investigate
- vibejobhunter up since 7 Oct 21:14, 23–24 cycles a day, `errors=0` on every LangGraph cycle since 5 Oct 16:04.
- cto-aipa writer + HubSpot: every crm-event became a deal or a correct de-dup; last 400 on 6 Oct 11:14; no 5xx.
  Nothing arrived on 9, 11, 12 Oct.
- AI models: 0 `JUDGE UNAVAILABLE` / `AI-OUTAGE` / `NO score` 1–12 Oct. OpenAI (VJH key) failed 11 Oct ~18:53 →
  12 Oct ~11:19; 47 calls fell back to Gemini; no job lost. **OpenAI answers again since 12 Oct ~11:19** (1-token
  probes HTTP 200 on both keys). Anthropic still "credit balance is too low" (last in VJH's chain).
- 6 Oct fixes hold: Lever company names, decided-deal tombstone, honest Torre line, no "Hiring manager @ —" junk,
  Boardy blocklisted.

## 4. Fixes inside the existing design — each needs Elena's go (VJH commit + deploy + restart)
| # | Fix | Size | Proof it worked |
|---|---|---|---|
| a | Run serpapi-jobs now instead of waiting for ~18:50 UTC (`pm2 restart serpapi-jobs`) | restart only | `→ N results`, `Done — new jobs: N` |
| b | ✅ DONE 12 Oct (VJH 7b4a975 + 6a0a94e): PT/MT compatible — prompt line + code overrule `timezone_veto_is_wrong` (the prompt alone did not stop the live veto) | small | Epoch AI → `criterion-2 veto overruled — US time-zone overlap fits UTC-5` |
| c | HN source: ask Algolia by DATE (`search_by_date`), `job_monitor.py:610-617` | 1 line | `Hacker News: N jobs` from the current month |
| d | Count failures in the Done line: `Done — new jobs: 0 — 18/18 searches FAILED` | logging only | next failed run shows the count |
| e | Telegram ping when every search in a run fails (existing helper `:98-140`) | NEW check — explicit go | ping on an all-failed run |
| f | Gate FAIL line names the failed sub-check | logging only | `[gate] FAIL … (NOT iron-clad: LATAM)` |
| — | Bright Data auto-recharge, or a balance alert to Telegram | Elena's account | no more suspensions |

## 5. Named concepts
- **Prepaid dependency exhaustion + alert to the wrong place** — the vendor warned ($1.80 → $0.79 → suspended), but
  into an inbox, not the pipeline's monitoring.
- **Silent failure: "200 OK" is not success** — an empty 2xx body was logged as "0 results".
- **Shared fate (blast radius)** — one Bright Data account fed both VJH's job search and cto-aipa's client search.
- **Graceful degradation that worked** — OpenAI dry ~12 h, 47 calls fell to Gemini, no job lost.

Disclosure: two investigators wrote log copies to `/dev/shm/.x` (10 MB) and `/dev/shm/.x_720488` on Oracle; removed
by Claude Code 12 Oct (this session's own leftovers).
