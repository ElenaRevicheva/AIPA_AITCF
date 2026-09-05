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

Under the comment, Aryaman wrote: *"DM me the details of what you have built and
I'll take a closer look."* Gate cleared. The DM is now the artefact.

**Arc:** close the EspaLuz bug he already read → pivot to the system that maps to
the exact process he described hiring for → hand him one page. He said twice he
does not want a list, so the DM names no tools at all.

## Mapping to what he actually asked for

He wrote a precise spec. The page answers it in this order:

| His requirement | Where it is answered |
|---|---|
| "a business process that currently runs on people and spreadsheets" | **§01** — the process was her plus a Telegram message |
| "a correct map of how the work really happens, not how the SOP says it happens" | **§01** — the alert was correct every Monday and never actioned; the real cost was the two-hour last step |
| "reason about failure states, retries, and what the system does when an upstream tool goes down at 2 AM" | **§06** — four named failure modes: supply cancelled, mid-chain stale data, per-failure-mode retries, partial blackout |
| "instruments what they build, so we can tell whether it is working without asking a human" | **§08** daily drill (silent on pass) + **§04** counted rejections + **§07** the unflattering 8% |
| "built something that ran unattended… someone actually depended on" | EspaLuz (real subscribers) and the chain (nobody starts it) |

## The supporting artifact

**The Monday Chain** — https://claude.ai/code/artifact/780d2d14-b601-44f1-b26b-606b9b61265d

Its spine is the whitespace thesis, because that is the non-obvious part: **the
score is not how big the market is, it is how much room is left in it.** Real
figures from the 31 Aug snapshot — 17% angle saturation scores **73**, 100%
scores **0**.

**Everything on it was verified from the live host on 5 Sep 2026 before publishing:**

| Claim on the page | Verified by |
|---|---|
| Five chained Monday jobs, 08:00–11:00 Panama | Oracle `crontab -l` — five `* * 1` entries |
| EspaLuz fault **reproduced**, not inferred: `sp.mp3` 24000 · `pa.mp3` 44100 · `mixed.mp3` → `Header missing` + `Invalid data found` | Cursor's Oracle `ffprobe` run over the 4 Sep files still in `/tmp` (NOW.md, run `33965958007`) |
| §01: brief-not-campaign, 96 prospects at ~1% reply | `scripts/atlas-lead-machine.cjs` header, the "Why (Aug 1 2026)" block |
| Saturation → score table (10 lanes) | `whitespace/data/brief.json`, snapshot `2026-08-31` |
| `avoid` list — expat_language, 15 advertisers on urgency_scarcity | same file, `verticals[].avoid[]` |
| `basis` = observed / launch_proxy / saturation_only | same file, `move.basis` |
| absent_universe + wait_cost "BUILD NOW / 12pp" | `whitespace/data/intelligence.json` |
| Lane picked = highest score **with a reachable ICP** | `pickLane()` + `ICP_BY_LANE` (3 of 16 lanes) |
| Geo-pinned ICP queries (PTY / SJO / MDE / CUN / CTG) | `ICP_BY_LANE`, high-ticket set worked before the local tail |
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

Prospect names, emails and WhatsApp numbers are **redacted** from the log excerpt
on the page; no HubSpot record ids appear on it.

**The thin-sample caveat is on the page, deliberately.** Advertiser counts are 1–15,
so "saturation 50% (1 advertisers)" is a direction, not a statistic. Saying so is
what he is screening for; hiding it is what would get caught in an interview.

### The EspaLuz claim is verified, not assumed

- Three commits, 4 Sep: `677d322` (MP3 wearing a `.ogg` filename) → `77576d1`
  (double extension) → `9029b1f` (silence at 44.1 kHz against gTTS's 24 kHz).
- ⚠️ Oracle's `EspaLuzWhatsApp` **git checkout is behind** at `24e5c15` — it deploys
  by named-file `scp`, so the checkout lags by design. Do not "fix" it.
- The fix **is** on the running box: `espaluz_bridge.py:1514` reads
  `anullsrc=r=24000:cl=mono`.
- The deploy took: file mtime `10:48:22`, service `ActiveEnterTimestamp 10:49:22` —
  the process is newer than the file.
- It produced **output**: seven `reply_audio_*.ogg` fetches returning 200 between
  10:53 and 20:22 on 4 Sep, and **zero** `Header missing` / `Invalid data found`
  decoder errors since the restart.

## The DM — send as plain text

LinkedIn does not render Markdown, so there are no asterisks below. Send as-is.

```
Thanks for reading the comment. Two things: closing that bug, then the system I
would actually want you to judge.

ESPALUZ — CLOSED YESTERDAY.

Three defects stacked in one send path. The audio was an MP3 wearing a .ogg
filename; the filename then carried two extensions; and underneath both, the real
one — the reply is assembled by joining speech segments to generated silence, and
the silence was being produced at 44.1 kHz against the speech's 24 kHz. An MP3
whose sample rate changes mid-stream is malformed.

What isolated it was not a log line, it was a comparison. Translate mode played;
tutor mode could not be opened at all — same bot, same send path, same carrier
account. So the fault had to be in what the two modes produce, not in how they are
delivered. That turned a month of looking into thirty seconds of fixing.

I did not want to close it on the absence of an error, so I reproduced it from the
actual files: the speech segment probes at 24000 Hz, the silence at 44100, and the
joined file fails to decode outright — Header missing, Invalid data found when
processing input. That is the fault the tolerant tool downstream had been quietly
repairing for a month. Deployed yesterday; the fixed path has produced audio
repeatedly since with no decoder complaint.

THE ONE THAT MATCHES YOUR POST.

You described taking a process that runs on people and spreadsheets and building
something that survives production. I have one of those, and the honest half is
that my first version failed in exactly the way you would expect.

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

It is now five chained cron jobs and nobody starts it. I wrote it up rather than
list it — how it decides which market is opening (a lane at 17 percent angle
saturation scores 73; at 100 percent it scores 0), how it goes and finds the
businesses inside that market, the gate that rejects most candidates with a
counted reason, why retries are written per failure mode instead of wrapped around
everything, and what it did the week a paid vendor was cancelled mid-quarter.
There is one number on it that is not flattering, which is the point — you asked
for instrumentation, not a portfolio.

https://claude.ai/code/artifact/780d2d14-b601-44f1-b26b-606b9b61265d

Panama, UTC-5, remote, available now. I have also applied through Torre.
```

### If LinkedIn makes her connect first (300-character note)

```
You asked me to DM — I cannot yet, so briefly: the EspaLuz voice bug from my
comment closed yesterday (silence generated at 44.1 kHz against 24 kHz speech).
Happy to send the full version plus a write-up of the unattended weekly lead
chain I run. — Elena
```

## Why this shape

He said twice he does not want a list of tools, so the DM names none. He said the
job is a process that runs on people and spreadsheets — so the pivot is not "here
is my impressive system", it is "here is that exact process, and here is how my
first attempt at it failed". Admitting the first version earned nothing for months
is the strongest move available: it is the SOP-versus-reality skill he put first
in his post, demonstrated on herself rather than asserted.

The unflattering number (8% citation rate) stays in for the same reason. He is
screening for people who instrument their own work; a page of only good numbers
reads as a portfolio, which is the category he rejected by name.

## Checklist

- [x] Comment on the LinkedIn post (STEP 1) — done, he replied
- [ ] **Send the DM (STEP 3)** — plain text above, artifact link included
- [ ] Apply on Torre with the note and $4,500–6,000/month (STEP 2)
- [ ] Attach `29.08.26_EN_Resume_Elena Revicheva.pdf` on Torre
- [ ] Tell the agent "sent LanceMart DM" so the deal stage moves and VJH learns it
