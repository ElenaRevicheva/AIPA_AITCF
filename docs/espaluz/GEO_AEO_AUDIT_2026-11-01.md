# EspaLuz — GEO / AEO / tech-SEO audit and free traction plan (1 Nov 2026)

Measured with Elena's own AI Visibility Audit API (`webhook.aideazz.xyz/cto/v1/visibility`, engine 1.2.0) and live data.

## Where EspaLuz stands

| URL | Score | What a crawler sees |
|---|---|---|
| `espaluz-ai-language-tutor.lovable.app` (the app) | **60 / C** | **8 words.** JavaScript-only shell: most AI crawlers do not run JS, so they get an empty page. No JSON-LD, no H1, no headings, no FAQ, no canonical, no sitemap, no llms.txt. Share image = Lovable's default picture. |
| `aideazz.xyz/espaluz` | (homepage) | Not an EspaLuz page: the SPA falls back to the AIdeazz homepage, canonical `/`. |
| `aideazz.xyz` | 100 / A+ | Strong, cited, prerendered — mentions EspaLuz only in passing. |

So EspaLuz has **no page anywhere that an answer engine can read and quote.** When a parent asks ChatGPT/Perplexity
"AI app to teach my child Spanish and English in Panama", there is nothing to cite.

## Funnel, measured
- Web: 9 accounts, 0 strangers (the 30 Oct signup is an internal test address).
- WhatsApp: 3 strangers in 60 days (20/27/29 Sep), all left after message 1 because onboarding demanded their country.
  Fixed live 1 Nov 23:07 UTC (EspaLuzWhatsApp `e0ce2bf`): answer first, country from the phone prefix.
- Root problem: **demand** — almost nobody arrives.

## The name `espaluz-ai-language-tutor.lovable.app`
- Every link, mention and citation EspaLuz earns builds **Lovable's** domain, not Elena's. Leave Lovable and every link dies.
- Reads as a prototype to a parent; too long to say or type; one of thousands of `*.lovable.app` sites.

## Free plan (no ads), in order
1. **A real EspaLuz page on `aideazz.xyz/espaluz`** through the existing `scripts/prerender-routes.mjs` (the machinery that
   made `/portfolio` and `/api` 100/100): ~600 words of real, verified text, one H1, question headings (FAQ),
   `SoftwareApplication` + `FAQPage` JSON-LD, price ($11/month, 14 days free), the three doors (web, WhatsApp, Telegram),
   added to sitemap + `llms.txt`. Inherits aideazz.xyz's authority. $0.
2. **Fix the app's own head** (ascent `index.html` + `public/`): canonical, JSON-LD, an EspaLuz share image, real
   text in the raw HTML (noscript block), `sitemap.xml`, `llms.txt`. Lovable Publish. $0.
3. **Own address later**: `espaluz.aideazz.xyz` (free subdomain; needs Lovable's custom-domain setting — check the plan
   allows it) or a bought domain when there is income.
4. **Track it**: add the EspaLuz URLs to the weekly self-audit (`.github/workflows/visibility-self-audit.yml`) and to the
   AI-citation baseline prompts (parents' questions), so movement is measured, not guessed.
5. **Built-in sharing**: the parent report already goes to every parent after a lesson — one line inviting them to
   share EspaLuz with another family is the only free distribution channel the product owns.
6. **The blog**: daily posts already run; EspaLuz posts link to the new page (internal links = authority).

Nothing here claims a user, a number or a result we have not measured.

## Done 1 Nov ~23:45 UTC
- **https://aideazz.xyz/espaluz LIVE: 100/100 A+** (was: no page at all; the Lovable app is 60/C). Standalone static page
  (aideazz `5330cd2` + `ef7340d`), 549 crawler-visible words, SoftwareApplication + FAQPage JSON-LD, $11/14-days-free,
  web/WhatsApp/Telegram buttons, EN + ES, own share image (`espaluz-og.jpg`, verified with the WhatsApp crawler UA),
  sitemap + both llms.txt. Phone width: no horizontal scroll, 1 H1, 6 working buttons.
- Weekly tracking: `scripts/visibility-self-audit.cjs` enforces /espaluz (>= B) and reports the Lovable app (cto-aipa `3099aabe`).

## The plumbing gap (Elena 1 Nov: "connect all the pieces into one funnel")
Machines already running daily at $0: EspaLuz Influencer (Telegram channel + Make.com), LinkedIn CMO agent, daily blog,
Atlas/marketing engine (Mondays), the GEO/AEO engine. Measured: the Influencer's posts link to `wa.me/...` and
`aideazz.xyz/portfolio` - **none points parents to one EspaLuz door, and no click is counted anywhere.**
Proposal (needs Elena's OK, channel by channel):
1. ONE door for every family-facing post: `https://aideazz.xyz/espaluz?utm_source=<channel>`.
2. Count arrivals: a tiny counter on the page (or the existing visibility-lead logger) so each channel's families show up.
3. Weekly one-line report to Elena: visits per channel -> trials -> paid (the payment truth already knows paid).
4. Then let the numbers decide which machine gets more of its daily output pointed at families.

## Machine map — what changes, what never changes (1 Nov, explained to Elena before any change)
| Machine | Today (measured) | Change = only the EspaLuz link/text | Never touched |
|---|---|---|---|
| EspaLuz Influencer (`~/EspaLuz_Influencer`) | 1 post/day: odd days EspaLuz, even days marketing engine / CTO milestone / GEO API; Telegram @EspaLuz + Make.com | odd-day EspaLuz CTA `wa.me/…` → `aideazz.xyz/espaluz?utm_source=influencer`; **fix stale "7 days FREE, $7.77/mo" → 14 days, $11** | even-day rotation, Make.com router, images, milestones |
| LinkedIn CMO (VibeJobHunter `linkedin_cmo_v4.py`) | career / AIdeazz positioning; lists EspaLuz links among products | where it already names EspaLuz, the link → `/espaluz?utm_source=linkedin` | its topics, schedule, job-search focus |
| Daily blog (cto-aipa) | engineering posts, all products | only posts ABOUT EspaLuz end with the `/espaluz?utm_source=blog` link | every other post |
| Atlas / marketing engine (Mondays) | creative-angle board for media buying | nothing | everything |
| GEO/AEO engine | `/espaluz` now 100/100, weekly audit | add parents' questions to the AI-citation check | all other properties |
| New: arrival counter | none | one tiny log line per visit/button on `/espaluz` (source + button), weekly 1-line report | — |
Open question for Elena: Influencer line ~753 is a first-person parent "story" — confirm it is a real family's words, else label it as an example.
