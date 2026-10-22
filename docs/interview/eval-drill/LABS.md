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

### Lab 2 · Lead triage: which model should score my leads? (real, 18 Oct) — closed: a null result

**The question.** CTO AIPA scores every lead (urgency 1–5) and pushes it into HubSpot only at urgency ≥ 3
(`src/lead-triage.ts:338-350`). Does the scorer work, and which model should do it?

**Step 1 — read the real code** (`src/lead-triage.ts:145-155`). Groq `openai/gpt-oss-120b` (a thinking model), room for
220 tokens, temperature 0.1. Trap on line 154: an empty reply becomes `{}`, which parses as "valid", so the lead is
stored as urgency 1, "No summary" — *fail-open*, no error anywhere.

**Step 2 — check production, not the config.** `TRIAGE_SKIP_GROQ=1` has been set since 12 Apr (commit `81877025`, a
temporary workaround for a Groq crash), so every lead went to Claude Haiku — which kept failing: the logs show
"model not found" 404s for retired Haiku model IDs, and from mid-August the Anthropic credit was empty too.
Read-only count of the `lead_triage` table:

| month | inbound leads | "Classification failed" | prospects | "Classification failed" |
|---|---|---|---|---|
| Jun | 5 | 4 | 17 | 11 |
| Jul | 19 | 1 | 132 | 76 |
| Aug | 14 | 6 | 214 | 94 |
| Sep | – | – | 118 | 118 |
| Oct | 6 | 5 | 177 | 95 |

16 of 44 "inbound" rows and 394 of 812 "prospect" rows since June were never scored, while the daily job logged a normal
run every morning: *a job that ran is not a job that produced output.* **But see step 5: when I looked at the rows,
almost all were my own test messages or scraped job posts — not customers.** The counts are true; "lost leads" was not.
(Each website inquiry also sends a notification email, `src/marketing-notify.ts`.) Named concepts: **silent failure /
fail-open**, **workaround rot** (a temporary switch that outlived its reason), **check traffic before tuning**.

**Step 3 — test set from the production table.** 20 recent rows (14 "inbound", 6 "prospects"; 17 had failed in production),
rebuilt into the exact production prompt — the export proves all 15 fixed lines of the template are in the deployed
code. Private: `~/_scratch/lab2/task/cases.jsonl` on Oracle, never in git (`tasks/lead-triage/.gitignore`).

**Step 4 — the no-label test** (`tasks/lead-triage/grade.cjs`, 8/8 self-checks; 2 runs per lead):

| setup | answers | cut off at the budget | usable (finished) | same answer both runs | pushes to HubSpot (urgency ≥ 3) | $ / 100 leads |
|---|---|---|---|---|---|---|
| gpt-oss-120b · 220 tokens · temp 0.1 (production if Groq is switched back on) | 26 | **12 (2 empty)** | 14 of 14 | 100% | – | free tier |
| gpt-oss-120b · **600** tokens · temp 0.1 | 17 | **0** | 17 of 17 | 100% | 16 of 17 | free tier |
| gemini-3.5-flash-lite · default temp (1.0) | 40 | 0 | 40 of 40 | 75% | 24 of 40 | $0.025 |
| gpt-4.1-mini · temp 0.1 | 40 | 0 | 40 of 40 | 100% | 34 of 40 | $0.021 |

Also: 37 Groq calls were refused — free tier, 8,000 tokens per minute (logged as errors, never scored).

What it shows: **the 220-token budget is the failure, not the model** — the model thinks ~159 tokens before answering.
Both paid models are usable and cheap, but they **disagree on the push decision for 5 of 20 leads** (t03, t09, t11, t15,
t16; e.g. t03 = 1 on Gemini, 3 on gpt-4.1-mini). Usable is not correct — only my labels can decide.

**Step 5 ✋ — my labels → the case set was not real.** Reading the 20 rows, I found almost all were my own test
messages ("TEST from Elena…", "i need a PA") or synthetic/demo inquiries, and the "prospects" were scraped job posts
("Pain point: … Source: hn_hiring"). No model and no query could have told me that — only the business owner can.
Named concepts: **garbage in, garbage out / eval-set contamination** (test rows mixed into production data corrupt both
the statistics and the test set), **review the dataset before trusting the score**, **ground truth needs a human**.

**Step 6 — the decision: do NOT tune lead triage.** Real lead traffic through this path is close to zero, so a better
model here earns nothing — a **null result**, and a cheap one ($0.05, one afternoon). What I keep from the lab: the
budget lesson (gpt-oss cut off 12 of 26 at 220 tokens, 0 of 17 at 600), the "usable ≠ correct" lesson (two models,
40/40 usable, different push decisions), and the method. Open, my call, no rush: switch triage off or tag test rows at
the source; if real inbound volume ever appears, re-run this lab with real labelled leads first. Next lab goes where
real decisions and real labels already exist (the VJH judge: my own applied / no-fit decisions).

### Lab 3 · VJH judge: does it agree with my real decisions? (real, 18 Oct) — waiting for my step 3 ✋

**Why this one makes sense:** real traffic (it screens every job before I see it), real ground truth (my own applied /
No-fit decisions, synced from HubSpot), real stakes (a wrong "no fit" hides a job I would apply to).

**Step 1 — read the real system** (`VibeJobHunterAIPA_AIMCF/src/core/llm_judge.py`): gpt-4o-mini first of 5 providers
(Claude last on purpose — most expensive), **temperature 0**, **300-token budget** (raised from 120 after the same
truncation trap as Lab 2), and code guardrails after the model (`latam_veto_is_wrong`, `timezone_veto_is_wrong`,
`pay_veto_is_wrong`) — a rule the prompt cannot hold lives in code. The tool: `scripts/replay_learning.py` — writes
nothing, judges each decision on the **posting it was made on** (never my own words: no **label leakage**), excludes the
12 examples quoted in the prompt (no marking its own homework), and compares the old vs current instruction block — a
built-in **ablation** (one ingredient on/off).

**Step 2 — run it twice, read the noise first** (Oracle, read-only, a few cents):
- With `--since 2026-09-20` it **refused to score**: only 6 rejections and 0 applications since then have a posting on
  record → "JUDGE not measured". Refusing to report below a minimum sample is good design.
- Learned rules (code, no model): catch 9 of 391 rejections, **wrongly block 0 of 40 applications** (the hard constraint).
- Full sample, 20 rejections + 20 applications, two runs:

| | run 1 | run 2 |
|---|---|---|
| old instructions — my No-fits it also rejects | 14/20 | 14/20 |
| old instructions — my applications it approves | 8/20 | 8/20 |
| current instructions — my No-fits it also rejects | 12/20 | 13/20 |
| current instructions — my applications it approves | 8/20 | 7/20 |

What it shows: the same setup moves by 1 between runs, so old vs current differs **within noise** (another null result).
The stable signal: the judge approves only **7–8 of 20 jobs I applied to**, and 9 of its 12 misses give one reason —
criterion **3d/3h**, "hands-on engineering/coding, not AI product management or solutions architecture".
Trap before any prompt change: my targeting changed on 20 Sep, and many of those applications are older. If my criteria
changed, old labels are stale — **label staleness / concept drift** — and the judge may be right by today's rules.

**Step 3 ✋ — refresh the labels.** For each of the 12 applied-but-rejected jobs: *would I still apply today?* If yes for
most of the 3d/3h ones, the fix is one line in criterion 3d, tested offline with a before/after replay. If no, the judge
is right and nothing changes.

---

## Part 5 — Doing all of this inside the Claude Code app

**Two layers — never mix them up.**
1. **Claude Code's own brain** — the settings of the assistant I am talking to. Set in the app UI.
2. **My agents' settings** — temperature, budget, model and prompt of CTO AIPA, VJH, EspaLuz. They live in code and
   `.env`. I change them by *asking Claude Code in plain words*, and it proves the change with the test kit.
Temperature exists only in layer 2. The app has no temperature control.

### Layer 1 — where the controls are (Code tab, desktop app; checked against the docs 18 Oct)

| what | where in the app | when I use it |
|---|---|---|
| **Model** | dropdown next to the send button (Mac shortcut Cmd+Shift+I); can change mid-session | Opus for build work; Fable for the hardest sessions |
| **Effort** | the effort menu (Mac shortcut Cmd+Shift+E; on Windows open it from the model dropdown area) | xhigh for building and evals (my default: 35 of 37 sessions); lower for quick status questions — saves usage |
| **Permission mode** | mode selector next to the send button (Mac Cmd+Shift+M): Manual · Accept edits · **Plan** · Auto · Bypass | **Plan** before any change to a live agent: Claude explores and proposes, edits nothing. Plan lasts for the session only |
| **Usage** | the usage ring next to the model picker | check before a big multi-agent run |
| **Parallel experiments** | **+ New session** (Ctrl+N on Windows); the **worktree** option next to the branch name gives a private copy | compare two models on the same task: two sessions, same prompt, different model in each dropdown |
| **What I see** | Ctrl+O cycles Normal / Thinking / Verbose | Verbose when I want to watch every command |
| **Slash commands** | type `/` in the prompt box | `/compact` when a long session gets slow |

This session on 18 Oct read back as: model `claude-opus-5-5`, effort `xhigh`, mode `auto`, fast mode off.

### Layer 2 — the conversation recipe (what I type, in order)
1. *(mode selector → Plan)* "Plan only: I want to test ONE change to <agent>. Show me the current setting or prompt
   line, propose one new line, the cases, the grader and the exact command. Do not edit anything."
2. "Before any change: run the current version twice on the same cases and tell me the noise between the two runs."
3. *(after I approve the plan → Auto)* "Make the change in a private copy (Oracle `~/_scratch` or a worktree), not in
   the live files. Run it twice."
4. "Show me only three things: noise between runs, before vs after, and every case that flipped — both directions."
5. "Does it break anything I want? (my applications it would now hide, my No-fits it would now approve)"
6. "Write the result into LABS.md and the lab log. If I say go: make the smallest change in the real file, deploy,
   and prove from the production logs that it took."
Words that make Claude Code do it the engineering way: *one change*, *twice*, *same cases*, *private copy*,
*both directions*, *prove from the logs*.

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
| 18 Oct 2026 | Lab 2 lead triage | 410/856 rows unscored since Jun, but the rows were almost all my tests + scraped job posts; gpt-oss cut off 12/26 at 220 tokens, 0/17 at 600; Gemini and gpt-4.1-mini usable 40/40, disagree on 5/20 pushes | do NOT tune triage (≈ no real traffic); next lab where real labels exist | Elena + Claude Code |
| 20 Oct 2026 | evals in the Claude Code UI (steps 1–3) | no temperature control in the app; from temp-openai: temp moved consistency (v1 5/5-same 90%→50%), not accuracy (inside ±10); I ran `--selftest` myself: gold 100/100, empty 41% free, garbage 0/0. API credit back: Haiku 4.5 + Sonnet 4.6 HTTP 200 | Step 4 (gpt-4.1-mini vs Claude Haiku 4.5 vs Sonnet 4.6, prompt v2, 3 reps, `--out results/models-20oct`) NOT run yet; prediction written first: all within ±13 | Elena + Claude Code |
| 18 Oct 2026 | intake drill (README) | spec v1→v2 30–45%→80–100%; temp moved repeatability only; effort low = medium at 56% cost | prompt v2; temp 0 on gpt-4.1-mini; Gemini 3 at 1.0 | Elena + Claude Code |
