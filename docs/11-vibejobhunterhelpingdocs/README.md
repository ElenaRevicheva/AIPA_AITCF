# Job Search & Application Workflow — Vibe Coder Guide

**For Elena · How both bots work, what's real, and where to see proof**

Last updated: February 2026

---

## TL;DR

You have **two Telegram bots** that work together:

| Bot | What it does | Proof it's real |
|-----|--------------|-----------------|
| **VibeJob Hunter** (@vibejob_hunter_bot) | **Volume engine** — discovers ~3000 jobs/hour, scores with AI, auto-applies to high-scoring roles, sends founder outreach, tracks follow-ups | SQLite DB, JSON logs, Greenhouse confirmation emails, Telegram notifications |
| **OpenClaw** (@OpenClaw_VibeJobsList) | **Focused list** — YC AI Assistant shortlist on demand, pitch help with your resume, LinkedIn-ready copy | Pipeline runs Python scripts, fetches from YC API, outputs include "Data fetched at: ..." timestamp |

Both run on **Oracle Cloud** (170.9.242.90). Nothing is hallucinated — every action writes to files or APIs.

---

## Table of Contents

1. [The Two Bots — Who Does What](#1-the-two-bots--who-does-what)
2. [VibeJob Hunter — Exact Actions & Proof](#2-vibejob-hunter--exact-actions--proof)
3. [OpenClaw — Exact Actions & Proof](#3-openclaw--exact-actions--proof)
4. [How They Work Together (Priority Companies)](#4-how-they-work-together-priority-companies)
5. [Where to See True Results](#5-where-to-see-true-results)
6. [Automated vs Manual — No Illusions](#6-automated-vs-manual--no-illusions)

---

## 1. The Two Bots — Who Does What

### VibeJob Hunter (Volume + Apply)

**Telegram:** [@vibejob_hunter_bot](https://t.me/vibejob_hunter_bot)

- **Discovers jobs** from 8+ sources (Greenhouse, Lever, Ashby, Dice MCP, YC, RemoteOK, HN, etc.)
- **Scores** each job 0–100 with Claude
- **Auto-applies** to jobs scoring ≥60 (fills Greenhouse forms, max 5/day)
- **Sends founder outreach** for jobs 58–59 (email via Resend, max 2/day; LinkedIn = you copy/paste)
- **Tracks applications** in SQLite
- **Sends Telegram notifications** for every application, outreach, and daily summary

### OpenClaw (Focused List + Pitch Help)

**Telegram:** OpenClaw_VibeJobsList

- **Job shortlist** — runs `yc_ai_assistant_ingest.py` + `shareable_output.py` → fetches from YC OSS API, filters LATAM/remote, scores, returns top 10
- **LinkedIn post** — formats top 5 companies for copy-paste
- **Pitch help** — uses your resume in context to draft pitches for specific companies
- **Voice** — you can ask via voice; transcribed and answered

### Key Difference

- **VibeJob Hunter** = automates **application volume** (scraping, scoring, form filling, outreach)
- **OpenClaw** = on-demand **curated list + advice** (no applications; it just helps you prepare)

---

## 2. VibeJob Hunter — Exact Actions & Proof

### Hourly Cycle (every 1 hour)

| Step | Action | Where the proof lives |
|------|--------|------------------------|
| 0 | Sync priority companies from YC export | `priority_companies` table in SQLite |
| 1 | Fetch jobs from ATS APIs (Greenhouse, Lever, Ashby, Workable) | `autonomous_data/seen_jobs.json` — job IDs added |
| 2 | Fetch from Dice MCP, HN, RemoteOK, YC, Wellfound, WWR, AI-Jobs | Same `seen_jobs.json` |
| 3 | Filter with career gate (keywords, salary, location, blocklist) | Jobs that pass go to scoring |
| 4 | Domain filter (penalize DevOps, QA, etc.) | Scores adjusted |
| 5 | Claude scores each job 0–100 | Score stored with job |
| 6 | Route: ≥60 → auto-apply; 58–59 → outreach; 55–57 → review | See routing in logs |
| 7 | Auto-apply: fill Greenhouse form, submit, handle email verify | `autonomous_data/submissions/submission_log.json` |
| 8 | Founder outreach: find email, generate message, send via Resend (or queue for LinkedIn) | `autonomous_data/outreach_log.jsonl`, `manual_outreach_queue.json` |
| 9 | Notify you via Telegram | Telegram message with company, role, link |

### Files That Prove Real Activity

| File | What it proves |
|------|----------------|
| `autonomous_data/vibejobhunter.db` | SQLite — applications, companies, priority list, warm intros |
| `autonomous_data/submissions/submission_log.json` | Every ATS submission (status: submitted, dry_run, failed) |
| `autonomous_data/seen_jobs.json` | Every job seen, first_seen, last_seen, status (applied/skip) |
| `autonomous_data/outreach_log.jsonl` | Every outreach message generated (company, message, status) |
| `autonomous_data/manual_outreach_queue.json` | LinkedIn messages waiting for you to send |
| `autonomous_data/ats_cache/*.json` | Recent jobs cache used for /today, /jobs |

### How to See Proof (Oracle Server)

```bash
# SSH to Oracle
ssh -i ~/.ssh/ssh-key-2026-01-07private.key ubuntu@170.9.242.90

# Go to VibeJob Hunter
cd /home/ubuntu/VibeJobHunterAIPA_AIMCF

# Count applications in DB
sqlite3 autonomous_data/vibejobhunter.db "SELECT COUNT(*) FROM applications;"

# See last 5 submissions
cat autonomous_data/submissions/submission_log.json | jq '.[-5:]'

# See outreach log (last 5 lines)
tail -5 autonomous_data/outreach_log.jsonl
```

### Telegram Commands That Show Real Data

- `/today` — Applications and outreach from today (reads `seen_jobs.json`, `submission_log.json`, `outreach_log.jsonl`)
- `/jobs` — Recent jobs from `ats_cache`
- `/outreach` — Pending LinkedIn messages from `manual_outreach_queue.json`
- `/stats` — Counts from seen jobs, outreach log
- `/priority list` — Companies in `priority_companies` table (synced from OpenClaw YC export)

---

## 3. OpenClaw — Exact Actions & Proof

### When You Say "Job Shortlist" or "/shortlist"

| Step | Action | Proof |
|------|--------|-------|
| 1 | OpenClaw runs: `cd /home/ubuntu/job-list-filter && ./run_shortlist.sh` | Shell command on Oracle |
| 2 | `yc_ai_assistant_ingest.py` fetches from `https://yc-oss.github.io/api/tags/ai-assistant.json` | HTTP request; cache-busting query param |
| 3 | Filters to Active, LATAM/remote, scores, writes `yc_ai_assistant_companies.json` | File on disk |
| 4 | Writes `yc_ai_assistant_meta.json` with `fetched_at` timestamp | File on disk |
| 5 | Writes `priority_companies_for_vibejob.json` for VibeJob sync | File on disk |
| 6 | `shareable_output.py` reads JSON, prints shortlist with "Data fetched at: YYYY-MM-DD HH:MM:SS UTC" | Timestamp in output = proof it ran |
| 7 | OpenClaw pastes the terminal output to you | You see the timestamp; if missing = agent didn't run the command |

### Files on Oracle (job-list-filter)

| File | What it proves |
|------|----------------|
| `/home/ubuntu/job-list-filter/yc_ai_assistant_companies.json` | Raw company list from YC API |
| `/home/ubuntu/job-list-filter/yc_ai_assistant_meta.json` | `fetched_at` timestamp |
| `/home/ubuntu/job-list-filter/priority_companies_for_vibejob.json` | Companies exported for VibeJob sync |

### How to Verify OpenClaw Ran Fresh

1. Ask OpenClaw for "job shortlist"
2. Check the reply — it **must** include a line like `Data fetched at: 2026-02-21 14:30:00 UTC`
3. If that line is missing, the agent returned from memory — not from running the pipeline

### Cron (Automatic)

Every 6 hours, a cron job runs the same pipeline:

```bash
0 */6 * * * cd /home/ubuntu/job-list-filter && ./run_shortlist.sh >> /var/log/joblist-pipeline.log 2>&1
```

So the YC export file is refreshed even without you asking. VibeJob Hunter syncs from it at the start of each hourly cycle.

---

## 4. How They Work Together (Priority Companies)

### Flow

1. **Cron** (every 6h) or **you** (say "job shortlist" in OpenClaw) → runs `run_shortlist.sh` → creates `priority_companies_for_vibejob.json`
2. **VibeJob Hunter** (every cycle) → at start of cycle, reads that file and syncs to `priority_companies` table
3. **Scoring** — jobs at priority companies get +15 score boost and can route to outreach at lower base score (≥50 if priority, else ≥58)
4. **You** — in VibeJob Hunter, tap "Priority Companies" or `/priority list` to see the list; tap "Sync YC" or "Refresh" for fresh data

### Proof

- `priority_companies` table in SQLite
- `/priority list` shows companies with source (yc, manual)
- `priority_companies_for_vibejob.json` on disk

---

## 5. Where to See True Results

### In Telegram (VibeJob Hunter)

| What you see | What it means |
|--------------|---------------|
| "Today: X/5 applications" | X applications submitted today (from `submission_log`) |
| "🤝 Outreach Ready: [Company]" | Message in `manual_outreach_queue.json` — you copy to LinkedIn |
| "✅ Applied: [Company] - [Role]" | Real Greenhouse submission (or dry_run if testing) |
| Daily digest at 3 PM Panama | Summary of applications, outreach, stats |

### On Oracle (SSH)

```bash
# Applications in DB
sqlite3 /home/ubuntu/VibeJobHunterAIPA_AIMCF/autonomous_data/vibejobhunter.db \
  "SELECT company, role, applied_date FROM applications ORDER BY applied_date DESC LIMIT 10;"

# Submissions log
cat /home/ubuntu/VibeJobHunterAIPA_AIMCF/autonomous_data/submissions/submission_log.json | jq '.[-3:]'

# When was YC data last fetched?
cat /home/ubuntu/job-list-filter/yc_ai_assistant_meta.json
```

### In Your Inbox

- **Greenhouse confirmations** — you get emails from companies when an application is submitted
- **Resend** — founder outreach emails go through Resend; you can check Resend dashboard for sends

---

## 6. Automated vs Manual — No Illusions

### Fully Automatic (No Hallucination)

| Action | Proof |
|--------|-------|
| Job discovery | `seen_jobs.json` grows; logs show fetch counts |
| AI scoring | Claude API calls; scores in routing logic |
| Auto-apply | `submission_log.json` has status; Greenhouse sends confirmation email |
| Founder email outreach | Resend API; `outreach_log.jsonl` has entry |
| Priority sync | `priority_companies` table; sync at cycle start |
| YC shortlist pipeline | Python scripts; JSON files; "Data fetched at" in output |

### Semi-Automatic (You Do One Step)

| Action | Why manual | Proof |
|--------|------------|-------|
| LinkedIn messages | LinkedIn has no API; automation = ban risk | Messages in `manual_outreach_queue.json`; you copy/paste to LinkedIn |

### What Is NOT Hallucinated

- **VibeJob Hunter** does not invent jobs or applications. Every application writes to `submission_log.json`. Every outreach writes to `outreach_log.jsonl`. The DB has real records.
- **OpenClaw** does not invent company lists. When it runs the pipeline, you get real YC API data. The "Data fetched at" timestamp proves execution.

### If Something Feels Off

1. **Same shortlist for days?** — Check if OpenClaw's reply has "Data fetched at". If not, the agent may be using memory. Say "job shortlist" again; the SKILL tells it to always execute.
2. **No applications?** — Check `ATS_DRY_RUN` (true = dry run only). Check `submission_log.json` for errors.
3. **Oracle down?** — Telegram goes silent. Check Oracle Cloud console; health-check cron restarts services every 5 min.

---

## Quick Reference: Both Bots

| Question | Answer |
|----------|--------|
| Where does job data come from? | ATS APIs (Greenhouse, Lever, etc.), Dice MCP, YC, RemoteOK, HN, etc. — all real APIs |
| Where are applications stored? | `autonomous_data/submissions/submission_log.json` + SQLite `applications` table |
| Where is outreach logged? | `autonomous_data/outreach_log.jsonl` |
| How do I know OpenClaw ran fresh? | Reply must include "Data fetched at: YYYY-MM-DD HH:MM:SS UTC" |
| Where does VibeJob run? | Oracle 170.9.242.90, systemd `vibejobhunter-web` |
| Where does OpenClaw run? | Same Oracle, systemd `openclaw-gateway` (user service) |

---

*Copy this doc to `aideazz-private-docs` at `docs/11-vibejobhunterhelpingdocs/` to keep it with your private docs.*
