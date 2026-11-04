# ChatGPT Ads for EspaLuz — decision check, 4 Nov 2026

Elena opened ads.openai.com (Ads Manager, Beta). Question: will paying for this bring EspaLuz users?
Every field of the draft was opened in her Chrome on 4 Nov (nothing saved, no billing, terms not accepted).

## Correction to the first pass
The first pass said "US only". **Wrong.** The account's home country is **Panama**: Panama saves cleanly.
Adding Costa Rica (or the US) shows "Your account's ability to target outside your home country is restricted…
complete account verification and build up ad spend in your local market first." So: **Panama only, for now.**

## Every field, as found
| Field | Draft value | Options seen | Recommendation |
|---|---|---|---|
| Objective | Clicks | Reach · Clicks · Conversions | Clicks (no conversion pixel wired yet) |
| Locations | Panama | other countries locked until verification + local spend | Panama |
| Platforms | all 5 (Android/iOS app+web, desktop web) | each can be unticked | keep all |
| Budget type | **Daily budget $100** — help text: "maximum daily spend is $200" | **Campaign total budget** | **Total budget $100** = hard cap |
| Creative enhancement | **ON** — "AI automatically generates personalized and translated versions… may be shown without your individual review or approval" | on/off | **OFF** — unreviewed copy breaks the claims rule (no invented promises) |
| Advertiser shown | "Aideazz" + AZ logo | business info step | fine, or rename to EspaLuz |
| Bid strategy | Autobid | Maximum CPC | Max CPC **$3**: meter says $1–2 "May not deliver", $3–4 "Strong Delivery" |
| Audience bid adjustments | none (no audiences) | create audience | skip |
| Tracking parameters | empty | placeholders {campaign_id} {ad_id} … | `utm_source=chatgpt-ads&utm_campaign={campaign_id}` so the weekly funnel line counts it |
| Destination | https://aideazz.xyz/espaluz | — | keep |
| Context hints | empty | free text, guides matching to conversations | **the key field** — see below |
| Ad title | "EspaLuz: live your new country in Spanish" **41/32 — over the limit** | 32 chars | see copy below |
| Description | **empty (0/54)** — the reason for "Fix issues in Ad 1" | 54 chars | see copy below |
| Image | jungle classroom (Pere/Titi) | single / multiple, square ≥256 px | keep |

Clicking Next / Continue accepts the Advertising Tool Terms — Elena's click.

## Why context hints decide everything
Most ChatGPT users in Panama already speak Spanish. The ad only helps if it is matched to the conversations of
families **new** to Panama. Suggested hints: *moving to Panama with kids; expat family Panama; child starting a
Spanish-speaking school; Panama school in Spanish; learn Spanish for kids; doctor or public office in Spanish in
Panama; Panama residency for families.*

## Copy that fits the limits and the true-today claims
- Title (30/32): **Kids keep up in Spanish school**
- Description (48/54): **Pere & Titi help your child keep up. Free trial.**

## The honest math
$100 at ~$3 a click ≈ **33 visits**. Last 7 days (`espaluz-funnel-weekly.mjs --dry-run`, GA4): **57 visits → 0 door
clicks** (WhatsApp 0, Telegram 0, web 0); the door counter on the live page was checked and works. Paid visitors
land on the same page, so the ad can only produce users if the page starts converting.

## Market evaluation from facts (Elena asked: "facts, not opinion")
**Billing (OpenAI Help Center, read 4 Nov):** postpay; card charged each time unpaid spend reaches the account
threshold (example $25) or at month end. Campaign total budget = "the maximum amount you are willing to spend";
reported spend "will not exceed the applicable budget limit". Self-serve card accounts get **no account-wide spend
limit**. Total → daily can be switched, daily → total **cannot**. First campaign: start/end dates only after
publishing. Up to 24 h of billable delivery after a pause. **Delivered spend is not refunded**, including for
"fewer conversions than expected". Card add = temporary authorization hold.
**Today:** billing not set up, nothing published → nothing can charge her yet.

**Platform results (third-party, OpenAI publishes none):** CTR 0.60–1.91% by market (Similarweb panel). One agency:
0.21% conversion on ChatGPT ads vs 3.71% on Google for the same advertiser. One advertiser: $477, 370 clicks,
**0 conversions**. Thin data; no audited benchmark exists.

**Audience:** Panama immigrants ≈ 185k of ~4.5M (one source; many are Spanish-speaking); Americans 6k–30k
(estimates). No data on expat families with children or on ChatGPT usage in Panama.

**EspaLuz's own numbers:** 57 visits/week free → 0 door clicks (95% upper bound by rule of three: 5.3%). 1 Nov
audit: 0 outside web users, 3 WhatsApp strangers in 60 days (all Sep, all left at message 1). Payments in the
last 7 days: none. October: $109.62 of YouTube promotions; same month 0 new outside users (which videos were
promoted is not recorded, so this is a warning, not proof).

**Expected result of $100:** 25–33 visits. At the measured door rate (0%) → 0 conversations; even at the
statistical ceiling 5.3% → 1.3–1.8 conversations; paying users ≈ 0. The ad would add ~33 visits to the 57 a week
the page already gets for free and converts at 0. **The bottleneck is proven to be the page, not traffic.**

## Other AI platforms — can EspaLuz buy ads there? (searched 4 Nov 2026)
| Platform | Ads you can buy today? | Panama? | Source quality |
|---|---|---|---|
| **ChatGPT** | Yes, self-serve, $25/day min or total budget | **Yes (home country)** | OpenAI Help Center |
| **Claude** | **No.** Anthropic pledged ad-free (4 Feb 2026, "Claude is a space to think"); not legally binding | — | primary + press |
| **Perplexity** | **No.** Sponsored questions stopped (new advertisers Oct 2025; removed by Feb 2026); no plans to return | — | several secondary, consistent |
| **Google AI Mode** (ads inside the AI answer) | Yes in the US + 10 countries (Oct 2026); Brazil/Mexico planned Q4; **not Panama** | No | Google announcement via press |
| **Google AI Overviews** (ads above/below) | Yes, regular Google Ads, 200+ countries | **Yes** | Google help via press |
| **Microsoft Copilot** | Pilot inside Microsoft Advertising, English, retail-first; not fully self-serve | Unconfirmed | secondary |
| **Meta AI** | No ads inside the chat; Meta uses AI chats to target ads on Facebook/Instagram | (FB/IG ads: yes) | secondary |
| **Grok / X** | Ads in Grok answers announced, not launched | — | secondary |

**Where Panama expats actually ask, for free:** Facebook groups "Expats in Panama" (20,000+ members, 2026 guide)
and "US Expats in Panama" (16,500+, Sep 2025 self-reported), plus town groups (Boquete, Coronado, El Valle).
A parent asking "which school / how does my child cope in Spanish" there is the exact pain, at $0.

## Can posting in groups be automated? (Elena, 4 Nov)
- **Facebook groups: no API.** Meta removed the Groups API in Graph API v19 (announced 23 Jan 2024, removed from
  all versions ~22 Apr 2024), including the `publish_to_groups` permission. A bot driving her logged-in profile
  would break Meta's terms on automated access, and her profile also runs the EspaLuz Page + Make scenarios —
  one ban costs all of it.
- **Reddit:** the API can post, but `community-listen.cjs` deliberately never posts: Reddit bans domains for
  automated self-promotion, and Reddit is a top source in AI answers.
- **What works without her time:** the listener already finds threads and drafts replies to Telegram. It only
  searches AI-business topics today. An EspaLuz query set (r/Panama, r/expats, r/IWantOut: "moving to Panama with
  kids", "Spanish school child", "colegio en español") would hand her a ready answer; one tap = she posts it
  (or approves Claude posting that one reply in her Chrome). Facebook groups: a weekly pass in her Chrome reads
  the groups she belongs to, drafts answers to real parent questions, and posts only the ones she approves.
- **Admin route:** many expat groups allow promotion on a set day or by admin permission — one message to each
  admin, once.

## Where the right families are (facts, 4 Nov)
Two groups, two places:
- **Already in Panama** (child in a Spanish-first school, parent in public offices): Facebook "Expats in Panama"
  20,000+ and "US Expats in Panama" 16,500+ (guide / self-reported); r/Panama ~225k (GummySearch, stale; many
  members are Panamanians); ChatGPT ads in Panama with context hints.
- **Planning the move** (US/Canada/EU): r/IWantOut ~2.0M and r/expats ~250k (GummySearch, stale); YouTube
  relocation videos ("moving to Panama with kids", Panama Relocation Tours, Relo Firm). Google Ads can place ads on
  chosen YouTube videos/channels in any country (placement + custom segments) — ChatGPT cannot reach outside Panama.
- **Who already holds both groups:** relocation firms and immigration lawyers — they publish "moving to Panama with
  kids" guides and meet every family. Offer: free EspaLuz family pass for their clients.
- **Not the audience:** LinkedIn 1 visit and Instagram 2 visits in 7 days, 0 doors.
- No source gives the number of expat families with children in Panama — nobody can, so precision must come from
  targeting the *question* (school, Spanish, kids, moving), not the platform.

## Decision
**Not now.** Fix the page on free traffic first; launch only when free visits show door clicks
(target ≥ 3 door clicks per ~57 visits). Then: a $100 **total-budget** test in Panama is now a reasonable experiment — but only with: total budget (not daily),
creative enhancement OFF, Max CPC $3, tracking `utm_source=chatgpt-ads`, the context hints above, and the
landing page's first screen showing one obvious "Start free on WhatsApp" button. Judge it on door clicks after
the money is spent, not on clicks.
