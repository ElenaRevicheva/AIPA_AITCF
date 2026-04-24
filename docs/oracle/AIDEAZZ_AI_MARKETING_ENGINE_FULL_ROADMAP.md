# AIdeazz AI Marketing Engine — Full Roadmap
> Version: April 17, 2026 (v16.1 — **[aideazz](https://github.com/ElenaRevicheva/aideazz)** www→apex JS redirect + `_redirects` `.gitignore` seal + 404 noindex + hreflang EN/ES; [Phase 1f](#phase-1f-redirect-hygiene--hreflang--april-17-2026) · prior v16.0 build-time **`scripts/generate-sitemap.mjs`** + apex URL hygiene + **`robots.txt`** `Disallow` for `/.gitignore`; [Phase 1e](#phase-1e-build-time-sitemap-apex-robots--april-2026) · prior v15.9 `src/lib/seo.ts` [Phase 1c addendum](#phase-1c-addendum-centralized-spa-meta--april-2026)) | Prior: April 14, 2026 (v15.8 — Oracle wallet) | April 13, 2026 (v15.7 — GEO FAQPage) | Built from: AutoSEO analysis + Manny Blueprint + CAREER_FOCUS v3 + SKILL.md
> Purpose: Wire AIdeazz first. Showcase to every future client.

**Who should read this:** **Engineers** — implementation tables, env names, endpoints. **Vibe coders & builders** — phased prompts and “what shipped” without needing every Oracle detail. **Potential clients** — read *Document map* (one screen), then *Why this engine exists*, *WordPress clients*, and *Jargon cheat sheet*; deeper sections prove the stack is real.

---

## Document map — Phases 1 through 6 (read in this order)

This file is organized around **six phases**. Everything else (AutoSEO critique, Manny blueprint, engineer handoff) **supports** the same sequence.

| Phase | Name | What it is (one line) | Status (Apr 2026) |
|------:|------|----------------------|-------------------|
| **1** | Foundation (GEO + SEO health) | Google and AI assistants can **find** and **trust** your site — structured data, sitemap, GSC, analytics. | **Complete** |
| **2** | Content engine | Automated **long-form publishing** (Hashnode) + Oracle **`content_log`** — compound visibility. | **Complete** (Dev.to cross-post + GSC gap topic selection live) |
| **3** | Attribution | **UTM** + inquiry → Oracle **`business_leads`** — know which channel sent the lead. | **Complete** |
| **4** | Outbound | **Cold email** (CTO AIPA “hire us” + VJH “hire me”) — Resend, Hunter, caps, honest **`outreach_log`**. | **Shipped & verified** |
| **5** | Lead triage | **AI classification** → **`lead_triage`** + dashboard + Telegram — respond to the right signal first. | **Operational** |
| **6** | Showcase | **Pitch package** — README + live demo proving Phases 1–5 (packaged doc / walkthrough). | **Not started — ⚡ highest priority for hiring mission: this is the "show don't tell" asset every interview needs** |

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
| **SPA meta — one module (Apr 2026)** | **[aideazz](https://github.com/ElenaRevicheva/aideazz)** `src/lib/seo.ts` + pages | **`applyPageSeo()`** sets `document.title`, `meta[name=description]`, OG + Twitter, canonical, `og:site_name`, optional `robots`. **`applyHomePageSeo()`** reapplies strings matching **`index.html`** when **`/`** mounts — fixes meta staying on **portfolio** copy after client-side navigation home. **`BusinessCard`** previously only updated description if a tag existed; now always ensured. **`NotFound`**: `noindex, follow` + short description. Commit on `main`: centralize; **no duplicate** `setMeta` blocks across `About` / `Blog*` / `Portfolio`. | Audits that only read static HTML still see **`index.html`** for first paint; after JS, **DevTools → Elements → `<head>`** or **[opengraph.xyz](https://www.opengraph.xyz/)** on the full URL proves per-route tags. Deploy **4everland** from `main`. Details: [Phase 1c addendum](#phase-1c-addendum-centralized-spa-meta--april-2026). |
| **Sitemap + apex + robots (Apr 2026)** | **[aideazz](https://github.com/ElenaRevicheva/aideazz)** `scripts/generate-sitemap.mjs`, `public/robots.txt`, `package.json` build | **`npm run build`** = **`node scripts/generate-sitemap.mjs`** (static routes + **live Hashnode** slugs via public GraphQL → **`/blog/{slug}`** on **`aideazz.xyz`**) → **`vite build`** → **`verify-seo.mjs`**. Pretty-printed **`sitemap.xml`** / **`sitemap.txt`**. **`robots.txt`**: comment on **apex canonical**; **`Disallow: /.gitignore`** (mitigate stray indexing). Internal links standardized from **`www.aideazz.xyz`** → **`https://aideazz.xyz`**. **`BlogPost`**: default **`alt`** for markdown **`img`** without alt. **`index.html`**: HTML comment on apex + `seo.ts`. | Google can discover **on-domain blog URLs** in sitemap (not only Hashnode). **Still manual:** **301 `www` → apex** at DNS/host if both exist; **GSC** URL removal for **`/.gitignore`** if previously indexed. If **`/sitemap.xml` returned 500**, redeploy from `main` and retest gateway. Details: [Phase 1e](#phase-1e-build-time-sitemap-apex-robots--april-2026). |
| **Oracle deploy** | `ubuntu@` Oracle, `~/cto-aipa` | **`git pull` → `npm run build` → `pm2 restart cto-aipa --update-env`**. Then **`npm run triage:fire`** once **`curl` to `127.0.0.1:3000/`** succeeds. | **HTTP 202** + triage start in PM2 logs is the smoke test. |
| **www→apex redirect + .gitignore seal + 404 noindex + hreflang (Apr 17, 2026)** | **[aideazz](https://github.com/ElenaRevicheva/aideazz)** `src/main.tsx`, `public/_redirects`, `src/App.tsx`, `index.html` | **`main.tsx`**: JS www→apex redirect fires before React mounts (`window.location.replace`). **`_redirects`**: `/.gitignore / 301` rule added *before* the `/* /index.html 200` catch-all — seals the file from being served and re-indexed. **`App.tsx`**: imported and wired `NotFound` component on `path="*"` (was a bare `<div>` with no noindex). **`index.html`**: hreflang EN/ES/x-default added (site serves both languages at same URLs via i18next). **GSC**: URL removal submitted for `/.gitignore`; indexing requested for apex homepage, `/portfolio`, `/blog`. Two commits: `25e0918` + `31b0f48`. | `.gitignore` was publicly accessible at HTTP 200 (catch-all served React app) and had been indexed by Google. www homepage was indexed but apex was not. 404 pages were not noindexed. Cloudflare HTTP 301 still pending (JS redirect is live in the meantime). |
| **Phase 4c–4d ingest (Manny-style sources)** | `prospect-places.ts`, `doc-ingest.ts`, `cto-aipa.ts`, `telegram-bot.ts` | **Places:** local/industry prospect lists via **Google Places API** (requires **`GOOGLE_PLACES_API_KEY`**). **Doc:** operational documents → entities → same **`outreach_targets`** pipeline. Telegram **`/places_ingest`**, **`/doc_ingest`**. | Confirms blueprint “list builder” + “takeoff/RFP” paths exist in code — not only YC JSON. |

**Production signals (Phase 5 accomplishments):** `🎯 [triage-run] Starting (background=true)...` → per-lead **`[triage] Classifying lead…`** → **`🎯 [triage-run] Complete: N processed, M urgent`** in PM2 logs; Oracle **`lead_triage`** rows from **`business_leads`** + **`outreach_log`**; **`agent_outcomes`** records the **`triage_cycle`** run. **`GET /leads/triage-status`** exposes **`ready: true`** when **`ANTHROPIC_API_KEY`** is configured. **Optional deep check:** **`TRIAGE_FIRE_WAIT=1 npm run triage:fire`** returns one JSON payload with **`processed` / `urgent`** without tailing logs.

**What we did *not* claim:** Atuona creative engine untouched; Hashnode daily unchanged in this handoff; no broad refactors.

---

## Postmortem — April 14, 2026 (why it looked like “Google API encoding broke Oracle,” and how it was fixed)

### Why the incident lined up with the Google Places / Phase 4c deploy

- **Same deployment, two unrelated layers.** The change that added **Phase 4c** (`src/prospect-places.ts`, `/places_ingest`, Google Places API request shape and region/bias) **shipped in the same window** as edits to **`src/database.ts`** (Oracle pool: shorter **`queueTimeout`**, removal of **ORA-29024** pool-reset/retry). That is **coincidence in time**, not proof that “Places encoding” altered Oracle TLS or the wallet.
- **Google Places does not modify Oracle wire security.** `prospect-places.ts` calls **Google** over HTTPS and uses Oracle only for **dedup** (`getOutreachExistingCompaniesLowercase`) and **`importTargets`**. There is **no** shared “encoding” path that could corrupt **`TNS_ADMIN`**, mTLS, or **`sqlnet.ora`**.
- **What actually hurt reliability:** **ADB client configuration on the VM** — wallet files stale or mis-pointed (**`sqlnet.ora`** default `DIRECTORY="?/network/admin"` vs real wallet dir), missing **`WALLET_PASSWORD`** for **`ewallet.p12`**, and/or **ORA-29024** when trust material did not match the service. Symptoms: **ORA-28759** (“failure to open file”), connection hangs, **NJS-040** timeouts, Telegram feeling “dead” while the pool waits.

### aideazz vs aipa (no mystery)

- The **compute** VM can be in the **aideazz** tenancy; **Autonomous AI Database** `cto-aipa-db` (internal **`ctoaipadb2025`**) remains in the **aipa** compartment. **Not having an ADB in aideazz** is expected for this stack: the app connects with **wallet + `.env`**, not “VM account = DB account.”

### Fix summary (operations + code)

| Step | Action |
|------|--------|
| 1 | In **aipa** OCI → **`cto-aipa-db`** → **Database connection** → download **new client credentials (wallet)**. |
| 2 | On the server: replace **`~/cto-aipa/wallet/`** with unzipped files; **`tnsnames.ora`** / **`cwallet.sso`** etc. must live **directly** in that folder (flatten any nested `wallet/` directory). |
| 3 | Set **`sqlnet.ora`** **`WALLET_LOCATION`** to the **absolute** path, e.g. `"/home/ubuntu/cto-aipa/wallet"` (OCI’s default **`?/network/admin`** targets Instant Client’s admin dir, not PM2’s wallet). File must use **LF** line endings. |
| 4 | **`~/cto-aipa/.env`:** **`DB_SERVICE_NAME`** = TNS alias from **`tnsnames.ora`** (e.g. **`ctoaipadb2025_high`**); **`DB_USER`** / **`DB_PASSWORD`** = database user (e.g. ADMIN); **`WALLET_PASSWORD`** = password from the wallet download (**not** the same as **`DB_PASSWORD`**). Optional **`TNS_ADMIN`** if the wallet path differs. |
| 5 | **Code (AIPA_AITCF):** `database.ts` — pass **`walletPassword`** when **`WALLET_PASSWORD`** is set; allow **`TNS_ADMIN`** override; restore **retry + `resetPool()`** on **ORA-29024** / transient pool errors. |
| 6 | **`git pull` → `npm run build` → `pm2 restart cto-aipa --update-env`**. |

### Proof it works

- PM2 / stdout: **`🔗 Connected to Oracle Autonomous Database (mTLS)`** without **ORA-29024** / **ORA-28759** loops.
- Telegram **`/places_ingest …`** returns a completion block with **“New targets imported: N”** — that requires **both** Google Places **and** Oracle **`outreach_targets`** inserts.

**Related:** [ORACLE_ALL_PRODUCTS_RESILIENCE.md](./ORACLE_ALL_PRODUCTS_RESILIENCE.md) — instance-wide PM2/systemd health checks and **CTO AIPA + ADB** note.

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

## MANNY SANTOS BLUEPRINT — CROSS-REFERENCE (Client Implementation Template)

> Source: *Manny Santos Implementation Blueprint* (Eddie Irvin, 22pp) — a remodeling/construction business in Lexington, KY. Same problem pattern as every client: **data flowing through the business that nobody is processing intelligently.**

**The thesis:** Every system Elena built for AIdeazz is what she would wire for a client like Manny. **Five of the seven** blueprint rows below map cleanly to **Phases 1–5** (foundation → content → attribution → outbound → triage); the other two are **list-building and job-document workflows** that extend Phase 4 (now implemented as **Places** + **document ingest** — see verification below). AIdeazz is the proof-of-concept. Phase 6 packages it as the pitch.

**Code verification (AIPA_AITCF):** Google **Places** prospecting and **document → outreach** are implemented in-tree — `src/prospect-places.ts` (`runPlacesIngestion`), `src/doc-ingest.ts` (`runDocIngestion`), wired in `src/cto-aipa.ts` (`POST /outreach/ingest-places`, `POST /outreach/ingest-doc`, `GET /outreach/ingest-places/presets`) and Telegram **`/places_ingest`**, **`/doc_ingest`**. Same **`outreach_targets`** + Hunter + Resend path as YC ingest. Places requires **`GOOGLE_PLACES_API_KEY`** (see `.env.example`).

### System-by-system mapping

| Manny's System | AIdeazz Phase | Coverage | Gap / Adaptation |
|---|---|---|---|
| **Website Rebuild + Domain Control** — own your hosting, exit vendor lock-in | Phase 1 GEO | ✅ **Covered** — aideazz.xyz on owned infra, GSC verified, sitemap, canonical fix | For client: ~5min with Yoast/RankMath on WordPress vs Elena's hand-coded JSON-LD |
| **SEO + AI Content Assembly Line** — raw inputs → blog drafts → social | Phase 2 Blog Engine | ✅ **Covered** — Hashnode daily auto-publisher, GSC gap topic selection, Dev.to cross-post | ⚠️ **Gap:** Manny needs **draft queue + human approval** before publish. Elena auto-publishes. `createDraft` + Telegram approval flow = NOT STARTED (Phase 2 table). For client: swap to `POST /wp-json/wp/v2/posts?status=draft` + Telegram notify. |
| **Attribution Capture + Monthly Review** — UTM/form → spreadsheet | Phase 3 UTM | ✅ **Covered** — Elena's is more complete: Oracle `business_leads`, reCAPTCHA Enterprise, inquiry pipeline | For client: Gravity Forms / CF7 hook to same Oracle endpoint. Manny's version needs a monthly spreadsheet export — `getRecentContentLogs()` already exists, add CSV export route. |
| **Outbound List Builder** — Google Places API + Hunter.io validation → email | Phase 4 Outreach | ✅ **Complete** — `src/prospect-places.ts`: `runPlacesIngestion(city, industry)` → Places API v1 text search → Hunter.io → `outreach_targets`. HTTP: `POST /outreach/ingest-places`. Telegram: `/places_ingest architects Lexington KY`. Requires `GOOGLE_PLACES_API_KEY`. | Industry presets: construction, saas, retail, healthcare. Claude Haiku classifies pain point per place. |
| **Outbound Email Sending (Instantly.ai)** — centralized cold send | Phase 4 Outreach | ✅ **Covered** — Resend is the functional equivalent; same deliverability best practices | Manny uses Instantly.ai (separate domain warmup); Elena uses Resend. Both protect main domain. Swap is ~1h config. |
| **Lead Triage Dashboard** — call emails → AI score → Lexington vs rest | Phase 5 Lead Triage | ✅ **Covered** — same pattern, Elena's is more advanced: Groq + Haiku fallback + Sonnet for high urgency | Manny's input is **Smith.ai call summary emails**; Elena's is web inquiries + outreach replies. **Ingestion adapter** = add email webhook → `business_leads` insert. ~2h. |
| **Subcontractor Sourcing from Takeoff** — parse job docs → trade-specific outreach | Phase 4 extension | ✅ **Shipped** — `src/doc-ingest.ts`: Claude extracts prospect entities from pasted text (RFP, takeoff, call log, client list) → Hunter.io → **`importTargets`** → same pipeline as YC/Places. HTTP: **`POST /outreach/ingest-doc`** (Bearer **`OUTREACH_SECRET`**). Telegram: **`/doc_ingest`**. Optional per-job dashboard UI = future polish; **core loop is in the engine.** |

<a id="client-ready-gaps"></a>

### Client-ready gaps (what is left vs. what shipped)

| Gap (from Manny-style engagements) | Status | Notes |
|---|---|---|
| **Draft queue + Telegram approval** (~4h) | **Not started** | Many clients will **not** allow AI to auto-publish live. Needs **`createDraft`** on Hashnode (or WordPress `status=draft`) + Telegram approve/reject. **Elena is satisfied with automated Hashnode publishing for her own blog today** — track this for white-label / client sites. |
| **Google Places API as lead source** (~1 day was the estimate) | **Implemented** | Supplements (does not replace) YC JSON ingest. See **`prospect-places.ts`**, **`GOOGLE_PLACES_API_KEY`**, **`/places_ingest`**. |
| **Document ingestion → outreach** (highest-value for ops-heavy clients) | **Implemented** | Takeoff / RFP / logs → entities → **`outreach_targets`**. See **`doc-ingest.ts`**, **`/doc_ingest`**. |

**Previously listed as “three gaps” — two are now covered in code; the draft/approval workflow remains the main product gap for client deployments.**

### The data flow insight (client pitch core)

Every client Elena will ever have is running one of these three broken loops:
- **Data comes in** (calls, inquiries, project docs, invoices) → **sits in email / file folders** → Manny manually decides what to act on
- **Marketing happens** (posts, ads, outreach) → **no attribution** → guessing which channel works
- **Leads arrive** → **no priority ranking** → biggest opportunities buried under the noise

Elena's engine breaks all three loops. She built it for herself. Now she wires it for clients.

---

<a id="impl-phases-16"></a>

## Phases 1–6 — implementation status (what shipped)

> Updated: April 13, 2026 — Phase 4 outreach verified. **Phase 5** — full triage cycle (Groq → Haiku fallback → optional Sonnet refine), **`lead_triage`** persistence, **`/leads/dashboard`** with **unlock form** or **`?secret=`**, **`/leads/triage-status`**, cron + **`npm run triage:fire`**. **Related stability:** **`reviewCode()`** Groq → **`CODE_REVIEW_FALLBACK_MODEL`** (Haiku) so **GitHub webhooks** do not take down the **PM2** worker on **429**. **aideazz** canonical fix lives in the **aideazz** repo (see Handoff).

### Phase 1a: SEO Health Audit — DONE

| Task | Status | Details |
|---|---|---|
| Google Search Console verified | DONE | Domain property `sc-domain:aideazz.xyz` active |
| sitemap.xml created & validated | DONE | 11 URLs (static routes + live Hashnode blog slugs), valid XML, no BOM, LF line endings |
| sitemap.txt created (plain text fallback) | DONE | Google accepted this format immediately — bypassed IPFS/CDN XML parsing issues |
| GSC sitemap submission | DONE | **"Successfully" — 11 URLs** (sitemap regenerated Apr 2026 with blog slugs via Hashnode GraphQL) |
| robots.txt updated | DONE | AI bot permissions (GPTBot, ChatGPT-User, PerplexityBot, ClaudeBot) + dual sitemap references |
| CDN warming workflow | DONE | GitHub Actions cron every 2h — pre-fetches sitemap/robots to keep IPFS CDN edges warm |
| Build-time SEO verification | DONE | **`node scripts/generate-sitemap.mjs`** (Hashnode + static routes → `public/sitemap.*`) then **`vite build`** then **`scripts/verify-seo.mjs`** — fails build if sitemap.xml, sitemap.txt, or robots.txt missing from dist/ |

**How to check (non-dev guide):**
1. Open **https://aideazz.xyz/sitemap.xml** in your browser — you should see a list of 11 URLs. If it loads, the sitemap works.
2. Open **https://aideazz.xyz/robots.txt** — you should see lines like `User-agent: GPTBot` and `Allow: /`. If you see it, robots.txt works.
3. Go to **[Google Search Console](https://search.google.com/search-console)** → select `sc-domain:aideazz.xyz` → left sidebar **Sitemaps** — status should say "Success" with 11 discovered URLs.
4. In GSC → left sidebar **Pages** — see how many pages are indexed. This number should grow over the next days.

### Phase 1b: GEO Foundation — DONE

| Task | Status | Details |
|---|---|---|
| JSON-LD Organization schema | DONE | On index.html — founder, sameAs, logo |
| JSON-LD Person schema (Elena) | DONE | On index.html + /about page — knowsAbout, sameAs, worksFor, knowsLanguage |
| JSON-LD FAQPage schema | DONE | **12 Q&As** on index.html — original 5 + 7 client-intent questions: "How much does it cost to build an AI automation system?", "Who builds AI agents for small business?", "What is GEO and how is it different from SEO?", "Can AI replace a marketing team?", "What AI tools does Elena use?", "How long does it take to build an AI marketing engine?", "What industries can benefit from AI automation?" All 12 mirrored in noscript block. Deployed Apr 13 2026. |
| Open Graph meta tags | DONE | All pages — og:type, og:title, og:description, og:image, og:url |
| Twitter Card meta tags | DONE | summary_large_image on all pages |
| Canonical URLs | DONE | Per-route in React (`Index`, `About`, `Blog*`, `BusinessCard`); **Apr 2026:** removed static homepage canonical from `index.html` in **[aideazz](https://github.com/ElenaRevicheva/aideazz)** to stop GSC “duplicate canonical” / wrong default for all URLs |
| /about page (Author Authority) | DONE | Full bio, Phase 1 + Phase 2 credentials, photo, stats grid, JSON-LD Person schema, CTA |
| /portfolio page GEO | DONE | ProfilePage JSON-LD, dynamic OG tags, makesOffer |
| noscript content block | DONE | Full static HTML in index.html for AI crawlers that don't execute JavaScript — all 9 agents described, tech stack, metrics, FAQs |
| Positioning update (EN + ES) | DONE | "Executive-Turned-AI-Builder" in both languages |

**How to check (non-dev guide):**
1. Open **https://aideazz.xyz** → right-click → **View Page Source** → press Ctrl+F and search `application/ld+json` — you should find 3 JSON blocks (Organization, Person, FAQPage). If you see them, the schemas are live.
2. Ask **ChatGPT** or **Perplexity**: "Who is Elena Revicheva?" or "Who builds AI agents in Panama?" — if she appears in the answer, GEO is working. (This may take weeks/months to build up.)
3. Go to **https://search.google.com/test/rich-results** → paste `https://aideazz.xyz` → click **Test URL**. It should show "FAQ" and "Organization" as detected structured data.
4. Open **https://aideazz.xyz** → View Page Source → search `noscript` — you should see a large block of static HTML text describing all 9 agents. This is what AI crawlers read.

### Phase 1c: OG Image & Social Sharing Fix — DONE

| Task | Status | Details |
|---|---|---|
| OG image optimized | DONE | Created `elena-og.jpg` (1200x630, 133KB) from original (2688x3840, 2.1MB) — fixes WhatsApp/LinkedIn/Twitter sharing |
| All og:image refs updated | DONE | index.html, BusinessCard.tsx, About.tsx — all point to optimized image |
| Team nav link added | DONE | "Team" (EN) / "Equipo" (ES) links to `#team` anchor on homepage |
| Founder section enriched | DONE | Career phases (Executive 2011-2018 + AI Builder 2025-Present) + stats grid (9 agents, $0/month, 76/24%, 12 months) added to VisionSection |
| Social sharing validated | DONE | opengraph.xyz shows correct title, description, image for aideazz.xyz and /portfolio |

**How to check (non-dev guide):**
1. Go to **https://www.opengraph.xyz** → paste `https://aideazz.xyz` → you should see Elena's photo, the title "AIdeazz", and a description. This is exactly what WhatsApp/LinkedIn/Twitter show when someone shares the link.
2. Paste `https://aideazz.xyz/portfolio` too — should show a different title and description specific to the portfolio page.
3. Copy the link `https://aideazz.xyz` and paste it into a WhatsApp chat (to yourself) — the preview card should show the photo and title.

<a id="phase-1c-addendum-centralized-spa-meta--april-2026"></a>

### Phase 1c addendum: Centralized SPA meta — April 2026

> **Code lives in the [aideazz](https://github.com/ElenaRevicheva/aideazz) repo** (not AIPA_AITCF). This addendum records what shipped so the marketing doc stays the single source of truth.

| Task | Status | Details |
|---|---|---|
| **`src/lib/seo.ts`** | DONE | Exports **`SITE_ORIGIN`**, **`DEFAULT_OG_IMAGE`**, **`HOME_SEO`** (same copy as root **`index.html`**), **`applyPageSeo(opts)`** (title, description, canonical URL, `og:type`, optional Twitter overrides, optional **`robots`**), **`applyHomePageSeo()`** for **`/`**. |
| **`Index.tsx`** | DONE | On mount, calls **`applyHomePageSeo()`** so returning from **`/portfolio`** (or any route) **restores** homepage title + description + OG/Twitter — not leftover portfolio text. |
| **`BusinessCard.tsx` (`/portfolio`)** | DONE | Replaced ad-hoc meta helpers with **`applyPageSeo`**; **fix:** description is **created or updated** (previously only **`setAttribute`** if `meta[name=description]` already existed). EN/ES title + description unchanged in meaning. |
| **`About`, `BlogIndex`, `BlogPost`** | DONE | Same helper — no duplicated **`setMeta`** loops; **`BlogPost`** truncates description for long briefs (**`slice(0, 320)`**). |
| **`NotFound`** | DONE | **`applyPageSeo`** with **`robots: noindex, follow`** and a short 404 description; canonical uses current path. |
| **How to prove (manual QA)** | — | **After deploy:** open **`https://aideazz.xyz`**, **`/portfolio`**, **`/about`**, **`/blog`** → **DevTools → Elements → `<head>`** — confirm **`meta name=description`** and **`og:*`** match the route. **[opengraph.xyz](https://www.opengraph.xyz/)** paste full URL for a **card preview**. **Limitation (unchanged):** “View Page Source” on a deep link still shows the **built `index.html`** until JS runs — same SPA caveat as the canonical fix above. |

<a id="phase-1e-build-time-sitemap-apex-robots--april-2026"></a>

### Phase 1e: Build-time sitemap, apex URLs, robots hardening — April 2026

> **[aideazz](https://github.com/ElenaRevicheva/aideazz)** only (not AIPA_AITCF). Complements [Phase 1c addendum](#phase-1c-addendum-centralized-spa-meta--april-2026).

| Task | Status | Details |
|---|---|---|
| **`scripts/generate-sitemap.mjs`** | DONE | Runs **before** Vite build. Fetches **`publication.posts`** from **`gql.hashnode.com`** for host **`aideazz.hashnode.dev`** (override `VITE_HASHNODE_HOST` if needed). Merges **static routes** (`/`, `/about`, `/portfolio`, `/blog`, `/pitch.html`, `/pitch-es.html`) + **`https://aideazz.xyz/blog/{slug}`** for each post (excludes smoke-test slug). Writes **pretty-printed** `public/sitemap.xml` and `public/sitemap.txt`. On GraphQL failure: logs warning, static URLs only — build still succeeds. |
| **`package.json` `build`** | DONE | `"node scripts/generate-sitemap.mjs && vite build && node scripts/verify-seo.mjs"`. |
| **Apex vs `www`** | DONE (content) | Replaced **`https://www.aideazz.xyz`** with **`https://aideazz.xyz`** across TSX + pitch HTML; button labels **`aideazz.xyz`**. **`index.html`** comment: prefer apex; configure **`www` → apex 301** at DNS/host + GSC preferred domain. |
| **`robots.txt`** | DONE | Leading comment on canonical host; **`Disallow: /.gitignore`** and **`/gitignore`**; sitemap lines unchanged (**`https://aideazz.xyz/...`**). |
| **Blog images (a11y / SEO)** | DONE | **`BlogPost.tsx`**: ReactMarkdown **`img`** component — default **`alt`** when missing; **`loading="lazy"`**. |
| **GSC / ops follow-up** | DONE | Sitemap returns **200** with 11 URLs. **`/.gitignore`** removal submitted in GSC (Apr 17, 2026). Indexing requested for `https://aideazz.xyz/`, `/portfolio`, `/blog`. www canonical issue confirmed and addressed (see [Phase 1f](#phase-1f-redirect-hygiene--hreflang--april-17-2026)). |

<a id="phase-1f-redirect-hygiene--hreflang--april-17-2026"></a>

### Phase 1f: Redirect hygiene, 404 noindex, hreflang — April 17, 2026

> **[aideazz](https://github.com/ElenaRevicheva/aideazz)** only (not AIPA_AITCF). Commits `25e0918` + `31b0f48`. Seals four gaps discovered during GSC audit.

| Task | Status | Details |
|---|---|---|
| **www→apex JS redirect** | DONE | `src/main.tsx`: before React mounts, if `window.location.hostname === 'www.aideazz.xyz'` → `window.location.replace(href.replace('www.', ''))`. Fires on every SPA entry point — catches all paths. Verified in browser. |
| **`_redirects` `.gitignore` seal** | DONE | `public/_redirects`: added `/.gitignore / 301` rule **before** the `/* /index.html 200` catch-all. Root cause: catch-all was serving the React app at HTTP 200 for `/.gitignore` — Google indexed it. `robots.txt Disallow` only prevents crawling, does not block serving. GSC URL removal also submitted. |
| **404 noindex fix** | DONE | `src/App.tsx`: `<Route path="*">` was a bare `<div>404 - Page Not Found</div>` that never invoked `NotFound.tsx`. Imported `NotFound` and wired it. `NotFound.tsx` already had `applyPageSeo({ robots: "noindex, follow" })` — it just wasn't being used. |
| **hreflang EN/ES** | DONE | `index.html`: added three `<link rel="alternate" hreflang="...">` tags — `en`, `es`, `x-default` all pointing to `https://aideazz.xyz/`. Site serves both languages at same URLs via i18next browser/localStorage detection; hreflang signals both to Google and avoids duplicate-content penalty for the bilingual content. |
| **Cloudflare HTTP 301 www→apex** | DONE (Apr 18) | Cloudflare Redirect Rules: `www.aideazz.xyz*` → `https://aideazz.xyz/$1`, 301 Permanent, preserve query string. www CNAME added (proxied/orange cloud). Verified via httpstatus.io and browser. |

**How to check (non-dev guide) — all of Phase 1 redirects + hreflang:**
1. Go to **https://httpstatus.io** → type `www.aideazz.xyz` → click **Check status**. Should show **301** → **200**. That means www redirects permanently to apex.
2. Type `https://www.aideazz.xyz` in your browser — you should land on `https://aideazz.xyz` (no "www" in the address bar).
3. Open `https://aideazz.xyz` → View Page Source → Ctrl+F search `hreflang` — you should see three `<link>` tags for `en`, `es`, and `x-default`.
4. Type `https://aideazz.xyz/.gitignore` in your browser — should redirect you to the homepage (not show file contents).
5. Type `https://aideazz.xyz/some-random-page-that-doesnt-exist` — should show the 404 page (not a blank white page).

### Phase 1d: GA4 Analytics — CONFIRMED WORKING

| Task | Status | Details |
|---|---|---|
| GA4 measurement tag on website | DONE | `G-TL5S8V23LT` in index.html `<head>` — tracks all pages (SPA) |
| GA4 Property ID configured | DONE | `515154124` — set in Oracle server `.env` |
| Service account credentials | DONE | `aideazz-analytics-reader@vaulted-circle-368018` — active, authenticated |
| GA4 Data API backend | DONE | `performance_tracker.py` in VJH — pulls users, sessions, pageviews, traffic sources |
| GA4 dashboard routes | DONE | FastAPI `/analytics/dashboard` and `/analytics/metrics` endpoints built |
| Live data confirmed | DONE | API returns real data: 189 users, 215 sessions, 242 pageviews (7-day window, April 8, 2026) |

**How to check (non-dev guide):**
1. Go to **https://analytics.google.com** → select the AIdeazz property (ID `515154124`) → you should see real-time visitors, page views, traffic sources. If you see numbers, GA4 is working.
2. Click **Reports** → **Acquisition** → **Traffic acquisition** — this shows WHERE your visitors come from (Google, direct, social, etc.).
3. Click **Reports** → **Engagement** → **Pages and screens** — this shows WHICH pages people visit most.

### GSC Indexing Status — NORMAL

| Item | Status | Details |
|---|---|---|
| "Redirect page" warning | NORMAL | `/card` → `/portfolio` 301 redirect — Google correctly indexes /portfolio as canonical, marks /card as redirect. Not an error. |
| `/.gitignore` indexed | RESOLVED | URL removal submitted Apr 17, 2026. Root cause: `_redirects` catch-all `/* /index.html 200` served React app at HTTP 200 for this path. Fixed: added `/.gitignore / 301` rule before the catch-all in `_redirects`. |
| www homepage indexed, apex not | IN PROGRESS | GSC showed "Duplicate, Google chose different canonical than user" for apex. www was crawled first, became Google's preferred canonical. JS redirect deployed (`main.tsx`) + **Cloudflare HTTP 301 deployed Apr 18** (verified via httpstatus.io + browser). Indexing request submitted for `https://aideazz.xyz/`. Resolves in 2–7 days as Google re-crawls. |
| Apex `/portfolio` indexing | IN PROGRESS | Indexing request submitted Apr 17, 2026 via GSC URL Inspection. |
| Apex `/blog` indexing | IN PROGRESS | Indexing request submitted Apr 17, 2026 via GSC URL Inspection. |

### Phase 2: Blog & distribution (Hashnode + aideazz.xyz) — COMPLETE

| Task | Status | Details |
|---|---|---|
| Platform decision | DONE | **Hashnode** (GraphQL API). **Medium** not viable for new integrations. |
| Hashnode blog + PAT + publish scripts | DONE | `scripts/hashnode-publish.mjs`, `hashnode-list.mjs`, npm scripts; token in `.env` only. |
| **Daily automated Hashnode publisher** | DONE | **AIPA_AITCF** `src/hashnode-daily.ts` — Claude long-form → `publishPost`; cron **15:00 `America/Panama`**; opt-in `HASHNODE_DAILY_ENABLED=true`; runs on Oracle **PM2 `cto-aipa`**. |
| Manual trigger | DONE | `POST /hashnode/daily-run` with `Authorization: Bearer <HASHNODE_DAILY_TRIGGER_SECRET>`. |
| First public long-form essay | DONE | **From Boardroom to Build…** — [on Hashnode](https://aideazz.hashnode.dev/from-boardroom-to-build-what-running-nine-production-ai-agents-actually-means); source `scripts/hashnode-posts/from-executive-to-ai-builder.md`. |
| **Portfolio blog + live Hashnode sync** | DONE | **[aideazz](https://github.com/ElenaRevicheva/aideazz)** repo: `/blog`, `/blog/:slug`, public GraphQL sync (no `gray-matter` in browser — fixed **Buffer** error), portfolio CTA; deploy **4everland** from `main` (not Fleek). |
| **On-domain blog URLs in sitemap** | DONE (Apr 2026) | **`scripts/generate-sitemap.mjs`** at build time — each Hashnode post slug appears as **`https://aideazz.xyz/blog/{slug}`** in **`sitemap.xml`** / **`sitemap.txt`** so Google can index the **SPA** path, not only **Hashnode/Dev.to**. |
| **Oracle `content_log`** | DONE | Table `content_log` in **AIPA_AITCF** `src/database.ts`; each successful daily publish writes `channel=hashnode_daily`, keyword, title, url, topic_index. `getRecentContentLogs()` for future dashboards. |
| **Telegram notify on publish** | DONE (optional) | `TELEGRAM_HASHNODE_NOTIFY_CHAT_ID` + `TELEGRAM_BOT_TOKEN` — sends one message with title + URL after publish. |
| **GSC gap topic selection** | DONE | `fetchGscTopQueries()` (JWT service account, `GOOGLE_ANALYTICS_CREDENTIALS`) + `pickTopicWithGscGap()` — Claude Haiku picks the topic with least current traffic before each daily post; falls back to round-robin rotation if GSC unavailable. `GSC_SITE_URL=sc-domain:aideazz.xyz` in Oracle `.env`. |
| **Dev.to cross-posting** | DONE | `crossPostToDevTo()` — fires after Hashnode publish; sets `canonical_url` → Hashnode URL (genuine DA 90+ backlink pointing to aideazz.xyz); `DEVTO_API_KEY` in Oracle `.env`. Telegram notify includes both URLs. Skipped silently if key absent. |
| **LLM pipeline extras** (draft queue, human review before publish) | NOT STARTED | Current path is **publish** on schedule (Elena’s preference for her own Hashnode). **Client deployments** will usually need **`createDraft`** + Telegram approve/reject — see [Client-ready gaps](#client-ready-gaps). |

**How to check (non-dev guide):**
1. Open **https://aideazz.xyz/blog** — you should see a list of blog posts. If posts appear, the Hashnode sync is working.
2. Click any post — it should open with full content on `aideazz.xyz/blog/the-post-title`.
3. Open **https://aideazz.hashnode.dev** — same posts should appear here (this is where they are originally published).
4. Open **https://dev.to/elenarevicheva** (or search Elena Revicheva on dev.to) — cross-posted articles should appear with a "Originally published at" link pointing back to Hashnode.
5. Check Telegram: the CTO AIPA bot should send you a notification every day around 3 PM Panama time with the title + link of the new post. If you got a message today, the daily publisher is alive.
6. To verify the publishing is truly automatic: check your Hashnode dashboard — posts should appear every day without you doing anything. If a day is missing, something went wrong on Oracle.

### Phase 3: UTM Attribution — COMPLETE (end-to-end, production)

The first three rows are Phase 3 only. The last three rows are a **cross-phase summary** (same facts repeated under Phase 4–6 sections below).

| Phase | Status | What shipped |
|---|---|---|
| Phase 3: UTM + inquiry pipeline | **COMPLETE** | **aideazz:** `InquiryForm` — UTM from URL → `POST https://webhook.aideazz.xyz/cto/marketing/inquiry-proxy` (no Bearer in browser). **CTO AIPA (Oracle):** `business_leads` in Oracle; `POST /marketing/inquiry` (Bearer) for automation; `POST /marketing/inquiry-proxy` (Origin allowlist for `aideazz.xyz` / `www`, honeypot `company`, per-IP rate limit). **Weekly Telegram digest** of new leads (optional env). **Docs:** `docs/oracle/CTO_AIPA_PUBLIC_HTTPS.md`. |
| Phase 3b: Email notifications | **COMPLETE** | **Resend** via `RESEND_API_KEY`. Team inbox: `MARKETING_INQUIRY_NOTIFY_TO` (default `aipa@aideazz.xyz`). Submitter gets confirmation email when address is valid. **Sender:** `MARKETING_INQUIRY_FROM` — production uses verified **`AIdeazz <aipa@aideazz.xyz>`** (same domain pattern as VibeJobHunter). Implementation: `src/marketing-notify.ts`. |
| Phase 3c: reCAPTCHA Enterprise + inquiry | **COMPLETE (production)** | **Verified Apr 2026:** end-to-end form submit on `https://aideazz.xyz` → Oracle `POST /marketing/inquiry-proxy` → `business_leads` + Resend team email (`[AIdeazz] Inquiry — …`). **Why it was hard:** initial key lived in GCP project `aideazz-177575763145287` (no console access); API key was created in **`aideazz-1775763145287`** — Enterprise **CreateAssessment** must use the **same** project as the reCAPTCHA **site key** + an API key from that project. Classic `siteverify` + `api.js` also failed for Enterprise-only keys. **What we did:** (1) Registered a **new** reCAPTCHA Enterprise key in **`aideazz-1775763145287`** (domains `aideazz.xyz`, `www.aideazz.xyz`; site key id `6LcHda8sAAAAAAGwl5alB2xdX_6Dqve5a5vifoHj`). (2) **Credentials** in that project: API key restricted to **reCAPTCHA Enterprise API**. (3) **[aideazz](https://github.com/ElenaRevicheva/aideazz)** `src/lib/recaptcha.ts`: load **`https://www.google.com/recaptcha/enterprise.js?render=…`**, **`grecaptcha.enterprise.execute`** with action **`inquiry`** (not classic `api.js` / `grecaptcha.execute`). **`VITE_RECAPTCHA_SITE_KEY`** in `.env.production` + deploy **4everland** from `main`. (4) **[AIPA_AITCF](https://github.com/ElenaRevicheva/AIPA_AITCF)** `src/marketing-notify.ts`: **`verifyRecaptchaEnterprise`** → `recaptchaenterprise.googleapis.com/.../assessments?key=…`; optional fallback to classic **`siteverify`**; verification can run with **Enterprise-only** env (no legacy secret required when `RECAPTCHA_ENTERPRISE_PROJECT_ID` + `RECAPTCHA_ENTERPRISE_API_KEY` + `RECAPTCHA_SITE_KEY` are set). **Oracle** `~/cto-aipa/.env`: `RECAPTCHA_SITE_KEY`, `RECAPTCHA_ENTERPRISE_PROJECT_ID=aideazz-1775763145287`, `RECAPTCHA_ENTERPRISE_API_KEY`; optional `RECAPTCHA_SECRET_KEY`; optional `RECAPTCHA_MIN_SCORE` (default **0.1** in code). **`pm2 restart cto-aipa --update-env`**. **Docs:** `.env.example` in both repos. |
**How to check Phase 3 (non-dev guide):**
1. Open **https://aideazz.xyz** → scroll to the bottom → find the **contact/inquiry form** → fill it out with YOUR OWN email as a test. Put “TEST from Elena” in the message.
2. Check your email inbox — you should receive a confirmation email from `AIdeazz <aipa@aideazz.xyz>` within 1–2 minutes. If you got it, the email notification works.
3. Check the CTO AIPA Telegram bot — you should also get a Telegram notification about the new inquiry.
4. To verify UTM tracking: add `?utm_source=test&utm_campaign=selfcheck` to the URL before visiting the form. Example: `https://aideazz.xyz?utm_source=test&utm_campaign=selfcheck` → then fill the form. The inquiry in Oracle should capture those UTM values.
5. To see ALL leads: open **https://webhook.aideazz.xyz/cto/leads/dashboard** → enter your secret to unlock → any form submissions (including your test) should appear in the list.

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
| **Google Places ingest (Phase 4c)** | DONE | `src/prospect-places.ts` — Text Search (New) by city + industry → websites → Hunter → **`outreach_targets`**. **`POST /outreach/ingest-places`**, **`GET /outreach/ingest-places/presets`**, Telegram **`/places_ingest`**. Env: **`GOOGLE_PLACES_API_KEY`**. |
| **Document → outreach (Phase 4d)** | DONE | `src/doc-ingest.ts` — paste RFP / takeoff / call log → Claude extracts prospects → Hunter → **`importTargets`**. **`POST /outreach/ingest-doc`**, Telegram **`/doc_ingest`**. Same Resend send path as YC/Places rows. |
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

**How to check Phase 4 (non-dev guide):**
1. Open Telegram → find the **CTO AIPA bot** (`@aitcf_aideazz_bot`) → type `/outreach` — it should reply with a summary of how many outreach emails were sent, how many targets exist, recent activity.
2. Type `/outreach_drafts` — shows any email drafts waiting to be sent.
3. Type `/outreach_ingest` — shows the last ingestion cycle results (how many new companies were found).
4. Check your **aipa@aideazz.xyz** email (or wherever Resend sends from) — look for delivery receipts or bounces. Real emails going out = the outreach pipeline is alive.
5. For VibeJobHunter: open Telegram → find `@vibejob_hunter_bot` → it should be sending you daily digests of jobs found, applications sent, and founder outreach. If you see today's digest, VJH is running.
6. Quick health check: if both bots are responding to commands in Telegram, the Oracle server is alive and both systems are operational.

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

**How to check Phase 5 (non-dev guide):**
1. Open your browser → go to **https://webhook.aideazz.xyz/cto/leads/dashboard** — you should see either an unlock form (enter your secret) or the dashboard directly if you bookmarked it with `?secret=...`. This is the live lead triage dashboard.
2. On the dashboard: you should see leads ranked by urgency (1–5 scale). Each lead shows its source (form inquiry or outreach reply), classification, and recommended action.
3. In Telegram → CTO AIPA bot → type `/triage` — it should reply with the latest triage results (how many processed, how many urgent).
4. Type `/triage_urgent` — shows only the high-urgency leads that need immediate attention.
5. If the dashboard is empty or shows no leads: that means no inquiries have come through the form AND no outreach replies have been received. The triage engine works — it just has nothing to triage yet. Submit a test inquiry (see Phase 3 check) and then wait for the next triage cycle (daily at 8 AM Panama) or type `/triage` to trigger it manually.

**Phase 6 (showcase package / pitch docs)** — NOT STARTED. Product packaging on top of live Phase 1–5 systems.

**How to check Phase 6 (non-dev guide):**
Phase 6 is NOT YET BUILT. When it's ready, here's what you should be able to do:
1. Send a client a single link (e.g. `https://aideazz.xyz/showcase` or a pitch page) where they can see all 5 phases running live — blog publishing, inquiry form, lead triage dashboard, outreach stats, analytics.
2. Have a 10-minute demo script you can walk through in person or on a Zoom call showing: "Here's a lead coming in → here's the AI triaging it → here's the dashboard showing priority → here's the outreach going out → here's the blog publishing every day."
3. A shareable pitch deck or PDF (already partially exists at `https://aideazz.xyz/pitch.html` and `/pitch-es.html`) that connects the live systems to the client value proposition.

**What's needed to complete Phase 6:**
- A walkthrough page or video showing Phases 1–5 in action
- A client-facing "here's what I'd wire for you" template
- Connection between the pitch pages and the live proof (links to dashboard, blog, GSC stats)

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

GEO has five concrete layers — all five are live on aideazz.xyz:

1. **JSON-LD schemas** — machine-readable identity signals embedded in `index.html`:
   - `Organization` schema: AIdeazz name, URL, logo, founder link
   - `Person` schema: Elena Revicheva, `knowsAbout` (AI Agents, LLM Routing, Oracle Cloud, etc.), `sameAs` (LinkedIn, GitHub), `worksFor`, `addressLocality: Panama City`
   - `FAQPage` schema: **12 Q&As** — "What is AIdeazz?", "What is multi-model LLM routing?", "How do you run 9 AI agents at $0/month?", "What can Elena build for my startup?", "What is an AI agent?", "How much does it cost to build an AI automation system?", "Who builds AI agents for small business?", "What is GEO vs SEO?", "Can AI replace a marketing team?", "What AI tools does Elena use?", "How long does it take to build an AI marketing engine?", "What industries can benefit from AI automation?" — these are the exact queries target clients type into ChatGPT and Perplexity; structured answers make the page quotable as a source
   - `Article` schema on every blog post: headline, author, datePublished, publisher
   - `ProfilePage` + `makesOffer` on /portfolio: tells AI tools what service is being offered and by whom

2. **noscript static content block** — 66 lines of plain HTML inside `<noscript>` in index.html. AI crawlers (ChatGPT, Perplexity, ClaudeBot) often do not execute JavaScript. Without this block, they would see a blank page. With it, they see Elena's full bio, all 9 agents described, tech stack, real metrics — fully readable without JS.

3. **robots.txt AI bot permissions** — explicit `Allow: /` for `ChatGPT-User`, `GPTBot`, `PerplexityBot`, `ClaudeBot`, `CCBot`. These bots crawl the web to train and update their knowledge. Without explicit permission, they may skip your site. With it, they are invited in.

4. **Canonical URL per route** — every page (homepage, /about, /blog/:slug, /portfolio) sets its own canonical tag via React `useEffect`. Prevents GSC "duplicate canonical" confusion on the IPFS/4everland SPA deployment. Google and AI tools trust pages with clean canonical signals.

5. **Compound content + authority signals** — daily Hashnode articles (1400+ words, structured headers, real technical detail) + Dev.to cross-posts with canonical backlinks + /about page with real credentials (Deputy CEO, 9 production agents, $0/month infra) + /portfolio with ProfilePage schema. GEO compounds: each article adds another quotable surface; each Dev.to backlink adds authority; each schema update sharpens the AI's picture of who Elena is.

**What GEO produces over time:** When someone asks ChatGPT "who can build me an AI marketing engine?" or Perplexity "fractional CTO for AI startups in Latin America" — these five layers are what make Elena's name appear in the answer. Not a paid placement. Not a KOL tweet that expires in 48 hours. A structural authority signal that compounds with every article published.

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

### Technical Stack Terms — "How the engine actually works" (for client conversations)

*These are the words that separate a real system from a demo. When you can explain them, a technical founder knows you built something.*

**Cron / Cron job**
A scheduled task that fires automatically at a set time — like an alarm clock for code. "Daily blog cron at 15:00 Panama time" means at 3:00 PM every day, a function runs automatically, generates an article, and publishes it. No human clicks anything. This is what "automated" actually means — not a button you press, but a timer that runs whether you're awake or not.

**GraphQL**
A way to ask an API for exactly the data you need, nothing more. Hashnode uses GraphQL: instead of getting a whole page of data, the engine sends one specific query — `publishPost(input: {...})` — and gets back exactly the new post's URL. More precise and faster than traditional REST APIs for complex publishing operations.

**Canonical URL**
The "official" version of a page when the same content exists in multiple places. When the engine cross-posts an article to Dev.to, it sets `canonical_url` pointing back to the Hashnode original. This tells Google: "the real version lives here, give SEO credit to Hashnode, not to this copy." A canonical backlink from Dev.to (DA 90+) is a genuine authority signal — Google trusts Dev.to, so a link from it with your canonical URL tells Google your site is worth trusting too. This is the opposite of fake backlinks — it's a real platform pointing to real content.

**GSC (Google Search Console)**
Google's free tool that shows which search queries bring people to your site, which pages are indexed, and what errors exist. The engine pulls the top 25 queries from the last 28 days via the GSC API — then Claude Haiku picks which blog topic has the biggest gap vs. current traffic. This means content is written to fill real search holes, not guessed randomly.

**Groq**
A hardware-accelerated inference provider that runs open-weight LLMs (like Llama 3.3 70B) extremely fast — typically 10-50x faster than standard API calls. The engine uses Groq for speed-critical paths (lead triage, code review). When Groq hits a rate limit, it falls back to Claude Haiku. Clients care because fast inference = faster triage = faster response to leads.

**Claude Haiku / Multi-model routing**
Claude Haiku is Anthropic's fastest, cheapest model — used for classification tasks where speed and cost matter more than maximum intelligence (e.g., "is this lead urgent?", "which topic has the biggest SEO gap?"). The engine routes ~76% of tasks to fast models (Groq/Haiku) and reserves frontier models (Claude Opus) for high-stakes decisions like client email drafts. This is why the engine costs ~$0/month to run instead of $500/month — intelligent routing, not just "use the best model for everything."

**Resend**
A developer-focused transactional email service. Every cold outreach email, lead notification, and confirmation email goes through Resend's API. Critical distinction: an email is only counted as "sent" in the Oracle `outreach_log` after Resend returns HTTP 200 **and** the database row updates with `rowsAffected > 0`. This is honest bookkeeping — no fake send counts.

**Hunter.io**
A service that finds and verifies business email addresses from a company domain. Give it `acme.com`, it returns `john.doe@acme.com` with a confidence score. The engine uses it to enrich both YC company prospects and Google Places results before sending outreach. "Validated email" means Hunter confirmed the address likely delivers — protecting sender reputation.

**GA4 (Google Analytics 4)**
Google's current analytics platform. Tracks users, sessions, pageviews, and traffic sources on aideazz.xyz. The engine pulls live GA4 data via the Data API using a service account — so "189 users, 215 sessions" are real numbers from Google's servers, not made up. This data informs content decisions and proves the site has real traffic.

**JWT (JSON Web Token)**
A secure, self-contained token used to authenticate API calls without storing passwords. The engine uses JWT to authenticate with Google Search Console: it takes the service account credentials (a private key), builds a JWT signed with RSA-256, exchanges it for a short-lived access token, then calls the GSC API. This is enterprise-grade auth — same pattern used by Google, Stripe, and every serious API.

**reCAPTCHA Enterprise**
Google's advanced bot-detection system for forms. When someone submits the inquiry form on aideazz.xyz, an invisible reCAPTCHA check runs and returns a score (0.0 = bot, 1.0 = human). The Oracle backend verifies this score before accepting the lead. This means `business_leads` contains only real humans — the pipeline never wastes Resend quota on bot submissions.

**Google Places API**
Google's API for searching local businesses by type and location. "Architects in Lexington KY" returns real business names, addresses, websites, and phone numbers. The engine uses this to build outreach lists for local/industry clients — same Hunter.io enrichment and Resend pipeline as YC companies, but now pointing at any city and any industry. This is what makes the engine work for a Manny-style construction client, not just AI startups.

**Dev.to**
A large developer community platform (Domain Authority ~90+) where technical articles are published. The engine cross-posts every Hashnode article to Dev.to automatically, with `canonical_url` pointing back to Hashnode. Result: a genuine high-authority backlink to aideazz.xyz every day a post publishes — without buying links or using link farms. This is the correct way to build domain authority.

**Oracle `content_log` / `business_leads` / `lead_triage` / `outreach_log`**
The four core tables in Oracle Autonomous Database that prove the engine is running. `content_log` — every article published, when, on which platform. `business_leads` — every form inquiry from aideazz.xyz, with UTM source. `outreach_log` — every cold email attempt, with Resend message ID and delivery status. `lead_triage` — every lead classified by urgency, with the model that classified it and timestamp. These tables are the difference between "I have an AI system" and "I can show you a database of 8 classified leads, 3 confirmed email sends, and 15 published articles." Verifiable, not claimable.

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

> Document version: April 13, 2026 (v15.4 — Manny table: doc-ingest shipped; Places shipped; draft-queue deferred; `.env.example` Phase 4c–4d)
> Aligned with: CAREER_FOCUS.md v4 (April 2026 — outreach operational), SKILL.md v1.3
> Phase 1 status: COMPLETE (GEO + sitemap + GSC + OG + GA4); **canonical SPA fix** in **aideazz** repo Apr 2026
> Phase 2 status: COMPLETE — Hashnode daily publisher live; Dev.to cross-post (DA 90+ backlink, `canonical_url` → Hashnode) live; GSC gap topic selection live (`GOOGLE_ANALYTICS_CREDENTIALS` JWT, no extra API key)
> Phase 3 status: COMPLETE — UTM + inquiry + reCAPTCHA Enterprise
> Phase 4 status: COMPLETE & VERIFIED — client sends via CTO AIPA (Resend+Oracle); employer sends via VJH only when email delivers; applications counted only on real ATS or email delivery
> Phase 5 status: OPERATIONAL — **`lead_triage`** + **`agent_outcomes`**; **`/leads/dashboard`** unlock form; **`triage-run`** 202/ sync; **`TRIAGE_SKIP_GROQ`**; **`reviewCode`** Groq→Haiku (**`CODE_REVIEW_FALLBACK_MODEL`**)
> Next: Phase 6 (showcase package); optional widen outreach sources; optional draft→approve before Hashnode publish
