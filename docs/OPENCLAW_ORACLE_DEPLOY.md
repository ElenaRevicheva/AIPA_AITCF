# OpenClaw Job-Shortlist Bot on Oracle Cloud

Run the OpenClaw gateway (Telegram **@OpenClaw_VibeJobsList_bot**) on the same Oracle instance as your other products so it stays up when your laptop is off.

**Server:** `170.9.242.90` (Ubuntu 24.04, user `ubuntu`) — same as CTO AIPA, EspaLuz, etc.

---

## 1. Prerequisites

- SSH: `ssh -i ~/.ssh/ssh-key-2026-01-07private.key ubuntu@170.9.242.90`
- Node.js 22+ (OpenClaw requirement). Check: `node -v`. If missing:  
  `curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs`
- Python 3 + pip (for job-list-filter). Check: `python3 --version`

---

## 2. Install OpenClaw on the server

**From your laptop**, copy the install script and run it on Oracle:

```powershell
scp -i $env:USERPROFILE\.ssh\ssh-key-2026-01-07private.key d:\aideazz\ai-cofounders\cto-aipa\scripts\openclaw-oracle-install.sh ubuntu@170.9.242.90:~/
```

**On the server** (SSH in):

```bash
chmod +x openclaw-oracle-install.sh
./openclaw-oracle-install.sh
```

This installs OpenClaw globally and creates `~/.openclaw` dirs.

---

## 3. Copy config and workspace from your laptop

On your **Windows laptop** (PowerShell), run from a folder where you have the paths below:

```powershell
$KEY = "$env:USERPROFILE\.ssh\ssh-key-2026-01-07private.key"
$SERVER = "ubuntu@170.9.242.90"

# Config
scp -i $KEY $env:USERPROFILE\.openclaw\openclaw.json ${SERVER}:~/.openclaw/

# Workspace (identity, user, resume, help, skills)
scp -i $KEY -r $env:USERPROFILE\.openclaw\workspace\* ${SERVER}:~/.openclaw/workspace/

# Auth (so you don't re-onboard)
scp -i $KEY -r $env:USERPROFILE\.openclaw\agents ${SERVER}:~/.openclaw/

# Env (ANTHROPIC_API_KEY, GROQ_API_KEY, gateway token)
scp -i $KEY $env:USERPROFILE\.openclaw\.env ${SERVER}:~/.openclaw/
```

**On the server:** Edit `~/.openclaw/.env` and add a **gateway token** (any strong string) if not present:

```
OPENCLAW_GATEWAY_TOKEN=your-secret-token-here
```

Use the same token in the systemd unit below.

---

## 4. Deploy job-list-filter on Oracle

**On the server:**

```bash
cd ~
# Clone or copy job-list-filter (adjust URL if private)
git clone https://github.com/YOUR_ORG/job-list-filter.git
# Or from laptop: scp -i KEY -r D:\aideazz\ai-cofounders\job-list-filter ubuntu@170.9.242.90:~/job-list-filter
cd job-list-filter
pip3 install -r requirements.txt
chmod +x run_shortlist.sh
./run_shortlist.sh
```

The skill uses path **`/home/ubuntu/job-list-filter`** on the server.

**Sync updates from Windows** (e.g. after fixing `run_shortlist.sh` line endings):

```powershell
& d:\aideazz\ai-cofounders\cto-aipa\scripts\sync_job_list_filter_to_oracle.ps1
```

---

## 5. Systemd service (always-on, restart on reboot)

**On the server**, create the user service:

```bash
mkdir -p ~/.config/systemd/user
nano ~/.config/systemd/user/openclaw-gateway.service
```

Paste (ensure `~/.openclaw/.env` contains `OPENCLAW_GATEWAY_TOKEN=...`):

```ini
[Unit]
Description=OpenClaw Gateway (job shortlist bot)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=/home/ubuntu/.openclaw/.env
ExecStart=/usr/bin/env openclaw gateway --port 18789 --token ${OPENCLAW_GATEWAY_TOKEN}
Restart=always
RestartSec=10
StartLimitIntervalSec=300
StartLimitBurst=10

[Install]
WantedBy=default.target
```

Enable and start:

```bash
systemctl --user daemon-reload
systemctl --user enable openclaw-gateway.service
systemctl --user start openclaw-gateway.service
systemctl --user status openclaw-gateway.service
```

Logs:

```bash
journalctl --user -u openclaw-gateway.service -f
```

---

## 6. Pair Telegram again (one-time)

The gateway on Oracle is new, so pairing is reset.

1. Message **@OpenClaw_VibeJobsList_bot** in Telegram (e.g. “Hi”).
2. Bot replies with a pairing code.
3. **On the server:** `openclaw pairing approve telegram YOUR_CODE`
4. After that, the bot replies from Oracle 24/7.

---

## 7. Optional: add to Oracle health-check

If you use `check_oracle_health.sh`, add a check for the OpenClaw gateway (e.g. process or port 18789) and restart the user service if unhealthy:

```bash
# Example: restart if process not running
if ! pgrep -f "openclaw gateway" > /dev/null; then
  systemctl --user start openclaw-gateway.service
fi
```

---

## Summary

| Step | What |
|------|------|
| 1 | Node 22 + run `openclaw-oracle-install.sh` on Oracle |
| 2 | Copy openclaw.json, workspace, agents, .env from laptop |
| 3 | Set OPENCLAW_GATEWAY_TOKEN in .env on server |
| 4 | Deploy job-list-filter to ~/job-list-filter, pip install, test run_shortlist.sh |
| 5 | Install systemd user unit, enable + start |
| 6 | Pair Telegram again from the server |
| 7 | (Optional) Add to health-check script |

After this, the bot runs on Oracle; you can switch off your laptop and still use shortlist and job-search chat in Telegram.
