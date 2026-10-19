# Mundo Dental: make it real, not declared (19 Oct 2026)

**Goal (Elena, 19 Oct):** AIdeazz GEO / AEO / Tech SEO plus the AI Growth Operator must work **inside the tools the
client already uses** (Google Maps, WhatsApp Business, Instagram), with or without a website, so the AIdeazz AI Lab
API is useful to **any** client. Mundo Dental, the first "yes" of the 9-clinic no-website pilot, is the proving case.

Client files (private, never in this public repo): `aideazz-private-docs/bia/mundo-dental/`
(diagnostic + `SOURCES.md` + `AI_ANSWERS_2026-10-19.json` + `MENSAJE_2_IA.md`, which holds the shareable link).

## 1. Promise ledger: every claim in the live diagnostic

| # | What the page promises | Real today? | What makes it real | Trigger / owner |
|---|---|---|---|---|
| 1 | 4 findings with dated evidence | **Real.** Logs: Google Places API, RDAP, Linktree, 5 AI engines | Day-0 runs were one-off scratch scripts → make them a command (P2) | P2, agent |
| 2 | "Una sola ficha" identical on Google, WhatsApp, IG, FB, Linktree, Infoguia | **Real as concierge.** We write the texts; the clinic pastes them (we hold no logins) | Kit pre-drafted from verified facts (P1) | On $100 |
| 3 | Verified Google profile per branch | **Real as a guided step.** Only the owner can claim (Google verifies the owner); afterwards they can add AIdeazz as manager | Step-by-step in the kit | On $100, clinic |
| 4 | Own page with schema.org `Dentist` data | **Not built.** 0 code: one flat HTML + JSON-LD, checked with `runVisibilityAudit` | Host on their parked domain if it is theirs (RDAP: registered to 2027-10-02, nameservers inactive), else an aideazz hub page after gate G5 | On $100 + G5 |
| 5 | Fix the directories the AIs read (Infoguia, WhatClinic, Páginas Amarillas) | **Real as concierge.** Infoguia has a "¿Algún Error?" form; ChatGPT + Gemini copy its Sunday hours | Corrections list in the kit | On $100 |
| 6 | Same questions in 5 AIs, today and at day 30 | **Day 0 real** (logged JSON). **Day 30 is not a command yet** | P2 | P2, agent |
| 7 | WhatsApp assistant (AI Growth Operator, module Consultas) | **Not built for clients.** The pattern exists: EspaLuz runs on WhatsApp Cloud API (`EspaLuzWhatsApp/core_logic.py`, Graph `/{PHONE_NUMBER_ID}/messages`). It receives (159 webhook POSTs in 30 days) but its **sends are not logged**, so it is not cited to the client | Discovery questions (§3), then one instance on their number, only when the quote is accepted | P4, on quote |
| 8 | "Todo listo para pegar, ES + EN" for $100 | **Real** via the CTO AIPA document desk (live 19 Oct) | Pre-draft (P1) so delivery is same-day | P1, agent |
| 9 | "$100 credited if you install the assistant" | **Real.** The pay page says "credited toward the audit or the installation" | none | |
| 10 | Pay link `/pay/analisis-tecnico?lang=es` | **Real.** PagueloFacil is live (the only payment so far is Elena's own test) | none | |

**Wording fixed on 19 Oct so the page claims only the above:** "el dominio ya no existe" became "no abre", with the
fix "reactivate it if it is yours"; "propone horarios" was removed (it needs their calendar); "la agenda o CRM que ya
usan" became "un CRM (el que ya usan, o uno que les configuramos)".

## 2. The API gap: useful to a client with no website

`POST /cto/v1/visibility` answers `422 no_owned_website` for Maps, Instagram and WhatsApp links
(`src/visibility-api.ts:390`). The flagship tool refuses exactly the clients we are courting.

- **P3a, presence report instead of 422 (inside the existing handler).** For a Maps link or a name + city, return
  Google Places facts (name, address, phone, hours, website, rating, Maps link, status), a website-on-profile check, and
  a DNS/HTTP check of any domain found. That check alone would have caught Mundo Dental's parked domain. $0 per call
  except Places, which shares Atlas's 300/month self-cap.
- **P3b, AI-answer probe (key-gated, costs money per run).** Brand and category questions across 5 engines. This is the
  same code as P2.

## 3. Order: money first

| Step | Who | Build | What it unlocks |
|---|---|---|---|
| **P0** Reply on WhatsApp with the link (they wrote «Buen dia» at 9:57 on 19 Oct; text in `MENSAJE_2_IA.md`) | Elena | 0 | The $100 |
| **P1** Pre-draft the $100 kit from verified facts: Google texts per branch, WhatsApp greeting + quick replies ES/EN, IG bio, Linktree buttons, Infoguia/directory corrections, GBP claim steps, the `Dentist` JSON-LD page. Marked DRAFT until they confirm the 12 facts | Agent | 0 code | Same-day delivery after payment |
| **P2** Client mode for `citation-probe`: a `CITATION_BRAND` env next to `CITATION_DOMAIN` (today the brand pattern is hardcoded to AIdeazz, `src/citation-tracker.ts:137`); add the `claude` + `grok` engines; keep an answer excerpt per probe; save the run. Day 30 becomes one command, for this client and every next one | Agent, **Elena's go** | Small, inside existing module | The "5 IA, día 0 y día 30" promise |
| **P3** Presence report in the API (§2) | Agent, **Elena's go** | Small, inside existing handler | The API useful for any client |
| **P4** WhatsApp assistant on their number (EspaLuz pattern, prompt limited to their approved facts, staff confirms every appointment, logs to a CRM) | Agent | New instance, **only on accepted quote** | Recurring revenue |

## 4. Ask the clinic (call or chat)

1. ¿Qué herramienta usan para su WhatsApp (Meta Business Suite, Kommo, Respond.io, otra)? The banner says Meta
   Cloud API, so a tool or Meta's inbox is behind it.
2. ¿Usan agenda o CRM? ¿Cuál?
3. ¿Cuántos mensajes de WhatsApp reciben al día, y cuántos fuera del horario?
4. ¿El dominio mundodentalpty.com es suyo? (registered until Oct 2027, nameservers inactive)
5. ¿Cuál es el horario real de cada sede? (today there are 4 versions)
