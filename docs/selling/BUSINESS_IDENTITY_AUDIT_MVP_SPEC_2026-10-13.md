# AIdeazz Business Identity Audit: MVP specification (pilot, 9 businesses)

13 Oct 2026, Claude Code, from Elena's requirements. **Spec only, nothing built.** Background:
`NO_WEBSITE_BUSINESSES_AUDIT_2026-10-08.md` (§6–8), pilot list `NO_WEBSITE_LEADS_PANAMA_2026-10-12.md`.

**Goal of the MVP:** prove that owners **reply, pay $100, and implement**, before automation money is spent.
Everything below is the smallest version that can be run by hand on 9 businesses, with scripts only where they save
real time or prevent a wrong fact.

## 0. Hard rules (from the requirements)
1. One business, any combination of channels: Google Maps, Instagram, WhatsApp Business, optional website.
2. Owner-verified facts are the only source for anything we write or publish.
3. **No numerical scores**, no AI-visibility score, no ranking promise, no "ChatGPT doesn't recommend you" unless a dated query log exists.
4. **Nothing is published or changed on any platform without the owner's written approval** (a WhatsApp "sí, apruebo" counts; save it).
5. No automated Instagram reading, no Google Business Profile edits by API, no entity-resolution engine.
6. Reuse existing AIdeazz code wherever practical (§6).

## 1. Data model

One JSON file per business: the **record**. Lives in the private repo `aideazz-private-docs/bia/<slug>.json`
(it holds phones and owner names; `AIPA_AITCF` stays public until ~20 Nov, so never there). Screenshots go to HubSpot
as PRIVATE files on the deal (`scripts/hs-files.cjs`), referenced by file id.

```jsonc
{
  "slug": "mundo-dental",
  "hubspot_deal_id": null,                     // set when staged
  "vertical": "dental",
  "city": "Panama City", "country": "PA",
  "channels": {                                // any combination; absent = business does not use it
    "google_maps": { "url": "https://maps.google.com/?cid=…", "found_by": "places_search", "confirmed_by_owner": false },
    "instagram":   { "url": null,               "found_by": null,          "confirmed_by_owner": false },
    "whatsapp":    { "number": "+507…",          "found_by": "google_phone", "is_business_app": null, "confirmed_by_owner": false },
    "website":     null
  },
  "observations": [                            // what each channel SHOWS. Never edited, only appended.
    { "fact": "hours", "channel": "google_maps", "state": "present",
      "value": "Mon–Fri 9:00–17:00",
      "source": { "url": "https://maps.google.com/?cid=…", "screenshot_file_id": null, "method": "places_api" },
      "collected_at": "2026-10-13T15:02:00Z", "collected_by": "claude" }
  ],
  "canonical": {                               // what the OWNER confirmed. The only input to the kit and the hub.
    "hours": { "value": null, "confirmed_at": null, "confirmed_via": null }   // e.g. "whatsapp 2026-10-15"
  },
  "consent": {
    "outreach_permission": null,               // "yes 2026-10-14" after the permission-first message
    "kit_approved_at": null,
    "hub_publish_approved_at": null,
    "approval_evidence_file_id": null          // screenshot of the owner's written approval
  },
  "funnel": { "contacted": null, "replied": null, "report_sent": null, "paid": null, "implemented": null, "inquiries_reported": null }
}
```

### 1.1 The fact list (12 facts, fixed for the pilot)
`name` · `category` · `address` · `phone` · `whatsapp_number` · `hours` · `services` (list) · `prices_or_from` ·
`booking_method` · `languages` · `description` · `public_links` (the genuine profiles of the same business).

### 1.2 Observation states: what ONE channel shows for ONE fact
| State | Meaning | Example |
|---|---|---|
| `present` | The channel shows a value. Value, source and date are saved. | Google shows hours 9–5 |
| `empty` | The channel **has** the field and the business left it blank → a real **missing** item. | WhatsApp Business profile has an hours field, left empty |
| `not_exposed` | The platform has **no such field** or keeps it private. **Never a finding, never a penalty.** | Instagram has no structured hours field (verify on business #1) |
| `not_checked` | We have not looked yet. **Blocks the report** for that fact. | WhatsApp column before Elena opens the profile |

> The platform capability table (which fields each platform exposes) is **assumed until checked on the first business**,
> then frozen in `bia/platform-fields.json`. Google rules change (e.g. Q&A availability), so the kit only recommends
> fields that the table marks as available.

### 1.3 Fact verdicts: one fact compared across channels
| Verdict | Rule |
|---|---|
| ✅ `match` | ≥2 channels `present` and equal (after normalising spacing, accents, phone formats, 24h/12h time) |
| ⚠️ `conflict` | ≥2 channels `present` and different |
| ❌ `missing` | ≥1 channel is `empty` for a fact customers need (hours, phone/WhatsApp, address, services, booking) |
| ◽ `single_source` | Only one channel shows it; nothing to cross-check (not bad, just unconfirmed) |
| ❔ `unverified` | Any verdict above where the owner has not yet confirmed the true value (an orthogonal flag) |
| ⏸ `not_checked` | At least one relevant channel is still `not_checked`; no verdict yet |

`not_exposed` channels are simply left out of the comparison.

## 2. Customer journey (with the approval gates)

| # | Step | Who | Gate |
|---|---|---|---|
| 1 | Google column filled from Places (hours, phone, address, category, rating, reviews, description, Maps URL) | script | — |
| 2 | Instagram found (web search or the link on Google) and looked at by hand; WhatsApp profile opened on Elena's phone; screenshots taken | Elena, ~10 min | — |
| 3 | **Permission-first WhatsApp:** "I compared how your clinic appears on Google, Instagram and WhatsApp and found a few mismatches patients would notice. May I send you the 1-page summary?" | Elena, laptop | **G1: they say yes** |
| 4 | Free mobile report sent (link or PDF): top 3 findings + "what we could not see" section | script → Elena | — |
| 5 | Offer: $100 diagnostic + kit (existing pay page `aideazz.xyz/pay/analisis-tecnico`) | Elena | **G2: payment** |
| 6 | Owner confirms the 12 canonical facts (a short WhatsApp checklist, answered in one go) | owner | **G3: facts confirmed** |
| 7 | Kit generated from the canonical record only, checked by the grounding gate, reviewed by Elena | script + Elena | **G4: kit approved by owner** |
| 8 | Owner pastes the kit (or gives Google manager access, with explicit consent, and keeps ownership) | owner | — |
| 9 | Optional identity hub drafted, shown to owner | script + Elena | **G5: publish approval in writing** |
| 10 | 30 days later: re-check the same channels by hand, ask "any new patients mentioning Google/Instagram?" | Elena | — |

**Price inside the pilot:** the existing $100 only. The hub is included, transferable on request (they get the HTML file),
and unpublished on request. No monthly fee until a client asks for ongoing work.

## 3. The free report (mobile-first, EN/ES)
One page, readable on a phone in 60 seconds:
1. **Header:** business name, date checked, the channels we looked at (with icons), "no website needed".
2. **Top 3 findings**, picked by fixed priority (no score):
   1. a conflict in **how to contact** (phone, WhatsApp, address);
   2. a conflict in **hours**;
   3. **no clear booking path** (`booking_method` missing on every channel);
   4. **services** missing or unclear;
   5. any other `missing` customer-facing fact;
   6. `public_links`: channels that do not point to each other.
   Each finding: what each channel says (quoted, with date) → why a patient notices → the one-line fix.
3. **"What we could not see"**: every `not_exposed` / `not_checked` item, stated as neutral, so nobody is penalised for a platform limit.
4. **What a fix looks like:** one example quick reply and one example Google description, from verified facts only.
5. **Next step:** $100 diagnostic + kit, payment link, WhatsApp button.

Banned wording (enforced in the template, not left to a model): numbers out of 100, "ranking", "guarantee",
"ChatGPT does not recommend you", "invisible".

## 4. The bilingual kit (EN + ES)
Generated **only** from `canonical` (never from `observations`):
- WhatsApp Business: business description, greeting message, away message, 8–10 quick replies (hours, location, services, price-from,
  booking, payment, languages), follow-up for patients who went quiet;
- Google Business Profile: description, services list, and only the fields the platform table marks as available;
- Instagram: bio, link-in-bio choice, 5 captions explaining treatments;
- review request (WhatsApp text);
- an **implementation checklist** per platform, with "already correct / change / add".

**Fact guard, reused:** every number in the kit must appear in the canonical record (`ungroundedNumbers`, `src/cover-letter.ts:462`),
and every quoted price, credential or treatment must be found in the record (`quotedIn`, same file). A failure blocks the kit and
names the line. **Dental rule:** no medical claims, no outcomes, no credentials or prices the owner did not confirm.

## 5. The optional identity hub
A single static page, `aideazz.xyz/c/<slug>`, published only after G5:
- a flat file `public/c-<slug>.html` in the aideazz repo + one `_redirects` line (`/c/<slug> /c-<slug>.html 200`) before the catch-all;
  a plain push to `main` (no `[skip ci]`) deploys it;
- its own title, meta description, canonical, OG tags, `lang`, and the business's facts as readable text + FAQ + a WhatsApp button;
- **JSON-LD** (the most specific type: `Dentist` / `MedicalClinic` → `LocalBusiness`), with `name`, `address`
  (`PostalAddress`), `telephone`, `openingHoursSpecification`, `geo` if confirmed, `url` (the hub itself),
  `sameAs` = **only** the genuine public profiles the owner confirmed (Google Maps URL, Instagram), and
  `contactPoint` = WhatsApp/phone with `contactType: "customer service"` and `availableLanguage`;
- **no** AIdeazz Organization schema on it, so the page is about the business, not about AIdeazz; a small "page by AIdeazz AI Lab" footer;
- validated before publishing: our own audit run on the hub URL (`runVisibilityAudit`) must pass `schema-identity`, `entity-links`,
  `canonical`, `html-lang`, `ssr-content` (crawlers see the facts without JavaScript);
- the owner can take the HTML file to their own domain later. Indexing and AI citation are **not promised** and are tracked separately.

## 6. Reuse map (what already exists)
| Need | Existing code | Change |
|---|---|---|
| Google column | `src/prospect-places.ts` Places Text Search + Details | none; a pilot script calls the same endpoints with a wider field mask (hours, description, rating) |
| Website column (optional) | `src/visibility-audit.ts` `runVisibilityAudit` (JSON-LD identity, sameAs, meta description) | none |
| Instagram handle / other mentions | web search by hand; `src/brightdata-enrich.ts` `bdSerpSearch` if volume grows | none |
| Evidence screenshots in the CRM | `scripts/hs-files.cjs` (PRIVATE files, idempotent, note attachments) | none |
| Deal + task + note | HubSpot staging (`[CLIENT-MANUAL]`, stage 🔥 I Act TODAY), MCP or `src/hubspot-client.ts` | none |
| Outreach one-click | `src/go-wa.ts` / `scripts/wa-link-lib.cjs` wa.me builders | none |
| Payment + paid deal | `/pay/analisis-tecnico`, `src/diagnostic-delivery.ts`, `src/paid-order-hubspot.ts` | the planned guard clause (empty/"none" website) |
| Fact guard for the kit | `ungroundedNumbers`, `quotedIn` (`src/cover-letter.ts`), blog grounding pattern (`src/blog-evidence.ts`) | none, imported |
| Finding explanations style | `CHECK_WHY` / `buildVerdict` in `src/visibility-audit.ts` | copy the style |
| Identity hub hosting | aideazz repo `public/` + `_redirects` | one file + one line per business |
| Hub validation | `runVisibilityAudit` on the hub URL | none |

## 7. What gets built for the pilot (and nothing else)
| # | Piece | What it does | Effort (agent days, rough) |
|---|---|---|---|
| B0 | Two guard clauses already approved in principle | diagnostic `none`/empty website; audit says "no owned website" for social/Maps links | 0.5 |
| B1 | Record schema + `bia validate` | JSON schema for §1, refuses bad states (e.g. a verdict while `not_checked`) | 0.5 |
| B2 | `bia google <slug>` | fills the Google observations from Places with source + timestamp | 0.5 |
| B3 | `bia matrix` + `bia report` | computes verdicts (§1.3), renders the mobile EN/ES report (§3) as static HTML/PDF | 1.5 |
| B4 | `bia kit` | templates + model-written prose from `canonical`, blocked by the fact guard (§4) | 2 |
| B5 | `bia hub` | writes `c-<slug>.html` with the JSON-LD (§5), runs the audit on it after publishing | 1 |
| B6 | `bia hubspot` | writes the matrix + report link as a note, attaches screenshots, moves funnel stage | 0.5 |
| | **Total** | | **~6.5 agent days**, honest range 5–9 |

All are CLI scripts in `cto-aipa/scripts/bia/`, run by Claude or Elena. **No public API endpoint, no Oracle service, no cron**
in the pilot. Running cost: Places ~cents per business; the kit's model calls ~cents per business (to measure).

**Elena's time per business (manual parts):** ~10 min collecting Instagram/WhatsApp + screenshots, the outreach, one fact-confirmation
chat, kit review. Measure it on business #1; it is the number that decides what to automate first.

## 8. Not in the MVP (on purpose)
AI-visibility scoring or probes · automated Instagram reading · Google Business Profile edits by API · entity-resolution engine ·
monthly measurement automation · public API endpoint · WhatsApp AI assistant (sold separately, built per paying client) · monthly pricing.

## 9. Pilot success test
Track in HubSpot per business: contacted → said yes to the report → report sent → paid $100 → implemented → reports new inquiries.
**Decision rule:** if ≥2 of 9 pay, automate the piece that took Elena the most minutes. If 0–1 pay, the problem is the offer or the
channel, not the software, and nothing more gets built.

## 10. Risks
- **WhatsApp number bans:** permission-first message, sent personally, few per day, no bulk.
- **Panama data protection:** store only business contact data, in the private repo / HubSpot; delete a record on request.
- **Platform fields change:** the capability table is checked on business #1 and re-checked before each kit.
- **Hub hosted on aideazz.xyz:** it is a page *about* the business on our domain; tell the owner plainly, offer the file for their domain.
- **Small clinics:** most of the 9 have 0–27 reviews; budgets may be small. The pilot measures this.

## 11. Revision 13 Oct (Elena): maximum reuse, near-zero build

**New fact:** since 13 Oct the Atlas Monday job reads Google Places with Elena's key (self-cap 300/month, ledger
`data/places-usage.json` on Oracle; commits `65e74faa`, `f14b992c`). Its `mapsSearch()` (`scripts/atlas-lead-machine.cjs:490`)
**already receives the no-website businesses and drops them** (`.filter((x) => x.websiteUri …)`, ~`:514`).
The 5 laptop Places requests of 12 Oct (the pilot list) used the same key and are **not** in that ledger.

**So the pilot needs almost nothing new:**
| Spec piece | Max-reuse replacement | Build |
|---|---|---|
| Finding businesses (B2) | Atlas Monday already fetches them: **keep** the no-website results in a side file + 1 line in its Telegram digest instead of dropping them. Add `places.googleMapsUri` to its field mask. Same request, no extra Places calls; nothing else in Atlas changes. | ~10 additive lines, Elena's go |
| Record + validator (B1) | **HubSpot is the record**: Company (name, phone, address, city), Deal, and one Note holding the evidence matrix + canonical facts + consent lines. Screenshots via `scripts/hs-files.cjs` (PRIVATE). | 0 |
| Matrix + mobile report (B3) | For 9 businesses: written per business by Claude; the "mobile report" is the WhatsApp message itself (3 findings). | 0 |
| Kit generator (B4) | Written per paying client by Claude from the confirmed facts, checked with the existing `ungroundedNumbers` / `quotedIn` (`src/cover-letter.ts`). | 0 |
| Identity hub (B5) | Hand-written flat file per paying client + `_redirects` line, then `runVisibilityAudit` on it. | 0 |
| HubSpot glue (B6) | MCP / existing staging; deals in 🔥 I Act TODAY surface in the morning brief. | 0 |
| Sales samples | `docs/selling/aigo-kit.cjs`: deck PDF + the industry promo film (already in Atlas letters). | 0 |
| Payment | `/pay/analisis-tecnico` ($100), existing delivery to HubSpot. | 0 |

**Total build for the pilot: B0 (two guard clauses) + the Atlas keep-no-website change ≈ 0.5–1 agent day.**
B1–B6 are built only after ≥2 of 9 pay, and only the piece that took the most minutes.
