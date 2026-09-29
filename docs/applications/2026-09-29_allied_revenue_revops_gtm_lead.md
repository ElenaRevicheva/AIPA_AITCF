# Allied Revenue — RevOps & GTM Systems Lead (Get on Board #63866)

- **Apply:** https://www.getonbrd.com/jobs/operations-management/revops-gtm-systems-lead-allied-revenue-remote
- Remote, anywhere · full time · employee OR contractor · **$5,000–6,000/mo** · 39 applicants (29 Sep) · posted 25 Sep ·
  company replied to candidates ~11h before Elena saw it (active hiring).
- Hours: ≥5h overlap with 9–5 US Mountain = **10:00–18:00 Panama** now (MDT), 11:00–19:00 after DST ends 1 Nov. Fully compatible.
- No cover letter. **Application questions → brief, specific examples of work you completed personally.** AI allowed
  to organise answers; be ready to discuss in detail.
- CV to attach: `docs/applications/cv-by-lane/CV_Elena_Revicheva_crm.pdf` (the CRM/RevOps lane CV).

## Why VJH missed it

Found 25 Sep by the Bright Data door, scored 64, then **judge VETO: "US Mountain Time incompatible with her UTC-5
schedule"** — wrong on its face (see NOW.md, VJH judge RISK). No HubSpot deal was ever created. Staged by hand 29 Sep.

## Honest fit

**Their sentence is her operating rule:** *"We care less about whether a tool says it ran than whether the result is
right."* That is the whole NOW.md §4.3 discipline ("prove output, not that it ran"). Lead with it.

| They ask | She has (verified) |
|---|---|
| Strong HubSpot | Deals, contacts, companies, notes, tasks, associations, owners, Files API, stage automation — by API, daily |
| 2+ related systems | Make (paid plan, live LLM workflow), Resend, Hunter (enrichment), Bright Data (search/scrape), Buffer |
| LLM in business workflows, structured output, fallbacks, human review | Lead Concierge, grounding gates, 5-provider LLM fallback chain, 600+ check eval suite, drafts always go to a human |
| APIs, webhooks, JSON, mapping | All of the above is her own API + webhook wiring |
| Monitor, trace to source, verify the fix | July 16 fleet audit (below) |
| Duplicates, deliverability | Near-duplicate detection (56/121 pages), dead-sender bounce fix |

**Gaps — do not paper over:**
- **3+ years hands-on RevOps:** no. Her RevOps work is her own GTM stack, 2026. Exec years 2011–2018 are leadership, not RevOps.
- **More than one B2B client:** no external clients. Honest framing: *several programmes on one stack* (hiring
  pipeline, client outreach, product trial users, art outreach), each with its own prefix, stages and automation.
- **Clay, Instantly, Salesforce, Apollo:** not used. Say so; offer the equivalents she did use.
- **US B2B teams:** none.

**Verdict:** a stretch on tenure, a direct hit on the work itself. 39 applicants and a screener that reads examples,
not years → worth 20 minutes. Odds honest: low-moderate. Salary floor cleared by a wide margin.

## Answer bank — paste and trim to the question asked

_29 Sep review: "131 tests" (unverified, on CLAUDE.md's list) → 600+ checks (649 passing that day); "Claude→Groq" → the
5-provider chain verified live 28 Sep (4 of 5 answer; Claude has no credits); an unverified "$0.03 a run" removed._

Keep each answer 4–6 sentences. Numbers below are from logs/HubSpot, not memory.

### A. HubSpot automation you built personally
I built a one-click outreach flow on top of HubSpot. Each deal carries a note with a send link; one click sends the
email through Resend from our domain, writes the Resend message id back onto the HubSpot note, moves the deal to
"Sent", closes the "send" task and books a follow-up task. A Resend webhook then writes the delivery event back to
the same deal, so the CRM shows *delivered*, not just *sent*. Attachments must also land in HubSpot as private files,
and the send is refused if any listed attachment fails to load, so an email never claims a document it did not carry.
The registry behind it holds 437 outreach entries today.

### B. A time you found a problem, traced it to the source and verified the fix
In July I audited every automation that writes to our HubSpot: 175 deals from the last 14 days grouped by source,
checked against the server logs of the systems that should have produced them. Two sources were silently broken. Trial
sign-ups from our language-learning product had never reached HubSpot: a missing secret in one service's environment
made the push return early with no error and no log line. 28 real trial users, the oldest from July 2025, were
invisible. I fixed the config, verified with a live call matching the production payload, and backfilled all 28 as
deals. The second source had posted to the wrong port and got a 404 every night for over two weeks. One-line fix,
confirmed in the receiving service's log. The lesson I apply since: check the destination, not the sender's success branch.

### C. LLM workflow with structured output, validation, fallback and human review
Our inbound lead workflow runs in Make: a new HubSpot contact triggers an LLM that drafts a reply, and the draft goes
to a human in Telegram before anything is sent. No model output reaches a customer unreviewed. In our code, model calls
walk a five-provider fallback chain (OpenAI, Gemini, Groq, Grok, Claude) when one fails, and an evaluation suite of
600+ automated checks guards the scoring, routing and judge. For generated articles I added a grounding gate: every number must come from a
collected evidence bundle or the paragraph is rejected. When the gate once fired four times in a row, the cause was
the prompt itself carrying unverified figures, so I stripped numbers from the brief rather than loosening the gate.

### D. Duplicates / data quality
Our publishing pipeline had shipped near-duplicate pages for months because the guard tested exact slug equality.
I replaced it with token-overlap scoring against every published item and backfilled the dedup cache from 64 to 123
entries. It found 56 of 121 pages were near-copies in 19 clusters; the cleanup is canonicalisation, not deletion.

### E. Deliverability
Replies to our outreach were bouncing because the sender defaulted to a mailbox that did not exist. I traced it to one
environment default, moved sending to the real mailbox, and set reply-to to a monitored inbox. Our domain's DNS and
DMARC are managed on Cloudflare.

### F. Tools
HubSpot (API and UI), Make, Resend, Hunter, Bright Data, Buffer, Telegram bots, Postgres, Node and Python scripts
built with Claude Code and Cursor. I have not used Clay, Instantly or Salesforce; the enrichment, sequencing and
routing concepts they cover I have built directly against APIs.

### G. How you work (her approved positioning line — use verbatim if asked)
"I operate an AI-native development environment where specialized agents handle much of the implementation
execution. I own requirements, architecture, orchestration, evaluation, deployment, monitoring and production decisions."

### H. Hours / arrangement / compensation
Based in Panama (UTC-5): 9–5 Mountain is 10:00–18:00 my time (11:00–19:00 in winter), so full overlap is easy. Contractor arrangement.
Compensation: **$5,500/month** (inside their range; Elena may move it).

### I. English / US teams
Honest: working English, written daily; no prior US B2B client engagements. Do not claim otherwise.

## Profile summary — polished 29 Sep (1,743 chars, limit 2,000)

Deals figure checked in HubSpot 29 Sep: 2,860 total → "2,800+". 11,000+, 420+, 100/100 are Elena's figures, not re-checked.

```
For seven years I was Deputy CEO and Chief Legal Officer of a government digital-services operator, leading large-scale digital transformation: vendor coordination, operational delivery, and board-level cost and performance reporting. It taught me to start with the workflow and the business constraint, not the technology.

Since May 2025 I have built and run AI systems in production: 15 long-running services on Oracle Cloud. I operate an AI-native development environment where specialized agents handle much of the implementation execution. I own requirements, architecture, orchestration, evaluation, deployment, monitoring and production decisions. Three systems are most relevant here:

CTO AIPA (AI operations and RevOps): a HubSpot CRM with 2,800+ deals and automated source and pipeline attribution. An AI lead concierge drafts replies to inbound inquiries; a human approves each one before it is sent and logged.

VibeJobHunter (discovery and qualification): a LangGraph pipeline that has processed 11,000+ opportunities, with an evaluation harness, human decision gates, and a feedback loop that learns from accept/reject decisions in the CRM. Every change is measured against those decisions before it ships.

CMO AIPA (AI marketing): a GEO/AEO and technical-SEO engine with bilingual publishing and structured data for AI search visibility. It scores my own site 100/100 and has run 420+ audits.

The pattern is consistent: study the workflow, find the real bottleneck, ship a focused solution, measure the result, keep human judgment where mistakes are costly, then harden what works. I run growth the same way, as an outcome-driven system, not a checklist.

I build with Cursor and Claude Code, alongside my own AI CTO agent.
```
