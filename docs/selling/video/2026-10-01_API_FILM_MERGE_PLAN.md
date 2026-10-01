# /api film — ONE film from v13 + v19 (+ the yacht film's screens): PLAN for Elena's approval (1 Oct 2026)

Nothing rendered, nothing spent. Elena: "make 1 out of these two, adding QR code and screenshots from the yacht video; video shots from
both are cool; music from video two" + "**the results of the 34 signals — what it actually checks, what fixes to make — understandable
for a business owner — is the most valuable.**"

## What exists (Oracle, raw — no old text or QR baked in)
- **v13** `~/aideazz-api-film/clips/`: hero (pomegranate 72→100, GOOGLE/CHATGPT), crawlers (GPTBot/ClaudeBot robots in the fruit),
  split, score, **hand** (hand holding the 100/100 card), categories (crystal fruit, the 4 groups), checks, dashboard, form, auditing,
  website, cta, walkthrough recordings. Narration v13: OpenAI onyx.
- **v19** `~/aideazz-api-film-v19/shots/`: dragon, mango, papaya, pineapple, starfruit (8 s each, glass-sphere look) + the real
  Playwright walkthrough (Step 1 open → 2 type URL → 3 Audit my site → one score → engines → 4 categories → all 34 checks).
- **Yacht film**: the woman asking ChatGPT at midnight (G2b), the real ChatGPT answer (names blurred), the real audit recording
  `rec/S3_audit_atuona.mp4` (93/100 + "Top fixes, in priority order"), WhatsApp over the HubSpot deals list, Telegram one-tap send.
- **The 34 checks are real** (`src/visibility-audit.ts`): 28 page checks + 1 per AI crawler × 6 = 34, in 4 weighted groups —
  AI Crawler Access 25 · Structured Data (GEO) 25 · **Answer-Readiness (AEO) 30** · Technical Foundation 20 — and every check carries a
  plain-language "why it matters" line and, when it fails, a fix. The owner-language lines below are paraphrased from those.

## Proposed structure (~90 s, 16:9, same brand system as the yacht film: serif captions, gold italic, split screens with a big QR)
| # | Narration (DRAFT — Elena edits/locks) | Picture |
|---|---|---|
| 1 | Can AI find and cite your business? | v19 fruit opener + the opening title |
| 2 | Google ranked your page. In twenty twenty-six, that is only half the fruit. | v13 pomegranate (GOOGLE / CHATGPT) |
| 3 | Your next customer asks ChatGPT first. It suggests the businesses it can understand — if it can't understand your website, you may not make the list. | yacht film: her at midnight → the real ChatGPT answer (split + QR) |
| 4 | Find out free. Open aideazz dot x-y-z slash a-p-i, type your website, click Audit. | v19 walkthrough steps 1–3 (split + QR) |
| 5 | Seconds later: one score out of a hundred. | v13 hand with the 100/100 card → real score |
| 6 | Behind that score: thirty-four checks, in four groups. | v13 crystal "what it checks" |
| 7 | One — can the AI robots get in? ChatGPT, Claude, Gemini and Perplexity each send their own crawler. Block one, and that assistant never reads you. | v13 crawler robots → real "who can read you" panel |
| 8 | Two — does your site tell AI who you are and what you sell, in the format machines read? | real structured-data checks |
| 9 | Three, the biggest — does your page answer the questions customers actually ask? Questions as headings, facts in lists: that is what gets quoted. | real AEO checks + "Top fixes" |
| 10 | Four — is it fast, secure, and readable without JavaScript? | real technical checks |
| 11 | For every check that fails: what we saw, why it matters, and the exact fix. | real fix list, zoomed (the money shot) |
| 12 | Being found is step one. Our AI Growth Operator answers the guest, drafts your reply, and logs it in your CRM. | yacht film: WhatsApp over HubSpot → Telegram one-tap send |
| 13 | Run yours free. aideazz dot x-y-z slash a-p-i. | v19 starfruit "Run yours free" + split end card, QR 560 px |

## Decisions for Elena
1. **Narration** — approve/edit the 13 lines above (they lock, like the yacht script).
2. **Voice** — same MiniMax "magnetic" male voice as the yacht film (brand consistency, ≈ $0.11), or keep v13/v19's OpenAI onyx?
3. **On-screen language** — English (the /api films are English), or Spanish captions like the yacht film?
4. **Music = v19's "Follow Me" by BerryDeep — ⚠️ Content ID REGISTERED** (Pixabay JSON-LD, checked 1 Oct). Fine on the website, WhatsApp,
   LinkedIn; on YouTube it will draw a copyright claim (clearable with the Pixabay licence). Keep it, or keep it only for non-YouTube use?

## ✅ Elena's decisions (1 Oct) + build
"I approve all your suggestions": narration = the 13 lines above (LOCKED) · voice = the OLD films' (OpenAI tts-1 / onyx / 0.9) ·
Spanish captions in the yacht type · music = NOT v19's (Content ID) → **"Modern Deep House" by ArtIssizm** (Pixabay 602927, 17 Sep 2026,
not Content ID registered, whole-track check: no vocals; drop at ~0:45 lands on "Behind that score: thirty-four checks", offset 13.0 s) ·
text format/style = the yacht film's, not the old one. "Make it fire super juicy."
- VO `scripts/apim-vo.py` (13 lines, $0.017; every take transcribed back — a01 retaken: "find and cite" heard as "insight").
- NEW real recording `scripts/apim-rec-groups.mjs` → Oracle `rec/S4_audit_groups.mp4`: a guided live audit of atuona.xyz (93/A+) that
  glides to and holds on each group — engines, breakdown, top fixes, crawler rows, the FAILING answer-schema row + fix, question-headings
  FAIL + fix, lists FAIL + fix, HTTPS/786 ms, content-without-JS. (The S3 recording only ever reached the crawler rows.)
- Assets `scripts/apim-assets.py` (local) · assembly `scripts/apim-cut.py` (Oracle `~/aigo-promo/apim/cut1/`). v2: push-in on every audit
  screen + gold frame on each failing row and its fix; score shot reframed on the 93 ring; v13 crawler clip's burned-in English cropped.

## v2 delivered (1 Oct) — `~/aigo-promo/apim/cut1/AIGO_API_merged_v2.mp4`, 90.58 s
v1 frame check → fixed in v2: audit text too small for an owner (→ push-in 1.08–1.15 + gold frame on each failing row + its Fix line,
and on "Top fixes"); "one score" showed the input box, not the ring (→ crop moved 236 px down onto the 93); v13 crawler clip had burned-in
English at the foot (→ bottom 13 % cropped); GRUPO 1 label landed on the robots (→ starts with the audit screen).
Verified: picture 90.583 s = voice 90.584 s; QR decodes on the audit split, the crawler shot and the fixes split; −16.9 LUFS; listen —
every word clear, no vocals, clean fade. Spend this film: VO $0.017 (+ Gemini checks ≈ cents); music free.

## v3 (1 Oct) — "iron-clad check": is the old films' explainer data there, understandable for a business owner?
Elena sent 4 frames of the old films (pomegranate title; 72/100 "half the fruit"; "Not five tips. Every check." PASS/FAIL/WARN rows;
"What it checks" four categories with what each covers). Check against v2: title ✅ (Spanish) · pomegranate ✅ · four groups ⚠ names +
points only, NOT what each covers · every-check/fix ⚠ real rows highlighted but the fix text is small English. → v3 (text layer only, $0):
group labels now say what each group checks (robots.txt · llms.txt · sitemap / schema · identity · Open Graph / question titles · lists /
HTTPS · speed · mobile · no-JS — from `src/visibility-audit.ts`); a plain-Spanish **FALTA / ARREGLO** card under each failing atuona.xyz
row (answer-rich schema, question headings, lists); scoreboard "31 de 34 señales aprobadas · 3 por corregir" on the fixes screen (the
page's own "All 34 checks (31 passed)"). `cut1/AIGO_API_merged_v3.mp4`, 90.58 s.
