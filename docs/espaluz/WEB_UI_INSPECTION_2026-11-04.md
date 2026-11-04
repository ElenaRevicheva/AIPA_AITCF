# EspaLuz web app (app.espaluz.lat) — UI inspection, 4 Nov 2026

Read-only. Nothing in the UI was changed. Evidence: live site in Elena's Chrome (signed out — she is not signed in
there), the local production build (`ascent-dist-preview`, 375 px phone + desktop), and the code (ascent `1765f82`).
Not seen: the signed-in classroom / chat with a real account (needs her session) — reviewed from code only.

## Severity 1 — breaks trust or blocks the money path
| # | Finding | Evidence |
|---|---|---|
| 1 | **Two invented customer quotes** on the homepage: "Maria, expat mom" and "Carmen, multigenerational family in Panama". The claims table bans any testimonial (`LOCAL_LIFE_POSITIONING_2026-11-02.md`, Do NOT claim). Same failure the Influencer had until `c2a7d35`. | live page text |
| 2 | **A stranger cannot start the free trial on the web.** "Start Free Trial" links to `/dashboard`; signed out, that shows "Sign In Required". The sign-in page has only Sign In + a 20-message demo. `auth.signUp` exists only in `SubscriptionComplete.tsx` (after PayPal). No password reset anywhere. Yet pricing says "14 days free on WhatsApp, Telegram and the web — no card needed". | `Pricing.tsx:193`, `Auth.tsx`, grep `signUp` |
| 3 | **Three different trials on one site:** "14 days free" (pricing), "7 days trial" / "Trial Days Left 7" (dashboard — fallback `?? 7` in `useSubscription.tsx:10`, `useSubscriptionQuery.ts:28`), "20 Free Messages" (demo). | live dashboard + code |
| 4 | **Dashboard opens signed out** and greets "Hello, ! ✨" (empty name), shows "Sign Out", "Upgrade Now", a "Sign In Required" panel next to a working demo chat. | live `/dashboard` |
| 5 | **Private biography on a public page:** "Relocated to Panama in 2022 as a single mother… elderly parents (ages 62 & 70)… Started with zero". Elena's rule (3 Nov): personal details stay private; public = one dignified line "built from my own family's experience". | live "About the Creator" |

## Severity 2 — wrong message (contradicts the 2–3 Nov positioning)
| # | Finding | Evidence |
|---|---|---|
| 6 | Positioned as **"AI tutor" / "Emotionally Intelligent Language Coach"** in hero, sign-in ("Your AI Spanish tutor awaits"), chat ("I'm your bilingual AI tutor"), footer ("AI Family Tutor"). The pivot: never "AI tutor"; "live your new country in Spanish". | live text |
| 7 | Promises outside the claims table: "Start speaking confidently in just a couple of weeks" (rule: never "fluent fast"); "every conversation creates a short avatar video"; "Avatar Videos 🎬" + "Upload your avatar MP4"; "GPT-4o vision"; "Fluent in English, Spanish, and Russian". | live text |
| 8 | Off-topic for a family buyer: "Vibe Coding → Emotional Intelligence → AI Consciousness?", "Join the Revolution", "Invest & Partner", PayPal "Merchant ID", AIdeazz ecosystem pitch. | live text |
| 9 | Kids classroom (the only usage that returns by itself — pain decision 3 Nov) sits in the nav as one small link; the homepage never shows Pere & Titi above the fold. Dashboard modules are generic beginner lists (hola, adiós, numbers) — "language app", not local life. | live nav + dashboard |

## Severity 3 — layout, mobile, speed, polish
| # | Finding | Evidence |
|---|---|---|
| 10 | **Phone layout breaks at 375 px:** the button "🚀 Start Your Learning Journey on Telegram" is `whitespace-nowrap`, 401 px wide, so the page is 417 px wide — the header cuts "EspaLuz" and "Get Started", cards cut text on the right. | measured: layout width 417 vs 375 |
| 11 | Homepage ≈ **24,000 px tall on a phone (~30 screens)** with **25 calls to action** (Telegram ×several, WhatsApp, demo, sign-in, PayPal form inline, invest…). Choice overload; the same 0-door pattern as the landing page. | measured |
| 12 | Cookie banner covers the bottom third on phones and says "By continuing, you agree" (implied consent). | 375 px screenshot |
| 13 | **"Edit with Lovable" badge** floats bottom-right on every page. | live |
| 14 | One **1.0 MB JavaScript file** (291 KB gzipped) + 118 KB CSS for every page; Vite warns to split it. | `dist/assets` |
| 15 | Two Telegram links (`t.me/EspaLuzFamily_bot` and `t.me/EspaLuz`); sign-in page uses a sparkle icon, not the EspaLuz globe; footer "© 2025"; 2 of 6 homepage images lack alt text; 9 tap targets under 32 px. | measured |

## What is good
- The new crawler shell + metadata: A+ 100 (own audit). No console errors on the public pages; 404 page works.
- Classroom has kid-sized controls with `aria-label`s (Paint, Trace, Gallery, stars/stickers), its own font, and a FeatureGate.
- i18n is wired (`react-i18next`), so copy changes can land in one place per language.
- Pricing already says "Real features, no promises we can't keep" for the Coming Soon list — the right tone.

## Suggested order (not done — Elena decides)
1 → 5 first (trust + the free-trial path), then 10 (phone layout, one CSS class), then 6–9 (copy to the claims
table), then 11–15.
