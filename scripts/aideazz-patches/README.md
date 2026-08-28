# Patch relay for the `aideazz` repo (aideazz.xyz portfolio)

Cursor cloud agents can push to `AIPA_AITCF` but get **403 denied** on
`ElenaRevicheva/aideazz`. Solution (July 17, 2026): park verified patches here,
then push `aideazz` as the `.deploy-trigger` product — the Oracle box (which
holds a full PAT in its git credential store) runs
`scripts/oracle-resilience/push-aideazz-patch.sh`: it syncs
`/home/ubuntu/aideazz`, `git am`'s every `*.patch` in this folder (skipping
already-applied ones, aborting on conflict), and pushes `main` so 4everland
auto-deploys.

```bash
printf 'aideazz\nreason-%s\n' "$(date -u +%s)" > .deploy-trigger
git add .deploy-trigger && git commit -m "deploy: aideazz (<what>)" && git push origin main
```

`0014-labapi-show-checks-share-url.patch` — money page (`/api`, `LabApi.tsx`)
already received the full 34-check JSON and only painted the grade + top five
fixes. Renders every check (status, observation, fix) grouped by category, and
honours `?url=` so `https://aideazz.xyz/api?url=https://their-site.com` auto-runs
on load (same contract as the webhook docs page). Engine, demo key, and scoring
untouched. EN+ES strings. No `[skip ci]`.

`0015-4everland-pin-labapi-checks.patch` — restamp `public/4everland-pin-stamp.txt`
so 4everland cuts a new CID for the 0014 UI. No extra clone; Oracle
`/home/ubuntu/aideazz` only. No `[skip ci]`.

`0016-labapi-idle-receipts-hint.patch` — one visible line on the empty `/api`
form: after you audit you get all 34 checks, not only five tips. The idle
landing previously looked unchanged. EN+ES. No `[skip ci]`.

`0017-community-utm-attribution.patch` — `/api` keeps inbound `utm_*` in
sessionStorage, sends them with the audit POST, and puts them on the
portfolio inquiry link. Inquiry form also reads sessionStorage. Closes
Reddit/HN → audit → `/portfolio` form → HubSpot `[CLIENT-CTO-INQUIRY]`.

`0018-4everland-pin-community-utm.patch` — pin stamp so 4everland cuts a new
CID for 0017. No `[skip ci]`.

`0001-geo-card-visibility-api.patch` shipped this way on July 17, 2026
(aideazz commit `bfdcd0b`, Actions run 29620502489). Applied patches stay in
the folder as a record — the relay script skips them via reverse-apply check.

## What `0001-geo-card-visibility-api.patch` does

On the `/portfolio` page's **GEO + SEO Engine** card (bilingual EN/ES):

- Adds a plain-language paragraph about the AIdeazz Lab **AI Visibility Audit API**
  (free endpoint, 0–100 score, 34 checks, AEO/GEO/tech-SEO, scored diagnosis for
  bot-blocked / JS-only sites, "this site scores A+ 100/100 on its own engine").
- Updates the Traction line: "Public AI Visibility Audit API live • aideazz.xyz
  scores A+ 100/100 on its own engine • …".
- Adds a second card button — "Audit your site free — AI Visibility API" — linking
  to the existing `/api` page (which already calls the production endpoint).
- `BusinessCard.tsx`: the aiCoFounders card renderer now supports `extraLinks`
  (previously only the EspaLuz/Algom card list rendered them).

## Apply it (from a laptop with aideazz push access)

```bash
cd aideazz
git checkout main && git pull
git am path/to/0001-geo-card-visibility-api.patch
git push origin main   # 4everland auto-deploys
```

Or: grant the Cursor GitHub App access to the `aideazz` repo
(GitHub → Settings → Applications → Cursor → Repository access), then any
cloud agent can push it directly.

`0002-portfolio-first-seo.patch` — see file.

## What `0003-pin-telegram-blog-html.patch` does

The 21 Aug 2026 daily post `telegram-my-ai-agent-ops-dashboard-not-a-web-ui`
landed on Dev.to and `/portfolio` while 4everland's IPFS pin still had no
`public/blog/<slug>/` directory (`no link named "telegram-my-ai-agent-ops-dashboard-not-a-web-ui"`).
This patch (1) comments the existing static HTML so 4everland rebuilds without
`[skip ci]`, and (2) shows the English body while the Spanish translation poll
runs instead of hiding it behind "Traduciendo…".

`0004-4everland-rebuild-stamp.patch` is a follow-up no-skip-ci stamp
(`public/4everland-pin-stamp.txt`) if the first pin commit did not change the CID.

`0005-wiki-refresh-pin-telegram-post.patch` — wiki-ship-shaped sitemap/geo refresh
so the Telegram-ops HTML already in git is in the pin. Applied; live CID did not move.

`0006-wiki-git-ahead-of-pin.patch` — new wiki chapter + concept (`git-is-not-the-origin`)
for the 21 Aug 2026 incident (56 skip-ci commits, then eligible SHAs, live CID unchanged).
Regenerates `public/ai-ops-wiki.html` (Rev 14) and restamps the pin file. No `[skip ci]`.

`0007-wiki-prompt-poisoned-the-grounding-gate.patch` — 26 Aug 2026 chapter + concept
(`the-prompt-is-a-source`): a leftover `$40` in the topic brief made the fail-closed
grounding gate skip the daily blog on a day that had real evidence. Regenerates
`public/ai-ops-wiki.html`, restamps the pin file, bumps `geo-manifest.json` date.
`blog: no`. No `[skip ci]`.

`0008-fix-portfolio-inquiry-cta-flip.patch` — "Tell us about your project" on the
portfolio card back scrolled to a form on the hidden front face and landed on empty
particles. Punch CTA now uses the same `goToForm` handler as the service cards
(flip, then scroll). Copy and layout unchanged.

`0013-sop-typography-refresh.patch` — SOP typography (EN+ES): Space Grotesk
display face, gradient section headings + eyebrows, balanced heading wrap,
teal selection, offset link underlines. CSS + one font link; content unchanged.

`0012-sop-llm-waterfall-chip.patch` — the AI/LLMs stack card was the last surface
showing the pre-waterfall lineup (no Gemini, Grok as "tier-3 failover"). Now
leads with the fleet-wide five-provider waterfall (Claude · OpenAI · Gemini ·
Grok · Groq, ordered per use case), matching `llm-resilience.ts`.

`0011-sop-stack-chips.patch` — SOP Stack reference redesign (EN+ES): per-category
gradient top edge + glowing marker, tools as rounded chips with hover tint,
card lift + shine sweep. Content unchanged.

`0010-sop-pitch-august-refresh.patch` — SOP (EN+ES) + pitch: emoji-free wiki CTA,
hero CTA row (nine-systems dossier, podcast, film studio), proof ticker + scroll
reveal, lab-table rows for every proof surface, grounded-blog copy, concierge
step names Claude Fable 5 + watchdog, new step 7 (auto lead search → HubSpot
autopilot: WhatsApp links, one-click email, auto stage moves, +4d follow-up
tasks, delivered/opened from real Resend webhooks). Pitch gains Atlas row +
radar CTA, HubSpot-autopilot tile, fleet watchdog, and drops stale claims
(Opus 4 / Llama 3.3 / 25 reviews / 82→80+ commands). Numbers measured at HEAD
(124 essays, 140 sitemap URLs, 1,004 commits) or dossier-attributed; fleet
health proven live via fleet-verify GHA run 33066407534 (all checks passed).
Dead `AILA` repo link → `hive`. No `[skip ci]`.

`0009-pitch-august-2026-tech.patch` — actualize `public/pitch.html` to August 2026
without a HUD/VC rewrite. Date, CMO (gates + wiki + concierge + outreach; drop
Hashnode / "no human in the loop"), slide 09 (what shipped since May), traction
(12 wiki chapters), founder Aug row, portfolio-first CTAs. ES toggle now matches
9+blueprint. `pitch-es.html` is a redirect to `/pitch.html?lang=es` (the old
page was a 2025 $100K pre-seed deck). No `[skip ci]`.

