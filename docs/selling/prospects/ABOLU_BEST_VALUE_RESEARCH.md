# Abolu Best Value — research behind the staged deal

> Companion to `ABOLU_BEST_VALUE.md`, which is **generated** by
> `stage-manual-prospect.cjs` and overwritten on every run. This file is hand-written and
> holds the sourcing, so a later staging run cannot erase where the numbers came from.
>
> Staged 2026-08-06 · deal **63550690308** · live audit **89/100 A** (Tech 86 · AI Access
> 100 · GEO 81 · AEO 88).

## Who they are

**Abolu, S.A.** (RUC 16429-109-156121, Grupo Caco Abbo) — the largest hardware wholesaler
in Panama. Their own material claims 8,000+ SKUs, 50+ brands, nationwide delivery under
48 hours, merchandising support and returns up to 6 months. They distribute the group's
own **Best Value** tool brand, which Caco Abbo designs and ships to 35+ countries from
Panama City, Ningbo, Florida and Mexico City.

- Site: `abolu.net` (Wix) · ordering portal `abolu.com` (login required) · catalogue: PDF
- HQ: Edificio Abolu, Calle 2da, Llano Bonito, Juan Díaz, Panama City
- Hours: Mon–Fri 08:00–16:00, Sat 08:00–12:00
- Officers: José Mayer Abbo Lustig (president), Lucía Lustig de Abbo, Joel Abbo Lustig

## Contact evidence

Every value is published by Abolu, and the source is named so it can be rechecked.

| Channel | Value | Source |
|---|---|---|
| WhatsApp | **6670-8797** → `50766708797` | Abolu product catalogue ordering panel: "WHATSAPP 6670-8797 / CALL CENTER 233-7525 / VÍA EMAIL VENTAS@ABOLU.NET" |
| Email (staged) | `servicioalcliente@abolu.net` | site footer, contact section |
| Email (sales) | `ventas@abolu.net` | catalogue ordering panel |
| Landline | (+507) 233-7525 · fax 233-7526 | site footer and catalogue |
| Social handle | `abolupanama` | catalogue ordering panel |

Two details worth keeping:

1. **The site alone yields no WhatsApp.** Its only published number, 233-7525, is a
   landline — Panama mobiles start with 6 — so the scraper finds nothing WhatsApp can
   open. The live staging run confirmed it: `CONTACTS {"phones":[],"whatsapp":null}`.
   `preferredPhone` in `PROSPECT_META` supplies the number from the catalogue.
2. **6981-6633 is not the sales line.** It appears in the bilingual catalogue's running
   footer always paired with WeChat, which makes it the export desk. Not staged.

## Why they fit the ICP

High-ticket, WhatsApp-close and B2B: their customer is a hardware-store owner placing
repeat wholesale orders, who already messages suppliers outside call-centre hours.

## What the audit changed about the pitch

At **89/100 A** the site has no visibility deficit to sell against, so the letter took the
credential path: the score opens the letter as proof the audit is real, followed by *"no
les voy a inventar un problema que no tienen"*, and the ask pivots to the order channel —
a 24/7 WhatsApp agent that checks stock, assembles the order, hands it to their rep with
the customer already identified, and reactivates stores that stopped buying. The three
site fixes are offered free at the end, not sold.

Had the audit come back below 85, the same metadata would have produced the standard
citable-answer letter. That branch is chosen at staging time from the live score, which is
why nothing in `PROSPECT_META` hardcodes an audit number.
