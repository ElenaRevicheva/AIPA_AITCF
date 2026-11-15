# EspaLuz dashboard - "why this and not ChatGPT" (deep pass, 15 Nov 2026) - PLAN, waiting for Elena

Elena: "I need something that will truly show that the EspaLuz app truly serves the user, across all channels -
otherwise it is useless; ChatGPT will serve much better."

## The honest test: what can EspaLuz do that ChatGPT cannot? (only what the code and data prove)
| ChatGPT | EspaLuz (proven in code/data, 15 Nov) |
|---|---|
| One person, one app | One FAMILY across WhatsApp + Telegram + app + kids classroom; notebook notes from both bots land in one family (4 families, 27 notes) |
| General knowledge, may guess | 21 country guides, each item checked with sources (Panama: 56 items, 22 sources, 14 holidays) |
| No country path | `belonging_moments` per country (Panama 8: first Fiestas Patrias, Carnival, school parade, Mother's Day 8 Dec, rainy season, verano, local food, invited by a local family) - **designed, never used by any code** |
| Remembers what you said | Remembers dated moments ("Alisa returns to school Monday", until 9 Nov) and can prepare you for them (practice, celebrations) |
| Answers questions | A child's classroom (units), a Russian heritage class, rehearsals, celebration videos - one family record |
| Knows nothing about why you moved | The family profile: country now, country from, what they miss most ("the rhythm of life"), focus (work, school, health) |

So the dashboard must stop showing ACTIVITY ("talked 2 times") and start showing BELONGING: where this family is on its
road to feeling at home in its country, and the next real moment ahead.

## Proposal: "Your first year in <country>" becomes the heart of the dashboard
1. **The moments path** - the country's belonging moments as a path (Panama: 8). Each moment is
   - ✓ **lived / talked about**: matched automatically when EspaLuz's reply in ANY channel touches the moment's words
     (the brain's server matches the words and keeps only the moment id + channel + day - never the text), or the family
     taps "We lived it";
   - **coming up**: with its date from the checked holidays (Panama today: Independence 28 Nov in 13 days, Mother's Day
     8 Dec in 23 days);
   - tap -> the checked guide text (how families here live it), one phrase, and three ways to act:
     "Ask EspaLuz about it" (chat), "Rehearse it" (practice, prefilled), "Make a celebration video".
   Every feature we built (chat, bots, practice, celebrations, classroom) now serves one visible path.
2. **Coming up for your family** - dated notebook moments (e.g. "Alisa back to school Monday") next to the country's
   coming dates, each with "Rehearse it".
3. **Tied to what they miss most** (profile): "the rhythm of life" -> rhythm-of-the-year items first; "people" ->
   family-and-friends and "invited by a local family" first; focus "school" -> school life first.
4. **Keep, smaller:** last heard per channel, phrases to keep (each says which moment/channel it came from), child's unit.
   The timeline moves under a "Show the week" fold.

## Data needed - all exists except one small server addition
- Country: `family_profile.country_now` (3 profiles; bots also know the country). Missing -> ask once (the questionnaire).
- Moments + words + guide text + holidays: the 21 packs (checked).
- Matching: add to submit-progress (WhatsApp/Telegram) + the web chat save: moment ids whose words appear in EspaLuz's
  reply -> stored next to the phrases. No message text stored.
- "We lived it" / dates: `next_step`-style events (`moment` event, family's own rows, RLS allows insert).
- Gaps to fix first: notebook has "[object Object]" notes (3) and voice mishearings ("Palouse"); the moments path must
  not depend on them.

## What it is NOT
No score, no streak, no minutes, no invented progress. A moment is ✓ only with a real trace (EspaLuz's reply in a
channel, or the family's own tap) - and the dashboard says which.
