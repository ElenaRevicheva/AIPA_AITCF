---
name: Oracle Instance Resilience
overview: Ensure the EspaLuz WhatsApp bot automatically recovers from crashes and reboots, and prevent Oracle from reclaiming the free-tier instance.
todos:
  - id: harden-service
    content: Update espaluz-whatsapp.service with restart hardening (no WatchdogSec)
    status: pending
  - id: health-check
    content: Deploy health-check cron script that auto-restarts bot if unhealthy
    status: pending
  - id: oci-keepalive
    content: Deploy OCI keep-alive cron to prevent free-tier instance reclamation
    status: pending
isProject: false
---

# Oracle Instance Resilience Plan (Corrected Feb 11 2026)

## Server Reality


| Spec        | Value                                      |
| ----------- | ------------------------------------------ |
| Instance    | instance-20260107-1316                     |
| Shape       | VM.Standard.E5.Flex                        |
| OCPUs       | 1                                          |
| RAM         | 12 GB                                      |
| Public IP   | 170.9.242.90                               |
| SSH user    | ubuntu                                     |
| SSH key     | ~/.ssh/ssh-key-2026-01-07private.key       |
| Region      | us-chicago-1                               |
| Compartment | aideazz (root)                             |
| OS          | Canonical Ubuntu 24.04                     |
| Disk        | Block storage only (size from boot volume) |
| Swap        | None (not needed with 12 GB RAM)           |


## All AI Products (AIdeazz ecosystem)


| #   | Product                      | Repo                             | Description                                                               | Stack      | Hosting                                          |
| --- | ---------------------------- | -------------------------------- | ------------------------------------------------------------------------- | ---------- | ------------------------------------------------ |
| 1   | **CTO AIPA**                 | AIPA_AITCF (Private)             | AI Technical Co-Founder — code review, Ask CTO, Telegram, GitHub webhooks | TypeScript | Oracle 170.9.242.90 (PM2)                        |
| 2   | **Atuona Creative AI**       | AIPA_AITCF (same repo)           | AI Creative Co-Founder — book writing, /create, /publish, AI film         | TypeScript | Oracle 170.9.242.90 (PM2, with CTO AIPA)         |
| 3   | **EspaLuz WhatsApp**         | EspaLuzWhatsApp (Private)        | AI Spanish/English tutor on WhatsApp, emotional memory, subscriptions     | Python     | Oracle 170.9.242.90 (systemd) or migration queue |
| 4   | **EspaLuz Familybot**        | EspaLuzFamilybot (Private)       | Family-focused version of EspaLuz (Telegram)                              | Python     | Oracle (migration queue) or planned              |
| 5   | **EspaLuz Influencer**       | EspaLuz_Influencer (Public)      | Marketing/Influencer component for EspaLuz                                | Python     | Oracle 170.9.242.90 (systemd)                    |
| 6   | **VibeJobHunter + CMO AIPA** | VibeJobHunterAIPA_AIMCF (Public) | Autonomous job hunting + AI Marketing Co-Founder for LinkedIn             | Python     | Railway (or Oracle when migrated)                |
| 7   | **DragonTrade Agent**        | dragontrade-agent (Public)       | Web3 trading assistant                                                    | JavaScript | Not on Oracle in current migration status        |


Resilience (restart hardening, health-check cron, keep-alive) applies to every product **running on Oracle** (1–5 when deployed there). VibeJobHunter/CMO and DragonTrade may be on other hosts; ensure PM2 startup + health checks wherever they run.

## Previous Misdiagnosis (corrected)

The earlier version of this plan incorrectly assumed:

- "1-4 GB RAM causing OOM freezes" -- WRONG. The instance has 12 GB RAM.
- "SSH timeouts = instance frozen from memory exhaustion" -- WRONG. We were SSHing to the wrong IP address (129.153.113.101 instead of 170.9.242.90).
- "Add 2 GB swap to prevent OOM" -- UNNECESSARY. With 12 GB RAM and ~1.6 GB used, OOM is not a risk.
- "MemoryMax=512M for the bot" -- TOO AGGRESSIVE. The bot uses ~92 MB and the server has plenty of headroom.

## Actual Risks

1. **Bot process crashes** and systemd fails to restart it (e.g., start limit reached)
2. **Oracle reclaims the instance** for appearing idle (free-tier policy)
3. **Service disabled after reboot** (happened once before -- fixed with `systemctl enable`)

## Solution: 3 Changes

### 1. Harden the systemd service

Ensure robust restart behavior without unnecessarily tight memory limits:

```ini
[Service]
Restart=always
RestartSec=10
StartLimitIntervalSec=300
StartLimitBurst=10
```

**Do NOT add `WatchdogSec=300`** unless the app calls `sd_notify(WATCHDOG=1)` from code. Without that, systemd would kill the process every 5 minutes. (See `docs/ORACLE_RESILIENCE_PLAN_REVIEW.md`.)

No `MemoryMax` needed -- 12 GB is more than sufficient for all services combined.

### 2. Health-check cron script

Auto-restart the bot if the webhook endpoint stops responding (checks every 5 minutes):

```bash
# /home/ubuntu/check_espaluz_health.sh
#!/bin/bash
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://127.0.0.1:8081/webhook)
if [ "$HTTP_CODE" != "200" ]; then
    echo "$(date): EspaLuz unhealthy (HTTP $HTTP_CODE), restarting..." >> /var/log/espaluz-health.log
    sudo systemctl restart espaluz-whatsapp
fi
```

Crontab: `*/5 * * * * /home/ubuntu/check_espaluz_health.sh`

### 3. OCI Keep-Alive (prevents Oracle from reclaiming idle instances)

Oracle Cloud reclaims free-tier instances that appear idle. A lightweight cron job every few hours prevents this:

```bash
# /home/ubuntu/oci_keepalive.sh
#!/bin/bash
dd if=/dev/urandom bs=1M count=10 of=/dev/null 2>/dev/null
echo "$(date): keepalive ping" >> /var/log/oci-keepalive.log
```

Crontab: `0 */4 * * * /home/ubuntu/oci_keepalive.sh`

## What This Solves

- **Service hardening**: Bot auto-restarts on any crash, up to 10 times per 5 minutes
- **Health check**: If the bot hangs without crashing, it's detected and restarted within 5 minutes
- **Keep-alive**: Oracle won't reclaim the instance for being "idle"
- **Combined**: You should rarely need to manually reboot

## This plan covers only EspaLuz WhatsApp

**For a single fix for all bots on Oracle**, use the unified doc and scripts:

- `**docs/ORACLE_ALL_PRODUCTS_RESILIENCE.md`** — All products on 170.9.242.90, health endpoints, one health-check script, keep-alive, and deployment checklist.
- `**scripts/oracle-resilience/`** — `check_oracle_health.sh` and `oci_keepalive.sh` to deploy on the server.

Note: Full product list and infra may also live in [aideazz-private-docs / docs/plans/oracle-infrastructure](https://github.com/ElenaRevicheva/aideazz-private-docs/tree/docs/docs/plans/oracle-infrastructure); not all products may be listed there. The resilience doc in this repo is the source of truth for what runs on Oracle and how to harden it.

Other products on the same instance (CTO AIPA, Atuona, EspaLuz_Influencer) need the same ideas: restart hardening, health-check cron, and PM2 startup on boot. See `docs/ORACLE_RESILIENCE_PLAN_REVIEW.md` for full CTO review and what to add for each service.

## SSH Quick Reference

```powershell
& "C:\Windows\System32\OpenSSH\ssh.exe" -i "$env:USERPROFILE\.ssh\ssh-key-2026-01-07private.key" ubuntu@170.9.242.90
```

