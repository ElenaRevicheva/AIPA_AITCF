# EspaLuz — honest product check + no-money traction plan (2 Nov 2026)

Elena's questions: our posts go to platforms where these families don't live; is the product truly what the brand
promises; will anyone want it; what unique move works with no ad money?

## Where the product really stands
| Promise | Reality today |
|---|---|
| Confidence at the doctor / public offices | Voice interpreter works (WA + Telegram). Guides: Panama full (8 topics); most countries 2-3; Uruguay 0 |
| Belonging: the words, the customs | Real for 21 countries, but thin: 3-10 expressions per country, a few customs |
| Independence: notes, forms, appointments | Photo explanation + chat work everywhere |
| "Evolves with you along the journey" | NOT built: no relocation checklist, follow-ups saved but never sent, WA and Telegram memories not merged |
| Kids with Pere and Titi | Strongest part: tested daily by Alisa on the web; WhatsApp version runs on the same brain |
| Demand | 3 strangers in 60 days, all lost at message 1 (fixed 1 Nov). Nobody has seen it — this is not yet evidence that people don't want it |

**Verdict:** the brand is honest for **Panama** and thin everywhere else. 21 countries stays as reach (the country
pages for search), but the product we *sell* first is **"your first months in Panama, as a family"**.

## Why the posts don't reach families
The Influencer → Make → Buffer pipeline posts to Instagram + LinkedIn (Elena's personal profiles). New families do not
follow those. TikTok is locked in Buffer's free plan; there is no Facebook connection. Even fixed, a brand-new page
with 0 followers gets almost no organic reach. Broadcasting is the wrong tool at zero budget — keep it running (free),
stop expecting it to sell.

## The unique move: go where new families are FORCED to pass, with partners, in Panama
New families in Panama all pass through the same doors in their first 90 days: an immigration lawyer, a relocation
agent or realtor, an international or bilingual school, a pediatrician, a coworking, and the Facebook/WhatsApp groups
for expats in Panama. Those gatekeepers already have the families' trust and want to look helpful.
1. **Welcome-kit partnership (B2B2C, no ad money).** Offer each gatekeeper EspaLuz as a free welcome gift for their new
   families (30 days, co-branded line "a welcome from <partner>"). Later: they pay per family seat → real invoice.
   First 10 targets: immigration lawyers, relocation agents, international-school parent associations, pediatric
   clinics, coworkings in Panama City. (List + messages drafted for Elena; she sends from the laptop.)
2. **The product shares itself.** One line in the parent report after each kids lesson: "Know a family that just
   arrived? Give them 14 days free" + a personal link. Zero cost; the only channel EspaLuz owns.
3. **Be the helpful neighbour in the groups.** Elena (as herself, a mom who arrived in Panama) answers real questions
   twice a week in 3-5 Panama expat-family Facebook/WhatsApp groups. Drafts come from the bots' Panama knowledge; a
   link only where the group allows it. Groups cannot be posted to by API (Meta, 2024) — this stays human, ~20 min.
4. **Facebook Page + Make (one click by Elena)** so Influencer posts and Grok reels also land on Facebook, where these
   parents are. Expect slow growth; it supports 1-3, it does not replace them.
5. **Ten real conversations first.** Parents at Alisa's school and in one group: "what was hardest in your first
   months?" Their words decide what gets built next (customer discovery), before more features.

## Product work that makes the brand true (small, Panama first)
- **First 90 days in Panama**: a checklist the bot walks a family through (cédula / Migración, CSS, bank, school
  enrolment, pediatrician), built from the Panama data that already exists.
- **Send the follow-ups that are already saved** ("how did the doctor visit go?") — the code stores them, nothing sends.
- **Invite-a-family link** in the parent report (move 2).

## Measure
`scripts/espaluz-funnel-weekly.mjs` already reports visits → doors → payments per source every Monday. Add
`utm_source=partner-<name>` and `utm_source=invite` to see which move brings families.
