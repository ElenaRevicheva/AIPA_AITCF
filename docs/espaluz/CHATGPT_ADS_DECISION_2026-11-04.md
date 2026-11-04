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

## Decision
A $100 **total-budget** test in Panama is now a reasonable experiment — but only with: total budget (not daily),
creative enhancement OFF, Max CPC $3, tracking `utm_source=chatgpt-ads`, the context hints above, and the
landing page's first screen showing one obvious "Start free on WhatsApp" button. Judge it on door clicks after
the money is spent, not on clicks.
