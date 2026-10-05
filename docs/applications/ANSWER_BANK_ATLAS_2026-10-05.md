# Answer bank — Atlas project question (5 Oct 2026)

**Q: Describe an AI or automation project you independently took from initial business problem through implementation. What process did you automate, what solution did you build, and what measurable impact did it have?**

**FINAL (paste as is):**

Atlas Shifted AIPA, an autonomous ad-market radar.

Problem: deciding which ad angle to run next meant someone manually browsing competitors' ads in Meta's Ad Library: slow, unsystematic, and never kept as history. I first built it for It's Today Media's build challenge, then turned it into my own lead engine.

Solution: a scheduled pipeline that captures live competitor ads (Bright Data → Meta Ad Library), classifies each into one of 8 persuasion angles with embeddings, scores which angles are heating up or saturated (ENTER / WATCH / AVOID), writes a brief, generates an evidence-grounded creative concept (with image and video on demand) and pushes open windows into HubSpot. Claude Code and Cursor did the implementation under my direction; I owned the problem, design, evaluation and deployment. The first full loop ran the day I started.

Impact, from production data: 31 market snapshots since June, 1,226 real ads from 554 advertisers across 16 verticals; its weekly lead machine has staged 74 prospect deals in HubSpot, 60 already contacted. Live: webhook.aideazz.xyz/whitespace/atlas.html


## Evidence (verified 5 Oct 2026)
- Oracle `~/whitespace/data/captures.jsonl`: 3,454 rows · 31 snapshot days (2026-06-25 → 2026-10-05) · 1,226 distinct ads · 554 advertisers · 16 verticals ever. Cron: DAILY 25 Jun–19 Jul, then WEEKLY Mon 9AM Panama (cheap-mode) — never say "daily".
- HubSpot: 74 `[CLIENT-ATLAS]` deals (first 2026-08-02) — 60 in ⏳ Sent, 14 in 🔥 I act TODAY; 5 `[ATLAS-RADAR]` window deals. **0 closed / no revenue** — never imply sales; be ready to say "no closed deal yet" if asked.
- Full build June 25 2026 (memory project_whitespace: Day 0 → video in one session). Dashboard 200.

---

**Q: Walk us through how you analyze an existing business process and determine what should be automated. How do you identify bottlenecks, translate requirements into a technical solution, and prioritize opportunities?**

**FINAL (paste as is):**

I start from the outcome, not the tool: what result should exist at the end, and where does work wait or fail on the way?

1. Map and measure. I follow the work through the real systems and count where time and errors go, using data rather than opinions. In my job-search pipeline, engineer-titled roles were 62% of the priority queue but only 17% of the jobs I chose to pursue. That one number told me what to cut before anything new was built.

2. Find the bottleneck by checking outputs, not activity. A search path ran on schedule for days with its filters silently off; it "worked" in every log. I found it by loading the process exactly as production does, and the first fixed run rejected five junk results that used to become CRM deals.

3. Translate requirements by type. Hard rules (location, pay, compliance) become deterministic code. Judgment calls go to a model with an evaluation set before any change ships. Consequential actions (sending, signing, paying) keep a human approval.

4. Prioritize by frequency × time saved × cost of an error, tied to revenue. Small, reversible, measurable wins first. A morning page that replaced opening 35 CRM records one by one beat any bigger project that week.

5. Define success where the result lands: the receiving system, not the sender's log.


_Evidence: 62%/17% = memory project_career_focus (22 of 35 ACT-TODAY deals engineer-titled; 2 of 12 positives in judge_feedback.json, 20 Sep 2026). Five junk results = defense-bank "bottleneck". 35 records = NOW.md apply-queue page._

---

**Q: Describe an automation or integration you built using APIs, workflow platforms, AI tools, or custom scripting. Which systems did you connect, what tools did you use, and how did the workflow operate?**

**FINAL (paste as is):**

My AI Visibility Audit API (aideazz.xyz/api) measures how well ChatGPT, Perplexity and Claude can find and cite a website, and it feeds my sales pipeline end to end.

Systems connected: a public web page and REST API (TypeScript/Node on Oracle Cloud), the audited websites themselves, Telegram, HubSpot, Resend email and GitHub Actions. I built it with Claude Code and Cursor; it costs $0 per call because it fetches pages directly instead of paying for search or LLM APIs.

How it operates:
1. Anyone submits a URL from the page, or an agent calls the API with a key (the public demo key is rate-limited to 20 calls an hour).
2. The engine runs 34 checks in 4 weighted categories (AI crawler access, structured data, answer-readiness, technical foundation) and returns a score, a grade, per-engine crawl verdicts and a prioritized fix list.
3. Every audit is logged, and any audit of a site that isn't ours pings me on Telegram as a possible lead.
4. For outreach, a staging script audits a prospect, scrapes the site's real contacts (including Cloudflare-hidden emails) and creates the company, contact, deal, note and task in HubSpot, with a one-click email.
5. One human approval sends it through Resend; delivery and opens flow back to that HubSpot note by webhook.
6. A weekly GitHub Actions self-audit checks our own sites.

Since July it has logged 547+ audits; 48 came from addresses that are not my laptop or our server.


_Evidence: src/visibility-api.ts (DEMO_LIMIT_PER_HOUR = 20; [visibility-lead] log + Telegram ping, own properties never pinged); memory project_visibility_api (34 checks, 4 weighted categories, $0/call direct fetches); .github/workflows/visibility-self-audit.yml (Mondays 12:00 UTC); Oracle pm2 logs 5 Oct: 547 [visibility-lead] lines, 48 from 16 non-own addresses. Do NOT claim the CI fails below grade B — not re-verified._
