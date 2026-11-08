# EspaLuz progress = belonging, not errands (8 Nov 2026)

Elena: "Banks, Migración, shops - they end, you adapt, and ChatGPT can answer them. What never ends is your life on life's
terms in a new language: the mentality, the culture, the customs, the rhythm of life. You need to start belonging. Fill
each of the 21 countries we declare with true practicalities, true experiences, customs, traditions, local psychology,
rhythm of life." Status: findings + proposal. Nothing built. Pairs with `DASHBOARD_EVERY_BLOCK_2026-11-08.md`.

## What exists today (measured)
- `EspaLuzWhatsApp/espaluz_country_contexts_full.py` (Jan 2026, 1,354 lines): 21 countries. **Panama 133 lines; every other
  country 24-73.** Almost all of it is errands (banking, immigration, healthcare, schools, transport, shopping, housing)
  plus slang and food. Words about culture / customs / holidays / rhythm / family / etiquette: **1-5 per country.**
- Dominican Republic is defined **twice** in the dict (the second silently replaces the first).
- Only WhatsApp's practical-help module imports it. The web chat's rules mention "your country information" but the web
  loads none; Telegram has an older `espaluz_country_contexts.py`.
- Never fact-checked. Some lines need care (hospital and school lists can go stale; a few slang entries are ethnic labels
  that should not be taught casually).
- Public claim (`public/llms.txt`): "the local words and customs of 21 countries". **Customs are not there yet.**

## The idea: progress you keep, measured from real life
Errands are finite; belonging is not. So progress has two layers:

| Layer | What it shows | Where the truth comes from |
|---|---|---|
| **Belonging (lasts)** | Local words you now use yourself; customs and holidays you have lived here; people in your new life (teacher, neighbour, friends); the rhythm you live by | Your own messages (a local expression from the country pack appears in what YOU wrote), the family notebook (dated moments, names), the country calendar |
| **Errands (end)** | School, doctor, Migración, bank, housing - ticked once handled, then they quietly step back | A fixed word list matched in your conversations; only the situation name is shown, never your words |

Rules: deterministic matching (no model judging your progress), only the label is shown, every user starts empty and the
empty list is the map of what EspaLuz can help with next.

## The content work: a belonging pack per country
Same shape for all 21, reusing the existing file as the skeleton (vocabulary, food stay):
rhythm of the day and week · how people greet, address and keep time · family and children customs · holidays and the
calendar of the year · what is polite / rude · how to make friends and neighbours · local expressions people really use ·
what newcomers usually find hard emotionally.
Every line sourced and checked before it is used or claimed - "claim only what is proven".

## Order proposed (each needs Elena's go)
1. **Panama belonging pack** first (where our families are), checked; fix the Dominican Republic duplicate.
2. **Belonging progress** on the dashboard from real records (local words used, holidays lived, people) + errands layer.
3. One shared pack for web + WhatsApp + Telegram (today only WhatsApp reads the file).
4. Other countries one by one, as families from them arrive - and until a country is filled, do not claim its customs.
