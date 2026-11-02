# EspaLuz — the 1.5-year journey from its own docs, and what to reuse (2 Nov 2026)

Source: every doc in `EspaLuzWhatsApp/docs` (61 files + the 21 Sep 2025 backup's docs) and `EspaLuzFamilybot/docs`
(8 files), read in full by four readers, with features spot-checked in code. Numbers are "stated in docs" unless
marked verified. Related: `LOCAL_LIFE_POSITIONING_2026-11-02.md`, `TRACTION_PLAN_2026-11-02.md`.

## The journey
| When | What happened |
|---|---|
| Sep 2025 (Railway, Twilio) | WhatsApp "AI Spanish tutor for expats and travelers", $7.77/mo. Pitch family was fictional (Mexicans moving to Austin, TX). 8 free users who came via **QR codes and shared links** moved to paid; one power user (123 messages). Gumroad, then PayPal (IPN fix, email linking, cancel-exploit closed). **Conversation Mode** (two people speak through the bot, each turn translated, summary at the end) built. |
| Sep–Oct 2025 | PayPangea crypto checkout (USDT): one successful self-test on 3 Oct, webhooks never arrived; founder + developer were generous (met via the DAIAA community). Elena's own prepaid idea: **$7 / $20 / $40 / $80 for 1 / 3 / 6 / 12 months**. 8 Oct: Gumroad suspended her account. |
| Jan 2026 | Move to Oracle; one Postgres for both bots; emotional brain; **21 country contexts**; Panama pilot plan with advisor Guille (*"don't sell the vision — offer a free pilot, measure retention"*); `/org` partner codes for Panama groups/schools; roadmap phases 4–6 (proactive assistant, relocation assistant, local English) left pending. ~15 users. |
| Jun 2026 | PágueloFácil $11 / 30 days live (first real payment 28 Jun, order + fix recorded); hard access gate + reminders; memory layers survive restarts. 19 users, 344 chat rows. |
| Aug 2026 | 10 chamber/school pilot emails (AmCham, BritCham, AHK, CCIAP, 5 schools) sent 1–3 Aug, no replies, dropped (HubSpot `[ESPALUZ-ORG]`). RAG silently off until 14 Aug. Docs corrected for honesty. |
| Oct–Nov 2026 | Web app + kids classroom (Pere & Titi, tracing, voices), one payment truth, first-contact leak fixed, `/espaluz` + 21 country pages, premium lifestyle line. |

## Built (or nearly) but never switched on — the reuse list
Each item exists in code today; the gap is wiring, not invention.
1. **Life-event check-ins (belonging).** WhatsApp detects a doctor visit, interview, move, new school or trip and
   SAVES a follow-up (`espaluz_advanced_features.py:486-618`, table `user_followups`); the texts are written
   ("How did your doctor appointment go? / ¿Cómo te fue en la cita médica?"). The senders are imported
   (`espaluz_bridge.py:67`) and never called. The 10-minute reminder loop (`bridge:6152`) already respects
   WhatsApp's 24-hour rule — the same loop can send them.
2. **Partner codes that grant nothing.** Telegram `/org` (`main.py:4962`) has codes for Metropolitan School,
   InterNations Panama, Panamigos, I Go Panama, AIP and Brader parents (`espaluz_emotional_brain.py:815-860`), tells the
   family "You now have extended access!" and never calls `start_trial(user_id, org_code)`
   (`espaluz_paypal_system.py:440`, 60 days). A trust bug — and the partner/QR channel, half-built. WhatsApp has no `/org`.
3. **Family context unused on WhatsApp.** `build_enhanced_context` feeds family names, country, relocation into every
   Telegram reply (`main.py:1885`); WhatsApp imports it and never calls it, though it writes `family_members`.
4. **Testimonials and referrals.** `/feedback` asks, `add_testimonial` never stores; `track_referral` has no caller.
5. **Weekly family recap.** Vocabulary, weekly emotion trend, family members and memories are all stored; nothing
   composes "your family this week". Conversation Mode's end summary is thrown away (`whatsapp_conversation_mode.py:171`).
6. **Words saved, never reviewed.** `get_words_for_review` defined in both bots, no caller.
7. **Prepaid season passes.** PágueloFácil already takes a per-payment number of days (`espaluz_paguelofacil.py:424`),
   so 3/6/12-month passes are a price table, not a build.
8. **Ready assets:** Panama partner pitch templates (relocation/immigration firms, PTA email, Spanish-school white
   label) and an org-code table; `/demo` + `/scenarios` workshop mode; the González family stories (move them to
   Panama, drop the "15x"/GPT-5 claims); grandparent tone and "breakthrough" milestones; "early supporter" wording;
   the conversation-mode video loops (on disk, not in git).
9. **Designed, not built:** `relocation_milestones` (visa, housing, school, bank — status and dates) and
   `scheduled_messages` (tips, holidays). The premium "first months in Panama" feature, but new work, not wiring.

## What the docs teach about distribution (do not repeat the failures)
- The only channel that ever brought users was **QR codes and shared links** — people passing it on.
- Cold partner email to chambers and schools (Aug 2026): 0 replies. Partners are not a reliable channel on their own;
  a partner code is useful only as the *tracking + gift mechanism* when a family or partner already passes it on.
- Free distribution that needs no community time: answer engines (the 21 country pages), and the product sharing
  itself (referral link, shareable milestones, weekly recap a parent forwards to family abroad).

## Cleanups found
- `EspaLuzFamilybot` is a **PUBLIC** repo; `docs/SWOT_ANALYSIS_ESPALUZ.md` contains a server IP and a Telegram user id.
- `EspaLuzWhatsApp` (private) archive holds PayPangea API keys and a PIN in plain text, and the Sep 2025 tarball holds
  subscriber files and a WhatsApp Web session. Keys should be revoked; nothing deleted without Elena's OK.
- Some deployment docs recommend `git push --force` / `git reset --hard` — against the repo rules; read as history only.
- The planned investor dashboard code contains hardcoded fake retention/revenue — never publish it.
