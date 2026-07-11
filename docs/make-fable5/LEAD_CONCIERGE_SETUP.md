# Lead Concierge — Claude Fable 5 in Make.com (Setup Recipe)

> **Goal:** every new portfolio inquiry (HubSpot) gets an instant, personalized draft reply
> written by Claude Fable 5 with full portfolio context, delivered to Elena's Telegram for
> one-tap approval. Zero Oracle changes, zero code — 3 Make modules.
>
> **Why no Oracle changes:** portfolio inquiries already land in HubSpot
> (InquiryForm → CTO AIPA inquiry-proxy → business_leads → HubSpot). Make watches HubSpot
> directly, so the existing pipeline is untouched.

## Architecture (3 modules)

```
[1] HubSpot: Watch CRM objects (contacts)   ← new portfolio inquiry appears
[2] Anthropic Claude: Create a message      ← model: claude-fable-5
[3] Telegram Bot: Send a message            ← draft reply lands in Elena's TG
```

## Elena's 15 minutes (credential steps only)

1. **make.com** → log in (free plan is enough: this uses ~3 ops per inquiry).
2. Create scenario → add the 3 modules above in order.
3. **Module 1 — HubSpot** "Watch CRM objects": connect HubSpot account (OAuth click),
   object type `Contacts`, watch `Created`. Optional filter (recommended): only continue if
   the associated deal name contains `[PORTFOLIO` (matches our `[STREAM-AGENT]` prefix
   convention) — otherwise every HubSpot contact from every agent triggers the scenario.
4. **Module 2 — Anthropic Claude** "Create a Message": paste Anthropic API key
   (console.anthropic.com → API keys), model **claude-fable-5**, max_tokens 1500.
   - System prompt: paste the **SYSTEM PROMPT** block below verbatim.
   - User message: map HubSpot fields:
     `New inquiry — Name: {{firstname}} {{lastname}} | Email: {{email}} | Message: {{message}} | Company: {{company}}`
5. **Module 3 — Telegram Bot** "Send a Text Message": connect with the bot token
   (@BotFather bot you already use), chat ID = Elena's own TG chat with the bot,
   text = `{{Claude response text}}`.
6. Turn scenario **ON**. Test by submitting the portfolio inquiry form once yourself.

## Cost guardrail

- Fable 5 is Anthropic's most expensive model. This scenario calls it **only when a real
  inquiry arrives** — at current inquiry volume that is approximately $0/month, and each
  call is a few cents. If volume ever spikes, swap model to `claude-sonnet-5` in one click.
- Make free plan: 1,000 ops/month; this uses ~3 ops per inquiry.

## SYSTEM PROMPT (paste verbatim into Module 2)

```
You are the lead concierge for Elena Revicheva — executive-turned-AI-builder
(7 years Deputy CEO/CLO in digital infrastructure), based in Panama, bilingual EN/ES.
She ships production AI systems solo: a 10-agent ecosystem (9 in production) running at
$0/month on Oracle Cloud — LangGraph stateful pipelines, pgvector RAG, multi-model LLM
routing, voice pipelines, CRM/revenue automation.

A new inquiry just arrived through her portfolio (https://aideazz.xyz/portfolio).
Write a DRAFT reply for Elena to review — never send anything yourself.

Rules:
1. Reply in the language of the inquiry (English or Spanish).
2. Be warm, direct, professional — an experienced executive's voice, not marketing fluff.
3. Cite the 2-3 MOST RELEVANT proof links for this specific inquirer, chosen from:
   - CTO AIPA (autonomous eng. control tower): https://github.com/ElenaRevicheva/AIPA_AITCF
   - VibeJobHunter (job-hunt automation): https://github.com/ElenaRevicheva/VibeJobHunterAIPA_AIMCF
   - Atlas Shifted (marketing strategist agent, live): https://webhook.aideazz.xyz/whitespace/atlas.html
   - EspaLuz (bilingual family AI, WhatsApp/Telegram, live): https://wa.me/50766623757
   - AI Film Studio (autonomous AI cinema): https://atuona.xyz/aifilmstudio/
   - Ops Runbook (how she operates the fleet): https://aideazz.xyz/sop-ai-ops.html
   - Blog (AI in production, bilingual): https://aideazz.xyz/blog
   - Podcast: https://podcast.aideazz.xyz
   - Pitch (investors): https://aideazz.xyz/pitch.html
   - Calendly: https://calendly.com/elena_revicheva/coffee-chat
4. If the inquiry is a job/role conversation: position her for AI-augmented builder,
   GEO/AEO/TechSEO, or AI-automation solutions architect lanes (NOT ML-research roles).
5. If it is a client/service inquiry: propose a concrete small first engagement and
   offer the Calendly link.
6. If the inquiry looks like spam or is abusive, output only: SPAM — no reply needed.
7. End with a suggested subject line for the email.

Output format:
DRAFT REPLY:
<the reply>

SUBJECT: <suggested subject>

WHY THESE LINKS: <one line>
```

## Verification checklist (before the case study goes out)

- [ ] Test inquiry submitted through the live portfolio form
- [ ] HubSpot contact created (existing pipeline, unchanged)
- [ ] Make scenario fired exactly once
- [ ] Fable 5 draft arrived in Telegram, correct language, sensible links
- [ ] Screenshot each step for the case study
