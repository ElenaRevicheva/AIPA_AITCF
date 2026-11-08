# EspaLuz family memory, shaped by Elena's Kanban (8 Nov 2026)

Elena asked: her Trello "Kanban philosophy" organises her own life; does it fit EspaLuz memory, without reinventing bicycles?
Source: a read-only pass over all 10 open boards (lists, counts, labels, archive use). Nothing in Trello was changed.
Pairs with `WHY_THE_WEB_EXISTS_2026-11-08.md`. Nothing here is built; each step needs Elena's go.

## What her Kanban actually is (measured, not assumed)
The boards she still uses every day are the lean month boards (7-8 lists). The 15-20-list project boards
(EspaLuz, AIdeazz AI Lab) went quiet months ago. **The philosophy that survives is the lean one.**

| Her list | What it does in her life |
|---|---|
| `Reglas / NB` | The same standing cards, carried onto every month board. What stays true. |
| `Датировано / "Cita"` | Things with a date. When the date passes they leave the list. |
| `Not sure's / To-do or not?` | Parking for doubt: not acted on until she decides. |
| `Сделано / Gane` | Done, then **archived, never deleted** (326 archived cards on one board). |
| `Мяч на моей стороне / на стороне Контрагента` | Whose move it is. |
| `Just for Today` · `Поток` | Today's few · the backlog. |
| Month boards: current, +1, +2 | A three-month horizon, recycled by renaming. |
| Colours | red = family, orange = business, lime = hobby. |

## What maps onto EspaLuz memory, and what each one reuses
| Her habit | EspaLuz shelf | Already exists in `kids-memory` / the web | New? |
|---|---|---|---|
| Reglas / NB | **About us** - a short stable card per person | `family_members` + notes; a correction already retires the old line (`replaces`) | tag "who it is about" on each note (step 2) |
| Cita + 3-month horizon | **Coming up** - dated things, next 3 months | `until` field; past-date notes already drop out of what the bots read | no |
| Not sure's | **Is this right?** - notes learned in the last 7 days, Keep / Forget | `created_at`, `retired` | no |
| Gane / archive, never delete | **Archive** - past and forgotten notes, search only, restorable | `retired: true` (never deleted) | no |
| Colours | one colour per family member | `family_members` | step 2 |

The card on the map never grows, because it shows only counts, the way her board shows list counts:
**"What EspaLuz remembers - 3 people · 2 coming up · 4 to check"** → opens the shelves.

## What NOT to adopt
- **The board itself** (columns, drag and drop) for parents: a new interface to learn, the bicycle. Adopt the philosophy, not the UI.
- **Many lists**: her own 20-list boards are the ones that died. Four shelves, no more.
- **Ball on whose side** ("EspaLuz promised to ask how the dentist went"): a genuinely good companion feature, but it needs a
  follow-up scheduler that does not exist. Later, not now.
- **Just for Today / backlog**: these are for doing work. A parent does not do work in a memory.

## Why this also fixes the AI, not only the screen
Today the bots receive only the **newest 15 of the last 80** notes, so old important facts silently fall out as small ones
pile up. Shelves give the AI what her month board gives her: the standing rules (About us) always, the next three months
(Coming up), and the recent few. Same shelves, two readers.

## Order (each needs Elena's go)
1. Card 7 + shelves page, read-only on existing fields: Coming up, Is this right? (Keep/Forget), Archive search.
2. Note-taker tags "who it is about" (twin change: web + WhatsApp + Telegram together) → fills About us.
3. Bots read the shelves instead of "newest 15", proven with a test family whose old fact survives 80 new notes.

Private notes (a worry, money, health) stay readable only on the phone of the person who said them; on the web they
appear as "1 private note from <name>", text hidden. Decision pending.
