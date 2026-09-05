# LanceMart AI — AI Automation Specialist

**Found by** VJH 3 Sep 13:21 · score 77 · HubSpot deal `64602167197`
**Posting** <https://torre.ai/post/ZW2OY6Xw> · **Closes in ~8 days** (as of 4 Sep)
**Hiring manager** Aryaman Upmanyu, Founder & CEO, LanceMart AI — posts on LinkedIn
**Terms** Full-time · Employment · **Remote (anywhere)** · state expected compensation when applying

---

## Why this one is worth real effort

Read what he actually wrote, because it is unusually specific and it is a near
mirror of Elena's evidence:

> "It is not prompt engineering. It is not building demos. It is not finding tools."
> "Someone who can write clean automation logic and reason about failure states,
> retries, and what the system does when an upstream tool goes down at 2 AM."
> "Someone who instruments what they build, so we can tell whether it is working
> without asking a human."
> "I will take someone with two years of real operations automation over someone
> with five years of AI job titles and no shipped system."

Remote anywhere removes the residency problem that kills most of her matches. He
reads applications himself, so there is no ATS keyword filter to beat.

## ⚠️ Do NOT send the letter VJH drafted

VJH's note on this deal contains the same three-paragraph letter it produced for
MainTech and Plain Concepts with the company name swapped. It is a list of
accomplishments — which is precisely the thing this posting rejects by name:
*"What I do not need. A list of tools you have opened."* Sending it would fail on
the one criterion the hiring manager stated twice.

---

## STEP 1 — the LinkedIn comment (this is the real gate)

His instruction: *"comment below with one line about a system you built that ran
without you. Not what you used. What it did, and what broke."*

He is not asking for a highlight. He is asking whether you can describe a failure
precisely. Answer the question he asked.

**Post this as a comment on his LinkedIn hiring post:**

```
A bilingual WhatsApp tutor I built for expat families — daily lessons and voice
replies, running unattended on one VPS for real subscribers.

What broke: for about a month the voice replies in one mode were unopenable, and
every check said healthy. The reply audio was assembled by splicing 24 kHz speech
with 44.1 kHz silence, which makes a malformed stream — but ffmpeg silently
repaired the timestamps on the way through, so the file decoded clean, the
container validated, and the carrier reported delivered with a null error code.
The only signal that ever disagreed was a human pressing play.

The fix was thirty seconds. Finding it took a month because the tolerant tool in
the middle had erased the evidence — I was inspecting the repair, not the fault.
Now the pieces are generated at one sample rate and the pipeline runs at a
verbosity where the decoder's complaint is visible.
```

**Why this wins:** it is the exact shape he asked for (what it did / what broke),
it is a real unattended system with real dependants, and its lesson is *his own
stated criterion* — instrumentation that tells you whether the thing works without
asking a human. He will recognise that immediately.

If a shorter comment feels better for the format, cut to the first two paragraphs.
Keep the sample rates and the null error code — the specifics are the credential.

## STEP 1b — reply to your own comment with the receipts

Post this as a REPLY to your own comment, not as a second top-level comment. A
reply reads as "here is the evidence for what I just said"; a second comment on
the same post reads as trying twice.

```
I write these up publicly as I hit them — aideazz.xyz/ai-ops-wiki.html
20 incidents, 18 named failure modes, each with the log line that proved it.

Three of them are your bullet points almost word for word:

Resilience is opt-in. A fallback chain protects only the calls that route
through it. Mine has five providers; one hand-rolled call bypassed the chain and
sat on a dead vendor for two weeks while everything else failed over cleanly.
That is your 2 AM upstream outage — and the chain did not save me from it,
because the call never entered it.

Acknowledgement is not completion. A receipt proves delivery, never processing.
200 OK, and the thing never happened.

Liveness is not correctness. A dead job announces itself. A job that runs
perfectly and emits slightly wrong output never will.

It is not a portfolio. It is the list of ways I have been wrong in production,
with dates.
```

**Why this lands:** he asked for someone who "instruments what they build, so we
can tell whether it is working without asking a human", and who can "reason about
failure states, retries, and what the system does when an upstream tool goes down
at 2 AM". Those two sentences are the wiki's subject matter. Most candidates will
assert they think this way; this is dated, public evidence that she does --
four months of it, 10 May to 4 September 2026.

The last line matters most. Everyone applying will send a portfolio of successes.
A public catalogue of your own production failures, with the log lines, is a
different category of claim — and it is the one he said he was screening for.

**Verified before posting:** 20 incident files, 18 concept files, and all three
one-liners quoted above are the exact text published on the site.

## STEP 2 — the Torre application

Torre asks for expected compensation. **Do not leave it blank.**

- Floor is **$3,500/month**. For a full-time employment contract, remote-anywhere,
  ask **$4,500–6,000/month** and say the range is flexible for the right team.
- India-based company (`#IndiaAI` on the post), so budgets may sit lower than US
  rates — the range above is deliberately not a US ask.

Cover note for the Torre form — short, and pointing at the comment:

```
I commented on your LinkedIn post with the system and its failure, since that
seemed the more useful answer than a list.

Short version: I run ten AI agents unattended on a single VPS — WhatsApp and
Telegram bots, CRM pipelines, outreach automation — with health checks, automatic
recovery, and five-provider LLM fallback so a vendor outage is not an outage.
The interesting part is not that they run; it is what I learned the month one of
them was broken and every check still said healthy.

I write up the incidents publicly at aideazz.xyz/ai-ops-wiki.html.

Expected compensation: $4,500–6,000/month, flexible.
```

The wiki link is the differentiator — it is public, dated evidence of exactly the
instrumentation discipline he is screening for, and almost nobody applying will
have one.

## Checklist

- [ ] Comment on the LinkedIn post (STEP 1) — this is the one he reads
- [ ] Apply on Torre with the note and the compensation range (STEP 2)
- [ ] Attach `29.08.26_EN_Resume_Elena Revicheva.pdf`
- [ ] Tell the agent "applied LanceMart" so the deal stage moves and VJH learns it

---

# STEP 3 — he replied. The DM. (5 Sep 2026)

## ⚠️ The mistake in the first draft of this DM, and why it mattered

The first version opened by retelling the EspaLuz bug and announcing "closed
yesterday" as if it were news.

**He had already read that.** It is her comment — the one he replied to. And the
comment already says it is fixed: *"Now the pieces are generated at one sample
rate and the pipeline runs at a verbosity where the decoder's complaint is
visible."* Past tense, already done.

So his reply — *"DM me the details of what you have built"* — is not "tell me more
about that bug". It is **"that one was good; what else is there."** He is asking
for the body of work. Spending the first third of the DM re-selling the thing he
already bought wastes the only attention she gets.

**Read the chain as a whole:** his post asks for one shipped unattended system →
her comment gives one → he asks what else. The DM answers *what else*, and only
adds to EspaLuz the single fact that was **not** in the comment: it was three
defects stacked, and it was closed by reproducing the fault, not inferring it.

## What he is actually screening for

| His requirement | What answers it |
|---|---|
| "a business process that currently runs on people and spreadsheets" | The Monday chain — the process was her plus a Telegram message |
| "a correct map of how the work really happens, not how the SOP says it happens" | The alert was correct every Monday and never actioned; the real cost was the two-hour last step |
| "failure states, retries, upstream tool down at 2 AM" | Four named failure modes in the artifact, §06 |
| "instruments what they build… without asking a human" | Daily drill silent on pass; counted rejections; the unflattering 8% |
| "built something that ran unattended… someone actually depended on" | EspaLuz (paying subscribers) + the inventory below |
| ❌ "a list of tools you have opened" | **No tool is named anywhere in the DM.** The inventory is systems and what each one decides |

## The verified fleet (checked on the box, 5 Sep 2026)

**15 application processes on one VPS** — 8 under pm2, 7 under systemd:

```
pm2       cto-aipa · whitespace · serpapi-jobs · n8n · algom-poll ·
          algom-stream · dragontrade-main · dragontrade-dashboard
systemd   espaluz-whatsapp · espaluz-familybot · espaluz-influencer ·
          espaluz-payments-webhook · vibejobhunter · vibejobhunter-web ·
          aw-portal
```

The DM names only the ones that mean something to **him** — an operator who
automates D2C/B2C businesses and runs an AI EdTech company. Dragontrade, algom and
n8n are left out on purpose: they are real, but they dilute.

## The supporting artifact

**The Monday Chain** — https://claude.ai/code/artifact/780d2d14-b601-44f1-b26b-606b9b61265d

Division of labour: **the DM carries breadth, the artifact carries depth.** One
system, taken all the way down — which is the shape his post asked for.

Its spine is the whitespace thesis: **the score is not how big the market is, it is
how much room is left in it.** 17% angle saturation scores **73**; 100% scores
**0**.

**Everything on it was verified from the live host on 5 Sep 2026 before publishing:**

| Claim on the page | Verified by |
|---|---|
| Five chained Monday jobs, 08:00–11:00 Panama | Oracle `crontab -l` — five `* * 1` entries |
| EspaLuz fault **reproduced**: `sp.mp3` 24000 · `pa.mp3` 44100 · `mixed.mp3` → `Header missing` + `Invalid data found` | Cursor's Oracle `ffprobe` run over the 4 Sep files still in `/tmp` (NOW.md, run `33965958007`) |
| §01: brief-not-campaign, 96 prospects at ~1% reply | `scripts/atlas-lead-machine.cjs` header, "Why (Aug 1 2026)" block |
| Saturation → score table (10 lanes) | `whitespace/data/brief.json`, snapshot `2026-08-31` |
| `avoid` list — expat_language, 15 advertisers on urgency_scarcity | same file, `verticals[].avoid[]` |
| `basis` = observed / launch_proxy / saturation_only | same file, `move.basis` |
| absent_universe + wait_cost "BUILD NOW / 12pp" | `whitespace/data/intelligence.json` |
| Lane picked = highest score **with a reachable ICP** | `pickLane()` + `ICP_BY_LANE` (3 of 16 lanes) |
| Geo-pinned ICP queries (PTY / SJO / MDE / CUN / CTG) | `ICP_BY_LANE`, high-ticket set before the local tail |
| Window threshold 60, dedup on lane+snapshot_date | `scripts/atlas-campaign-alert.cjs` |
| Outcomes → lane scores, 7 lanes | `atlas-outcomes.log`: `pushed to Atlas: {"ok":true,"lanes":7}` |
| staged 8 · looked at 20 · no-email 10 · already-in-CRM 4 · outside-band 1 | `atlas-lead-machine.log`, last run |
| dedup ledger 432 companies / 151 domains | same log (growing: 408 → 417 → 432) |
| Retry only on 429, 1.5s × attempt, ≤6; 404 → null | `hs()` in `atlas-lead-machine.cjs` |
| Supply probed for **balance**, not key existence, once per run | `serpHasQuota()` — free `serpapi.com/account` endpoint |
| Fail-fast on a mid-chain failure | `whitespace/scripts/atlas-capture-cron.sh` guard |
| Blackout guard: 0/0 ≠ 0% | `src/citation-tracker.ts:607-618`; live `HTTP 429` in `citation-probe.log` |
| Citation probe: 4 engines, 2/24 cited (8%), 13% named-no-link | `citation-probe.log` summary line |
| API live, v1.2.0, typed `unfetchable_url` error | probed live: `/v1/health` + a real `POST /v1/visibility` |
| 51 CLIENT-ATLAS deals · 2,266 deals · 1,203 contacts | HubSpot deals/contacts search API |
| Daily drill PASS, 4 checks, 3557 ms | `concierge-selftest.log`, ran 5 Sep 12:45 UTC |
| VJH outcomes → judge prompt, hourly | Oracle crontab `judge_feedback_sync.py`, `17 * * * *` |
| 15 app processes on one VPS | `pm2 jlist` (8) + `systemctl --state=running` (7) |

Prospect names, emails and WhatsApp numbers are **redacted** from the log excerpt
on the page; no HubSpot record ids appear on it.

**The thin-sample caveat is on the page deliberately.** Advertiser counts are 1–15,
so "saturation 50% (1 advertisers)" is a direction, not a statistic. Saying so is
what he is screening for; hiding it is what gets caught in an interview.

### EspaLuz — verified live, not assumed

- Three commits, 4 Sep: `677d322` (MP3 wearing a `.ogg` filename) → `77576d1`
  (double extension) → `9029b1f` (silence at 44.1 kHz against gTTS's 24 kHz).
- ⚠️ Oracle's `EspaLuzWhatsApp` **git checkout is behind** at `24e5c15` — it deploys
  by named-file `scp`, so the checkout lags by design. Do not "fix" it.
- The fix **is** on the running box: `espaluz_bridge.py:1514` reads
  `anullsrc=r=24000:cl=mono`.
- Deploy took: file mtime `10:48:22`, service `ActiveEnterTimestamp 10:49:22`.
- It produced **output**: seven `reply_audio_*.ogg` fetches returning 200 between
  10:53 and 20:22 on 4 Sep, and **zero** decoder errors since the restart.

## The DM — send as plain text

LinkedIn does not render Markdown, so there are no asterisks below. Send as-is.

```
Thank you. I will not retell the tutor bug since you have read it — only the part
that was not in the comment: it was three defects stacked in the same send path,
and I closed it yesterday by reproducing the fault rather than inferring it. The
speech segment probes at 24000 Hz, the silence at 44100, and the joined file
refuses to decode at all. That is the fault the tolerant tool downstream had been
quietly repairing for a month.

Here is the rest.

WHAT RUNS UNATTENDED

Fifteen processes on one VPS, nobody starting any of them.

The tutor you read about — bilingual, on WhatsApp and Telegram, with its own
payments webhook and subscription state. Paying families depend on it daily.

A job-discovery pipeline that pulls from several sources, scores every posting
with an LLM judge, writes the survivors into a CRM, and feeds the real outcomes
back into the judge's prompt every hour so it learns what I actually accept. It is
also where I learned the most expensive lesson on this list: a source logged a
healthy count every hour for a full day and delivered zero. Now I grep the result
line, never the ran line.

A market radar that reads what competitors are advertising across sixteen lanes
each week and computes how crowded each persuasion angle is.

A lead pipeline that turns that reading into qualified CRM records with drafted
outreach, and refuses to create a record it could not qualify.

An audit API, publicly documented, that scores a site's readiness to be cited by
AI search. It is both a product and the qualification gate inside the lead
pipeline — the same engine scores prospects and scores my own pages.

THE ONE I WOULD WANT YOU TO JUDGE

You described taking a process that runs on people and spreadsheets and building
something that survives production. The last two on that list are one chain, and
the honest half is that my first version failed exactly the way you would expect.

The weekly market read worked. Every Monday it found which service market was
opening rather than saturated, wrote the angle, and messaged me: adapt this into a
campaign. It fired every week, was never down, and the log was green. It earned
nothing for months — because "adapt this into a campaign" is two hours, and I did
not have two hours on a Monday. The SOP said the operator acts on the alert. The
real map was that the alert was always correct and never actioned.

Making the alert louder would not have fixed it. So the system stopped handing me
a brief and started handing me the finished work: eight named businesses, each
independently qualified, each with a drafted email and a send button. My step went
from two hours to one tap.

It is now five chained cron jobs. I wrote it up properly rather than list it — how
it decides which market is opening (a lane at 17 percent angle saturation scores
73; at 100 percent it scores 0), how it goes and finds the businesses inside that
market, the gate that rejects most candidates with a counted reason, why retries
are written per failure mode instead of wrapped around everything, and what it did
the week a paid vendor was cancelled mid-quarter. There is one number on it that
is not flattering, which is the point — you asked for instrumentation, not a
portfolio.

https://claude.ai/code/artifact/780d2d14-b601-44f1-b26b-606b9b61265d

Panama, UTC-5, remote, available now. I have also applied through Torre.
```

### If LinkedIn makes her connect first (300-character note)

```
You asked me to DM about the tutor bug — happy to. Short version of the rest:
fifteen unattended processes on one VPS, and one weekly chain that replaced a
process which used to run on me and a Telegram message. Full write-up ready
whenever you want it. — Elena
```

## Why this shape

He rejected "a list of tools you have opened" — so no tool is named. What he asked
for is "the details of what you have built", and that is a list of **systems and
what each one decides**, which is a different object entirely. Two of the five
inventory lines carry a failure rather than a feature, so it cannot read as a brag
sheet.

The pivot is deliberately self-critical. Admitting the first version earned nothing
for months is the strongest move available: SOP-versus-reality is the skill he put
**first** in his post, and this demonstrates it on herself instead of asserting it.

The unflattering number (8% citation rate) stays for the same reason. He is
screening for people who instrument their own work; a page of only good numbers
reads as a portfolio, which is the category he rejected by name.

## Checklist

- [x] Comment on the LinkedIn post (STEP 1) — done, he replied
- [ ] **Send the DM (STEP 3)** — plain text above, artifact link included
- [ ] Apply on Torre with the note and $4,500–6,000/month (STEP 2)
- [ ] Attach `29.08.26_EN_Resume_Elena Revicheva.pdf` on Torre
- [ ] Tell the agent "sent LanceMart DM" so the deal stage moves and VJH learns it
