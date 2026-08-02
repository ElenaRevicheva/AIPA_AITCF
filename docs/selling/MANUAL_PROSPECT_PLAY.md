# The Manual Prospect Play — audit → deal → email → WhatsApp FU

> Born July 18 2026, the day the first [CLIENT-MANUAL] outreach was SENT
> (Alquiler de Yates Panamá). This is the repeatable ~3-minute play that turns
> "I know a potential client's website" into a staged deal with ready-to-send
> outreach. Canonical rules also live in Claude memory
> (`feedback_outreach_draft_rules.md`); this file is the repo source of truth.
> **Cursor/Claude HubSpot API setup:** `docs/HUBSPOT_CURSOR_CONNECTION.md`
> **Hit-list = HubSpot inventory:** `docs/selling/PANAMA_TARGET_PROSPECTS.md`

## How it works NOW (Jul 24 2026) — money loop

**Product we sell:** AI Growth Operator (not “AI agents / GEO / bots” as separate SKUs).  
**ICP:** high-ticket service businesses (avg sale > $2k), international, WhatsApp-close, AI-discoverable (medical tourism, dental, immigration/relo, luxury tourism / yachts / charters).

### Why email first (HubSpot Starter)

In LATAM, **WhatsApp is the primary app**. On HubSpot **Starter**, email is still the channel that **automatically** proves outreach started: one-click `/go/outreach-email/{slug}` or HubSpot UI Email from `aipa@` → deal → **⏳ Sent**, note `📧 EMAILED`, **+4d follow-up task**. WhatsApp Business has **no API** on Starter — WA send/reply still needs Elena (`sent` / `they replied`).

**Jul 18–24 batch:** ~**95** `[CLIENT-MANUAL]` deals; most **emailed first**, few WhatsApp-first. Hit-list on GitHub matches HubSpot (**95/95**, incl. Early Manual section).

---

## Aug 1 2026 — audited truth of the first 65 deals (Alquiler de Yates → Gamboa)

Every number below came from Resend message IDs in the send log plus Resend's own
delivery callbacks, not from deal stages. **Stage is not evidence of a send** — 64 of
those 65 sat in `decisionmakerboughtin` ("Sent — passive wait") while 46 had never
been emailed at all.

| Reality | Count | How it was proven |
| --- | --- | --- |
| Already emailed before Aug 1 | **38** | 36 with a real Resend message id + 2 sent from the HubSpot UI |
| Emailed Aug 1 (first contact) | **14** | Resend ids, one-click endpoint |
| Never emailed, **no address at all** | **7** | WhatsApp-only; Elena's channel, not automatable |
| Follow-up sent Aug 1 | **38 / 38** | zero failures |

**Bounces: 5 real** out of ~110 sends (≈4%, healthy; zero spam complaints) —
Centro Marino, Fuerte Amador, Destination Dream Weddings, Balboa Academy,
Eclypse de Mar. Each is stamped `⛔ REBOTE` with a task to find a working address.
Two of them (Centro Marino, Eclypse de Mar) bounced on their **first** contact, so
those prospects have received nothing and are not "waiting on you".

### ⚠️ The endpoint has NO double-send guard

`/go/outreach-email/{slug}/send` sends **every time it is called**. Verified in the
log: `hospital-san-fernando-fu` went out **10 times** to the same prospect; four
others went twice. Clicking the button again, or refreshing the confirmation, sends
another copy. Until a guard exists, treat one click as irreversible.

### 6 deals cannot send a follow-up

Panama Yacht Group, DQSA, PALIG, Banco LAFISE, Panama Equity and Eurostone have a
`-fu` draft but **no first-outreach draft** — their first-contact send 404s. Their FU
text says *"les escribí hace unos días por correo"*, which would be false to send:
they were reached on WhatsApp, never by email. Write the first-contact draft before
touching them.

### Delivery + engagement stamping (live and verified Aug 1)

Resend `open_tracking` and `click_tracking` are **both true**, the domain and the
`links` CNAME are **verified**, and the webhook subscribes to 19 events including
`email.opened` and `email.clicked`. Stamps land at the TOP of the outreach note:

- `✅ ENTREGADO` — hard proof, the receiving server accepted it
- `👀 ABIERTO` — **soft signal only**; Apple Mail Privacy and Gmail's image proxy
  pre-fetch the pixel, so some opens are machines. Never read it as proof.
- `🔗 CLIC EN ENLACE` — the trustworthy engagement signal (a click is a human act)
  and it raises a HubSpot task to follow up the same day.

Open/click tracking applies **only to mail sent after Aug 1 12:54 UTC**. Anything
earlier — including the Hospital CIMA Compras letter — carries no pixel and will
never report an open.

**Cloudflare gotcha:** the `links` tracking CNAME must be **DNS only (grey cloud)**.
Proxied (orange), Cloudflare intercepts it and link rewriting breaks in real
outreach.

### Follow-up = full WhatsApp (not a 2-line nudge)

After email, FU is a **second outreach on WhatsApp**: audit already on the deal (no re-crawl) + **AI Growth Operator** pitch. Installed Jul 24 on **93/95** deals with a phone (skipped: Riga Design IG-only, San Blas Tour email-only).

1. **Sales → Tasks** → filter **Assigned to Elena** (all CLIENT-MANUAL tasks/deals use `hubspot_owner_id` **91612860**).
2. Open task → open **deal** → top of note → **`➡️ WHATSAPP FU — AI Growth Operator + auditoría`**.
3. Click → WhatsApp opens with **full text prefilled** → Send (no manual edit).
4. Mark task done. Reply → stage **💬 They replied** (or say `they replied {company}`).

**💻 WhatsApp outreach is LAPTOP-ONLY — Elena's decision, July 25 2026. Do not "fix" this.**
A mobile bridge (`/go/outreach/{slug}?v=fu`, device-sniffing → api.whatsapp.com on phones)
was built and **rolled back the same day**: hours after bulk FU became one tap, WhatsApp
restricted her linked devices (*"You can't start new chats right now"*). The buttons never
send anything by themselves, but making 93 cold first-touches frictionless is exactly the
pattern WhatsApp's anti-spam targets, and **her number is a business asset** (site, HubSpot,
portfolio). Notes are back to direct `web.whatsapp.com/send` hrefs — laptop only, by design.

**📧 The FU now ships on BOTH channels (July 26 2026).** Every deal note carries, at the top:
`✉️ EMAIL FU — aipa@aideazz.xyz ({address})` and `➡️ WHATSAPP FU (laptop)`. The email button
needed **no server change**: the FU gets its own registry slug **`{slug}-fu`**
(`email` + `emailDraft: docs/selling/drafts/{slug}-fu-email.txt`), which the existing
`/go/outreach-email/:slug` route serves — click → preview → Send via Resend → deal ⏳ Sent.
Installed on **94/95** deals (Riga Design has neither phone nor email); 88 carry both buttons.
Rebuild with `node scripts/_install-wa-fu-notes.cjs` (`--only=<company>` for one), then
**commit + push** drafts + registry.

**Every FU claim is verified against Elena's own audit data.** `node scripts/_verify-fu-claims.cjs`
re-derives each claim (score/grade, domain, quoted money query, category score, city, the
emailed-vs-WhatsApp channel claim, WhatsApp text == email text, jargon) and requires it to
trace to the deal name, the ORIGINAL audit note, or the first-contact draft actually sent —
the FU block is stripped first so a FU can never verify itself. Current: **88/88 clean**.
Rules it enforces: no invented money query (no query in the note → describe the search using
their real HubSpot city, never a fabricated quote), no domain unless the note or sent draft
names it (→ "su sitio web"), no category score unless parsed, and **never** hardcode "Panamá"
(half the list is CR/MX/CO).

**📬 Delivery truth — Resend webhook → HubSpot (July 26 2026).** Acceptance by Resend is NOT
delivery: Dental Connect was **Suppressed** while the deal read ⏳ Sent + `📧 EMAILED`.
Now `POST /cto/resend/webhook` (Svix-signed, `RESEND_WEBHOOK_SECRET` in Oracle `.env`) stamps
the OUTREACH note — **at the top, under the FU buttons** — with `✅ ENTREGADO` / `⛔ REBOTE` /
`🚫 QUEJA` / `👀 ABIERTO` / `🔗 CLIC`; bounces and complaints also raise a HIGH task. New sends
are logged as real HubSpot **EMAIL activities** (from/to must go in `hs_email_headers` — the flat
`hs_email_*_email` properties 400). Suppressed sends emit **no webhook at all**, so
`scripts/resend-reconcile.cjs` (cron :17 hourly) polls final status and stamps `⛔ SUPRIMIDO`.
**No backfill of past sends — existing notes stay untouched, only new sends get this.**

**🔎 Every signal is now traceable and typed (July 31 2026 — `9ec2619`, `ae4b334`, `d2dffff`).**
Three upgrades to the same stamp, all in `src/resend-webhook.ts`:

1. **The Resend id is on the stamp.** `✅ ENTREGADO — Resend confirmó la entrega` carried no
   handle back to the provider event, so the claim could not be checked against the dashboard.
   The id comes straight from the webhook payload (`data.email_id`) and renders **only when
   present — never inferred, never back-filled** from a send record.
2. **The stamp says WHICH message landed.** A bare ENTREGADO could not tell Elena whether the
   **first** outreach reached a prospect — the thing that decides if a deal is really in play.
   Stamps now read `[PRIMER CONTACTO] ENTREGADO …` or `[SEGUIMIENTO] ENTREGADO …`, derived
   solely from the send ledger's slug (`-fu` suffix is the discriminator). **Unknown slug → tag
   omitted, never guessed.**
3. **Opens vs clicks are not the same evidence.** Open tracking was switched OFF at the Resend
   domain until July 31, so `email.opened` / `email.clicked` had **never once fired** — zero
   events in the entire log. Now that it is on:
   - **`👀 ABIERTO` is marked a SOFT signal on the note itself.** Apple Mail Privacy Protection
     and Gmail's image proxy pre-fetch the tracking pixel, so **some opens are machines**. The
     note must never let a proxy fetch masquerade as a prospect reading the email.
   - **`🔗 CLIC` raises a HubSpot task**, the same way a bounce does. A click is a deliberate
     human act — the strongest buying signal the system produces — and it was previously just a
     line in a note nobody was watching.
   Opens and clicks carry the same `[PRIMER CONTACTO]`/`[SEGUIMIENTO]` tag and Resend id as
   deliveries, so any signal traces back to the message that produced it.

**Route one-off letters through the tracked pipeline, never Zoho (July 31 2026, `07d49b6`).**
Zoho gives **no delivery or open proof at all**. A one-off (e.g. a procurement letter after a
referral) gets a normal registry slug + `docs/selling/drafts/{slug}-email.txt` and goes out via
`/go/outreach-email/{slug}` — so it lands stamped `[PRIMER CONTACTO] ENTREGADO` with a Resend id
like every other send. If the entry was created directly on Oracle to make the link resolve,
**commit it** so the slug survives a redeploy or a fresh clone.

**Email extraction bug (fixed July 26 2026):** the plain-text regex had no left boundary, so a
label glued to the address was swallowed — `Email` + `contactus@…` → `emailcontactus@dentalconnect.com.mx`,
which Resend suppressed. `mailto:` is now authoritative, text matches need a left boundary, and a
glued label is stripped only when the site itself shows the stripped address.
Audit all staged addresses with `node scripts/_audit-prospect-emails.cjs`.

**Rules that came out of it:**
- Never reintroduce a mobile WhatsApp bridge without Elena's explicit go-ahead.
- WhatsApp = prospects who **replied** or messaged first. Cold first-touch at volume → **email**
  (one-click `aipa@`, campaign script, auto ⏳ Sent + 4-day FU task) — compliant and untouched by this.
- If a restriction appears: stop clicking, use WhatsApp's in-app review, never a second number.

**No engineering jargon in the message (fixed July 25 2026).** HubSpot flattens the note
HTML, so `Money query: …` and `Top fixes: (1) FAQ …, (2) LodgingBusiness/FAQPage JSON-LD…`
land on one line; the old parser swallowed the fixes into the quoted customer question and
cut it mid-word. `cleanMoneyQuery()` now stops at the `?`/next note field, drops analyst
tails, and returns the generic question if any engineering token (`JSON-LD`, `FAQPage`,
`schema`, `robots.txt`, `llms.txt`, `H1`) survives. **`Top fixes` stays in the deal note —
never in the prospect's message.**

Approved FU ending (after audit paragraph):

```
No vendo otro CRM ni otro chatbot. Instalo un AI Growth Operator que trabaja 24/7
dentro de las herramientas que ya usan: que ChatGPT los recomiende, investigue
prospectos, haga outreach y seguimiento, califique leads por WhatsApp, mantenga
el CRM al día y les entregue un briefing diario con las mejores oportunidades.

Si les sirve, en 15 minutos les muestro los 3 arreglos de esa auditoría y cómo
quedaría el Operator en su negocio — sin compromiso. Auditoría gratuita:
https://aideazz.xyz/api

Saludos,
Elena✨
```

Re-install / refresh note buttons (ops): `node scripts/_install-wa-fu-notes.cjs`  
Assign owner if Tasks hide: `node scripts/_assign-manual-tasks-elena.cjs`

### HubSpot fruit (what “done” looks like)

| Step | HubSpot |
|------|---------|
| Staged | Deal `[CLIENT-MANUAL]` · owner Elena · note + send task |
| First contact | **⏳ Sent** + `📧 EMAILED` / `✅ SENT` |
| FU ready | Task *WhatsApp FU → {Company}* + note WA FU button |
| Conversation | **💬 They replied** |
| Cash | **✅ Won** + Amount |

Views that matter: **CLIENT-MANUAL**, **NEW today**, **ACTIVE (1–7d)**, **AGING**, **Tasks → Assigned to me**.

---

## The play, end to end (stage a new prospect)

1. **Audit the prospect** with our own Visibility API (free, no keys):
   ```bash
   # For interviews / Manual Prospect / batch: use VISIBILITY_API_KEY from .env
   # (owner key). NEVER the public demo key — that is capped at 20/hour.
   curl -s -X POST https://webhook.aideazz.xyz/cto/v1/visibility \
     -H "Content-Type: application/json" -H "X-API-Key: $VISIBILITY_API_KEY" \
     -d '{"url":"https://PROSPECT.com"}'
   ```
   The score + weakest category becomes the outreach hook. Angles by profile:
   - Low GEO (e.g. 56) → "invisible as a citable answer; missing structured data"
   - Low AEO, high rest (e.g. 86/A) → "ustedes están muy cerca — 3 arreglos"
   - JS-shell / bot-blocked → "most AI crawlers see an EMPTY page" (strongest)

2. **Extract contacts from their site** — in Panama/LatAm **WhatsApp is the #1 channel**,
   but **BOTH WhatsApp and email go into HubSpot every time** (email is the fallback when
   a prospect redirects, and some only take commercial proposals there):
   `curl -sL https://PROSPECT.com | grep -ioE "(wa\.me/[0-9]+|api\.whatsapp\.com/send[^\"']*|tel:[+0-9]+|mailto:[^\"']+|\+507[- ]?[0-9]{3,4}[- ]?[0-9]{4})"`

   **Email search (added July 20 2026 — Panama Aesthetics lesson: they replied "commercial
   proposals by email only", and the contact had no email staged):**
   - Scan the homepage **and** `/contact`, `/contact-us`, `/contacto` for BOTH `mailto:` links
     AND plain-text addresses: `grep -ioE "[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}"`
     (many Panama sites print `info@…` as text, not a mailto link).
   - Prefer an address on the prospect's own domain (`info@`, `contacto@`, `citas@`,
     `ventas@`); ignore third-party junk (image names, CDN, plugin authors).
   - If nothing on the site: check their Instagram bio / Google Business profile.
   - **The HubSpot Contact must carry the email whenever one exists** — a WhatsApp-only
     contact is incomplete. If found after staging, PATCH the contact immediately.

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
     **Email is part of a full contact** (July 20 2026): run the email search from
     step 2 and set the contact's `email` — some prospects only accept commercial
     proposals by email (Panama Aesthetics), and without it the play stalls.
   - **Note on deal** — audit evidence + pitch angle + top fixes + contacts +
     **BOTH ONE-CLICK SEND BUTTONS (HARD RULE, July 21 2026)** + **`--- MENSAJE (plain text) ---`**
     block with the **full** draft (never audit-only) + "Next:" line.
     **⚠️ EVERY note carries TWO buttons side-by-side so Elena chooses the channel:**
     1. `➡️ ENVIAR POR WHATSAPP` → `web.whatsapp.com/send?phone=…&amp;text=…` (§4). Manual "sent".
     2. `✉️ ENVIAR POR EMAIL — aipa@aideazz.xyz (<email>)` → `https://webhook.aideazz.xyz/cto/go/outreach-email/<slug>`.
        **Fully automatic**: preview → Send → deal auto-moves ⏳ Sent + `📧 EMAILED` note + `+4-day` follow-up task (`src/go-wa.ts`, Cursor's flow). NO manual "sent" needed.
     The email button REQUIRES a registry entry with `email` + `emailDraft` → so always create
     `docs/selling/drafts/{slug}-email.txt` (SUBJECT/TO/body) and add `email`+`emailDraft` to
     `docs/selling/outreach-registry.json`, then **commit + push to `main`**. Oracle serves
     `/go/outreach-email/{slug}` from disk **and** (after Jul 2026 fix) falls back to GitHub
     raw `main` — so **unpushed staging = UI error**
     `Unknown outreach email slug`. Sync Oracle when convenient:
     `cd ~/cto-aipa && bash scripts/oracle-sync-outreach-registry.sh`
     (or full `bash scripts/oracle-deploy-go-wa.sh`). Never leave registry-only local.
     If no email is found: use the standard `info@{domain}` and **flag it UNVERIFIED** in the note
     (the preview page shows the recipient — Elena confirms before sending). Never ship a note with
     only the WhatsApp button. Save the WA draft in `docs/selling/drafts/{slug}.txt` and the pack in
     `docs/selling/prospects/{COMPANY}.md`.
   - **Task** — HIGH, due same day: "Send outreach → {Company}" — **always**
     `hubspot_owner_id: 91612860` (Elena). Same owner on the deal. New follow-up /
     email-watcher / one-click tasks must set this too (see `HUBSPOT_OWNER_ID` in `.env`).

4. **One-click send links (WhatsApp + Email)** — message pre-typed so Elena only hits Send:
   ```bash
   node scripts/outreach-walink.cjs 507XXXXXXXX draft.txt
   ```
   **July 19–20 2026 — dual channel (always on every deal note):**
   1. WhatsApp: `<a href="https://web.whatsapp.com/send?phone=…&amp;text=…">`
   2. **Email speed: aipa@ one-click** — `<a href="https://webhook.aideazz.xyz/cto/go/outreach-email/{slug}">`
      → confirm → Resend from `aipa@aideazz.xyz` (same From as HubSpot UI).
   3. **Email CRM (also always available):** HubSpot deal/contact → **Email** → From
      `aipa@aideazz.xyz` → paste SUBJECT/body from the note’s EMAIL block (best threading).
   Both email paths are mandatory whenever a prospect email exists. If WhatsApp opens a
   reservations bot, use either email path. Refresh helper:
   `node scripts/hs-ensure-aipa-email-links.cjs`.
   WhatsApp rules: real `<a>` (not escaped), never `wa.me` for emoji messages (use
   `web.whatsapp.com/send`), UTF-8 draft encode once, color-default emoji set.

   **Zoho Sent vs Resend (July 20 2026):** HubSpot UI Email uses the connected **Zoho**
   inbox → shows in Zoho Mail → Sent. One-click / campaign sends use **Resend** (same
   From `aipa@aideazz.xyz`) → appear in [Resend dashboard](https://resend.com/emails),
   **not** in Zoho Sent. Both are real sends.

4b. **Zero-click email campaign (do not reinvent — July 20 2026)**

   Use this when Elena wants emails fired without clicking HubSpot/one-click links.
   One-click WA + one-click email links stay on every deal note in parallel.

   **Prerequisites (every prospect):**
   1. Add `PROSPECT_META[domain]` in `scripts/stage-manual-prospect.cjs` (optional
      `preferredPhone` / `preferredEmail` if scrape misses).
   2. Stage: `node scripts/stage-manual-prospect.cjs <domain>`
      → company + deal `[CLIENT-MANUAL]` (`qualifiedtobuy`) + contact + note
      (WA + `/go/outreach-email/{slug}`) + send task + registry row in
      `docs/selling/outreach-registry.json` (needs `email` + `dealId` + drafts).
   3. Oracle has `RESEND_API_KEY` (and HubSpot key) in `.env`.

   **Fire the campaign (Oracle):**
   ```bash
   cd ~/AIPA_AITCF   # or repo path on Oracle
   git pull
   node scripts/hs-campaign-send-aipa-emails.cjs --dry-run   # preview
   node scripts/hs-campaign-send-aipa-emails.cjs             # send all registry rows
   # or only some: --only=slug1,slug2
   ```

   **What the script does per registry slug with email+dealId:**
   - Skips re-send if note already has `📧 EMAILED` or `Resend:…`.
   - Else Resend from `aipa@aideazz.xyz` → deal **⏳ Sent** (`decisionmakerboughtin`)
     → stamps note with Resend id.
   - **Iron rule — +4 day follow-up for EVERY campaign candidate** (new send
     *and* already-emailed rows): creates (or reuses) an open Task assigned to
     Elena; due ~+4 calendar days; stamp `📅 Follow-up task…` on the note.
     **Elena’s action:** deal note → **WHATSAPP FU** (full Operator+audit text),
     not a 2-line soft nudge. Idempotent — will not duplicate if open FU exists.
   - Proof of send: [https://resend.com/emails](https://resend.com/emails) (not Zoho Sent).

   **Hit-list source:** stage domains from `docs/selling/PANAMA_TARGET_PROSPECTS.md`
   (shortlist + Elena-mined), then fire campaign. Prospects without email stay
   staged for WhatsApp-only; campaign skips them until an email is added to the
   registry.

5. **After first contact**
   - **Email one-click / HubSpot UI:** auto → **⏳ Sent**, `📧 EMAILED`, +4d FU task
     (owner Elena). No need to say "emailed".
   - **WhatsApp first contact** (she says `sent {company}` — no WA API on Starter):
     move deal → **decisionmakerboughtin** ("⏳ Sent"), complete send task, append
     `✅ SENT {date}`, create +4d FU task (owner Elena), stamp `📅 Follow-up task…`.
   - **FU work (Jul 24+):** open the FU task → deal note → click
     **`WHATSAPP FU — AI Growth Operator + auditoría`** → Send prefilled WhatsApp
     (audit from deal + Operator ending above). **Not** a 2-line soft nudge.
   - On reply: stage → **contractsent** ("💬 They replied — I act"), complete/cancel FU task.

6. **The "send it by email" reply path** (added July 20 2026 — Panama Aesthetics):
   when a prospect answers WhatsApp with "commercial proposals go to email":
   - That IS a reply → stage **contractsent** ("💬 They replied — I act").
   - Find/confirm their email (step 2 search), PATCH the HubSpot contact with it.
   - Convert the WhatsApp draft to an email: same template, same iron rules, plus
     a courteous opener acknowledging the redirect ("Les escribo por este medio,
     como amablemente me indicaron por WhatsApp"), the 3 fixes as a numbered list,
     and full name in the sign-off ("Elena Revicheva✨🌍💫").
   - **Subject formula:** `Auditoría de visibilidad en IA — {Company} ({score}/100): 3 arreglos concretos`
     (audit-specific, concrete, no salesy words like "oferta"/"promoción" — survives spam filters
     and mirrors the hook). English mirror: `AI visibility audit — {Company} ({score}/100): 3 concrete fixes`.
   - Save as `docs/selling/drafts/{slug}-email.txt` (SUBJECT + TO + body), append the
     email version + `📧 EMAILED {date}` to the deal note after sending.

7. **Email auto-watcher (July 20 2026)** — when Elena sends from the **HubSpot UI**,
   she does **not** need to say "emailed". Run (or cron every 10 min on Oracle):
   ```bash
   node scripts/hs-watch-manual-emails.cjs
   ```
   Requires Service Key scope **`sales-email-read`**. The watcher:
   - Outbound CRM email on a `[CLIENT-MANUAL]` contact → deal **⏳ Sent**, note `📧 EMAILED`,
     +4 day soft follow-up task (idempotent via state file).
   - Inbound email reply on that contact while waiting → deal **💬 They replied**,
     complete open follow-up tasks.
   WhatsApp send/reply still needs Elena to say `sent` / `they replied` (no WA API on Starter).

## The canonical outreach template (Elena's own final edit, July 18 2026)

Spanish, WhatsApp-first ("Panamanians are crazy about WhatsApp"). Adapt the
[bracketed] parts per prospect; keep the shape, tone and emojis EXACTLY —
literal emoji characters, never encoded entities. **HubSpot href:** a REAL
   `<a href="https://web.whatsapp.com/send?phone=<digits>&amp;text=<encodeURIComponent(msg)>">` (see §4 — emojis survive; wa.me corrupts them):

```
Hola, ¡un gusto saludarles! 👋Soy Elena Revicheva, ingeniera de IA aquí en Panamá: https://aideazz.xyz/portfolio.

Primero, felicitaciones por su sitio web — [genuine compliment from the audit]. Les escribo porque analicé [domain] con mi motor de visibilidad en IA y obtuvo [score]/100: cuando un [their customer] le pregunta a ChatGPT o Perplexity "[their money query]", su empresa todavía no aparece como respuesta citable — [the gap in one clause] ([category score]/100).

Son 3 arreglos concretos. Si les parece bien, con mucho gusto se los muestro en 15 minutos, sin ningún compromiso. La auditoría completa es gratuita aquí: https://aideazz.xyz/api 🛥️

PD: Además de visibilidad en IA, construyo agentes de WhatsApp que responden y agendan reservas 24/7 (EN/ES, conectados a su CRM), automatización completa de procesos, video con IA para marketing, y rescate de sistemas de IA que fallan. Todo con demos en vivo en mi portafolio👆

¡Que tengan un excelente día!
Saludos,
Elena✨🌍💫
```

**Jul 24 positioning (FU / new drafts):** PD and FU ending sell **one product** —
**AI Growth Operator** (modules: AI visibility, research, outreach, WhatsApp qualify,
CRM, daily briefing). Prefer that language over a long menu of separate AI services.
First-contact template above remains valid for audit-led openers; FU uses the
approved Operator block in **How it works NOW**.

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

**Scale (Jul 24 2026 live HubSpot):** **95** `[CLIENT-MANUAL]` since Jul 18 · **93** contacted
(email and/or WA stamp) · **0** still 🔥 Act TODAY · WhatsApp FU buttons on **93** notes ·
full inventory + Early Manual 13 in `PANAMA_TARGET_PROSPECTS.md`. Below = early seed rows;
do not re-stage anyone already `· SENT` on the hit-list.

**Funnel truth (Jul 31 2026, read live from HubSpot — 96 `[CLIENT-MANUAL]` deals):**

| Stage | Count |
|---|---|
| ⏳ Sent (`decisionmakerboughtin`) | ~94 |
| 💬 They replied (`contractsent`) | **2** |
| 🔥 Queue holder (`qualifiedtobuy`) | 1 |
| ✅ Won | **0** |

The two replies: **Grupo Residencial (Park House)** and **Hospital CIMA** — the second is the
better one and the first real progression this play has produced. **Jafet Artavia (Plataforma
Omnicanal) answered the follow-up and referred AIdeazz to Compras (procurement)** — a warm
hand-off into the buying function, not just a reply. The procurement letter went out through
the tracked pipeline (not Zoho) and is stamped `[PRIMER CONTACTO] ENTREGADO` with a Resend id.

**Read this honestly:** the machinery is excellent — 96 staged, contacts attached, delivery and
now open/click provenance, 88/88 verified claims. **~2% reply, 0 closed.** The constraint is not
volume or tooling, it is **message-market fit**. Before scaling the next batch, change the offer
or the segment — sending more of the same message through better plumbing will reproduce ~2%.

| Date | Company | Audit | Deal |
|------|---------|-------|------|
| 2026-07-18 | Alquiler de Yates Panamá | 82/B (GEO 56) | 62792913925 — SENT same day |
| 2026-07-18 | Panama Yacht Group | 86/A (AEO 69) | 62801585568 |
| 2026-07-19 | Eurostone Panamá (Atelier de la Piedra) | 86/A (AEO 81) | 62837342362 |
| 2026-07-19 | AIRCO / SINOTRUK Panamá | 73/B (AI-access 59 — robots.txt blocks all AI crawlers) | 62841350764 |
| 2026-07-19 | Panama Fertility | 86/A (AI-access 64 — robots.txt blocks GPTBot/Claude/Gemini) | 62828946074 |
| 2026-07-19 | Nomad Constructions Corp | 90/A (AEO 81 — construction Pedasí/Azuero) | 62832583063 |
| 2026-07-19 | DoPanama | 91/A (GEO/AEO 88 — expat RE+relocation) | 62821413988 |
| 2026-07-21 | PRP Events (weddings) | 86/A (AEO 75 — Atlas automation angle 75/100) | 62881755679 |
| 2026-07-21 | Ipanema Residences (Grupo Los Pueblos) | 92/A (AEO 88; 360-tour 54/D — luxury RE Costa del Este) | 62950148475 — SENT same day via aipa@ one-click EMAIL (auto ⏳ Sent + follow-up 25 jul) |
| 2026-07-21 | Eclypse de Mar (overwater bungalows, Bocas) | 57/C (WAF blocks AI crawlers + noindex — golden invisibility hook) | 62955236994 |
| 2026-07-20 | Panama Aesthetics | 88/A (Tech 71 — 11s response; no FAQ) | 62873560951 — SENT WA same day; replied "email only" → 📧 EMAILED same day via HubSpot (auto-detected, email 113286576039) |
| 2026-07-20 | YC Panama Yachts | 94/A+ (AEO 81 — no FAQ; rest 100/100) | 62864888204 — SENT same day (WA +507 6503-1745 + info@ycyachts.com) |
| 2026-07-20 | Fuerte Amador Resort & Marina | 68/C (GEO 31 — flamencomarina.com) | 62857562269 — WA hit restaurant bot → EMAIL ready `service@fuerteamador.com` |
| 2026-07-20 | Centro Marino Panamá | 84/B (AEO 75 — Mercury/botes) | 62863032403 — WA +507 6615-0368 + ernesto@centromarino.com (dual-channel note) |
| 2026-07-20 | ReloFirm | campaign Resend | 62851992582 — 📧 + follow-up due ~2026-07-24 |
| 2026-07-20 | Kraemer Law | campaign Resend | 62872179381 — 📧 + follow-up due ~2026-07-24 |
| 2026-07-20 | Ampa Tours | campaign Resend | 62872179385 — 📧 + follow-up due ~2026-07-24 |
| 2026-07-20 | Tranquilo Bay | campaign Resend | 62871509035 — 📧 + follow-up due ~2026-07-24 |
| 2026-07-20 | Prestige Storage | campaign Resend | 62867929503 — 📧 + follow-up due ~2026-07-24 |
| 2026-07-20 | Panama Dental Clinic | campaign Resend | 62865516872 — 📧 + follow-up due ~2026-07-24 |
| 2026-07-20 | San Blas Dreams | campaign Resend | 62868082222 — 📧 + follow-up due ~2026-07-24 |
| 2026-07-20 | Flamenco Drystack Panama | campaign Resend | 62860098823 — 📧 + follow-up due ~2026-07-24 |

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
