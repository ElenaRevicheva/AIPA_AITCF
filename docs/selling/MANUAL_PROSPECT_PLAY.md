# The Manual Prospect Play — audit → deal → one-click WhatsApp send

> Born July 18 2026, the day the first [CLIENT-MANUAL] outreach was SENT
> (Alquiler de Yates Panamá). This is the repeatable ~3-minute play that turns
> "I know a potential client's website" into a staged deal with a ready-to-send
> WhatsApp message. Canonical rules also live in Claude memory
> (`feedback_outreach_draft_rules.md`); this file is the repo source of truth.

## The play, end to end

1. **Audit the prospect** with our own Visibility API (free, no keys):
   ```bash
   curl -s -X POST https://webhook.aideazz.xyz/cto/v1/visibility \
     -H "Content-Type: application/json" -H "X-API-Key: aidz_demo_visibility_2026" \
     -d '{"url":"https://PROSPECT.com"}'
   ```
   The score + weakest category becomes the outreach hook. Angles by profile:
   - Low GEO (e.g. 56) → "invisible as a citable answer; missing structured data"
   - Low AEO, high rest (e.g. 86/A) → "ustedes están muy cerca — 3 arreglos"
   - JS-shell / bot-blocked → "most AI crawlers see an EMPTY page" (strongest)

2. **Extract contacts from their site** (WhatsApp number is gold in Panama):
   `curl -sL https://PROSPECT.com | grep -ioE "(wa\.me/[0-9]+|api\.whatsapp\.com/send[^\"']*|tel:[+0-9]+|mailto:[^\"']+|\+507[- ]?[0-9]{3,4}[- ]?[0-9]{4})"`

3. **Dedupe** in HubSpot (search deals/companies for the domain), then create
   via the HubSpot connector — all FIVE, every time (Starter plan features on max):
   - **Company** — name, domain, phone, city, email in description
   - **Deal** — `[CLIENT-MANUAL] {Company} — GEO/AEO fix (audit: {score}/{grade})`,
     Sales Pipeline, stage **qualifiedtobuy** ("🔥 I Act TODAY")
   - **Contact** — associated to BOTH the company and the deal. Even a
     placeholder (firstname = business name, lastname = "(WhatsApp contact)" /
     "(Instagram: @handle)", phone/email if known, `lifecyclestage: opportunity`,
     `hs_lead_status: OPEN`) — **never skip this**, the deal's Contacts panel
     must not be empty (gap caught by Elena July 18 2026 on prospects #1-3).
     Fill in the real name/title later once learned from the reply.
   - **Note on deal** — audit evidence + pitch angle + top fixes + contacts +
     **ONE-CLICK SEND link** (see §4) + **`--- MENSAJE (plain text) ---`** block
     with the **full** WhatsApp draft (never audit-only — Elena must see the message
     in HubSpot without opening another file) + "Next:" line. Save the draft in
     `docs/selling/drafts/{slug}.txt` and the paste-ready note pack in
     `docs/selling/prospects/{COMPANY}.md` (see § Staged deal packs).
   - **Task** — HIGH, due same day: "Send WhatsApp outreach → {Company}"

4. **One-click WhatsApp link** — the message pre-typed so Elena only hits Send:
   ```bash
   node scripts/outreach-walink.cjs 507XXXXXXXX draft.txt
   ```
   **July 19 2026 — FINAL decision (Elena): DIRECT `wa.me` anchor.** The note href is a real
   (never HTML-escaped) `<a href="https://wa.me/<digits>?text=<encodeURIComponent(msg)>">` above
   the plain-text `MENSAJE` block. This renders emojis correctly on Elena's WhatsApp Web — the
   earlier `�` came from the b64 + `/go/outreach` server round-trip, NOT from wa.me. Direct
   wa.me has a single `?text=` param (no `&`) so HubSpot can't mangle it. **Rules:** (1) the
   `<a>` must be REAL html (`&lt;a…` shows as literal text — regression seen on the first
   DoPanama note); (2) draft files UTF-8, encode ONCE; (3) safe color-emoji set only
   (👋🏠✨🌍💫👶🚛🪨 — avoid U+FE0F glyphs, they go monochrome in the WA Web composer on Windows).
   The `/go/outreach` slug server (`src/go-wa.ts`) is retired/dormant — kept in the tree, nothing
   links to it. Automation `stage-manual-prospect.cjs` emits this via `buildHubSpotWaAnchor(phone, draft)`.
   Works on laptop via web.whatsapp.com **linked to WhatsApp Business** (phone: WhatsApp Business → ⋮ → Linked
   devices) and on phone directly.

5. **After Elena sends** (she says "sent" — WhatsApp Business app has no API,
   so detection is manual by design): move deal → **decisionmakerboughtin**
   ("⏳ Sent — passive wait"), mark task COMPLETED, append `✅ SENT {date}` +
   the verbatim sent text to the note, set follow-up expectation (~+4 days).
   On reply: stage → **contractsent** ("💬 They replied — I act").

## The canonical outreach template (Elena's own final edit, July 18 2026)

Spanish, WhatsApp-first ("Panamanians are crazy about WhatsApp"). Adapt the
[bracketed] parts per prospect; keep the shape, tone and emojis EXACTLY —
literal emoji characters, never encoded entities. **HubSpot href:** a REAL direct
   `<a href="https://wa.me/<digits>?text=<encodeURIComponent(msg)>">` (see §4 — proven method):

```
Hola, ¡un gusto saludarles! 👋Soy Elena Revicheva, ingeniera de IA aquí en Panamá: https://aideazz.xyz/portfolio.

Primero, felicitaciones por su sitio web — [genuine compliment from the audit]. Les escribo porque analicé [domain] con mi motor de visibilidad en IA y obtuvo [score]/100: cuando un [their customer] le pregunta a ChatGPT o Perplexity "[their money query]", su empresa todavía no aparece como respuesta citable — [the gap in one clause] ([category score]/100).

Son 3 arreglos concretos. Si les parece bien, con mucho gusto se los muestro en 15 minutos, sin ningún compromiso. La auditoría completa es gratuita aquí: https://aideazz.xyz/api 🛥️

PD: Además de visibilidad en IA, construyo agentes de WhatsApp que responden y agendan reservas 24/7 (EN/ES, conectados a su CRM), automatización completa de procesos, video con IA para marketing, y rescate de sistemas de IA que fallan. Todo con demos en vivo en mi portafolio👆

¡Que tengan un excelente día!
Saludos,
Elena✨🌍💫
```

### Iron rules (from Elena, all July 18 2026)
0. **ALWAYS `https://` on every link** (July 19 2026, proven with WhatsApp screenshots):
   the portfolio link MUST be `https://aideazz.xyz/portfolio` — bare `aideazz.xyz/portfolio`
   renders **NO OG preview card** in WhatsApp, `https://…` renders the full rich card
   (image + "Elena Revicheva — AI Portfolio | Live Agents…"). Same for `https://aideazz.xyz/api`.
   Applies to the plain-text draft AND the wa.me pre-typed message. Never ship a bare-domain link.
1. Portfolio link `https://aideazz.xyz/portfolio` appears **exactly once** — in the intro
   line. The PD points back with "en mi portafolio👆". Never bare `aideazz.xyz`.
2. `https://aideazz.xyz/api` may additionally appear when the audit is the hook.
3. **Courteous Panamanian tone**: warm greeting (no time-of-day), genuine
   compliment BEFORE any critique, soft asks ("Si les parece bien, con mucho
   gusto…", "sin ningún compromiso"), never blunt.
4. Services PD: one compact block, outcomes not categories, lead with the
   service that maps to how THEY make money (yacht/tourism → WhatsApp booking
   agents; SaaS → AI reliability & rescue; etc.).
5. Sign-off: "¡Que tengan un excelente día! / Saludos, / Elena✨🌍💫".
6. English mirror (for English-first prospects): same structure —
   "Hi, great to meet you! 👋I'm Elena Revicheva, an AI engineer here in
   Panama: https://aideazz.xyz/portfolio." … "Have a great day! / Best, / Elena✨🌍💫".

## Deals sent with this play

| Date | Company | Audit | Deal |
|------|---------|-------|------|
| 2026-07-18 | Alquiler de Yates Panamá | 82/B (GEO 56) | 62792913925 — SENT same day |
| 2026-07-18 | Panama Yacht Group | 86/A (AEO 69) | 62801585568 |
| 2026-07-19 | Eurostone Panamá (Atelier de la Piedra) | 86/A (AEO 81) | 62837342362 |
| 2026-07-19 | AIRCO / SINOTRUK Panamá | 73/B (AI-access 59 — robots.txt blocks all AI crawlers) | 62841350764 |
| 2026-07-19 | Panama Fertility | 86/A (AI-access 64 — robots.txt blocks GPTBot/Claude/Gemini) | 62828946074 |
| 2026-07-19 | Nomad Constructions Corp | 90/A (AEO 81 — construction Pedasí/Azuero) | 62832583063 |
| 2026-07-19 | DoPanama | 91/A (GEO/AEO 88 — expat RE+relocation) | 62821413988 |

## Staged deal packs (draft + HubSpot note)

Every staged `[CLIENT-MANUAL]` deal ships **three artifacts**:

| Artifact | Path | Purpose |
|---|---|---|
| WhatsApp draft | `docs/selling/drafts/{slug}.txt` | Input to `outreach-walink.cjs` (UTF-8, literal emojis) |
| HubSpot note pack | `docs/selling/prospects/{COMPANY}.md` | **Copy-paste into deal Notes** — wa.me link + full `MENSAJE` block + audit + Next |
| Deal row | table above | HubSpot deal ID once created |

**Nomad Constructions Corp** (2026-07-19, deal **62832583063**) — full note with wa.me link + MENSAJE block added via HubSpot API.

Draft (`drafts/nomad-constructions-corp.txt`):

```
Hola, ¡un gusto saludarles! 👋Soy Elena Revicheva, ingeniera de IA aquí en Panamá: https://aideazz.xyz/portfolio.

Primero, felicitaciones — su sitio web está técnicamente impecable (100/100) y abierto a todos los motores de IA. Les escribo porque analicé nomadcc.com con mi motor de visibilidad en IA y obtuvo 90/100: están muy cerca, faltan solo unos ajustes — cuando alguien que quiere construir su casa en Pedasí o Azuero le pregunta a ChatGPT "¿qué constructora recomiendan en Panamá?", su empresa todavía no aparece como respuesta citable porque falta contenido en formato de preguntas y respuestas que los motores puedan citar (preparación para respuestas 81/100).

Son 3 arreglos concretos. Si les parece bien, con mucho gusto se los muestro en 15 minutos, sin ningún compromiso. La auditoría completa es gratuita aquí: https://aideazz.xyz/api 🏠

PD: Además de visibilidad en IA, construyo agentes de WhatsApp que atienden y agendan cotizaciones y visitas 24/7 (EN/ES, conectados a su CRM), automatización completa de procesos, video con IA para marketing, y rescate de sistemas de IA que fallan. Todo con demos en vivo en mi portafolio👆

¡Que tengan un excelente día!
Saludos,
Elena✨🌍💫
```

Regenerate link: `node scripts/outreach-walink.cjs 50769484982 docs/selling/drafts/nomad-constructions-corp.txt`
