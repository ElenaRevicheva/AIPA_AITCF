# Landing page below the first screen — SURGICAL plan (4 Nov 2026, late evening) — for Elena's approval

Supersedes the "remove most of it" order in `LANDING_LOWER_SECTIONS_2026-11-04.md`. Elena's brief, 4 Nov:
"clear and functional like ChatGPT or Claude … not fancy … all buttons functional … not fluffy, not promising miracles …
do not drop everything or rebuild from scratch … surgically polish … wording formatted in a modern way … make the
violet-and-sun palette more visible."

## The standard every block is judged against
1. **Functional** — every button does one thing and it works (no third copy of the same offer; no "Coming Soon" button).
2. **True** — only claims from the claims table (`LOCAL_LIFE_POSITIONING_2026-11-02.md`). Nothing invented, nothing "AI
   tutor", no miracles ("fluent fast", "zero learning curve", "learn anything instantly").
3. **Modern formatting** — sentence case, no emoji inside headings, no "!!!", no "Now LIVE!", no gradient text, no
   blur/pulse animation; eyebrow label → heading → one short paragraph → list or buttons. Same shape as the first screen.
4. **Palette visible** — violet (`primary`) for every primary button and label, sun (`accent`) for one highlight per block,
   cream page, white cards. No pink/green/blue/orange gradients (the 2025 look).

Done once on 4 Nov: first screen (round-4 message) and "About the creator" (QR → portfolio, "Professional outlook (PDF)").

## Block by block — what stays, what is polished, what is the one true cut
| # | Block today | Decision | Surgical change |
|---|---|---|---|
| 1 | "📱 EspaLuz WhatsApp is Now LIVE!" + QR | **Keep, reformat** | Becomes **"Also on WhatsApp and Telegram"**: one line ("The same family memory on the web, WhatsApp and Telegram"), two cards (QR + button each). Blocks 1, 4 and 6 are three copies of this — they become one. |
| 2 | "20 Free Messages / no signup / Subscribe to keep everything forever" | **Keep the facts, drop the second offer** | The first screen already says "14 days free, no card" and "20 messages without an account". This block becomes a short **"How a day looks"** (3 steps from the claims table) — same screen position, same length. The "avatar videos / AI voice generation" promise list goes (not claimable). |
| 3 | "Live Preview / What You'll Experience / Start Demo Now" | **Fold into 2** | Third copy of the demo offer. Its one good line, "No account needed", stays on the first screen's quiet link. |
| 4 | "🚀 Invite your family / Join Telegram Family" + QR | **Fold into 1** | Duplicate Telegram button. |
| 5 | Features: "Emotionally Intelligent / Bilingual Support / Family-Focused / Real-time Chat" + "Live & Ready" badges | **Keep, reword** | Four cards stay; titles become what the thing does: "Spanish and English", "Voice, text and photos", "One family memory", "On the web, WhatsApp and Telegram". No "emotionally intelligent". Badges → palette chips. |
| 6 | "Try EspaLuz Today" — two videos ("Meet Your AI Tutor") + WhatsApp chat demo | **Keep the videos, retitle; fold buttons into 1** | Videos are real product footage; captions lose "AI Tutor" → "See a kids lesson" / "See the WhatsApp chat". |
| 7 | Long emoji description (grocery lists, "cultural adventure", "every conversation creates an avatar video", "20+ countries", "little Sofia", "zero learning curve") | **Keep the structure (6 short sub-blocks), rewrite the words** | Each sub-block → one heading + 3 bullets, sentence case, emoji only as the card icon. Delete only the untrue lines: avatar video per conversation, "zero learning curve", "20+ countries insider knowledge", "profound responses". "Little Sofia" → "your child". |
| 8 | "Why Families Choose EspaLuz" — Maria / Carmen quotes | **The one true cut** | Invented testimonials. Replaced by **"Questions families ask"** (4 Q&As already true on aideazz.xyz/espaluz). Same screen height. |
| 9 | Pricing | **Keep, trim words** | Remove "Merchant ID", the inline "Step 1 / Step 2" PayPal form text, "Russian", "Instant translation magic". "Premium — Coming Soon" stays as a label, **not a button**. |
| 10 | "Our Philosophy — Vibe Coding → AI Consciousness?" | **Keep one line, move to footer** | Written for engineers; a parent reads "AI consciousness" and leaves. One footer line: "Built in Panama by AIdeazz". |
| 11 | "The Birthplace of EspaLuz / Join the Revolution / Invest & Partner" | **Fold into About the creator** | The creator block already links AIdeazz + portfolio. "Invest & Partner" is not a parent's button. |
| 12 | About the creator | **Done 4 Nov** | — |
| 13 | Footer | **Done 4 Nov** (brand line, © 2026, PDF link). Add WhatsApp next to Telegram. | — |

Result: same page, same order, ~10 screens, **4 working calls to action** (Start free · 20 messages · WhatsApp · Telegram)
instead of 11 buttons of which 3 are duplicates and 1 does nothing. Nothing is rebuilt; every block keeps its place.

## Ship order (one block per publish, each previewed on the local build first)
1. Block 8 (quotes → Q&A) + block 9 word trim — the trust fix.
2. Blocks 1+3+4+6 → one channel strip + retitled videos — the duplicate-button fix.
3. Block 2 → "How a day looks"; block 5 reword — the message fix.
4. Block 7 rewrite in modern format; blocks 10+11 fold — the style fix.
5. `index.html` crawler shell → round-4 message (what AI engines read).

## Dashboard (signed-in) — same standard, separate pass
Not touched today. Order when we get there: one source for the stats ("0 lessons" vs "274 lessons"), the web chat
loading the 20 oldest messages, then layer-2 palette (743 hardcoded Tailwind colours). The kids classroom is the
exception: there "divertido" is the point.
