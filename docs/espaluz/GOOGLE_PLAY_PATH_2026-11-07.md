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
