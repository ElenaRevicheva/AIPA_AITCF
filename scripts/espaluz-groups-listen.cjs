#!/usr/bin/env node
/**
 * espaluz-groups-listen.cjs - run the EspaLuz Facebook-group lane by hand (22 Nov 2026).
 *   node scripts/espaluz-groups-listen.cjs --dry-run   # show what it would offer, no tokens, nothing sent
 *   node scripts/espaluz-groups-listen.cjs             # one real run: deliver ONE paste to Telegram + HubSpot
 * The weekday cron in cto-aipa.ts runs the same function (ESPALUZ_GROUPS_ENABLED=true).
 */
'use strict';
const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true }); } catch { /* optional */ }
const { runEspaluzGroupsCycle } = require('../dist/espaluz-groups-listener.js');
runEspaluzGroupsCycle({ dryRun: process.argv.includes('--dry-run') })
  .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(0); })
  .catch((e) => { console.error('espaluz-groups failed:', e.message); process.exit(1); });
