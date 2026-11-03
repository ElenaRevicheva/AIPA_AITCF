# EspaLuz launch — what to CONNECT before promotion (3 Nov 2026)

One page that merges five read-only audits done 3 Nov. Every item exists in code today; the work is wiring, not
building (Golden Rule 6b). Detail + file:line: `DORMANT_FEATURES_WEB_…`, `…_WHATSAPP_…`, `…_TELEGRAM_…`,
`PROMOTION_MACHINE_AUDIT_…`, `MARKET_SCAN_ADULTS_FAMILIES_2026-11-03.md`. **Nothing below is done yet — each waits
on Elena's OK (Teach → Plan → Confirm → Build).**

## Wave 1 — honesty + broken doors (before ANY promotion; small, low risk)
| # | Where | Fix | Why it matters for launch |
|---|---|---|---|
| 1 | Web | Remove "you both get 1 month free" (`ReferralSystem.tsx:155,273`) | a promise nothing honours — same fix the bots got 2 Nov |
| 2 | Web | Lesson Start → 404: `LearningModules.tsx:82` → `/learning/${id}` | 12 built lessons reappear |
| 3 | Web | og:image / twitter = EspaLuz, not Lovable (`index.html:19,22-23`) | every shared link becomes a branded preview |
| 4 | WhatsApp | Translation + emotion onto `llm_chain` (`bridge:1847, :2008`) | every voice turn depends on retired model names |
| 5 | WhatsApp | Preference parser swallows normal messages (`advanced_features:600`) | a parent's question gets "✅ Got it!" |
| 6 | Telegram | `/menu` `_`→space breaks `/help_*` links (`main.py:5351`); `/review`, `/culture` advertised without handlers | menu promises what does not exist |
| 7 | Telegram | Remove TEMP DEBUG dump of subscribers.json to the log (`main.py:6997-7002`) | customer emails in logs on every restart |
| 8 | Supabase | REVOKE anon EXECUTE on `copy_avatar_file`, `force_copy_avatar_content`, `get_user_subscription_status` | anyone can read another user's status |

## Wave 2 — the relocation promise made true (content already written)
- Telegram `/help_immigration`, `/help_housing` (`REAL_LIFE_SITUATIONS`) + `/culture` (`get_country_scenarios`: Migración, visas, hospitals, schools) + add the hidden commands to the BotFather menu.
- WhatsApp: honour saved learning preferences; offer "family setup" once; `org CODE` partner days.

## Wave 3 — retention loop competitors win with (market scan §B)
- Save WhatsApp words (port Telegram's 5-line block) → spaced-repetition review on both bots (`get_words_for_review` exists, 0 callers).
- Web streak: `trackProgress` → deployed `track-learning-progress`; bots can send a daily "Day N 🔥 one phrase" from the existing 10-min loops.
- Record referral sign-ups (rpc + 1 call in `Auth.tsx`); day-7 / day-30 feedback prompts from `payment_reminder_loop`.
- PWA manifest from existing icons (home-screen install).

## Wave 4 — the promotion engine (Make, after testing ends; < 400 credits/mo ≈ 4% of plan)
1. Daily Pere & Titi Reel/Short: stitch the 27 unused hero clips + Gemini voices (laptop render) → queue on Oracle → one cron line fires the EXISTING 6869112 (FB + YT Shorts + IG Reels). ~150 credits/mo.
2. EspaLuz on the Facebook Page daily with country-card content via 6868765 (today: 1 day in 3, 6 images). ~90/mo.
3. Pinterest (native Make module; Elena's one OAuth click) for the 21 country pages. ~60/mo.
4. Re-post existing videos on rotation (keep queued files past 3 days). ~15/mo.
5. Switch off idle 6505010 + 6518503; stop routing EspaLuz photos to LinkedIn; consider an EspaLuz-only YouTube channel.

**Channel truth:** Facebook/Instagram/YouTube are right only as **short video** (Reels/Shorts reach strangers; photos on a
zero-follower Page do not). TikTok not reachable (Buffer free, no Make module). Facebook Groups = where families are,
not automatable. Content formats that work (market scan §D): mascot skits, situational phrases ("what to say at the
farmacia in Panama"), slang-of-the-day "same word, 3 countries", both directions ES↔EN.

**Positioning:** WhatsApp alone is no longer a moat (Memrise MemBot free, Causa). The edge is the combination: life in
the country × kids both ways × interpreter × family chat + parent report × follow-ups. $11 = AI tier for the whole family.
