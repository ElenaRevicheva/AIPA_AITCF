# RE/MAX Millenium Panamá — research behind the staged deal

> Companion to `REMAX_MILLENIUM.md`, which is **generated** by
> `stage-manual-prospect.cjs` and overwritten on every run. This one is hand-written and
> holds the sourcing.
>
> Staged 2026-08-07 · deal **63570315139** · live audit **88/100 A** (Tech 93 ·
> AI Access 91 · GEO 88 · AEO 81).

## Who they are

RE/MAX franchise office at the **World Trade Center, Marbella, Panama City**. Owners
**Jose Jardim** (native Portuguese speaker) and **Maria Flores**, with roughly a dozen
associates. Inventory spans sale, rent, commercial and new developments, from El Cangrejo
apartments around $220–340k to Punta Paitilla oceanview rentals and commercial space in
Colón. The site is written in English and aimed at the international buyer.

**Not** RE/MAX Millennium of Vaughan/Toronto (`remaxmillennium.ca`, two n's) — same name,
different company, and the one most searches return first.

## Contact evidence

| Channel | Value | Source |
|---|---|---|
| WhatsApp | **6707-2042** → `50767072042` | published on their own site — the staging scrape found it as both a `tel:` link and page text across the contact and team pages |
| Email | `info@remax-millenium.com` | `mailto:` on the site, authoritative |
| Owner | `jljardim@remax-millenium.com` · +507 6851-6654 | signed off on the company's LinkedIn posts — kept here as the escalation path, not staged |
| Office | +507 393-6073 | directory listings |

Nothing needed a `preferredPhone`: unlike Abolu, this site publishes a Panama mobile, so
the scrape alone produced a WhatsApp-capable number.

## What the audit found (Aug 7 2026)

`score 88 A | aiAccess:91 geo:88 aeo:81 techSeo:93` — *"strong AI visibility; polish
Answer-Readiness (AEO) to stay ahead."*

- **FAIL** `question-headings` — not one heading phrased as a question
- **WARN** `robots-txt` (absent), `llms-txt` (absent), `schema-answer` (no
  FAQPage/HowTo/Article/Product/Service), `entity-links` (no sameAs),
  `freshness-signal` (no machine-readable dates)
- **WARN** `response-time` — 3040 ms to serve the HTML

## Why they fit the ICP, and what the letter says

High-ticket, international, WhatsApp-close. Above 85 the play switches to the credential
letter: the score opens as proof the audit is real, followed by *"no les voy a inventar un
problema que no tienen"*, and the ask pivots to their actual bottleneck — the buyer
arrives from another country and another time zone, and the first question is almost never
about a property. It is whether a foreigner can buy without residency, what taxes apply,
whether there is financing. The pitch is that first contact answered 24/7 in English and
Spanish, the buyer qualified on budget, zone, timeline and cash-vs-financed, the viewing
booked, and the asesor handed a briefed lead — plus reactivation of the ones who asked
months ago and never came back.

The six audit gaps are offered free at the end of the letter, not sold.
