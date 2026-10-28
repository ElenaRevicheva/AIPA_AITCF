#!/usr/bin/env node
/**
 * Build aideazz.xyz/ops/ — the face of Elena's own CRM — from the queue page.
 *
 * 28 Oct 2026, Elena: "aideazz.xyz/ops is the source of truth. It's the face of my CRM."
 * The data stays on Oracle (`webhook.aideazz.xyz/queue/api/*`, behind nginx basic auth);
 * this writes a static HTML page into the aideazz site repo that signs in once and reads
 * it cross-origin. One source for both homes: `src/queue-page.ts` (`renderQueuePage`).
 *
 *   npm run build && node scripts/build-ops-face.cjs            # → ../../aideazz/public/ops/index.html
 *   node scripts/build-ops-face.cjs --out=/path/to/index.html   # elsewhere
 *
 * Needs the matching nginx change on Oracle (scripts/oracle-resilience/apply-queue-cors.sh):
 * CORS for https://aideazz.xyz on /queue/api/ and an OPTIONS preflight that skips the lock.
 */
const fs = require('fs');
const path = require('path');

const { renderQueuePage } = require('../dist/queue-page.js');

const API_BASE = process.env.OPS_API_BASE || 'https://webhook.aideazz.xyz/queue/';
const outArg = process.argv.find((a) => a.startsWith('--out='));
const out = outArg
  ? path.resolve(outArg.slice('--out='.length))
  : path.resolve(__dirname, '..', '..', '..', 'aideazz', 'public', 'ops', 'index.html');

const html = renderQueuePage({ apiBase: API_BASE, remote: true });

// The page must hold no secret and no data: a static file on IPFS is public by nature.
if (/Basic [A-Za-z0-9+/=]{8,}/.test(html)) throw new Error('refusing: page contains a credential');
if (!html.includes('id="login"') || !html.includes(API_BASE)) throw new Error('page is not the remote variant');

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html, 'utf8');
console.log(`ops face → ${out} (${html.length} chars, api ${API_BASE})`);
