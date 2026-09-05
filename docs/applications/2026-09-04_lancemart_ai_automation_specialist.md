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

## STEP 3 — the LinkedIn DM (5 Sep — he asked)

He replied to Elena's comment: *"DM me the details of what you have built and I’ll take a closer look."*

This is not a second comment. It is the answer to that ask. Do not resend the comment. Give the missing operating detail and one place he can verify.

**Paste this into LinkedIn → Aryaman Upmanyu → Message:**

Verified 5 Sep 12:24 UTC on the live VPS (Actions `33965958007`). `espaluz-whatsapp` active since 4 Sep 10:49:22 UTC, `NRestarts=0`. The 4 Sep repro files were still in `/tmp`. Do not invent a stack list around this.

```
Hi Aryaman — you asked for the details. I went back to the machine.

EspaLuz, WhatsApp tutor. systemd unit espaluz-whatsapp is active on the VPS, last restart 4 Sep 10:49 UTC, zero restarts since. Tutor-mode voice notes were unopenable for about a month. Translate mode on the same bot, same account, played.

The 4 Sep repro files are still on disk. I re-ran ffprobe on them today:

speech  /tmp/sp.mp3   → sample_rate=24000
silence /tmp/pa.mp3   → sample_rate=44100
splice  /tmp/mixed.mp3 → ffmpeg reports 24000 (first header), then:

[mp3float] Header missing
Error submitting packet to decoder: Invalid data found when processing input

After the fix the matching pair is both 24000 (/tmp/a_sp.mp3, /tmp/a_pa.mp3) and the join decodes clean. Live code now generates silence with anullsrc=r=24000 and concatenates through ffmpeg -ar 24000 -ac 1 -c:a libmp3lame -b:a 64k.

The carrier had already said delivered. The decoder was the only place the fault was still visible.

https://aideazz.xyz/ai-ops-wiki.html (the-repair-that-hid-the-fault)

Happy to walk the two files if you want to look closer.

Elena
Panama
```

Do not add a tool list. Do not attach the resume in the first DM. Do not put compensation here — that belongs on Torre if he takes it further.

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

- [x] Comment on the LinkedIn post (STEP 1) — posted; Aryaman replied 5 Sep and asked for a DM
- [ ] Paste the STEP 3 DM to Aryaman on LinkedIn
- [ ] Apply on Torre with the note and the compensation range (STEP 2)
- [ ] Attach `29.08.26_EN_Resume_Elena Revicheva.pdf`
- [ ] Tell the agent "applied LanceMart" so the deal stage moves and VJH learns it
