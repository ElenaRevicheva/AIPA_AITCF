# Firecrawl — Legal Operations Manager — application answers (1 Oct 2026)

Apply: https://jobs.ashbyhq.com/firecrawl/b1db13d1-402c-40e9-95fa-4ac67bacb078/application
HubSpot deal: 65557225024 · found via X post @v_garg_s (30 Sep)

Every fact below is from this repo, NOW.md or the verified CV. Nothing is invented.
`[ELENA: …]` marks the one place only Elena can fill: a real E-GOV-era story.

## Form fields

| Field | Answer |
|---|---|
| LinkedIn | https://linkedin.com/in/elenarevicheva |
| GitHub | https://github.com/ElenaRevicheva |
| Bay Area or willing to move? | **No** — honest. The posting's own location field reads "Remote (Americas, UTC-3 to UTC-10)"; Panama is UTC-5. |
| Resume | Tailored CV attached to the 🛡️ note on the deal |

## Note — "why this excites you + a process you built or fixed"

I was Deputy CEO and Chief Legal Officer of a state e-government operator for seven years, running IT, legal and
compliance in a heavily regulated environment. Since 2025 I have built and run my own AI lab's operations with AI
agents doing most of the execution. Legal ops at Firecrawl is where those two halves meet.

A system I fixed this September: I listed eight private codebases for licence on an AI-lab data marketplace, and the
terms promised no customer personal data. My own scanner said "clean". It was wrong: pattern bugs hid
environment-variable names and exempted whole matches instead of values, and it never opened binary files — so 17
résumé files were invisible to every check I owned. I rebuilt the gate to read what the buyer's
scanner reads, cleaned every commit in history, and the listing went live with all 18 mandatory checks passing.
The lesson I now apply everywhere: a format your checker cannot open is not clean, it is unmeasured.

## Q1 — A legal operations process you built or improved from scratch

The data-licence compliance pipeline above is the most recent. Before it, there was no process: eight repositories,
a promise in the licence terms, and no way to prove it was kept.

What I built: a pre-commit gate that blocks a commit containing credentials or personal data; a build step that
produces the licensed copy from a filtered tree; and a verification pass that reads the same surface the buyer reads,
including file names and commit messages, not only file contents. It found a real leak my old checks missed — a
national ID number inside a code comment warning that the number must never ship.

What changed: the marketplace's own vendor manager confirmed in writing what does and does not block a listing, I
stopped cleaning things that were never the problem, and the listing published at $74,851 within the platform's own
valuation band.

[ELENA: add 2–3 lines from E-GOV Operator — a contracting, approval or vendor workflow you set up there, what was
broken, what changed. A CLO-era example is the strongest answer to this question.]

## Q2 — How you use AI in legal or contracting work: where it helps most, and least

I run large volumes of AI output every day, and the rule I work by is that the model drafts and the system checks.

Where it helps most: first-pass work at volume — reading postings, drafting letters and replies to inbound
leads, summarising a counterparty before a call. AI output goes through a gate before anyone sees it: my publisher
refuses to print any number it cannot trace back to a source record, and if the model keeps decorating, it falls back
to an article assembled only from the measured facts.

Where it helps least: anything irreversible or confidential. My outbound email is drafted by AI and sent only after a
human confirms it, and the sender refuses the whole send if a promised attachment fails to load — so no letter ever claims
a document it does not carry. I also learned that an AI checker can fail silently: a marketplace's AI privacy scan
returned "score 0" on my repositories, and its own record showed the scan had crashed — "the verdict carries no
evidence". I treat an AI verdict without evidence as no verdict.

## Q3 — Managing outside counsel or a vendor with limited legal-ops infrastructure

The marketplace relationship above: a vendor agreement signed, eight assets listed, and a quality-check tool that kept
failing with no detail on why.

Scope: I asked one question per email and made each answer decide an action — "does a failing repository block only
itself, or the whole listing?" The vendor manager's written answer, then the live listing, showed that two days of fixes had been
unnecessary.
Communication: every claim I made, they could verify in their own panel in seconds; I reported a defect in their tool
with the evidence, not a complaint. Budget: I priced the listing against their own estimator, and I declined to
flatten the codebases' history to pass a check, because an earlier test showed it cut the valuation to about a third.

What I would do differently: ask first which checks are mandatory before fixing any of them.

[ELENA: optional — one line on managing outside counsel at E-GOV Operator, if you have a real example.]

## Q4 — Why Firecrawl matters to you

I have been on both sides of the trade Firecrawl sits in. My own products read the web — an AI-visibility audit that
scores how quotable a website is to ChatGPT, Perplexity and Claude — and in September I stood on the other side,
listing my own code as licensed AI training data. Both times, the hard part was not the technology. It was the rules around the
data: what may be collected, what must be removed, what a licence actually promises, and how to prove it.

A company turning the web into AI data at your speed will meet those questions daily, and it needs someone who builds
the machinery that answers them fast. I would like that to be me — remotely from Panama (UTC-5), as an employee or
contractor.
