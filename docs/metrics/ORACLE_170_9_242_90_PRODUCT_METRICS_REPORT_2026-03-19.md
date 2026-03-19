# ORACLE 170.9.242.90 - Product Metrics Report (Verified Only)

**Extraction date (server-side):** 2026-03-19  
**Server:** `170.9.242.90` (user: `ubuntu`)  
**Rule:** every metric below is either computed from files/DB we can access on the server **or** explicitly marked `NOT FOUND` with what is missing.

---

## 1) EspaLuz (WhatsApp + Telegram Tutor)

### EspaLuz WhatsApp (`EspaLuzWhatsApp`)
| Metric | Value |
|---|---:|
| Total registered users (from `whatsapp_users.json`) | 1 |
| Monthly active users (>=1 message in last 30 days) | 0 |
| Total messages processed (all time; `total_messages` sum) | 2 |
| Active PayPal subscribers (from `subscribers.json`) | 5 |
| Active PayPal MRR | NOT FOUND — needs: MRR field in current `subscribers.json` export |
| Countries users are from (from `whatsapp_users.json` `countries`) | 0 |
| Uptime / restarts in last 30 days (systemd) | `NRestarts=0`; active since `2026-03-10 06:34:52 UTC` |

### EspaLuz Telegram Tutor (`EspaLuzFamilybot`)
| Metric | Value |
|---|---:|
| Total registered users (from `espaluz_analytics.json` `users`) | 4 |
| Monthly active users (from `espaluz_analytics.json` `daily_active` over last 30 days) | 1 |
| Total messages processed (all time; `total_messages` sum) | 65 |
| Active PayPal subscribers (from `telegram_subscribers.json`) | 3 |
| Active PayPal MRR | NOT FOUND — needs: MRR field in `telegram_subscribers.json` export |
| Countries users are from | 0 |
| Uptime / restarts in last 30 days (systemd) | `NRestarts=0`; active since `2026-03-10 06:34:52 UTC` |

---

## 2) CTO AIPA (Code Review Agent)

**Source:** Oracle table `aipa_memory` (`aipa_type='CTO'`, `action='code_review'`) on Oracle ATP.

| Metric | Value |
|---|---:|
| Total PRs reviewed | 18 |
| Total pushes reviewed | 7 |
| Total code-review events | 25 |
| Total repos connected (unique `context.repo`) | 3 |
| Average review response time | NOT FOUND — needs: per-review latency/duration fields (DB or logs) |
| Reviews used Claude vs Groq (from `metadata.model_used`) | Claude: 6, Groq: 19 |
| Model routing breakdown (top values found in `metadata.model_used`) | `llama-3.3-70b-versatile`: 13, `groq`: 6, `claude`: 3, `claude-opus-4-20250514`: 3 |

---

## 3) VibeJobHunter + CMO AIPA

**Source:** on-server `VibeJobHunterAIPA_AIMCF/autonomous_data/`

| Metric | Value |
|---|---:|
| Total jobs discovered (`seen_jobs.json`) | 1983 |
| Total applications sent (auto-applied) | NOT FOUND — needs: explicit “auto-applied success count” field/log in job records |
| Applications artifacts generated (count of files in `autonomous_data/applications/`) | 253 |
| Submissions artifacts generated (count of files in `autonomous_data/submissions/`) | 1 |
| Total outreach messages generated (`manual_outreach_queue.json` length) | 148 |
| Total outreach messages actually sent/completed (`outreach_log.jsonl` where `status==sent`) | 148 |
| LinkedIn posts published | NOT FOUND — needs: CMO posting logs / Make.com exports located on Oracle |
| Instagram posts published | NOT FOUND — needs: CMO posting logs / Make.com exports located on Oracle |

---

## 4) ALGOM Alpha (DragonTrade)

NOT FOUND — needs:
- On-Oracle posting logs/state for X (`@reviceva`) and any engagement analytics (likes/replies/impressions).
- Located under `/home/ubuntu/dragontrade-agent/` but posting/engagement files were not identified yet.

---

## 5) Atuona Creative AI

NOT FOUND — needs:
- On-Oracle creative generation + publishing logs/state (images/videos/text counts).
- On-Oracle blockchain/NFT mint completion record(s) (file or DB table).

---

## 6) Infrastructure (Oracle Cloud `170.9.242.90`)

**Sources:**
- PM2: `pm2 list --no-color`
- systemd: `systemctl show <service> -p NRestarts -p ActiveEnterTimestamp`

| Service | Current CPU/Mem (from PM2/systemd) | Crash-restarts last 30/90d | Uptime last 30/90d |
|---|---:|---:|---:|
| `cto-aipa` (PM2 cluster) | online; uptime: 46m; mem: 152.2mb | NOT FOUND — needs: PM2 restart history scan/log parse for last 30d | NOT FOUND |
| `dragontrade-main` (PM2) | online; uptime: 4m; mem: 161.0mb | NOT FOUND — needs: PM2 restart history scan/log parse | NOT FOUND |
| `dragontrade-dashboard` (PM2) | online; uptime: 4m; mem: 66.2mb | NOT FOUND — needs: PM2 restart history scan/log parse | NOT FOUND |
| `espaluz-whatsapp` (systemd) | active since `2026-03-10 06:34:52 UTC`; `NRestarts=0` | 0 (verifiable for the period since ActiveEnterTimestamp) | NOT FOUND (needs log-based uptime calc) |
| `espaluz-familybot` (systemd) | active since `2026-03-10 06:34:52 UTC`; `NRestarts=0` | 0 (verifiable for the period since ActiveEnterTimestamp) | NOT FOUND (needs log-based uptime calc) |

---

## 7) Cost Data

NOT FOUND — needs:
- Monthly API spend exports on Oracle (OpenAI/Claude/Groq/Replicate/Luma).
- Monthly infra cost exports for Oracle/Railway/Supabase/domains.
- Cost-per-user computation inputs (user count history and spend history in the same period).

