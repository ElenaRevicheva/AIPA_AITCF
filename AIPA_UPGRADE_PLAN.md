# AIPA On-The-Go Upgrade Plan
# Claude Opus 4.6 analysis — March 20 2026  
# **Implemented (safe / additive)** — March 21 2026

## Backup branch (rollback)

- **`backup/2026-03-21-pre-on-the-go-ops`** — snapshot immediately before ops features (includes atuona GitHub fallback + `ecosystem.config.js` dotenv).  
  Restore anytime: `git checkout backup/2026-03-21-pre-on-the-go-ops`

## What shipped (additive)

### `/status` (unchanged behavior)

- Still: ecosystem view (CMO health, recent GitHub repos, models blurb).
- **Added** a one-line hint pointing to `/hoststatus`, `/logs <agent>`, `/restart <agent>`.

### `/hoststatus` (new)

- Runs `pm2 jlist`, parses JSON → short phone-friendly lines (name, status, RAM, CPU).
- Does **not** replace `/status`.

### `/logs` (extended, backward compatible)

- **If** the message is exactly one allowlisted agent token (e.g. `/logs cto-aipa`, no newlines):  
  fetch via `pm2 logs <app> --lines 50 --nostream` (or `journalctl` for systemd entries when added to registry), then **`askAI()` summary**.
- **Else:** same as before — treat input as **pasted logs** and analyze (up to 4000 chars).

### `/restart` (new)

- Single allowlisted agent only; **no** free-form shell.
- PM2: `pm2 restart <app>`.
- systemd: `sudo -n systemctl restart <unit>` (fails clearly if NOPASSWD sudo is not configured).

### Allowlisted agents (aliases)

- `cto-aipa`, `dragon-main`, `dragon-dash`, `dragon-binance`, `dragon-bybit`  
- Extend only by editing `OPS_AGENT_ALIASES` in `src/telegram-bot.ts`.

## Files changed

- `src/telegram-bot.ts` — ops helpers, `/hoststatus`, extended `/logs`, `/restart`, menu + `setMyCommands`.

## Server prerequisites (not in repo)

- PM2 in `PATH` for the Node process (normal on your Oracle setup).
- For **systemd** restarts: sudoers **NOPASSWD** for the specific `systemctl restart` units you add to the registry.

## Original sketch (superseded where noted)

<details>
<summary>Earlier plan (for history)</summary>

- Originally suggested replacing `/status` with PM2 — **not done** (kept ecosystem `/status`).
- Originally suggested replacing `/logs` — **not done** (dual-mode instead).

</details>
