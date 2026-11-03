# EspaLuz — what the models really cost, and which free tier to add (3 Nov 2026)

Elena asked: (a) measure real token use and say what $5 of Gemini buys; (b) check today's free tiers and pick one
spare provider. Everything marked **measured** comes from production logs/DB on 3 Nov 2026. Everything marked
**estimate** is arithmetic on measured parts. Prices are from third-party pages (Google's own page not found by search).

## 1. Who answers today (measured, prod logs, last 24 h)

| Channel | Answered | Failed |
|---|---|---|
| Web `espaluz-chat` v281 (51 replies) | grok 48, groq 3 | claude 51 (credit), free gemini 51 (429 quota 20 / 503 busy 18 / 6 s timeout 13), groq 48 (daily tokens) |
| WhatsApp (16 user messages on 3 Nov) | groq / grok | claude (credit), gemini prepaid key 402 "prepayment credits are depleted", openai 429 |
| Telegram | 0 chat turns in 24 h; live probe: groq + grok OK | same three |

**Groq is out by evening:** at ~22:20 UTC Groq's own error said `tokens per day (TPD): Limit 200000, Used 198949` for
`openai/gpt-oss-120b`. **Measured.**

## 2. How big one reply is

| Piece | Size | Source |
|---|---|---|
| Web kids prompt (classroom rules + Panama places) | 7,554 chars ≈ 1,940 tokens | measured chars; ratio 3.9 chars/token measured on Groq |
| WA/TG companion rules | 3,906 chars = **1,004 tokens** | **measured** (Groq `usage.prompt_tokens`) |
| Web reply, one turn | ≈ 3,000 tokens in + ≈ 200 out | estimate: prompt + memory card + ≤20 known facts + last 4 turns |
| WhatsApp, one message | ≈ 3,300 in + ≈ 520 out | estimate: 4 calls (reply ≈ 2,300 in / 300 out; translation, emotion, fact writer ≈ 1,000 in / 220 out together) |

Volume (**measured**): web lesson turns per day 25 / 39 / 62 / **98 peak (1 Nov)**; WhatsApp user messages 6–26 per day.

| Day | Tokens in | Tokens out |
|---|---|---|
| Typical (≈40 web + ≈16 WA) | ≈ 175,000 | ≈ 16,000 |
| Peak (98 web + 26 WA) | ≈ 380,000 | ≈ 34,000 |

The typical day is about Groq's whole free daily allowance — which matches the 429s.

## 3. What $5 of Gemini buys (estimate)

| Model (third-party price per 1M tokens) | Typical day | Month | $5 lasts |
|---|---|---|---|
| Gemini 3.8 Flash ($0.75 in / $3.75 out; one source says it doubles 1 Jan 2027) | ≈ $0.19 | ≈ $5.70 | **≈ 3–4 weeks** |
| Gemini 2.5 Flash (sources disagree: $0.15–0.30 in / $1.25–2.50 out) | ≈ $0.05–0.09 | ≈ $1.50–2.70 | ≈ 2–3 months |

Correction to what I said in chat: "$5 lasts a long time" was too strong. On the newest Flash it is about one month.
**Cheapest lever is not a new provider: the 1,940-token kids prompt is re-sent on every turn.** Gemini prompt caching
(cache reads ≈ 10× cheaper per the same source) or a shorter prompt cuts most of the input cost. Not built — idea only.

## 4. Free tiers today (third-party, change often — re-check before signing up)

| Provider | Free allowance reported | Fit for EspaLuz |
|---|---|---|
| **OpenRouter** `:free` models | 50 requests/day; **1,000/day once you have bought $10 of credit (one-time)** | One key, many free models. 50/day = spare only; $10 once → enough for today's whole traffic as a spare |
| Cerebras | ~1M tokens/day, but one source says a 30-day trial with $5 credit | Risky: may expire |
| Mistral | limits no longer published (read in their console) | Unknown |
| Groq (have) | 200k tokens/day per model (measured) | Already used up daily |
| Gemini free (have, web only) | quota 429 + overload 503 measured | Already used up |

⚠️ **Free tiers often train on your prompts.** EspaLuz web lessons are with a 6-year-old child. Before routing kids
lessons to any free tier, check that provider's data terms (OpenRouter lets you exclude providers that train on data).
Elena accepted free-tier data use for VOICES on 1 Nov — not yet for chat.

## 5. Recommendation

1. **OpenRouter as the spare** — one key, OpenAI-compatible (one new entry in each chain, no new code shape), free
   models now, and a one-time $10 turns 50 → 1,000 requests/day. Needs Elena to create the account and paste the key
   (an agent may not create accounts). Then: add the entry, run `eval_llm_chain.py` (5/5 bar) per channel, deploy.
2. **One shared order on all three channels** (today web, WhatsApp and Telegram differ).
3. **Before paying Gemini**, try prompt caching / a shorter kids prompt — it may make $5 last 2–3× longer.

Sources: [litellm — Gemini 3.8 Flash price](https://models.litellm.ai/models/gemini-3.8-flash) ·
[morphllm — Gemini API pricing](https://www.morphllm.com/gemini-api-pricing) ·
[pricepertoken — Gemini 2.5 Flash](https://pricepertoken.com/pricing-page/model/google-gemini-2.5-flash) ·
[OpenRouter — free LLM APIs compared](https://openrouter.ai/blog/tutorials/free-llm-apis-compared/) ·
[requesty — free LLM APIs](https://www.requesty.ai/blog/free-llm-apis) ·
[continuumcode — free LLM API limits](https://continuumcode.ai/guides/free-llm-api/) ·
[cheahjs — free LLM API resources](https://github.com/cheahjs/free-llm-api-resources)
