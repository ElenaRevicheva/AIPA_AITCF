# Manukora — Monthly S&OP Briefing Automation

Practical brief for the **AI Automation Engineer** role.

Turns the mock Shopify/Amazon inventory extract into a five-minute executive
S&OP briefing: what sold, what is at risk, what to reorder, ranked by
**revenue opportunity** (retail price × projected monthly demand).

**Design principle:** all arithmetic is deterministic Python. The LLM only
turns a pre-computed decision object into prose — and a numeric guard refuses
to ship invented figures.

```
manukora-sop-brief/
├── ASSUMPTIONS.md
├── README.md                 ← you are here
├── requirements.txt          ← stdlib only
├── data/mock_sales_inventory.csv
├── src/                      ← load · metrics · rules · narrate · guard · main
├── prompts/                  ← v1 control · v2 final · CHANGELOG
├── tests/                    ← one named test per trap + guard tests
├── output/                   ← generated briefing + decision payload
└── docs/
    ├── PART2_MORNING_INTELLIGENCE_BRIEF.md
    └── evidence/             ← run transcript
```

---

## Setup and run

Requires **Python 3.10+**. No pip packages required for the pipeline.

```bash
cd manukora-sop-brief

# Always works offline — deterministic template narration
python3 -m src.main --skip-llm

# Optional: model-written narration (any one key is enough)
cp .env.example .env   # fill OPENAI_API_KEY and/or ANTHROPIC / GROQ / XAI
set -a && source .env && set +a
python3 -m src.main                # auto-picks first live provider
python3 -m src.main --prefer openai
```

Outputs land in `output/`:

| File | What |
|---|---|
| `sop_briefing_2026-03.md` | Executive briefing |
| `decision_payload.json` | Exact object the model is allowed to see |
| `metrics.json` | Per-SKU arithmetic |
| `run_log.json` | Provider used, guard result, failover notices |

### Verify the math

```bash
python3 -m unittest discover -s tests -v
```

19 tests. Each seeded trap in the brief has a named test. If a number in the
briefing changes, a test should fail before a reviewer has to notice.

---

## Approach

1. **Load and validate** the extract (`src/load.py`).
2. **Compute** pooled demand, launch-aware growth, M4 cover, one-month forward
   cover, and revenue opportunity (`src/metrics.py`).
3. **Decide** with explicit business rules — phase-out floor, 3-month premium
   target, arrival=0 means no order, rank by revenue opportunity, flag channel
   divergence (`src/rules.py`).
4. **Narrate** from the decision object only (`src/narrate.py`). Four providers
   wired (OpenAI, Anthropic, Groq, xAI/Grok). Failover is a visible `NOTICE`,
   never silent.
5. **Gate** with `src/numeric_guard.py`. Unknown numbers → one retry →
   deterministic template. Invented figures cannot ship.

### Why not “just ask the model”?

Reviewers will check the numbers. An LLM dividing stock by demand across twelve
SKUs will eventually get one wrong, and one wrong number discredits the whole
briefing. Separating compute from prose also produces an honest answer to
*where did the AI help, and where was it wrong?* — see below and
`prompts/CHANGELOG.md`.

---

## Prompt stack (required by the brief)

| Version | File | Role |
|---|---|---|
| v1 | `prompts/v1_first_attempt.md` | Control — raw CSV in, “use your judgement” |
| v2 | `prompts/v2_final.md` | Production — decision object in, narration only |
| delta | `prompts/CHANGELOG.md` | What changed, why, where the AI failed |

### Where the AI helped

- Turning a ranked decision object into a five-minute executive read.
- Holding tone across providers once the payload was complete.

### Where the AI was wrong — and what I changed manually

Observed during build (also in the changelog):

| Failure | Fix |
|---|---|
| Model subtracted `cover − target` even when both inputs were visible | Added `months_over_target` to the payload; guard rejects unknown tokens |
| Model rounded `11.8%` → `11%` for neatness | Pre-formatted `display` strings; guard rejects alien percents |
| Model invented totals (`$112,000`) and causes (“before growth accelerated”) | Prompt forbids invention; guard gates numeric fabrications; qualitative causes banned |
| Failover when a provider’s credit died was **silent** | Failover now writes a first-class `NOTICE` into the briefing and `run_log.json` |

Prompt wording alone did not stop computation. The guard is a **gate**, not a
warning.

---

## Decisions this run makes on the mock data

| Priority | SKU | Cover / target | Revenue opportunity | Call |
|---|---|---|---|---|
| #1 | MGO 514+ 500g | 1.99 / 2 (fwd 1.82) | ~$34,284 | reorder |
| #2 | MGO 850+ 500g | 1.80 / 2 | ~$29,491 | reorder |
| #3 | MGO 1700+ 100g | 2.80 / **3** | ~$19,845 | reorder |
| #4–5 | Bioactive Energy, Recovery | under 2 | ~$17.4k, ~$16.5k | reorder |
| — | Propolis Tincture | 1.37 / 2 (**41 days**) | — | **do not reorder** (phase-out floor) |
| — | MGO 100+ 250g | 6.20 / 2, Amazon −4% | — | **investigate**, do not reorder |

Full narrative: [`output/sop_briefing_2026-03.md`](output/sop_briefing_2026-03.md).
Assumptions: [`ASSUMPTIONS.md`](ASSUMPTIONS.md).
Part 2 architecture: [`docs/PART2_MORNING_INTELLIGENCE_BRIEF.md`](docs/PART2_MORNING_INTELLIGENCE_BRIEF.md).

---

## Tradeoffs

- **Stdlib only** — fewer moving parts for a 48-hour brief; urllib is enough
  for four provider adapters. No n8n/Make export because the hard part is the
  decision layer, not the wrapper.
- **Template narration is first-class**, not a shame path. The brief must be
  correct with zero API keys (CI, reviewer laptop, credit exhaustion).
- **One-month projection cap** — honest about what four data points can
  support. Documented in `ASSUMPTIONS.md`.
- **No live connectors** — out of scope for the mock; Part 2 is where Shopify
  + Klaviyo land.

---

## Part 2

Architecture only (500–800 words): daily Morning Intelligence Brief with
Shopify + Klaviyo, engagement-triggered delivery across NZ/LA/travel without
geolocation, sub-$50/mo operating cost, and an alert on *absence* of a brief.

→ [`docs/PART2_MORNING_INTELLIGENCE_BRIEF.md`](docs/PART2_MORNING_INTELLIGENCE_BRIEF.md)


---

## Publishing the submission repo

Manukora wants **one GitHub repository link**. This folder is the deliverable.
A clean 4-commit history is packaged as a git bundle:

```bash
# On a machine where `gh auth` is ElenaRevicheva:
./scripts/publish_submission_repo.sh
# → https://github.com/ElenaRevicheva/manukora-sop-brief
```

Or manually:

```bash
git clone docs/evidence/manukora-sop-brief.bundle ~/manukora-sop-brief
cd ~/manukora-sop-brief
gh repo create ElenaRevicheva/manukora-sop-brief --public --source=. --remote=origin --push
```

Optional: regenerate the briefing with a live model before pushing:

```bash
export OPENAI_API_KEY=...   # or ANTHROPIC / GROQ / XAI
python3 -m src.main --prefer openai
git add output && git commit -m "chore: regenerate briefing with OpenAI narration"
```
