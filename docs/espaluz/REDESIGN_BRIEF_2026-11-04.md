# EspaLuz web app — redesign brief from the signed-in walkthrough (4 Nov 2026)

Walked with Elena signed in (her laptop Chrome), looking only. One side effect: opening "¡Clase!" started a lesson
greeting (1 new `learning_sessions` row, 19:04 UTC). Inputs: `WEB_UI_INSPECTION_2026-11-04.md` (signed-out findings),
`COMPETITOR_UI_RESEARCH_2026-11-04.md` (market patterns), palette layer 1 on ascent branch `design/violet-sun`.

## What a paying family sees today (measured)
**Dashboard** — 6.8 screens, 19 sections, in this order: welcome banner → stats → plan → connect → family progress →
"Features toolkit" → Telegram panel → modules → avatar video → family members → referrals → chat (last).
- **Four sets of numbers that contradict each other:** "0 lessons · 0m · 0 streak · 0 words" / "Family Progress:
  24 conversations this week · 7-day streak" / Telegram panel "7 sessions · 21 words · 44m · Learning score 100" /
  "Weekly progress 100%" next to "Average score 0%".
- **Database truth for this account:** `learning_sessions` = **664 web** (last: today), **7 WhatsApp** (since 31 Oct),
  **7 Telegram — last 17 Jul 2025.** The Telegram panel shows 16-month-old sessions as current; the stats ignore the 664.
- **A red "🐛 ENHANCED Debug Info – Why No Recent Sessions?"** panel is shown to users (`TelegramProgress.tsx:360`).
- **Old chat history** shows the internal format: "1️⃣ Main Response / 2️⃣ Video Script / [VIDEO SCRIPT START]",
  with "Generate Video" buttons and an "Avatar video" uploader (not in the claims table).
- Generic modules (hola, adiós, numbers) with full magenta progress bars labelled "Not started"; the "Beginner" tab
  label is invisible (white on white).
- Header: three buttons in three colors (green Standard, green Kids classroom, orange Invite).
- Good and real: greeting by name, plan Standard · Active, **family member profiles (parent + child, with tone and
  interests)**, referral system.

**Kids classroom** — the product's best screen. One screen, illustrated Panama classroom, Pere waving + Titi,
**227 stars + 45 stickers** earned, two big buttons. In a lesson: Spanish big / English small bubbles, the heroes
**remembered** something the child said in an earlier lesson, big round buttons
Pintar · Trazar · Foto · Habla, family switch child · Mamá · Papá. Gaps: no visible way back to the dashboard; the
gallery button has no label; button colors are the old palette.

**Connect page** — clean and true: Telegram + WhatsApp both Active since 31 Oct.

## Keep · rewrite · remove
| Keep (real, works) | Rewrite | Remove / hide |
|---|---|---|
| Kids classroom (as the brand's face) | Dashboard numbers → ONE source: `learning_sessions` across web/WA/TG | 🐛 debug panel |
| Family member profiles | Telegram panel → "Your family on every channel" (all sources, real dates) | "Features toolkit" grid (avatar videos, priority support) |
| Connect Telegram/WhatsApp | Chat → move up; hide old "Video Script" history format | Avatar video uploader + Generate Video (not in claims table) |
| Plan · Active status, referrals | Modules → "Moments" (doctor, public office, school gate) from the country guides | Generic hola/adiós modules, fake progress bars |
| Pere/Titi art, stars & stickers | Header → one violet primary + one sun "Kids classroom" button | "Edit with Lovable" badge |

## Proposed dashboard (one screen on a laptop, ~3 on a phone)
1. **Today** — greeting + two big cards: **the child's classroom** (stars, stickers, last thing she said, ▶ Start) and
   **Your Spanish** (chat, interpreter, photo of a document).
2. **This week** — one honest strip from `learning_sessions`: lessons, minutes, days, by channel (web · WhatsApp · Telegram).
3. **Parent report** — the last kids report (already produced by the bots) in plain words.
4. **Family & channels** — members, connected bots, invite.
5. Plan · settings at the bottom.
Colors: violet frame (layer 1 tokens), sun only inside the kids card; Baloo headings.

## Order (each step proven on screen before the next; nothing merged without Elena)
1. Remove the debug panel, fake bars, avatar/video blocks (pure deletions — lowest risk).
2. One numbers source (`learning_sessions`) for stats + the channel strip.
3. Rebuild the dashboard top as "Today" (classroom card + Your Spanish card).
4. Layer 2 colors (743 hardcoded classes) on the screens touched.
5. Signed-out homepage + free sign-up path (inspection findings 1–5).
