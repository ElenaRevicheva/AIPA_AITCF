# Chrome Cleanup Scripts (Windows Desktop Only)

**These scripts do NOT affect CTO AIPA or any Oracle server.** They run only on your Windows PC to fix a broken Chrome browser.

| Script | Use when |
|--------|----------|
| `Chrome_Complete_Cleanup.bat` | Chrome is slow, glitchy, or misbehaving. Keeps bookmarks, preferences, extensions. |
| `Chrome_Full_Reset.bat` | Chrome is totally broken. Deletes everything, fresh install. |

**How to run:** Right-click → Run as administrator. Close Chrome first if possible.

**Why they're safe for Oracle:** These are Windows `.bat` files that operate on `%LOCALAPPDATA%\Google\Chrome\User Data`. CTO AIPA runs on Oracle Linux (PM2, Node.js). They never interact.
