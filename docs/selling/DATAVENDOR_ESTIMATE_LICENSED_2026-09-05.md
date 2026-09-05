# HUD estimate on the cleaned copies — the history strip cost ~$61k (5 Sep 2026)

Run before creating the new listing, exactly to catch something like this.
Estimate `01a0734a-93a2-7bb2-b314-68b3024f79ef`, all 8 `-licensed` repos.

## The number

| | Originals (31 Aug) | `-licensed` copies (5 Sep) |
| --- | --- | --- |
| **Point estimate** | **$89,481** | **$28,073** |
| Range | $61,067 – $350,557 | $28,073 – $187,999 |
| Codebase score | **44% — Promising** | **16% — Early** |

**Difference: −$61,408 on the point estimate, −28 points of score.**

HUD's wording: *"Limited quality measurements today, but the code may still be useful
for targeted buyer conversations."*

## Why — the scale is now fully visible

HUD scores 97 points across 8 measurements, and *"the score grows the price
exponentially from $1,500 at zero to $100,000 at the top of the scale."*

| Measurement | Max | What the copies scored |
| --- | ---: | --- |
| Test coverage | 20 | **0** — not measured on any repo |
| Pull requests | 20 | **0** — a repo created today has none |
| Complexity score | 16 | 16/16 on 4 Python repos · **not measured** on the other 4 |
| **Commits** | 13 | **1.04** everywhere — one commit |
| Documentation volume | 12 | 12/12 on 4 repos |
| CI pass rate | 7 | only `AIPA_AITCF` scored (5.36) |
| **Churn × complexity** | 5 | **0** everywhere — needs history to compute |
| Documentation reach | 4 | ~0 |

### The clean-room export destroyed 2,791 commits

| Repo | Original commits | Licensed copy |
| --- | ---: | ---: |
| AIPA_AITCF | 1,256 | 1 |
| VibeJobHunterAIPA_AIMCF | 562 | 1 |
| EspaLuzWhatsApp | 391 | 1 |
| EspaLuzFamilybot | 207 | 1 |
| dragontrade-agent | 173 | 1 |
| EspaLuz_Influencer | 126 | 1 |
| AILA | 40 | 1 |
| atlas-captures | 36 | 1 |
| **Total** | **2,791** | **8** |

**Commits (13 pts) + Churn × complexity (5 pts) = 18 of 97 points** are history-derived,
and both went to ~zero. On an exponential price curve that is most of the gap.

> **Named failure mode: optimising for the gate instead of the asset.**
> `history-free by construction` was written to satisfy "clean git history". It does —
> and it deleted the thing being valued. The QC checkbox was passed by destroying 69% of
> the estimated price. **Read what the buyer measures before deciding what to strip.**

## The second problem — the copies are QC-*worse* than the originals

Four repos now report **`SOURCE LOC: Unavailable`** and **`Complexity: Not measured`**:
`AIPA_AITCF`, `dragontrade-agent`, `AILA`, `atlas-captures`.

On the live listing the **originals passed `codebase complexity` on 6 of 8.** The copies
would fail it on 4 of 8.

Worst case is the flagship: **`AIPA_AITCF-licensed` scores 7% / $1,979** — it is the
$12,000 anchor of the bundle. Unexplained: the stored archive (4.2 MB) covers the whole
repo (4.1 MB), so "archive did not cover every file" does not obviously apply. **Worth
asking Megan directly** — it may be a platform limit on TypeScript/JS trees, since the
four repos that measured cleanly are all Python-dominant.

So switching to the clean copies as-is would trade **5 `pii_qc_llm` failures** for
**4 new `codebase complexity` failures**, at a $61k lower valuation. That is not a good
trade, and it is the reason this estimate was run before listing.

## The fix — scrub the history, do not delete it

Rebuild each `-licensed` repo from a **throwaway full clone** of the original, rewriting
**every commit** with the same scrub rules (`git filter-repo --replace-text`), then
force-push into the `-licensed` repo.

- Recovers **Commits (13)** and **Churn × complexity (5)**, and probably the missing
  complexity/LOC measurements.
- Produces history that is *cleaner than the originals* — the originals still carry the
  Railway password and 400 addresses **in their history**, which is likely part of why
  `pii_qc_llm` fails on them at all.
- **The working repos are still never touched.** The rewrite happens on a scratch clone;
  `IRON RULE: never destroy` is about the repos that deploy from git, and those are not
  in the loop.
- `git filter-repo` is **not installed** — `pip install git-filter-repo` first.

## Not fixable by us

- **Pull requests (20 pts)** — solo development, 0 PRs on the originals too. Not a
  regression; just 20 points nobody is scoring.
- **Test coverage (20 pts)** — needs coverage reports in the repo. `AIPA_AITCF` scored
  CI pass rate 5.36/7, so CI signal *is* being read; coverage artefacts would be a real,
  separate uplift worth up to 20 points.

## Status

Nothing has been listed. The old listing is untouched and still Active. The 8 `-licensed`
repos exist and are private but should **not** be listed in their current one-commit form.
