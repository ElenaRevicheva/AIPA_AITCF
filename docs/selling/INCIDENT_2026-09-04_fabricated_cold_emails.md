# Cold emails sent to placeholder addresses, with invented technical claims

**Found** 4 Sep 2026, from a bounce-back: Cursor's support desk auto-replied to a
pitch addressed to "RongleCat".
**Status** ⚠️ **STILL ARMED** — the sender runs daily and will send again.

---

## What the recipient got

Sent from `aipa@aideazz.xyz` to `hi@cursor.com`, addressed "Hi RongleCat":

> "I noticed your Grok bot often hits latency spikes when Anthropic or Groq
> endpoints throttle, and the fallback to Grok sometimes spikes cost."
> "…orchestrates deployment across the ten repos you manage."

**We do not know any of that.** We have never seen their latency, their costs, or
counted their repos. Both sentences are inventions presented as first-hand
observation, sent under Elena's name to a company she may one day want to work with.

Cursor's assistant filed it as a marketing request and closed it (ticket T-F47628).

---

## The database row

```
name        RongleCat @ RongleCat
company     RongleCat
email       hi@cursor.com
source      github
pain_point  [object Object]
status      emailed
```

`pain_point` is the literal string `[object Object]` — a JavaScript object coerced
to text. So the email generator was handed nothing at all, and invented the entire
story to satisfy its instructions.

## The causal chain

**1. `fresh-leads-ingest.ts:253` — an email in a README is assumed to be the owner's.**

```js
const readme = await readmeRes.text();
const email = extractEmail(readme);
if (!email) continue; // only include if there's a real contact email
```

The comment states the false belief exactly. The first email-shaped string in a
README is very often not a contact address at all. Actual addresses this shipped to:

| Address | What it really is |
|---|---|
| `you@yourdomain.com` | a template placeholder — **emailed** |
| `admin@openwork.local` | `.local`, not routable |
| `demo@aisoc.dev` | a demo address |
| `api@aviary.com` | an API-docs example |
| `support@composio.dev` | a support desk |
| `calvin.wong@polyu.edu.hk` | a university researcher, likely a cited author |
| `hi@cursor.com` | a company contact mentioned in passing |

**2. Identity is a GitHub username, twice.** `name: '${repo.owner.login} @ ${company}'`
where `company` is also `repo.owner.login` — hence "RongleCat @ RongleCat", greeted
as "Hi RongleCat".

**3. `prospect-ingest.ts:146` — the model is asked to speculate.**

> "For each company below, determine: 1. Their likely pain point (1 sentence)"

Given only a name and a one-liner. There is no data behind the answer, and none is
expected — the word is *likely*.

**4. `outreach.ts:312` — the speculation is then ordered to be specific.**

```
Their likely pain point: ${target.painPoint || 'general operations/automation'}
...
6. Reference something specific about their company or industry
```

**This is the defect.** "Likely" appears in the prompt and nowhere in the output
contract. A model handed a guess — or, here, `[object Object]` — and instructed to
be *specific* will manufacture specifics. Nothing anywhere says *do not assert facts
about their systems you cannot know*. The model did exactly as told.

**5. `cto-aipa.ts:3034` — it sends by itself.**

```js
const outreachCronExpr = process.env.OUTREACH_CRON || '0 15 * * *';
console.log(`📧 Outreach cron: … — auto generate + send`);
```

`OUTREACH_CRON` is not set, so it defaults to **15:00 America/Panama, daily**, capped
at `OUTREACH_DAILY_CAP || 10` per run.

## Scope, from the database

| | |
|---|---|
| emailed, all sources | **188** |
| emailed, `source=github` | **45** |
| github targets rejected as invalid | 13 |
| addresses guessed by pattern (`founder@`, `info@`, `hi@`) | 37 |
| **queued in `new`, will send at 10/day** | **297** |

## What to do

**Now — stop the sending.** Set `OUTREACH_CRON` to a disabled expression and restart,
or set `OUTREACH_DAILY_CAP=0`. This is one line and it is reversible; nothing else
should be decided under time pressure.

**Then, before re-arming — three fixes, in order of how much harm each prevents:**

1. **Never assert what we have not observed.** Add to the email prompt: *"State only
   what is given. Do not describe their systems, traffic, costs, tooling or team
   size. If the pain point is empty or unusable, write a general email."* And refuse
   to draft at all when `painPoint` is falsy or matches `[object Object]` — a missing
   input should stop the pipeline, not license invention.
2. **A README email is not a contact.** Reject placeholder and role addresses
   (`you@`, `example`, `demo@`, `test@`, `.local`, `api@`, `support@`, `noreply@`),
   and prefer the GitHub profile's public email over anything scraped from prose.
3. **Fix the identity.** "RongleCat @ RongleCat" should never have passed a sanity
   check; if name equals company and both are a GitHub login, there is no person here.

**Consider:** a short, plain apology to Cursor. One or two sentences, no pitch. The
claim was specific and false, and they have it in writing.

## The rule

**A field named "likely" is a guess, and the moment it crosses into a template it
stops looking like one.** The label lived in the prompt; the output had no memory of
it. Any speculative field that reaches a customer-facing surface has to carry its
uncertainty with it, or be blocked when empty — because the model downstream cannot
tell the difference between a fact and a guess, and it was explicitly instructed to
sound specific.

Related: [[the-prompt-is-a-source]] — a brief full of unverified figures became
unverified figures in a published article, and the fix was the same: strip the
speculation before it reaches the model, rather than hoping the model discounts it.
