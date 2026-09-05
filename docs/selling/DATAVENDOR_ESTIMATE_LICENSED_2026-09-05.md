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


---

# UPDATE — history rebuilt, 2,472 commits restored (5 Sep, later)

`scripts/rebuild-license-history.cjs` rebuilt all 8 `-licensed` repos from throwaway
full clones with `git-filter-repo`. Working repos untouched, proved by HEAD + dirty
count identical before/after and remotes still pointing at the originals.

| `-licensed` repo | Commits now | Was |
| --- | ---: | ---: |
| AIPA_AITCF | 940 | 1 |
| VibeJobHunterAIPA_AIMCF | 561 | 1 |
| EspaLuzWhatsApp | 389 | 1 |
| EspaLuzFamilybot | 207 | 1 |
| dragontrade-agent | 173 | 1 |
| EspaLuz_Influencer | 126 | 1 |
| AILA | 40 | 1 |
| atlas-captures | 36 | 1 |
| **Total** | **2,472** | 8 |

`AIPA_AITCF` prunes 1,260 → 940 because ~320 commits touched **only** dropped paths
(`docs/selling/` and friends); once those are gone the commits are empty and filter-repo
removes them. Correct behaviour.

## Verified by re-cloning FROM GitHub, not from the local tree

`AIPA_AITCF-licensed`: 940 commits · 352 files · authors all `…@users.noreply.github.com`
or `cursoragent`. Full-history grep: `E-8-245573` **0**, `AE1074827` **0**, both Railway
passwords **0**, `proxy.rlwy.net` **0**, `VENTAS@ABOLU.NET` **0**, and `docs/selling/`,
`docs/oracle/`, `dist-lambda/` **0** paths across every commit.

## Four bugs found on the way — three would have shipped damage

Validated on `dragontrade-agent` first, which is why they were caught at all.

1. **Harvesting from `git log -p` picked up DIFF METADATA.** `4842332 100644` — a git
   index line — was queued for replacement *as a phone number*.
2. **`password==>REDACTED` and `...==>REDACTED`** were harvested from documentation
   examples. Rewriting the word "password" everywhere is silent corruption that no PII
   check would ever report.
3. **Round numbers are MONEY, not phones.** `dragontrade-agent` is a trading repo and the
   harvest wanted to rewrite `850000000000` and `25000000000` — market caps — into fake
   Panama mobiles. Now rejects 5+ trailing zeros and long repeated-digit runs.
4. **`--replace-text` is CASE-SENSITIVE.** Rules emitted from lowercased keys meant
   `ventas@abolu.net` never matched the literal `VENTAS@ABOLU.NET`. **A real third-party
   address survived while the log reported the rule as applied.**

## The named lesson — one surface is not the surface

An email lives in **three** places in a git repo, and each needs its own instrument:

| Surface | Instrument | What was missed without it |
| --- | --- | --- |
| Author metadata | `--mailmap` | her personal gmail on every commit |
| Commit message | `--replace-message` | 33 `Co-Authored-By` trailers |
| File content | `--replace-text` | the addresses in the code |

And the sharper version: **the verifier read three surfaces while the harvester read one.**
So `admisiones@aip.edu.pa` — a school, in a commit message only — never got a replacement
rule generated, and `--replace-message` had nothing to apply. The checker kept correctly
reporting a finding the fixer was structurally unable to fix.

> **A checker that inspects a wider world than the fixer writes rules for will report
> findings forever.** Align the surfaces, not the verdicts.

Also fixed: the canary list had only ever been a *checker*. Anything on it that is present
in history is now **rewritten** — which is what removed the cédula.

---

# RE-ESTIMATE after the history rebuild — $38,346 (estimate `01a07376-…`)

| Run | Point | Score | Commits |
| --- | ---: | ---: | ---: |
| Originals, 31 Aug | $89,481 | 44% | full |
| `-licensed`, no history | $28,073 | 16% | 8 |
| **`-licensed`, scrubbed history** | **$38,346** | **23%** | **2,472** |

Range now **$38,346 – $252,198**. Restoring history was worth **+$10,273** and +7 points,
and `COMMITS AT REFS` reads **2,472**.

## The remaining gap is a PLATFORM measurement gap, not our code

| `-licensed` repo | Score | Point | SOURCE LOC | Primary language |
| --- | ---: | ---: | --- | --- |
| VibeJobHunterAIPA_AIMCF | 40% | $8,020 | 54,567 | Python |
| EspaLuzWhatsApp | 38% | $7,428 | 26,994 | Python |
| EspaLuzFamilybot | 37% | $7,138 | 28,427 | Python |
| EspaLuz_Influencer | 36% | $6,907 | 4,028 | Python 75 / JS 25 |
| **AIPA_AITCF** | **16%** | **$2,951** | **Unavailable** | **TypeScript** |
| **dragontrade-agent** | **8%** | **$2,097** | **Unavailable** | **JavaScript** |
| AILA | 6% | $1,909 | Unavailable | — |
| atlas-captures | 6% | $1,897 | Unavailable | data |

**Every Python repo measures. Every JS/TS-primary repo does not**, loses the 16-point
`Complexity score` term, and lands at 6–16%.

Ruled out: file size. `VibeJobHunterAIPA_AIMCF` carries a **4 MB PDF** and measured fine;
`AIPA_AITCF`'s largest file is a 1 MB PNG. Ruled out: language detection — the report
prints `TypeScript 70%, JavaScript 26%` for AIPA_AITCF, so Linguist sees it.

**This is worth roughly $9,000.** If `AIPA_AITCF` and `dragontrade-agent` measured like
the Python repos (~37%), they would price near $7,400 and $7,000 instead of $2,951 and
$2,097 — putting the bundle around **$48,000** with no change to the code.

`AIPA_AITCF` is the **$12,000 anchor of the listing** and HUD prices it at **$2,951**.
That is the single most valuable question to put to Megan, and it is on their side.

## Still unscored, and honest about it

- **Test coverage — 0 of 20 points on all 8.** The largest single unscored term. It needs
  real coverage reports committed. `AIPA_AITCF` scores CI pass rate 5.36/7, so CI signal
  *is* read — coverage artefacts would be a genuine, earnable uplift.
- **Pull requests — 0 of 20 on all 8.** Solo development; the originals have 0 too. Not a
  regression, just 20 points nobody is scoring.
- **Documentation volume.** Dropping `docs/selling/` and `docs/oracle/` removed real
  documentation along with the PII it carried. Some of that is recoverable by *scrubbing*
  `docs/oracle/` instead of dropping it — but it holds CRM ids and addresses, so it is
  a deliberate trade, not an oversight.

## Caveat on the comparison

The $89,481 is a **31 Aug** figure for the **originals**, quoted from the listing. It was
not re-run today, so part of the 44% → 23% delta may be estimator differences rather than
our scrubbing. A like-for-like re-estimate of the originals would settle it — but it means
re-archiving unscrubbed repos on DataVendor's servers, which cuts against having asked
them to purge the prior upload. Not done for that reason.
