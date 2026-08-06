# [CLIENT-MANUAL] Abolu Best Value — staging brief

> Researched Aug 6 2026. **Not staged yet** — the deal, the letters and the send buttons
> are produced by the command below, which needs the live visibility audit and the
> HubSpot Service Key. This file is replaced by the generated note pack on the first run.

## Stage it

```bash
node scripts/stage-manual-prospect.cjs abolu.net --with-fu
git add docs/selling/outreach-registry.json docs/selling/drafts/abolu-best-value*.txt docs/selling/prospects/ABOLU_BEST_VALUE.md
git commit -m "selling: stage Abolu Best Value" && git push origin main
```

One run creates company + contact + deal (`qualifiedtobuy`, owner Elena) + note + HIGH
send task, writes `abolu-best-value.txt`, `abolu-best-value-email.txt` and
`abolu-best-value-fu-email.txt`, registers the `abolu-best-value` and
`abolu-best-value-fu` slugs, and leaves four click-to-send buttons on the note:

| Button | Opens |
|---|---|
| `➡️ ENVIAR POR WHATSAPP (+507 6670-8797)` | WhatsApp Web, first-contact letter prefilled (laptop only) |
| `➡️ ENVIAR POR EMAIL — aipa@aideazz.xyz` | `/go/outreach-email/abolu-best-value` → preview → Resend |
| `➡️ WHATSAPP FU (laptop)` | WhatsApp Web, AI Growth Operator follow-up prefilled |
| `✉️ EMAIL FU — aipa@aideazz.xyz` | `/go/outreach-email/abolu-best-value-fu` |

The push matters: the email buttons resolve from the pushed registry, so an unpushed
staging shows *Unknown outreach email slug*.

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

Every value below is published by Abolu, and the source is named so it can be rechecked.

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
   open. `preferredPhone` in `PROSPECT_META` supplies the number from the catalogue.
2. **6981-6633 is not the sales line.** It appears in the bilingual catalogue's running
   footer always paired with WeChat, which makes it the export desk. It is deliberately
   not staged.

## Why they fit the ICP

High-ticket, WhatsApp-close and B2B: their customer is a hardware-store owner placing
repeat wholesale orders, who already messages suppliers outside call-centre hours. The
hook is that 8,000 SKUs live in a PDF and behind a login, so a buyer asking an AI engine
which wholesaler to use gets no citable answer from the largest one in the country — and
the Operator pitch lands on the order channel they already run on WhatsApp.

The angle the letter takes depends on the live audit: below 85 it leads with the citable
answer gap; at 85+ the script switches to the credential opening and the pitch in
`pivot` (24/7 order-taking, stock lookups, reactivating stores that stopped buying).
