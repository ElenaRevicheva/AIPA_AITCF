# Atuona — Fable 5.1 + a fact engine that actually rotates (plan, 7 Oct 2026)

Elena: "wire Fable … make temperature work … each command, each time Atuona should send rare, true, verified
information from the whole knowledge base — we tried to encode this many times but it does not really work."

## Why it never worked (from the code)

- **19 commands** (`/inspire`, `/scene`, `/dialogue`, `/expand` …) call `buildFullCreativityKnowledgeBlock()`, which pastes
  the **whole** knowledge base (11 modules, **610 bullet facts**) + 98 canon poems into every prompt (~38k tokens) and then
  *asks* the model to "prefer obscure facts from three domains".
- That delegates the choice to the model. A model shown 610 facts picks the most salient ones every time (Panama canal,
  Wyatt's Torch, Prometheus, Nafea) — same as the blind test today: all three Claude models opened on the same handful.
  More instructions cannot fix this; it is how attention works. Temperature would not fix it either.
- The code never remembers which facts were used, so nothing stops yesterday's fact coming back.
- The yellow lilies are not from the knowledge base — they are a plot thread in `STORY_CONTEXT` (sent every time).
- "True, verified": the 610 facts are hand-written lines with no source each; and because the model may add facts of its
  own, some output facts never came from the knowledge base at all.

## The fix — the code chooses the facts, not the model

1. **Atomic facts.** At startup, split the 11 modules into the 610 bullet facts, each with a stable id (domain + number).
   The knowledge-base text itself is not rewritten.
2. **Fact ledger** (`data/atuona/fact-ledger.json`). Every command draws **4 facts from 4 different domains**, choosing
   among the **least-used**, random among ties. No fact repeats until the whole pool has cycled (~150 commands).
3. **The prompt carries only those 4 facts** ("build on these; add no other names, dates or numbers") + the style canon +
   a rotating sample of 12 canon poems (the sampler already exists). One change point: `buildFullCreativityKnowledgeBlock()`,
   so all 19 commands get it at once — inside the existing design, no new command.
4. **Proof per reply:** the log records the 4 fact ids drawn; optionally a small footer in Telegram (her choice).
5. **Verification pass (phase 2):** fact-check the 610 facts against public sources, mark each verified / unverified; only
   verified facts enter the rotation. Costs time, not credit.

## Fable 5.1

- `ATUONA_TEXT_MODEL=claude-fable-5-1` (one env var).
- **Temperature cannot be set on Fable** — the API rejects it (400). The code stops sending it to Fable (today every
  Opus 5 call already 400s once and silently retries without it). The real source of variety is step 2 above.
- `max_tokens` raised (thinking is always on and spends from the same budget; `/inspire` at 500 risks a cut-off reply).
- Refusals: check `stop_reason: "refusal"` and use Anthropic's server-side fallback, so an erotic page that Fable declines
  is answered by another Claude model instead of returning empty text.

## Money

Prompt shrinks from ~38k to roughly 12–15k tokens → a Fable call drops from ~$0.45 to roughly $0.15–0.20 (estimate; measured
after deploy). Anthropic credit left ≈ $4.35 — Fable on today's 38k prompt would burn it in ~10 messages.

## Deploy (needs Elena's Confirm — Teach → Plan → Confirm → Build)

Build locally → `scp` named files (`dist/atuona-creative-ai.js` + the new fact module) → `pm2 restart cto-aipa --update-env`
→ prove: grep dist, process newer than file, one live `/inspire` showing the 4 fact ids in the log. Backup of the live
dist file first. The whole cto-aipa process restarts (the CTO bot and Atuona share it).
