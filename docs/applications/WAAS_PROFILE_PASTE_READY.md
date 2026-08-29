# Work at a Startup — paste-ready profile

**Sign up:** https://www.workatastartup.com/ → "Apply as a candidate" (free, ~2 min)

**Why this one matters more than the scraping we didn't do.** WaaS is not a job board
you read — it is a board where **YC founders search for candidates and message them
first**. That makes it one of the pre-aggregated *demand* channels, which is the exact
gap behind 19 months at $0: the supply was never the problem. A profile here works
while you sleep, and no amount of scraping the public listings page substitutes for
being *in the candidate index*.

VJH cannot do this part. YC's terms forbid automated extraction, and an automated
session would put the account at risk — the account is worth more to you intact.

---

## Fields, ready to paste

### Headline / Role
```
AI Automation Architect — production AI systems, agentic automation, GEO/AEO
```

### Looking for
```
Full-time or contract · Remote (UTC-5, Panama) · Founding / early engineer,
AI automation, forward-deployed, internal AI tools
```

### One-liner
```
Ex-Deputy CEO who stopped delegating the build. 12 production AI systems live on
one cloud VM at $0/month infra — I am the architect, the reviewer and the on-call.
```

### About / Intro
```
I build the automation that runs a business when nobody is watching: finding
customers, qualifying them, drafting the reply, updating the CRM, reporting what
happened. I design it, deploy it, and stay on call for it.

Twelve systems are live right now on a single Oracle Cloud VM at $0/month
infrastructure, running 24/7 for eighteen months. Every LLM call runs a
five-provider fallback chain (Anthropic, OpenAI, Gemini, Grok, Groq) ordered per
use case across six products — when Groq deprecated the models I depended on, the
fleet kept serving and the migration was a config change, not an outage. A
130-test eval harness runs in under a minute at $0 API cost.

Before this I spent seven years as a Deputy CEO running large-scale digital
transformation at board level, across IT, legal and compliance in a heavily
regulated environment. So I can architect the pipeline and then explain it to the
person signing the cheque, in the same conversation.

I publish my own production postmortems at aideazz.xyz/ai-ops-wiki.html — you can
read how I debug before you talk to me.
```

### Skills
```
Python · TypeScript · Claude/OpenAI/Gemini APIs · LangGraph · RAG (pgvector) ·
agentic workflows · evals · Make.com · n8n-class workflow automation · HubSpot ·
FastAPI · Node.js · REST/webhooks · PostgreSQL · Oracle Cloud · Docker · PM2 ·
systemd · GEO/AEO/Technical SEO · JSON-LD
```

### Impressive accomplishment (WaaS asks for one — this is the strongest)
```
My daily publishing pipeline shipped near-duplicate articles for months with a
green log line every time: the guard tested exact slug equality, and reworded
near-copies are not equal. 56 of 121 published pages were affected. I found it,
replaced equality with token-overlap scoring, backfilled the dedup cache from 64
to 123 entries, and made a duplicate a retryable gate rather than a silent pass.

Then I did the harder half. Refusing to publish would have bought quality with
silence, and the blog has to post daily — so I rebuilt the supply: the day's angle
is now derived from measured evidence (commits, incidents, operator queue) instead
of a fixed rotation, and if the model cannot stay inside the verified facts, the
article is assembled deterministically from them. It fails closed rather than
publishing a number it cannot trace.
```

### Links
```
Portfolio  https://aideazz.xyz/portfolio
GitHub     https://github.com/ElenaRevicheva
LinkedIn   https://linkedin.com/in/elenarevicheva
AI Ops Wiki https://aideazz.xyz/ai-ops-wiki.html
```

---

## Two settings founders filter on — get these right

1. **Remote + timezone.** Set remote and state UTC-5 with a committed overlap block
   ("mornings Panama = afternoons Europe"). Founders filter out candidates whose
   timezone is unstated far more often than they filter out a distant one.
2. **Visa/work status.** Answer it explicitly. A blank field reads as a complication
   and gets skipped silently.

## After signing up
Upload `29.08.26_EN_Resume_Elena Revicheva.pdf` (Desktop\resumes). WaaS parses it
into the profile, so the resume and the fields above should agree — they do; both
were written from the same verified facts.
