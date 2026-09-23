# Review — "Nine systems and why they exist" (Provenance Dossier, 24 Aug 2026) as a job attachment

**Question (Elena, 23 Sep 2026):** can this PDF be attached to an AI Automation Engineer application?

**Verdict: not as it is.** The engineering content is the strongest evidence she has. The document
around it was written for a different reader (a business or buyer deciding whether to adopt or
license the systems), and several passages work against her in a hiring screen.

## What to keep — this is what an automation hiring manager wants

- Five-provider LLM chain, ordered per use case; the 19 Aug fall-through to OpenAI in 2.4 s.
- CTO AIPA lead concierge: form → CRM record → drafted reply → one-tap approval → delivery events written back. Precedence between two reply writers (cached health verdict, 5-min grace, 20-min safety net).
- VJH: LangGraph state machine, SQLite checkpointing, human-approval interrupt, LLM judge with trust clamp, 131-test eval harness in 4 layers, feedback loop from CRM outcomes, fails closed on LLM outage. Removing auto-apply because it produced volume and zero outcomes.
- Daily synthetic lead through the real pipeline at 07:45, silent on pass.
- Part 3 principles table (measure at the edge, refuse to report unmeasured as zero, every record names its author, fail open vs fail closed per system).
- AI Ops Wiki as the public incident record.

## What hurts in a job application

| Passage | Why it hurts in a hiring screen |
|---|---|
| Family story: daughter, retired father and mother, single mother, "expat from Russia" (p.1–2) | Personal and family detail a recruiter should not be handed; invites bias and adds nothing to an engineering claim. |
| "No manual coding background", "I did not type most of this code", "majority of commits carry my AI agent's authorship", on page 1 | Honest and should stay honest, but leading with it means the screener reads it before any evidence. Fermatix declined on authorship alone (9 Sep). Say it once, framed as the method, after the proof. |
| The binary-tree / whiteboard paragraph | Reads as arguing with the interview process before being in it. |
| Part 4 "What this is not" / "a route to those businesses" / "What would actually help: an introduction" | Written to a partner. In an application it says "my products have no customers", not "hire me". |
| "Would fit" blocks (relocation firms, agencies…) | Sales positioning for a buyer, not for an employer. |
| DragonTrade: "Included because you asked what is in each repo" | Addressed to one specific person; shows the document was reused. |
| "It found the interview I sat this week" | Dated. |
| 7 pages | Past what a screener reads; the best material is on pages 3–4 and 6–7. |

## Stale figures (dated 24 Aug; true then, not now)

- Atuona films: dossier says 6 → **8** live now.
- AI Ops Wiki incidents: 9 → more since (at least the 26 Aug and 22 Sep chapters).
- The document says "every figure read from production on the day it was written". That holds only while the date is visible and the reader accepts a month-old snapshot.

## Recommended attachment instead

A **2-page "AI Automation Case Studies"** built from the same verified content:
1. Lead concierge (inbound → CRM → drafted reply → approval → delivery write-back).
2. VJH (LangGraph + human interrupt + LLM judge + eval harness + outcome feedback loop).
3. Five-provider chain + the 19 Aug incident.
4. Principles table.
5. One line on method: built AI-augmented (Claude Code, Cursor); her job is design and verification. Links: portfolio, AI Ops Wiki, GitHub.

No family story, no Part 4, no "Would fit", figures re-read on the build date.
