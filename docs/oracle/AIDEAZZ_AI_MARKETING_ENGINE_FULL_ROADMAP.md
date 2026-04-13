# AIdeazz AI Marketing Engine — Full Roadmap
> Version: April 13, 2026 (v15.1 — phase spine + restored Phase 4 “empty gun” honesty table) | Built from: AutoSEO analysis + Manny Blueprint + CAREER_FOCUS v3 + SKILL.md
> Purpose: Wire AIdeazz first. Showcase to every future client.

**Who should read this:** **Engineers** — implementation tables, env names, endpoints. **Vibe coders & builders** — phased prompts and “what shipped” without needing every Oracle detail. **Potential clients** — read *Document map* (one screen), then *Why this engine exists*, *WordPress clients*, and *Jargon cheat sheet*; deeper sections prove the stack is real.

---

## Document map — Phases 1 through 6 (read in this order)

This file is organized around **six phases**. Everything else (AutoSEO critique, Manny blueprint, engineer handoff) **supports** the same sequence.

| Phase | Name | What it is (one line) | Status (Apr 2026) |
|------:|------|----------------------|-------------------|
| **1** | Foundation (GEO + SEO health) | Google and AI assistants can **find** and **trust** your site — structured data, sitemap, GSC, analytics. | **Complete** |
| **2** | Content engine | Automated **long-form publishing** (Hashnode) + Oracle **`content_log`** — compound visibility. | **Mostly complete** (optional draft queue) |
| **3** | Attribution | **UTM** + inquiry → Oracle **`business_leads`** — know which channel sent the lead. | **Complete** |
| **4** | Outbound | **Cold email** (CTO AIPA “hire us” + VJH “hire me”) — Resend, Hunter, caps, honest **`outreach_log`**. | **Shipped & verified** |
| **5** | Lead triage | **AI classification** → **`lead_triage`** + dashboard + Telegram — respond to the right signal first. | **Operational** |
| **6** | Showcase | **Pitch package** — README + live demo proving Phases 1–5 (packaged doc / walkthrough). | **Not started** |

**Where to scroll:** **[Implementation (Phases 1–6)](#impl-phases-16)** — what actually shipped · **[PART 2 — build prompts](#part-2--the-full-roadmap-aideazz-first)** — Phase 1→6 copy-paste prompts for CTO AIPA · **[Phase 4 honesty check](#phase-4-honesty)** — “is the gun loaded?” (email volume reality).

**Suggested reading paths**

- **Clients / founders:** This table → [Why this engine exists](#why-this-engine-exists--competitive-positioning) → [WordPress clients](#wordpress-clients--engine-compatibility) → [Jargon cheat sheet](#part-4--jargon-cheat-sheet-for-client-conversations).
- **Vibe coders:** This table → [Implementation](#impl-phases-16) → [PART 2 prompts](#part-2--the-full-roadmap-aideazz-first).
- **Professional devs:** [Implementation](#impl-phases-16) → [Handoff](#handoff--what-actually-shipped-april-13-2026) → [PART 0 jargon](#part-0--jargon-dictionary).

---

## Handoff — what actually shipped (April 13, 2026)

This block is for the **next engineer** (Claude Code, Cursor, human): **verifiable facts**, not marketing copy.

| Area | Where | What we did | Why it matters |
|------|--------|---------------|----------------|
| **GitHub webhook + Groq** | **AIPA_AITCF** `src/cto-aipa.ts` — `reviewCode()` | **Standard reviews** use Groq inside **try/catch** with **`timeout: 120s`**, **`maxRetries: 0`**. On any failure (including **429** / rate limit), **fallback to Claude Haiku** via `CODE_REVIEW_FALLBACK_MODEL` (default `claude-3-5-haiku-20241022`, overridable in `.env`). **Critical (Opus) path** also wrapped: try Opus → Haiku → **static-analysis-only stub** so the handler never leaves an unhandled rejection that kills a **PM2 cluster worker**. | Previously, Groq errors from **push/PR webhooks** could take down the same Node process as **lead triage** (shared Groq quota). **Atuona / `atuona-creative-ai.ts` was not modified** — surgical change only in code review. |
| **Env** | `.env.example` | Documented optional **`CODE_REVIEW_FALLBACK_MODEL`**. | Same Haiku default as triage fallback — predictable ops. |
| **Phase 5 HTTP + ops** | AIPA_AITCF | **`POST /leads/triage-run`** — default **202** + background triage; sync JSON with **`?wait=1`** or **`npm run triage:fire`** + **`TRIAGE_FIRE_WAIT=1`**. **`GET /leads/dashboard`** — if `LEAD_TRIAGE_SECRET` is set, opening the URL **without** `?secret=` shows a small **HTML unlock form** (not a bare 401); bookmark **`?secret=…`** or use Bearer automation. On Oracle, **`TRIAGE_SKIP_GROQ`** → Haiku-only triage (saves **Groq** quota for Hashnode / code review). | Avoids proxy socket hang-up; humans can open the dashboard from a phone without hand-building query strings. |
| **GSC “duplicate canonical”** | **[aideazz](https://github.com/ElenaRevicheva/aideazz)** repo (not AIPA_AITCF) | Removed the **static** `<link rel="canonical" href="https://aideazz.xyz/" />` from root **`index.html`** (it made every crawled URL look like `https://aideazz.xyz/` before JS ran). **Homepage** now sets canonical in **`src/pages/Index.tsx`** via `useEffect`, same pattern as `/about`, `/blog`, `/portfolio`. | Fixes Search Console confusion when Google reads HTML first on SPA deploys (IPFS/4everland). Deploy **4everland** from `main` after pull. |
| **Oracle deploy** | `ubuntu@` Oracle, `~/cto-aipa` | **`git pull` → `npm run build` → `pm2 restart cto-aipa --update-env`**. Then **`npm run triage:fire`** once **`curl` to `127.0.0.1:3000/`** succeeds. | **HTTP 202** + triage start in PM2 logs is the smoke test. |

**Production signals (Phase 5 accomplishments):** `🎯 [triage-run] Starting (background=true)...` → per-lead **`[triage] Classifying lead…`** → **`🎯 [triage-run] Complete: N processed, M urgent`** in PM2 logs; Oracle **`lead_triage`** rows from **`business_leads`** + **`outreach_log`**; **`agent_outcomes`** records the **`triage_cycle`** run. **`GET /leads/triage-status`** exposes **`ready: true`** when **`ANTHROPIC_API_KEY`** is configured. **Optional deep check:** **`TRIAGE_FIRE_WAIT=1 npm run triage:fire`** returns one JSON payload with **`processed` / `urgent`** without tailing logs.

**What we did *not* claim:** Atuona creative engine untouched; Hashnode daily unchanged in this handoff; no broad refactors.

---

## WHY THIS ENGINE EXISTS — COMPETITIVE POSITIONING

The AI services space is getting super competitive. Most projects rely only on KOLs (paid influencers) and short-term hype — a $500-5K tweet, a launch post, then silence. That is **renting attention**. This roadmap builds something fundamentally different: **owning distribution**.

### What Everyone Else Does vs. What We Build

| What 99% of AI builders/agencies do | What this engine builds |
|---|---|
| Pay KOLs $500-5K for a tweet | GEO so AI tools **cite you for free, forever** |
| Hype posts with no tracking | UTM attribution — know exactly which channel pays |
| "DM me for AI services" | Automated outreach pipeline hitting founders with **specific pain + proof** |
| Portfolio = Notion page | Production site with JSON-LD, structured data, crawlable by ChatGPT/Perplexity/Claude |
| One launch, then silence | Blog auto-publisher = **compound SEO** that grows while you sleep |
| "I built a chatbot" (demo) | 9 agents running 24/7 with $0 infra — **verifiable, not claimable** |

### The Strategic Logic

**Phase 1 (GEO)** is the foundation — it makes you **findable** by AI tools. When someone asks ChatGPT "who can build me an AI agent system?" or Perplexity "fractional AI builder for startups" — the structured data, JSON-LD schemas, and authority content we ship is what makes Elena Revicheva show up in that answer. No KOL can do that. No paid ad can do that.

**Phases 2-4** are the engine — they make you **inescapable** across search, social, and direct outreach. Compound blog content + UTM-tracked funnels + automated founder outreach = a machine that runs while you sleep.

**Phases 5-6** are the conversion layer — they turn attention into **money**. Lead triage so you never miss a high-value signal. Showcase package so every pitch ends with "here it is, running."

### The Massive Upside

Almost nobody in the AI services space is doing GEO + structured funnels yet. They are all still posting threads and paying for retweets. The GTM window for owning AI-tool citations is **right now** — before the space matures and every competitor catches up. First-mover advantage in GEO is real because AI tools cache and reinforce early authority signals.

---

## WORDPRESS CLIENTS — ENGINE COMPATIBILITY

> Elena's site runs on IPFS/4everland (React SPA). The majority of her potential clients run WordPress. The engine is not only compatible — it works **easier** on WordPress than on her own custom stack.

| Phase | Elena's Site (IPFS/React) | WordPress Client | Verdict |
|---|---|---|---|
| **Phase 1: GEO** | Had to hand-code JSON-LD, noscript, sitemap, OG tags | Yoast / RankMath plugin installs in 5 min, handles all of it | **Easier for client** |
| **Phase 2: Blog Auto-Publisher** | Built Hashnode GraphQL publisher | WordPress REST API: `POST /wp-json/wp/v2/posts` — same CTO AIPA code, swap endpoint + auth | **~2h adaptation** |
| **Phase 3: UTM Attribution** | Custom React contact form + honeypot + reCAPTCHA Enterprise | Gravity Forms / CF7 already capture UTMs natively — just hook the webhook | **Easier for client** |
| **Phase 4: Outreach Pipeline** | Platform-agnostic — Resend + Oracle | Platform-agnostic — identical | **Identical** |
| **Phase 5: Lead Triage** | Platform-agnostic — Oracle + Telegram | Platform-agnostic — identical | **Identical** |

**Key insight:** Elena's engine differentiator is NOT the CMS — it is the AI automation layer on top. WordPress is just the publishing endpoint, not the intelligence. The client brings WordPress. Elena wires it to decisions.

**The pitch for WordPress clients:**
> "You have WordPress. I wire AI to it: automated content generation that publishes on schedule, UTM-tracked contact forms that log every lead to a database, personalized founder outreach that sends itself, and a dashboard that ranks your leads by urgency. You bring the domain. I make it intelligent. 4–6 weeks. Here's mine running live."

**What Elena does NOT do (from Manny Blueprint, ROADMAP Part 3):**
- WordPress install, theme setup, DNS — decline or $150/hr minimum (zero AI, zero leverage)
- Anything that's pure IT admin work
- What she builds: the intelligence layer that sits on top of whatever CMS the client already has

---

<a id="impl-phases-16"></a>

## Phases 1–6 — implementation status (what shipped)

> Updated: April 13, 2026 — Phase 4 outreach verified. **Phase 5** — full triage cycle (Groq → Haiku fallback → optional Sonnet refine), **`lead_triage`** persistence, **`/leads/dashboard`** with **unlock form** or **`?secret=`**, **`/leads/triage-status`**, cron + **`npm run triage:fire`**. **Related stability:** **`reviewCode()`** Groq → **`CODE_REVIEW_FALLBACK_MODEL`** (Haiku) so **GitHub webhooks** do not take down the **PM2** worker on **429**. **aideazz** canonical fix lives in the **aideazz** repo (see Handoff).

### Phase 1a: SEO Health Audit — DONE

| Task | Status | Details |
|---|---|---|
| Google Search Console verified | DONE | Domain property `sc-domain:aideazz.xyz` active |
| sitemap.xml created & validated | DONE | 5 URLs, valid XML, no BOM, LF line endings |
| sitemap.txt created (plain text fallback) | DONE | Google accepted this format immediately — bypassed IPFS/CDN XML parsing issues |
| GSC sitemap submission | DONE | **"Successfully" — 5 pages identified** (April 7, 2026) |
| robots.txt updated | DONE | AI bot permissions (GPTBot, ChatGPT-User, PerplexityBot, ClaudeBot) + dual sitemap references |
| CDN warming workflow | DONE | GitHub Actions cron every 2h — pre-fetches sitemap/robots to keep IPFS CDN edges warm |
| Build-time SEO verification | DONE | `scripts/verify-seo.mjs` — fails build if sitemap.xml, sitemap.txt, or robots.txt missing from dist/ |

### Phase 1b: GEO Foundation — DONE

| Task | Status | Details |
|---|---|---|
| JSON-LD Organization schema | DONE | On index.html — founder, sameAs, logo |
| JSON-LD Person schema (Elena) | DONE | On index.html + /about page — knowsAbout, sameAs, worksFor, knowsLanguage |
| JSON-LD FAQPage schema | DONE | 5 Q&As on index.html — "What is AIdeazz?", "What is multi-model LLM routing?", "How do you run 9 AI agents at $0/month?", etc. |
| Open Graph meta tags | DONE | All pages — og:type, og:title, og:description, og:image, og:url |
| Twitter Card meta tags | DONE | summary_large_image on all pages |
| Canonical URLs | DONE | Per-route in React (`Index`, `About`, `Blog*`, `BusinessCard`); **Apr 2026:** removed static homepage canonical from `index.html` in **[aideazz](https://github.com/ElenaRevicheva/aideazz)** to stop GSC “duplicate canonical” / wrong default for all URLs |
| /about page (Author Authority) | DONE | Full bio, Phase 1 + Phase 2 credentials, photo, stats grid, JSON-LD Person schema, CTA |
| /portfolio page GEO | DONE | ProfilePage JSON-LD, dynamic OG tags, makesOffer |
| noscript content block | DONE | Full static HTML in index.html for AI crawlers that don't execute JavaScript — all 9 agents described, tech stack, metrics, FAQs |
| Positioning update (EN + ES) | DONE | "Executive-Turned-AI-Builder" in both languages |

### Phase 1c: OG Image & Social Sharing Fix — DONE

| Task | Status | Details |
|---|---|---|
| OG image optimized | DONE | Created `elena-og.jpg` (1200x630, 133KB) from original (2688x3840, 2.1MB) — fixes WhatsApp/LinkedIn/Twitter sharing |
| All og:image refs updated | DONE | index.html, BusinessCard.tsx, About.tsx — all point to optimized image |
| Team nav link added | DONE | "Team" (EN) / "Equipo" (ES) links to `#team` anchor on homepage |
| Founder section enriched | DONE | Career phases (Executive 2011-2018 + AI Builder 2025-Present) + stats grid (9 agents, $0/month, 76/24%, 12 months) added to VisionSection |
| Social sharing validated | DONE | opengraph.xyz shows correct title, description, image for aideazz.xyz and /portfolio |

### Phase 1d: GA4 Analytics — CONFIRMED WORKING

| Task | Status | Details |
|---|---|---|
| GA4 measurement tag on website | DONE | `G-TL5S8V23LT` in index.html `<head>` — tracks all pages (SPA) |
| GA4 Property ID configured | DONE | `515154124` — set in Oracle server `.env` |
| Service account credentials | DONE | `aideazz-analytics-reader@vaulted-circle-368018` — active, authenticated |
| GA4 Data API backend | DONE | `performance_tracker.py` in VJH — pulls users, sessions, pageviews, traffic sources |
| GA4 dashboard routes | DONE | FastAPI `/analytics/dashboard` and `/analytics/metrics` endpoints built |
| Live data confirmed | DONE | API returns real data: 189 users, 215 sessions, 242 pageviews (7-day window, April 8, 2026) |

### GSC Indexing Status — NORMAL

| Item | Status | Details |
|---|---|---|
| "Redirect page" warning | NORMAL | `/card` → `/portfolio` 301 redirect — Google correctly indexes /portfolio as canonical, marks /card as redirect. Not an error. |

### Phase 2: Blog & distribution (Hashnode + aideazz.xyz) — MOSTLY COMPLETE

| Task | Status | Details |
|---|---|---|
| Platform decision | DONE | **Hashnode** (GraphQL API). **Medium** not viable for new integrations. |
| Hashnode blog + PAT + publish scripts | DONE | `scripts/hashnode-publish.mjs`, `hashnode-list.mjs`, npm scripts; token in `.env` only. |
| **Daily automated Hashnode publisher** | DONE | **AIPA_AITCF** `src/hashnode-daily.ts` — Claude long-form → `publishPost`; cron **09:30 `America/Panama`**; opt-in `HASHNODE_DAILY_ENABLED=true`; runs on Oracle **PM2 `cto-aipa`**. |
| Manual trigger | DONE | `POST /hashnode/daily-run` with `Authorization: Bearer <HASHNODE_DAILY_TRIGGER_SECRET>`. |
| First public long-form essay | DONE | **From Boardroom to Build…** — [on Hashnode](https://aideazz.hashnode.dev/from-boardroom-to-build-what-running-nine-production-ai-agents-actually-means); source `scripts/hashnode-posts/from-executive-to-ai-builder.md`. |
| **Portfolio blog + live Hashnode sync** | DONE | **[aideazz](https://github.com/ElenaRevicheva/aideazz)** repo: `/blog`, `/blog/:slug`, public GraphQL sync (no `gray-matter` in browser — fixed **Buffer** error), portfolio CTA; deploy **4everland** from `main` (not Fleek). |
| **Oracle `content_log`** | DONE | Table `content_log` in **AIPA_AITCF** `src/database.ts`; each successful daily publish writes `channel=hashnode_daily`, keyword, title, url, topic_index. `getRecentContentLogs()` for future dashboards. |
| **Telegram notify on publish** | DONE (optional) | `TELEGRAM_HASHNODE_NOTIFY_CHAT_ID` + `TELEGRAM_BOT_TOKEN` — sends one message with title + URL after publish. |
| **LLM pipeline extras** (draft queue, human review before publish) | NOT STARTED | Current path is **publish** on schedule; optional: `createDraft` + Telegram approval — same roadmap prompts, Hashnode GraphQL instead of WordPress. |

### Phase 3: UTM Attribution — COMPLETE (end-to-end, production)

The first three rows are Phase 3 only. The last three rows are a **cross-phase summary** (same facts repeated under Phase 4–6 sections below).

| Phase | Status | What shipped |
|---|---|---|
| Phase 3: UTM + inquiry pipeline | **COMPLETE** | **aideazz:** `InquiryForm` — UTM from URL → `POST https://webhook.aideazz.xyz/cto/marketing/inquiry-proxy` (no Bearer in browser). **CTO AIPA (Oracle):** `business_leads` in Oracle; `POST /marketing/inquiry` (Bearer) for automation; `POST /marketing/inquiry-proxy` (Origin allowlist for `aideazz.xyz` / `www`, honeypot `company`, per-IP rate limit). **Weekly Telegram digest** of new leads (optional env). **Docs:** `docs/oracle/CTO_AIPA_PUBLIC_HTTPS.md`. |
| Phase 3b: Email notifications | **COMPLETE** | **Resend** via `RESEND_API_KEY`. Team inbox: `MARKETING_INQUIRY_NOTIFY_TO` (default `aipa@aideazz.xyz`). Submitter gets confirmation email when address is valid. **Sender:** `MARKETING_INQUIRY_FROM` — production uses verified **`AIdeazz <aipa@aideazz.xyz>`** (same domain pattern as VibeJobHunter). Implementation: `src/marketing-notify.ts`. |
| Phase 3c: reCAPTCHA Enterprise + inquiry | **COMPLETE (production)** | **Verified Apr 2026:** end-to-end form submit on `https://aideazz.xyz` → Oracle `POST /marketing/inquiry-proxy` → `business_leads` + Resend team email (`[AIdeazz] Inquiry — …`). **Why it was hard:** initial key lived in GCP project `aideazz-177575763145287` (no console access); API key was created in **`aideazz-1775763145287`** — Enterprise **CreateAssessment** must use the **same** project as the reCAPTCHA **site key** + an API key from that project. Classic `siteverify` + `api.js` also failed for Enterprise-only keys. **What we did:** (1) Registered a **new** reCAPTCHA Enterprise key in **`aideazz-1775763145287`** (domains `aideazz.xyz`, `www.aideazz.xyz`; site key id `6LcHda8sAAAAAAGwl5alB2xdX_6Dqve5a5vifoHj`). (2) **Credentials** in that project: API key restricted to **reCAPTCHA Enterprise API**. (3) **[aideazz](https://github.com/ElenaRevicheva/aideazz)** `src/lib/recaptcha.ts`: load **`https://www.google.com/recaptcha/enterprise.js?render=…`**, **`grecaptcha.enterprise.execute`** with action **`inquiry`** (not classic `api.js` / `grecaptcha.execute`). **`VITE_RECAPTCHA_SITE_KEY`** in `.env.production` + deploy **4everland** from `main`. (4) **[AIPA_AITCF](https://github.com/ElenaRevicheva/AIPA_AITCF)** `src/marketing-notify.ts`: **`verifyRecaptchaEnterprise`** → `recaptchaenterprise.googleapis.com/.../assessments?key=…`; optional fallback to classic **`siteverify`**; verification can run with **Enterprise-only** env (no legacy secret required when `RECAPTCHA_ENTERPRISE_PROJECT_ID` + `RECAPTCHA_ENTERPRISE_API_KEY` + `RECAPTCHA_SITE_KEY` are set). **Oracle** `~/cto-aipa/.env`: `RECAPTCHA_SITE_KEY`, `RECAPTCHA_ENTERPRISE_PROJECT_ID=aideazz-1775763145287`, `RECAPTCHA_ENTERPRISE_API_KEY`; optional `RECAPTCHA_SECRET_KEY`; optional `RECAPTCHA_MIN_SCORE` (default **0.1** in code). **`pm2 restart cto-aipa --update-env`**. **Docs:** `.env.example` in both repos. |
| Phase 4: Founder Outreach Pipeline | **COMPLETE (verified send path)** | Real Resend + Oracle; see “Phase 4 outreach — what is actually working” and Phase 4 section below. |
| Phase 5: Lead Triage | **OPERATIONAL (Apr 2026)** | Oracle **`lead_triage`** + **`agent_outcomes`**; sources **`business_leads`** (site inquiries) + **`outreach_log`** (replies). Classification: **Groq** `llama-3.3-70b-versatile` → **Claude Haiku** fallback (**`TRIAGE_FALLBACK_MODEL`** / **`TRIAGE_SKIP_GROQ`**); **Sonnet** optional refine for high urgency. **`/leads/triage-status`**, **`POST /leads/triage-run`** (202 async or **`?wait=1`** sync), **`GET /leads/dashboard`** (unlock form or **`?secret=`**), Telegram **`/triage`**, cron **`TRIAGE_CRON`**. **Webhook hardening:** **`reviewCode`** → Haiku on Groq failure — shared process with triage. |
| Phase 6: Showcase Package | NOT STARTED | Depends on all above running with live data |

<a id="phase-4-honesty"></a>

### Phase 4 outreach — what is *actually* working (April 2026)

This subsection is the honest answer to “is it an empty gun?” **The code paths are real; volume depends on data and deliverability.**

| System | Automated email that leaves Resend? | How we know it is not simulated |
|--------|-------------------------------------|----------------------------------|
| **CTO AIPA (client / “hire us”)** | **Yes**, when `RESEND_API_KEY` (or `RESEND_KEY`) is set and targets have addresses | Sends go through **Resend HTTP API**; `outreach_log` is only marked `sent` after HTTP success **and** an Oracle `UPDATE` that affects a row. Logs include **Resend message id**. Daily cap enforced in code. |
| **VJH (employer / “hire me”)** | **Yes**, for **founder outreach** when a personal email is found and passes Resend rules | **`success` is true only for email delivered via Resend**, not for LinkedIn/Twitter manual copy queues (those may still notify Telegram but **do not** increment “outreach sent”). |
| **VJH job applications** | **Sometimes** | **Live ATS form** when Greenhouse/Lever/Ashby is detected **and** Playwright succeeds; **else** application email to a **Hunter-discovered** address that passes validation — not `careers@`. “Materials only” is **not** counted as applied. |

**Oracle verification (repeatable):** `cd ~/cto-aipa && npm run check:phase4` — prints **lengths only** for `RESEND_*`, `OUTREACH_SECRET`, `HUNTER_API_KEY`. Crons for ingest + daily send are registered only when `OUTREACH_SECRET` is non-empty (see PM2 logs: ingest `0 14 * * *`, outreach `0 15 * * *` Panama by default).

**Why you might still see “nothing happened today”:** (1) **No new jobs** in VJH (dedupe / seen list) — pipeline is idle by design. (2) **CTO AIPA** — all companies already ingested (dedupe) or daily cap / zero drafts. (3) **ATS integration** sometimes times out — jobs still appear from other sources, but ATS-specific jobs may be 0 that cycle.

### Phase 4: Founder Cold Email Pipeline — SHIPPED & VERIFIED (not a stub)

> **Last verified: April 12, 2026** | Dual-system: **CTO AIPA** (client / “hire us”) + **VibeJobHunter** (employer / “hire me”)

**CTO AIPA — Client outreach (production):**

| Task | Status | Details |
|---|---|---|
| Oracle tables (`outreach_targets`, `outreach_log`) | DONE | `src/database.ts` — import, drafts, send tracking, replies. |
| Prospect ingestion | DONE | `src/prospect-ingest.ts` — YC AI companies (JSON or API) → Hunter.io (budget-aware) → pain classification → `importTargets` with dedupe by company. |
| Claude email generation + retry | DONE | `src/outreach.ts` — 529/503/429 retries on generation. |
| **Resend send + honest bookkeeping** | DONE | `sendOutreachEmail()` — **no** `sent` status unless Resend returns success **and** `markOutreachSent` updates a row (`rowsAffected`). Logs Resend **message id** when present. |
| Daily cap | DONE | `OUTREACH_DAILY_CAP` (default 10). |
| Crons (ingest + send) | DONE | Registered only if `OUTREACH_SECRET` is set: default **ingest 2 PM**, **send 3 PM** `America/Panama`. |
| Telegram | DONE | Cycle summaries use **plain text** broadcasts (no fragile Markdown). `/outreach`, `/outreach_ingest`, `/outreach_drafts` in Business Wiring. |
| Ops check | DONE | `npm run check:phase4` / `scripts/check-phase4-env.cjs` — confirms `RESEND_*`, `OUTREACH_SECRET`, Hunter key **presence** (lengths only). |

**VibeJobHunter — Employer outreach & applications:**

| Task | Status | Details |
|---|---|---|
| Founder email outreach | DONE | Resend sends only to validated personal-style addresses; **LinkedIn/Twitter “manual queue” does not count as `success`** — stats match real automated email. |
| Company URL for Hunter | DONE | `founder_finder_v2._resolve_company_url` — derives real domain from ATS URLs. |
| Applications | DONE | `application_delivered` = **live ATS submit** OR **application email** (e.g. Hunter contact), **not** “cover letter file saved only”. |
| Claude retries | DONE | `claude_helper.py` + call sites as deployed. |
| Role / gate tuning | DONE | `job_gate.py` etc. as in repo. |

**What still limits volume (not the same as “broken”):**
- **VJH:** If **0 new jobs** pass the seen filter in a cycle, there is nothing to apply to or message — the engine is waiting on **fresh listings**.
- **CTO AIPA:** Ingest may log **0 new** when all YC rows are already in `outreach_targets` (dedupe). **Hunter** monthly budget caps discovery.
- **ATS:** Aggregated job boards may not expose a supported ATS URL → automation falls back to email when a valid contact exists.

**What needs to happen next for more conversations (product, not wiring):**
- Refresh or widen **target sources** (CTO: more companies; VJH: job sources when ATS times out).

### Phase 5: Lead Triage — OPERATIONAL ON ORACLE (E2E + dashboard UX + webhook stability)

| Task | Status | Details |
|---|---|---|
| Oracle `lead_triage` + indexes | DONE | `src/database.ts` — `saveTriagedLead`, `getUntriagedLeads`, `getRepliedOutreach`, `getTriagedLeads`; dedupe by `source_ref_id` + `source_table`. |
| Classification | DONE | Groq `llama-3.3-70b-versatile` (12s timeout, no SDK retries); **Claude Haiku** fallback same JSON schema (**`TRIAGE_FALLBACK_MODEL`**); **Sonnet** optional refine for urgency ≥4. Optional **`TRIAGE_SKIP_GROQ`** on Oracle → Haiku-only (logs: `Using Claude Haiku (TRIAGE_SKIP_GROQ)`). |
| Groq TPM / huge inquiries | DONE | **Context clipped to 3600 chars** (`TRIAGE_CONTEXT_MAX_CHARS`); batch caps default **20** business + **10** outreach; **`TRIAGE_INTER_LEAD_DELAY_MS`** default **350ms** (spreads TPM). |
| Telegram | DONE | `/triage`, `/triage_urgent` in `telegram-bot.ts`; daily brief after cron if `TELEGRAM_LEADS_DIGEST_CHAT_ID` set. |
| HTTP | DONE | **`POST /leads/triage-run`** (Bearer **`LEAD_TRIAGE_SECRET`**): **default 202** + background run so clients/proxies do not socket hang-up; **`?wait=1`** or **`?sync=1`** for synchronous JSON. **`GET /leads/triage-status`** (no secret) — **`ready`** when triage can run. **`GET /leads/dashboard`** — if secret is configured, **no `?secret=`** serves an **HTML unlock form**; **`?secret=`** or successful unlock shows ranked leads (automation-friendly). |
| Ops script | DONE | **`npm run triage:fire`** → `scripts/triage-fire.cjs` (reads `~/cto-aipa/.env`, optional **`TRIAGE_FIRE_WAIT=1`** for sync). Run **on Oracle** so it hits `127.0.0.1:3000` after PM2 is listening. |
| Cron | DONE | **`TRIAGE_CRON`** default `0 8 * * *` **`America/Panama`**. |
| Outcomes log | DONE | **`agent_outcomes`** — `lead_triage` / **`triage_cycle`** after each run (`src/lead-triage.ts`). |
| **Related** — GitHub webhook | DONE | **`reviewCode()`** in `cto-aipa.ts`: Groq + **`timeout: 120s`**, **`maxRetries: 0`** → **`CODE_REVIEW_FALLBACK_MODEL`** (Haiku) on any failure; critical path Opus → Haiku → static stub — avoids **PM2** crash when **Groq** returns **429** (same Node process as triage). |

**Accomplishments to cite (sales + ops):**

- **End-to-end:** Untriaged rows from **`business_leads`** + **`outreach_log`** → model classification → **`lead_triage`** + outcome row; logs show **`🎯 [triage-run] Complete: N processed, M urgent`**.
- **Human-friendly dashboard:** **`webhook.aideazz.xyz/cto/leads/dashboard`** (or your public base URL + **`/leads/dashboard`**) — unlock in browser, then bookmark; **`curl`** / agents still use **`?secret=`** or Bearer on **`triage-run`**.
- **Reliability:** Async **202** default; sync when you need a single response; **GitHub** reviews no longer risk killing the worker on **Groq** limits.

**Cross-module note:** **Groq** quota is shared (code review, Hashnode, Atuona creative paths, triage). Levers: **`TRIAGE_SKIP_GROQ`**, **`CODE_REVIEW_FALLBACK_MODEL`**, or raising Groq limits.

**Phase 6 (showcase package / pitch docs)** — optional product packaging on top of live Phase 1–5 systems.

---

## PART 0 — JARGON DICTIONARY
*Read this before anything else. These are the words your competitors use. Now you own them.*

---

### SEO Terms

**SEO (Search Engine Optimization)**
The practice of making your website show up higher in Google search results without paying for ads. When someone types "AI automation Panama" — SEO is why one site appears first and another doesn't exist at all.

**Domain Authority (DA)**
A score from 0–100 that predicts how likely a website is to rank in Google. High DA = Google trusts this site. A new site starts at ~10. A trusted news site might be 80+. AutoSEO claims to give you "100 DA worth of backlinks" for $149/month — this is the red flag. Real high-DA backlinks cost $100–$500 each. What they're selling is almost certainly fake.

**Backlinks**
Other websites linking to yours. Think of it as votes. If The New York Times links to your page, Google sees that as a strong vote of trust. If 500 fake blogs link to you, Google eventually penalizes you. Quality over quantity is the only rule that survives.

**PBN (Private Blog Network)**
A network of fake or low-quality websites built specifically to link to each other and inflate rankings. Google banned this. Sites using PBNs eventually get penalized. This is what cheap "100 backlinks/month" services almost always deliver.

**Indexed / Not Indexed**
Google sends bots ("crawlers") to read and store your pages. "Indexed" means Google has read your page and can show it in results. "Not indexed" means your page is invisible to Google — it does not exist for search purposes. Google Search Console is the tool that tells you which pages are indexed.

**UTM Parameters**
Tags you add to the end of a URL to track where traffic comes from. Example:
`aideazz.xyz?utm_source=linkedin&utm_campaign=founderoutreach`
When someone clicks that link, your analytics system knows it came from LinkedIn. Without UTMs, you see traffic but can't tell which channel sent it.

**CTR (Click-Through Rate)**
Of everyone who SAW your result in Google, what percentage actually clicked it. 2.69K clicks from 2.3M impressions (as shown in screenshot 8) = 0.1% CTR. That is extremely low and means either the title/description is wrong or the ranking position is too far down.

**Bounce Rate**
Percentage of visitors who land on your page and immediately leave without reading. 78% bounce rate (shown in screenshot 4) means 78 out of 100 people left immediately — the page didn't match what they expected. 34% is much healthier.

**Structured Data / Schema Markup**
Hidden code on your page that tells Google and AI tools exactly what your content is about. FAQ schema, for example, tells Google "this section is a list of questions and answers" — which makes Google show those Q&As directly in search results without the user even clicking your link. This is what makes AI tools like ChatGPT cite specific pages.

**SERP (Search Engine Results Page)**
The actual page Google shows after someone searches. Position 1 = first result shown. Getting your business named as "#1" by ChatGPT (screenshot 14) means you are visible in AI-generated SERPs, not just traditional Google ones.

**Long-tail Keywords**
Specific, longer search phrases. "AI automation" is short-tail — highly competitive, hard to rank. "AI automation tools for construction contractors in Kentucky" is long-tail — less competition, higher conversion because the person knows exactly what they want. This is what the AutoSEO 5-question framework (screenshots 1–9) is really teaching.

---

### Marketing & Automation Terms

**ATS (Applicant Tracking System)**
Software companies use to filter job applications before a human sees them. Keyword filters reject resumes automatically. Relevant to you because VibeJobHunter targets ATS systems — and because you need to explain this to potential AI clients.

**Attribution**
Knowing which channel (Google ad, LinkedIn post, referral, cold email) actually brought you a paying customer. Without attribution you're guessing. With it, you double down on what works. The Manny Blueprint dedicates an entire section to this — it's that important.

**Deliverability**
In email marketing: whether your email actually reaches the inbox vs. going to spam. Using Gmail to send 500 cold emails will destroy your deliverability. Services like Instantly.ai (as referenced in Manny blueprint) use dedicated sending domains specifically to protect deliverability.

**Warm vs. Cold Email**
Warm = the person knows you or opted in. Cold = completely unsolicited. Cold email has its own rules: short, specific, no links in first contact, personal tone. The Manny blueprint's sub-contractor email template is a good example of cold done right.

**Lead Triage**
Sorting incoming leads by priority so the most valuable ones get a response first. The Smith.ai dashboard in the Manny blueprint is a lead triage system: instead of reading 50 call summary emails, you see a ranked list — biggest opportunities on top.

**Content Calendar**
A schedule of what content gets published when and where. AutoSEO's dashboard (screenshots 12–13) is a content calendar. Yours needs to be AI-generated, not manually planned.

**Inbound vs. Outbound**
Inbound = people come to you (found your blog, saw your LinkedIn post, googled you).
Outbound = you go to them (cold email, direct message, cold call).
The Manny blueprint builds both. The AutoSEO product is purely inbound. The Instantly.ai module is purely outbound. You need both pipelines.

**GEO (Generative Engine Optimization)**
New term, 2025-onwards. The practice of making your content get cited and recommended by AI tools like ChatGPT and Perplexity — not just traditional Google. This is what AutoSEO's homepage headline ("Get Found & Recommended by ChatGPT, Perplexity AND Google") is selling. The technical secret: structured data, authority signals, clear authorship, and quotable factual content.

**CMO (Chief Marketing Officer)**
The executive responsible for marketing strategy. In your context, CMO AIPA = your AI agent that handles automated marketing output (LinkedIn posts, content publishing). This is already live in your stack.

**CTO AIPA**
The **technical co-founder agent** in this repo: **Express** server on **Oracle**, **Telegram** bot, **GitHub** webhooks, marketing routes, **Phase 5** triage — not a separate product name for clients; it is “the backend that runs the engine.”

**Express (Node.js)**
A minimal **web server framework** — registers **URL paths** (`GET /leads/dashboard`, `POST /leads/triage-run`) that browsers and automation call. Same idea as “API” in *server has endpoints*.

**PM2**
**Process manager** for Node on the server: keeps **CTO AIPA** running 24/7, restarts on crash, **`pm2 restart cto-aipa`** after deploy. Clients do not configure it — it is infra proof the bot is not “a script you run by hand.”

**Oracle Autonomous Database (ATP) / “Oracle” in tables**
Managed **Oracle** database where **`business_leads`**, **`lead_triage`**, **`outreach_log`**, etc. live — durable storage, not a spreadsheet.

**Bearer token / `Authorization: Bearer …`**
A **secret string** sent in HTTP headers so only your **cron**, **scripts**, or **Cursor** can trigger protected routes (e.g. **`LEAD_TRIAGE_SECRET`** on **`POST /leads/triage-run`**). Different from the **site** inquiry proxy, which uses **CORS** + **reCAPTCHA**, not a browser secret.

**HTTP 202 Accepted**
Means “**request received; work continues in the background**” — used for long **triage** runs so proxies do not **time out** waiting minutes for Groq/Claude.

**Rate limit / HTTP 429**
The API provider temporarily refuses requests (**too many** in a short window). Here, **Groq** can return **429**; triage and code review **fall back to Claude Haiku** so one quota spike does not kill the whole **PM2** process.

---

## PART 1 — WHAT AUTOSEO IS ACTUALLY SELLING (And What's Real)

The 5-question framework from their ad is solid and honest. Apply it to AIdeazz:

| AutoSEO Question | Applied to aideazz.xyz |
|---|---|
| Q1: Can Google find your page? | Check: is aideazz.xyz fully indexed in Google Search Console? All pages? |
| Q2: Does it get to the point? | Does the homepage immediately say what you do and for who? Or does it have a filler intro? |
| Q3: Can people tell you're real? | Does every page have Elena's name, credentials, real results, photo? |
| Q4: Can AI quote your page? | Are there definitions, numbered steps, FAQ sections with structured data? |
| Q5: Is it up to date? | When was the last blog post? Are stats current? |

**What's a scam:** The $149/month backlinks package. "100 DA worth of backlinks" for that price = link farm = Google penalty risk. Do not buy. Build real backlinks by publishing content that founders actually cite and share.

**What's not a scam:** The educational framework. Build your own version of this — automated, honest, without the fake backlinks.

---

## PART 2 — THE FULL ROADMAP (AIdeazz First)

> Rule: Build it for AIdeazz. Document every system. Then offer the same system as a service to founders like Manny.

---

### PHASE 1 — FOUNDATION (Week 1)
*Make sure Google and AI can actually find you before building anything else.*

**System: SEO Health Audit**

Prompt to your CTO AIPA:

```
Audit the SEO foundation of aideazz.xyz. 

Do the following:
1. Fetch Google Search Console data via API — list all indexed pages and any 
   pages returning errors or "not indexed" status
2. Check robots.txt and sitemap.xml — are they correct and accessible?
3. For each main page (homepage, portfolio, pitch, atuona.xyz) — extract the 
   current H1, meta title, meta description
4. Flag any page with: missing meta description, H1 longer than 60 chars, 
   no canonical tag, missing Open Graph tags
5. Output a prioritized fix list sorted by impact

Target: Every page on aideazz.xyz must be indexed and have correct meta tags 
before we publish any new content.
```

**System: Author Authority Setup**

Prompt to your CTO AIPA:

```
For the aideazz.xyz website, create or update the following author trust signals:

1. Create a dedicated /about page for Elena Revicheva including:
   - Full name in H1
   - Phase 1 credentials: Deputy CEO & CLO, Russian digital infrastructure, 7 years
   - Phase 2 credentials: 9 production AI agents on Oracle Cloud, 2025-present
   - Real metrics: $0/month infra, 15K+ lines TypeScript, users in 19 countries
   - Professional photo (use existing)
   - Link to GitHub and LinkedIn

2. Add structured data (JSON-LD Person schema) to the about page with: 
   name, jobTitle, url, sameAs (LinkedIn, GitHub, Twitter)

3. Make sure every blog post will have: 
   author name visible, author link to /about, publish date, 
   last-updated date

This is what AI tools like ChatGPT and Google look for to establish 
"real person with real credentials" before citing a source.
```

---

### PHASE 2 — CONTENT ENGINE (Week 2–3)
*Build the automated content assembly line for AIdeazz. This becomes your showcase.*

**Implementation note (April 2026):** The **live blog** is on **Hashnode** ([aideazz.hashnode.dev](https://aideazz.hashnode.dev)), published via **GraphQL** from `scripts/hashnode-publish.mjs` in the **AIPA_AITCF** repo. Personal Access Token: [Developer settings](https://hashnode.com/settings/developer). The original prompt below referenced **WordPress** — for this stack, treat the publishing target as **Hashnode** (`publishPost` / optional `createDraft`) plus Oracle logging, not WordPress REST.

**System: Blog Auto-Publisher**

This is the core product AutoSEO sells. Build yours better.

Prompt to your CTO AIPA:

```
Build a Content Assembly Line for aideazz.xyz. Architecture:

INPUT:
- A topic brief (2–5 sentences: what to write about, target keyword, 
  audience, the specific technical angle from our production systems)
- Optional: raw notes, code snippets, or results from actual builds

PROCESS:
1. LLM generates a structured blog article following this exact template:
   - H1: keyword-rich title (under 60 chars)
   - Intro paragraph: answer the main question IN THE FIRST 2 SENTENCES 
     (no filler intro — AutoSEO Q2)
   - 3–5 H2 sections with specific, factual content
   - One "Definition" box: define the core term in 1–2 sentences 
     (this is what AI tools pull as quotes)
   - One "Step-by-step" section with numbered steps
     (this is what ChatGPT summarizes)
   - One FAQ section with 3–5 questions and answers using FAQ schema markup
   - Closing paragraph with call to action linking to aideazz.xyz/portfolio

2. Inject structured data (JSON-LD):
   - Article schema (headline, author, datePublished, dateModified)
   - FAQPage schema for the FAQ section

3. Post to Hashnode via GraphQL API (`createDraft` or `publishPost` — match current `scripts/hashnode-publish.mjs` patterns)
   - Tags aligned with topic; optional delisted draft for review
   - Or: generate Markdown file and invoke publish script with `--file`

OUTPUT:
- Draft or published article on Hashnode (blog: aideazz.hashnode.dev)
- Telegram notification to me: 
  "New draft ready: [title] | Keyword: [keyword] | Preview: [link]"
- Append to content_log table in Oracle: 
  topic, keyword, status, date_created

Stack: TypeScript, Express, Claude Sonnet for generation, 
Hashnode GraphQL API (`https://gql.hashnode.com/`), Oracle for logging.
Do NOT use AutoSEO or any third-party content service.
```

**Content topics for the first 10 articles (feed these one by one):**

1. "How to build a multi-agent AI system at $0/month infrastructure cost" — keyword: multi-agent AI system
2. "What is AI-assisted development? How Cursor and Claude Code changed how I build" — keyword: AI-assisted development
3. "Multi-model routing: why I route 76% to Groq and 24% to Claude" — keyword: multi-model LLM routing
4. "How I wire a construction business to AI in 4 systems" — keyword: AI for construction business
5. "AI automation for small businesses: what actually ships vs. what's a demo" — keyword: AI automation small business
6. "Oracle Cloud Always Free: running 9 AI agents at $0/month" — keyword: Oracle Cloud free tier AI
7. "What is an AI agent? The practical definition from someone who runs 9 in production" — keyword: what is an AI agent
8. "GEO vs SEO: how to get your business cited by ChatGPT, not just ranked by Google" — keyword: GEO generative engine optimization
9. "EspaLuz: AI Spanish tutor on WhatsApp — what we built and why" — keyword: AI language tutor WhatsApp
10. "VibeJobHunter: autonomous job search system processing 3000 listings per hour" — keyword: autonomous job search AI

---

### PHASE 3 — ATTRIBUTION & TRACKING (Week 3–4)
*Know which channel is actually sending you leads before scaling anything.*

**System: UTM Link Generator + Lead Attribution Log**

Prompt to your CTO AIPA:

```
Build a minimal attribution tracking system for AIdeazz outbound channels.

PART A — UTM Auto-Tagger:
Create a simple utility that generates UTM-tagged links for each channel:
- LinkedIn posts → utm_source=linkedin&utm_medium=post&utm_campaign=cmo-aipa
- Cold emails → utm_source=email&utm_medium=cold&utm_campaign=founder-outreach
- GitHub profile → utm_source=github&utm_medium=profile
- Telegram bot → utm_source=telegram&utm_medium=bot

PART B — Intake Form on aideazz.xyz:
Add a contact/inquiry form that:
1. Has hidden fields that capture: full_url, utm_source, utm_medium, utm_campaign
2. On submit: posts to a webhook endpoint in our Express service
3. Saves to Oracle table: 
   leads(id, name, email, message, utm_source, utm_medium, landing_url, created_at)

PART C — Weekly Attribution Digest:
Every Monday at 09:00 UTC, send me a Telegram message:
"📊 Weekly Attribution:
- LinkedIn: X leads
- Cold email: X leads
- GitHub: X leads
- Direct/unknown: X leads
- Total: X"

This tells me which channel to double down on.
Stack: TypeScript, Oracle, Telegram Bot, existing Express service.
```

---

### PHASE 4 — OUTBOUND EMAIL SYSTEM (Week 4–5)
*The Manny blueprint calls this "Instantly.ai module." Build yours on your own infrastructure.*

**System: Founder Cold Email Pipeline**

This is the same architecture as VibeJobHunter — just pointed at founders instead of jobs.

Prompt to your CTO AIPA:

```
Build a Founder Outreach Pipeline as a new module in VibeJobHunter or 
as a standalone service. Architecture mirrors the job application pipeline 
but targets potential AIdeazz clients.

INPUT SOURCE:
- LinkedIn company search (founders of companies 5–50 people, 
  "AI automation" or "operations" or "construction tech" keywords)
- YC company directory
- Wellfound listings (founder-led, seed stage)

STEP 1 — Target Discovery:
- Pull companies matching our criteria (size, stage, keywords)
- Extract: company name, founder name, founder email if findable 
  (Hunter.io API for validation), LinkedIn URL

STEP 2 — Email Validation:
- Run each email through Hunter.io verify endpoint
- Only keep contacts with status "valid" or "accept_all"
- Store in Oracle: outreach_targets(id, name, company, email, 
  email_status, source, created_at)

STEP 3 — Personalized Email Generation:
For each validated contact, generate an email using this template logic:
- Research their company (what do they build? what's their pain point?)
- Map one of our 9 production systems to their pain
- 3-paragraph max, no links in first email, ends with:
  "If this is relevant, reply and I'll send you a short demo of how the 
   wiring works."
- Subject line: specific to their company, no buzzwords

STEP 4 — Send via dedicated domain (NOT aipa@aideazz.xyz):
- Set up a secondary sending domain (e.g., hello@aideazz.co or similar)
- Use Resend API (already in our stack) with that domain
- Daily cap: 10 emails/day max to protect deliverability
- Log every send to Oracle: outreach_log(id, target_id, subject, 
  sent_at, opened, replied)

STEP 5 — Reply Detection + Telegram Alert:
- Poll inbox every 15 min for replies to outreach emails
- When reply detected: 
  "🔥 Founder reply from [Name] at [Company]: [first 100 chars of reply]"
  + link to full email thread

Do NOT start sending until I approve a sample batch of 5 emails first.
```

---

### PHASE 5 — LEAD TRIAGE DASHBOARD (Week 5–6)
*The Smith.ai module from the Manny blueprint — built for AIdeazz's own incoming signals.*

**Implementation note (April 2026):** Shipped as **`GET /leads/dashboard`** with **`LEAD_TRIAGE_SECRET`** — **HTML unlock form** if you open the URL without **`?secret=`**; production public path pattern: **`https://webhook.aideazz.xyz/cto/leads/dashboard`** (nginx strips **`/cto`** for Express). Triage trigger: **`POST /leads/triage-run`** with Bearer secret; status: **`GET /leads/triage-status`**.

**System: Unified Lead Intelligence Dashboard**

Prompt to your CTO AIPA:

```
Build a Lead Triage Dashboard for AIdeazz. This is the same pattern as 
the Smith.ai email → AI triage system in the Manny blueprint, but for 
our incoming signals.

DATA SOURCES (all ingested automatically):
1. Contact form submissions from aideazz.xyz (from Phase 3 system)
2. Telegram /start messages from new users on any of our bots
3. LinkedIn DM replies (if LinkedIn API available, else manual import)
4. Email replies to outreach campaigns (from Phase 4 system)
5. VibeJobHunter: interview invitations and recruiter replies

PROCESSING (AI extraction per lead):
For each incoming signal, extract:
- Source channel
- Company/person name
- Signal type: job_opportunity / client_lead / partnership / irrelevant
- If client lead: what problem did they describe?
- Urgency score (1–5) based on language: 
  "urgent", "asap", "this week" = 5; generic inquiry = 2
- Estimated deal value category: 
  fractional_engagement / full_time_role / product_user / unknown

DISPLAY:
Simple web dashboard (password protected — implemented as `/leads/dashboard` + secret):
- Top section: "Act Today" — score 4–5 leads
- Middle section: "Follow Up This Week" — score 2–3
- Bottom section: "Monitor" — score 1, or unclear type
- Each card shows: name, source, summary, urgency, next action suggestion

TELEGRAM DAILY BRIEF (08:00 UTC):
"📥 Lead Brief:
🔴 Act Today: X items
🟡 This Week: X items
⚪ Monitor: X items
Top priority: [Name] from [Source] — [one line summary]"

Stack: TypeScript, Express, Oracle, Claude for classification, 
existing Telegram bot. Build as module in AIPA_AITCF repo.
```

---

### PHASE 6 — THE SHOWCASE PACKAGE (Week 6–8)
*Once AIdeazz runs all 5 systems — this becomes the product you sell.*

**What you can now show to every founder like Manny:**

| System | What it does | Evidence from your stack |
|--------|-------------|--------------------------|
| SEO + GEO Foundation | Google and ChatGPT find and cite your business | aideazz.xyz indexed, structured data live |
| Blog Auto-Publisher | 1 article/day, AI-generated, relevant to your clients | 10+ published articles with metrics |
| UTM Attribution | Know which channel sends real leads | Oracle table with 30+ days of data |
| Cold Outreach Pipeline | Personalized founder emails, validated, capped | Reply rate from 50+ sends |
| Lead Triage Dashboard | Never miss a high-value lead | Dashboard with live data |

**The pitch is now concrete:**
> "I built this for my own company. Here's the dashboard. Here's the attribution table. Here's the reply rate from 50 cold emails. I can wire the same system for your business in 4–6 weeks. You bring the data. I make it intelligent."

---

## PART 3 — THE MANNY BLUEPRINT BREAKDOWN
*Which parts are the WordPress trap. Which parts are your exact competency.*

| Blueprint Module | Trap or Right? | Your Move |
|---|---|---|
| Website rebuild on WordPress | **TRAP** — this is IT work, not AI work. Anyone can set up WordPress. You should not do this. | Decline or delegate. Charge only if they pay $150/hr minimum. This is not in your offer. |
| DNS / hosting setup | **TRAP** — pure admin, zero AI, zero leverage | Same as above |
| SEO + AI Content Assembly Line | **RIGHT** — this is exactly Phase 2 above | This is your core offer |
| Attribution capture | **RIGHT** — Phase 3 above, already designed | Lead with this — it's what separates you from generic content agencies |
| Outbound list builder (Google Places + Hunter.io) | **RIGHT** — Phase 4 above, nearly identical to Founder Pipeline | This is what you built for VibeJobHunter. Point at contractors instead of companies. |
| Instantly.ai sending system | **RIGHT** — but use Resend (already in your stack) | Same architecture, different data |
| Subcontractor sourcing from takeoffs | **RIGHT** — this is a document parsing → outreach pipeline | EspaLuz architecture + VibeJobHunter outreach = this system exactly |
| Smith.ai lead triage dashboard | **RIGHT** — Phase 5 above, word for word | This is the highest ROI module for Manny. Leads were going to die in email. |

**Answer to your question: Yes, Manny was the WordPress trap.**
He needed the AI modules. He got stuck with someone billing hours on hosting setup. The AI Architechs blueprint is solid — but it needs a builder who starts at module 4 (content assembly line), not module 1 (DNS).

**What to tell the next Manny:**
> "I don't do WordPress. I wire your data to your decisions. I'll build you three things: a system that turns your job photos and notes into published content automatically, a system that validates and emails your sub-contractor targets from your own takeoff sheets, and a dashboard that ranks your incoming leads so you call the right people first. That's it. That's the engagement."

---

## PART 4 — JARGON CHEAT SHEET FOR CLIENT CONVERSATIONS

When a founder asks you "what does this actually do" — use these plain-language explanations:

| Technical Term | Say This Instead |
|---|---|
| SEO optimization | "Making sure Google can find your business when someone searches for what you do" |
| GEO / AI visibility | "Making sure ChatGPT recommends your business when someone asks for the best [service] in [city]" |
| Structured data | "Hidden tags on your website that tell AI tools exactly what your content is about, so they quote you" |
| UTM tracking / attribution | "A system that tells me exactly which marketing channel sent you each paying customer" |
| Multi-model LLM routing | "I use cheap fast AI for standard tasks and expensive precise AI only when the stakes are high — saves money and improves quality" |
| Cold email deliverability | "Making sure your outreach emails land in inboxes, not spam folders" |
| Lead triage | "A ranked list of your incoming leads so you call the valuable ones first, not in the order they arrived" |
| Webhook | "An automatic signal one system sends to another when something happens — like a doorbell that triggers a whole chain of actions" |
| Agent / autonomous system | "Software that monitors something, makes decisions, and takes action without you pressing a button" |
| PM2 | "A watchdog that keeps the server process running 24/7 and restarts it if it crashes" |
| Bearer / API secret | "A password for machines — your automation proves it’s you so random people can’t trigger your backend jobs" |
| HTTP 202 | "The server said ‘got it, I’m working on it in the background’ — so long jobs don’t time out" |

---

## QUICK REFERENCE: PROMPT ORDER FOR CTO AIPA

Execute in this order. Do not start Phase 2 until Phase 1 is complete.

```
Phase 1a: SEO Health Audit → aideazz.xyz indexing status
Phase 1b: Author Authority Setup → /about page + Person schema
Phase 2:  Blog Auto-Publisher → Content assembly line (**Hashnode** GraphQL today; **WordPress** REST is the same pattern for client sites)
Phase 3:  UTM Attribution System → Contact form + lead logging + weekly digest
Phase 4:  Founder Outreach Pipeline → Hunter.io + Resend + reply detection
Phase 5:  Lead Triage Dashboard → Unified signals + priority scoring + daily brief
Phase 6:  Package documentation → README + demo walkthrough for client pitches
```

**Total build time estimate:** 6–8 weeks at current pace, parallel where possible.

**What you have when done:**
A fully operational AI marketing engine running on your $0/month Oracle infrastructure, producing evidence you can show every founder who asks "but have you done this before?"

The answer is no longer "I can build it." It's "Here it is, running. Want me to wire yours?"

---

> Document version: April 13, 2026 (v15.1 — document map + full Phase 4 “actually working” / empty-gun table preserved)
> Aligned with: CAREER_FOCUS.md v4 (April 2026 — outreach operational), SKILL.md v1.3
> Phase 1 status: COMPLETE (GEO + sitemap + GSC + OG + GA4); **canonical SPA fix** in **aideazz** repo Apr 2026
> Phase 2 status: MOSTLY COMPLETE — Hashnode daily publisher live; LLM draft queue optional
> Phase 3 status: COMPLETE — UTM + inquiry + reCAPTCHA Enterprise
> Phase 4 status: COMPLETE & VERIFIED — client sends via CTO AIPA (Resend+Oracle); employer sends via VJH only when email delivers; applications counted only on real ATS or email delivery
> Phase 5 status: OPERATIONAL — **`lead_triage`** + **`agent_outcomes`**; **`/leads/dashboard`** unlock form; **`triage-run`** 202/ sync; **`TRIAGE_SKIP_GROQ`**; **`reviewCode`** Groq→Haiku (**`CODE_REVIEW_FALLBACK_MODEL`**)
> Next: Phase 6 (showcase package); optional widen outreach sources; optional draft→approve before Hashnode publish
