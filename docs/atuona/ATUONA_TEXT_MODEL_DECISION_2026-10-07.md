# Atuona book — which text model? (7 Oct 2026)

## Fact first

Atuona's primary is `claude-opus-5` (`ATUONA_TEXT_MODEL` unset), on `ANTHROPIC_API_KEY`, which has had **no credit since
17 Aug 2026** (live probe 7 Oct: HTTP 400 "credit balance is too low"). Kept logs 29 Sep → 7 Oct: Atuona answers came from
**Grok 238 times, DeepSeek 17, Claude 0**. Whatever the book has felt like for seven weeks is Grok, not Claude.

## The fleet waterfall (Aug 2026, Groq deprecation) — Atuona deliberately left out by Elena

5 providers per product (claude · openai · gemini · grok · groq), order per use case:

| Product | Order |
|---|---|
| cto-aipa | quality: claude→openai→gemini→groq→grok · classify: gemini-3.5-flash-lite→openai→groq→grok→claude · bulk: gemini→groq→openai→grok→claude |
| VJH | openai→gemini→groq→grok→claude (judge; Claude last, highest volume) |
| EspaLuz_Influencer, dragontrade | bulk: gemini→groq→openai→grok→claude |
| EspaLuz WhatsApp, EspaLuzFamilybot, whitespace/Atlas | quality: claude→openai→gemini→grok→groq |

Atuona (its own chain, `createContent`, `src/atuona-creative-ai.ts:4202`): Claude Opus 5 → DeepSeek Flash → Groq gpt-oss-120b → Grok 4.20.

## Claude models that could write the book (Anthropic model table, cached 25 Sep 2026)

| Model | ID | $ in / out per 1M | Notes |
|---|---|---|---|
| Claude Opus 5 (wired now) | `claude-opus-5` | 5 / 25 | previous Opus; rejects `temperature` (the code retries without it) |
| **Claude Opus 5.5** | `claude-opus-5-5` | **4 / 20** | the current Opus, successor to Opus 5, cheaper; thinking always on, effort default `medium` (set `high`) |
| **Claude Fable 5.1** | `claude-fable-5-1` | 10 / 50 | Anthropic's most capable widely released model; thinking always on; needs 30-day data retention; long turns |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | 2 / 10 | faster, below Opus — not a quality upgrade |

None of the current models accept `temperature` — "creativity" is steered by the prompt and by effort, not sampling.

## Honest answer

- **Yes — two Claude models are above Opus 5:** Opus 5.5 (newer, cheaper) and Fable 5.1 (the most capable).
- No published benchmark measures literary Russian/English prose for this book; "higher quality" for *her* voice is only
  provable with a blind side-by-side on her own prompts (same prompt, Opus 5 vs Opus 5.5 vs Fable 5.1, she picks blind).
- Risk to plan for: the book is erotic. Current models can decline (`stop_reason: "refusal"`); Atuona's code does not check
  it today, so a decline would surface as empty text. Wiring a new model includes refusal handling + server-side fallbacks.
- Nothing works until Anthropic credit is topped up.

## Recommendation

1. Elena tops up Anthropic credit.
2. Blind test, ~10 of her real prompts (`/inspire`, `/create`, a poem), Opus 5.5 vs Fable 5.1 (+ Opus 5 as baseline). Cost:
   a few dollars.
3. Wire the winner via `ATUONA_TEXT_MODEL` (one env var, no new chain) + refusal handling — Teach → Plan → Confirm first.
