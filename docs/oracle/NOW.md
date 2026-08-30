# NOW — live across Cursor and Claude Code

This is the shared session, not a shared chat. Cursor Cloud, Cursor Desktop, and Claude
Code **do not** see each other's messages. They all read this file and HubSpot. Update it
when the money queue changes. **Push so the other tool sees it — and push to `main`.**

> ⚠️ **30 Aug 2026 — why this file was nearly written twice.** Cursor created NOW.md on
> 25 Aug on branch `cursor/intelliops-bd-money-play-abc0`. It was never merged, so from
> `main` — which is what Claude Code and Oracle both read — the file did not exist, and a
> second version was written from scratch. Nothing was lost (the two are merged below),
> but the coordination file living on a branch the other tool never reads defeats its own
> purpose. **NOW.md belongs on `main`.**

---

## 💰 MONEY QUEUE — what is in flight, and whose move it is

| # | Thing | State | Whose move |
|---|---|---|---|
| 1 | **Rwazi — AI Engineer, Marketing & GTM Systems** (contractor, 25–40h, US-overlap) | All Signal 1/2/3 answers + comp drafted. **Now also a HubSpot Hiring deal** (30 Aug 13:52) | **Elena: paste & submit** on Ashby. Record the Loom — they said "links or Looms beat resumes" |
| 2 | **Plata — Automation Stream Lead** | Cover letter written | Elena: send |
| 3 | **Behram / AI Native Builder — LinkedIn comment** | Drafted with verified numbers | Elena: paste |
| 4 | **Work at a Startup profile** | Every field written out, paste-ready | Elena: create the free account — agent cannot (credential boundary) |

Drafts in `docs/applications/`. Resume: `29.08.26_EN_Resume_Elena Revicheva.{docx,pdf}` on
Desktop\resumes — 3 pages, rewritten to read for business owners as well as engineers.

## 🔗 Carried from Cursor's 25 Aug version — **verify still live before tapping**

| Lane | Deal | Tap (full URL) |
| --- | --- | --- |
| Overlay commission (not a job) | IntelliOps BD | https://webhook.aideazz.xyz/cto/go/outreach-email/intelliops-bd |
| Job follow-up (already applied on Torre) | BSS Groupe | https://webhook.aideazz.xyz/cto/go/outreach-email/ai-native-b2b-marketplace |

BSS confirm page must show **Hire me**, **Adjunto: Elena_Revicheva_Resume.pdf**, and
`https://aideazz.xyz/portfolio` twice. If HubSpot opens **Edit link** instead of the send
page, paste the full URL from the table.

- IntelliOps deal: `.../record/0-3/64302436100` — **do not countersign v2**
- BSS deal: `.../record/0-3/64302126655` — To: `contact@bssgroupe.com`
- Catch-up doc: `docs/oracle/HANDOFF_2026-08-25_INTELLIOPS_BSS.md`

## 🌿 The Cursor branch — unmerged work, do not lose it

`cursor/intelliops-bd-money-play-abc0`, last commit 25 Aug. **Oracle is NOT on it** — Oracle's
`cto-aipa` runs `main`, so the old "do not reset Oracle to main" warning no longer applies;
`src/go-wa.ts` was already brought onto `main` on 25 Aug (see CLAUDE.md).

Still **only** on that branch — merge deliberately or port by hand, do not reset either way:
`scripts/hs-email-link-deal.cjs`, `hs-fix-send-buttons.cjs`, `hs-intelliops-story.cjs`,
`hs-note-intelliops-eval.cjs`, `intelliops-imap-pull.py`, `oracle-hs-note-intelliops.sh`.
⚠️ The branch is also **behind** `main` on many files — a naive merge would delete current
work. Port the files you want; never reset.

## 🔴 OPEN — do not assume these work

- **Anthropic credits at zero** since 17 Aug. Key valid, balance is not. The 5-provider chain
  absorbs it (304 fallback calls in 12h, no downtime) and `test_provider_chain[claude]` fails
  **correctly**. Elena tops up, or leave it on OpenAI.
- **VJH outreach crash:** `[outreach] ERROR <company>: 'str' object has no attribute 'get'`.
  Real, in the founder-email path, needs its own session.
- **Wellfound** was returning 0 behind a green tick for months — now honestly dormant
  (private GraphQL API changed; not scraped harder, on purpose).
- **~50 duplicate blog pages** need canonical consolidation. **Canonical only — never
  delete.** 21 published pages carry the fabricated Redis stack; never canonicalise onto one.
- No Claude MCP in Cursor. Gmail MCP in Cursor needs auth. HubSpot from Cursor cloud agents
  goes through Oracle (no `api.hubapi.com` egress).

## ✅ JUST LANDED (29–30 Aug)

- **ai-native-builder.com wired into VJH** — densest source in the fleet, 72% career-gate
  pass vs ~21%. Memory: `project_ai_native_builder_source`.
- **Three pipeline bugs fixed** (`36e985c`) after that source ran a full day producing
  *nothing*: the dedup ledger was stamped before the processing cap (175 jobs burned per
  cycle), priority was a group rather than a ranking (densest source starved), and the LLM
  judge carried a false premise that Elena does not hand-code (vetoing Python/TypeScript
  roles — her own languages). Judge regression 8/8. **Verified by outcome:** Rwazi reached
  HubSpot 30 Aug 13:52.
- **Board-quality guards:** `board_hygiene.py`, `scripts/qualify_job_board.py`, weekly
  Telegram watch (`job-board-watch.sh`, Tue 06:00 Panama).
- **agentic-engineering-jobs.com REJECTED** — newest posting 33 days old, 91% past their own
  expiry. Do not wire it.
- **YC Work at a Startup: deliberately NOT scraped.** Its `/jobs` IS public now, but YC's ToS
  forbids automated extraction. robots.txt allowing ≠ ToS permission.
- **Wiki incident published** `2026-08-30-marked-done-before-anyone-read-them`, `blog: yes`.

## ⚠️ Standing traps

- **Never `git add -A`** in cto-aipa. Named files only.
- Oracle runs VJH under `venv/bin/python` — bare `python3` dies on `pydantic_settings`.
- Do **not** `source .env` — `FROM_EMAIL` has spaces and angle brackets; it is a syntax
  error. Read keys with `grep`/`cut`.
- After any deploy: `sudo systemctl restart vibejobhunter`, prove it from `journalctl` —
  **and check the OUTCOME, not that the step ran.** A source logging "197 jobs" every hour
  can still be delivering zero.

## How a new session starts

1. Read this file. Then `docs/oracle/HANDOFF_2026-08-25_INTELLIOPS_BSS.md` if touching
   IntelliOps/BSS.
2. Open the HubSpot deals above rather than re-discovering them from chat history.
3. Check `git log` and `pm2`/`systemctl` uptimes before assuming any state.
