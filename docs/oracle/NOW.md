# NOW — the shared session between Cursor and Claude Code

**Cursor Cloud, Cursor Desktop and Claude Code all work this repo and none of them can
see each other's chats.** No shared conversation, no Claude MCP in Cursor, no way to send
the other agent a message. The only things all of them read are **HubSpot** and **this
file**.

So this file is not documentation. It is the working memory of whichever agent is not
currently running, and the protocol below is how two agents that cannot talk avoid
destroying each other's work.

---

# PART 1 — THE PROTOCOL

## 1. The session board — claim before you touch

There is no file locking. This table is the substitute, and it works only because both
agents keep it honest.

| Agent | Claimed (UTC) | Working on | Touching (files / services) | Last commit |
|---|---|---|---|---|
| Cursor Cloud | 2026-08-31 19:20 | Fermatix [LICENSE] HubSpot deal + click-to-send letter | `stage-hiring-outreach.cjs`, `.hire-trigger`, Oracle HubSpot write, `docs/selling/drafts/fermatix*` | 54cc941 |

**Rules**
- **Before editing shared code or restarting a service, add your row.** Commit and push
  that row *first*, before the work. It costs one commit and prevents the whole class.
- **Delete your row when you stop.** A finished agent leaves no claim.
- **A claim older than 2 hours with no newer commit from that agent is dead — take it.**
  Sessions crash and browsers close; a permanent lock is worse than no lock.
- **If a row is live and you need those files: work somewhere else.** Do not "just be
  careful". Add a line under HANDOFF saying what you wanted, and move on.

## 2. Everything lands on `main`

**Earned 30 Aug 2026.** NOW.md was created 25 Aug on branch
`cursor/intelliops-bd-money-play-abc0` and never merged. From `main` — what Claude Code
reads and Oracle runs — it did not exist, so a second copy was written five days later.
Both agents were right about their own branch and neither could see the other.

**A shared-state file on a branch the other tool never reads is a private note.**

If your work must live on a branch, the NOW.md update still goes to `main` on its own,
naming the branch and what is on it.

## 3. Never destroy — the collision rules

- **Never `git push --force`.** Ever, on any shared branch.
- **Never `git reset`/`git checkout --` a file you did not write this session.**
- **Same file, both changed → merge, do not overwrite.** When two versions conflict, the
  one with a *verification* attached wins; if neither has one, keep both and reconcile.
- **Never blind `git pull` on Oracle's `cto-aipa`** — it deploys by `scp` of named files
  plus `pm2 restart`, so its checkout is *meant* to lag `main`. Pulling is how a running
  process and its disk start disagreeing. (`VibeJobHunterAIPA_AIMCF` and `aideazz` are the
  opposite: they deploy by git and are held exactly at `origin/main`.)
- **One deployer at a time.** Before restarting a service, check its uptime. If it
  restarted in the last 10 minutes, someone is mid-deploy — wait.

## 4. Catch the other's fall — run this at session start

Every item below is a real failure that shipped. Two minutes, before any new work.

1. **Read this file, then `git log --oneline -15`.** Anything from the other agent you did
   not expect? Any work sitting on a branch?
2. **Did the last deploy actually take?** Process start time must be *newer* than the file
   it loads:
   `systemctl show vibejobhunter -p ActiveEnterTimestamp` vs `stat -c %y <file>`
3. **Did the last change produce OUTPUT, not just run?** This is the one that bites.
   A source logged "197 jobs" hourly for a full day and delivered zero. Grep the *result*
   line, never the *ran* line.
4. **Is any claim on the board stale?** Older than 2h with no commit → release it.
5. **Check the DELIBERATE list below before "fixing" anything that looks broken.**

## 5. How to pause — the handoff block

When you stop mid-task, replace the HANDOFF section with exactly these four lines. An
agent that pauses without one has lost the work, even if the code is committed.

- **DONE:** what is finished *and verified*, with the evidence
- **NEXT:** the single next action, concretely enough to start cold
- **VERIFIED BY:** the command or log line that proves the DONE claim
- **RISK:** what will break or mislead if the next agent assumes wrongly

## 6. 🚫 DELIBERATE — these look broken and are not. Do not "fix" them.

| Thing | Why it is like that |
|---|---|
| **Wellfound returns 0 / dormant** | Its private GraphQL API changed. Not scraped harder on purpose — re-guessing a private endpoint every release is a treadmill, not a source. |
| **YC Work at a Startup not scraped** | Its `/jobs` page *is* public and easy to parse. YC's ToS forbids automated extraction. robots.txt allowing ≠ ToS permission. |
| **agentic-engineering-jobs.com not wired** | Newest posting 33 days old, 91% past its own expiry. Rejected on measurement. |
| **Oracle `cto-aipa` behind `main`** | Deploys by named-file `scp`, not `git pull`. See rule 3. |
| **`test_provider_chain[claude]` fails** | Anthropic credits are at zero. The eval is *correctly* reporting it. |
| **AI-Jobs.net / BrightData LinkedIn dormant** | Measured lifetime yield ~0. Env flags exist to wake them. |

## 7. What belongs in this file

The queue and whose move it is · what is open or known-broken · what is stranded on a
branch · standing traps · what just landed, briefly.

**Not** here: architecture, post-mortems, anything already in `docs/`, the memory files or
the AI Ops Wiki. Link to those. **Keep it to one screen per part** — delete finished lines;
git log keeps the record.

---

# PART 2 — CURRENT STATE

## 🤝 HANDOFF

- **DONE:** Zapier Sr TAM application submitted (1 Sep 06:12 EST) — all five free-text
  answers drafted, resume attached. Self-learning loop **verified end-to-end**: her note
  "i have just manually submitted" was parsed, and the role is now a learned positive in
  `judge_feedback.json`. Screenshot reading confirmed live — 5 of 12 negatives this run
  came from images she attached, not text.
- **NEXT:** Rwazi Loom recording. Then Plata / Behram / WaaS from the queue.
- **VERIFIED BY:** `ZAPIER in positives: ['Sr. Technical Account Manager @ Zapier @ Zapier']`
  after running `scripts/judge_feedback_sync.py`; sync log `inspected 14, confirmed
  applied-by-Elena 12`.
- **RISK:** the Zapier deal has **Contacts (0)** and no owner. The response detector matches
  replies to people; with no contact linked, a recruiter reply may land in Gmail and not
  attach to this deal. This is the shape of the Aug 23-24 miss — watch it.

## 💰 MONEY QUEUE

| # | Thing | State | Whose move |
|---|---|---|---|
| 1 | **Zapier — Sr. Technical Account Manager** ($55–82.6K + bonus, remote South America, **PST hours**) | ✅ **SUBMITTED 1 Sep 06:12 EST.** VJH surfaced it 09:04 UTC, she applied within 3h. Deal `⏳ Sent`. Judge has learned it as a positive | **Waiting on them.** ⚠️ Deal has **Contacts (0)** — no person linked, so a recruiter reply may not auto-match. Add the recruiter contact if one writes |
| 2 | **Rwazi — AI Engineer, Marketing & GTM Systems** (contractor, 25–40h) | ✅ Applied — registered as a learned positive | **Elena: record the Loom** — they said "links or Looms beat resumes" |
| 3 | **Plata — Automation Stream Lead** | Cover letter written | Elena: send |
| 4 | **Behram / AI Native Builder — LinkedIn comment** | Drafted, numbers verified | Elena: paste |
| 5 | **Work at a Startup profile** | Every field paste-ready | Elena: create the account — agent cannot (credential boundary) |
| 6 | **James Onyemu (MONARCH / Delta State hotel)** | Reply drafted: paid-only, redirect to the hotel's AI-discoverability | Elena: send if she wants it |

Drafts in `docs/applications/`. Resume: `29.08.26_EN_Resume_Elena Revicheva.{docx,pdf}`.

## 🔗 Carried from Cursor's 25 Aug version — verify still live before tapping

| Lane | Deal | Tap (full URL) |
| --- | --- | --- |
| Overlay commission (not a job) | IntelliOps BD | https://webhook.aideazz.xyz/cto/go/outreach-email/intelliops-bd |
| Job follow-up (applied on Torre) | BSS Groupe | https://webhook.aideazz.xyz/cto/go/outreach-email/ai-native-b2b-marketplace |

BSS confirm page must show **Hire me**, **Adjunto: Elena_Revicheva_Resume.pdf**, and
`https://aideazz.xyz/portfolio` twice. If HubSpot opens **Edit link**, paste the full URL.

- IntelliOps deal `.../record/0-3/64302436100` — **do not countersign v2**
- BSS deal `.../record/0-3/64302126655` — To: `contact@bssgroupe.com`
- Catch-up: `docs/oracle/HANDOFF_2026-08-25_INTELLIOPS_BSS.md`

## 🌿 Stranded on the Cursor branch — do not lose, do not reset

`cursor/intelliops-bd-money-play-abc0`, last commit 25 Aug. Only there:
`scripts/hs-email-link-deal.cjs`, `hs-fix-send-buttons.cjs`, `hs-intelliops-story.cjs`,
`hs-note-intelliops-eval.cjs`, `intelliops-imap-pull.py`, `oracle-hs-note-intelliops.sh`.
⚠️ The branch is also **behind** `main` on many files — a naive merge would delete current
work. Port what you want by hand; never reset.

## 🔴 OPEN — do not assume these work

- **Anthropic credits at zero** since 17 Aug. The 5-provider chain absorbs it; nothing is
  down. Elena tops up, or leave it on OpenAI.
- **VJH outreach crash:** `[outreach] ERROR <company>: 'str' object has no attribute 'get'`
  — real, in the founder-email path, needs its own session.
- **~50 duplicate blog pages** need canonical consolidation. **Canonical only — never
  delete.** 21 pages carry the fabricated Redis stack; never canonicalise onto one.
- No Claude MCP in Cursor. Gmail MCP in Cursor needs auth. HubSpot from Cursor cloud
  agents routes through Oracle (no `api.hubapi.com` egress).

## ✅ JUST LANDED (29–31 Aug)

- **🆕 Elena's own CRM is live: `webhook.aideazz.xyz/queue/`** (`2eff542`, 31 Aug).
  Two cards — an employer to apply to and a client to contact — each with the draft
  already written and one button. Reads table `daily_queue` in **our Oracle DB, not
  HubSpot**: her states (`new/working/done/skipped`), because HubSpot has no urgency
  field and VJH's real states were being stuffed into sales stages that mean something
  else (`lead_parked` → `appointmentscheduled`). **The page makes ZERO HubSpot calls —
  not even a read.** `hubspot_deal_id` is a deep-link only. Behind the same basic auth
  as `/ops/`; **`/cto/` stays public on purpose** (one-click outreach links are opened
  from email clients that cannot authenticate) — do not "secure" it.
  **Client lane is empty: its feeder is not wired yet — that is the next increment,
  not a bug.** Seeded with 10 live roles, 9 tailored.
- **ai-native-builder.com wired into VJH** — densest source in the fleet, 72% gate pass
  vs ~21%. Memory: `project_ai_native_builder_source`.
- **Three pipeline bugs fixed** (`36e985c`) after that source ran a full day producing
  nothing: dedup ledger stamped before the cap (175 jobs burned per cycle), priority was a
  group not a ranking, and the judge believed Elena does not hand-code.
- **Board-quality guards:** `board_hygiene.py`, `scripts/qualify_job_board.py`, weekly
  Telegram watch (Tue 06:00 Panama).
- **Wiki incident published** `2026-08-30-marked-done-before-anyone-read-them`, `blog: yes`.
- **Hiring Notes now carry a REAL cover letter** (`0eeda5f`, live 31 Aug). Was the same
  three sentences for all 185 jobs with `[Edit this stub…]` left in the body. Now drafted
  against the actual posting via `src/cover-letter.ts`, wired at the single funnel point
  `buildHiringActionPackage` — so serpapi_jobs, vjh_review and response_detector all get
  it without touching the Python side. **The stub is the floor:** any failure keeps the
  old stub and the Note says *why* it is boilerplate. Prefers Greenhouse/Ashby **public
  JSON APIs** over scraping (Ashby's HTML yields ~33 chars). Coverage measured:
  Greenhouse/Ashby/Wellfound/Torre tailor; weworkremotely 403s the honest UA → stub.
  **Do not fix that with a spoofed UA.** VJH's Python `ContentGeneratorV2` is still dead
  code (0 callers, 0 files) — left alone deliberately, not missed.
- **`/opspw` — ops dashboard lock resettable from Telegram** (`2faf9a7`). The `/ops/`
  password was lost; a bcrypt hash cannot be recovered, only replaced. Helper
  `scripts/oracle-resilience/set-opspw-stdin.sh` → Oracle `/home/ubuntu/`, mode 700.
  Backs up, writes bcrypt, verifies the LIVE endpoint two ways (new password 200 **and**
  anonymous still 401), auto-rolls-back on either failure. Done in prod: 44→67 bytes,
  hash now `$2y$`, rollback did not fire. **Username is hardcoded** — it cannot mint
  accounts. Whoever holds the Telegram account can reset that lock; that is the accepted
  trade for phone-only access, not an oversight.

## 🏥 Family / Cita — automated 1 Sep 2026

- **`/cita` in Telegram** turns an IENDI clinic block into Trello cards: right
  `Kira <Mes> <Año>` board, Cita column, **red = FAMILY**, Panama→UTC due dates,
  column re-sorted. Takes a paste, a forwarded message, or a **voice note**.
  Idempotent on name+due — re-sending changes nothing. `/citasort` re-sorts on demand.
- **Nightly cron 05:30 UTC** (`scripts/sort-cita-lists.cjs`) keeps every Kira Cita
  column in date order. It writes **only `pos`** — never content, dates, labels or
  list — so it is safe against boards Elena edits by hand.
- ⚠️ **Do not route this through `trello-voice.ts`.** Its `BOARD_KEYWORDS.kira_current_month`
  is hardcoded to `mayo/junio/julio 2026` and is blind to September onward. `iendi-cita.ts`
  resolves boards dynamically from the appointment's month. **That stale map is still
  live for the other voice→Trello flows and is worth fixing separately.**

## ⚠️ Standing traps

- **Never `git add -A`** in cto-aipa. Named files only.
- **Claude Code `Auto` mode blocks all credential-store work** — reading `.htpasswd`,
  grepping `auth_basic`, and *editing your own permission list*. That last refusal is
  deliberate: an agent cannot self-approve escalation. Do not try to slip it past by
  renaming files or burying the logic in a compiled bundle. Ask Elena to switch the mode
  selector (bottom-left) from `Auto` to `Manual` — every blocked command then succeeds on
  the first try. Not `Bypass permissions`; that disarms everything session-wide.
- Oracle runs VJH under `venv/bin/python` — bare `python3` dies on `pydantic_settings`.
- Do **not** `source .env` — `FROM_EMAIL` has spaces and angle brackets; syntax error.
  Read keys with `grep`/`cut`.
- After any deploy: restart, prove it from `journalctl`, **and check the OUTCOME.**
- **hud.io ≠ hud.ai ≠ DataVendor API.** Cursor `Hud: Sign In` is a plugin.
  The licence buyer is DataVendor (`datavendor.ai`). Their estimator:
  **public = $0**. REST/MCP is evals, not the quote. Do not add
  `openclaw-vibejob-shortlist` (MIT), `ascent-saas-builder` (Lovable),
  or `atlas-shifted` (still public) to the Ready 8-pack. Packet:
  `docs/selling/HUD_VENDOR_LICENSE.md` on `cursor/hud-vendor-license-1c49`.
- **No fourth Lazarus.** Codebase buyers that quote: Lazarus, Atrium
  (AfterQuery), HUD. Lazarus: solo / no team+P&L. Atrium **25 Aug**:
  round closed (volume), not quality; they do not keep the trees. HUD
  saw them already private tonight. Flip ≠ never-public. Hashseatic is
  not a quote. Next dollars: HUD number, AfterQuery click follow-up, jobs.
- **HUD lookalikes searched 31 Aug.** Still not a fourth quote: Hashseatic
  / gitbuyer (you find the lab), FileYield / ThenAI / DataFactor (not
  this SKU). TrainPlex.in = Indic mill, lower bar, excludes “fully
  AI-generated” — metadata only, read paper, no GitHub tonight.
  Fermatix (`hi@fermatix.ai`) sources private repos for royalties —
  inbound later, refuse exclusive. Mercor/Surge/Scale = hours, not the
  8-pack. Fleet/Chakra/Mechanize/Sharpe build gyms; they do not list
  her GitHub.
