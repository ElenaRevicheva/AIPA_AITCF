# Client OS — one place to run a client, built for AIdeazz first

**Started 29 Oct 2026.** Trigger: Kartikey Singh's X post (21h old, 51K views, 177 replies)
asking for one platform for agencies/freelancers: project tracking, client chat, docs and
images, invoicing and payments — "would happily pay monthly". Elena replied "Absolutely".

**Rule: build it for our own lab first (dogfooding).** Each step must be usable on its own,
by Elena, on a real client, before the next one starts. Nothing is offered to other agencies
until it has run AIdeazz's own paying work for a month.

## What already exists (reuse, do not rebuild)

| Need | Already built | Where |
|---|---|---|
| A CRM screen she owns | `/queue/` on `daily_queue` (Oracle Postgres), zero HubSpot calls | `src/queue-page.ts`, face at aideazz.xyz/ops (not live yet — NOW.md 29 Oct) |
| Getting paid | $100 diagnostic, PagueloFacil, auto-matched payment | `aideazz.xyz/pay/analisis-tecnico`, `src/service-payment-match.ts` |
| Sending client email with files | Resend sender, Cc + PDF/DOCX attachments | `src/go-wa.ts`, `docs/selling/attachments/` |
| Tasks from voice | voice → Trello cards with due dates, learns from corrections | trello-voice (28 Oct) |
| Telling Elena something happened | Telegram alerts | fleet-wide |

## The steps

0. **The face goes live.** aideazz.xyz/ops shows the queue (nginx CORS + publish). *Waits on Elena's go.*
1. **Clients and projects.** A `clients` + `projects` table next to `daily_queue`. A paid
   PagueloFacil order creates the client and project automatically (today it creates a HubSpot
   deal only). Done = the next $100 payment appears as a project on aideazz.xyz/ops.
2. **Project tracking.** Tasks belong to a project; status new / doing / waiting on client / done.
   Voice-to-Trello cards can carry the project, so nothing is typed twice.
3. **Docs and images.** Files per project (diagnostic results, scan, audit PDF). Same safety gate
   as the outreach attachments (type check, size limit, private).
4. **Client portal + chat.** The client gets one private link: status, files, messages. Their
   message reaches Elena on Telegram; her reply goes back to the portal and by email.
5. **Invoices and payments.** An invoice is made from the project and carries a PagueloFacil
   link; payment marks it paid (the matcher already exists). Diagnostic $100 credited to the
   $200/$500 audit automatically.
6. **Only then: other agencies.** One month on real AIdeazz client work, then a demo to people
   who asked for it in public (Kartikey's thread is that list).

## Honest risks

- **Crowded market.** HoneyBook, Dubsado, Bonsai, Moxie, Plutio and SuiteDash already sell this
  bundle. The 177 replies to that post are mostly builders pitching. A win has to be narrow
  (e.g. AI does the admin: voice → task → invoice), not "another all-in-one".
- **Demand, not supply, is the bottleneck** (`project_root_cause_no_demand_channel` memory).
  First real client payment is still zero. Steps 1–5 matter because they run paying work —
  not as a product in search of buyers.
- **Cheap test before step 6:** ask the poster three questions (what he uses now, what he pays,
  which one piece hurts most). His answer decides the narrow wedge.
