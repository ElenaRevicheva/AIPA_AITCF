# PRODUCT TRUTH — what each product really does (verified from code, cron and logs)

Source of OpenClaw's production sheet (`scripts/prod-truth-sheet.cjs` → Oracle `~/.openclaw/workspace/prod/TOOLS.md`).
Every line here was checked against code, the Oracle crontab, service lists or a log line on the date shown. A line
that can no longer be shown from production is deleted, not softened. No new numbers without a log line.

## WHY THE LAB EXISTS (her own recorded words)
- EN: The products were built first for my own family's needs after moving to Panama in 2022 — learning Spanish faster, the doctor's appointment you don't understand, the school meeting, the paperwork, becoming visible. The business came later. Every feature came from a specific need we lived at home.
- ES: Los productos nacieron primero para las necesidades de mi propia familia al llegar a Panamá en 2022 —aprender español más rápido, la cita médica que no se entiende, la reunión con la maestra, el trámite, hacerme visible—. El negocio vino después. Cada función salió de una necesidad concreta que vivimos en casa.
- Never say "single mother", "solo founder" or any hardship framing (her rule, 1 Aug 2026).

## WHAT RUNS (Oracle, 21 Oct 2026)
- One cloud VM. PM2: cto-aipa, whitespace, dragontrade (2), algom (2), n8n, serpapi-jobs. systemd: espaluz-familybot, espaluz-whatsapp, espaluz-influencer, espaluz-payments-webhook, vibejobhunter, vibejobhunter-web; user unit openclaw-gateway. 20+ scheduled jobs in the crontab.

## PRODUCTS
- CTO AIPA — her technical agent on Telegram (TypeScript/Node). Verified features: searches her Zoho + Gmail on request and answers from the mail (21 Oct); a photo whose caption asks for a card becomes a Trello card, dates in Panama time (21 Oct); turns her voice/text task into a PDF, Word or HTML document (19 Oct); `/research_employer <company>` writes a sourced deep-dive note on that job's HubSpot deal (15 Oct).
- ES: CTO AIPA — su agente técnico en Telegram. Busca en su correo Zoho y Gmail y responde desde el correo; una foto con "crea una tarjeta" se vuelve tarjeta de Trello; convierte una tarea dictada en PDF, Word o HTML; `/research_employer` deja una investigación con fuentes en el deal de HubSpot.
- VibeJobHunter — hourly job-search cycle (systemd `vibejobhunter`): finds and scores postings, stages deals in HubSpot, reads two mailboxes for employer replies. A reply radar (every 10 min) matches any reply to its deal.
- OpenClaw — interview and talk coach (Telegram + her WhatsApp "message yourself"), EN/ES, voice in and out; reads the job-deals sheet rebuilt from HubSpot every 30 min; keeps her corrections as permanent lessons.
- AI Visibility Audit API — public, no sign-up (aideazz.xyz/api): 34 checks in 4 weighted categories (AI crawler access, structured data/GEO, answer-readiness/AEO, technical foundation). Spanish page shows the audit in Spanish (21 Oct).
- Lead Concierge — website form/chat inquiries land in HubSpot; Claude drafts the reply via Make.com, a server fallback drafts with a five-provider chain if Make is silent; nothing is sent without her one-tap approval. A self-test drill runs daily at 07:45 Panama.
- EspaLuz — bilingual AI Spanish tutor for expat families on WhatsApp (Twilio) and Telegram; Python; per-family memory in PostgreSQL + pgvector.
- WHITESPACE (aideazz.xyz/atlas/finder) — reads up to 12 live ACTIVE ads from Meta's Ad Library (Facebook, Instagram, Messenger, Threads) via Bright Data for a market + country, shows saturated angles and the open one, each ad linked. All of Latin America + Spain + US; Latin American markets searched in their ads' language (Spanish; Portuguese for Brasil). A Spanish page gets a Spanish result. A collection takes ~1–5 min; with no real ads the page says "no proof".
- Atlas — "The Monday Move" (aideazz.xyz/atlas). The Monday chain (crontab, Panama time): 9:00 capture of the tracked markets' ads → each angle ENTER / WATCH / AVOID; each ENTER window becomes ONE `[ATLAS-RADAR]` deal in HubSpot (deduped per market + angle). 10:15 campaign alert: a ready outbound brief to her Telegram when one of HER service markets opens. 10:30 outcomes: real HubSpot deal stages per market fed back into Atlas. 11:00 lead machine: new local businesses found on Google Maps (via SerpAPI), each qualified (real website, real email on that domain, her own visibility audit score in band) before entering HubSpot — max 8 a week, plus up to 2 businesses with no website.
- Measured Mondays: lead machine staged 8 of 11 and 8 of 9 businesses looked at (earlier runs); 19 Oct: 0 looked at (SerpAPI out of searches) + 2 no-website businesses staged; campaign alert 19 Oct: 1 alert; outcomes pushed 7 markets.

## HOW THE AGENTS REALLY SHARE WORK
- Through HubSpot and files, on schedules — not live conversation. CTO AIPA writes deep-dive notes on deals → the deals sheet (every 30 min) → OpenClaw coaches from them. Atlas writes `[ATLAS-RADAR]` deals and lead-machine leads → the outcomes job reads their stages back into Atlas. The reply radar links any reply to its deal. NOW.md is the handover note between Claude Code and Cursor.
- There is NO live orchestrator yet: AILA (an orchestration layer) is designed, not built. Never say agents "talk to each other in real time".

## KNOWN LIMITS (say them; they are the honest part)
- Public ad libraries give no CTR, spend or ROAS: Atlas/WHITESPACE measure angle saturation and propose a hypothesis.
- TikTok ads: blocked until Bright Data identity verification. Google search ads: tested, 0 ads in Panama.
- SerpAPI is out of searches (21 Oct): the Monday lead machine finds no new businesses until it is topped up or renews.
- No paying client case studies for Atlas/WHITESPACE: the numbers are from her own system.
