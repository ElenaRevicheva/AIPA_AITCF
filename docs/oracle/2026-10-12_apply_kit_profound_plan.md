# Apply kit — make every deal's CV, letter and defenses draw on the verified evidence (plan, 12 Oct 2026)

Elena, 12 Oct: *"make sure every future deal will have a profoundly, not generic kit based on examples of my verified prod logs and
skills so that all CV, CL, tech defense have these profound materials."*

## Why the kit is generic today (read from the code and the CodeRoad deal, 12 Oct)

The kit has four generators and they do not share one evidence pool:

| Piece | Generator | Evidence it reads | Why the output is generic |
|---|---|---|---|
| CV | `scripts/lib/cv-compose.cjs` → `docs/applications/cv-bank.json` | 17 reviewed bullets, 4 summaries, 8 chips | Headings may sit only over the CURRENT role (`b-*` ids), so E-GOV/OmniBazaar evidence (stakeholders, compliance, clients) can never get a posting heading; the model may glue two lab summaries ("Since 2025…" twice); the gpt-5 reviewer's doubt (`_composed.fit_note`) is written only to a JSON on Oracle, never to the HubSpot note. |
| Cover letter | VJH's Python generator writes the ⚠️ note letter first; the kit's own `generateCoverLetter` (`src/cover-letter.ts`) is skipped because `LETTER_RE = /COVER LETTER/i` matches VJH's note (`hs-fill-apply-kit.cjs` line 547) | VJH: its profile; kit: `VERIFIED_FACTS` | **First writer wins:** the better generator never runs on a VJH deal. And `VERIFIED_FACTS` is a hand-typed list of 8 non-creative lines with one number (15 services) — no evaluation facts, no incidents, no products, no E-GOV detail. |
| 🎯 role defense | `generateRoleDefense` (`src/cover-letter.ts`) | `VERIFIED_FACTS` + `ROLE_PROFILE` + the 18 defense-bank entries | Same thin facts; `ROLE_PROFILE` has no tool facts, so a gap line denied LangChain (which is live in EspaLuz, proven on Oracle 12 Oct). |
| 🛡️ technical defense | `job-tailor.pickDefense` (tags) → `docs/interview/defense-bank.json` | 18 verified entries | No entry for hallucination risk / grounded publishing, none for cost control; both exist as published, verified incidents. |

The pattern has a name: **one source of truth that nobody reads.** The verified evidence exists (CV bank, defense bank, the Outlook
figures, the wiki incidents) but each generator keeps its own smaller copy, and the copies drift.

## The plan — inside the existing design, no new mechanisms

**A. One evidence pool.** `src/cover-letter.ts`: build `VERIFIED_FACTS` from `docs/applications/cv-bank.json` at load time (bullets,
chips, role lines, intros) instead of the hand-typed list; keep the CREATIVE lines and the operating-model sentence as they are. The
letter and the 🎯 note then read the same reviewed lines the CV uses. Add to `ROLE_PROFILE` the tool facts proven 12 Oct (LangChain
conversation memory in EspaLuz; LangGraph in the job pipeline; pgvector RAG; Playwright; FastAPI) and the honest negatives (no Jira /
Confluence / Azure / LangSmith / Phoenix / Arize), so gap lines stop denying true things and stop inventing.

**B. Grow the pool with today's reviewed lines.** Add the CodeRoad v3 CV as a `_sources` entry of `cv-bank.json` and copy in, verbatim,
the lines the four-lens panel passed: hallucination guardrail (23/26 Aug incidents), inquiry concierge, board-level delivery, EspaLuz
as conversational AI with pgvector memory, the golden-set / accuracy lead-ins, the 18-of-39-by-people split, the E-GOV `eg-*` delivery
line, and the new figures-note wording. Verbatim check in code (every text found in its source CV), as on 11 Oct.

**C. The kit's letter runs on every deal.** `hs-fill-apply-kit.cjs`: skip the letter only when the kit's own `✅ READY TO SEND` note
exists (`READY_MARK`), not when VJH's generic ⚠️ letter does. One prompt rule added to `generateCoverLetter`: after the opening, every
sentence carries a concrete verified fact (a number, a named system, a named incident) chosen for THIS posting's duties; no
"this experience has helped me understand…" filler. The existing refusals stay (no invention, no "solo", operating-model sentence verbatim).

**D. Three verified 🛡️ entries** in `defense-bank.json`, written from the published records only: *How do you handle hallucination
risk?* (23 Aug fabrication → grounded publisher; 26 Aug gate firing), *How do you control vendor and LLM cost?* (the video-engine
spending cap, the five-provider chain, credit exhaustion handled), *How do you align stakeholders and compliance?* (E-GOV board process,
lawful e-services, "constraints as product inputs"). Tags include the Product Owner / compliance vocabulary.

**E. CV composer: the reviewer's doubt becomes visible, and past roles can carry a posting heading.** `cv-compose.cjs`: (i) when
`fit_note` is non-empty, the 🛡️ note's CV line carries it as a one-line ⚠️ so a machine CV is never "use this one" without its
reviewer's caveat; (ii) summary = the pitch + ONE bank summary, and the OmniBazaar/E-GOV summary is preferred when the posting
names stakeholders, clients or compliance; (iii) a section may be placed under the E-GOV or OmniBazaar role (`eg-*` / `om-*` ids),
rendered by `build-lane-cv.cjs` under that role — the honest home for stakeholder/compliance headings. (iii) is the largest change.

**F. Prove it, then deploy.** Build locally (`npm run build` — tsc is not on Oracle), run `node scripts/test-cover-letter-model.cjs`
and the bank verbatim check, dry-run the kit on ONE deal (`--only=<id>`, no `--apply`) and read the composed CV/letter/🎯 before any
`--apply`; scp the named files (`scripts/hs-fill-apply-kit.cjs`, `scripts/lib/cv-compose.cjs`, `scripts/build-lane-cv.cjs`,
`dist/cover-letter.js`, `docs/applications/cv-bank.json`, `docs/interview/defense-bank.json`). The kit is a cron job (every 10 min,
flock), so no PM2 restart; the next run picks the files up. Verify from the kit log and a HubSpot read-back, not from the deploy.

**Cost and blast radius.** Model spend per new deal is unchanged (gpt-4.1 draft + gpt-5 review per piece). Nothing already on a deal is
rewritten (additive rule). VJH's own letter generator is not touched. Existing hand-built CVs are protected by the hand-built guard.

## Her call
Build and deploy A–F? Or A–D + E(i)(ii) only, leaving the composer's past-role sections (E iii) for later.
