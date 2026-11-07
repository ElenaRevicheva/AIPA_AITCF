# EspaLuz WhatsApp and Meta's business-scoped user ID (BSUID), 7 Nov 2026

Source: Meta, "Business-scoped user IDs" (updated 5 Nov 2026), and Twilio's changelog of 18 Feb 2026.

## What Meta is changing
- WhatsApp users can take a **username** and hide their phone number from businesses.
- Every user now also has a **BSUID**, for example `US.13491208655302741918`: a country code, a dot, up to 128 characters.
  It is different for each business portfolio, and it changes when the user changes phone number.
- The phone number still arrives if we talked with that number in the last 30 days, or the number is in Meta's contact book.
  Otherwise only the BSUID arrives.

## How EspaLuz WhatsApp receives users today (checked in code and on Oracle)
- The bot is on **Twilio**, not on Meta's API directly. The webhook reads `From` and strips `whatsapp:`
  (`EspaLuzWhatsApp/espaluz_bridge.py`, `handle_message_enhanced`). That value is the user's key everywhere:
  trial, memory, kids lessons, `whatsapp_users`, payments linking.
- `whatsapp_family_id()` hashes **only the digits** of that value.
- Twilio gives the BSUID in a webhook field called **`ExternalUserId`**. Our code never reads it, so we have never stored one.
- Twilio's Messages REST API does **not** return it (checked 7 Nov on the last 20 messages: no such field).
  The webhook is the only place to get it.

## What breaks the day a user takes a username and the phone is hidden
- Twilio then puts the BSUID in `From` (with `whatsapp:`). Replies still go out, because Twilio accepts it as the address.
- But the digits of `US.1349…` are not the digits of the phone, so `whatsapp_family_id` gives a **new family**:
  memory, trial days, kids' lesson place and paid status would look like a stranger's.
- Low risk this month: our users have written in the last 30 days, so their numbers still arrive. Real risk for a family
  that comes back after a long pause.

## The fix (small, not deployed yet; needs Elena's go)
1. In the webhook read `ExternalUserId` next to `From`.
2. When both arrive (phone + BSUID), save the pair once (`bsuid → phone`) in the unified DB.
3. When only the BSUID arrives, look up the phone from that pair and carry on as the same family.
4. Log one line per new pair (`🆔 bsuid saved`) with the id masked, so the proof is in the logs.
5. Handle Meta's `user_changed_number` / `user_changed_user_id` system messages later; rare, and Twilio passes them through.
Never put a BSUID or phone on a public page.

## Done 7 Nov 15:33 UTC
Steps 1–4 are live (WhatsApp repo `espaluz_bsuid.py`, table `whatsapp_bsuid`). Step 5 still open.

## The bot's own username (@espaluz)
Claimed by a person in Meta, not by our code: Meta Business Suite → WhatsApp Manager → Phone numbers → the EspaLuz number →
Profile → Username. Rules: English letters, digits, `.` and `_` only (no ñ), 3–35 characters. If the same name is used by
our Facebook Page or Instagram, the number must be linked to that page or account first. A low messaging limit can make the
number not yet eligible. Changes are limited to 2 per 14 days, so pick once.
