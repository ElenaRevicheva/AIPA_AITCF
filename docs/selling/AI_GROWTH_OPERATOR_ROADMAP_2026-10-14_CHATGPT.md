# AI Growth Operator — unified roadmap (ChatGPT, 14 Oct 2026) + Claude Code review

**Status: VISION / north star. NOT authorized for build.** Elena pasted it to Claude Code on 14 Oct 2026; nothing in it has been started.
Any agent (Claude Code, Cursor) that receives this brief must read the review below and get Elena's explicit go before Phase 0–4 work.

## Claude Code review (14 Oct 2026)

**What is right and stays:** one business across any mix of Google Maps / Instagram / WhatsApp / website; owner-verified facts as the
source of truth; Match / Conflict / Missing / Unknown / Owner-verified states; no 0–100 scores; no fabricated citations; AI-visibility
experiments run separately with fixed, dated queries; the audit, the public page and the WhatsApp agent must share the same approved facts;
modular packaging (audit can be bought without the agent); stage gates.

**What conflicts with Elena's standing decisions:**
1. **6–10 weeks of building before revenue.** Elena's golden rule (11 Jul, restated 13 Oct): "No rebuilding. Only surgical, micro, additive
   fixes inside already encoded stuff, and only if it moves me toward money." The 13 Oct pilot spec's decision rule: build software only after
   **≥2 of the 9 pilot clinics pay $100** (`BUSINESS_IDENTITY_AUDIT_MVP_SPEC_2026-10-13.md` §9, §11).
2. **Gate 5 ("commercial results justify further automation") is last.** It must come first: it is the only gate that is not engineering.
3. **The bottleneck is demand, not product** (19 months, 0 won deals; 0 human replies from the pilot so far). A bigger engine does not create
   a buyer.

**Phase 0 mostly exists already** (no new inventory needed): reuse map + build list `BUSINESS_IDENTITY_AUDIT_MVP_SPEC_2026-10-13.md` §6–7, §11;
channel capabilities + Instagram limits `NO_WEBSITE_BUSINESSES_AUDIT_2026-10-08.md` §7–8; fleet map `ORACLE_ALL_PRODUCTS_RESILIENCE.md`.
Correction to ChatGPT's reuse table: **EspaLuz PayPal is not a ready payment path** (webhook signature check disabled, free/paid detection
unreliable — `project_wiring_conductor` memory); the live payment path is the $100 page `/pay/analisis-tecnico`.

**Where each phase stands, done the concierge way (by hand, per paying clinic, no new code):**
| Phase | Concierge version (now) | Software version (only after ≥2 pay) |
|---|---|---|
| 1 Unified audit | Evidence matrix by hand in each HubSpot deal note — **started 14 Oct on the 9 pilot clinics** (real mismatches: Google landline vs Instagram WhatsApp, two business names, a dead old domain) | spec B1–B3 |
| 2 Report + kit | 1-page diagnostic written per clinic; kit written per paying clinic, checked by the existing fact guard (`ungroundedNumbers`/`quotedIn`) | spec B3–B4 |
| 3 Identity hub | One hand-written static page per paying clinic + `_redirects` line, validated by the existing audit | spec B5 |
| 4 WhatsApp agent | Quoted per clinic; built for the first one that pays (WhatsApp Business Platform API, not the app) | Phase 4 |
| 5 Measurement | HubSpot funnel per clinic: contacted → yes → report → paid → implemented | Phase 5 |

---

## ChatGPT's roadmap (verbatim as pasted by Elena)

AIdeazz AI Growth Operator — Unified Product Roadmap
October 2026 · Implementation blueprint for Claude Code · AEO/GEO + Business Identity + WhatsApp AI Agents

**Product vision:** Turn any business — whether it has Google Maps, Instagram, WhatsApp, a website, or any combination — into a more
discoverable, verifiable, and conversion-ready business. Build A (Unified Business Identity Audit) and B (AI Growth Operator) as one product
ecosystem, with independent modules and a shared source of verified business facts. The customer never needs to understand the underlying API.

- **A. Discoverability:** business identity, AEO/GEO audit, cross-channel consistency, public identity hub.
- **B. Conversion:** WhatsApp AI assistant, lead qualification, appointments, CRM, follow-up.
- **Shared verified business knowledge:** the audit, public page, and AI assistant use the same approved information.

### 1. Recommended delivery timeline (indicative)
| # | Phase | Target |
|---|---|---|
| 0 | Inventory and guardrails: inspect existing API, Atlas, CRM, WhatsApp agents, deployment; integration boundaries, regression tests | 2–3 days |
| 1 | Unified business audit: one record, multiple channels, verified facts, evidence matrix, issue detection | 5–7 days |
| 2 | Reports and optimization kit: mobile reports, bilingual ready-to-paste fixes, owner approval, paid diagnostic flow | 4–6 days |
| 3 | AI-readable identity hub: public page, structured data, WhatsApp CTA, analytics, indexing checks | 4–6 days |
| 4 | WhatsApp Growth Operator: knowledge retrieval, safe responses, handoff, qualification, appointments, CRM | 7–12 days |
| 5 | Measurement and commercial pilot: nine-clinic validation, conversion analytics, repeatable AI discovery tests, pricing | 7–14 days |

Total planning envelope ~6–10 weeks; the nine-clinic pilot should start during development.

### 2. Phase 0 — audit what already exists
Reuse candidates: website AEO/GEO audit API (preserve); Instagram/Maps/WhatsApp URL recognition (intake + channel classification); Atlas
(prospect acquisition); HubSpot (tracking); EspaLuz and other messaging agents (messaging patterns); LLM routing and evaluation (reports,
answer validation, failover); Oracle Cloud (hosting, scheduled monitoring); PayPal subscriptions (payments, where suitable).
Exit criteria: repository map, dependency inventory, risk register, migration plan; existing audits, payments and Atlas keep working.

### 3. Phase 1 — Unified Business Identity Audit
Channel combinations: WhatsApp only · Instagram + WhatsApp · Google Maps + Instagram · Google Maps + WhatsApp · all three · any + website.
Never penalize a business for lacking a website or an account.
Data model, five entities: **Business** (canonical identity, location, category, owner, approval state) · **Channel** (platform, URL/id, access
method, verification) · **BusinessFact** (name, address, hours, services, contact, languages, policies, approval history) · **Evidence** (source,
timestamp, observed value, provenance, confidence, retrieval method) · **Finding** (conflict, missing fact, unsupported claim, opportunity,
priority, suggested fix). The owner confirms the canonical facts (e.g. Google 5 PM vs Instagram 6 PM = conflict until verified).
States: Match · Conflict · Missing · Unknown · Owner verified. V1 may use manual collection and screenshots.
Exit: all channel combinations audited on test businesses with traceable, non-fabricated findings.

### 4. Phase 2 — free reports and paid kits
Free report: three findings + one clear action, mobile-first. Paid kit: ES + EN content for Google Business Profile, Instagram, WhatsApp
Business and the optional page, grounded in verified facts, placeholders/approval for unknowns. No 0–100 scores.
Exit: an owner can read it on a phone, approve corrections, and use the content without technical help.

### 5. Phase 3 — Business Identity Hub
Optional page such as `aideazz.xyz/c/<business>`: services, location and hours, approved FAQs, WhatsApp contact. Static/server-rendered HTML,
canonical URL, LocalBusiness structured data, `sameAs` to verified profiles, sitemap, indexability checks, update timestamps, owner-approved
publishing, exportable/transferable. Same facts as the WhatsApp agent.
Exit: a verified page can be published, updated, validated and monitored without affecting the website audit.

### 6. Phase 4 — WhatsApp AI Growth Operator
Flow: customer writes on WhatsApp → agent retrieves approved facts → answer / qualify / request a booking / escalate to staff → CRM + conversion
analytics. MVP: EN/ES, verified FAQ retrieval, qualification, human handoff, HubSpot logging, appointment-request capture, approved follow-ups,
WhatsApp first. Requires the WhatsApp Business Platform (API), not the app. Clinics: no diagnosis, no invented treatment advice, no unconfirmed
appointments; health-data privacy, retention, escalation. An inquiry from the hub page is not automatically AI-referred: use referrers,
tracking links, "how did you find us".
Exit: a real customer gets an accurate answer, requests an appointment, is handed off when needed; no false booking confirmations.

### 7. Phase 5 — measurement and nine-business pilot
Product quality: all channel combinations tested · 100% of report claims traceable · owner verification before publishing · unknown facts never
invented · agent safety scenarios tested · existing API regression tests pass. AI-visibility experiments separately with fixed queries, markets,
providers, dates. No ranking promises.

### 8. Commercial packaging (pricing hypotheses)
| Package | Pilot price | Scope |
|---|---|---|
| Free Business Check | free | three evidence-backed findings |
| AI Visibility & Identity Kit | $99 one-time | full audit and approved copy |
| Business Identity Hub | $49 setup + $15/month | hosted page, limited updates |
| Managed Optimization | $99–199/month | agreed changes and monitoring |
| WhatsApp Growth Operator | quoted individually | AI messaging, CRM, booking workflow |
First nine: validate the $99 diagnostic and willingness to adopt a public page; test the agent upsell with one willing customer.

### 9. Development gates
Gate 0 architecture reviewed, services protected · Gate 1 evidence matrix works for pilot businesses · Gate 2 reports and kits pass factual QA ·
Gate 3 hub passes structured-data and publishing checks · Gate 4 agent passes safety, integration, handoff tests · Gate 5 commercial results
justify further automation.

### 10. Master brief for Claude Code (summary of ChatGPT's text)
Extend the Visibility API into a Business Discoverability + AI Growth Operator platform for any channel mix. Constraints: preserve production;
reuse infrastructure; no new CRM; no complex connectors before the manual pilot; no scraping of protected content; never fabricate facts,
citations, scores or outcomes; never publish/message/modify third-party profiles without authorization; owner facts canonical; no misleading
SEO scores for website-less businesses; modular, low cost; EN + ES; protect clinic data. Phase 0 = architecture and codebase inventory
(diagram, reusable components, data model, API contracts, migration, security, cost, regression tests), **then STOP for approval**. Phases 1–5
as above. Every phase delivers notes, changes, schemas, tests, security checks, cost, deploy/rollback, demo, limitations. Stage gates; the human
principal approves architecture and production deployment.
