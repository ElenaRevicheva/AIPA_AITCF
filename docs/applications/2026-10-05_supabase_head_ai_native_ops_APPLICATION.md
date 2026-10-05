# Supabase — Head of AI Native Operations · application answers (5 Oct 2026)

Deal: `[HIRING-MANUAL] Head of AI Native Operations @ Supabase` (HubSpot). CV attached on the deal:
`CV_Elena_Revicheva_Supabase_AI_Native_Ops_v3.pdf`. Every fact below is from NOW.md / CLAUDE.md / the CV
fact sources; nothing invented.

## Q: Tell us about your experience working in an async and/or remote environment. What practices or approaches have worked well for you? What challenges have you faced?

**FINAL — 250-word version (paste as is):**

I have worked fully remote from Panama City (UTC−5) since 2025, running AIdeazz AI Lab and working async with counterparts in the US and India. I do not write code by hand. I use Claude Code and Cursor daily, and I created CTO AIPA, my AI technical co-founder: Claude Code working under my written operating rules and persistent memory, with its own production service for outreach, CRM tracking and daily publishing. Agents do much of the implementation; I own requirements, architecture, evaluation, deployment and production decisions.

It is async by nature: three AI coding agents work the same repositories and cannot see each other's chats. The only shared state is one written protocol and the CRM. What works:
- Claim before touching shared code or restarting a service.
- A handoff on every pause: done, next, verified by, risk.
- Work lives in a file or the CRM, never only in a chat.
- Verify the result, not the activity. That exposed a sign-up integration silently failing since launch; I backfilled the 28 users it dropped.

Challenges that became rules:
- The coordination file once sat on a branch another agent never read: five days of two truths. Shared state now lives only on main.
- A test result stayed in one chat, so a later session claimed a failed tool worked.
- A bug fix sat unmerged for a month and the bug returned. "Fixed" now means merged, deployed and proven on real data.

How I operate: https://aideazz.xyz/Elena_Revicheva_Professional_Outlook_2026.pdf

(249 words. Link verified live 5 Oct 2026: HTTP 200, 3.9 MB PDF.)
