# EspaLuz: bilingual teaching and family memory, from production (6 Nov 2026)

Elena tested web, Telegram and WhatsApp. Her requirements: bilingual replies that teach Spanish with practical explanations;
one memory door; every family member, adult, kid or grandparent, recognized. Status: diagnosis and proposal. Nothing changed for this yet.

## Why replies stopped teaching
Claude's commits of 3 Nov replaced the tutor prompts with `ESPALUZ_COMPANION_RULES` (Familybot `acbd804`, WhatsApp `91c8d8b`, web `f17cba4`):
- "Mirror their language: mostly Spanish if they write Spanish", the other language only "as a helper".
- "At most ONE small learning moment", "Sometimes none at all".
- Removed from web: vocabulary with pronunciation, example sentences, cultural tip, mini-practice, greeting in both languages.
- Telegram's opening went from "a bilingual emotionally intelligent AI language tutor" to "a warm bilingual friend".

Stored adult-side replies, median length (rough, some lesson replies may be included): about 1,150-1,560 characters through mid-October, 604 in the week of 2 Nov.
The change solved a real problem, replies of 1,739 characters with 7-12 emojis, but it also removed the teaching.

## Proposal: companion AND tutor (merge, not a full revert)
Change the one rule text in all three places:
- Every grown-up reply carries Spanish and English.
- Every reply teaches something useful for what they just said: 1-3 phrases, each with meaning, pronunciation and a short why.
- Practical help and cultural explanation come back. A small practice question when it fits.
- Keep: answer them first, greet once a day, no invented prices, public options first, few emojis.
- Length up to about 900 characters.

## Memory: what the logs show today
Working:
- Telegram 13:09 and 13:11 UTC: facts saved. Web 13:13: "Yes, I remember... national holiday", using the same "Elisa" spelling as the Telegram fact.
- WhatsApp: `family memory: 4 fact(s) from other channels`, then 5. Facts saved at 14:01 and 14:38, shared to the family notebook.
- No WhatsApp voice crash lines since the fix.
- Clips: web `first_today` 13:13; WhatsApp `first_today` 13:57, `low_mood` 14:14; Telegram pre-made hello 13:11.

Not working or not proven:
| Problem | Evidence |
|---|---|
| Family members are not recognized on the bots | Oracle `family_members` has 0 rows. Users 12 (WhatsApp) and 13 (Telegram) are two separate "Elena" rows with no family id. The web roster is not read by the bots |
| Telegram treated a grown-up as the child | Telegram 13:09 reply: "Pere [listening]: Hola Alisa..." |
| Wrong names stay in the notebook | "Elisa returns to school..." was saved, then repeated in web and WhatsApp replies |
| Conflicting facts | Notebook: "Alisa is five years old". Web roster: Alisa 6, plus an older Alisa row aged 4 |
| Duplicates and stale facts | Three versions of the Monday school return; "all businesses are closed" has no end date |
| "The user" is nobody | "Alisa is the user's daughter": facts do not say who said them |
| Classroom and adult memory are separate | The classroom's memory card reads lessons only; adult facts never reach it, and adult chat gets lessons only through parent reports |
| Web as a writer | No fact with source `web` yet. Her one web message may simply have held nothing new; not established |

## Proposal: one family ecosystem, connecting what exists
1. **One roster.** Web `family_members` is the source. Bots read it through `kids-memory`, the door they already use.
2. **Every number knows who it is.** The first time a linked number talks, she asks once: "who am I talking with?" The answer is saved with the link, so mother, father and grandmother each have a name.
3. **Who said it.** Facts record the speaker, by name, so "the user" disappears.
4. **A cleaner notebook.** The note-taker gets the roster, so "Elisa" becomes Alisa. A person can correct a fact by saying so. Dated plans expire.
5. **Classroom connected, gently.** Heroes may use safe facts only: names, pets, school days, trips, never worries or money. Parents can ask what the child did, using the same filters as the parent report.
6. **Telegram lesson mode.** Find why a grown-up got Pere's reply, and fix it.

Privacy decision needed from Elena: within a family, is everything shared among adults? A parent's worry should not reach a grandparent or child by default.

## Open decisions for Elena
- Merge (recommended) or full return to the old tutor prompts.
- The privacy rule above.
- Which Alisa row is right. Not changed without her say.
