#!/usr/bin/env node
/**
 * test-manual-prospect-cycle.cjs — end-to-end proof of the Manual Prospect Play.
 *
 * Runs `stage-manual-prospect.cjs <domain> --with-fu` against a mock HubSpot and a mock
 * visibility engine, inside a throwaway copy of the repo, and asserts the whole cycle:
 * five HubSpot records, both first-contact send buttons, both follow-up send buttons,
 * four drafts on disk and the registry rows the one-click email routes read.
 *
 * Nothing here touches the real CRM, the real audit engine or the repo's own drafts —
 * the mock audit numbers are fixtures, never a claim about the prospect.
 *
 *   node scripts/test-manual-prospect-cycle.cjs [domain]   (default: abolu.net)
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const REPO = path.join(__dirname, '..');
const DOMAIN = process.argv.find((a) => !a.startsWith('-') && a.includes('.') && !a.endsWith('.cjs')) || 'abolu.net';

/** Fixture audits — shaped like the real engine's payload, values are not measurements. */
const MOCK_AUDIT = {
  score: 71,
  grade: 'C',
  categories: [
    { id: 'techSeo', label: 'Tech', score: 84 },
    { id: 'aiAccess', label: 'AI Access', score: 90 },
    { id: 'geo', label: 'GEO', score: 62 },
    { id: 'aeo', label: 'AEO', score: 48 },
  ],
};

/** Above CREDENTIAL_SCORE: the letter must pivot instead of inventing a gap. */
const MOCK_AUDIT_CREDENTIAL = {
  score: 89,
  grade: 'A',
  categories: [
    { id: 'techSeo', label: 'Tech', score: 86 },
    { id: 'aiAccess', label: 'AI Access', score: 100 },
    { id: 'geo', label: 'GEO', score: 81 },
    { id: 'aeo', label: 'AEO', score: 88 },
  ],
};

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => resolve(raw ? JSON.parse(raw) : {}));
  });
}

/** Minimal HubSpot CRM: object store + the association graph both scripts walk. */
function createMockHubSpot() {
  const store = { companies: {}, contacts: {}, deals: {}, notes: {}, tasks: {} };
  const associations = []; // { from: 'deals:1', to: 'notes:2' }
  const calls = [];
  let nextId = 1000;

  const assocKey = (type, id) => `${type}:${id}`;
  const linked = (fromType, fromId, toType) =>
    associations
      .filter(
        (a) =>
          (a.from === assocKey(fromType, fromId) && a.to.startsWith(`${toType}:`)) ||
          (a.to === assocKey(fromType, fromId) && a.from.startsWith(`${toType}:`)),
      )
      .map((a) => (a.from.startsWith(`${toType}:`) ? a.from : a.to).split(':')[1]);

  // HubSpot's object search is eventually consistent: a deal created seconds ago is not
  // in the index yet. Abolu's first real staging hit exactly this — the follow-up
  // installer searched, found nothing and patched nothing, while the deal plainly
  // existed. On by default so the cycle is tested the way it actually runs.
  const state = { searchIndexLag: true };

  const server = http.createServer(async (req, res) => {
    const [pathname] = req.url.split('?');
    const body = req.method === 'GET' ? {} : await readBody(req);
    calls.push({ method: req.method, path: pathname });
    const send = (code, payload) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    if (!/^Bearer .+/.test(req.headers.authorization || '')) return send(401, { message: 'no auth' });

    let m;
    if ((m = pathname.match(/^\/crm\/v3\/objects\/(\w+)\/search$/)) && req.method === 'POST') {
      const type = m[1];
      if (state.searchIndexLag) return send(200, { results: [], total: 0 });
      const token = body.filterGroups?.[0]?.filters?.find((f) => f.operator === 'CONTAINS_TOKEN')?.value || '';
      const results = Object.entries(store[type] || {})
        .filter(([, o]) => JSON.stringify(o.properties).toLowerCase().includes(token.toLowerCase()))
        .map(([id, o]) => ({ id, properties: o.properties }));
      return send(200, { results, total: results.length });
    }
    if ((m = pathname.match(/^\/crm\/v3\/objects\/(\w+)$/)) && req.method === 'POST') {
      const id = String(nextId++);
      store[m[1]][id] = { properties: body.properties || {} };
      return send(201, { id, properties: store[m[1]][id].properties });
    }
    if ((m = pathname.match(/^\/crm\/v3\/objects\/(\w+)\/(\d+)$/))) {
      const [, type, id] = m;
      if (!store[type]?.[id]) return send(404, { message: 'not found' });
      if (req.method === 'PATCH') Object.assign(store[type][id].properties, body.properties || {});
      return send(200, { id, properties: store[type][id].properties });
    }
    if ((m = pathname.match(/^\/crm\/v4\/objects\/(\w+)\/(\d+)\/associations\/(\w+)\/(\d+)$/)) && req.method === 'PUT') {
      associations.push({ from: assocKey(m[1], m[2]), to: assocKey(m[3], m[4]) });
      return send(200, {});
    }
    if ((m = pathname.match(/^\/crm\/v4\/objects\/(\w+)\/(\d+)\/associations\/(\w+)$/)) && req.method === 'GET') {
      return send(200, { results: linked(m[1], m[2], m[3]).map((id) => ({ toObjectId: id })) });
    }
    return send(404, { message: `mock hubspot: unhandled ${req.method} ${pathname}` });
  });

  return { server, store, associations, calls, state };
}

function createMockVisibility() {
  const state = { audit: MOCK_AUDIT };
  const server = http.createServer(async (req, res) => {
    await readBody(req);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state.audit));
  });
  return { server, state };
}

/** Throwaway repo: real scripts, empty selling tree — the repo's own drafts stay put. */
function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-cycle-'));
  fs.cpSync(path.join(REPO, 'scripts'), path.join(dir, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs/selling/drafts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs/selling/prospects'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs/selling/outreach-registry.json'), '{}\n');
  return dir;
}

/**
 * Async on purpose: spawnSync would block this process's event loop, and the mock CRM
 * lives in it — the child's very first request would then hang until fetch gave up.
 */
function run(sandbox, args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(sandbox, 'scripts/stage-manual-prospect.cjs'), ...args], {
      cwd: sandbox,
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderr += c));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function lastJson(text) {
  const starts = [...text.matchAll(/^\{$/gm)].map((m) => m.index);
  for (const start of starts.reverse()) {
    try {
      return JSON.parse(text.slice(start));
    } catch {
      /* not the outermost object — keep looking backwards */
    }
  }
  throw new Error(`no JSON object in output:\n${text}`);
}

const checks = [];
function check(name, fn) {
  try {
    fn();
    checks.push({ name, ok: true });
  } catch (e) {
    checks.push({ name, ok: false, err: e.message });
  }
}

(async () => {
  const hub = createMockHubSpot();
  const vis = createMockVisibility();
  const hubPort = await listen(hub.server);
  const visPort = await listen(vis.server);
  const sandbox = makeSandbox();
  const env = {
    HUBSPOT_API_KEY: 'pat-na1-mock-key',
    HUBSPOT_OWNER_ID: '91612860',
    HUBSPOT_API_BASE: `http://127.0.0.1:${hubPort}`,
    VISIBILITY_API_URL: `http://127.0.0.1:${visPort}`,
    VISIBILITY_API_KEY: 'mock-visibility-key',
  };

  // 1. A skipped audit must not invent a score for the prospect.
  const refused = await run(sandbox, [DOMAIN, '--skip-audit', '--no-scrape'], env);
  check('--skip-audit without --score is refused', () => {
    assert.notStrictEqual(refused.status, 0, 'expected a non-zero exit');
    assert.match(refused.stderr, /--skip-audit needs --score/);
  });
  check('refused run created nothing in HubSpot', () =>
    assert.strictEqual(Object.keys(hub.store.deals).length, 0));

  // 2. Artifacts before HubSpot: --prepare-only writes drafts, registry and the pack.
  const prepared = await run(sandbox, [DOMAIN, '--score=71', '--no-scrape', '--prepare-only'], env);
  check('--prepare-only succeeds', () =>
    assert.strictEqual(prepared.status, 0, prepared.stderr));
  check('--prepare-only touches no HubSpot object', () =>
    assert.strictEqual(Object.keys(hub.store.deals).length, 0));
  check('--prepare-only omits an unmeasured category score from the letter', () => {
    const letter = fs.readFileSync(path.join(sandbox, lastJson(prepared.stdout).draftPath), 'utf8');
    assert.doesNotMatch(letter, /AEO \d+\/100|GEO \d+\/100/, 'asserted score must not carry a fake category');
  });

  // 3. The full cycle, one command.
  const staged = await run(sandbox, [DOMAIN, '--no-scrape', '--with-fu'], env);
  check('full cycle exits clean', () => assert.strictEqual(staged.status, 0, staged.stderr));

  // The run prints the follow-up installer's summary before its own, so take the last.
  const out = staged.status === 0 ? lastJson(staged.stdout) : {};
  const deal = Object.entries(hub.store.deals)[0];
  const note = Object.entries(hub.store.notes)[0];
  const task = Object.entries(hub.store.tasks)[0];
  const noteBody = note ? note[1].properties.hs_note_body : '';
  const registry = JSON.parse(fs.readFileSync(path.join(sandbox, 'docs/selling/outreach-registry.json'), 'utf8'));
  const slug = out.emailOneClick ? out.emailOneClick.split('/').pop() : '';

  check('all five records exist', () => {
    assert.strictEqual(Object.keys(hub.store.companies).length, 1, 'company');
    assert.strictEqual(Object.keys(hub.store.contacts).length, 1, 'contact');
    assert.strictEqual(Object.keys(hub.store.deals).length, 1, 'deal');
    assert.strictEqual(Object.keys(hub.store.notes).length, 1, 'note');
    assert.strictEqual(Object.keys(hub.store.tasks).length, 1, 'task');
  });
  check('deal is [CLIENT-MANUAL], qualifiedtobuy, owned by Elena, with the live score', () => {
    const p = deal[1].properties;
    assert.match(p.dealname, /^\[CLIENT-MANUAL\] /);
    assert.match(p.dealname, new RegExp(`\\(audit: ${MOCK_AUDIT.score}/${MOCK_AUDIT.grade}\\)$`));
    assert.strictEqual(p.dealstage, 'qualifiedtobuy');
    assert.strictEqual(p.hubspot_owner_id, '91612860');
  });
  check('contact carries an email and is linked to the deal and the company', () => {
    const [contactId, contact] = Object.entries(hub.store.contacts)[0];
    assert.match(contact.properties.email, /.+@.+\..+/);
    const dealLinks = hub.associations.filter((a) => a.to === `contacts:${contactId}` || a.from === `contacts:${contactId}`);
    assert.ok(dealLinks.some((a) => `${a.from}${a.to}`.includes('deals:')), 'deal ↔ contact');
    assert.ok(dealLinks.some((a) => `${a.from}${a.to}`.includes('companies:')), 'company ↔ contact');
  });
  check('send task is HIGH and assigned to Elena', () => {
    const p = task[1].properties;
    assert.strictEqual(p.hs_task_priority, 'HIGH');
    assert.strictEqual(p.hs_task_status, 'NOT_STARTED');
    assert.strictEqual(p.hubspot_owner_id, '91612860');
  });
  check('note has a clickable WhatsApp link with the message prefilled', () => {
    const wa = noteBody.match(/href="(https:\/\/web\.whatsapp\.com\/send\?phone=\d+&amp;text=[^"]+)"/);
    assert.ok(wa, 'no web.whatsapp.com/send anchor');
    const text = decodeURIComponent(new URL(wa[1].replace(/&amp;/g, '&')).searchParams.get('text'));
    assert.match(text, /Elena Revicheva/);
    assert.match(text, /https:\/\/aideazz\.xyz\/portfolio/);
    assert.ok(text.length > 400, `prefilled text too short (${text.length} chars)`);
  });
  check('note has a clickable one-click email link that resolves to a registered slug', () => {
    const email = noteBody.match(/href="(https:\/\/webhook\.aideazz\.xyz\/cto\/go\/outreach-email\/[a-z0-9-]+)"/);
    assert.ok(email, 'no /go/outreach-email anchor');
    const linked = email[1].split('/').pop();
    assert.ok(registry[linked], `slug ${linked} missing from the registry`);
    assert.ok(registry[linked].email, 'registry row has no recipient');
    assert.ok(
      fs.existsSync(path.join(sandbox, registry[linked].emailDraft)),
      'registry points at a missing email draft',
    );
  });
  check('follow-up block is installed at the top of the same note', () => {
    const fuIndex = noteBody.search(/FOLLOW-UP — click y enviar/);
    assert.ok(fuIndex >= 0, 'no follow-up block');
    assert.ok(fuIndex < noteBody.indexOf('MENSAJE'), 'follow-up block is not at the top');
    assert.match(noteBody, /✉️ EMAIL FU/);
    assert.match(noteBody, /➡️ WHATSAPP FU \(laptop\)/);
  });
  check('follow-up email slug is registered with its own draft', () => {
    assert.ok(registry[`${slug}-fu`], `${slug}-fu missing from registry`);
    assert.ok(fs.existsSync(path.join(sandbox, registry[`${slug}-fu`].emailDraft)));
  });
  check('all four drafts exist and are UTF-8 with live emojis', () => {
    for (const rel of [
      `docs/selling/drafts/${slug}.txt`,
      `docs/selling/drafts/${slug}-email.txt`,
      `docs/selling/drafts/${slug}-fu-email.txt`,
    ]) {
      const p = path.join(sandbox, rel);
      assert.ok(fs.existsSync(p), `missing ${rel}`);
      const text = fs.readFileSync(p, 'utf8');
      assert.ok(!text.includes('\uFFFD'), `${rel} has a replacement char`);
      assert.match(text, /👋/, `${rel} lost its emoji`);
    }
    const fuText = decodeURIComponent(
      new URL(
        noteBody.match(/href="(https:\/\/web\.whatsapp\.com\/send\?phone=\d+&amp;text=[^"]+)"/g)
          .map((h) => h.match(/href="([^"]+)"/)[1].replace(/&amp;/g, '&'))
          .find((h) => decodeURIComponent(h).includes('de nuevo')),
      ).searchParams.get('text'),
    );
    assert.match(fuText, /AI Growth Operator/, 'WhatsApp follow-up is not the Operator message');
  });
  check('prospect pack records the deal ids and the note', () => {
    const pack = fs.readFileSync(path.join(sandbox, out.prospectPath), 'utf8');
    assert.match(pack, new RegExp(`Deal \\*\\*${deal[0]}\\*\\*`));
    assert.match(pack, /web\.whatsapp\.com\/send/);
  });
  check('follow-up installs even though the deal is not in the search index yet', () => {
    assert.ok(hub.state.searchIndexLag, 'this run must exercise the lag');
    assert.strictEqual(out.followUp, 'installed');
  });

  // 4. A second staging of the same prospect must refuse, not create a second deal.
  hub.state.searchIndexLag = false;
  const duplicate = await run(sandbox, [DOMAIN, '--no-scrape', '--with-fu'], env);
  check('re-staging the same prospect is refused as a duplicate', () => {
    assert.notStrictEqual(duplicate.status, 0);
    assert.match(duplicate.stdout + duplicate.stderr, /DUPLICATE/);
    assert.strictEqual(Object.keys(hub.store.deals).length, 1, 'a second deal was created');
  });

  // 5. A high scorer gets the credential letter — and a subject that matches it.
  vis.state.audit = MOCK_AUDIT_CREDENTIAL;
  const credentialSandbox = makeSandbox();
  const credential = await run(credentialSandbox, [DOMAIN, '--no-scrape', '--prepare-only'], env);
  check('a credential-score letter pivots instead of inventing a gap', () => {
    assert.strictEqual(credential.status, 0, credential.stderr);
    const letter = fs.readFileSync(path.join(credentialSandbox, lastJson(credential.stdout).draftPath), 'utf8');
    assert.match(letter, /no les voy a inventar un problema que no tienen/);
    assert.doesNotMatch(letter, /todavía no aparece como respuesta citable/);
  });
  check('the credential subject line does not promise 3 fixes', () => {
    const emailDraft = fs.readFileSync(
      path.join(credentialSandbox, lastJson(credential.stdout).emailDraftPath),
      'utf8',
    );
    const subject = emailDraft.match(/^SUBJECT: (.+)$/m)[1];
    assert.doesNotMatch(subject, /3 arreglos concretos/, `subject contradicts the letter: ${subject}`);
    assert.match(subject, new RegExp(`${MOCK_AUDIT_CREDENTIAL.score}/100`));
  });

  // Artifacts for review: the note exactly as HubSpot received it. Kept in the sandbox
  // so a test run never leaves anything behind in the repo.
  const artifactDir = path.join(sandbox, 'artifacts');
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, 'deal-note.html'), noteBody);
  fs.writeFileSync(
    path.join(artifactDir, 'summary.json'),
    JSON.stringify({ deal: deal?.[1].properties, task: task?.[1].properties, registry, output: out }, null, 2),
  );

  hub.server.close();
  vis.server.close();

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : `\n        ${c.err}`}`);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  console.log(`sandbox: ${sandbox}\nartifacts: ${artifactDir}`);
  if (failed.length) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
