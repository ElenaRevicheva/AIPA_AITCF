# EspaLuz landing — cold-read test and the 250-word plan (16 Nov 2026)

**Why:** a founder-tester (EdTech CEO, Panamá) answered Elena's question "is it clear in the first minute who EspaLuz is
for and what it does?" with **no** — too much text, high cognitive load. He suggested exactly this test: agents read the
page as a human would and say what they understood in 200-300 words. He also sent a funnel-page guide (Navbar → Hero →
Social proof → Solutions → Benefits → Process → Pricing → Testimonials → CTA → Footer) and recommended PostHog.

## Measured (live app.espaluz.lat, iPhone 13 WebKit, 16 Nov ~09:50 UTC, bundle index-9fYoqQJx)

| | words | phone screens | words on the first screen |
|---|---|---|---|
| es | 729 | 11 | 78 |
| en | 669 | 11 | 72 |
| ru | 650 | 12 | 34 |

## Cold read — 3 independent readers, each read only the page text (scratchpad landing-<lang>.txt)

US mother in Panamá (EN), Venezuelan father in Panamá (ES), Russian mother in Buenos Aires (RU).
**All three: "who is it for / what does it do" after ~250 words = confidence 3 of 5.** All three would tap
"Start free: 14 days, no card" first; all three liked "try 20 messages without an account".

What all three said, independently:
1. **Two audiences in the hero** (settling families + nomads/travelers) — "I'm a parent, not a nomad". The Venezuelan
   reader: "Vive tu nuevo país en español" — "I speak Spanish; is this for me?"
2. **Never said plainly what it is** — app? WhatsApp contact? cartoon? "Pere & Titi" are never introduced.
3. **Repeats:** "WhatsApp, Telegram and the web" 5-8 times; "14 days free" 3-4 times; "find your place" 3 times;
   For you / For your child / For the whole family overlap; tagline repeats the hero.
4. **Noise that costs trust:** `Merchant ID: P8TXABNT28ZXG`; an inline "Complete Your Subscription / Step 1-2" form before
   anyone decided; "Premium — Coming Soon" ×3; "Living proof of concept" (sounds like a prototype).
5. **Slogans with no content:** "EspaLuz walks the long road with your family", "find your own words", the 5-item
   culture list.
6. **The facts that sell are buried:** a one-minute report after every lesson; school messages / doctor / paperwork help;
   each child at their own level (kinder / 1st / 2nd).
7. **Missing:** a real example of the child's 10 minutes (clip or screenshot) — "the page proves nothing before it asks".
   RU reader also asked: can I pay from here (PayPal), does it explain in Russian.

## The plan — one page in the guide's order, ~250 words (NOT built; Elena's go needed)

Keep only claims already on the page (code-backed). Nothing deleted from the repo: tag the current page first so it can be
restored in one step.

| Guide block | EspaLuz | Source on today's page |
|---|---|---|
| Navbar | Logo + ONE sticky button "Start free" | existing |
| Hero | **"Spanish & English for your kids (5-8) — and a helper for you, on WhatsApp."** Sub: "10 minutes a day with Pere & Titi, two voice teachers. 14 days free, no card." Buttons: Start on WhatsApp · Try 20 messages, no account · ▶ Hear EspaLuz | hero, child paragraph |
| Demo (proof) | 20-30 s real classroom clip or 2 screenshots of a real lesson | NEW asset — from her own test account |
| Solutions = 3 cards | **Your child:** 10 min/day at their own level (kinder, 1st, 2nd grade). **You:** school messages, doctor, paperwork — write, talk or send a photo. **Everyone:** one memory for the whole family + a 1-minute report after each lesson | "For you / child / family" merged |
| Process — 3 steps | Open WhatsApp → tell EspaLuz about your family → the kids start their class | "Ways to start" |
| Pricing — one plan | 14 days free, no card → $11/month for the whole family, cancel any time | pricing |
| Testimonials | ONLY real ones, once testers answer — until then, leave the block out | — |
| CTA + Footer | One button again + "Made in Panamá by Elena Revicheva" one line, links | footer, founder |

Out of the landing (kept elsewhere, not erased): nomads line (keep as a second line lower on the page — audience order
rule: families first, nomads second, never dropped), Premium "Coming soon" ×3, Merchant ID (checkout page only),
inline checkout form (after sign-up), the long culture sentence, the founder/"How EspaLuz is built" block (to /about or a
collapsed footer section).

## Andy's advice — the only rules we follow (each has a pass test)

1. **Clear in the first minute: who it is for + what it does.** Pass: the first phone screen alone answers both.
2. **Less text; every word carries weight** ("our teachers don't read"). Pass: whole page ≤ ~300 words per language;
   no sentence that repeats another; no slogan without a fact.
3. **The agent test before every publish:** reader-agents playing real parents read it cold. Pass: each says in one
   sentence who it is for and what it does, confidence ≥ 4 of 5, in EN, ES and RU. Today: 3 of 5 (fail).
4. **One page in the guide's order:** navbar with one button → hero (outcome + one button) → short demo → what you get →
   3 steps → one price → real testimonials only → one closing button → footer. Pass: one button repeated, never a
   second choice competing.
5. **Measure, do not guess (PostHog):** time on page, scroll depth, landing → Start → sign-up. Pass: a "before" number
   exists before the new page goes live, and an "after" number one week later.

Not his advice, ours (kept): real claims only; families first, nomads second; translation of everything.

## Live evidence (16 Nov ~17:00 UTC, Android Pixel 7 screen, Chromium, production)

- First screen a stranger sees: logo, "Get Started", the face, "Hear EspaLuz say hello", the audience line - then the
  cookie banner covers the bottom 29% of the screen, ON TOP of the headline. What EspaLuz is and what it costs are not
  on the first screen (price and "20 messages without an account" start at screen 1.2; the one-minute report at 2.4).
- 9.4 phone screens long; 18 things to tap, 15 of them different; "WhatsApp" written 9 times; 9 videos on one page.
- Accounts in production: 13 in total since July 2025. Web sign-ups in the last 30 days: 5 - four are Elena's own or
  testers, one is a stranger who never confirmed the email. Paying strangers: 0.
- PostHog is live: nothing before "Accept"; after it the recorder loads (posthog-recorder.js).

## Measuring it (PostHog, as suggested)

GA4 is already on the site (loads after cookie consent; event `app_screen`). It does not show HOW people read.
PostHog free tier adds session recordings + scroll depth + funnel (landing → Start → sign-up). Needs Elena to create the
account (her email); then a 10-line snippet behind the same cookie consent. Baseline first, then the new page — so the
change is measured, not guessed.

## PAUSED 17 Nov 2026 — Elena: "we should take it into action, but stop for now"
Live now: cookie strip, hero edit 1 ("Spanish and English for your child, and a helper for you"), English coach switch.
Waiting for Elena's three approvals (nothing applied, local copies restored):
1. **Hero B** (tested best: 0 of 6 readers leave, Spanish reader taps the main button) — texts in
   `landing-tests/2026-11-17_hero-ABC-variants.json` key "B"; results `landing-tests/2026-11-17_hero-ABC-SUMMARY.md`.
2. **Spanish page only:** add "¿Ya hablas español? EspaLuz te acompaña con el inglés y con las costumbres de tu nuevo país."
   (the Spanish reader asked "why Spanish help for me?" in all 8 runs).
3. **Short demo block "See a real lesson"** under the Start button: 3 real phone screenshots (classroom, grown-up chat with
   an English correction, one-minute parent report). Source: (a) one temporary test family, deleted after — needs her yes;
   or (b) her own screenshots with names hidden.
Then: apply in EN/ES/RU → `node scripts/landing-agent-test.cjs --url=http://localhost:4173/ --label=<name>` twice → Publish.
