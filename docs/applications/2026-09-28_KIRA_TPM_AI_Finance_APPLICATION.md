# KIRA (Bjak) — Technical Product Manager, AI Finance App · application kit

- **Found by VJH:** 27 Sep 2026, score 97, HubSpot deal `[HIRING-VJH-LEAD] Technical Product Manager - AI Finance App @ Bjakcareer` (I Act TODAY).
- **Live check 28 Sep (Ashby public API):** posting live, published 29 Aug, `isRemote: true`.
- **Panama eligibility:** the posting states *"This is a remote role. We hire globally and work across multiple countries and time zones."* No country list, no residency rule. Panama is allowed.
- **Apply (direct, not via Torre):** https://jobs.ashbyhq.com/bjakcareer/b2375c9e-cf14-47cf-ba9a-1be743487781/application
- **CV:** `docs/applications/cv-by-job/CV_Elena_Revicheva_KIRA_TPM_AI_Finance.pdf`, the PM lane CV with a job-specific headline, summary and project order (`--job=docs/applications/cv-by-job/2026-09-28_kira_tpm_ai_finance.json`).
- **Pay:** not stated in the posting.

---

## Cover letter (paste as-is)

Dear KIRA Hiring Team,

I am applying for the Technical Product Manager – AI Finance App role. I work remotely from Panama City (UTC-5), and your posting says you hire globally across time zones.

I operate an AI-native development environment where specialized agents handle much of the implementation execution. I own requirements, architecture, orchestration, evaluation, deployment, monitoring and production decisions. That is the profile you describe: no production code, but technical enough that engineers do not have to simplify.

Regulated constraints as product inputs. For seven years I was Deputy CEO and Chief Legal Officer of a public-sector e-government operator — IT, legal and compliance at board level in a heavily regulated environment — and I was Deputy CEO for business development at a fintech. Treating licensing, compliance and legal limits as first-class inputs was my job long before AI.

AI where it earns its place. Your rule that every AI-surfaced number traces back to a real record is one I already run in production: my publishing pipeline will not print a number it cannot trace, and when the model decorates the facts, the day stays silent. My job-search agent's LLM judge is scored against my own recorded decisions on the real postings, and what the model may not decide — a location or pay it misreads — is overruled in code from the posting itself. This week that test made me ship a retrieval (RAG) upgrade switched off, because it scored lower than the simpler baseline.

Correctness under failure. Outbound sends in my growth loop need one human approval and fail closed: if an attachment does not load, the email is refused rather than claiming a document it did not carry. Every model call has a five-provider fallback, so a vendor deprecation was a config change, not an outage. I have not run a payments rail; I run the disciplines money movement depends on — idempotent writes, a permanent decision ledger, daily read-back audits — and I ramp fast in regulated domains.

I am ready to take the online assessment as soon as it is sent.

Best regards,
Elena Revicheva
aideazz.xyz/portfolio · aipa@aideazz.xyz · +507 616 66 716

---

## Every claim above, and where it is verified

| Claim | Source |
|---|---|
| Deputy CEO & Chief Legal Officer, e-gov operator, 7 years, regulated | CV "Earlier" (17 Sep resume) |
| Deputy CEO BD, Fundery LLC (fintech) | CV "Earlier" |
| Operating-model sentence | Elena's approved wording, 28 Sep (`src/cover-letter.ts` OPERATING_MODEL) |
| Publisher will not print an untraceable number | CV "Fail-closed publishing"; cto-aipa grounding gate (NOW.md, 26 Aug) |
| Judge scored on her decisions; misreads overruled in code; RAG shipped OFF | VJH replay 28 Sep: 14/20 + 8/18; RAG 6–7/18 → OFF (`45f6411`) |
| One human approval; fail-closed attachments | CV "Approved-send growth loop"; `scripts/test-outreach-attachments.cjs` |
| Five-provider fallback; Groq deprecation = config change | CV "Fail-closed publishing"; memory `project_groq_deprecation_august` |
| Idempotent writes | reply-radar notes made idempotent (Sep 2026) |
| Permanent decision ledger | VJH `autonomous_data/judge_decisions.json` (554 decisions) |
| Daily read-back audits | Oracle cron 13:45 UTC `hs-audit-apply-kit.cjs --telegram` |
| No payments rail run | stated as a gap on purpose — never claim it |

## Honest gaps, and how to answer them

- **Payments rails / money movement at scale:** not done. Answer with the disciplines above and the regulated-domain years. Never claim it.
- **Time zone:** Hong Kong is UTC+8, Panama UTC-5 (13 h apart). They say they work across time zones; propose agreed core-overlap hours if asked.
- **SEA market:** nice-to-have only; not claimed.

## Words they will test (her systems already use each)

- **Idempotency:** doing the same write twice changes nothing the second time (her reply-radar notes).
- **Reconciliation / read-back audit:** re-read what the system says it did and compare it with reality (her daily apply-kit audit).
- **Fail-closed:** when unsure, refuse rather than guess (her attachment gate, her publisher).
- **Human in the loop:** a person approves before anything irreversible (her one-tap send).
- **Offline eval:** replay the model on past real decisions before shipping (her judge replay; RAG kept OFF).
