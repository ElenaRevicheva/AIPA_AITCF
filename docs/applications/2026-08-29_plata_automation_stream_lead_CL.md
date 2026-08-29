# Cover Letter — Automation Stream Lead [Customer IT Support] @ Plata

**Source:** ai-native-builder.com → https://job-boards.greenhouse.io/platacard/jobs/5372439008
**Applied:** _(pending)_

---

Dear Plata Automation team,

You are looking for a playing coach — someone who sets the technical direction for an
automation stream and still builds it. That is precisely the shape of the last two years
of my work, and it is unusual because it comes from both directions.

For seven years I was Deputy CEO of a state digital-infrastructure operator, running
large-scale programs at board level across IT, legal and compliance in a heavily regulated
environment. Then I stopped delegating the build and learned to do it. Today I design,
deploy and operate **nine production AI systems** on a single Oracle Cloud VM — 24/7, at
$0/month infrastructure — in TypeScript and Python. I am the architect, the reviewer and
the on-call engineer for all of them. Nobody hands me a spec.

**What maps directly onto this role:**

- **Low-code automation carrying real business load.** My lead-concierge workflow runs on
  Make.com: a new CRM contact triggers an LLM step that drafts a qualified reply and
  delivers it for approval, on a 15-minute poll, in production on a paid plan. I have not
  shipped n8n specifically — I have shipped its shape, and I would be productive in it in
  days.
- **AI automations that stay up.** Every LLM call in my fleet runs a five-provider fallback
  chain — Anthropic, OpenAI, Gemini, Grok, Groq — with the order chosen per use case, and
  each product carries its own eval. A 130-test harness runs in under a minute at $0 API
  cost. Model outages stopped being incidents.
- **Reliability as a design choice, not a hope.** My daily publishing pipeline refuses to
  publish when it cannot source a number from measured evidence. It fails **closed** and
  goes silent rather than shipping a figure nobody can trace. For a bank, I would expect
  that instinct to be the baseline, not the exception.
- **Reviewing workflows, not just code.** My duplicate-content guard was green for months
  while shipping near-copies, because it tested exact equality and near-duplicates are not
  equal. Fifty-six of one hundred twenty-one published pages were affected. I found it,
  named it, replaced equality with overlap scoring and backfilled the cache. The lesson I
  now enforce on every review: **a passing check is not a working check** — verify the
  behaviour in the logs, never in the config.
- **Support-stream shape.** My inbound triage classifies each incoming request, scores
  urgency 1–5, and routes it to a dashboard and an alert channel. That is ticket triage
  with an LLM in the loop, which is what "Customer IT Support automation" becomes.

Integrations are the daily surface: REST and webhook architectures across GitHub, HubSpot,
PayPal, WhatsApp Business, Telegram and Resend, on Oracle Autonomous Database over mTLS,
with PM2, systemd and a five-minute health cron holding it together.

I am based in Panama (UTC-5) and set up for remote work, and I will hold a fixed daily
overlap block with your hubs — my mornings are your afternoons. I am also open to
discussing relocation.

I would welcome the chance to walk you through the fallback-chain architecture or the
duplicate-guard postmortem in detail.

Best regards,
**Elena Revicheva**
aipa@aideazz.xyz · +507 616 66 716
aideazz.xyz/portfolio · github.com/ElenaRevicheva · linkedin.com/in/elenarevicheva
