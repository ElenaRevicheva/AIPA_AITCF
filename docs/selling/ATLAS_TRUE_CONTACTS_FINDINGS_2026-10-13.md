# Atlas: where the "true contacts" feature went, and how to bring it back (13 Oct 2026)

Elena: "some weeks ago an agent encoded a great feature of finding true contacts, numbers and websites — find out what it was, we should make it work."
Read-only dig. No code changed by this document. Contacts (emails/phones) are deliberately NOT in this file (repo public until ~20 Nov).

## What it was: Google Maps business data as the lead source

Until 11 Aug 2026 the Atlas lead machine took its leads from **SerpAPI's `google_maps` engine** (`mapsSearch()` in
`scripts/atlas-lead-machine.cjs`, still in the file, now dead). Every result was a business's own Google profile: **real name, its
own website, its phone (→ WhatsApp), rating and review count.** That is the "true contacts, numbers and websites".

- **11 Aug:** the SerpAPI plan was cancelled with 0 searches left. `mapsSearch()` threw, every lane hit `continue`, Mondays staged nothing.
- **17 Aug (`2ca559d8`):** supply moved to **Bright Data organic Google search**. Organic search returns `{title, link, description}` —
  web PAGES, not businesses. Same day (`d21cffe8`) the phone had to be re-scraped from sites, because organic results carry none.
- **Result, measured on the 12 Oct batch (8 leads):** a blog post ("This is how much my destination wedding cost…") staged as a company,
  two global hotel chains whose sites block bots (scores measured a 403 page), a placeholder address recovered from Google's index, a
  guessed address pattern, a complaints desk. Hunter's 21 Sep report shows the same shape: "Top 10 Clinics in Cancun",
  "Medical Tourism in Colombia: A Guide for American…" — articles, not buyers.

## The replacement already exists and works

**Google Places API (New)** — built 13–14 Apr 2026 (`42fab483`, `915696fc`) as `src/prospect-places.ts` (cto-aipa endpoint
`POST /outreach/ingest-places`, feeds the separate outreach DB, not Atlas). Key on Oracle answers **HTTP 200** (13 Oct). Used by hand on
12 Oct for the no-website dental batch (`NO_WEBSITE_LEADS_PANAMA_2026-10-12.md`).

**Live proof, same words as Atlas's 12 Oct search** (`destination wedding venue Cartagena Colombia`, one Places request, 13 Oct):
10 of 10 results are real local businesses, **10 of 10 with a phone**, 9 with their own website (1 Instagram-only → the no-website play):
Casa 1537 (4.8★, 500) · Casa Santos de Piedra · Two Lovers (Two Travel's wedding arm) · Casa de Don Andrés de Madariaga y Morales ·
Kathy Bodas y Eventos · Sofitel Legend Santa Clara · DVEntique · Bodas Cartagena Mágica · Casa Pestagua Hotel · Premier Weddings and Events Rentals.
Small venues and planners with WhatsApp = the ICP. Bright Data organic returned a blog post and Four Seasons/Hyatt for the same words.

## The other two contact tools (working, keep)

| Tool | Built | What it finds | State 13 Oct |
|---|---|---|---|
| **Hunter owner sweep** `scripts/hunter-owner-sweep.cjs` | 8–9 Aug | the OWNER / marketing person's email at a known domain (only hits are billed) | cron 21st monthly; 21 Sep run: 57 domains → 49 with people → 7 decision-makers added. Credits 0/50 until reset 20 Oct. Its log was emptied 9 Oct (disk housekeeping); the report file is the record. |
| **Site contact scraper** `parseContacts()` in `scripts/stage-manual-prospect.cjs` | Jul–3 Oct | emails/phones/WhatsApp the site itself declares: mailto, Cloudflare-hidden emails (`data-cfemail`), wa.me links, placeholder filter (`jane@company.com`…) | used only by the hand stager; Atlas has its own weaker finder plus a Google-index "recovery" that produced the placeholder and the guessed address on 12 Oct |

## Plan (awaiting Elena's go — touches the Monday machine)
1. Atlas supply: **Places first** (same fields `mapsSearch()` used to return: name, website, phone, rating, reviews; skip closed businesses),
   Bright Data organic only as fallback. Restores the phone → WhatsApp close channel on every lead.
2. Atlas email: reuse the hand stager's `parseContacts()` rules (one implementation, not two) and stop accepting Google-index
   addresses that are placeholders or not printed verbatim on the business's own pages.
3. Audits that answer HTTP 403 are not scored in the letter (the 13 Oct backfill rule, made permanent).
4. Hunter unchanged; with real company domains its 21 Oct run finds owners instead of article authors.
5. Behind a switch like the kit, proved identical when off, then one `--dry` comparison run (same niches, Places vs Bright Data) before Elena decides.

Cost: Places Text Search with phone/website fields is a paid Google SKU with a monthly free allowance; Atlas makes ~15 searches a week.
Check Elena's Google Cloud billing page for this key's allowance before switching on.
