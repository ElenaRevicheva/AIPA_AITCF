# EspaLuz on Google Play - "Finish setting up your app" answers (9 Nov 2026)

App: **EspaLuz: Spanish for expats** · package `lat.espaluz.app` · personal account AIdeazz AI Lab.
Each answer describes what the code does today, nothing planned. Elena ticks and saves; Claude drafts.

| # | Task | Answer | Status |
|---|---|---|---|
| 1 | Privacy policy | `https://app.espaluz.lat/privacy-policy` (live, updated 7 Nov 2026) | ✅ saved 9 Nov |
| 3 | Ads | No (code scan: no AdMob/AdSense in web or Android) | answered 9 Nov |
| 4 | Content rating | email aipa@aideazz.xyz; All Other App Types; downloaded content No; user sharing No; online content Yes (AI-generated); age-restricted No; location sharing No; digital purchases Yes; loot boxes No; cash/crypto/NFT No; browser No; educational Yes -> **All ages everywhere** (ESRB Everyone, PEGI 3, USK 0, IARC 3+, ClassInd L), descriptor only "In-App Purchases" | summary seen 9 Nov |
| 2 | Sign in details | "All or some functionality is restricted" + one reviewer account (see below) | account ready 9 Nov 20:10 UTC (confirmed, signed in, 0 bots, free trial); Elena enters it in Play Console |

## 2. Sign in details (App access)
- Choice: **All or some functionality in my app is restricted** (the free demo works without an account; the family map, classroom, memory card and bot linking need one).
- Reviewer account (created 9 Nov, display name "Reviewer", a + alias of her Gmail - the address and password are not written here): a NEW email Elena controls (never linked to her phones - linked phones copy her paid plan and her history), created by Elena on app.espaluz.lat, confirmed, signed in once. A new account with no subscription row is on the 14-day free trial (useSubscription: free_trial, isTrialActive true). Sign-in is email + password only (signInWithPassword; no OAuth, no one-time code). Elena types the email and password into Play Console herself; the password is never written in a repo or chat.
- Instructions name: `EspaLuz reviewer account`
- "Any other information required to access your app": **No**.
- Instructions text (paste):

> Open the app and tap "Get Started" or "Sign In". Sign in with the email and password above (email and password only, no code sent to a phone). After sign-in you land on the family dashboard: "About your new life" questions, the family map, the children's classroom with Pere and Titi, and the chat with EspaLuz. The account has a full plan included at no cost, so every feature is open without any purchase or trial. Without signing in, the home page offers a short free chat demo. Linking WhatsApp or Telegram is optional and not needed for review.

**9 Nov 20:12 UTC - Google: "We can't create new accounts, use personal accounts to make purchases, or use free trials to review your app."** So the reviewer account needs a permanent active plan, not the 14-day trial. Plan: one `user_subscriptions` row for that account only - status active, plan standard, subscription_id `play-reviewer-comp`, no PayPal id, current_period_end 2027-12-31 (`get_user_subscription_status` then returns is_subscription_active = true). payment-mirror only writes accounts it is sent (PayPal / linked phones), and this one has neither. **DONE 9 Nov 20:15 UTC with Elena's OK** ("make sure you are not destroying anything"): ONE row inserted, guarded by `not exists` (the account had none); no update, no delete. Proof: `get_user_subscription_status` -> status active, is_subscription_active true; table 8 rows, 1 reviewer row, every other row last changed 20:09 (before the insert). To undo: delete the row where subscription_id = 'play-reviewer-comp'.

## 5. Target audience (9 Nov) - Families policy applies
Google allows only consecutive age groups, so: **6-8, 9-12, 13-15, 16-17, 18 and over** (family companion; content rated all ages). Not 5 and under. Elena acknowledged the under-13 declaration.
Families policy check against the code:
- Content suitable for children: rating All ages / PEGI 3 / ESRB Everyone.
- Ads: none (no ad SDK in web or Android).
- Children's data: classroom opens only after a grown-up signs in; a child never creates an account; privacy policy section 4 "Children" (no ads, no ad ID, parent can see/delete); no GPS anywhere.
- Analytics: GA4 was already off on /classroom; **now never loaded inside the Play app at all** (ascent commit "track: never load Google Analytics inside the Play app", reuses playBilling.insidePlayApp). Needs Lovable Publish.
- Open, legal not technical: a child's words and voice in the classroom are processed by AI providers (listed in the privacy policy). COPPA/GDPR-K ask for verifiable parental consent; today the consent is "a grown-up signs in and opens the classroom". Elena may want a one-line parent consent checkbox before the first classroom lesson - her decision, ideally with legal advice.

## 6. Data safety (10 Nov)
- Collects data: Yes. Encrypted in transit: Yes. Account creation: Username and password only. Delete account URL and delete data URL: `https://app.espaluz.lat/privacy-policy#delete` (section lists what is deleted, what stays with PayPal/Google Play, partial deletion by email; "forget" only stops use). Families commitment badge: Yes. No extra badges.
- Data types ticked (10): Name, Email, User IDs, Other info (questionnaire) | Purchase history | Other in-app messages | Photos | Voice or sound recordings | App interactions, Other user-generated content. Nothing for location, contacts, files, calendar, web browsing, crash/diagnostics, device IDs.
- Per type: collected YES, shared NO (AI providers are service providers acting for us = not "sharing" under Google's definition), ephemeral NO (stored).

| Type | Required/optional | Purposes |
|---|---|---|
| Name | Required (sign-up asks it) | App functionality, Personalization, Account management |
| Email address | Required | App functionality, Account management, Developer communications |
| User IDs | Required | App functionality, Account management |
| Other info (questionnaire) | Optional (every question has Skip) | App functionality, Personalization |
| Purchase history | Optional (only if they subscribe) | App functionality, Account management |
| Other in-app messages | Required (chatting is the app) | App functionality, Personalization |
| Photos | Optional | App functionality, Personalization |
| Voice or sound recordings | Optional (they can type) | App functionality |
| App interactions | Required | App functionality, Personalization, Analytics |
| Other user-generated content | Optional | App functionality, Personalization |
