# EspaLuz dashboard: every block, does it make sense? (8 Nov 2026)

Elena: "make the maximum of any existing feature... not keep useless nonsense features... inspect each feature and give it
a sense if possible, without reinventing bicycles." Read from the code (`ascent-saas-builder/src/pages/Dashboard.tsx` and
`src/components/dashboard/*`) and her live account. Nothing here is deleted; "fold" = move lower or hide, never wipe.
The test for every block is the web's three jobs (`WHY_THE_WEB_EXISTS_2026-11-08.md`): the child's place, the family
memory, the parent's overview.

| # | Block (top to bottom) | What it really reads | Verdict | Sense it gets, reusing what exists |
|---|---|---|---|---|
| 1 | Header: Kids classroom, Invite | links | **Keep** | - |
| 2 | Subscription recovery | payment state, shows only on a problem | **Keep** | - |
| 3 | Family map + card 7 | real rows | **Keep, the heart** | Memory job + bond. Live 8 Nov. |
| 4 | Chat with EspaLuz | the chat | **Keep** (moved here 8 Nov) | - |
| 5 | Your Learning Journey (0 lessons, 0 min, 0 words) | `user_module_progress` of the static modules nobody uses | **Fix - says 0 next to 429 real talks** | Read the same records as the map: classroom talks and days per child, chats, a week streak from `learning_sessions`. This becomes the parent's weekly overview (job 3). |
| 6 | Account status | plan, trial, subscription | **Keep** | Parent overview (job 3). |
| 7 | Quick actions | buttons to places the header and map already reach | **Fold** | Duplicate of the map. |
| 8 | Learning progress card | same module progress (zeros) | **Fold into 5** | One progress block, not two. |
| 9 | "Your Spanish Learning Toolkit" (features list: Avatar Videos, Priority Support...) | a static list | **Check every claim, hide untrue ones** | Marketing inside the product; claims only from the code-backed table. |
| 10 | Telegram Bot Learning Journey | Telegram rows | **Fix now: hide the red "🐛 ENHANCED Debug Info" from families**; later fold its session list into card 7 | It is a developer tool shown to customers. |
| 11 | Spanish Learning Modules (Greetings, Family, Numbers...) | static lessons + `user_module_progress` | **Keep lower** | Parent's own self-study; honest, works, but not the product's core. |
| 12 | Avatar Video | the family's uploaded video | **Today: nothing reads it** (label fixed 8 Nov, `2d59b18`) | See below - needs Elena's decision. |
| 13 | Family members | `family_members` | **Keep** | Feeds memory on every channel. |
| 14 | Refer friends | referrals | **Keep, at the bottom** | - |

## The avatar, honestly
- The upload works (her 3.8 MB video was saved 8 Nov 20:07 UTC); the screen showed the old one because the same address
  was cached for an hour. Fixed `2d59b18` (versioned address, 60 s cache, a replaced format no longer leaves the old file).
- The card promised "this will be used in video generation". **False:** the talking EspaLuz (generate-video, Runway
  Characters) always uses EspaLuz's own fixed avatar id; no function reads `avatars/<user>/avatar.*`. Label now says only
  what is true.
- **The sense it could have, without a new system:** Runway Characters already makes our talking EspaLuz from one image.
  The same call can make a family's OWN EspaLuz face from their upload ("your EspaLuz looks like someone you trust").
  That costs Runway credits per family, so it is Elena's decision. Until then the card is an honest "upload and keep".
- Option B: hide the block (not delete) until A is decided - one less thing that does nothing.

## Order proposed
1. Learning Journey reads real records (5 + 8). 2. Hide the debug panel (10). 3. Check the toolkit claims (9).
4. Avatar: A (family face, credits) or B (hide) - Elena decides. 5. Fold quick actions (7).
