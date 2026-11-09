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
- 7 Nov (parallel build): tools in `D:/aideazz/tools` (Bubblewrap, JDK 17, Android SDK; Elena accepted the SDK licenses — the tool accepts all 8 at once). Android project `D:/aideazz/espaluz-android`, packageId **lat.espaluz.app** (permanent), Play Billing on. Upload key `D:/aideazz/secrets/espaluz-play/` (NOT in git; password in README there; Elena to back it up), SHA256 D4:B6:9A:6B:…:6D:C0. ascent `f900268` pushed: `src/lib/playBilling.ts` (Digital Goods API, hides other payments inside the Play app), `supabase/functions/play-verify` (Google check + acknowledge + user_subscriptions; inert until secrets GOOGLE_PLAY_SA_JSON + PLAY_PACKAGE_NAME), `public/.well-known/assetlinks.json` (upload key; add the Play App Signing key fingerprint after first upload; live after Publish). UI button not wired yet.
- 7 Nov ~20:00 UTC: **first signed Android build** `D:/aideazz/espaluz-android/espaluz-1.0.0.aab` (3.27 MB, versionCode 1, minSdk 24 = Android 7.0, required by androidbrowserhelper 2.7.4 + billing 1.2.0; jarsigner verified). Gradle must be started as `java -cp gradle/wrapper/gradle-wrapper.jar org.gradle.wrapper.GradleWrapperMain` (gradlew.bat is not found by cmd on this laptop). ascent `44683c9` pushed: inside the Play app every payment screen (SubscriptionFlow) shows Google Play only and pricing cards say "powered by Google Play"; website unchanged (checked in preview both ways). Supabase `play-verify` v1 ACTIVE. Play signup: earning money = Subscriptions only. NOT yet: espaluz-android has no git remote (back it up), Play Console subscription product `espaluz_monthly` + 14-day trial offer, service account → secrets, upload to closed testing, App Signing fingerprint into assetlinks.
- 7 Nov 21:16 UTC: **Play developer account CREATED** (personal, owned by Elena's main Google account, developer name AIdeazz AI Lab, $25 paid). Next for Elena: identity (ID), Android device check, phone; then Create app ("EspaLuz: Spanish for families", default en-US + es-419, App, Free download with subscription).
- 7 Nov 21:41 UTC: Search Console property https://app.espaluz.lat/ **verified** (HTML file `public/google52125a5f04e2bffb.html` in ascent — never delete it). Play Console website field = https://app.espaluz.lat (send the ownership request). Open with Elena: confirm legal address (Play shows Llano Bonito; she picked a Costa del Este profile at signup), identity upload, Android device check, trader declaration (business phone + aipa@ email).
- 7 Nov 21:52 UTC: identity documents uploaded, Google reviewing (days). Trader profile saved (public: name, home address, aipa@ email, her WhatsApp Business number — on purpose). Left: Android device check (Play Console mobile app), phone verification (unlocks after ID approval), Create app.
- 7 Nov ~22:10 UTC: test APK `espaluz-android/espaluz-1.0.0-test.apk` (zipalign + apksigner, upload key; cert SHA-256 = assetlinks) sent to Elena to install on her phone. Store assets in `espaluz-android/store/`: feature graphic 1024x500 (real classroom cover + globe icon), icon 512. Screenshots: from Elena's phone running the test app (real screens: bilingual chat reply, classroom, memory moment). Elena gathers 12 tester Gmail addresses (Android).
- 7 Nov ~22:45 UTC: parallel prep pushed — forms pre-answered (`GOOGLE_PLAY_FORMS_2026-11-07.md`), tester invite EN/ES (`GOOGLE_PLAY_TESTER_INVITE_2026-11-07.md`), ascent `f33c57b`: `play-rtdn` (renewals/cancellations via Pub/Sub push, secret PLAY_RTDN_SECRET), purchases keyed by token hash (order id changes every renewal), CANCELED keeps access to the paid date, Dashboard re-checks Play purchases on open. Banner v4 in `espaluz-android/store/` (expat families + digital nomads in LATAM, for the long road; EspaLuz with Pere and Titi). Listing name now "EspaLuz: Spanish for expats".
- 7 Nov: **If identity verification fails** (Google Play Console Help 9198012 + 13634888): resubmit from the "Verify ID" banner; Google allows "a limited number of verification attempts" (no number given); common causes = name not matching exactly, expired or blurry/cropped document, black-and-white copy of a colour document, document type not accepted. Google asks for a government photo ID **from the sign-up country** (Panama) plus a **proof of address** (utility/phone bill, bank statement, lease) that matches the payments-profile address (Llano Bonito) and name exactly. More time → appeal in Play Console; if never verified, apps/presence may be removed; the $25 refund is possible only on request to support, not promised. Community reports (anecdotal): appeals sometimes reset the attempt counter.
- 7 Nov 22:12 UTC: **stranger sign-up PROVEN on the web** (Elena's fresh Outlook test address, incognito): created 22:09:08, confirmation mail sent the same second, confirmed + signed in 22:12:30. Mail arrived in Outlook **Junk** (SPF/DKIM/DMARC for aideazz.xyz via Resend are all present; likely new-sender reputation + a bare template whose link points at the supabase.co host). Confirm link landed on the home page, which always showed "Sign In" → fixed ascent `1797a6c` (redirect to /dashboard; menu shows "Mi EspaLuz / My EspaLuz" when signed in) — needs Publish, and /dashboard must be in Supabase Auth redirect URLs (else it falls back to the Site URL as before).
- 7 Nov ~22:30 UTC (Elena's go, done in her Chrome): Supabase Auth → Emails → **Confirm sign up** replaced with the branded bilingual template (`ascent/supabase/templates/confirm-signup.html`, subject "Confirma tu cuenta de EspaLuz / Confirm your EspaLuz account", link `{{ .SiteURL }}/auth/confirm?token_hash=…&type=signup`) — "Successfully updated email template". **Site URL changed** from the old `https://espaluz-ai-language-tutor.lovable.app` (which 302-forwards to app.espaluz.lat with the query kept) to `https://app.espaluz.lat` — "Successfully updated site URL". Redirect allow-list already had `https://app.espaluz.lat/**`. Not yet proven: a fresh sign-up mail landing in the Inbox and the new link confirming.
- 9 Nov 03:34 (Google mail): **identity VERIFIED.** Next for Elena: Android device check (Play Console mobile app) + phone verification, then Create app. Claude then uploads espaluz-1.0.0.aab to closed testing; 12 testers opt in for 14 straight days.
- 9 Nov ~15:51 UTC: **phone VERIFIED** (Elena). Play Console home shows 'Create your first app'. Next: Create app (EspaLuz: Spanish for families / English (United States) en-US / App / Free / 3 declarations ticked by Elena).
