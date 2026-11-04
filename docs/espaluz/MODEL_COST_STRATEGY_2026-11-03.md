# EspaLuz — how to pay for AI when there is no money yet, and how it scales when there is (3 Nov 2026)

Elena's question: usage is unknown, money is $0 (not even $10/month), and if traction comes, credits will run out
at an unknown moment by an unknown amount. What do comparable products do, and what should EspaLuz do?

Companion to `MODEL_COSTS_AND_FREE_TIERS_2026-11-03.md` (the measurements). Facts about other companies come from
third-party review/listing pages and are marked as such; none disclose their real model costs.

## 1. What comparable products visibly do

| Product | Price (third-party listings) | Free offer | Pattern |
|---|---|---|---|
| Buddy.ai (kids English, voice) | ≈ $12.49/month | 7-day trial (sources disagree on a free version) | trial → subscription; no ads |
| Replika (companion) | Pro ≈ $19.99/month, Ultra ≈ $29.99 | free chat on a "standard" model; smarter model on the top tier | **cheaper model for free users, better model for payers** |
| Language-tutor workloads generally | — | free tiers capped | one vendor sizes a tutor turn at 3–4K tokens in / ~200 out — the same as EspaLuz measured |

The pattern behind all of them (my evaluation, not a disclosed fact):
1. **Free users get a cheap model and/or a cap.** Nobody gives unlimited premium AI for free.
2. **The paying user funds their own AI.** The price is many times the model cost per user.
3. **The long fixed prompt is cached**, so the repeated part costs a fraction.
4. **They meter everything** — cost per user per day is a dashboard number, not a guess.

## 2. EspaLuz unit economics (measured inputs, my arithmetic)

One heavy family ≈ 60 lesson turns/day × (3,000 tokens in + 200 out) ≈ 5.4M in + 0.36M out per month.

| Model class (third-party prices per 1M in/out) | Cost per heavy family per month | vs. $11 subscription |
|---|---|---|
| Cheap open model (e.g. Gemma-class ≈ $0.07 / $0.34) | **≈ $0.50** | ≈ 5% of revenue |
| Gemini 3.8 Flash ($0.75 / $3.75) | ≈ $5.40 | ≈ 49% |
| Frontier (Opus-class $5 / $25) | ≈ $36 | loses money |

**So the fear "credits run out when traction comes" is solved by a rule, not by luck:** payers are served by a cheap,
good-enough paid model, and its bill is a small share of what they pay. Traction then *creates* the money that pays for
the AI, instead of draining it.

## 3. The plan

### Phase 0 — now, $0, no sign-ups (agent can build; Elena approves deploys)
1. **Meter it.** Log every reply: channel, user (hashed), provider, model, tokens in/out → one table. This answers
   "I don't know the volume" from data within a week. Without it every decision below stays a guess.
2. **Use the free capacity already owned.** Groq limits are *per model*: the web uses 3 Groq models, WhatsApp and
   Telegram use only `openai/gpt-oss-120b` (verified in code 3 Nov). Give the bots the same 3 → more free tokens/day.
3. **Spend fewer tokens per message.** WhatsApp makes 4 model calls per message (reply, translation, emotion, facts).
   Skip translation when the message is already Spanish/English; read emotion in the same call as the reply where
   possible. Shorten / cache the 1,940-token kids prompt.
4. **Fair-use cap + honest message.** Trial/free users: N replies/day. When every free source is exhausted, say so
   kindly ("Pere and Titi are resting — back at 7 pm") instead of failing silently. Paying families come first.

### Phase 1 — still $0, Elena signs up (≈10 min each, no card)
Cloudflare Workers AI (10,000 free units/day, resets 00:00 UTC), OpenRouter (50 free requests/day), Mistral, Cerebras.
Each becomes one more entry in the shared waterfall, after passing `eval_llm_chain.py`.
⚠️ Check each provider's data terms before kids lessons go there (free tiers may train on prompts); NVIDIA NIM and
similar "prototyping only" offers are not for production.

### Phase 2 — first revenue
Rule: **every paying family is served by a cheap paid model; top-up = a fixed share of last month's revenue**
(e.g. 10%), never a guess. At ≈ $0.50/family/month on a cheap open model, 10% of $11 covers one heavy family twice.
Free tiers stay as the first steps of the chain; paid is the floor that never runs dry for payers.

### Phase 3 — traction
Premium voice / smarter model as a higher tier (Replika pattern); prompt caching mandatory; daily cost-per-user alert.

## 4. What is NOT recommended
- Running an LLM on the Oracle box: it hosts every service; CPU inference would slow all of them.
- Perplexity for chat: paid per question + search.
- Adding many free providers before metering: it hides the problem instead of measuring it.

Sources: [eesel — Replika pricing](https://www.eesel.ai/blog/replika-ai-pricing) ·
[aicompanionpick — Replika free vs paid 2026](https://aicompanionpick.com/replika-free-vs-paid-2026) ·
[weavai — Replika review 2026](https://weavai.app/blog/en/2026/04/07/replika-ai-review-2026-full-analysis-of-features-pricing-pros-cons-is-it-worth-subscribing/) ·
[AlternativeTo — Buddy.ai](https://alternativeto.net/software/buddy-ai/about/) ·
[saasworthy — Buddy.ai](https://www.saasworthy.com/product/buddy-ai) ·
[Inworld — inference pricing](https://inworld.ai/inference) ·
[OpenRouter — lowest-cost inference](https://openrouter.ai/blog/tutorials/how-to-get-the-lowest-cost-llm-inference-on-openrouter/) ·
[DEV — free AI APIs Oct 2026](https://dev.to/hassann/top-8-free-ai-apis-in-october-2026-5bb5) ·
[toolhalla — free AI APIs 2026](https://toolhalla.ai/blog/best-free-ai-apis-2026)
