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
