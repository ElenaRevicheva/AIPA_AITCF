# Prompt CHANGELOG — v1 → v2

This is the prompt-stack story the brief asked for. It is also the honest
answer to *"where did the AI help, and where was it wrong?"*

## v1 — raw CSV in, judgement out

**Instruction:** here is the extract; write a briefing; use your judgement.

**What the model did well:** fluent prose, plausible section headings, a tone
an executive would accept at a glance.

**Where it was wrong (systematically, not occasionally):**

| Failure | Example | Why it matters |
|---|---|---|
| Invented arithmetic | Cover ratios off by 0.1–0.5 months; growth % rounded or recomputed | One wrong number discredits the whole brief |
| Missed phase-out rule | Recommended reordering Propolis because cover < 2 months | The 30-day floor is the whole point of that trap |
| Missed premium target | Treated 1700+ as a 2-month target | Understates the gap by a full month |
| Credited arrival=0 | Inflated cover on every SKU with a zero arrival | Quietly hides the SKUs that actually need stock |
| Invented causes | "Inbound was ordered before growth accelerated" | No forecast or order history exists in the data |
| Ranked by panic | Put the lowest-cover SKU first | Brief asks for revenue opportunity, not stock risk |

v1 is retained as a control. It is never called by the pipeline.

## v2 — decision object in, narration out

**Instruction:** here is a pre-computed decision object; write prose; do not
calculate; prefer `display` strings; do not invent causes.

**What changed in the payload, not just the prompt:**

The first v2 runs still failed the numeric guard — not because the prompt was
soft, but because the model computed figures the payload did not contain:

- `months_over_target` (cover − target) for the overstocked lines
- rounded percentages (`11%` from `11.8%`)
- ad-hoc totals (`$112,000`) and post-arrival cover figures

**Prompt wording alone cannot stop a model from computing.** The fix was
two-layered:

1. **Put every derived figure the narrative needs into the payload**
   (`months_over_target`, `gap_months`, `forward_cover`, formatted `display`
   strings). If the model needs it, it reads it.
2. **Gate on the numeric guard.** Unknown tokens → one corrective retry →
   deterministic template. Invented figures cannot ship.

## Where the AI helped

- Turning a ranked decision object into a five-minute executive read.
- Holding a consistent tone across OpenAI, Anthropic, Groq, and xAI/Grok.
- Surface phrasing of rationales already decided in Python.

## Where the AI was wrong — and how we caught it

- Subtracting cover − target even when both inputs were visible (Anthropic,
  caught by guard; payload then gained `months_over_target`).
- Rounding growth percentages for neatness (caught by guard; `display` strings
  now carry the exact one-decimal form).
- Inventing qualitative causes ("growing faster than forecast") — caught by
  prompt tightening; the guard cannot catch non-numeric fabrication, which is
  why the prompt forbids it explicitly and why Part 2 treats absence-of-brief
  alerts as a separate concern.

## Cross-provider note

All four providers were live at build time. Anthropic's credit balance hit
zero mid-run; failover moved to the next key. The first failover was silent —
exactly the degraded-healthy failure mode. Failover is now a first-class
`NOTICE` in the briefing and in `run_log.json`.
