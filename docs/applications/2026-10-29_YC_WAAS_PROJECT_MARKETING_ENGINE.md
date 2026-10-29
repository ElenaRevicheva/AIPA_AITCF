# Work at a Startup (YC) — "a project you are proud of", actualised 29 Oct 2026

Paste-ready. Every number is verified on 29 Oct 2026 (sources at the bottom). Sister files:
`2026-10-29_YC_WAAS_EXPERIENCE_AIDEAZZ.md`, `2026-10-29_YC_WAAS_EXPERIENCE_ATUONA.md`.

**Dropped from the 28 Oct draft, deliberately:** "~200–330 qualified contacts/month with zero manual
work" (not measurable from logs), "28 explicit AI-crawler signals" (no source), "domain-warmup ramps"
(outbound was stopped on data in June), and "inescapable" (the 28 Oct measurement says otherwise).
The honest version is stronger: it shows a measurement changing a decision.

---

## Paste this

```
PROJECT: the AI Marketing Engine behind aideazz.xyz — a growth system that makes a solo founder
findable by Google and by AI assistants, and tells me where every lead came from.

Motivation. I had no marketing budget, so I could not rent attention. I decided to own
distribution instead: a system that publishes, measures and routes leads while I sleep, built so
the same machinery can later be wired onto a client's site.

What I built, solo, end to end:
1. GEO/SEO foundation — JSON-LD (WebPage, ItemList, FAQPage), llms.txt, geo-manifest, hreflang
   EN/ES, per-article static HTML so a React SPA on IPFS is still readable by crawlers, IndexNow
   for Bing. A sitemap of 220 URLs today.
2. Content engine — a daily publisher writing bilingual long-form articles to my blog with FAQPage
   schema, cross-posted to Dev.to, LinkedIn and Bluesky; 203 articles live.
3. Attribution — UTM capture on every form, reCAPTCHA Enterprise, Oracle Autonomous DB, Resend
   notification. A lead's channel is recorded, never guessed.
4. AI lead triage — Groq-first, Claude fallback, urgency 1–5, Telegram alert plus dashboard.
5. Multi-agent CRM hub — one endpoint through which ten agents post attributed deals into HubSpot
   with dedup and a qualify-before-transfer gate; 721 contacts and 1,075 deals by June.
6. An AI Visibility Audit API — 34 evidence-backed checks in 4 categories, per-engine crawlability
   verdicts (GPTBot, ClaudeBot, PerplexityBot…), $0 per call, weekly self-audit CI that fails the
   build below grade B on my own properties.

What was hard. Not the happy path — the failures that log green.
- The duplicate guard tested exact slug equality, so reworded near-copies sailed through for
  months: 56 of 121 published pages were near-duplicates in 19 clusters. I replaced equality with
  token-overlap scoring, backfilled the dedup cache from 64 to 123 entries, and made a duplicate a
  retryable gate. Then the harder half: refusing to publish buys quality with silence, and the blog
  must post daily, so the day's angle now comes from measured evidence (commits, incidents,
  operator queue) and, if the model still cannot stay inside the verified facts, the article is
  assembled deterministically from them. It fails closed rather than print a number it cannot trace.
- The grounding gate itself was poisoned: a topic brief carried unverified figures, the model
  copied them, and the gate correctly refused four times and published nothing. Fix: briefs are
  not sources — digits are stripped before they reach the model.
- The lead pipeline once returned HTTP 200 for four days while its downstream was switched off.
  Now every stage proves output, not acknowledgement.

How I measured success. Not vanity metrics: indexed pages, my own audit score, attributed leads,
and whether AI assistants actually cite me. The site scores 100/100 on the audit. Then I asked the
engines 5 real buyer questions in two languages across Perplexity, ChatGPT and Google AI Mode:
22 answers, aideazz.xyz cited once. Six months of GEO work had made the site crawlable, not
discoverable, because the content answered my questions, not the buyer's. I shipped buyer-question
mode the same day (ten buyer questions answered first, measured monthly) and corrected 18
published pages that carried a fabricated detail, in place, rather than deleting them. Outbound
got the same treatment earlier: 54 cold emails, all delivered, 0 replies — a targeting problem,
not deliverability — so I stopped investing in it on the numbers.

My contribution: everything — architecture, code, deploys, operations and every judgment call,
AI-augmented with Claude Code and Cursor. It runs on Oracle Cloud's free tier at near-zero
infrastructure cost, and every incident above is written up on my public AI Ops Wiki.
```

---

## Sources

| Claim | Source |
|---|---|
| 220 sitemap URLs, 203 blog pages | `curl https://aideazz.xyz/sitemap.xml` 29 Oct: 220 `<loc>`, 203 `/blog/` |
| JSON-LD types, llms.txt, geo-manifest, hreflang, static per-article HTML, IndexNow | memory `project_marketing_engine` (Phase 1a–1g; 24 May; 15 Oct) |
| Dev.to / LinkedIn (Buffer) / Bluesky cross-posting | memory `project_marketing_engine` (15–18 Oct). Dev.to suspended ~11 Oct — "cross-posted to" stays true historically; do not claim it is live today if asked |
| Attribution stack | resume `docs/ELENA_REVICHEVA_RESUME_2026.md` Phase 3; memory `project_marketing_engine` (13 Jul live test) |
| Triage chain, urgency 1–5 | resume Phase 5 |
| 721 contacts / 1,075 deals; qualify-then-transfer | memory `project_marketing_engine` (20–22 Jun) |
| Visibility API 34 checks / 4 categories / $0 / weekly CI / 100/100 | memory `project_visibility_api` |
| 56 of 121 duplicates, 19 clusters, cache 64→123, retryable gate, deterministic article | CLAUDE.md "Duplicate blog content" (25–26 Aug) |
| Poisoned grounding gate, digits stripped | CLAUDE.md 26 Aug; wiki incident `2026-08-26-prompt-poisoned-the-grounding-gate` |
| Lead pipeline 200 for four days | wiki field notes 19 Aug (`the-lead-pipeline-that-answered-nobody-for-four-days`, `the-webhook-that-returned-200-while-switched-off`) |
| 22 answers, cited once; buyer-question mode; 18 pages corrected | `docs/aideazz/AI_CITATION_BASELINE_2026-10-28.md`; memory `project_blog_buyer_question_mode` |
| 54 sent / 0 replies / all delivered; outbound stopped | memory `project_marketing_engine` (20–21 Jun, Elena agreed) |
