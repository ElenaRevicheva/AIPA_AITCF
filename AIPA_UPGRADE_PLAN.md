# AIPA On-The-Go Upgrade Plan
# Claude Opus 4.6 analysis — March 20 2026

## Three new Telegram commands

### /status
- Runs pm2 list + systemctl is-active for each known service
- Returns clean phone-readable summary: name, status, uptime, memory
- Short enough to read on a phone screen

### /logs [agent]
- Parses agent argument via hardcoded registry
- PM2 agents: pm2 logs <name> --lines 50 --nostream
- systemd agents: journalctl -u <name> -n 50 --no-pager
- Feeds raw output to askAI() for plain language summary
- Sends AI summary not raw logs

### /restart [agent]
- Parses agent via hardcoded registry only — no raw shell input
- PM2: pm2 restart <name>
- systemd: sudo systemctl restart <name>
- Confirms success or failure

## Files that change
- src/telegram-bot.ts only
- Lines 2443-2495: /logs replacement
- Lines 6197-6276: command registration
- New /restart inserted after /logs

## Files that do NOT change
- src/cto-aipa.ts
- src/database.ts
- src/atuona-creative-ai.ts
- ecosystem.config.js
