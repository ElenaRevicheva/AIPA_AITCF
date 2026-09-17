# VJH target lanes — dry-run replay (16–17 Sep 2026)

**Status: built, tested, NOT deployed.** Branch `claude/vjh-ai-roles-lanes` on
`VibeJobHunterAIPA_AIMCF` (commits `28d6068`, `10d5894`, `40b32e9`). Live service untouched,
no HubSpot writes. Deploy waits on Elena.

## What broke

Zero "I ACT TODAY" jobs 13–16 Sep. AI product management and AI leadership were
opened in the gates, searches and config on 2026-08-05, but never reached the two
LLM prompts — the judge and the scoring prompt. Jobs scored 85–100 and were then
vetoed as "not a hands-on builder". The lane lived in ~7 places and drifted.
Live vetoes also used reputation ("toxic political environment"), customers as
headcount ("works with 30,000 businesses"), invented employee counts, and US
Eastern hours as "incompatible" with Panama (which is UTC-5).
The judge's feedback file taught it from VJH's own cover-letter text: 10 of 12
"rejected" examples were bot prose labelled "her reason".

## What changed (on the branch)

- `src/core/target_lanes.py` — one list, 8 lanes, 120+ titles: AI product & program
  management; AI solutions architecture & consulting (incl. AI Systems Consultant);
  AI leadership & transformation (incl. Chief AI Officer, Fractional CAIO, Head/VP/
  Director of AI); AI automation & operations; AI-augmented builder; GEO/AEO; AI-qualified
  executive support (incl. AI-Proficient EA); expert AI evaluation (contract).
- Judge + scoring prompt both render that list. Judge criteria: remote; holdable from
  Panama (ET/CT compatible); in a lane (AI work only); four coding disqualifiers only
  (CS degree required, leetcode/live coding, low-level systems, mainly hand-coding);
  non-AI roles out, AI leadership in; size = employees of certain household-name
  enterprises only, marketplaces are not the employer, never reputation; stated pay
  under $3,000/month; no guesses. Scorer loses +15 Staff/Principal, gains -25 for
  CS-degree/leetcode/hand-coding.
- Gates (`job_gate`, `fit_gate`) accept every lane title; Torre, Remotive, Himalayas,
  Get on Board and Bright Data (the ingest still named `serpapi_jobs_ingest.py`) search
  the new lanes (+4 paid Bright Data queries / 12h).
- `judge_feedback_sync.py` strips the current cover-letter bot note.
- `evals/test_target_lanes.py`: every lane title through every layer — 413 passed.
  Full evals in the worktree: 528 passed; 3 provider-chain tests fail only because
  the worktree has no `.env`.

## Replay — 51 jobs the live judge vetoed, 2–16 Sep, re-judged with the new code

**20 would now reach her:**
AI Solutions Architect @ Kenility · Technical Product Manager (AI/GenAI/Agentic) @ Entellux ·
Commercial Product Manager – AI Integrations @ APPNEURAL · AI-First Product Manager @ Centro.team ·
Product Manager AI Personalization @ Trafilea · Senior Product Manager, Orchestrator @ Chili Piper ·
Senior Solutions Engineer – LATAM @ Fin · AI Architect (GenAI, contract) @ Work Technologies ·
Forward Deployed Analytics Engineer @ Improvado · AI Systems & Creative Operations Assistant (Torre) ·
AI Automation Instructor, contractor (Torre) · AI/ML Engineer, AI e-commerce (Toptal) ·
AI Engineer @ Sunrise Systems · AI Engineer, Agentic Workflows @ Shivsys · Senior AI Engineer, Agents @ Telepatia AI ·
Senior AI/ML Engineer @ Gravity9 · AI & Marketing Analytics Specialist @ Niuro · Remote AI Prompt Engineer @ BPM LLP ·
AI/ML Engineer (Agentic) @ ASOFT Consulting · AI agent engineer @ Sticker Mule

**31 stay rejected, each for a stated reason:** onsite onboarding (EROS); country-locked
(Provectus EMEA list, Wing Assistant Malaysia, micro1 US/CA/UK, Livefront Peru hub);
IST or CET hours (Hollborn, Shivsys IST role, LA SIESTA); mainly hand-coding in C#/.NET,
Rails, SAP, React, backend (PMG, Proxify, Kelvra, COGNIBOTZ, FlairTech, NMK); non-AI work
(Payabli payments PM, Bomi Lab, AutoRaptor copywriter, Excelon claims, HireTech calendar EA);
ML model training (EVB, DevUps, Hire Hangar, Protege, Dataiku trainer); labeling gig (Micro1is);
large enterprise or outsourcing (Hexaware, TransUnion, Bankrate, Fulcrum, Conch, Developers.Net).

**Honest caveats**
- LLM verdicts vary run to run: between two replays, NMK and Protege flipped from pass
  to fail. Borderline jobs can go either way.
- Descriptions are the ≤1,500 chars stored at the time, not a fresh fetch.
- Judge's first provider (OpenAI) returned 429 in an eval probe today; the chain fell
  through and verdicts still came back. Not fixed here.

## 17 Sep — Elena's answers applied (commit `40b32e9`)

- **Years of experience:** "N+ years" of overall, management, product, consulting or AI
  experience is MET (seven executive years plus AI building), in both the judge and the
  scorer. Only years of hand-writing code on a mainly-coding job count against — the rule
  `fit_gate` already applied. Replay 3: Kenility (5+ yrs) and Shivsys (7+ yrs) pass;
  no job of 51 rejected for years; 19 pass.
- **No SerpAPI.** Verified in code: `serpapi_jobs_ingest.py` has called only Bright Data
  since 31 May; nothing in `src/` or `scripts/` calls serpapi.com. The name is historical.
  Docstring now says so; the unused `SERPAPI_KEY` read is removed.
- **Why verdicts flip between runs:** temperature is already 0. The flips come from the
  provider chain — OpenAI rate-limits some calls, so a different model judges those jobs.

### ⚠️ Orphan process from 16 May — needs Elena's OK to stop

Two copies of the ingest are running on Oracle:
- PM2 `serpapi-jobs`, started 18 Aug — the real one, Bright Data, logging to `~/.pm2/logs`.
- A second copy started **16 May 2026**, before the Bright Data switch, parent = systemd
  (orphaned, not PM2). It still runs the May code from memory (SerpAPI), and its output
  goes to a pipe nobody reads, so whatever it does is invisible. SerpAPI is cancelled, so it
  most likely finds nothing, but that cannot be proven from logs. Recommend stopping it.

## To deploy (only on Elena's go)

Merge branch → `main`; `git pull` in `/home/ubuntu/VibeJobHunterAIPA_AIMCF`; restart
`vibejobhunter` (systemd) and PM2 `serpapi-jobs` (the Bright Data ingest); stop the
16 May orphan if approved; run `scripts/judge_feedback_sync.py` once; prove from
`journalctl` that a judge verdict line carries a criterion number.
