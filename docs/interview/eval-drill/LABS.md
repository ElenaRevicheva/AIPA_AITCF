# Lab book — learning model settings on my own agents

Hands-on, on real AIdeazz agents, only where it touches money. Each lab is 20–40 minutes. Claude Code runs the
commands; **the steps marked ✋ are mine** — writing what "correct" means, labelling cases, reading failures, and
making the decision. Every lab ends with one line in the lab log at the bottom. No new machinery: every lab reuses
`run-eval.cjs` (this folder) or an eval that already exists in the repo it tests.

---

## Part 1 — How the settings work

A model writes one token (about ¾ of a word) at a time. For each token it scores every candidate, turns the
scores into odds, and picks one. Every setting below changes one part of that loop — or what goes into it.

| setting | what it really changes | when it matters | how I measure it | proof from my own runs |
|---|---|---|---|---|
| **temperature** | how sharp the odds are before the pick: 0 = always the top token, high = flatter odds, more varied picks | non-reasoning models I call myself; output that code parses | same cases × 5 runs at each value: accuracy **and** "same answer every run" | gpt-4.1-mini: accuracy flat 0→1.5, same-answer 90%→50% (v1). Gemini 3.5 Flash-Lite: no change at all |
| **top_p** | cuts the long tail: only the tokens making up the top X% of the odds can be picked | almost never — change temperature *or* top_p, not both | same as temperature | not tested; OpenAI's own advice is to change one of the two |
| **max_tokens** | a ceiling on output, not a target. On a reasoning model the hidden thinking spends from the same budget | every reasoning model (gpt-5, gpt-oss on Groq, Claude 5.x, Gemini 2.5 Flash) | count empty and cut-off replies at the budget production sends | 16-token probe on gpt-oss-120b: 14 tokens of thinking, reply empty. VJH judge at 120 tokens: JSON cut mid-sentence, failed open |
| **reasoning effort** | how long the model thinks before answering — the knob that replaced temperature on reasoning models | gpt-5 family, Claude after Opus 4.6, Gemini 3 thinking levels | same cases at low / medium / high: quality, latency, cost | gpt-5-mini: `low` = `medium` (98%) at 56% of the cost |
| **model** | capability, price, latency, failure modes | when a cheaper or faster model might hold the bar | same prompt and cases, only the model changes | 4 OpenAI models on 38 real judge decisions: 20–24 right — no swap justified |
| **the prompt** | what "correct" means to the model | always — the biggest lever | prompt versions as files (v1, v2…), one change each | intake drill: v1 → v2 case pass 30–45% → 80–100%; invented prices 6/60 → 0/60 |
| **the context** | what facts the model sees | variety, grounding, hallucination | before/after on the same inputs | Atuona: 4 chosen facts instead of 38k tokens → variety fixed, ~$0.45 → $0.075 a call |

**Three things that surprise people (and interviewers like hearing):**
1. **Temperature 0 is not deterministic.** At 0, 2 of 20 cases still changed answer across 5 runs. Servers batch
   requests and tiny numeric differences flip close calls. Always run a comparison more than once.
2. **A setting can be silently ignored.** Atuona is configured at 0.9; the model that wrote 238 of 255 logged replies
   runs a hard-coded 0.7, and Claude rejected the value. Check behaviour in the logs, not in the config.
3. **On reasoning models, the budget is the setting that bites.** An empty reply looks like "no objection" to a judge
   and "no flag" to a classifier. Count empty and cut-off replies before arguing about temperature.

**Where each setting lives**
- **In Claude Code and Cursor:** no temperature at all. Model (`/model`, pin a full ID when comparing), effort
  (`/effort`), plan mode. I run Opus at xhigh (35 of 37 sessions since 14 Aug).
- **In my own API calls:** `temperature`, `max_tokens` / `max_completion_tokens`, `reasoning_effort` (OpenAI),
  `output_config.effort` (Claude), `thinkingConfig` (Gemini). My code already strips temperature for gpt-5 and Claude 5
  models (`src/cover-letter.ts:489`, `src/atuona-creative-ai.ts:4340`).

---

## Part 2 — Where it makes sense in AIdeazz

_(filled from the 18 Oct fleet map — see below)_

---

## Part 3 — The labs

### Lab 0 · See temperature (10 min) — done 18 Oct
The interactive explainer in the 18 Oct session: slide temperature and top_p, press Sample, watch the odds of
"balatas" vs "flores". Takeaway: temperature changes how boldly the model picks from its own list; it never adds
knowledge.

---

## Part 4 — The checklist (say it in this order)
1. Write what "correct" means before any run — including what must **never** happen.
2. Freeze the cases, with the expected answer written before the first run. Hard cases on purpose.
3. Test the grader: correct answers must score 100%, garbage 0%. Note the free points a do-nothing model gets.
4. Change **one** thing. Prompt *or* model *or* temperature/effort *or* budget.
5. Run each configuration more than once. Read the noise floor before reading the winner.
6. Read the failures by hand. If more than 1 in 10 is the grader's fault, fix the grader first.
7. Decide on quality, cost and latency together; write the decision and its limits down.
8. Ship the smallest change (a value, a prompt line), then check the production logs that it took.

---

## Lab log

| date | lab | result (numbers) | decision | by |
|---|---|---|---|---|
| 18 Oct 2026 | intake drill (README) | spec v1→v2 30–45%→80–100%; temp moved repeatability only; effort low = medium at 56% cost | prompt v2; temp 0 on gpt-4.1-mini; Gemini 3 at 1.0 | Elena + Claude Code |
