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
