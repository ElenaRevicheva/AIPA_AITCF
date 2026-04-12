#!/usr/bin/env node
/**
 * Fire Phase 5 triage once: POST /leads/triage-run with Bearer LEAD_TRIAGE_SECRET.
 * Run on Oracle: cd ~/cto-aipa && npm run triage:fire
 */
const pathMod = require('path');
const http = require('http');
require('dotenv').config({ path: pathMod.join(__dirname, '..', '.env'), override: true });

const secret = process.env.LEAD_TRIAGE_SECRET?.trim();
const port = parseInt(process.env.TRIAGE_FIRE_PORT || '3000', 10);
const host = process.env.TRIAGE_FIRE_HOST || '127.0.0.1';
/** Set TRIAGE_FIRE_WAIT=1 to block until triage finishes (slow). Default: background (HTTP 202). */
const wait = process.env.TRIAGE_FIRE_WAIT === '1';
const triagePath = wait ? '/leads/triage-run?wait=1' : '/leads/triage-run';

if (secret) {
  const body = JSON.stringify({});
  const req = http.request(
    {
      hostname: host,
      port,
      path: triagePath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        Authorization: `Bearer ${secret}`,
      },
    },
    (res) => {
      let d = '';
      res.on('data', (c) => {
        d += c;
      });
      res.on('end', () => {
        console.log(`HTTP ${res.statusCode}`);
        console.log(d.length > 2000 ? d.slice(0, 2000) + '\n…' : d);
        const ok = res.statusCode === 202 || (res.statusCode >= 200 && res.statusCode < 300);
        process.exit(ok ? 0 : 1);
      });
    }
  );
  req.setTimeout(wait ? 900000 : 60000, () => {
    req.destroy(new Error(wait ? 'triage wait timeout 15min' : 'request timeout'));
  });
  req.on('error', (e) => {
    console.error('Request failed:', e.message);
    process.exit(1);
  });
  req.end(body);
} else {
  console.log('LEAD_TRIAGE_SECRET unset — calling triage-run without Bearer (only works if server has no secret).');
  const body = JSON.stringify({});
  const req = http.request(
    {
      hostname: host,
      port,
      path: triagePath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    },
    (res) => {
      let d = '';
      res.on('data', (c) => {
        d += c;
      });
      res.on('end', () => {
        console.log(`HTTP ${res.statusCode}`);
        console.log(d.length > 2000 ? d.slice(0, 2000) + '\n…' : d);
        const ok = res.statusCode === 202 || (res.statusCode >= 200 && res.statusCode < 300);
        process.exit(ok ? 0 : 1);
      });
    }
  );
  req.setTimeout(wait ? 900000 : 60000, () => {
    req.destroy(new Error(wait ? 'triage wait timeout 15min' : 'request timeout'));
  });
  req.on('error', (e) => {
    console.error('Request failed:', e.message);
    process.exit(1);
  });
  req.end(body);
}
