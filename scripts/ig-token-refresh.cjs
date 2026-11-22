#!/usr/bin/env node
/**
 * ig-token-refresh.cjs - keep the Instagram long-lived token alive (22 Nov 2026).
 * A long-lived Instagram Login token lasts 60 days; refreshing it (when it is >24 h old) gives 60 more.
 * Reads .ig-token.json (or IG_ACCESS_TOKEN), writes the new token to .ig-token.json (gitignored, never printed).
 * Cron (Oracle): weekly. Run: node scripts/ig-token-refresh.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true }); } catch { /* optional */ }
const FILE = path.join(__dirname, '..', '.ig-token.json');
let token = process.env.IG_ACCESS_TOKEN || '';
try { token = JSON.parse(fs.readFileSync(FILE, 'utf8')).access_token || token; } catch { /* first run */ }
if (!token) { console.error('ig-token-refresh: no token yet'); process.exit(1); }
fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`)
  .then(async (r) => {
    const j = await r.json();
    if (!r.ok || !j.access_token) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 200)}`);
    fs.writeFileSync(FILE, JSON.stringify({ access_token: j.access_token, refreshed_at: new Date().toISOString(), expires_in: j.expires_in }), { mode: 0o600 });
    console.log(`ig-token-refresh: ok, valid ${Math.round((j.expires_in || 0) / 86400)} more days`);
  })
  .catch((e) => { console.error('ig-token-refresh failed:', e.message); process.exit(1); });
