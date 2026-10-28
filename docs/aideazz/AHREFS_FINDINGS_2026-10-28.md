# Ahrefs findings for aideazz.xyz — 28 Oct 2026

Read from Elena's Ahrefs workspace (Free / Webmaster Tools plan) via Chrome.
Site Audit crawl of 27 Oct 2026 19:30 (compared with 20 Oct). Site Explorer index as of 28 Oct.
Numbers below are exactly what the UI showed; nothing is estimated.

## 1. The headline

| Metric | Value | Where |
|---|---|---|
| Site Audit Health Score | **93 / 100** "Excellent" (254 of 274 URLs error-free, 20 with errors) | Site Audit overview |
| AI Discoverability Score (beta) | **100** — bot access 100, machine readability 99; 221 pages open to AI search + AI training bots | Site Audit → AI Discoverability |
| Issues | 441 total: **21 errors**, 346 warnings, 74 notices | Site Audit overview |
| Organic keywords / organic traffic | **0 / 0** | Site Explorer |
| AI responses (ChatGPT, Gemini, Perplexity, Copilot, AI Mode, AI Overviews) | **0 responses, 0 pages cited** | Site Explorer → AI responses (new index) |
| Domain Rating | 20 on the dashboard card (+18 in 30 d); 12 in Site Explorer overview | both |
| Referring domains | 355 on dashboard (−71 in 30 d); 676 live / 863 all-time in Site Explorer | both |
| Backlinks | 851 live (1.2K all-time); **85% nofollow, 53 UGC, 0 sponsored**; only 67 followed referring domains | Site Explorer |
| Total visitors (Ahrefs Web Analytics script) | 26.5K, +24.5K in 30 d | dashboard |
| Crawled pages in Ahrefs' own index | 348: 220 OK (63%), **91 redirects (26%)**, **37 × 404 (11%)** | Site Explorer |
| Time to first byte | 211 fast (<200 ms), 19 medium, 1 slow | Site Audit |

## 2. The real finding

The site is **technically clean and fully open to AI bots, yet invisible**: zero organic keywords, zero
organic traffic, zero citations in any AI answer engine in Ahrefs' index. Links exist (851) but
85% are nofollow / UGC, i.e. directory, profile and comment links that carry little authority.
Health Score measures *errors on pages*; it says nothing about whether anyone finds the pages.

## 3. Errors and concrete pages (the fixable list)

### New since 20 Oct
- **Duplicate pages without canonical (1, error, NEW):** `https://aideazz.xyz/pitch.html?lang=es`
  has the same content hash as the EN pitch page and no canonical.
- **Meta description too long:** 146 pages (+6 new). **Title too long:** 121 pages (+5 new).
  **Meta description too short:** 22 (+1).
- **Word count changed (1, NEW)** — informational.

### AI Discoverability (the category Ahrefs added in Sept 2026)
- **Article page missing Article schema (5 of 202 article-type pages, 3 new):**
  `/ai-ops-wiki.html` (has TechArticle, DefinedTermSet…), `/atlas`, `/sop-ai-ops.html`,
  `/atlas/finder`, `/sop-ai-ops-es.html`. Ahrefs classifies them as Article/Guide/Wiki pages and
  wants an `Article` (or `BlogPosting`/`TechArticle` recognised as such) schema item.
- **Changed pages not submitted to IndexNow:** 10 (+4).
- AI-relevant schema coverage chart: Article pages → Article partially covered; Home pages → Organization.

### Structured data
- **schema.org validation error (4):** `/portfolio` (14 schema items), `/blog/`, `podcast.aideazz.xyz/`,
  `/blog/what-the-live-ad-market-says-about-ai-services-july-2026/`.
- **Google rich results validation error (1):** `/api` (13 schema items).

### Links
- **Page has links to broken page (2):** `/sop-ai-ops.html` and `/sop-ai-ops-es.html` both link to
  `https://github.com/ElenaRevicheva/EspaLuzWhatsApp` → **404**.
- Orphan pages (no incoming internal links): 11 indexable + 1 non-indexable.
- Page has links to redirect: 18 (+1 removed). Only one dofollow incoming link: 3 + 3.
- Links to URLs blocked by robots.txt: 223 (12 URLs). Uncrawled links: 257.

### Content / social / sitemap
- Meta description missing: 4 indexable + 1. Multiple H1: 2. H1 missing: 5 (non-indexable). Low word count: 5.
- Open Graph incomplete 11, OG missing 4, X card missing 15.
- hreflang: 4 pages referenced for more than one language.
- Sitemap: 2 non-canonical pages in sitemap, 1 noindex page in sitemap, 1 sitemap in wrong format,
  1 indexable page not in sitemap.
- CSS file too large: 2. External 3XX: 4, external 4XX: 2.
- Redirects: 15 internal 3XX, 2 HTTP→HTTPS, 1 meta refresh.

## 4. What is paywalled on the Free plan
Broken backlinks report, Tracked keywords (Rank Tracker), Content visibility without JS, AI content level.

## 5. Not done in this session
Nothing was changed on the site. This is a read-out only; fixes are a separate decision.

---

# Part 2 — "Is six months of GEO/AEO/Tech-SEO work null?" (28 Oct 2026, verified)

## What was actually built in 2026 and is LIVE right now (checked with curl, 28 Oct)
| Piece | Live evidence |
|---|---|
| Sitemap | `/sitemap.xml` 200, **218 URLs**, 201 of them blog posts |
| Blog cadence | sitemap lastmod per month: May 23 · Jun 35 · Jul 34 · Aug 41 · Sep 36 · Oct 49 — the daily publisher ships |
| GEO files | `/llms.txt` 200 (3 KB), `/geo-manifest.json` 200, `updated: 2026-10-27` |
| robots.txt | GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, Google-Extended … all `Allow: /` |
| GA4 | tag `G-TL5S8V23LT` in the live homepage HTML |
| Schema | Ahrefs sees FAQPage / BlogPosting / Organization / Person / TechArticle on the pages (5 pages flagged for a missing `Article` item, 5 with validation errors) |
| Ahrefs technical verdict | Health 93, AI Discoverability 100 |
| aideazz repo | 3,391 commits since 1 Jan 2026 |

**So the technical layer is not null. It exists, it is verified from the live site, and it runs every day.**

## What the technical layer produced (the demand side, measured)
| Measurement | Value | Source |
|---|---|---|
| Google clicks, 4 Jul–28 Aug (8 wk) | 57 clicks / 1,014 impressions ≈ 7 clicks a week | Search Console (memory, 28 Aug) |
| Organic search visitors, last 30 d | **77** (0.3% of traffic) | Ahrefs Web Analytics, her own script |
| Ahrefs organic keywords | 0 — no keyword with search volume ranks in the top 100 | Site Explorer |
| AI answer citations (ChatGPT, Gemini, Perplexity, Copilot, AI Mode) | 0 | Site Explorer AI responses index |
| Best blog post, last 30 d | 20 visitors; next ones 18 and 17 | Web Analytics top pages |
| Backlinks | 851, **85% nofollow**, 67 followed domains, DR 12 | Site Explorer |
| Referring domains, 30 d | −71 (Dev.to suspended ~11 Oct; its 211 canonical pages 404) | dashboard + memory 15 Oct |

## The October traffic that is NOT what it looks like
Web Analytics shows **26.6K visitors in 30 days**, which the dashboard card presents as growth (+24.5K).
- 25,663 of them (96.7%) landed on **`/api`** only.
- 21,936 came from **YouTube** with no UTM ("Direct / None" campaign) — the Make scenario `6263197` rotates the 4 AIGO
  films daily since 3 Oct and every description links `aideazz.xyz/api` (10×) and `/portfolio` (5×).
- 62.5% Panama + 31.1% Nicaragua; Samsung Browser 16%; bounce **81.5%**; the spike runs 4–20 Oct then collapses to ~50/day.
- Outcome: **46 outbound clicks**, and HubSpot shows **zero** inquiries attributable to it.
- HubSpot October inbound: 19 form contacts, **~15 are gibberish-name spam** (e.g. "Nqhnpb Xriuam", source DIRECT_TRAFFIC,
  first URL `/` or `/portfolio`) — the inquiry form is being hit by bots. Real `[CLIENT-CTO-INQUIRY]` deals in October: 4
  (Andrés Morales 1 Oct, Catherine Doyle 2 Oct, Diane Whitfield 3 Oct, BariSh 21 Oct). The other 33 October deals are the
  lead machine's own outbound (`[CLIENT-CTO-SERP]`, `[CLIENT-CTO-INGEST]`), not inbound.
- **Open question only YouTube Studio can answer:** which video, and whether this is Shorts distribution or something else.

## Why the site is invisible (root causes, in order of weight)
1. **No search demand for what the blog writes about.** 201 posts are incident diaries ("Claude Sonnet's toolChoice rejection broke
   fact-checker failover"). Nobody types that into Google or asks ChatGPT. Schema and llms.txt can only amplify demand that exists.
2. **No authority.** DR 12, 85% nofollow. AI engines cite sources other sites already cite. Dev.to going down removed a chunk of it.
3. **Trust debt already on record:** 56 of 121 posts near-duplicates (19 clusters), 21 posts carrying the fabricated Redis stack,
   16 Oct fact-check: 8 false claims + employer names. Google's site-quality systems demote this shape; the cleanup was never approved.
4. **The instruments measured the wrong thing.** Her own AI Visibility Audit says 100/100; Ahrefs AI Discoverability says 100.
   Both measure *can a bot read it*, not *does anyone cite it*. Every agent reported the green instrument as "GEO 10/10".
   The 28 Aug session already concluded "the binding constraint is demand, not ranking — do NOT spend more sessions on aideazz.xyz SEO",
   and the daily machine kept running anyway.
5. **The one page that got real traffic (`/api`, 25K visitors) is a developer API widget**, served to Spanish-speaking phone viewers
   from Panama/Nicaragua who came from a promo film. Wrong page for that audience; 81.5% bounce says so.

## Verdict
Six months bought a **correct, verified technical foundation** and a publishing machine. They did not buy visibility, because
visibility was never gated by the technical layer. The null is not in the code; it is in the choice of what to measure
(crawlability instead of citations/clicks) and what to publish (diary instead of demand).
