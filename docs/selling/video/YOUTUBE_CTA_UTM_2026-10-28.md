# YouTube films — CTA block with UTM + WhatsApp (live 28 Oct 2026)

**Why:** Ahrefs Web Analytics showed 21,936 YouTube visitors in 30 days landing on `/api` with no campaign tag,
81.5% bounce, 46 outbound clicks, zero inquiries. The 30 Sep brief required UTM links; the 1 Oct upload sheet shipped bare links.
Findings: `docs/aideazz/AHREFS_FINDINGS_2026-10-28.md`.

**What was done (YouTube Studio, Elena's Chrome, each edit verified after a page reload):** the block below was inserted at the
TOP of the description of the 7 videos that hold the views. Original descriptions were kept unchanged underneath.

| Video | ID | Views (28 Oct) | utm_campaign | utm_content |
|---|---|---|---|---|
| She Asked ChatGPT Before She Booked Your Island (Villas & Charters) | `Tg9N0PprsaI` | 98,398 | `aigo-villas` | — |
| They Asked ChatGPT Before They Messaged Your Clinic (Dental & Plastic Surgery) | `e0rMKnH-noI` | 95,725 | `aigo-clinic` | — |
| Can AI Find and Cite Your Business? The 34 Signals | `l9Ubxqy7zDA` | 66,153 | `aigo-api-audit` | — |
| They Asked ChatGPT Before They Messaged You (Real Estate & Immigration Law) | `y1ZhWyqJW0w` | 59,736 | `aigo-relocation` | — |
| She Asked ChatGPT Before She Messaged Your Yacht (3 Oct upload) | `RsKJX3SKgiw` | 58,593 | `aigo-yacht` | `oct3` |
| She Asked ChatGPT Before She Messaged Your Yacht (1 Oct premiere) | `kUrKw61Uo4Q` | 49,294 | `aigo-yacht` | `oct1` |
| Early API-audit explainer, 11 Sep (was titled "September 11, 2026", empty description) | `93teP5dBRgI` | 42,044 | `aigo-api-audit` | `sep11` |

The 11 Sep video also received a title: `Can AI Find and Cite You? Free AI Visibility Audit, 34 Signals | AIdeazz AI Lab`
and a short EN/ES description (facts taken from the existing API film description: 34 signals, 4 groups, free, no signup).

## The block (Spanish first — 94% of the viewers were in Panama and Nicaragua)

```
▶ WhatsApp (ES/EN): https://wa.me/50761666716?text=Hola%20Elena%2C%20vi%20el%20video%20de%20<film>%20en%20YouTube
▶ Diagnóstico AI Growth Operator, $100 (resultados por escrito + llamada de 45 min): https://aideazz.xyz/pay/analisis-tecnico?utm_source=youtube&utm_medium=video&utm_campaign=<campaign>
▶ Auditoría gratis de visibilidad en IA / Free AI visibility audit: https://aideazz.xyz/api?utm_source=youtube&utm_medium=video&utm_campaign=<campaign>
```

`<film>` in the WhatsApp prefill: `villas` · `cl%C3%ADnicas` · `la%20auditor%C3%ADa` · `reubicaci%C3%B3n` · `del%20yate`
(so a WhatsApp message tells Elena which film it came from, with no tracking needed).

## How to read the result
- Ahrefs Web Analytics → Traffic sources → **Campaigns**: `aigo-*` rows = clicks per film. GA4 → Acquisition → campaign, same names.
- HubSpot: a `[CLIENT-SERVICE-PAID]` deal = a paid diagnostic; a WhatsApp opening with "vi el video de …" = a film lead.
- Scoreboard is outcomes only: inquiries, paid diagnostics, interview invites. Not views, not Health Score.

## Daily Make re-upload (scenario 6263197)
Since 3 Oct it re-uploaded the same 4 films every day (≈25 copies, 0–16 views each) and the channel now carries a
**Community Guidelines warning**. Elena's go (28 Oct): switch it off. State recorded in the session log / NOW.md.
