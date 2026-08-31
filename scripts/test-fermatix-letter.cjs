#!/usr/bin/env node
/**
 * test-fermatix-letter.cjs — the letter must stay money-safe before Elena clicks.
 *
 * No HubSpot. Asserts the spec, the committed draft, and buildDraftText() agree,
 * then runs stage-hiring-outreach.cjs --dry-run so a missing field fails here
 * instead of on Oracle after the trigger has already fired.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');
const { buildDraftText } = require('./stage-hiring-outreach.cjs');

const ROOT = path.join(__dirname, '..');
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/selling/specs/fermatix.json'), 'utf8'));
const draft = fs.readFileSync(path.join(ROOT, 'docs/selling/drafts/fermatix-email.txt'), 'utf8');
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/selling/outreach-registry.json'), 'utf8'));

const required = ['slug', 'name', 'email', 'company', 'subject', 'body', 'dealName', 'domain'];
for (const f of required) assert(spec[f], `spec missing ${f}`);

assert.strictEqual(spec.slug, 'fermatix');
assert.strictEqual(spec.email, 'hi@fermatix.ai');
assert.strictEqual(spec.cc, 'aipa@aideazz.xyz');
assert.strictEqual(spec.domain, 'fermatix.ai');
assert.ok(spec.dealName.startsWith('[LICENSE]'), 'deal must be [LICENSE], not CLIENT-MANUAL or HIRING');
assert.ok(!registry.fermatix, 'fermatix already in registry — refusing to stage a duplicate');

const generated = buildDraftText(spec);
assert.strictEqual(generated.trim(), draft.trim(), 'committed draft must match spec via buildDraftText');

assert.ok(draft.includes('TO: hi@fermatix.ai'));
assert.ok(draft.includes('CC: aipa@aideazz.xyz'));
assert.ok(draft.includes('https://aideazz.xyz/portfolio'));
assert.ok(draft.includes('non-exclusive'));
assert.ok(draft.includes('No assignment'));
assert.ok(draft.includes('metadata and NDA first'));
assert.ok(draft.includes('not a GitHub app'));

const forbidden = [
  /github\.com\/ElenaRevicheva/i,
  /were-public|were public/i,
  /\$\d/,
  /74,?851|89,?481|350,?000/,
  /exclusive licence|exclusive license/i,
  /nine systems/i,
  /single mother|broke|hardship/i,
  /hud\.io|datavendor\.ai/i,
  /§9\.2|section 9/i,
];
for (const re of forbidden) {
  assert.ok(!re.test(draft), `letter must not match ${re}`);
  assert.ok(!re.test(spec.body), `spec body must not match ${re}`);
}

const dry = spawnSync(process.execPath, [
  path.join(ROOT, 'scripts/stage-hiring-outreach.cjs'),
  path.join(ROOT, 'docs/selling/specs/fermatix.json'),
  '--dry-run',
], { encoding: 'utf8' });
assert.strictEqual(dry.status, 0, dry.stderr || dry.stdout);
assert.ok(dry.stdout.includes('dry run'), dry.stdout);
assert.ok(dry.stdout.includes('[LICENSE] Fermatix'), dry.stdout);
assert.ok(dry.stdout.includes('hi@fermatix.ai'), dry.stdout);
assert.ok(!dry.stdout.toLowerCase().includes('written to HubSpot') || dry.stdout.includes('nothing written to HubSpot'), dry.stdout);

const trigger = fs.readFileSync(path.join(ROOT, '.github/workflows/hire-outreach-on-trigger.yml'), 'utf8');
assert.ok(trigger.includes('paths: [".hire-trigger"]'));
assert.ok(trigger.includes('docs/selling/specs/'));
assert.ok(trigger.includes('oracle-stage-hiring-outreach.sh'));
assert.ok(!trigger.includes('$HOME/.ssh.oracle'));

console.log('ok  fermatix letter + dry-run + trigger allowlist');
