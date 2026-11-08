# Why the EspaLuz web exists at all (8 Nov 2026)

Elena's question: *"Why this web at all? A parent can give the child Buddy.ai, learn on Duolingo, ask ChatGPT. What does the
web have that WhatsApp and Telegram do not? Why does the ecosystem make sense?"*
Status: an honest answer and a proposal. Nothing here is built. Pairs with `PAIN_DECISION_2026-11-03.md` and
`LONG_ROAD_COMPANION_POSITION_2026-11-06.md`.

## The honest test
A stranger compares us with three things she already has:
| She already has | What it gives | What it does not give |
|---|---|---|
| Buddy.ai / Lingokids | A cartoon tutor for the child | Does not know the parent, the school, the country; no parent report in both languages |
| Duolingo | Lessons for the parent | Lessons, not her life: the public clinic, the school meeting, Migración |
| ChatGPT | Answers anything | Forgets the family between chats unless she sets it up; one person, not a family; not in her WhatsApp by default |

None of the three is **one friend who knows the whole family** - the mother on WhatsApp, the father on Telegram, the child in the
classroom - and remembers it over years. That is the only thing worth paying for (`project_espaluz_niche_memory_mood_manner`).
Spanish lessons alone are not: those are free elsewhere.

## So what is each place for
**The chats (WhatsApp, Telegram) are where EspaLuz talks.** Parents live there; no app to open. For the parent, the chat IS the product.

**The web is where the family sees, owns and controls that friendship.** Three jobs a chat cannot do:
1. **The child's place.** A six-year-old does not use WhatsApp. The classroom is a screen built for her: pictures, Pere & Titi,
   stars, voice. Proven inside our own family: Alisa uses it daily and clapped when EspaLuz appeared (6 Nov). Not yet proven with strangers.
2. **The family memory, visible and editable.** Who is in the family, and what EspaLuz remembers about them - shown on one page
   where the parent can correct or delete any note. This is the privacy promise made real: *"you always see what she knows, and you can
   change it."* A chat cannot show this. **Gap today:** the web shows the family list, but the remembered notes (the `family_fact`
   notebook every channel writes) are visible nowhere - not one file in `src/` reads them.
3. **The parent's overview.** What the child learned this week, the account, the payment, and (if Google approves) the Play app,
   which is this same website.

## What the web should NOT be
A third chat competing with WhatsApp, or a long page of features. Today's dashboard stacks 12 blocks (roadmap, analytics, Telegram
progress, learning modules, avatar upload, family manager, referrals, chat ...). A stranger cannot say in ten seconds why she is there.

## The ten-second test (how we know the web makes sense)
A stranger, asked "why do you open the EspaLuz website?", can answer: **"My child learns there, and I see and control what EspaLuz
knows about my family."** If she cannot, the web has not earned its place yet.

## Proposal (each step needs Elena's go)
1. **"What EspaLuz remembers" page**: the family list plus the notes from all channels, each with edit and delete (retire, never wipe).
   Reuses `kids-memory` / `readFamilyNotes`; no new system.
2. **Dashboard order**: the child's classroom, then the family memory, then the weekly report. Everything else lower or folded.
   Nothing deleted.
3. **One landing line** that says the same thing, only once (1) and (2) are live and proven.

## Not proven (do not claim)
40 people have ever used EspaLuz; 0 have paid; strangers have not yet used the web classroom. This document is a reason to test, not a result.
