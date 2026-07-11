# FINAL — published to Dev.to July 11 2026 (this file is the source of record)

Title: How I Wired Claude Fable 5 Into Make.com to Answer My Portfolio Leads — 8 Days After Launch
Tags: ai, automation, nocode, claude

---

On July 3, Make.com added Anthropic's brand-new Claude Fable 5 — the first Mythos-class model — to its AI toolkit. I run a 10-agent AI ecosystem solo on a $0/month Oracle Cloud budget, so my rule for new AI features is simple: if it can't ship into production the same week, it's a demo, not a tool.

Here's the production build, 8 days after the announcement — verified end-to-end today, including the two bugs I hit on the way.

## The problem

My portfolio (https://aideazz.xyz/portfolio) collects inquiries through a form that flows into HubSpot via my CTO agent's inquiry proxy. But an inquiry is only as valuable as the speed and quality of the response — and I'm a solo founder in timezone UTC-5 with a child. Inquiries that arrive at 3am should not wait until morning for a thoughtful, personalized, correctly-linked reply draft.

## The build: 3 modules, 0 lines of code

```
HubSpot (watch new contacts, every 15 min)
   → Claude Fable 5 (Anthropic Claude app in Make, my API key)
      → Telegram (draft lands in my pocket for one-tap approval)
```

What Fable 5 specifically adds over the previous generation:

1. **1M-token context.** The system prompt carries my ENTIRE portfolio — all 10 agents, every proof link, my positioning — and could carry 100x more. The model picks the 2-3 most relevant links per inquirer instead of spraying everything at everyone. On my first real test — a fictional fintech founder from Panama City writing in Spanish — it chose my live WhatsApp agent as the lead proof link *because WhatsApp is the key fintech channel in Panama*. Nobody told it that. It reasoned it.
2. **Refusal behavior you can build on.** Fable 5 returns `stop_reason: "refusal"` on requests it won't handle, and my system prompt tells it to output `SPAM — no reply needed` for junk. On its very first run it correctly flagged a test-labeled submission as not worth answering — and when a bug fed it empty fields (more below), it refused to invent an inquirer rather than hallucinating one. An AI that says "there's nothing to answer here" is worth more than one that always answers.
3. **Human-in-the-loop by design.** The model drafts; I send. An AI that ghostwrites for you is an asset; an AI that speaks as you unsupervised is a liability.

## The two bugs, because honest case studies include them

**Bug 1: empty credits.** First live run died with `[400] Your credit balance is too low`. The Anthropic API is prepaid and separate from any chat subscription. Five dollars fixed it; at concierge volume that lasts months.

**Bug 2: the empty-fields trap.** My Claude prompt mapped HubSpot fields (`firstname`, `company`, `message`) that kept arriving blank — so Fable 5 kept (correctly) reporting "the inquiry came through empty." Instead of fighting Make's field-picker, I replaced five fragile field mappings with ONE chip: the module's raw `[bundle]` output, pasted into the prompt as full JSON, with an instruction to extract name/email/company/message itself. A 1M-context model doesn't need you to pre-chew its data. **Pass the raw record; let the model do the extraction.** That pattern is immune to the whole class of property-path bugs.

## The honest cost math

Fable 5 is Anthropic's most expensive model. That's exactly why this architecture works: it runs ONLY when a real human inquires — event-driven, not scheduled. My measured runs: 819 input / 559 output tokens on the spam-detection run, roughly the same on real drafts — a few cents per inquiry, statistically $0/month at portfolio-inquiry volume. Make's free plan covers the operations easily at ~3 ops per inquiry (though its 2-active-scenario cap eventually pushed me to the paid tier). My heavy scheduled workloads stay on cheaper/free-tier models — route the expensive intelligence to the moments with the highest stakes.

## Results, day one

- Scenario processing time (HubSpot → Fable 5 draft → Telegram): **under a minute**; the 15-minute polling schedule sets the worst-case wait
- First real-content draft: **zero edits needed** — correct language (Spanish), tailored proof links with stated reasoning, a scoped 2–3-week pilot proposal, a suggested subject line
- Spam correctly filtered: **1 of 1**
- Lines of code: **0** · Modules: **3** · Build time excluding my two bugs: **~15 minutes**

## The distribution layer: Tech SEO + AEO + GEO on the article itself

An automation case study that nobody finds is a diary entry. The same disciplines I build for clients apply to this post:

**Tech SEO** — my daily bilingual blog runs the canonical-on-own-domain pattern (posts live at aideazz.xyz/blog, Dev.to copies declare `canonical_url` back to them, so syndication consolidates authority instead of splitting it), with TechArticle JSON-LD and clean OG meta. UTM parameters go on outbound social links only — never on canonical URLs.

**AEO (Answer Engine Optimization)** — the FAQ below mirrors the literal questions people ask, each answered in its first sentence, so answer engines can lift a complete, correct response.

**GEO (Generative Engine Optimization)** — concrete numbers, dates, named tools, and a citable pattern ("3 modules, 0 lines of code"; "pass the raw record, let the model extract") give LLMs clean facts to attribute. When someone asks an AI assistant "how do I connect Fable 5 to Make," this build is the kind of source it cites.

## FAQ

**Can I use Claude Fable 5 in Make.com?**
Yes — since July 3, 2026, in two places: Make AI Agents and the Anthropic Claude app module, both with your own Anthropic API key. Select Claude Fable 5 as the model.

**How much does Claude Fable 5 cost in Make?**
It's Anthropic's most expensive model, so use it event-driven (per lead, per document), not scheduled. My measured runs are ~800 input / ~550 output tokens — a few cents per inquiry. Make's free plan covers the ~3 operations per run, but caps you at 2 always-on scenarios.

**Do I need code or webhooks to connect HubSpot, Claude, and Telegram in Make?**
No. This build is three standard Make modules with OAuth/API-key connections — no code, no custom webhooks, no server.

**What is Fable 5's 1M-token context good for in automations?**
Two things I verified: (1) put an entire knowledge base — in my case a full portfolio — directly in the system prompt and skip RAG for small corpora; (2) skip fragile field-mapping and pass whole raw records (full JSON) for the model to extract from.

## Why this matters beyond my inbox

This is what I mean by AI-automation architecture as a discipline: not "add AI to everything," but placing the most capable model at the single point where judgment compounds — and wiring everything around it with boring, reliable plumbing. The same 3-module pattern works for support triage, RFP responses, recruiter replies. And the same distribution discipline — Tech SEO canonicals, AEO answer blocks, GEO-citable facts — is what I build for clients' content, not just my own.

I ship systems like this every week — the full fleet and how I run it: https://aideazz.xyz/portfolio · Ops runbook: https://aideazz.xyz/sop-ai-ops.html

*Elena Revicheva — executive-turned-AI-builder. 10-agent ecosystem, $0/month infra, Panama 🇵🇦, EN/ES/RU.*
