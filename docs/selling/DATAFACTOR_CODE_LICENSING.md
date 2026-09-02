# DataFactor — code portfolio licensing (opened 2 Sep 2026)

**Status:** first contact via the site chat widget. `/code-repos` is behind an
"Enterprise Code Assessment" password gate ("Authorized organizations only —
contact your DataFactor account manager"), so the chat is the way in.

**Entry:** <https://datafactor.com/code-repos> · scoring flow `/score-code` ·
quote lands at `/offer` · **ignore `/data-partner`** (different SKU: connecting
Jira/Confluence/Bitbucket to sell company workflow data).

---

## Why this is a real buyer

Cursor's 31 Aug sweep filed DataFactor under "not this SKU". That was wrong, and
it is corrected in `docs/oracle/NOW.md`. Read from their own shipped JS bundle:

> Submit your repositories for a free quality assessment. If they meet our
> licensing criteria, DataFactor may offer to pay you for the right to license
> them to leading AI companies.

> A single strong repository can reach thousands of dollars.

> Each repository is evaluated individually, then rolled up into one **portfolio
> score** and a single payout estimate.

Portfolio scoring is exactly the 8-pack shape already packaged for HUD. In a
market where the whole sweep found only three buyers that quote (Lazarus,
Atrium/AfterQuery, HUD), this is a fourth.

Their stated criteria: **data volume, tool coverage, depth, structure, language,
recency.** Analysis is static and read-only — *"Your code is never run,
installed, or built, and scoring never uses it to train anything. Training
rights exist only if you accept."*

## ⚠️ The exclusivity trap — ask this FIRST

Their wording is:

> You keep ownership of your code unless otherwise agreed.

**Ownership is not exclusivity.** A licence can be exclusive while leaving
ownership entirely intact — the buyer does not own it, and nobody else may
license it either. "Unless otherwise agreed" defers the whole question to the
contract. Non-exclusivity is **unverified** until it is in writing, and an
exclusive clause with whoever signs first kills every parallel deal.

## The portfolio — Elena's decision, 2 Sep

Eight private repos. `aideazz-private-docs` **excluded** — her call.

| Repo | Language | What it is |
|---|---|---|
| `AIPA_AITCF` | JavaScript | agent fleet, CRM automation, Telegram ops |
| `VibeJobHunterAIPA_AIMCF` | Python | job pipeline, LLM judge, human-feedback loop |
| `EspaLuzFamilybot` | Python | bilingual family tutor bot |
| `EspaLuzWhatsApp` | Python | WhatsApp integration |
| `EspaLuz_Influencer` | Python | content / distribution agent |
| `dragontrade-agent` | JavaScript | trading agent |
| `AILA` | — | orchestration layer |
| `atlas-captures` | — | capture pipeline |

**Public repos are worth $0** to a licence buyer (HUD's estimator confirmed
this) — labs scraped them years ago. The 11 public ones are not part of any
offer. Only private repos carry licence value.

## Known before signing

- **Third-party personal data.** `AIPA_AITCF` carries 228 distinct third-party
  email addresses, `VibeJobHunterAIPA_AIMCF` 38 — working tree *and* full git
  history. Elena has decided to include both. Recorded here so the decision is
  deliberate and documented, not discovered later.
- **No live credentials are tracked.** Verified: the only secret-shaped tracked
  files are two `.env.example` templates and one script merely *named* for a
  secret. Nothing to rotate.
- **Two separate decisions.** Submitting the form grants no access — *"Submitting
  this form doesn't grant any access to your code."* Access happens later, at the
  GitHub-token step. Take them days apart.

## First message sent (chat widget)

> Hi — I'd like to submit a private repo portfolio for the free quality
> assessment, but /code-repos is asking for an access password and I don't have
> an account manager yet. How do I get access?
>
> Context so you can route me: I'm Elena Revicheva, founder of AIdeazz AI Lab.
> Eight private production repositories, all actively maintained (commits today),
> across Python and JavaScript — a multi-agent operations fleet, an LLM-judge job
> pipeline with a live human-feedback learning loop, bilingual WhatsApp/Telegram
> assistants, and a trading agent. Real systems running in production, not demos
> or tutorials.
>
> One thing I need answered early, since it decides whether I proceed: are your
> licences exclusive or non-exclusive? Your site says "you keep ownership unless
> otherwise agreed," which I read as being about ownership rather than
> exclusivity — I'm evaluating more than one buyer and won't sign anything that
> forecloses that.

## What the chat established (2 Sep 2026) — on record

Their support assistant, in writing:

- **No account manager or manual upload needed.** The `/code-repos` password gate
  is not the route in. Submit via **<https://datafactor.com/score>** — repo URL +
  email + read-only token; for private repos the page lists what the token can
  see and she picks which to score.
- **"A fine-grained, read-only token is the right approach."** They had initially
  suggested a *classic token with `repo` scope* — do NOT use that. GitHub's
  classic `repo` scope is read **and write** across **every** repository owned by
  the account, public and private, including the one she deliberately excluded.
  Fine-grained + Contents: Read-only + only the 8 selected repos is the correct
  grant, and they confirmed it works.
- **"The assessment is free and non-binding."**
- **Exclusivity: not answered in chat, escalated.** *"I do not have the licensing
  exclusivity terms in the chat briefing, so I have flagged your question for a
  teammate to reply here and by email in writing before any offer stage."*
  She asked twice in the widget and got token answers both times — not evasion,
  just routing, but it is why the question moved to email where a reply is
  quotable.

**Token hygiene for the submission:** name `datafactor-assessment`, expiry
**7 days**, resource owner = her own account, *Only select repositories* → the 8,
Permissions → **Contents: Read-only** (Metadata read-only self-enables and is
required). Paste it into their page, **never into the chat widget** — support
chats are logged and ticketed. **Revoke at github.com/settings/tokens the moment
scoring finishes**, without waiting for expiry.

**Free audit worth using:** the page lists the repositories the token can see.
That list is an independent check of whether the scope is right. If a 9th repo
appears — especially `aideazz-private-docs` — the token is wrong: stop, delete
it, recreate.

## 🔑 THEY STORE THE TOKEN — the reason the narrow scope mattered

From their own submission page, in the small print:

> **Token captured for follow-up** — When you leave the token field, we save it
> with this browser session and use it for read-only repository access **and sales
> follow-up.**

> Tokens ... **are saved when you leave this field** so our team can follow up
> without asking you to paste it again.

The token is **persisted**, not used-and-discarded. It stays live in their systems
until it expires or is revoked.

That is acceptable for a fine-grained, Contents:Read-only, 8-repo, 7-day token.
It would have been serious for the token they first recommended: *"set Repository
access to All repositories ... or a classic token with `repo` scope."* Following
that advice would have left DataFactor **storing a read-write credential to the
entire GitHub account** — every repo, including `aideazz-private-docs`, retained
for sales follow-up.

**Revoke at <https://github.com/settings/tokens> the moment the score arrives.**
Do not wait out the expiry. A new one takes two minutes to issue.

**Also ignore their "All repositories" instruction.** It is convenience advice so
their listing shows everything. A token scoped to the 8 lists exactly the 8 and
structurally cannot reach the excluded repo — narrower and correct, same outcome.

**One submission, not eight:** *"We'll list everything it can see right here to
pick from."* Paste one repo URL + email + token, then multi-select the portfolio.
Scoring is *"structural analysis plus a Claude judgment pass"*, ~1 minute.

## Questions for the scoping call, in order

1. **Exclusive or non-exclusive**, in writing.
2. **Payout mechanics** — one-off per portfolio, or per-repo, or royalty? Their
   copy says compensation depends on "volume, tool coverage, depth, structure,
   language, recency" with an estimate only *after* scoping.
3. **Retention and revocation** — once a model is trained, what can be withdrawn?
4. **Repos containing third-party personal data** — what is their process, and
   who is controller vs processor for it?
5. **Who are the "vetted frontier AI model developers"?** Unnamed on the site.

## Strategic frame — do not let this eat a week

Root cause note (`project_root_cause_no_demand_channel`) is blunt: 1,898 deals,
**0 Won ever**, because supply is world-class and there is no demand channel.
Selling codebases is *more supply*. This is a lottery ticket, not a channel.

**Worth one free assessment and one call.** Not worth a scrubbing project or a
repo reorganisation until a real number exists. If the number is small, that is a
fast cheap "no" and the thread closes.
