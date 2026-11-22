# EspaLuz reach without Elena's hands (22 Nov 2026) - plan for her go

Elena: build Instagram comment-to-DM; is renaming her Instagram allowed; Facebook groups should be listened to AND posted
to automatically, like Reddit - but Reddit floods her CTO AIPA bot with drafts she has no time to paste ("99% buried").

## Facts checked today
- **Reddit listener (cto-aipa, hourly `25 * * * *`): 2,603 drafts queued, 14 ever posted (0.5%).** It is the AIdeazz
  B2B lane (audit API), not EspaLuz. The "draft for Elena to paste" model has failed: her time is the bottleneck.
- **Facebook groups: Meta removed the Groups API in April 2024** (v19; `publish_to_groups` gone; Make and Zapier dropped
  their Facebook Groups apps). No app can read or post in groups any more. The only way left is a robot clicking inside
  her personal Facebook - against Facebook's rules on automation; when detected, the personal account gets restricted, and
  that account is the admin of the EspaLuz Page and the Make connections that post every film. **Not built, on purpose.**
- **Instagram name:** changing the display name is allowed (twice per 14 days); the username can change too (old one held
  14 days for a revert). Nothing on her account prevents it.
- **Instagram comment-to-DM tooling:** our servers hold no Meta/Instagram key; Make's Facebook connection has Page scopes
  only (no Instagram). Own build = a Meta developer app + App Review for messaging strangers (days to weeks). ManyChat
  (Meta-approved partner) works the same day: Free = 25 people/month (cut from 1,000 in March 2026), Essential $14/month
  = 250. Today's film tappers = 0, so 25/month is enough to PROVE people comment before paying anything.

## The plan (Claude's recommendation)
1. **Keyword: HOLA.** Every audience can type it (English and Russian speakers learning Spanish, Spanish speakers),
   it is the first word of a new life in Spanish, and the bot's own greeting. Variants accepted: hola, Hola!, OLA.
   "SPANISH" was considered: it shuts out the Spanish speakers who come for English (Table 1 category 3).
2. **Instagram:** keep her current account (it already carries the Reels and followers; a new account restarts reach at
   zero exactly when we test). Optional: display name "Elena · EspaLuz founder" - a founder's face is trust for a family
   product. A separate @espaluz account is the right move later, once comments prove demand.
3. **Comment-to-DM, $0:** Elena creates a free ManyChat account and connects Instagram (her login, her approval - 2
   minutes). Claude builds the automation: comment HOLA on any Reel -> instant DM with the tracked app link and the
   WhatsApp link (code `<film>-ig`, so arrivals land in HubSpot like every film). Next film captions + end card say
   "Comment HOLA". Upgrade to $14 only if more than 25 people a month comment.
4. **Stop the Reddit flood:** Reddit drafts stop going to her Telegram hourly; at most one weekly line (top 1 thread).
   Nothing is deleted; the listener keeps collecting.
5. **Replace groups with reach a machine may run:** a Click-to-WhatsApp ad (Meta Ads, fully automatable and allowed)
   aimed at expat families in Panama / CR / MX / CO; the button opens WhatsApp with the film code typed. Needs her budget.
