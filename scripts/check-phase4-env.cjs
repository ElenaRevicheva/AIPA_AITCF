#!/usr/bin/env node
/**
 * Safe Phase 4 env check for Oracle / local: prints key names and value lengths only (no secrets).
 * Usage: node scripts/check-phase4-env.cjs
 * Requires: dotenv (project dependency), run from repo root or set CTO_AIPA_ROOT.
 */
const path = require('path');
const fs = require('fs');

const root = process.env.CTO_AIPA_ROOT || path.join(__dirname, '..');
const envPath = path.join(root, '.env');
if (!fs.existsSync(envPath)) {
  console.error('No .env at', envPath);
  process.exit(1);
}

require('dotenv').config({ path: envPath });

const keys = [
  'RESEND_API_KEY',
  'RESEND_KEY',
  'OUTREACH_SECRET',
  'HUNTER_API_KEY',
  'OUTREACH_CRON',
  'INGEST_CRON',
  'OUTREACH_TZ',
];

console.log('Phase 4 env (lengths only, cwd=%s)', root);
for (const k of keys) {
  const v = process.env[k];
  if (v === undefined || v === '') {
    console.log(k + ': missing or empty');
  } else {
    console.log(k + ': len=' + v.length);
  }
}

const resend =
  (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim()) ||
  (process.env.RESEND_KEY && process.env.RESEND_KEY.trim());
const secret = process.env.OUTREACH_SECRET && process.env.OUTREACH_SECRET.trim();

console.log('');
console.log('Summary:');
console.log('  Resend (RESEND_API_KEY or RESEND_KEY):', resend ? 'OK' : 'MISSING — no client emails will send');
console.log('  OUTREACH_SECRET:', secret ? 'OK — HTTP /outreach/* + ingest/send crons registered at startup' : 'MISSING — crons will NOT run');
process.exit(resend && secret ? 0 : 2);
