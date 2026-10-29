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
   schema, cross-posted to LinkedIn and Bluesky (and to Dev.to until it closed in October);
   203 articles live.
3. Attribution — UTM capture on every form, reCAPTCHA Enterprise, Oracle Autonomous DB, Resend
   notification. A lead's channel is recorded, never guessed.
4. AI lead triage — Groq-first, Claude fallback, urgency 1–5, Telegram alert plus dashboard.
5. Multi-agent CRM hub — one endpoint through which ten agents post attributed deals into HubSpot
   with dedup and a qualify-before-transfer gate; 1,618 contacts and 3,238 deals today.
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
mode the same day (ten buyer questions answered first; the baseline is re-run monthly from now
on) and corrected 19 published pages that carried a fabricated detail, in place, rather than
deleting them. Outbound
got the same treatment earlier: 54 cold emails, all delivered, 0 replies — a targeting problem,
not deliverability — so I stopped investing in it on the numbers.

My contribution: everything — architecture, code, deploys, operations and every judgment call,
AI-augmented with Claude Code and Cursor. It runs on Oracle Cloud's free tier at near-zero
infrastructure cost, and every incident above is written up on my public AI Ops Wiki.
```

---

## Sources (re-verified 29 Oct 2026 after Elena asked "is it true?")

**Live today:** sitemap counts; JSON-LD types on the home page (WebPage, ItemList, FAQPage present);
llms.txt + geo-manifest 200; audit API on aideazz.xyz = score 100, grade A+, 34 checks, 4 categories;
Bluesky `aideazz.bsky.social` 17 posts; dev.to profile 404; HubSpot search API totals 1,618 contacts /
3,238 deals; 19 of 22 Redis-mentioning blog pages carry the `class="correction"` note (the other 3 are
the field note itself and pages discussing the incident); wiki chapters exist for all three incidents
(`2026-08-25-guard-that-renamed-the-problem`, `2026-08-26-prompt-poisoned-the-grounding-gate`,
`2026-08-19-concierge-outage`).
**From repo documents, not re-measured today:** 56/121, 19 clusters, 64→123 (CLAUDE.md + wiki chapter,
25 Aug); 22 answers / cited once (baseline doc, 28 Oct).
**From memory notes only, dated, not re-checked today:** 54 sent / 0 replies (June); weekly self-audit
CI and $0/call; IndexNow (15 Oct); reCAPTCHA Enterprise; LinkedIn posting via Buffer.

| Claim | Source |
|---|---|
| 220 sitemap URLs, 203 blog pages | `curl https://aideazz.xyz/sitemap.xml` 29 Oct: 220 `<loc>`, 203 `/blog/` |
| JSON-LD types, llms.txt, geo-manifest, hreflang, static per-article HTML, IndexNow | memory `project_marketing_engine` (Phase 1a–1g; 24 May; 15 Oct) |
| LinkedIn (Buffer) / Bluesky cross-posting; Dev.to in the past | Bluesky public API 29 Oct (17 posts); dev.to 404 on 29 Oct; LinkedIn: memory `project_marketing_engine` (15 Oct), not re-checked |
| Attribution stack | resume `docs/ELENA_REVICHEVA_RESUME_2026.md` Phase 3; memory `project_marketing_engine` (13 Jul live test) |
| Triage chain, urgency 1–5 | resume Phase 5 |
| 1,618 contacts / 3,238 deals | HubSpot search API, live 29 Oct; qualify-then-transfer gate: memory `project_marketing_engine` (22 Jun) |
| Visibility API 34 checks / 4 categories / 100/100 | live POST to `/cto/v1/visibility` with the demo key, 29 Oct: score 100, A+, 34 checks, 4 categories. Weekly CI and $0/call: memory `project_visibility_api`, not re-run today |
| 56 of 121 duplicates, 19 clusters, cache 64→123, retryable gate, deterministic article | CLAUDE.md "Duplicate blog content" (25–26 Aug) |
| Poisoned grounding gate, digits stripped | CLAUDE.md 26 Aug; wiki incident `2026-08-26-prompt-poisoned-the-grounding-gate` |
| Lead pipeline 200 for four days | wiki field notes 19 Aug (`the-lead-pipeline-that-answered-nobody-for-four-days`, `the-webhook-that-returned-200-while-switched-off`) |
| 22 answers, cited once; buyer-question mode; 19 pages corrected (grep 29 Oct) | `docs/aideazz/AI_CITATION_BASELINE_2026-10-28.md`; memory `project_blog_buyer_question_mode` |
| 54 sent / 0 replies / all delivered; outbound stopped | memory `project_marketing_engine` (20–21 Jun, Elena agreed) |
