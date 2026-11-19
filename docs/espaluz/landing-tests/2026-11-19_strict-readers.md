# Strict readers - landing + dashboard, all five Table 2 families (19 Nov 2026)

Elena: "very strict, very detail-oriented, all categories, landing and dashboard - ironclad that only crucial stuff needs
to be changed; I cannot dig into each little detail."

**Method.** LOCAL build of ascent main (= the next Lovable Publish) against the live backend, phone width; landing EN/ES/RU
+ dashboards of 3 test families (Jennifer EN expat, Carlos ES settling, Marina RU). 5 readers = Table 2 (Jennifer, Lukas &
Bia, Carlos, Valentina, Marina), each also a senior product reviewer; crucial/major only, max 3, evidence required.
20 passes (`scratchpad strict-readers.cjs`, free-first waterfall). **Every reported defect was then checked by hand
against the screens and the code** - most were not real.

## Rejected (not defects - checked)
| Reported | Why it is not real |
|---|---|
| "© 2026 is a future year" (3 readers) | it is 2026 |
| "Trial says 14 days left but I am on day 5" (5 readers) | "day 5" was in the readers' brief; the test families were created today |
| "Payment form shows no price / card split in two" (4 readers) | the form sits inside the "EspaLuz Family $11/month · Cancel any time" card; the page was cut into columns for the readers |
| "Paragraph cut mid-sentence", "two columns blank" (4 readers) | the column cutting of long pages |
| "Parent profile is named 'Parent'", "no child" | test data |
| "3 of 4 ✓ contradicts 3 ticks" | 3 of 4 is right |
| "Country lessons missing although the country is set" | the test families had no country set |

## Real and FIXED today (ascent, waits on Publish)
1. **A settling family (native Spanish speaker) with no country yet saw BEGINNER Spanish lessons** (Carlos, Valentina:
   "forces beginner Spanish on a native speaker" - Table 2 "must not happen"). Realistic: `settle` typed on WhatsApp
   before the questionnaire. Now a settling family never gets that list; with no country the existing line asks where
   home is. (`LearningModules.tsx` settleList)
2. **Header badge in English on Spanish/Russian dashboards** ("14 days trial", "Standard", "Free" hard-coded) -> translated.
3. **"(or Мишка & Лиса)" in Cyrillic on the English and Spanish weekly plan** (2 readers) -> Russian plan only; the new
   landing plan pictures recaptured from the fixed build.

## Real, NOT fixed - Elena's call (product decisions, not small fixes)
1. **The landing sells to Spanish learners; native Spanish speakers do not see themselves** (Carlos trust 2-3, Valentina
   trust 3-4, both "would not pay"). Hero has one line ("¿Ya hablas español? ..."), but the steps, examples and plan card
   show English -> Spanish. Table 1 category 3 needs its own visible path (e.g. a "Ya hablo español" switch on the landing
   that swaps the examples to the English track).
2. **Russian families: the rehearsal gives English translations, not Russian** (Marina: "6 short questions in Spanish,
   under each the English translation"). Table 2 Marina "must not happen: explanations only in English". Same open item
   as 18 Nov "meanings in the family's own language".
Smaller, noted only: web pays by PayPal only (bots also take PagueloFacil); "Premium - Coming soon" card lists the same 7
features as the $11 plan.

## What the readers valued (unprompted)
WhatsApp help with school messages (Jennifer, nomads, Marina), the 10-minute kids' class (all), the weekly plan, one memory
across channels. Would pay: Jennifer yes, nomads yes, Marina yes (landing) / no (dashboard, Russian), Carlos no, Valentina no.
