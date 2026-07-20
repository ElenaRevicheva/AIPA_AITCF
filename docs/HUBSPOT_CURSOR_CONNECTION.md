# HubSpot connection for Cursor / Claude Code agents

> **Recorded July 19 2026** so every future agent session can operate HubSpot without
> re-asking Elena. This is the replacement for Claude Code’s HubSpot connector when
> credits run out.

## How agents connect (not Zapier, not a Cursor plugin)

There is **no native HubSpot MCP** in Cursor for this workspace. Connection is:

1. **HubSpot Service Key** (Bearer token, `pat-na1-…`) in **local `.env`**
2. **Direct REST calls** to `https://api.hubapi.com` from repo scripts or inline Node
3. Same pattern as `src/hubspot-client.ts` (production Oracle uses the **same key**)

### Credential location

| Where | Variable | Notes |
|-------|----------|-------|
| **Local dev (Cursor)** | `HUBSPOT_API_KEY=pat-na1-…` in `cto-aipa/.env` | **gitignored** — never commit |
| **Oracle production** | `HUBSPOT_API_KEY` in `/home/ubuntu/cto-aipa/.env` | pm2 `cto-aipa --update-env` |
| **HubSpot UI** | Development → Keys → **Service Keys** | Key name: **`Aldeazz_Marketing_Engine`** |

Elena chose **not** to create a new key — reuse `Aldeazz_Marketing_Engine`. If local `.env`
is missing the line, copy the token from HubSpot (Show → Copy) or from Oracle `.env`
(never paste the token in chat).

Add to `.env.example` placeholder only:
```
HUBSPOT_API_KEY=
```

### Service Key scopes (granted)

**Core CRM (original):**
- `crm.objects.deals.read` / `.write`
- `crm.objects.contacts.read` / `.write`
- `crm.objects.companies.read` / `.write`
- `crm.objects.owners.read`

**Email / reply detection (added July 20 2026):**
- `sales-email-read` — read CRM emails sent from HubSpot UI (required; `crm.objects.emails.read` does **not** appear in Service Key picker)
- `conversations.read` — inbox/reply signals
- `timeline.read` — engagement timeline

Notes/tasks APIs already work with the current key in practice. Account: **Aldeazz startup** · Starter plan.

### Verify connection (agent self-test)

```bash
cd cto-aipa
node -e "
const fs=require('fs');
const k=fs.readFileSync('.env','utf8').match(/^HUBSPOT_API_KEY=(.+)$/m)?.[1]?.trim();
if(!k){console.error('MISSING HUBSPOT_API_KEY in .env');process.exit(1);}
fetch('https://api.hubapi.com/crm/v3/objects/deals/search',{
  method:'POST',
  headers:{Authorization:'Bearer '+k,'Content-Type':'application/json'},
  body:JSON.stringify({filterGroups:[{filters:[{propertyName:'dealname',operator:'CONTAINS_TOKEN',value:'CLIENT-MANUAL'}]}],properties:['dealname'],limit:3})
}).then(r=>r.json()).then(j=>console.log('OK',j.results?.length,'manual deals'));
"
```

If `MISSING` → ask Elena to add key to `.env` once (do not ask her to paste in chat).

---

## What agents do in HubSpot (Manual Prospect Play)

Full play: `docs/selling/MANUAL_PROSPECT_PLAY.md` · Hit-list: `docs/selling/PANAMA_TARGET_PROSPECTS.md`

**Every staged `[CLIENT-MANUAL]` deal — all five records:**

| # | Object | Rules |
|---|--------|-------|
| 1 | Company | domain, phone, city |
| 2 | Deal | `[CLIENT-MANUAL] {Co} — GEO/AEO fix (audit: {score}/{grade})`, pipeline default, stage **`qualifiedtobuy`** (🔥 I Act TODAY) |
| 3 | Contact | placeholder OK — **never leave deal Contacts empty** |
| 4 | Note | wa.me link + full `--- MENSAJE ---` + audit + Next |
| 5 | Task | HIGH, due today: `Send WhatsApp outreach → {Company}` |

**Elena’s queue filter:** Deal name **contains** `[CLIENT-MANUAL]` (save view tab `CLIENT-MANUAL`).

**After she sends WhatsApp (manual):** deal → **`decisionmakerboughtin`** (⏳ Sent), task complete, append `✅ SENT {date}` to note.

---

## Agent scripts (use these — do not reinvent)

| Script | Purpose |
|--------|---------|
| `scripts/stage-manual-prospect.cjs <domain>` | Full play → HubSpot + draft + registry |
| `scripts/hs-refresh-manual-wa-links.cjs` | Repatch note wa links on open deals |
| `scripts/outreach-walink.cjs <phone> <draft.txt>` | Generate wa.me URL for testing |
| `scripts/wa-link-lib.cjs` | `buildHubSpotWaAnchor(phone, draft)` for notes |
| `src/hubspot-client.ts` | Typed helpers for app/automation paths |

**Auth pattern in scripts:**
```javascript
const KEY = fs.readFileSync('.env','utf8').match(/^HUBSPOT_API_KEY=(.+)$/m)[1].trim();
const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
```

**Note on deal:** POST `/crm/v3/objects/notes` then PUT association type **214** to deal.

---

## Email auto-watcher (July 20 2026)

```bash
node scripts/hs-watch-manual-emails.cjs           # live
node scripts/hs-watch-manual-emails.cjs --dry-run
node scripts/hs-watch-manual-emails.cjs --hours=48
```

Polls HubSpot CRM emails (`sales-email-read`), matches contacts that have a
`[CLIENT-MANUAL]` deal, then:

| Event | Deal action |
|-------|-------------|
| Outbound email (HubSpot UI) | → `decisionmakerboughtin` (⏳ Sent) + note `📧 EMAILED` + +4 day follow-up |
| Inbound email reply | → `contractsent` (💬 They replied) + complete follow-up tasks |

State (idempotent): `docs/selling/.hs-manual-email-watcher-state.json` (gitignored).
Optional Oracle cron every 10 min. Agents may also run it at session start.

---

## WhatsApp Business ↔ HubSpot (can we connect?)

**Native HubSpot WhatsApp channel** (inbox / coexistence with WhatsApp Business App):
requires **Marketing Hub Professional or Service Hub Professional** (or Enterprise) —
**not available on Starter** (Aldeazz startup is Starter). Docs:
[Connect WhatsApp to inbox](https://knowledge.hubspot.com/inbox/connect-whatsapp-to-the-conversations-inbox) ·
[Coexistence](https://knowledge.hubspot.com/inbox/connect-a-whatsapp-number-to-hubspot-using-coexistence).

| Option | Fits Starter? | Notes |
|--------|---------------|-------|
| Native HubSpot WhatsApp + coexistence | No (needs Pro) | Best long-term: send/reply logged in CRM; could auto-advance like email |
| Marketplace / 3rd-party WA bridges | Sometimes | Extra cost; Meta Business API templates still apply |
| Current Manual Prospect Play | **Yes** | One-click `web.whatsapp.com/send` + Elena says `sent` / `they replied` |

**Recommendation while on Starter:** keep WhatsApp as today (manual report). Use the
**email watcher** for HubSpot-sent email. Revisit native WA if/when upgrading to Pro.

---

## Staged deals (July 19–20 2026)

| Company | Deal ID | Draft |
|---------|---------|-------|
| Nomad Constructions Corp | 62832583063 | `docs/selling/drafts/nomad-constructions-corp.txt` |
| DoPanama | 62821413988 | `docs/selling/drafts/dopanama.txt` |
| Panama Fertility | 62828946074 | (staged earlier) |
| Panama Aesthetics | 62873560951 | `docs/selling/drafts/panama-aesthetics.txt` |

Registry: `docs/selling/outreach-registry.json` · Packs: `docs/selling/prospects/*.md`

---

## WhatsApp note links (July 19 final, CORRECTED after live send test)

HubSpot note href = **`web.whatsapp.com/send`** built by `buildHubSpotWaAnchor(phone, draft)` — real
`<a href="https://web.whatsapp.com/send?phone=507…&amp;text=…">`, not HTML-escaped; the URL's `&` is
written `&amp;` in the href. **Never `wa.me` for emoji messages** — its server redirect corrupts
4-byte emojis to `�` on desktop WhatsApp Web (proven live, commit `8dc4d63`). Drafts UTF-8,
`encodeURIComponent` once. See `MANUAL_PROSPECT_PLAY.md` §4 for emoji rules.

---

## What NOT to use

- **Zapier MCP** — not required; optional for other apps
- **Legacy private app creation** — use existing **Service Key** instead
- **Developer API Key** — wrong product (marketplace apps)
- **Committing `.env` or pasting `pat-na1-…` in chat**

---

## Related docs

- `docs/HUBSPOT_NAMING.md` — deal prefixes (`[CLIENT-MANUAL]`, `[HIRING-VJH-*]`, etc.)
- `docs/selling/MANUAL_PROSPECT_PLAY.md` — outreach template + iron rules
- `docs/oracle/ORACLE_ALL_PRODUCTS_RESILIENCE.md` — Oracle HubSpot wiring
