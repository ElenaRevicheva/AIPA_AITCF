#!/usr/bin/env node
/**
 * Push the canonical concierge rules into every Make scenario, and prove it.
 *
 * The rules live in ONE place — src/concierge-prompt.ts. The watchdog imports
 * them directly; Make cannot, so this script writes them into each scenario's
 * Claude module, between the two markers, leaving that module's own data chips
 * untouched. Then it reads the blueprint back from Make and compares, because a
 * PATCH that returns 200 is not proof the prompt changed.
 *
 *   node scripts/sync-make-prompts.cjs           # report drift only, change nothing
 *   node scripts/sync-make-prompts.cjs --apply   # write, then verify
 *
 * Every blueprint is backed up to backups/make/ before it is touched.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { CONCIERGE_RULES, withCanonicalRules, extractRules } = require('../dist/concierge-prompt.js');

const TOKEN = (process.env.MAKE_API_TOKEN || '').trim();
const BASE = (process.env.MAKE_API_BASE || 'https://us2.make.com/api/v2').replace(/\/$/, '');
const APPLY = process.argv.includes('--apply');

/**
 * Which module carries the prompt in each scenario. The HubSpot-triggered
 * scenario and the webhook one differ in everything except these rules.
 */
const TARGETS = [
  { id: (process.env.MAKE_CONCIERGE_SCENARIO_ID || '5633833').trim(), module: 3, label: 'Lead Concierge (HubSpot trigger)' },
  ...(process.env.MAKE_CONCIERGE_WEBHOOK_SCENARIO_ID
    ? [{ id: process.env.MAKE_CONCIERGE_WEBHOOK_SCENARIO_ID.trim(), module: 3, label: 'Lead Concierge (webhook)' }]
    : []),
];

const api = (p, init = {}) =>
  fetch(`${BASE}${p}`, {
    ...init,
    headers: { Authorization: `Token ${TOKEN}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });

function promptOf(blueprint, moduleId) {
  const m = (blueprint.flow || []).find(x => x.id === moduleId);
  const msgs = m && m.mapper && m.mapper.messages;
  if (!Array.isArray(msgs) || !msgs.length) return null;
  return { module: m, message: msgs[0] };
}

(async () => {
  if (!TOKEN) {
    console.error('MAKE_API_TOKEN missing — cannot reach Make.');
    process.exit(1);
  }
  let drifted = 0;
  let failed = 0;

  for (const t of TARGETS) {
    console.log(`\n=== ${t.label} (scenario ${t.id}, module ${t.module}) ===`);
    const res = await api(`/scenarios/${t.id}/blueprint`);
    if (!res.ok) {
      console.error(`  ✗ could not read blueprint: ${res.status}`);
      failed++;
      continue;
    }
    const body = await res.json();
    const blueprint = body.response.blueprint;
    const found = promptOf(blueprint, t.module);
    if (!found) {
      console.error(`  ✗ module ${t.module} has no prompt message — skipping`);
      failed++;
      continue;
    }

    const live = extractRules(found.message.content);
    if (live !== null && live === CONCIERGE_RULES.trim()) {
      console.log('  ✓ already in sync with src/concierge-prompt.ts');
      continue;
    }
    drifted++;
    console.log(live === null ? '  ! never synced (no markers present)' : '  ! DRIFTED from the canonical rules');

    if (!APPLY) {
      console.log('  → run with --apply to write the canonical rules');
      continue;
    }

    const dir = path.join(process.cwd(), 'backups', 'make');
    fs.mkdirSync(dir, { recursive: true });
    const backup = path.join(dir, `blueprint-${t.id}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(backup, JSON.stringify(body, null, 2));
    console.log(`  backed up → ${path.relative(process.cwd(), backup)}`);

    found.message.content = withCanonicalRules(found.message.content);
    const patch = await api(`/scenarios/${t.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ blueprint: JSON.stringify(blueprint) }),
    });
    if (!patch.ok) {
      console.error(`  ✗ PATCH failed ${patch.status}: ${(await patch.text()).slice(0, 200)}`);
      failed++;
      continue;
    }

    // Never trust the write — read it back out of Make.
    const after = await (await api(`/scenarios/${t.id}/blueprint`)).json();
    const back = promptOf(after.response.blueprint, t.module);
    const now = back && extractRules(back.message.content);
    if (now === CONCIERGE_RULES.trim()) {
      console.log('  ✓ written and VERIFIED against Make');
    } else {
      console.error('  ✗ wrote it, but Make does not report the canonical rules back');
      failed++;
    }
  }

  console.log(
    `\n${TARGETS.length} scenario(s) checked · ${drifted} needed sync · ${failed} failed` +
      (!APPLY && drifted ? ' · re-run with --apply' : ''),
  );
  process.exit(failed ? 1 : 0);
})();
