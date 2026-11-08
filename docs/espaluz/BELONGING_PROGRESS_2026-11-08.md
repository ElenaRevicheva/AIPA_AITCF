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

## Update 8 Nov 2026 (later): the 20 other packs are written - data only, not wired

All 20 non-Panama packs exist, in the same JSON shape as `panama.json`, and are pushed to `main` in all three repos:
`ascent-saas-builder/supabase/functions/_shared/belonging/` (last commit `ec288f8`), `EspaLuzWhatsApp/belonging/`
(`18e32fe`), `EspaLuzFamilybot/belonging/` (`c17a8b2`). The copies are byte-identical (same md5 in all three).

**Nothing reads them yet.** `belongingBlock()` and both bots' `belonging_block()` still load `panama` only. Picking the
pack by the family's country is a separate step that needs Elena's go. No code, prompt or deploy was changed.

How they were checked: a script refused any pack where a cited source id is missing, a "checked" item cites nothing, or
a listed source is never used. An item is "checked" only when a source we actually read says it; anything we could not
find a source for is "unverified" (the prompts never state those as fact). Dates that move each year are given as a
month plus "confirm this year's calendar". Cuba, Nicaragua and Venezuela carry an extra rule: stay out of politics.

| Country | Checked | Unverified | Sources | Notable |
|---|---|---|---|---|
| Mexico | 58 | 4 | 12 | Old file: "Mexicans are formal, use titles" - no source supports it. Lunch "2-4 pm" kept as unverified. |
| Colombia | 45 | 7 | 11 | Old file teaches "marica: dude" - it can be an insult; not carried over. Calendar A/B schools explained. |
| Argentina | 37 | 6 | 11 | Old file: "afanar = to steal / to work hard" - the second meaning was not found in any source; not carried over. |
| Spain | 40 | 5 | 12 | Old file: "siesta: shops close 2-5 PM". The source says the long midday close is to eat, not to sleep. |
| Peru | 31 | 7 | 13 | Old file states "hora peruana - expect lateness" as fact; the source shows it is a joke Peruvians make about social plans, not about work or school. |
| Chile | 36 | 3 | 10 | Old file: "society can be quite stratified" - a stereotype with no source; not carried over. |
| Ecuador | 25 | 7 | 11 | Two school calendars (Sierra from September, Costa from May). Greetings stayed unverified - no solid source found. |
| Guatemala | 25 | 8 | 13 | School year ends in October. Old file teaches "canche: blonde person" - a looks label; not carried over. |
| Costa Rica | 38 | 3 | 10 | School calendar changes in 2027 (1 March - 30 November). |
| Cuba | 22 | 6 | 10 | Daily conditions (power cuts, school hours) changed in 2026; the pack says to check what applies now. |
| Bolivia | 25 | 5 | 10 | Old file teaches "cholita" as an ethnic label; not carried over. Winter break now set per department. |
| Dominican Republic | 30 | 3 | 11 | Still defined twice in the old file (known). |
| Honduras | 31 | 3 | 10 | School year February-November; Semana Morazánica in October. |
| Paraguay | 20 | 7 | 11 | Thin: few sources on daily customs. Old file: "only truly bilingual country in Latin America" - no source; not carried over. |
| Nicaragua | 27 | 2 | 6 | Old file teaches "chele: white person/foreigner" - a skin-colour label; not carried over. |
| El Salvador | 22 | 5 | 8 | Old file's "Bitcoin legal tender (2021)" is likely out of date - not checked, not carried over. |
| Uruguay | 22 | 5 | 10 | Holy Week is officially "Tourism Week" and 25 December is "Family Day". |
| Puerto Rico | 23 | 5 | 8 | US federal holidays apply on top of the Puerto Rican ones. |
| Venezuela | 26 | 4 | 8 | Old file teaches "marico: dude"; the pack warns not to copy it at school or work. |
| Equatorial Guinea | 14 | 5 | 6 | Thinnest pack: little written about daily life. It says so and points families to neighbours, the parish and the school. |
| **Total (20)** | **597** | **100** | **201** | Panama (50 / 6 / 22) unchanged. |

Next (Elena's call): wire country selection into the three prompts (twins), then fill the thin packs (Equatorial
Guinea, Paraguay, El Salvador, Cuba) once families from those countries arrive.
