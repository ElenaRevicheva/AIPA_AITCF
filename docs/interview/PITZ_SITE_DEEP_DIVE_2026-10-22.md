# Pitz — how it works (read from pitz.com.mx in Chrome, 22 Oct 2026)

Every fact below was read on the live site that day (EN pages unless marked ES). Their own marketing claims are marked
"(site claim)". Two internal inconsistencies are flagged. Nothing here comes from outside the site.

## What Pitz is
- Positioning: "More than shop management software: an AI operating system for repair shops." Mission: get any vehicle
  "diagnosed, quoted, repaired and back on the road in under 24 hours" (About). "The technology layer for auto repair",
  "never … another ERP".
- Three pillars (About): **AI** (diagnosis support, symptom interpretation, building estimates) · **Shop operations**
  (repair orders, inventory, customers, finances, team productivity) · **Parts marketplace** (direct line to distributors).
- Founded **2025**. Operating in **Mexico and Brazil**; "Coming soon: Colombia and the United States". "International
  investment" — investors not named on the site.
- Scale (site claims): +1,000 repair shops and parts stores; +100 distributors; **+52,300 parts for sale (home) vs
  80,000+ (About)** ← inconsistent; "hundreds of thousands of repair orders processed".

## The AI copilot — one assistant, named per market
- ES (MX): **"El Chalán"** — "Conoce a tu Chalán, el experto de tu taller." EN: **"Joe"**. (Brazil: likely "João" — not
  checked; the BR site is a separate domain.)
- What it does (site): expert diagnosis from a described symptom (likely diagnosis, how to fix, what to check — "your
  newest mechanics perform like veterans from day one"); **handles purchasing** (builds and manages carts on the parts
  marketplace); available everywhere on the site, "one click away", 24 h. Diagnoses and quotes "in seconds".
- Hero chips: LIVE · DIAGNOSIS READY · PART FITS ✓ (MX: "REFACCIÓN COMPATIBLE") — i.e. fitment check is part of the story.
- Blog, 15 Oct 2026 — **voice diagnostics**: hands-free commands in the shop ("Show engine fault codes", "Record spark
  plug replacement in the work order", "Check availability of oil filter"), integrated with work orders, inventory,
  vehicle history and parts catalogs; assistant that learns frequent procedures and suggests preventive checks.

## Three customer types (one platform, role-based)
1. **Repair shops** — "Fix any car in 24 hours and invoice up to 3x more" (site claim). Modules: work orders & quotes,
   inventory, customers & vehicles (full history), accounting (receivables/payables/invoicing), parts marketplace,
   reports. Roles: Owner / Manager / Mechanic. WhatsApp to the end customer: car checked in, car ready, next service due;
   quotes over WhatsApp in one click.
2. **Parts stores** — point of sale & quotes, inventory, customers, supplier purchasing, marketplace, accounting.
   Roles: Owner / Manager / Salesperson. WhatsApp: quote ready, part arrived, order about to be filled.
3. **Distributors** — online catalog (stock by SKU, prices), orders & sales, customers, inventory, marketplace, sales
   campaigns. WhatsApp: order received, filled, shipped; restocking reminders to their customers.

## Pricing (MXN / month, all with 30 days free, no card, month to month)
- Shops & parts stores: **Ultra Básico $399** (1 location, 1 admin, no sales module) · **Básico $999 — most popular**
  (1 location, 2 admins, 30 quotes/mo, inventory, invoicing 20/mo, dashboard) · **Plata $2,599** (3 locations, 5 admins,
  150 quotes/mo, unlimited invoicing) · **Oro $4,999** (10 locations, 5 admins, unlimited quotes & sales).
  **Joe/Chalán, vehicle history, customer management and the marketplace are included in EVERY plan.**
- Distributors (marketplace): **Free** (20% commission, payout every 30 days) · **Express $2,999 — most popular** (15%,
  every 15 days; campaigns, buyer data, catalog benchmark) · **Premium $9,999** (12%, every 7 days; dedicated finance
  team, weekly performance).
- → Business model: SaaS subscriptions from shops/stores + **take rate on marketplace sales** (12–20%) + payout speed as
  an upsell. The AI is the hook in every tier, not an add-on.

## Proof they show (site claims)
- 90-day pilot shop, "same team, same shop": monthly revenue **$120K → $150K (+25%)** without hiring; **+22%** work
  orders scheduled/month; time to quote & reply **6 → 2 days**; full cycle drop-off→delivery **12 → 8 days**.
- One testimonial: Mauricio Lozano, Distribuidora Lozano (Mexico City) — reach shops nationwide without growing sales.

## Team (About)
- **Natalia Salcedo** — CEO & Founder (ex-JOKR, Rappi, Meru; >10 years scaling LatAm startups).
- **Majo Campo — Product & Tech Director** (ex-Quartile, ClearSale, Electrolux) ← the likely manager for a developer role.
- José Molina (Finance & Legal; ex-Meru, DiDi, HSBC) · Sergio Agudelo (Operations; ISO 27001 consulting) · Laura Roldán
  (People) · Bruno Borges de Souza (Country Manager Brazil) · Arthur Pires (Sales) · Gabriel Freitas (Category) ·
  Daniel Amaya (RevOps; ex-Platzi). Team in Mexico and Brazil.

## Tech visible from the outside
- Site: **Next.js**; analytics **PostHog** + GA4 (G-HZN2C1JZ96) + GTM; JSON-LD Organization, LocalBusiness, WebSite,
  SoftwareApplication, WebPage, FAQPage (they care about SEO/AEO).
- Markets as separate sites (hreflang): es-MX pitz.com.mx/es · pt-BR **pitz-app.com.br** · en-US **usepitz.com**.
- App: app.pitz.com.mx (login/register). WhatsApp entry: pitz.trb.ai (domain suggests Treble.ai — not confirmed).
- Support: soporte@pitz.com.mx, +52 1 55 4585 9033 (Mon–Fri 9–18 MX).

## What this means for Elena (reading, not fact)
- Their stack of problems = her stack of proof: an AI copilot that must not invent (her grounding / fail-closed work),
  WhatsApp flows to end customers (her Twilio/WhatsApp agents), a marketplace that needs catalog search and fitment
  (her RAG-measured-before-shipped story), voice in the shop (her Whisper + TTS voice agents), multi-market ES/PT/EN
  (her locale-mismatch lesson of 21 Oct: LatAm ads are written in Spanish, search in the market's language).
- Gaps to ask about, not claim: which LLMs power Joe/Chalán; how fitment is verified; how the AI quote is checked before
  it reaches a customer; how they evaluate the assistant.
