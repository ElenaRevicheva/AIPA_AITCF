# EspaLuz voices with no daily top-ups (10 Nov 2026)

Elena: "I will never have enough money to top up every day." So the voice plan is built to run at $0 and to stay honest.

## The numbers (measured, Supabase `learning_sessions`, 28 Oct – 10 Nov)
- 460 classroom turns in 14 days (one family), **438 characters per turn on average** (both languages are spoken).
- Azure Speech F0 = 500,000 free characters a month ≈ **1,140 classroom turns a month**. F0 cannot bill: over the quota it refuses (429).
- Free Gemini voices: about 30 lines a day in total, for everyone.

## The plan (live since ascent `8f413fa`)
1. **Azure F0 is the heroes' voice.** Pere and Titi each keep one voice all day (Elena chose them by ear on 8 Nov).
2. Gemini free voices behind it, then the paid OpenAI voice if its key still has credit, then the phone's own voice (free, unlimited).
3. **Replicate (the original MiniMax voices) comes back only when the product pays for it** - e.g. when the first subscription is paid.
   It is never a daily top-up from Elena's pocket.

## Two dates to watch
- **Azure account is a 30-day trial until ~7 Dec 2026.** Without upgrading the account to pay-as-you-go, Azure turns off and the heroes
  fall to Gemini (30 lines/day) and the phone voice. Upgrading attaches a card, but the F0 resource itself cannot bill.
  **Elena's decision only**; never click Upgrade for her. The closed test (about 10-24 Nov) ends before the trial does.
- If 12 testers are very active, 1,140 turns a month can run out before the month ends; then step 2 answers. Watch `voice spoken by` in the logs.

## Optional, free, not built
Cache audio of lines that repeat word for word (energy breaks, syllable lines, the judge question) in Supabase Storage, so the free
quota is spent on each such line once. Only if the logs show Azure running out.

## What testers are told (honest without sounding weak)
Honesty means **no claim the app does not keep**. It does not mean talking about money. The store listing makes no claim about
the heroes' voices (checked 10 Nov), so nothing there must change for voices.

Welcome post for the "EspaLuz testers" group / second message after someone joins:

> **What to expect during the test.** Pere and Titi speak with standard synthetic voices, and an answer can take a few seconds.
> Your family's feedback goes straight to the person who builds EspaLuz and is fixed in days, not months: tell us anything that
> feels slow, unclear or wrong, and what your child enjoyed.

> **Qué esperar durante la prueba.** Pere y Titi hablan con voces sintéticas estándar, y una respuesta puede tardar unos segundos.
> Lo que nos cuente tu familia llega directo a quien construye EspaLuz y se corrige en días, no en meses: cuéntanos lo que se sienta
> lento, poco claro o incorrecto, y lo que más disfrutó tu peque.

Never say: "the heroes' own voices", "instant replies", "we are a small team with no budget".

## To check before the listing goes public
The listing says "subscribers can receive short video replies from her avatar". Video generation spends paid credits. Confirm it
works for a subscriber today, or soften the line, before production. (Not checked in this session.)
