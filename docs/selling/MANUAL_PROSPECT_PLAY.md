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
   via the HubSpot connector — all four, every time (Starter plan features on max):
   - **Company** — name, domain, phone, city, email in description
   - **Deal** — `[CLIENT-MANUAL] {Company} — GEO/AEO fix (audit: {score}/{grade})`,
     Sales Pipeline, stage **qualifiedtobuy** ("🔥 I Act TODAY")
   - **Note on deal** — audit evidence + pitch angle + top fixes + contacts +
     **ONE-CLICK SEND link** (see §4) + plain-text draft + "Next:" line
   - **Task** — HIGH, due same day: "Send WhatsApp outreach → {Company}"

4. **One-click WhatsApp link** — the message pre-typed so Elena only hits Send:
   ```bash
   node scripts/outreach-walink.cjs 507XXXXXXXX draft.txt
   ```
   Wrap the output in the note as
   `<a href="{url}"><b>➡️ ENVIAR POR WHATSAPP (+507 XXXX-XXXX)</b></a>`
   placed ABOVE the plain-text draft. Works on laptop via web.whatsapp.com
   **linked to WhatsApp Business** (phone: WhatsApp Business → ⋮ → Linked
   devices) and on phone directly.

5. **After Elena sends** (she says "sent" — WhatsApp Business app has no API,
   so detection is manual by design): move deal → **decisionmakerboughtin**
   ("⏳ Sent — passive wait"), mark task COMPLETED, append `✅ SENT {date}` +
   the verbatim sent text to the note, set follow-up expectation (~+4 days).
   On reply: stage → **contractsent** ("💬 They replied — I act").

## The canonical outreach template (Elena's own final edit, July 18 2026)

Spanish, WhatsApp-first ("Panamanians are crazy about WhatsApp"). Adapt the
[bracketed] parts per prospect; keep the shape, tone and emojis EXACTLY —
literal emoji characters, never encoded entities (encoding happens only inside
the wa.me URL):

```
Hola, ¡un gusto saludarles! 👋Soy Elena Revicheva, ingeniera de IA aquí en Panamá: aideazz.xyz/portfolio.

Primero, felicitaciones por su sitio web — [genuine compliment from the audit]. Les escribo porque analicé [domain] con mi motor de visibilidad en IA y obtuvo [score]/100: cuando un [their customer] le pregunta a ChatGPT o Perplexity "[their money query]", su empresa todavía no aparece como respuesta citable — [the gap in one clause] ([category score]/100).

Son 3 arreglos concretos. Si les parece bien, con mucho gusto se los muestro en 15 minutos, sin ningún compromiso. La auditoría completa es gratuita aquí: aideazz.xyz/api 🛥️

PD: Además de visibilidad en IA, construyo agentes de WhatsApp que responden y agendan reservas 24/7 (EN/ES, conectados a su CRM), automatización completa de procesos, video con IA para marketing, y rescate de sistemas de IA que fallan. Todo con demos en vivo en mi portafolio👆

¡Que tengan un excelente día!
Saludos,
Elena✨🌍💫
```

### Iron rules (from Elena, all July 18 2026)
1. Portfolio link `aideazz.xyz/portfolio` appears **exactly once** — in the intro
   line. The PD points back with "en mi portafolio👆". Never bare `aideazz.xyz`.
2. `aideazz.xyz/api` may additionally appear when the audit is the hook.
3. **Courteous Panamanian tone**: warm greeting (no time-of-day), genuine
   compliment BEFORE any critique, soft asks ("Si les parece bien, con mucho
   gusto…", "sin ningún compromiso"), never blunt.
4. Services PD: one compact block, outcomes not categories, lead with the
   service that maps to how THEY make money (yacht/tourism → WhatsApp booking
   agents; SaaS → AI reliability & rescue; etc.).
5. Sign-off: "¡Que tengan un excelente día! / Saludos, / Elena✨🌍💫".
6. English mirror (for English-first prospects): same structure —
   "Hi, great to meet you! 👋I'm Elena Revicheva, an AI engineer here in
   Panama: aideazz.xyz/portfolio." … "Have a great day! / Best, / Elena✨🌍💫".

## Deals sent with this play

| Date | Company | Audit | Deal |
|------|---------|-------|------|
| 2026-07-18 | Alquiler de Yates Panamá | 82/B (GEO 56) | 62792913925 — SENT same day |
| 2026-07-18 | Panama Yacht Group | 86/A (AEO 69) | 62801585568 |
