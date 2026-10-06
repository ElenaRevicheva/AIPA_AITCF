# Puente — Founder's Associate (Role 2679) — evaluated 2026-10-06 · judges: SKIP (pay below floor) · Elena: APPLY

**Decision**
- **Judges' verdict:** SKIP (3 of 3).
- **Elena's decision (6 Oct):** apply — her call, made while the evaluation was still running. Staged as `[HIRING-MANUAL] Founder's Associate @ Puente Talent Partners` with the full kit; resume = `cv-by-job/puente-founders-associate/` (ChatGPT structure + verified facts + her OmniBazaar facts, 3-reviewer check).
- **What decides it:** the top of the band, $2,600/month, is below her written floor of $3,000/month (`target_lanes.py:25`).
- **What would flip it:** Puente confirms in writing that this client will pay at least $3,000/month. Separately, Elena could make a deliberate exception to her own floor; no agent can make that call for her.

## The role in one paragraph

The client is a profitable US e-commerce company, over 20 years old, with 8-figure annual revenue. It is a top 1% Amazon seller in its category and is now building a direct B2B channel to institutional buyers. The job is about half strategic and half executive assistant. The strategic half is market research that ends in a recommendation, hiring support, and fixing operational bottlenecks. The assistant half is inbox triage, project tracking, scheduling, travel and points, and call and meeting summaries for the CEO. Pay is $1,800–2,600 USD/month as a full-time independent contractor, paid directly by the US company. Hours are Monday to Friday, 9 AM–6 PM EST. In Panama that is **8:00–17:00 until 1 Nov 2026**, then **9:00–18:00**. Puente's process: a PDF resume plus a skills assessment (the form says 3 short video questions, about 5 minutes), then a WhatsApp intro, a recruiter interview, a client interview, and a background check. Puente files the role under "Administrative Support". The same role was listed at **$3,000–4,000 in July**. It now has the same band as Puente's plain Executive Assistant role #2605.

## Her rules vs this posting

| Her rule / requirement | This posting | Result |
|---|---|---|
| Pay floor $3,000/month (`target_lanes.py:25`; older profile says $3,500) | $1,800–2,600. The top is $400 short. That is about $9–15/hour on fixed hours, against about $17.30/hour at her floor | **FAIL** |
| Fully remote, open to LATAM/Panama | Remote, LATAM. Panama is on Puente's 18-country list | PASS |
| Hours that work from Panama | 8:00–17:00 Panama until 1 Nov, then 9:00–18:00. That is her whole working day | PASS (it costs her the full day) |
| No coding test | Video questions and possibly typing or grammar tests. No coding test found | PASS |
| Lane fit: AI-Qualified Executive Support | Strategic half fits. It is filed as "Administrative Support" and includes "travel and points", which comes close to the lane's exclusion clause (`target_lanes.py:181-182`) | GAP (partial fit) |
| E-commerce experience (posting requirement) | Required. She has none she can verify | **FAIL** |
| AI in the work itself | "You lean heavily on AI to build workflows and automate the routine." Claude and ChatGPT daily | PASS |

## Where she is strong

- **Executive and board background.** She was Deputy CEO for Corporate Governance and Chief Legal Officer at JSC E-GOV OPERATOR, a company of about 60 people, from 2011 to 2018. She organized board meetings and carried the board's decisions into implementation. This matches the posting's bonus item on board-level reporting (`user_elena_profile.md`, her own words).
- **AI-native every day.** She does her work through Claude Code and Cursor and runs a 15-service operating unit with 20 scheduled jobs (`docs/applications/cv-by-lane/lanes.json`).
- **Finds and fixes operational bottlenecks:**
  - A trial-signup-to-HubSpot integration had been broken since launch. She found the cause, fixed it and backfilled all 28 users who were never recorded (`scripts/build-lane-cv.cjs`, "loop").
  - The server disk hit 95%. She compressed 8.5 GB of logs to 310 MB (`docs/interview/defense-bank.json`, "incident").
  - Some filters had been silently switched off. The first run after her fix rejected 5 junk results (`defense-bank.json`, "bottleneck").
- **Tracking at volume.** She runs a CRM loop of 2,800+ deals where agents research, qualify and draft, and a human approves each send (`build-lane-cv.cjs`, "loop").
- **Decides from data:**
  - She cut a role category that produced 58% of her rejections and only 17% of her positives (`lanes.json`, fact 1).
  - She kept a job source that scored 72.4% against about 5.6% for the alternative (`defense-bank.json`, "kpi").
- **Detail.** She replayed 51 rejected items and caught 20 that were wrong (`lanes.json`).

## Where she is weak

- **E-commerce is a listed requirement, and she has nothing to show for it.** OmniBazaar ("decentralised e-commerce") has no bullets anywhere and is flagged as unverified (`2026-09-25_torre_founder_right_hand_answer.md:19`). Nothing shows Amazon, marketplace or B2B sales work. Her first 90-day deliverable, a market-research recommendation, would be in exactly that domain.
- **Hiring for an employer: gap.** VJH works on the candidate side. Nothing shows her screening or hiring for a company.
- **Meeting and call summaries: gap.** These are a core part of the 90-day success definition.
- **Scheduling, travel and points: gap.** Her calendar watcher is still open.
- **English C1.** Her CV says "fluent (professional)". There is no certificate on record.
- **Financial metrics.** No P&L or budget work is on record. Her only investor material is a 14-slide pitch.
- **Overqualification read.** A former Deputy CEO applying to an assistant-priced contractor seat tends to signal "she will leave" (`project_root_cause_no_demand_channel.md`). Puente sells clients "97% retention beyond 12 months", so its recruiters screen for exactly that risk.
- **Track record in this family of roles:** 2 applications, 0 replies (EdgeUno Chief of Staff, 41 days in Sent; Agent Exec Ops & Finance). She has never applied through Puente.
- **Salary anchoring.** The Puente form requires a monthly salary expectation (dropdown). *Correction after re-reading the live form: Current Salary is optional (no asterisk) — leave it blank.*

## If she applies anyway

**Strongest angle (verified facts only, framed as the CEO's right hand rather than as a founder):**
"From 2011 to 2018 I was Deputy CEO for Corporate Governance and Chief Legal Officer at a ~60-person company moving public services online. I organized its board meetings and carried the board's decisions into implementation. Today I work through Claude and Cursor every day: I run a 2,800+ deal CRM loop where agents research and draft and a human approves each send, and I hunt for silent failures. I found a signup-to-CRM integration that had been broken since launch and backfilled all 28 lost users. I have not run an Amazon business, so my first two weeks would go to mapping your recurring pain points and standing up the triage and tracking system this role is measured on."

**The assessment probably needs** (the form says it tests "written communication, accuracy and attention to detail"):
- 3 short video answers, about 5 minutes in total (2679 form).
- Possibly a typing test and an English grammar test (Puente's #2609 posting) or a written exercise of about 20 minutes (#2657).
- Whether it is timed, and whether AI use is allowed, is unknown.

**Salary fields:** fill them deliberately at ≥$3,000. Do not let the form anchor her below her floor.

**Do NOT claim:**
- E-commerce or Amazon experience, or any OmniBazaar outcome
- Employer-side hiring
- Any team size, or "cross-functional IT, legal and compliance teams" (hold until she confirms)
- "Solo"
- Coding without AI
- Slack, Sheets, Zapier or Notion experience
- "131 tests" (stale; use "600+" only)
- "76% vs ~21%" (the verified figure is 72.4% vs ~5.6%)
- EspaLuz as traction

## Judges

- **Money:** SKIP, medium confidence.
  - Every point in the band is below her floor: $21,600–31,200 a year against $36,000.
  - On fixed hours that is about $9–15/hour, and it takes the full working day from paths that pay more.
  - The client cut this role from $3,000–4,000 in July, so it has priced the seat at assistant level.
  - Confidence is medium only because applying costs about 30 minutes, and the decision to accept below-floor pay belongs to Elena.
- **Hiring manager:** SKIP, high confidence.
  - The seat has been repriced as an EA seat.
  - E-commerce is required and she cannot verify any.
  - She would read as an overqualification and flight risk on a seat whose agency sells retention.
  - She matches only about half of the 90-day success picture.
- **Rules skeptic:** SKIP, high confidence.
  - It fails her written $3,000 floor.
  - Her prepared plan for Coconut VA, which had the same band and hours, was to "decline politely".
  - The admin half comes close to the lane's exclusion clause. It is not a clean exclusion, because the posting requires AI workflow building.
  - The cost is high: assessment, videos, WhatsApp screen and interviews.
- **Disagreement:** none on the verdict. They differed only on confidence (medium vs high) and on how firmly lane fit fails. I resolved it with pay as the deciding fact, because all three judges agree it fails on the posted numbers alone. Lane fit stays marked GAP, not FAIL.
- **Better roles on the same board:** all three judges pointed to these instead.
  - **Chief of Staff #2663:** $3,500–5,000, a different client. Board and investor materials, 6+ years, 9–6 Central. That is 9:00–18:00 in Panama until 1 Nov, then 10:00–19:00.
  - **AI Operations Lead #2660:** $3,000–4,000. Only the pay band was checked, so read the full posting before deciding.
  - Apply to either only once Elena decides.

## Unverified

- Whether Puente or the client would negotiate above $2,600. The only evidence is that the band fell from $3,000–4,000 in July.
- That the July listings were the same client. The listings name the same Amazon e-commerce client, but this was not re-checked.
- Whether "EST" means US Eastern local time (8:00–17:00 in Panama until 1 Nov) or EST all year (9:00–18:00 in Panama).
- Whether the 9–6 day includes an unpaid lunch hour. The hourly figures assume 40–45 hours a week.
- Whether her $3,000 floor is gross or net for a contractor.
- Whether the assessment is timed or restricts AI use.
- Puente's margin, who runs it, and the posting date for #2679.
- Puente's "2,873 placed" and "97% / 96.8% retention" claims. These do not fit a company founded in 2024 whose domain was registered in Oct 2025. Treat them as marketing.
- Puente reviews or complaints. Reddit was blocked to the scraper, so none were found either way.
- The inbox-triage proof point (response_detector, 834 / 9,551 messages). It exists in memory only, not in the CV fact bank.
- Whether a Puente recruiter would screen her out for overqualification. This is inferred, not observed.
- The full #2660 posting, and whether the 2011–2018 E-GOV years satisfy #2663's "6+ years".
- The outcomes of the Torre "founder's right-hand" application and the Toxic Arts replies.
- Whether 8:00–17:00 Panama time fits her household schedule.

## Sources

- https://puentetalent.com/jobs/founder-s-associate-2679
- https://puentetalent.com/jobs
- https://puentetalent.com/jobs/chief-of-staff-2663
- https://puentetalent.com/jobs/bookkeeper-2609
- https://puentetalent.com/jobs/client-success-manager-2657
- https://puentetalent.com/ · https://puentetalent.com/about · https://puentetalent.com/privacy · https://puentetalent.com/terms · https://puentetalent.com/compare/puente-vs-bpo
- https://www.getonbrd.com/jobs/operations-management/founder-s-associate-puente-talent-partners-remote
- https://www.getonbrd.com/jobs-business-cases
- https://trabajoremotochile.com/jobs/founders-associate-puente-talent-partners-3fs1l_
- https://ar.linkedin.com/jobs/view/founder-s-associate-at-puente-talent-partners-4441532842
- https://www.linkedin.com/company/puente-talent-partners/
- https://gridinsoft.com/online-virus-scanner/url/puentetalent-com
- D:/aideazz/VibeJobHunterAIPA_AIMCF/src/core/target_lanes.py (line 25 MIN_PAY_TEXT; lines 181–182 exclusion clause)
- D:/aideazz/VibeJobHunterAIPA_AIMCF/autonomous_data/judge_feedback.json
- D:/aideazz/VibeJobHunterAIPA_AIMCF/autonomous_data/judge_decisions.json
- D:/aideazz/ai-cofounders/cto-aipa/docs/applications/2026-09-04_coconut_va_wellfound_reply.md
- D:/aideazz/ai-cofounders/cto-aipa/docs/applications/2026-09-25_torre_founder_right_hand_answer.md
- D:/aideazz/ai-cofounders/cto-aipa/docs/applications/cv-by-lane/lanes.json
- D:/aideazz/ai-cofounders/cto-aipa/scripts/build-lane-cv.cjs
- D:/aideazz/ai-cofounders/cto-aipa/docs/interview/defense-bank.json
- C:/Users/kirav/.claude/projects/D--aideazz-ai-cofounders-cto-aipa/memory/user_elena_profile.md
- C:/Users/kirav/.claude/projects/D--aideazz-ai-cofounders-cto-aipa/memory/project_career_focus.md
- C:/Users/kirav/.claude/projects/D--aideazz-ai-cofounders-cto-aipa/memory/project_vjh_iron_rules.md
- C:/Users/kirav/.claude/projects/D--aideazz-ai-cofounders-cto-aipa/memory/project_root_cause_no_demand_channel.md
- C:/Users/kirav/.claude/projects/D--aideazz-ai-cofounders-cto-aipa/memory/project_vjh_detected_responses_gap.md
- HubSpot CRM, read-only search (no records changed, no ids cited)

## Re-checked by hand after the judges (6 Oct)

- Live form fields: name, email, phone, city, country, **Monthly Salary Expectation (required)**, Current Salary (optional), how you heard, LinkedIn (required), GitHub, resume (PDF/DOC/DOCX ≤5 MB). **No cover-letter field.** After applying: 3 short video questions by email (~5 min).
- July listing (trabajoremotochile, expired): **$3,000–4,000**, same client, and e-commerce was listed under "Deseable (Plus)" — now it is a requirement. (Aggregator rewrite in Spanish; Get on Board original closed.)
- Same board, read in full: **AI Operations Lead #2660** ($3,000–4,000, 9–6 CT) — "shipped automations that save hours"; n8n / Make / Zapier / LLM APIs; 3+ years operations or automation; bonus Python, LLM APIs, agent frameworks. **Chief of Staff #2663** ($3,500–5,000, 9–6 CT) — "not an executive assistant or scheduler"; 6+ years across operations, strategy, consulting, banking or prior CoS; investor and board materials; bonus founder background, AI fluency.

