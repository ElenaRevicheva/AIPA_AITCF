# Supabase — Head of AI Native Operations · application answers (5 Oct 2026)

Deal: `[HIRING-MANUAL] Head of AI Native Operations @ Supabase` (HubSpot). CV attached on the deal:
`CV_Elena_Revicheva_Supabase_AI_Native_Ops_v3.pdf`. Every fact below is from NOW.md / CLAUDE.md / the CV
fact sources; nothing invented.

## Q: Tell us about your experience working in an async and/or remote environment. What practices or approaches have worked well for you? What challenges have you faced?

**FINAL (paste as is):**

I have worked fully remote from Panama City (UTC−5) since 2025, running AIdeazz AI Lab and working async with counterparts in the US and India. I do not write code by hand. I use Claude Code and Cursor every day, and I created CTO AIPA, my AI technical co-founder: Claude Code working under my written operating rules and persistent memory, with its own production service that sends our approved outreach, tracks delivery in the CRM and publishes daily. I operate an AI-native development environment where specialized agents handle much of the implementation execution. I own requirements, architecture, orchestration, evaluation, deployment, monitoring and production decisions.

That setup is async by nature. Three AI coding agents (Claude Code, Cursor Desktop and Cursor Cloud) work the same repositories and cannot see each other's chats. The only shared state is one written protocol file and the CRM. What works:
- Claim before you touch: anyone editing shared code or restarting a service adds a row to a session board first.
- A handoff block on every pause: done, next, verified by, risk. An agent that stops without one has lost the work, even if the code is committed.
- Work lives in a file or the CRM, never only in a chat.
- Check the result, not the activity: I verify in the receiving system. That is how I found a sign-up integration that had been silently failing since launch, and backfilled the 28 users it had dropped.

The challenges taught me the rules:
- The coordination file once lived on a branch the other agent never read. For five days there were two versions of the truth. Now shared state lives only on main.
- A tool's test result stayed in one chat, so a later session told me the tool worked when it had already failed twice.
- This week a bug fix sat on an unmerged branch for a month and the bug came back. "Fixed" now means merged, deployed and proven on real data.

How I think about operating models: https://aideazz.xyz/Elena_Revicheva_Professional_Outlook_2026.pdf

(~330 words. Link verified live 5 Oct 2026: HTTP 200, 3.9 MB PDF.)
