#!/usr/bin/env node
/** Pure checks for insertNoteStamp — no HubSpot, no Resend. */
'use strict';
const { insertNoteStamp } = require('../dist/resend-webhook.js');

const delivered = '<b>✅ ENTREGADO → atrium@afterquery.com (Resend confirmó la entrega)</b>';
const emailed = '<b>📧 EMAILED from aipa@ → atrium@afterquery.com</b><br>Resend:abc';

const afterDelivered = insertNoteStamp('FOLLOW-UP<br><hr>letter', delivered);
if (!afterDelivered.includes('ENTREGADO') || !afterDelivered.includes('FOLLOW-UP')) {
  console.error('delivered stamp failed', afterDelivered);
  process.exit(1);
}

// The AfterQuery failure: EMAILED written from a stale body wiped ENTREGADO.
// insertNoteStamp on the FRESH body (already has ENTREGADO) must keep both.
const both = insertNoteStamp(afterDelivered, emailed);
if (!both.includes('ENTREGADO') || !both.includes('EMAILED') || !both.includes('FOLLOW-UP')) {
  console.error('lost-update merge failed', both);
  process.exit(1);
}

// Stale-body write (what used to happen) — documented so the test names the bug:
const wiped = insertNoteStamp('FOLLOW-UP<br><hr>letter', emailed);
if (wiped.includes('ENTREGADO')) {
  console.error('stale-body fixture is wrong');
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, bothKept: true, staleBodyWouldWipe: !wiped.includes('ENTREGADO') }));
