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
