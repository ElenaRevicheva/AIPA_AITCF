# DragonTrade Bot “Silent Death” on Oracle — Diagnosis and Fix

**Date:** Feb 15, 2026  
**Symptom:** Twitter bot made no posts for 2 days; appears to “silently die”.  
**Server:** Oracle 170.9.242.90, PM2 `dragontrade-main` (and related apps).

---

## What Was Actually Happening

The bot was **not** staying dead. It was **crash-looping**:

- **519 restarts** and only **~2 minutes uptime** at check time.
- PM2 kept restarting it; each run crashed again before posting.
- Logs showed: Twitter **429 rate limit** plus **CoinGecko MCP (mcp-remote) fatal errors** (HTTP 500, SSE “Already connected to a transport”, `SseError`). When the MCP subprocess died, unhandled errors could take down the main process.

So the process was “dying” repeatedly; from the outside it looked like “no posts for 2 days” because no run lived long enough to succeed.

---

## Root Causes

1. **CoinGecko MCP (mcp.api.coingecko.com)**  
   - Bot uses `mcp-remote` subprocess to talk to `https://mcp.api.coingecko.com/sse`.  
   - That endpoint was returning **500** and **SSE/transport errors**.  
   - When the subprocess hit “Fatal error: SseError”, it exited; the main Node process then saw transport errors and, when unhandled, exited too → PM2 restarted → repeat.

2. **Twitter 429**  
   - Logs showed “Request failed with code 429” and “Pausing bot for 15 minutes”.  
   - Rate limiting alone would pause posting but shouldn’t kill the process; the **combination** with MCP crashes meant the process often died before or during the pause.

3. **No global crash logging**  
   - Uncaught exceptions / unhandled rejections were not logged, so PM2 logs didn’t clearly show why the process exited.

---

## Fixes Applied (in dragontrade-agent repo)

1. **Global crash handlers** (`index.js`)  
   - `process.on('uncaughtException')` and `process.on('unhandledRejection')` now log `[FATAL]` and stack, then `process.exit(1)` after a short delay.  
   - So PM2/health logs show the real cause of each crash.

2. **Prefer Direct API; skip CoinGecko MCP when possible**  
   - If `COINGECKO_USE_DIRECT_API_ONLY=1` **or** CoinGecko Direct API is already initialized, the bot **does not** start the CoinGecko MCP client (no `mcp-remote` subprocess).  
   - Avoids crash-loop from mcp.api.coingecko.com.  
   - MCP health monitor skips MCP checks when `COINGECKO_USE_DIRECT_API_ONLY=1`.

3. **Docs and env**  
   - `.env.example`: added `COINGECKO_USE_DIRECT_API_ONLY=1` and `COINGECKO_API_KEY`.  
   - Oracle resilience doc updated with DragonTrade PM2 names and this env recommendation.

---

## What To Do on the Oracle Server

1. **Set env for DragonTrade** (in the app’s `.env` or PM2 ecosystem env):
   ```bash
   COINGECKO_USE_DIRECT_API_ONLY=1
   COINGECKO_API_KEY=<your CoinGecko Pro API key>
   ```
   If you don’t have a key, the bot can still run with Direct API in “fallback” mode; setting the env avoids spawning the flaky MCP.

2. **Redeploy / restart** so the new code and env are used:
   ```bash
   cd /home/ubuntu/dragontrade-agent
   git pull   # or deploy your branch with the fixes
   pm2 restart dragontrade-main
   pm2 restart dragontrade-dashboard
   pm2 restart dragontrade-bybit
   pm2 restart dragontrade-binance
   ```

3. **Confirm**  
   - `pm2 list` — `dragontrade-main` should show `online` and **restart count no longer climbing** every minute.  
   - `tail -f ~/.pm2/logs/dragontrade-main-out.log` — you should see normal posting flow and no repeated “[FATAL]” right after startup.  
   - If you still see crashes, the new `[FATAL]` lines will point to the next cause (e.g. Twitter, DB, etc.).

---

## References

- **Resilience and health script:** `docs/ORACLE_ALL_PRODUCTS_RESILIENCE.md`, `scripts/oracle-resilience/check_oracle_health.sh`  
- **DragonTrade repo:** [ElenaRevicheva/dragontrade-agent](https://github.com/ElenaRevicheva/dragontrade-agent)
