# NOW — the live layer

**Last updated: 2026-08-30 (Claude Code session)**

> Cursor and Claude Code cannot see each other's chats. This file and HubSpot are the
> only shared state. **Read it at session start. Update it when the money queue changes.
> Push, so the other tool sees it.** Keep it SHORT — if it grows past a screen, move the
> detail into a doc and leave a pointer.

---

## 💰 MONEY QUEUE — what is actually in flight

| # | Thing | State | Whose move |
|---|---|---|---|
| 1 | **Rwazi — AI Engineer, Marketing & GTM Systems** (contractor, 25–40h, US-overlap) | Application fully drafted, all Signal 1/2/3 answers + comp written | **Elena: paste & submit.** Ashby form. Also record the Loom — they said "links or Looms beat resumes" |
| 2 | **Plata — Automation Stream Lead** | Cover letter written | Elena: send |
| 3 | **Behram / AI Native Builder — LinkedIn comment** | Drafted, verified numbers | Elena: paste. **Now has a second finding worth adding — see below** |
| 4 | **Work at a Startup profile** | Every field written out, paste-ready | Elena: create the free account (agent cannot — credential boundary) |

Drafts live in `docs/applications/`. Resume: `29.08.26_EN_Resume_Elena Revicheva.{docx,pdf}`
on Desktop\resumes (3 pages, rewritten for business owners as well as engineers).

## 🔴 OPEN — not fixed, do not assume these work

- **Anthropic credits are at zero** since 2026-08-17. Key is valid; balance is not.
  The 5-provider chain absorbs it (304 fallback calls in 12h, no downtime) and the
  eval `test_provider_chain[claude]` fails **correctly**. Elena tops up, or leave it.
- **Wellfound** returns 0 every cycle behind a green tick — private GraphQL endpoint
  changed. Being marked dormant rather than scraped harder.
- **VJH outreach crash:** `[outreach] ERROR <company>: 'str' object has no attribute 'get'`.
  Real, needs its own session.
- **~50 duplicate blog pages** still need canonical consolidation. **Canonical only —
  never delete.** 21 published pages contain the fabricated Redis stack; never
  canonicalise onto one of those.

## ✅ JUST LANDED (2026-08-29 → 30)

- **ai-native-builder.com wired into VJH** — the densest source in the fleet
  (72% career-gate pass vs ~21%). See `project_ai_native_builder_source` memory.
- **Three pipeline bugs fixed** (`36e985c`) after the source ran a full day producing
  *nothing*: jobs were marked "seen" before the processing cap (175 burned per cycle),
  priority was a group rather than a ranking (densest source starved), and the LLM judge
  believed Elena could not code (vetoed Python/TypeScript roles — her own languages).
- **Board-quality guards:** `board_hygiene.py`, `scripts/qualify_job_board.py`, and a
  weekly Telegram watch (`job-board-watch.sh`, Tue 06:00 Panama).
- **agentic-engineering-jobs.com REJECTED** — newest posting 33 days old, 91% past their
  own expiry. Do not wire it.
- **YC Work at a Startup: deliberately NOT scraped.** Its `/jobs` page IS public now, but
  YC's ToS forbids automated extraction. robots.txt allowing ≠ ToS permission.

## ⚠️ Standing traps

- **Never `git add -A`** in cto-aipa. Named files only.
- Oracle runs VJH under `venv/bin/python` — bare `python3` dies on `pydantic_settings`.
- Do **not** `source .env` — `FROM_EMAIL` contains spaces and angle brackets and makes it
  a syntax error. Read keys with `grep`/`cut`.
- After any deploy: `sudo systemctl restart vibejobhunter`, then prove it from
  `journalctl` — **and check the outcome, not just that the step ran.** A source that
  logs "197 jobs" every hour can still be delivering zero.
