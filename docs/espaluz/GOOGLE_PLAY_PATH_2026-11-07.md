# EspaLuz on Google Play: the path (Elena's decision, 7 Nov 2026)

Elena: "I still see it like a way moving forward greatly." Decision taken: go. Why it fits: a Play search for
"learn Spanish kids" / "Spanish for family" is a **demand channel**, the thing the business lacks
(memory: project_root_cause_no_demand_channel). Facts and sources: GOOGLE_PLAY_ROUND2_2026-11-07.md.

## Stage A — the web app gets ready (us, free, ~1 day + one Lovable Publish)
1. Web app manifest + icons on app.espaluz.lat (today: 404) → installable on phones right away.
2. `/.well-known/assetlinks.json` (filled after the signing key exists in stage C).
3. **"Report this reply" button** in chat and classroom (required by Play's AI-Generated Content policy).
4. Privacy policy page that says what we keep for a family and a child (required by Families policy and the Data safety form).
5. Android build hides buy buttons until stage E (selling a subscription inside a Play app must use Play Billing).

## Stage B — the developer account (Elena, ~30 min + review)
- Play Console account, $25 once, verified with her ID (Android developer verification applies to everyone now).
- **Choice:** *personal* → must run a closed test with 12 testers for 14 days; *organization* → needs a free D-U-N-S
  number (can take 30+ days) whose legal name and address match the payments profile; no 12-tester wait.

## Stage C — the app (us, ~1 day)
- Bubblewrap builds an Android wrapper (Trusted Web Activity) of app.espaluz.lat on the laptop (not on Oracle).
- Signing key kept in two places, never in git. Upload to **closed testing**.

## Stage D — closed test (14 days, personal account only)
- 12 real testers with Google accounts, opted in for 14 days in a row, actually using it (Google checks engagement).
- This also gives the first real Android usage data.

## Stage E — store listing and payments
- Listing in Spanish + English, screenshots of chat + classroom, content rating, Data safety form,
  target audience **mixed (parents + children)** with Families rules met. Never claim what is not proven.
- Payments v2: Play Billing inside the app through the Digital Goods API (Bubblewrap supports it) + a Supabase check of
  each purchase. 15% to Google. Web, WhatsApp and Telegram keep PayPal / PagueloFacil.

Earliest public listing: ~3 weeks with a personal account (stage D is the clock).

## Progress
- 7 Nov: Elena chose a **personal** account (persona natural con RUC; no company for D-U-N-S); sign-up started.
- 7 Nov: stage A 1 + 3 pushed (ascent `4bc918e`): manifest, 192/512/maskable icons, theme colour; "Reportar / Report" on every chat reply and classroom turn → `feedback` table (insert-only, read policy false). Checked on the built site: manifest + icons 200, report in bundle, 0 console errors. **Live only after Lovable Publish.**
- Privacy page (`src/pages/PrivacyPolicy.tsx`, dated 15 Jul 2025) needs Elena's review before Play: it says anonymized data "may be used to improve our AI models" (we train nothing), and it does not name the AI providers that process messages (Gemini, Groq, Anthropic, OpenAI), voice notes, WhatsApp/Telegram, or the report button.
- 7 Nov: privacy page rewritten to the truth (no AI training, no ads/tracking cookies, providers named, children section, deletion by email within 30 days — Elena must honour that promise). Waits on the same Lovable Publish.
- 7 Nov: Play developer name → "AIdeazz AI Lab" (app title stays EspaLuz).
- 7 Nov: ⚠️ Play shows the payments-profile **full legal address publicly once the account earns money**. Elena's profile is her home. Play app v1 stays FREE (no Play Billing, no paid app); before stage E payments, move the payments profile to a business address. Public email: aipa@aideazz.xyz.
- 7 Nov (Elena, decision): **Play payments from version 1**, not later. Play Billing (Digital Goods API, Bubblewrap) + Supabase purchase check move into stage C; web/WA/TG keep PayPal + PagueloFacil in parallel. Correction: the signup Public profile shows only name + country; the full address is shown once she sets up the merchant account ("earn money") — decide before that step whether to keep the home address or switch the payments profile to a real business address.
- 7 Nov: signup "About you" answered with an honest text (first Play account, web/backend/AI not native Android, TWA + Bubblewrap + Digital Asset Links + Play Billing, closed test). Public email aipa@aideazz.xyz verified.
