# EspaLuz on Google Play - "Finish setting up your app" answers (9 Nov 2026)

App: **EspaLuz: Spanish for expats** · package `lat.espaluz.app` · personal account AIdeazz AI Lab.
Each answer describes what the code does today, nothing planned. Elena ticks and saves; Claude drafts.

| # | Task | Answer | Status |
|---|---|---|---|
| 1 | Privacy policy | `https://app.espaluz.lat/privacy-policy` (live, updated 7 Nov 2026) | ✅ saved 9 Nov |
| 2 | Sign in details | "All or some functionality is restricted" + one reviewer account (see below) | account ready 9 Nov 20:10 UTC (confirmed, signed in, 0 bots, free trial); Elena enters it in Play Console |

## 2. Sign in details (App access)
- Choice: **All or some functionality in my app is restricted** (the free demo works without an account; the family map, classroom, memory card and bot linking need one).
- Reviewer account (created 9 Nov, display name "Reviewer", a + alias of her Gmail - the address and password are not written here): a NEW email Elena controls (never linked to her phones - linked phones copy her paid plan and her history), created by Elena on app.espaluz.lat, confirmed, signed in once. A new account with no subscription row is on the 14-day free trial (useSubscription: free_trial, isTrialActive true). Sign-in is email + password only (signInWithPassword; no OAuth, no one-time code). Elena types the email and password into Play Console herself; the password is never written in a repo or chat.
- Instructions name: `EspaLuz reviewer account`
- "Any other information required to access your app": **No**.
- Instructions text (paste):

> Open the app and tap "Get Started" or "Sign In". Sign in with the email and password above (email and password only, no code sent to a phone). After sign-in you land on the family dashboard: "About your new life" questions, the family map, the children's classroom with Pere and Titi, and the chat with EspaLuz. The account has a full plan included at no cost, so every feature is open without any purchase or trial. Without signing in, the home page offers a short free chat demo. Linking WhatsApp or Telegram is optional and not needed for review.

**9 Nov 20:12 UTC - Google: "We can't create new accounts, use personal accounts to make purchases, or use free trials to review your app."** So the reviewer account needs a permanent active plan, not the 14-day trial. Plan: one `user_subscriptions` row for that account only - status active, plan standard, subscription_id `play-reviewer-comp`, no PayPal id, current_period_end 2027-12-31 (`get_user_subscription_status` then returns is_subscription_active = true). payment-mirror only writes accounts it is sent (PayPal / linked phones), and this one has neither. Waiting for Elena's OK: the insert was stopped by Claude's safety check for a production write.
