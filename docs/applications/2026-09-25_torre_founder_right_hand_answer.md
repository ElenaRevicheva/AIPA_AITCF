# Torre application — "Describe a time when you served as a founder's right-hand in operations"

Written 25 Sep 2026 (torre.ai/applications/OwbXZ…, question 1 of 2). The on-screen "good / bad answer"
hints ("anything under 20%" / "over 21%") belong to a different question — ignore them.

---

For seven years I was Deputy CEO and Chief Legal Officer of JSC "E-GOV OPERATOR", a regulated public-sector digital operator, working as the CEO's right hand across IT, legal and compliance. The risk in an organisation like that is that everything routes through the top: approvals wait for one person, and each team keeps its own version of the process. My role was to take that weight off the CEO. Each area got an owner and clear decision rights, so routine calls were made below the board and only real trade-offs reached the CEO.

I run my own AI lab on the same principle today. Every stage in my CRM is named after who acts next, so nothing waits on me, and automated jobs check the result instead of trusting it. This week an audit showed only 11 of 23 job applications were truly ready. I fixed the root cause and it reached 19 of 23; the remaining 4 were proven to be closed postings.

---

## Honesty notes

- Paragraph 1 is built from the CV's role description (Deputy CEO & CLO, 2011–2018, IT/legal/compliance,
  regulated). The specific "what was stalled" is NOT on record — Elena should swap in one real example.
- Paragraph 2 numbers: the 23 Sep apply-kit read-back audit (NOW.md) — verified.
- If "Operational Co-Founder — OmniBazaar 2024–2025" (in CV_Elena_Revicheva_crm.pdf, unverified) is true,
  it is the better story for this question.

---

# Question 2 of 2 — founder impact, growth, analytics, automation, ownership

**Founder impact.** As founder of my AI lab, I took my own manual work out of the loop. A reply detector now reads my two inboxes and matches every sender against 2,600+ CRM deals. Over 60 days that meant 2,432 emails narrowed to the 73 that came from people linked to a deal. Those 73 reach me as an alert within 10 minutes, with the deal linked, instead of me triaging every inbox by hand.

**Growth.** I launched a public AI Visibility Audit API in mid-July 2026, starting from zero usage. By 23 September it had served 500 audits across 248 URLs, counted from production logs. I designed the 34 checks and built and operate the service myself.

**Analytics.** My job-search pipeline's outcome data showed one role category produced 58% of my rejections but only 17% of positive responses. I cut it from targeting within a day and re-pointed the paid search queries to the categories that convert.

**Automation.** I built that reply detector in one day with Python, IMAP, the HubSpot API and Resend, plus a native HubSpot workflow. I tuned it on 60 days of real mail, from 313 raw matches down to 73 real people. Its first live run surfaced a hospital prospect's reply that had sat unanswered for eight weeks.

**Ownership.** One job application was missing a resume. Instead of fixing that one, I audited all 23 by reading the CRM back. The logs said everything was ready; in reality only 11 of 23 were complete. The cause was failed API calls being logged as "no data". I fixed it, added a self-healing job every two hours and a daily audit with alerts. It reached 19 of 23, and the other 4 were proven to be closed postings.

## Sources
- Reply detector: 60-day dry run 24 Sep (scanned 2,432 · 313 raw → 73 tuned); CIMA reply 31 Jul → surfaced 24 Sep. NOW.md.
- API: live 17–18 Jul 2026 (memory project_visibility_api); 500 audits / 248 URLs counted from the Oracle log 23 Sep. Usage, not revenue; includes a few own test runs.
- 58% / 17%: CV fact bank (scripts/build_tailored_cv.py), verified 21 Sep.
- 11 → 19 of 23: apply-kit read-back audit, 23 Sep (NOW.md).
