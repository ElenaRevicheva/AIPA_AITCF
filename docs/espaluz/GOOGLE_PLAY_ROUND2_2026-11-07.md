# EspaLuz on Google Play: second look, 7 Nov 2026

Elena asked for one more round on putting app.espaluz.lat into Google Play. The 6 Nov plan (SEO_GEO_PLAN… section 5)
read only Apple's rules and said "Google Play's policy must be read before any decision". This is that reading.

## How it would be built
- A **Trusted Web Activity** (Google's Bubblewrap tool) wraps the live site: no rewrite, Lovable stays, every Publish shows
  in the app at once. Only icons or colours need a new upload.
- Needs a web app manifest and `/.well-known/assetlinks.json` on app.espaluz.lat. **Checked today: both 404.** Only an
  Apple touch icon exists, so the site is not installable yet.

## What Google Play would demand
1. **Account.** $25 one-time. A new *personal* account must run a closed test with **12 testers for 14 days** before going
   public. An *organization* account (AIdeazz, with a D-U-N-S number) is exempt.
2. **Payments.** A subscription sold inside a Play app normally goes through Google Play Billing (15%). Alternative
   billing at lower fees started 30 Jun 2026 in the US, UK and EEA; **nothing found for Panama or Latin America**.
   PayPal or PagueloFacil inside the Play app is therefore not safe until that is confirmed on Google's own page.
3. **Children.** The Kids Classroom makes children a target audience, so the **Families policy** applies: accurate privacy
   policy, no advertising IDs from children, careful third-party data use.
4. **AI chat.** The **AI-Generated Content policy** covers chat-first apps: block harmful content, and an **in-app report /
   flag button** is required. EspaLuz has none today.

## Verdict
Still **not now as a sales channel**: 0 strangers have paid, the arsenal gate is red, and Play adds billing and child
compliance work before the first install. The 6 Nov trigger stands: reopen at **10 paying strangers**, and then prefer an
organization account (no 12-tester wait).

**One cheap step is worth doing now**, because it serves today's web users and is half of the Play work:
make app.espaluz.lat **installable** (manifest + icons → "Add to home screen" on Android and iPhone). No review, no fee,
no billing change. A report button in chat is the second cheap step; Play will require it and it helps trust anyway.

Sources: Google Play Console Help (closed testing; Families; AI-Generated Content), Android Developers blog on expanded
billing choice (June 2026), Google codelab "Adding your PWA to Google Play". Third-party summaries were used only where
marked as unconfirmed above.
