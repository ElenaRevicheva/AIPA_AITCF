# Atlas lanes: what it works each week (19 Oct 2026)

Sources:
- the code: `scripts/atlas-lead-machine.cjs` (lanes, `ICP_BY_LANE`, `LANE_OFFER`, `LANE_TAG`) and `scripts/hs-outcomes-to-atlas.cjs`
- whitespace on Oracle: `~/whitespace/data/concepts.json` (weekly scores) and `data/tracked-verticals.json`
- the AI Growth Operator PDF, slide 5 (buying pattern + 4 strong-fit industries)
- the portfolio (6 services)

## 1. How a week is chosen

| Step | What happens |
|---|---|
| Mon 14:00 UTC | whitespace captures competitor ads and scores every tracked lane (`concepts.json`) |
| Mon 15:15 / 15:30 UTC | campaign alert, then HubSpot outcomes are sent back to whitespace per lane (deal-name keywords) |
| **Mon 16:00 UTC** | **Since 19 Oct (`e71ca5a5`): GEO/AEO every week.** The lead machine works **GEO/AEO first with up to 4** of the 8 slots, then the **top-scoring other lane** fills to 8, then GEO refills if still short. With no other lane, a single GEO leg. `LEAD_LANE=` still forces one lane; `ATLAS_PRIMARY_LANE=''` (process env) restores the old top-score-only pick. Each lane's queries run fresh, then high-ticket, then the local tail. Then up to **2 no-website** businesses. **Max 10.** |
| Since 19 Oct | If the lane leaves the 2 no-website slots short, up to 2 dental Places searches fill them (`ATLAS_NOWEB_QUERIES`). A company already in HubSpot by phone is skipped |

**A score measures how hard competitors ADVERTISE, not whether Elena can reach a buyer.** That is why some hot lanes are
deliberately not prospected (§4).

## 2. This week's scores (concepts.json, 19 Oct) and who works them

| Lane | Score | Lead machine works it? |
|---|---|---|
| ai_reliability_and_rescue | **73** | No, on purpose (§4) |
| ai_film_making_studios | 67 | No: a competitor-studio landscape lane; video outcomes now map to `ai_video_generation` |
| expat_language | 54 | No: EspaLuz, B2C |
| medicare_advantage_enrollment | 47 | No: an Atlas client vertical, not Elena's service |
| **ai_automation** | **39** | **Yes: this week's lane** (offshore company formation, residency by investment) |
| **ai_video_generation** | **35** | **Yes, since 19 Oct (new lane)** |
| **whatsapp_ai_agents** | **34** | **Yes** |
| auto_insurance | 33 | No: an Atlas client vertical |
| ai_marketing_studios | 32 | No: competitor landscape |
| fractional_cto | 20 | No, on purpose: 242 signals, zero contact emails (Aug 2) |
| **geo_aeo_tech_seo_makers** | **13** | **Yes**, but it loses the weekly pick to every higher-scoring lane (§5) |
| debt_finance | 6 | No: an Atlas client vertical |
| ai_augmented_product_building | 0 | No: competitor landscape |

## 3. Matrix: portfolio services × AIGO strong-fit industries (after 19 Oct)

Buying pattern (PDF slide 5): sale > ~$2,000 · leads start online, a person closes · WhatsApp/phone in the sale ·
international/English clients · margins for a managed system · no in-house AI team.
**Not a fit:** big enterprises with marketing teams, restaurants and cafés, gyms and salons, e-commerce, low-ticket
local services.

| Service \ industry | Medical tourism | Immigration & relocation | Dental implants & cosmetic | Luxury charters & hospitality |
|---|---|---|---|---|
| **WhatsApp AI agents** | plastic surgery MDE, medical tourism CUN | **+ immigration and relocation services PTY** (new) | dental implants PTY, dental tourism SJO | yacht charter PTY + 5 fresh hospitality niches |
| **AI automation** | medical tourism agency MDE, fertility CUN | relocation, immigration law, visa SJO, residency, offshore formation, moving | **+ dental implants center SJO** (new) | vacation rental management TAM, pre-construction condo |
| **AI visibility (GEO/AEO/tech SEO)** | bariatric SJO | **+ residency and immigration lawyer SJO** (new) | cosmetic dentistry veneers PTY (+ clínica dental tail) | luxury real estate, yacht charter, event venue, villa concierge, villa rental, private yacht, boutique resort |
| **AI video generation** (new lane) | plastic surgery clinic SJO | real estate developer for expats PTY | cosmetic dentistry smile makeover PTY | luxury yacht charter CTG, boutique hotel CTG |
| **No-website slots** (any lane) | — | — | dental implants + clínica dental PTY (top-up) | — |

Offers per lane (`LANE_OFFER`, Spanish): agente de WhatsApp · automatización con IA · visibilidad en IA ·
**video promocional con IA** (new). Deal tags, so outcomes reach the right lane: WhatsApp agent · automation · GEO/AEO fix ·
**AI promo video** (new).

## 4. Not prospected on purpose

| Portfolio service | Why it has no lead lane |
|---|---|
| **AI reliability & rescue** (score 73) | The buyer is a business that already runs AI, which is not the AIGO buying pattern ("no in-house AI team"). No contactable ICP has been measured, the same lesson as fractional_cto. It stays scored in whitespace. Since 19 Oct, a "reliability/rescue" deal is credited to its own lane instead of GEO |
| **Companion-grade personal AI** | B2C (EspaLuz, `expat_language` 54): sold to people, not prospected as businesses |
| Fractional CTO | 242 signals, zero emails (2 Aug audit) |

## 5. Decided: GEO/AEO is worked every week (Elena, 19 Oct)

Before, the picker took the top score only, so GEO/AEO (score 13) was never worked. Now GEO/AEO is the primary leg every week.

Two adversarial review rounds hardened it (32 + 19 agents, offline simulation of 6 scenarios):
- the refill resumes by identity, not by position;
- a search shared between lanes is paid for once;
- a quota-cut search's tail is carried to the refill and measured once;
- config typos fall back safely.

Real-lane dry run on Oracle (max 4): GEO staged 2 (luxury real estate, Guanacaste), then ai_automation staged 2 and skipped 8 already in the CRM.

**Still true:** GEO's whitespace *score* stays low, because its Meta search phrase returns no ads. Fixing the phrase is a whitespace change; see the private audit `aideazz-private-docs/docs/whitespace-atlas/`.

## 6. Verified on 19 Oct (dry runs, nothing written)

| Check | Result |
|---|---|
| Dental top-up | 2 Places searches, 5 no-website seen, 3 eligible. **Dr. Enzo Cano skipped (same phone as his 13 Oct pilot deal; the name fingerprint had missed it).** 2 would-stage |
| Forced video lane (`LEAD_LANE=ai_video_generation`, max 2) | 1 Places search → 16 businesses → 2 would-stage, 1 skipped as already in the CRM |
| Outcome mapping | 6 deal-name shapes map to the right lane |
| Deploy | Oracle md5 = `main` for both scripts. Backups in `~/_session-backups/atlas-noweb-topup-20261019/` and `~/_session-backups/atlas-lanes-20261019/` |

Commits: `613add26` (dental top-up) · `26e5355f` (phone duplicate guard) · `0336fb2b` (lane matrix) · `e71ca5a5` (GEO/AEO every week). Backup: `~/_session-backups/atlas-geo-primary-20261019/`.
