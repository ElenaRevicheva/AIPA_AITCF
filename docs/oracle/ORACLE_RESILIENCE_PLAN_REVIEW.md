# Oracle resilience plan – CTO review (Feb 2026)

## What the current plan gets right

- **Server facts**: 12 GB RAM, IP 170.9.242.90, corrected vs old wrong IP – correct.
- **Risks**: Bot crashes, Oracle reclaiming “idle” instance, service not enabled after reboot – all real.
- **Restart settings**: `Restart=always`, `RestartSec=10`, `StartLimitIntervalSec=300`, `StartLimitBurst=10` – good and standard.
- **No MemoryMax**: With 12 GB RAM, capping the bot at 512M was unnecessary; dropping it is correct.
- **Health-check idea**: Cron that hits an HTTP endpoint and restarts if unhealthy – right approach.
- **Keep-alive idea**: Doing something periodically so the instance doesn’t look idle – direction is right.

---

## Critical fix: WatchdogSec

The plan adds:

```ini
WatchdogSec=300
```

**Problem:** With `WatchdogSec`, systemd expects the **application** to call `sd_notify(WATCHDOG=1)` at least every 300 seconds. If the app does not do that (EspaLuz and most Python/Node apps do not), systemd **kills the process** every 5 minutes and restarts it. So you get repeated “die then restart” every 5 minutes instead of stability.

**Recommendation:** **Remove `WatchdogSec=300`** from the service file unless you add proper watchdog support inside the bot (calling `sd_notify(WATCHDOG=1)` from code). For your stack, the health-check cron is enough to catch “hung but not crashed” cases.

---

## What the plan does not cover (all your products)

The plan only hardens **EspaLuz WhatsApp** (port 8081, `espaluz-whatsapp.service`). On the same Oracle instance you also run:

| Service              | How it runs | Port / note        |
|----------------------|------------|--------------------|
| CTO AIPA             | PM2        | 3000               |
| Atuona Creative AI   | PM2        | same process       |
| EspaLuz_Influencer   | systemd    | -                  |
| EspaLuz WhatsApp     | systemd    | 8081 (in the plan) |

So “products regularly die” can be any of these. Resilience should cover **all** of them.

**Recommendation:**

1. **PM2 (CTO AIPA + Atuona)**  
   - Ensure PM2 is started on boot: `pm2 startup` and `pm2 save`.  
   - Add a **health-check cron** that:
     - Hits `http://127.0.0.1:3000/` (or your health path).
     - If non-200 or timeout, run `pm2 restart cto-aipa` (or the app name you use).

2. **EspaLuz_Influencer (systemd)**  
   - Same pattern as the plan for EspaLuz WhatsApp:  
     - `Restart=always`, `RestartSec=10`, `StartLimitIntervalSec=300`, `StartLimitBurst=10`.  
     - **No** `WatchdogSec` unless the app sends watchdog pings.  
   - Optional: a small health-check script that curls the influencer’s health endpoint and `systemctl restart espaluz-influencer` if needed.

3. **EspaLuz WhatsApp**  
   - Keep the plan’s systemd hardening and health-check cron.  
   - Remove `WatchdogSec=300` as above.

---

## OCI keep-alive

The plan uses:

```bash
dd if=/dev/urandom bs=1M count=10 of=/dev/null
```

That creates some CPU/IO activity. Oracle’s exact “idle” definition is not public; this may help. A **slightly stronger** option is to also hit your own service from inside the box (e.g. `curl -s http://127.0.0.1:3000/ && curl -s http://127.0.0.1:8081/...`) so there is both compute and “service usage”. You can keep the current cron and add one curl-based keep-alive if you want extra safety.

---

## Summary

| Item                         | Verdict / action                                      |
|-----------------------------|--------------------------------------------------------|
| Server specs, IP, risks     | Correct                                                |
| Restart/StartLimit settings | Keep                                                   |
| **WatchdogSec=300**         | **Remove** (or implement sd_notify in the app first)  |
| Health check for 8081       | Keep; ensure it’s the right path for your webhook      |
| OCI keep-alive              | Keep; optional: add curl to local health endpoints     |
| Coverage                    | **Extend** to CTO AIPA (PM2), Atuona, EspaLuz_Influencer |

I can add a short “corrected” section to the original plan file with the WatchdogSec removal and a checklist for PM2 + other services if you want everything in one place.
