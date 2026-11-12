# EspaLuz Google Play subscription - test guide (12 Nov 2026)

Goal: prove that a real person can subscribe to EspaLuz Family ($11/month) inside the Android app, before production.
Play Console start link (developer account "AIdeazz AI Lab"): https://play.google.com/console/u/0/developers/8330043875445360758/app-list
On a phone: Chrome ⋮ → tick "Desktop site".

## Step 1 - Base plan (once)
App list → EspaLuz: Spanish for expats → Monetize with Play → Products → Subscriptions → EspaLuz Family (`espaluz_monthly`)
→ Add base plan: ID `monthly` · Auto-renewing · Monthly · prices: all countries, 11.00 USD · no offer, no free trial
→ Save → Activate. Check the base plan says "Backwards compatible" (the app buys the classic way).

## Step 2 - License tester list (done 11 Nov, check only)
Play Console home (left menu, bottom) → Settings → License testing → list "EspaLuz testers" contains Kira's Gmail, ticked.
To let another person test payment WITHOUT being charged: add their Gmail to this list → Save.

## Step 3 - Test purchase, no real money (wait ~15 min after Step 1)
Phone, Play Store on Kira's account → https://play.google.com/store/apps/details?id=lat.espaluz.app → Open
→ Kids classroom → Get EspaLuz Family → Google sheet shows $11/month + "Test card, always approves" → Subscribe.
Expected: badge Free → Standard, classroom opens. Claude checks the `play-verify` log + database.
Test renewals happen every 5 minutes, test subscription ends itself after 6 renewals.

## Step 4 - One real purchase (proves money reaches the bank)
Needs a Google account that is a TESTER (joined the group + opted in) but NOT on the license tester list, with a real card.
Join: https://groups.google.com/g/espaluz-testers/about → opt in: https://play.google.com/apps/testing/lat.espaluz.app
→ install → sign in (an expired web account is fine - this tests paying) → Kids classroom → Get EspaLuz Family → real card → Subscribe.
Expected: real $11 charge (Google email receipt), account active. Claude checks the log + database.
Refund yourself: Play Console → Order management (left menu) → find the order → Refund (and revoke if you want).
Payout to the bank: Google pays monthly, around the 15th, for the previous month's sales.

## Testers must know
Testers NOT on the license list pay real money if they tap "Get EspaLuz Family". They do not need to: new accounts get
14 free days from EspaLuz itself, which covers the whole 14-day test.
