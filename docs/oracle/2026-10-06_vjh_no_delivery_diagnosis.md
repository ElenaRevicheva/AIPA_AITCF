# Why VJH stopped sending you jobs (diagnosis, 6 Oct 2026)

**Short answer:** Two things broke, and neither one raised an alarm.

- **Torre has been dead since 2 Oct.** Torre is the source behind most of your good LATAM roles. Since 2 Oct it refuses every search VJH sends, and VJH writes that down as "✅ 0 jobs found".
- **The Google / Bright Data search still finds a few good jobs, but they get lost on the way into HubSpot.** Some are thrown away without a word because the company name came out blank. The rest attach to an old closed deal that you never look at.

The last new VJH job in your I act TODAY column arrived **3 Oct 13:09 UTC (08:09 Panama)**: "AI Product Manager @ Your Personal AI". Nothing new has arrived in the 3 days since.

This was a read-only check. Nothing was restarted, edited or written. Times are UTC (Panama is UTC−5).

---

## 1. Why VJH delivered nothing (ranked by good jobs lost)

**Before it stopped:** from 27 Sep to 3 Oct, 11 VJH jobs entered I act TODAY, about 1.6 a day. 6 went to Sent, you rejected 3, and 2 are still waiting (Clara and SIPEngines).

**Correction to an earlier number:** "only 2 reached I act TODAY since 15 Sep" was counting what is sitting there today. In fact 34 entered since 15 Sep, and you moved the rest out.

### 1. Torre is dead and the log says "fine"

This is the biggest cause, and it is the one that changed.

- **What Torre was worth:** it supplied 5 of the 9 jobs the hourly engine delivered since 27 Sep. It also supplied 3 of the 6 jobs you sent: Bjakcareer, Shadow Light and Niuro GTM.
- **Proof from the server log:**
  - `2026-10-02T01:54:33 ✅ Torre.ai: 551 jobs found`
  - then `2026-10-02T02:56:52 ✅ Torre.ai: 0 jobs found`
  - It has said 0 every hour since, including after the 5 Oct restart. The latest is `2026-10-06T16:13:33 ✅ Torre.ai: 0 jobs found`.
- **What Torre actually answers:** I sent Torre VJH's exact request, read-only, from Oracle. It returned `400 {"meta":{"message":"Invalid request"}}`. Torre changed what it accepts.
- **Why it stayed hidden:** in `job_monitor.py`:
  - line 1433 `if resp.status != 200: continue` skips the error
  - line 1478 `except Exception: continue` skips crashes
  - line 1482 still prints `✅ Torre.ai: {len(jobs)} jobs found`
- **Cost:** about 4–5 jobs since 2 Oct (an estimate; Torre was delivering about 1 a day). After it broke, only 2 more jobs came (Vercel and Your Personal AI, both on 3 Oct, and you closed both). Then nothing.
- Torre explains most of the stop, not all of it. The rest is thin supply plus causes 2–6.

### 2. Approved jobs are dropped silently when the company name is blank

This is on the Bright Data door, and it is an old problem.

- **The numbers:** since 29 Sep this door logged "I Act TODAY" 26 times, for 10 different jobs. 12 of those lines (6 jobs) had a blank company.
- **Where the job dies:**
  - cto-aipa refuses any job with no company: `cto-aipa.ts:2654-2655` returns HTTP 400 `'jobTitle and company required for hiring pipeline'`.
  - The ingest never reads that answer. `serpapi_jobs_ingest.py:547` throws away the result of `push_crm_event`.
- **The root bug:** `serpapi_jobs_ingest.py:245-247`. For a link like `jobs.lever.co/deuna/...` the code reads "jobs" as the company name, rejects it, and never looks at "deuna" in the rest of the link.
- **Proof from today's 11:00 run:** `IRON-CLAD FIT + judge OK -> I Act TODAY: DEUNA - Product Head of AI @ ` (nothing after the @). HubSpot has no DEUNA job deal at all, even though the job was approved 7 times.
- **Cost:** 6 approved jobs, at least 2 of them strong (DEUNA and Airtm). Overall, 69 of the 162 jobs that passed the first filter were lost this same way.

### 3. Approved jobs that match an old closed deal only get a note

- **What happens:** if a deal with the same name already exists, even one in Closed lost, cto-aipa adds a note and stops (`hubspot-client.ts:1752-1765`). The deal's stage does not change, but the ingest still logs "I Act TODAY".
- **How often:** 12 of the 26 "I Act TODAY" lines.
  - **HireLATAM, 11 times.** You rejected it on 29 Sep ("not a fit for me"), so keeping it closed is right. But every repeat produced a false "I Act TODAY" line, a new note and a paid Claude cover letter.
  - **Addi, once.** This one is a real loss. An automatic sweep closed it, not you. Its reason reads `AUTO-SWEEP 2026-09-28: INELIGIBLE (fails iron-clad on real posting text) — not Elena's decision; move it back to I Act TODAY…`. Today both the fit gate and the judge passed it, but it is still sitting in Closed lost.
- **Cost:** 1 good job (Addi).

### 4. The AI judge vetoed a job in your own lane

- `judge VETO (3i - The role focuses on creative AI video production, which is not aligned with her primary target lanes.) → discard: Shortical (AI Video Creator / AI Filmmaker)` (5 Oct).
- "AI Filmmaker" is listed by name in your lane i.
- **Cost:** 1 job since the stop.

### 5. A third of Bright Data searches fail

- 98 of 288 paid searches since 29 Sep came back as errors. Example: `BrightData error (fractional CTO remote latin america): Expecting value: line 1 column 1 (char 0)` followed by `→ 0 results`.
- There is no retry.
- The rate has been the same since before the stop, so it shrinks supply but did not cause the stop.
- **Cost:** unknown, because we cannot see what those searches would have returned.

### 6. The outreach step crashes

- `[outreach] ERROR Nuro: 'str' object has no attribute 'get'`, twice on 5 Oct, for the same job.
- **Cost:** 0–1 jobs; whether that job fits you is unverified.

### Why the system looked busy

- **"I Act TODAY" in the log does not mean a deal exists.** 26 of those lines produced 2 real deals.
- **"new jobs: 30" today was about 15 truly new.** The seen-list (`serpapi_jobs_ingest.py:224`, `list(seen)[-2000:]`) drops the same recent jobs at every save, so they come back every 12 hours.
- **Junk deals named "Hiring manager @ — outreach":** 13 since 29 Sep, 99 in total. They appear because "cto" matches inside words like "October" and "Director", and because jobs with a blank company still pass this step.
- **Boardy intro emails filed as hiring deals:** 10 since 3 Oct, under [HIRING-VJH-LEAD] in contractsent.

### Ruled out (no need to look again)

- **Your learned rules:** 0 vetoes on either path.
- **Old code on the server:** Oracle runs the current main, and the ingest restarted after its last change.
- **The I act TODAY sweep:** it has removed nothing since 28 Sep.
- **The new a16z boards:** they add jobs that get rejected, but they cannot crowd out other sources.
- **The parked pile:** the jobs rejected since the stop are mostly US-only employers.

---

## 2. Funnel per day since 27 Sep

### Door A: Bright Data / Google search (runs every 12h)

| Day | Found | New | Passed gates | Judge OK = "I Act" | Real new deal | Lost: blank co / old deal |
|---|---|---|---|---|---|---|
| 27 Sep | 198 | 56 | 1 | 1¹ | 0 | 1 / 0 |
| 28 Sep | 1,259 | 200² | 0 | 0 | 0 | 0 / 0 |
| 29 Sep | 322 | 97 | 2 | 2 | 1 Clara | 1 / 0 |
| 30 Sep | 228 | 88 | 7 | 4 | 1 Scale Army | 2 / 1 |
| 1 Oct | 229 | 46 | 5 | 3 | 0 | 1 / 2 |
| 2 Oct | 247 | 68 | 5 | 2 | 0 | 0 / 2 |
| 3 Oct | 256 | 51 | 4 | 4 | 0 | 2 / 2 |
| 4 Oct | 228 | 57 | 6 | 5 | 0 | 3 / 2 |
| 5 Oct | 167 | 51 | 4 | 3 | 0 | 2 / 1 |
| 6 Oct | 105 | 30 | 4 | 3 | 0 | 1 / 2 |
| **Total** | **3,239** | **744** | **38** | **27** | **2** | **13 / 12** |

- "Passed gates" means the job passed both the first filter (459 did) and the remote + LATAM + AI-augmented fit gate.
- ¹ The 27 Sep approval was logged before the judge was added.
- ² On 28 Sep there were 13 manual restarts and 3 runs were cut off, so that day's count is too low.
- The log has no timestamps; days are matched using HubSpot creation times.

### Door B: the hourly engine (Torre, Himalayas, job boards)

| Day | Torre jobs per hourly check | Passed gates | Real new deal |
|---|---|---|---|
| 27 Sep | often timing out | – | 2 |
| 28 Sep | often timing out | – | 0 |
| 29 Sep | timeouts, then fixed | 8 | 2 |
| 30 Sep | 583 | 6 | 1 |
| 1 Oct | 561 | 4 | 2 |
| 2 Oct | 551 once, then 0 | 5 | 0 |
| 3 Oct | 0 | 3 | 2 (not from Torre) |
| 4 Oct | 0 | 1 | 0 |
| 5 Oct | 0 | 5 | 0 |
| 6 Oct | 0 | 0 | 0 |

- Since 27 Sep the judge approved 9 of the 24 jobs it saw, and all 9 became deals.
- Since 3 Oct 13:10, 6 jobs passed the gates, and none became a deal:
  - 2 were vetoed by the judge (one UAE-only, which is correct; Shortical, which is wrong)
  - 2 scored too low
  - 2 crashed in the outreach step

### Both doors: real new I act TODAY deals per day

27 Sep 2 · 28 Sep 0 · 29 Sep 3 · 30 Sep 2 · 1 Oct 2 · 2 Oct 0 · 3 Oct 2 · 4–6 Oct 0. **Total: 11.**

---

## 3. Jobs worth applying to now

### Apply now (they passed every check, but you never saw them)

1. **DEUNA: Product Head of AI.** Link: jobs.lever.co/deuna/ec4f69ac-f28e-496e-b925-45d21c53e467
   - **Why it fits:** your AI leadership lane. It passed the fit gate and the judge 7 times, most recently today at 11:00 UTC, and the page loaded today.
   - **Why you never saw it:** the company came out blank, so HubSpot refused it silently.
2. **Airtm: AI Automation Engineer**, on Airtm's Lever page.
   - **Why it fits:** lane d (AI automation). It passed the fit gate and the judge on 4 Oct.
   - **Why you never saw it:** the same blank-company bug.
3. **Addi: Staff Product Manager, Conversational AI.**
   - **Why it fits:** lane a (AI product). Today it passed the fit gate and the judge on the full posting.
   - **Why you never saw it:** an automatic sweep closed it on 28 Sep, and its own note says to move it back. It is in Closed lost; one click moves it back to I act TODAY.
4. **Shortical: AI Video Creator / AI Filmmaker** (seen 5 Oct).
   - **Why it fits:** lane i names this exact title.
   - **Why you never saw it:** the judge vetoed it wrongly, and no HubSpot deal exists.
   - Check the pay and location first; they are not verified.

### Already waiting in your I act TODAY column since 29 Sep

- **Clara:** Remote AI Growth Automation Engineer
- **SIPEngines:** the role from Torre

### Maybe (only one investigator looked; not double-checked)

- **Truelogic: Senior Product Manager (AI & Creative Products).** The judge called Truelogic a body shop. The posting says 100% remote, a Latin American team and USD pay, and you already have a Truelogic role in Sent.
- **WON: AI Strategist (Remote, Medellín).** USD 6–9K a month, with overlap with US Pacific hours. It was parked only because the posting never names an allowed country.

### Skip these

- **HireLATAM:** you rejected it.
- **Niuro GTM Engineer:** wrongly vetoed on door A, but you already sent it through Torre.

### Warning

One auto-drafted letter on a parked deal (itD Content Strategist) says "I'm available to start immediately and am a direct W2 candidate." That is false for you. Read every auto-letter before you send it. (One investigator found this, in 1 of 60 notes sampled.)

---

## 4. Fix plan (smallest first)

Every code item needs your Confirm before it touches Oracle. VJH deploys by git on Oracle and then needs a restart; cto-aipa deploys by named-file scp and `pm2 restart --update-env`. Each line says what pays off.

**If you confirm only three: items 0, 1 and 9.**

0. **Addi back to I act TODAY.** One stage change in HubSpot, as its own close note asks. **Proof:** it shows in your column. **Payoff:** 1 job.
1. **Read the company name from Lever links.** In `serpapi_jobs_ingest.py:245-248`, for jobs.lever.co links, take the first part of the path as the company, the same way the Greenhouse and Ashby lines right below already do. **Proof:** the next run logs `I Act TODAY: DEUNA - Product Head of AI @ Deuna`, and a DEUNA deal appears in I act TODAY. **Payoff:** DEUNA, Airtm and every future Lever job.
2. **Stop the silent drop.** At `serpapi_jobs_ingest.py:547`, read what `push_crm_event` returns, log "CRM REJECTED" when it fails, and print "I Act TODAY" only after HubSpot accepts the job. **Proof:** in each run, the number of "I Act TODAY" lines equals the number of cto-aipa `Hiring deal → … qualifiedtobuy` lines. **Payoff:** an honest log.
3. **Make Torre report its errors.** At `job_monitor.py:1433` and `:1478`, log the HTTP status and the error instead of skipping silently. **Proof:** the server log shows "Torre … HTTP 400" instead of "✅ 0 jobs found". **Payoff:** an honest log.
4. **Stop the junk "Hiring manager" deals.** In `serpapi_jobs_ingest.py:575-587`, skip jobs with a blank company and match "cto" only as a whole word. **Proof:** no new "Hiring manager @ — outreach" deals over the next 2 runs. **Payoff:** less noise.
5. **Make the seen-list keep the newest jobs.** In `serpapi_jobs_ingest.py:224`, keep seen jobs in arrival order so the oldest are dropped, the way the hourly engine's 21-day list already works. **Proof:** after the next run every processed job is in `serpapi_jobs_seen.json`, and HireLATAM and DEUNA are not re-processed 12h later. **Payoff:** fewer repeats and less spend.
6. **Retry Bright Data once.** In `serpapi_jobs_ingest.py:310-313`, retry once when the answer is empty or not JSON, copying the retry cto-aipa already uses (`brightdata-enrich.ts:158-171`). **Proof:** the error rate falls below 34% (it is 98 of 288 now). **Payoff:** more jobs found.
7. **Stop filing Boardy emails as jobs.** Add Boardy's sending domain to the existing `VJH_BD_DOMAINS` setting in Oracle's `.env` (today it lists only fermatix.ai). **Proof:** no new "[HIRING-VJH-LEAD] … Boardy" deals. **Payoff:** less noise.
8. **Treat a closed deal as decided.** In `hubspot-client.ts:1752-1765`, when the matching deal is Closed lost, answer "already decided" (no note, no daily-queue entry), and do this check before the cover letter is drafted at `:1694-1709`. **Proof:** the ingest logs "already decided: HireLATAM", and no `[cover-letter] drafted` line comes before an "already exists" line. **Payoff:** no false approvals and no paid letters for repeats.
9. **Repair Torre.** First probe search.torre.co, read-only, to learn what request it now accepts. Then update the Torre request in `job_monitor.py`. **Proof:** `✅ Torre.ai: N jobs found` shows hundreds again, and a Torre job reaches I act TODAY within days. **Payoff:** the biggest one. How big the change is stays unknown until the probe.
10. **Make the judge respect all 9 lanes.** In the prompt in `llm_judge.py`, count lanes d, f, h and i as targets; right now it vetoes them as "not AI product management". **Proof:** Shortical and Niuro GTM Engineer get OK when re-judged. **Payoff:** about 1 job a week.
11. **Fix the outreach crash.** `founder_finder_v2.py:314` receives `company_intel` as text, not a dictionary. **Proof:** no more `'str' object has no attribute 'get'` errors.
12. **Unrelated security leak (one investigator, not re-checked).** The Telegram bot token is written into the server log about every 10 seconds by the httpx library. Set httpx logging to WARNING. **Proof:** no new "api.telegram.org/bot" lines in the log.

---

## 5. Named concepts

- **Silent failure (a swallowed error).** Torre refused every search, and the log said "✅ 0 jobs found". It is like a delivery book that writes "0 boxes ✅" when the supplier actually refused the order. "Nothing found" and "the call failed" must never print the same line.
- **Acknowledgement is not completion** (also called **fire-and-forget**). VJH wrote "I Act TODAY" before HubSpot answered, and HubSpot answered "no". It is like marking a letter "posted" when it was returned for having no address. A step is done only when the next system confirms it.
- **Concentration risk.** One source, Torre, carried 5 of the hourly engine's 9 deliveries. When Torre changed its API (a **breaking upstream change**), the whole column went quiet. It is like a shop with one main supplier.
- **Idempotency, and "seen" versus "decided".** Matching by deal name correctly stops HireLATAM being created twice. But the system cannot tell "I have seen this" from "Elena already said no". A closed deal should act as a **tombstone**: quiet, not a fresh "I Act TODAY" line, a note and a paid letter, 11 times over.
- **Cache eviction policy.** The seen-list keeps 2,000 entries but trims them by a fixed internal order, not by age, so the same recent jobs fall out at every run. "new jobs: 30" was about 15 truly new. A count that includes repeats is a **vanity metric**.
- **Transient failure, then retry.** A third of Bright Data calls fail once and would probably work a second later. cto-aipa already retries; VJH does not.

**Interview line** (lane: AI-automation solutions architect):

> "Our AI job-matching pipeline went from about 1.6 qualified roles a day to zero for three days, and every log line stayed green. I traced it back from the CRM. A supplier API had started returning HTTP 400, and our client logged that as '✅ 0 jobs found', a silent failure. The same audit found a second leak: 12 of 26 roles our AI judge approved never reached the CRM, because a URL parser returned an empty company name and the push was fire-and-forget. The rule I took from it: an empty result and a failed call must never look the same, and a step isn't done until the downstream system confirms it."

---

## 6. Still unverified

- What request Torre now accepts, and whether the break is permanent.
- The 4–5 jobs Torre would have delivered since 2 Oct. That is an estimate from its earlier rate of about 1 a day.
- Whether DEUNA, Airtm and Shortical are still open, pay at least $3k a month and hire from Panama. DEUNA's page loaded today; Airtm was last seen 4 Oct.
- Whether Truelogic, WON, NeueHealth (Senior AI PM) and MNTN (GTM Engineer) were parked wrongly. Only one investigator checked them.
- How many on-lane jobs the fit gate drops only because the posting names no country (`fit_gate.py:389-408`). This should be measured before anything is changed.
- Why Bright Data answers with something that is not JSON (an empty body is inferred, not captured), and why non-job sites get past the site filter.
- Whether the "Nuro" job that crashed in outreach fits you.
- That about 73% of the parked pile is off-lane. This is a first-pass count over 153 deals and was not re-checked.
- Whether the BORDERLINE Telegram alerts were actually delivered (the code does not log it).
- The W2 claim in a cover letter and the Telegram token leak. Each was found by one investigator and not re-checked.