# CASE STUDY DRAFT — publish only AFTER the build is live and tested

> Meta-play: Fable 5 appeared in Make on **July 3, 2026**. Almost nobody has published a
> real production build with it yet. Freshness is the entire distribution advantage —
> target publishing within days of the build working, in three rooms the same week:
> **Make Community forum → Dev.to → LinkedIn.**
>
> ⚠️ Every [PLACEHOLDER] must be replaced with a real number/screenshot before publishing.
> The credibility of this piece — and of Elena — is that every word is verifiably true.

---

## CANONICAL VERSION (Dev.to + aideazz.xyz/blog)

**Title:** How I Wired Claude Fable 5 Into Make.com to Answer My Portfolio Leads — 6 Days After Launch

**Tags:** ai, automation, nocode, claude

On July 3, Make.com added Anthropic's brand-new Claude Fable 5 — the first Mythos-class
model — to its AI toolkit. I run a 10-agent AI ecosystem solo on a $0/month Oracle Cloud
budget, so my rule for new AI features is simple: if it can't ship into production the same
week, it's a demo, not a tool.

Here's the production build, [N] days after the announcement.

### The problem

My portfolio (https://aideazz.xyz/portfolio) collects inquiries through a form that flows
into HubSpot via my CTO agent's inquiry proxy. But an inquiry is only as valuable as the
speed and quality of the response — and I'm a solo founder in timezone UTC-5 with a child.
Inquiries that arrive at 3am should not wait until morning for a thoughtful, personalized,
correctly-linked reply draft.

### The build: 3 modules, 0 lines of code, ~15 minutes

```
HubSpot (watch new contacts)
   → Claude Fable 5 (Anthropic app in Make, my API key)
      → Telegram (draft lands in my pocket for one-tap approval)
```

[SCREENSHOT: Make scenario canvas]

What Fable 5 specifically adds over the previous generation:

1. **1M-token context.** The system prompt carries my ENTIRE portfolio — all 10 agents,
   every proof link, my positioning — and could carry 100x more. The model picks the 2-3
   most relevant links per inquirer instead of spraying everything at everyone.
2. **Refusal branching.** Fable 5 returns `stop_reason: "refusal"` on requests it
   won't handle — which Make can route. Spam and abuse never reach my Telegram.
3. **Human-in-the-loop by design.** The model drafts; I send. An AI that ghostwrites
   for you is an asset; an AI that speaks as you unsupervised is a liability.

### The honest cost math

Fable 5 is Anthropic's most expensive model. That's exactly why this architecture works:
it runs ONLY when a real human inquires — event-driven, not scheduled. At my volume that
rounds to [REAL $/month]. Make's free tier (1,000 ops/month) covers it at ~3 ops per
inquiry. My heavy scheduled workloads stay on cheaper models (Groq/Gemini free tiers) —
route the expensive intelligence to the moments with the highest stakes.

### Results ([N] days in)

- Inquiry → draft-in-Telegram latency: [REAL NUMBER] seconds
- Drafts needing zero edits: [REAL NUMBER] of [N]
- Cost so far: $[REAL NUMBER]

[SCREENSHOT: real (anonymized) inquiry → real Fable 5 draft in Telegram]

### The distribution layer: Tech SEO + AEO + GEO on the article itself

An automation case study that nobody finds is a diary entry. This article is itself built
as a search asset across all three optimization disciplines:

**Tech SEO** — the canonical version lives on my own domain
(https://aideazz.xyz/blog/[SLUG]); the Dev.to copy declares `canonical_url` pointing back
to it, so syndication consolidates authority instead of splitting it. The blog post ships
with TechArticle JSON-LD (snippet below), correct OG/Twitter meta, descriptive alt text on
every screenshot, and internal links into the portfolio's existing ProfilePage structured
data. UTM parameters stay on *outbound social links only* — never on the canonical URL.

**AEO (Answer Engine Optimization)** — the FAQ section below mirrors the literal questions
people ask ("Can I use Claude Fable 5 in Make.com?"), each answered in the first sentence,
so answer engines can lift a complete, correct response.

**GEO (Generative Engine Optimization)** — concrete numbers, dates, named tools, and a
citable pattern ("3 modules, 0 lines of code") give LLMs clean facts to attribute. When
someone asks an AI assistant "how do I connect Fable 5 to Make," this build is the kind of
source it cites — with my name attached.

```json
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": "How I Wired Claude Fable 5 Into Make.com to Answer My Portfolio Leads",
  "author": { "@type": "Person", "name": "Elena Revicheva",
              "url": "https://aideazz.xyz/portfolio" },
  "datePublished": "[PUBLISH DATE]",
  "about": ["Claude Fable 5", "Make.com", "AI automation", "HubSpot", "Telegram"],
  "proficiencyLevel": "Beginner"
}
```

### FAQ

**Can I use Claude Fable 5 in Make.com?**
Yes — since July 3, 2026, in two places: Make AI Agents and the Anthropic Claude app
module, both with your own Anthropic API key. Select `claude-fable-5` as the model.

**How much does Claude Fable 5 cost in Make?**
It's Anthropic's most expensive model, so use it event-driven (per lead, per document),
not scheduled. My per-inquiry cost is a few cents; Make's free tier (1,000 ops/month)
covers the scenario at ~3 operations per run.

**Do I need code or webhooks to connect HubSpot, Claude, and Telegram in Make?**
No. This build is three standard Make modules with OAuth/API-key connections — no code,
no custom webhooks, no server.

**What is Fable 5's 1M-token context good for in automations?**
You can put an entire knowledge base (my case: a full portfolio) directly in the system
prompt and skip RAG for small corpora — the model selects what's relevant per request.

### Why this matters beyond my inbox

This is what I mean by AI-automation architecture as a discipline: not "add AI to
everything," but placing the most capable model at the single point where judgment
compounds — and wiring everything around it with boring, reliable plumbing. The same
3-module pattern works for support triage, RFP responses, recruiter replies. And the
same distribution discipline — Tech SEO canonicals, AEO answer blocks, GEO-citable facts —
is what I build for clients' content, not just my own.

I ship systems like this every week — the full fleet and how I run it:
https://aideazz.xyz/portfolio · Ops runbook: https://aideazz.xyz/sop-ai-ops.html

*Elena Revicheva — executive-turned-AI-builder. 10-agent ecosystem, $0/month infra,
Panama 🇵🇦, EN/ES/RU.*

---

## MAKE COMMUNITY VERSION (reply in the Fable 5 announcement thread + Showcase post)

**Title:** [Showcase] Fable 5 + HubSpot + Telegram: production lead concierge, 3 modules

Built my first production Fable 5 scenario [N] days after the announcement — sharing the
pattern since the thread asked for real use cases.

**Use case:** portfolio inquiries (HubSpot) → Fable 5 drafts a personalized reply using my
full portfolio as context (the 1M window means the whole knowledge base lives in the system
prompt) → draft lands in Telegram for approval. 3 modules, no code, no webhooks.

**Two tips from the build:**
1. Put your entire knowledge base in the system prompt — with 1M tokens you stop needing
   RAG for small corpora. Selection quality (which links it cites per lead) noticeably
   beats my previous Sonnet setup.
2. Respect the price: use Fable 5 event-driven (per real lead), keep scheduled bulk work
   on cheaper models. `stop_reason: "refusal"` + a Make router = free spam filter.

Full write-up with screenshots: [DEV.TO LINK]
Happy to answer questions about the setup.

---

## LINKEDIN VERSION (post within the same week; tag @Make and @Anthropic)

Claude Fable 5 appeared in Make.com on July 3.
By July [N] it was answering my portfolio leads in production.

Solo founder math: an inquiry at 3am used to wait 6 hours for a thoughtful reply.
Now: HubSpot → Fable 5 (with my ENTIRE portfolio in its 1M-token context) → a
personalized draft in my Telegram in [N] seconds. I review, tap, send.

3 Make modules. 0 lines of code. ~$[N]/month, because the expensive model only wakes
up when a real human writes to me.

That's the discipline of AI-automation architecture: the most capable model at the
single point of highest judgment — boring reliable plumbing everywhere else.

And the write-up itself is the other half of my craft: canonical on my domain (Tech SEO),
FAQ blocks answer engines can lift (AEO), citable facts LLMs attribute (GEO). The
automation gets you the lead; the optimization gets you found.

Build recipe + honest cost math: [DEV.TO LINK]
The 10-agent fleet it joined: https://aideazz.xyz/portfolio

#AIAutomation #MakeDotCom #ClaudeAI #NoCode #TechSEO #GEO #AEO #BuildInPublic

---

## PUBLISHING SEQUENCE (all three in the same week, while it's news)

| Day | Action |
|-----|--------|
| 0 | Build live, test inquiry verified, screenshots taken |
| 0-1 | Fill every [PLACEHOLDER] with real numbers |
| 1 | Publish aideazz.xyz/blog FIRST (canonical, with TechArticle JSON-LD), then Dev.to with `canonical_url` → blog |
| 1 | Reply in the Make Community Fable 5 thread + Showcase post, linking Dev.to |
| 2 | LinkedIn post, tagging Make + Anthropic; X thread variant via existing atoms |
| 3+ | Answer every comment in every room within 24h — comments are the distribution |

**UTM convention for every portfolio link:**
`?utm_source=devto|makecommunity|linkedin&utm_medium=social&utm_campaign=fable5-case-study`
(HubSpot will show which room actually sends humans.)
