# EspaLuz — Google Play Console forms, pre-answered (7 Nov 2026)

Every answer comes from what the code does today and matches https://app.espaluz.lat/privacy-policy (rewritten 7 Nov).
If the product changes, these answers must change with it — a Data safety answer that is false is a policy violation.

Checked in code (ascent-saas-builder, 7 Nov): no third-party analytics SDK (no Google Analytics, Firebase, Sentry,
Mixpanel); `useAnalytics` writes first-party learning events into our own `learning_sessions`; microphone used for voice
notes (chat + classroom); camera/photo picker for photos in chat and class; no location; no advertising ID; no ads.

## 1. App content → Privacy policy
https://app.espaluz.lat/privacy-policy

## 2. App content → Ads
**No, my app does not contain ads.**

## 3. App content → App access
Some features need sign-in. Give Google a test login (create a test family account; never Elena's real one) with
steps: "Sign in → Chat with EspaLuz; Kids classroom opens from the dashboard after sign-in."

## 4. App content → Target audience and content
- Age groups: **6–8, 9–12** and **18 and over** (parents use the chat; children use Pere and Titi's classroom).
- Appeals to children: yes → the **Families policy** applies (privacy policy covers children, no ads, no ad ID,
  AI content safeguards, report button — all in place).
- Do not join "Teacher Approved" now.

## 5. App content → Data safety
**Does your app collect or share any of the required user data types?** Yes.
**Is all collected data encrypted in transit?** Yes (HTTPS).
**Do you provide a way for users to request that their data is deleted?** Yes — https://app.espaluz.lat/privacy-policy
(section 5: email aipa@aideazz.xyz, subject "Delete my data", deleted within 30 days).

"Shared" = given to a third party for its own use. Our AI, messaging, hosting and payment providers process data
**on our behalf** (service providers), which Google's form does not count as sharing → **Shared: No** for every type.

| Data type (Google's name) | Collected | Ephemeral? | Required/optional | Purposes |
|---|---|---|---|---|
| Personal info → Email address | Yes | No | Required (account) | Account management, App functionality |
| Personal info → Name | Yes | No | Optional | App functionality, Personalization |
| Personal info → Other info (family names, child's age/school from the family notebook) | Yes | No | Optional | App functionality, Personalization |
| Messages → Other in-app messages (chat with EspaLuz, classroom turns) | Yes | No | Required to use chat | App functionality, Personalization |
| Audio → Voice or sound recordings | Yes | **Yes** (turned into text; we keep the text, not the audio) | Optional | App functionality |
| Photos and videos → Photos | Yes | No | Optional | App functionality |
| Financial info → Purchase history (subscription active / until when) | Yes | No | Required for paid access | App functionality, Account management |
| App activity → App interactions (lessons, progress) | Yes | No | Required | App functionality, Analytics |
| Location, Contacts, Calendar, Health, Device IDs, Web history, Files | **No** | | | |

## 6. App content → Content rating (IARC questionnaire)
- Category: **Reference, News, or Educational**.
- Violence, fear, sexuality, profanity, drugs/alcohol/tobacco, gambling, crude humour: **No** to all.
- Users can interact or exchange content with **other users**: **No** (they talk only with the AI).
- Shares user's current location: **No**.
- Digital purchases: **Yes** (subscription).
- Contains AI-generated content: **Yes** — chat replies, voices and the EspaLuz video are AI-generated; harmful-content
  safeguards and an in-app Report button exist.
Expected rating: Everyone / PEGI 3 equivalent.

## 7. App content → Government app / Financial features / Health
- Government app: **No**. Financial features: **"My app doesn't provide any financial features."**
- Health: **No health features.** (Category Education. EspaLuz tells people to contact emergency services; it is not medical advice.)

## 8. Store settings
- Category: **Education**. Tags: Language learning, Kids education (pick the closest offered).
- Contact email: aipa@aideazz.xyz · Website: https://app.espaluz.lat · Phone: Elena's WhatsApp Business number (on purpose).

## 9. Monetize → Subscriptions
- Product ID: **`espaluz_monthly`** (must match `PLAY_SUBSCRIPTION_ID` in `src/lib/playBilling.ts`).
- Base plan: monthly, auto-renewing, price **US$11** (same as web; Play converts per country — check it looks right in COP/MXN/PAB).
- Offer: **14-day free trial**, eligibility "new customers only".
