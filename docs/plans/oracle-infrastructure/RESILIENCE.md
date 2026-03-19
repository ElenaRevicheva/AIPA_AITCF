# Oracle Instance Resilience — Fix Bots Dying Silently

All 8 AI agents on `170.9.242.90` can silently die. This plan fixes that with restart hardening, health-check cron, and OCI keep-alive.

---

## Root causes we address

1. **Process crashes** — systemd/PM2 not restarting (or start limit hit).
2. **Process hangs** — process up but not responding (health check detects and restarts).
3. **Oracle reclaiming instance** — free-tier “idle” reclamation (keep-alive).
4. **Not starting after reboot** — services not enabled (ensure `enable` + PM2 startup).

---

## 1. Systemd services (EspaLuz WhatsApp, Telegram, Influencer; any other systemd bots)

Apply to **every** systemd-run bot:

- **Restart:** `Restart=always`, `RestartSec=10`, `StartLimitIntervalSec=300`, `StartLimitBurst=10`.
- **Do not add** `WatchdogSec` unless the app calls `sd_notify(WATCHDOG=1)` from code.

```ini
[Service]
Restart=always
RestartSec=10
StartLimitIntervalSec=300
StartLimitBurst=10
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable espaluz-whatsapp espaluz-influencer   # and any other systemd bots
sudo systemctl restart <service>
```

---

## 2. PM2 (CTO AIPA + Atuona; VibeJob/CMO, Algom Alpha if run with PM2)

- Run **`pm2 startup`** and apply the command it prints, then **`pm2 save`**.
- Use an ecosystem file with `autorestart: true` (default) for each app.
- The health-check cron will restart if HTTP check fails (or process not online).

---

## 3. Health-check script (all 8 agents)

Single script checks every agent and restarts only the unhealthy ones. Run from cron every **5 minutes**.

- **Path on server:** `/home/ubuntu/check_oracle_health.sh`
- **Source (copy from):** [AIPA_AITCF](https://github.com/ElenaRevicheva/AIPA_AITCF) repo, `scripts/oracle-resilience/check_oracle_health.sh`
- **Cron:** `*/5 * * * * /home/ubuntu/check_oracle_health.sh`

The script includes blocks for all 8 agents; uncomment and set ports/service names for agents 2, 4, 5+6 once confirmed on the server.

---

## 4. OCI keep-alive (prevent instance reclamation)

- **Path on server:** `/home/ubuntu/oci_keepalive.sh`
- **Source:** AIPA_AITCF repo, `scripts/oracle-resilience/oci_keepalive.sh`
- **Cron:** `0 */4 * * * /home/ubuntu/oci_keepalive.sh`

Does light CPU/IO and curls your services so the instance doesn’t look idle to Oracle.

---

## 5. Deployment checklist (one-pass on server)

Do once over SSH:

- [ ] **Systemd** — For every systemd bot: add restart settings above, no `WatchdogSec`. Then `daemon-reload`, `enable`, restart.
- [ ] **PM2** — `pm2 startup` (apply printed command), `pm2 save`.
- [ ] **Health script** — Copy `check_oracle_health.sh` to `/home/ubuntu/`, `chmod +x`, add cron `*/5 * * * * /home/ubuntu/check_oracle_health.sh`.
- [ ] **Keep-alive** — Copy `oci_keepalive.sh` to `/home/ubuntu/`, `chmod +x`, add cron `0 */4 * * * /home/ubuntu/oci_keepalive.sh`.
- [ ] **Verify** — `systemctl status <services>`, `pm2 list`, then `tail -50 /var/log/oracle-health.log` after 5 minutes.

---

## When you add or change agents

- Update the [All 8 AI Agents](./OVERVIEW.md#all-8-ai-agents-on-oracle) table in OVERVIEW.md with exact service names and health URLs.
- In `check_oracle_health.sh`: add or uncomment a block (curl health URL → restart if non-200, or `systemctl`/`pm2` restart).
- In `oci_keepalive.sh`: add a `curl` to that agent’s health URL.

---

## References

- **Full resilience doc and script contents:** [AIPA_AITCF](https://github.com/ElenaRevicheva/AIPA_AITCF), `docs/oracle/ORACLE_ALL_PRODUCTS_RESILIENCE.md`
- **Scripts:** AIPA_AITCF, `scripts/oracle-resilience/`
- **WatchdogSec warning:** AIPA_AITCF, `docs/oracle/ORACLE_RESILIENCE_PLAN_REVIEW.md`
