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

## Built and verified the same evening (Elena: "make it work what already exists, no inventing bicycles")

Scope kept to data and wiring inside the existing files; the composer's past-role headings (E iii) were NOT built.

| Change | File | Proof |
|---|---|---|
| Letter + 🎯 read the CV bank (one evidence pool); hand-typed lines only as fallback; live tool facts + honest negatives in `ROLE_PROFILE`; one letter rule (every sentence carries a verified fact) | `src/cover-letter.ts` → `dist/cover-letter.js` | `tsc` clean; `node scripts/test-cover-letter-model.cjs` 15/15; dry letter on Oracle for the CodeRoad posting = bank facts, no invented claim |
| cv-bank +6 bullets (hallucination guardrail, inquiry concierge, fail-closed send, golden-set tests, hard gates, degrade-not-stop), +1 summary, +2 live lines, +1 E-GOV, +1 OmniBazaar, tools + figures note = the v3 wording; `_sources.coderoad` | `docs/applications/cv-bank.json` | verbatim check in code: 0 misses across 23 bullets / 5 summaries / 9 live / 4 egov / 3 omnibazaar |
| 3 verified 🛡️ answers: hallucination, cost, stakeholders | `docs/interview/defense-bank.json` | dry `pickDefense` on the CodeRoad posting → `code, stakeholders, product, hallucination, cost` |
| ✅ letter skipped only on the kit's own ✅ note or a hand-written ✉️; the letter note carries the deal's own CV from the 🛡️ note; the composer's `fit_note` printed on the CV line | `scripts/hs-fill-apply-kit.cjs` | 22:30 UTC cron: `already had a letter 2 · wrote 8` (Addi, SIPEngines, David Kennedy, Puente ×4, Scale Army); SIPEngines ✅ read back from HubSpot; 7 of those notes then given the deal's own CV additively (repair script, lane CV kept) |
| One lab summary at most; all E-GOV lines for stakeholder postings; scale-only chips; headings keep the posting's exact word forms | `scripts/lib/cv-compose.cjs` | dry `composeCv` on the CodeRoad posting: 4 verbatim duty headings, 9 bullets incl. the hallucination guardrail, 1 summary, 3 egov, chips `6 products · 15 services | 600+ tests | 11,000+ postings`, fit_note captured (first dry lost 2 of 3 attempts to "drive"/"driving" → the word-form rule) |

Deploy: named-file scp, md5 equal laptop = Oracle for all five files; backups `~/_session-backups/apply-kit-20261012/` on Oracle and
`C:\Users\kirav\_session-backups\coderoad-cv-v2-20261012\` on the laptop. The kit is a cron job (every 10 min, flock) — no PM2 restart.
Existing 🛡️ / 🎯 notes are not regenerated (additive rule): new deals get the richer defenses; existing deals got the ✅ letter only.
Hand-built CVs stay protected by the hand-built guard. VJH's own letter generator untouched.

Not done, by design: the composer still cannot put a posting heading over a past role; a reviewer that drops every job-search line
for a "backlog" heading leaves the kit on the generic job-tailor CV for that deal (the `(not shaped: …)` log line + ✖CV in the audit).

## 13 Oct 2026 — the first new deal under the new code, and two fetcher bugs it exposed

SPACE44 (AI Solutions Architect) arrived 07:34 UTC and the 07:40 run built its whole kit (🔎 🎯 🛡️ + shaped CV, ✅ letter, 📋) — but all
four OpenAI structured calls answered `400 Invalid body: failed to parse JSON value` and fell back to Gemini, so that deal's CV was
composed AND reviewed by Gemini. The error appears nowhere else in the log; a bisect probe on Oracle proved the cause: the posting
is cut at exactly 6,000 characters inside an emoji, leaving a lone high surrogate (`\ud83d` at index 5,999) that JSON.stringify
writes as a bare escape and OpenAI's parser refuses. Probe: posting as fetched → 400; the same posting with the lone surrogate
removed → 200; the CV bank → 200; the defense bank → 200. Second bug found on the re-probe: the fetcher left `&#x27;` raw and turned
`&#39;` into a space, so the posting read "organisation&#x27;s" and the composer rejected a heading the model had copied faithfully.

Fixed inside the existing functions (`src/cover-letter.ts`: `stripLoneSurrogates` applied to fetched postings and to every OpenAI JSON
request, `htmlToText` decodes hex/decimal entities, quotes and apostrophes; `scripts/lib/cv-compose.cjs` sanitises its own request
builder). Commits b7edaf04, e9189da0, b89f5d98. Deployed by named-file scp, md5 equal laptop = Oracle; `tsc` 0 errors; letter test 15/15.
Re-probe on the SPACE44 posting through the kit's own fetch: 0 lone surrogates; composeCv → `openai:gpt-4.1 + review openai:gpt-5`,
3 verbatim headings / 8 bullets, fit_note captured. The SPACE44 deal keeps its Gemini-built kit (additive rule); `--recompose
--only=65894501929` by hand would rebuild its CV on the OpenAI pair (model spend — her call).

Consistency check (Elena, 13 Oct): every file touched this session is byte-equal on the laptop, origin/main and Oracle's checkout
(11 files + the gitignored compiled module); the aideazz repo is level with its origin. Oracle's git HEAD stays deliberately old
(named-file deploys) — a `git diff origin/main` there shows files it does not track as "deleted"; `test -f` + md5 is the real check.

## 13 Oct 2026, afternoon — the claim gates (Elena: "the letter and the pitch are grounded but unguarded … yes, we need to fix that")

Read back from the SPACE44 deal, the first one built by the new code: the 🎯 pitch said "7+ years of experience in solutions
architecture" (she has 7 years as Deputy CEO & CLO; the number gate passed because 7 is in the evidence, and the pitch was never sent to
the reviewer), the ✅ letter opened with the posting's own duty sentence rewritten as her experience and closed with "within two weeks"
(no reviewer on the letter at all), and a posting far from her evidence fell back to the generic lane CV. Three surgical changes, inside
existing functions, commits 0cd71a14 + 8314d446, deployed by named-file scp, md5 equal laptop = Oracle:

| Change | Where | Dry run on the SPACE44 posting (nothing written) |
|---|---|---|
| The pitch is appended to the ANSWERS list the gpt-5 reviewer already judges; unsupported → the drafter retries; on the last attempt the pitch is dropped rather than shipped | `generateRoleDefense` in `src/cover-letter.ts` | `PITCH: (dropped by the reviewer)`; 4 answers kept; 1 honest gap written: "I haven't held a titled solutions architecture … role for seven years" |
| The letter's sentences pass the same strict reviewer before the note is posted; sign-off never reviewed; if the review cannot run, the mechanically gated draft ships (logged) | `reviewLetterSentences` + `generateCoverLetter` | `review dropped 3 sentence(s)`: the duty-echo opener, "I understand the importance of aligning AI…", and the unsupported availability line; the surviving letter = bank facts only, `openai + review openai:gpt-5` |
| Composer floor 3 sections / 7 lines → 2 / 5 (`MIN_SECTIONS`, `MIN_LINES`); the prompt still aims for 3-5 / 7-14 | `scripts/lib/cv-compose.cjs` | spec composed where it used to fail: 2 verbatim headings / 6 lines, `fit_note` captured for the 🛡️ line |
| "Available immediately (no notice period)" added to `ROLE_PROFILE` (it was only in the Comet prompt, so the reviewer rightly cut the availability line); sign-off split into its own paragraph before review | `src/cover-letter.ts` | re-dry: reviewer still active (2 sentences dropped), sign-off on its own lines |

Cost: one extra gpt-5 call per new deal (the letter review). Existing notes untouched (additive). What this cannot do: invent evidence —
a posting that asks for client-facing discovery or a human engineering team still ends with those gaps said out loud, not papered over.
