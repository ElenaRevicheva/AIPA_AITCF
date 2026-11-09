# EspaLuz: ready for paid ads? (9 Nov 2026)

Elena: "Before ChatGPT / YouTube / Insta / Facebook ads, the core free-user path must work, or the promotion crashes."
Checked from production (logs, live pages, Supabase usage), not from code alone.

## Green (checked today)
| Piece | Proof |
|---|---|
| Sign-up email reaches strangers | Custom SMTP (Resend) saved 6 Nov; an outside address (Outlook test account) signed up and confirmed 7 Nov. |
| Free web demo, no sign-up | Live call 8 Nov 23:33 UTC: 200, reply, log `[belonging] web pack=panama`. |
| Ad tracking | GA4 `G-TL5S8V23LT`: utm/gclid kept, WhatsApp/Telegram door clicks, `app_signup_sent`, `app_signin`, free-message wall, sign-up errors. |
| Bots under load | Last 24 h: 0 crashes on WhatsApp and Telegram, 2 brief model limits that fell back; server disk 64%, RAM free. |
| Supabase quota | New cycle 7 Nov - 7 Dec: egress 3%, cached egress 2% (the leak that caused last month's 206% is stopped). Restriction on 4 Dec applies only if still over quota. |
| Product core | Map with 8 steps, questionnaire, family memory card, weekly journey, honest plan card, 21 country packs on web + both bots. |

## Not proven - must pass before money is spent
1. **One fresh stranger run-through** on a phone, with an email never used before: home page -> Get Started -> confirm email -> map -> "About your new life" -> classroom -> chat -> Connect WhatsApp. Claude watches the logs. (Claude may not create accounts on the live site.)
2. **Elena's own questionnaire answers -> one message on web, WhatsApp, Telegram** -> logs show her country on all three (`from=profile`, `🌎 belonging pack=`).
3. **Telegram Start button** pressed by a real new user (fix deployed 8 Nov, never seen live).

## Known gaps - acceptable for first free testers, fix soon
- Home page texts: English + Russian; the Spanish page shows English for these sections.
- Voices: Azure free trial ends ~7 Dec; after that voice falls to a paid provider unless Elena upgrades (her decision).
- Lovable Pro must be downgraded before 3 Dec (Trello reminders exist).
- WhatsApp: Meta's 15 Jan 2026 ban on general-purpose AI chatbots - EspaLuz is a family Spanish/new-country service (its prompt says so); keep it that way.
- Before paying for ChatGPT ads: confirm in OpenAI's own ads console that self-serve ads exist for her country and the minimum spend.

## Google Play (parallel track)
Closed test needs 12 testers opted in for 14 days. Ask free testers who use Android to join the test list; the ads can say "Android? Help us test the app".
