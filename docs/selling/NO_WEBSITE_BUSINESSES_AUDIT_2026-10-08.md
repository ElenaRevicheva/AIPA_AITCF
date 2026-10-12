# Businesses with no website (Instagram + WhatsApp + Google Maps): can the Visibility API serve them?

8 Oct 2026, Claude Code. Example from Elena: **Tacos Rudos Bqt**, Boquete (Google: 4.7★, 603 reviews,
Mexican restaurant, Call / Directions / Website buttons; shared as `https://share.google/2TiMzfddzOwHwWMIC`).

## 1. Today: no, and it would give a misleading answer

The engine (`src/visibility-audit.ts`, `runVisibilityAudit(url)`) fetches **one URL's HTML** and scores
its robots.txt, JSON-LD, answer-ready text and technical setup. That only works if the business **owns a page**.

- The Google share link is a redirect: `302 → https://www.google.com/share.google?q=…` (curl, 8 Oct).
  The audit would score **Google's page**, not the taqueria.
- An Instagram URL would score **instagram.com's login wall**. That is Instagram's AI visibility, not his.

Neither result says anything true about the business, and a report that confidently grades the wrong
thing is worse than no report.

## 2. What AI assistants actually read for a business like this

With no site, AI answers about the business come only from **third-party sources**: the Google Business
Profile (name, category, hours, reviews), review and travel sites (Wanderlog, TripAdvisor, expat
directories; Wanderlog already lists "tacos rudos bqt"), and whatever social pages are public.
The business controls almost none of it. **There is no page AI can cite as *his* source of truth.**
That missing page is the finding. It is also the thing that can be sold.

## 3. Enhancement: an "entity mode" next to the URL audit (proposal, NOT built)

**Step A: $0, small, worth doing even with no new feature.** Recognise social, Maps and share links
(`share.google`, `maps.app.goo.gl`, `google.com/maps`, `instagram.com`, `facebook.com`, `wa.me`, `linktr.ee`)
and return an honest **"no owned website" diagnosis** instead of grading Google or Instagram:
"AI engines have no page you control. Everything they say about you comes from Google Maps reviews and
third-party sites." This is a correctness fix to the existing engine, inside its current design.

**Step B: costs money per call, needs Elena's go.** Input `{ name, city }` → checks:
1. Google Business Profile completeness: category, hours, website field, review count/rating, photos.
   (Needs the Places API, which is paid above the free tier.)
2. Third-party footprint: which directories and review sites mention the business, and whether name,
   phone and address match across them. (Needs a search source; Bright Data is paid and on the cost watch-list.)
3. The real test: ask ChatGPT, Perplexity or Gemini "best tacos in Boquete" and check whether the
   business is named. This is the never-built "Tier 2". It needs LLM keys. Anthropic credit is at zero;
   OpenAI and Gemini keys were live on 7 Oct.

**What it sells:** the fix for a no-website business is a **one-page, prerendered site** with
`Restaurant`/`LocalBusiness` JSON-LD, hours, menu, WhatsApp link and FAQ. It would be the citable source
AI is missing, linked from his Google Business Profile. AIdeazz already builds exactly this
(`scripts/prerender-routes.mjs` on aideazz.xyz: 100/100 on our own audit). Step A makes the gap
visible; the page is the deliverable.

## 4. The money filter (ICP)

Tacos Rudos is **low-ticket local** ($9 for 3 tacos), which the ICP explicitly lists as tail-only
(`project_icp_ai_discoverable`: average sale > $2,000). Don't build for him. Build Step A because the
**same shape appears inside the ICP**: yacht charters, relocation agents and small dental or cosmetic
clinics run from Instagram + WhatsApp with no site. For them a $100 Diagnostic, then a one-page
AI-citable site, is a real offer.

## 5. Status

- **Not built.** Per the repo contract (Teach → Plan → **Confirm** → Build), Step A waits for Elena's go;
  Step B also waits for her decision on spend.
- **Blocker found while testing (8 Oct):** `webhook.aideazz.xyz` (Oracle) timed out on every path
  from the laptop (60 s, HTTP 000) while aideazz.xyz returned 200. SSH connected on TCP but timed out at
  the banner, which means the box is up but not responding. The live API could not be tested.
- ChatGPT's answer that Elena shared (`chatgpt.com/share/6ac804d3…`) renders only via JavaScript; its
  content could not be read, so this plan does not use it.

## 6. ChatGPT's version ("Business AI Discoverability Engine"), evaluated 11 Oct 2026

Elena pasted ChatGPT's design: an entity engine with 5 dimensions (identity, service clarity, trust,
AI-answer presence, conversion readiness), 3 scores never blended (readiness / observed / technical),
an optional AI-readable micro-page, and a 4-stage offer (audit → GEO/AEO work → WhatsApp Operator → measurement).

**Right, keep it:**
- Entity-level framing. Same conclusion as §2 above: with no site, the business is an *entity*, not a page.
- **Three separate scores, never blended.** A business can be AI-ready and still not appear in answers.
  This is the honest design and matches `feedback_never_claim_invisible_on_high_audit`.
- The micro-page as *evidence, not a guarantee*. Same as §3.
- Permitted access only for Instagram (its terms forbid scraping), and copy-ready fixes as the deliverable.

**Wrong or missing for Elena specifically:**
1. **It is a new build, and the bottleneck is not product.** 1,898 HubSpot deals, 0 won
   (`project_root_cause_no_demand_channel`). A bigger engine does not create a buyer. The golden rule says use what is already built.
2. **The market is assumed, not measured.** Her ICP requires an English site (criterion 5), and the ICP
   leads measured so far *have* sites (scored 91–99). High-ticket businesses with no site may be rare. Check before building.
3. **"Observed AI answers" is the expensive, shaky part.** API answers are not the answers people see in the
   ChatGPT app (location, personalisation and web search differ), they vary run to run (repeat sampling needed), and every run costs money.
   Google Business Profile data beyond the public listing needs the owner's access or the paid Places API.
4. **Stage 3 is the AI Growth Operator agency that was shelved on 18 Aug** because it runs on demand generation.
5. No price, no first buyer, no validation protocol. ChatGPT says so itself.

**Recommendation: sell it by hand before building it (concierge MVP).**
- The $100 Diagnostic (`aideazz.xyz/pay/analisis-tecnico`) already exists. Let its intake accept
  an Instagram or Maps link instead of a website, and run ChatGPT's 5 dimensions as a **manual checklist**.
- Build only Step A ($0): stop the free API from grading Google or Instagram when given a social link.
- Automate dimensions only after **3 people have paid** for the manual version. Their reports are the spec.
- First, a free measurement: how many existing ICP prospects in HubSpot have no website at all?
  That number decides whether this is a market or an anecdote.

## 7. Reuse map: serving a no-website ICP with what is ALREADY built (12 Oct 2026, code-read, nothing changed)

| Stage | Already built (reuse as-is) | Where it assumes a website |
|---|---|---|
| **Find** | `src/prospect-places.ts` (Google Places) **keeps** no-website places with Maps URL + phone "for manual follow-up" (`:303-307`, `:360-374`), wired to Telegram `/places_ingest`. Key exists in `.env`; **unverified that it works**. | `atlas-lead-machine.cjs:447` keeps Maps results only with a website; `:1229` drops Instagram/wa.me/linktr.ee as "unsellable". |
| **Evidence for the letter** | `scripts/competitor-probe.cjs` + `src/ai-answer-competitors.ts`: Perplexity lists **which brands own the AI answer** for a query (manual run). `src/citation-tracker.ts` probes 4 engines weekly. | citation-tracker brand/domain hardcoded to AIdeazz (`:107`, `:137`). |
| **Stage in HubSpot** | One-click WhatsApp/email notes, HIGH task, `preferredPhone/emailOnlyOk` mechanics. | `stage-manual-prospect.cjs` requires a domain + audit; letters say "Analicé ${domain} … ${score}/100"; FU installer refuses deals without a score. No HubSpot property for Instagram/Maps/WhatsApp. |
| **Sell** | $100 Diagnostic: the pay form's website field is not URL-validated (an Instagram handle passes); `fitCriteria` already counts Instagram/WhatsApp as channels; prep note handles "no scan". | `diagnostic-delivery.ts:67-72` turns any text into a URL (`none` → `https://none`; `\s*` may swallow the next line) and scans it; the client email promises "how AI sees your website". |
| **Deliver: citable page** | aideazz.xyz can host a hand-written flat `public/c-<slug>.html` (own title, canonical, LocalBusiness JSON-LD, FAQ, wa.me) + one `_redirects` line, live on push. | None, zero code. Trade-off: on aideazz.xyz it is a third-party page *about* the business, not its own domain. |
| **Deliver: Instagram content** | `scripts/aigo-ig-*.py/.sh` film → Reel + 4:5 posts + Buffer schedule (proven 4 Oct). | Persona/branding is AIdeazz; **render on the laptop only** (Oracle froze 8 Oct). |
| **Deliver: WhatsApp operator** | EspaLuz WhatsApp (Twilio, EN/ES, voice, payments) as the skeleton; Concierge draft → one-tap approve pattern. | No client persona/FAQ template. Build only after a client pays for Offer A ($1,500 + $250/mo). |
| **Measure** | citation-tracker. | Needs the brand passed as a parameter (after a paying client). |

**Zero-build path:** Places finds them → competitor-probe shows who AI recommends instead → hand-written letter with that evidence → $100 Diagnostic (Instagram handle in the website box) → manual 5-dimension checklist → micro-page as a static file → Reels from the existing pipeline.

**Small fixes worth Elena's go (protect paying customers, not new features):**
1. Step A: the audit says "no owned website" for social/Maps links instead of grading Google/Instagram.
2. `diagnostic-delivery.ts:67-72` parsing (`https://none`, line-swallowing regex).

## 8. Instagram-only and WhatsApp-only businesses (12 Oct 2026, code-read)

**Partly built, three pieces:**
1. **Atlas (whitespace) already reads the Meta Ad Library** via Bright Data (`whitespace/src/capture.ts:52-53`,
   `brightdata.ts bdMetaAdLibraryFetch`) and records the **advertiser** (page name) for each ad (`ad-sources.ts:47,89`).
   A high-ticket Instagram/WhatsApp business that pays for ads shows up there, and paying for ads is the best proof it has money.
   Limits: `country=US` hardcoded in the library URL (`capture.ts:53`); seed verticals are affiliate niches, but
   `registerTrackedVertical` accepts any label (e.g. "yacht charter Panama"); phone/email in ad copy is **redacted on purpose**
   before commit (`atlas-capture-cron.sh:41-47`, the DataVendor PII rule). It was built to find ad angles, not leads.
   The official `meta-api.ts` covers political/social-issue ads only (its own note, `:4`).
2. **The lead machine already finds Instagram profiles, then drops them.** Its Bright Data search returns
   instagram.com / wa.me / linktr.ee results, and `atlas-lead-machine.cjs:1229` (`PLATFORM_DOMAINS`) drops them as "unsellable".
3. **Places** (`prospect-places.ts`): many Instagram-first businesses still have a Maps listing with a phone, which it keeps.

**Not built, and should not be:** reading Instagram profiles (no permitted API; scraping breaks Instagram's terms).
**WhatsApp-only has no discovery path at all:** WhatsApp has no public directory. Such a business is findable only through
an Instagram bio, a Maps phone, or a click-to-WhatsApp ad. That is the pitch: AI cannot recommend what is not public.

**Cheapest test ($0, 10 min, by hand):** open facebook.com/ads/library, country Panama, search "yacht charter" /
"implantes dentales" / "relocation Panama", and count advertisers with no website. That count decides whether piece 1 is worth a small change
(country + tracked vertical).
