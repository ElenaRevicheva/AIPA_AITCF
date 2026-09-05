#!/usr/bin/env node
/**
 * publish-license-repos.cjs — push the scrubbed bundle to NEW private GitHub repos.
 *
 * Why this exists: DataVendor sells repositories you host on GitHub. Settings →
 * Integrations shows GitHub "Connected", assets are identified as `ElenaRevicheva/<repo>`,
 * and there is a mandatory `Repository snapshot` check. **There is no zip upload path for
 * a codebase asset.** So a scrubbed tree only becomes sellable once it exists as a GitHub
 * repo that the DataVendor App can snapshot.
 *
 * Why NEW repos and not a history rewrite of the originals:
 *   `VibeJobHunterAIPA_AIMCF` and `aideazz` DEPLOY FROM GIT and are held at origin/main.
 *   Rewriting their history to scrub PII breaks the deploy and destroys history that is
 *   not ours to destroy. Clean-room export, never a rewritten working repo.
 *
 * Private, always. The listing sells a LICENCE TO A COPY. A public repo gives the same
 * code away for free and destroys the asking price. There is no --public flag on purpose.
 *
 * Safety: refuses to push anything until `build-license-bundle.cjs --verify-only` exits 0
 * against the same tree and canary list. A tree that has not passed the independent
 * re-scan is never pushed — the gate is the point, not a formality.
 *
 * Usage:
 *   node scripts/publish-license-repos.cjs                 # dry run, prints the plan
 *   node scripts/publish-license-repos.cjs --apply         # create + push
 *   [--bundle <dir>] [--canaries <file>] [--suffix -licensed] [--only <name,name>]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const APPLY = argv.includes('--apply');
const BUNDLE = arg('--bundle', 'D:/aideazz/_license-bundle-2026-09-05');
const CANARIES = arg('--canaries', 'D:/aideazz/_license-canaries.txt');
const SUFFIX = arg('--suffix', '-licensed');
const ONLY = (arg('--only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const OWNER = arg('--owner', 'ElenaRevicheva');

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });

function die(msg) { console.error(`\n✖ ${msg}`); process.exit(1); }

/* ---------------------------------------------------------------- preflight */

if (!fs.existsSync(BUNDLE)) die(`bundle not found: ${BUNDLE} — run build-license-bundle.cjs first`);

let repos = fs.readdirSync(BUNDLE, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);
if (ONLY.length) repos = repos.filter((r) => ONLY.includes(r));
if (!repos.length) die('no repo directories in the bundle');

console.log('Preflight');

// 1. gh must be authenticated, and must actually hold the `repo` scope. `gh auth status`
//    exits 0 for a token that cannot create a repo, so check the scope line, not the exit.
let scopes = '';
try { scopes = run('gh', ['auth', 'status']); }
catch { die('gh is not authenticated — run `gh auth login`'); }
if (!/'repo'|\brepo\b/.test(scopes)) die("gh token lacks the 'repo' scope — cannot create repositories");
console.log('  ✓ gh authenticated with repo scope');

// 2. The tree must pass the INDEPENDENT re-scan. Not a formality: this is the only thing
//    standing between a missed credential and a permanent public-facing git object.
try {
  run('node', [path.join(__dirname, 'build-license-bundle.cjs'),
    '--verify-only', '--out', BUNDLE, '--canaries', CANARIES], { stdio: 'pipe' });
  console.log('  ✓ bundle passes the independent PII + secrets re-scan');
} catch (e) {
  const out = (e.stdout || '') + (e.stderr || '');
  die(`bundle FAILED verification — refusing to push.\n${out.split('\n').slice(-25).join('\n')}`);
}

// 3. No .git may travel with the tree. The listing promises clean history; a nested .git
//    would carry the very commits the clean-room export exists to leave behind.
for (const r of repos) {
  if (fs.existsSync(path.join(BUNDLE, r, '.git'))) die(`${r} contains a .git directory — refusing`);
}
console.log('  ✓ no nested .git directories');

/* --------------------------------------------------------------------- plan */

const plan = repos.map((r) => ({ src: path.join(BUNDLE, r), name: `${r}${SUFFIX}`, from: r }));

// Plain walk, not `git ls-files` — the exported trees have no .git by design, which is
// the whole point of the clean-room export.
function countFiles(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    n += e.isDirectory() ? countFiles(path.join(dir, e.name)) : 1;
  }
  return n;
}

console.log(`\nPlan — ${plan.length} NEW PRIVATE repos under ${OWNER}/\n`);
for (const p of plan) {
  console.log(`  ${p.from.padEnd(26)} → ${OWNER}/${(p.name).padEnd(36)} ${countFiles(p.src)} files`);
}

if (!APPLY) {
  console.log('\nDRY RUN — nothing created. Re-run with --apply to create and push.');
  process.exit(0);
}

/* -------------------------------------------------------------------- apply */

console.log('\nApplying\n');
const results = [];

for (const p of plan) {
  const full = `${OWNER}/${p.name}`;
  try {
    // Never clobber an existing repo — a name collision means someone else's work.
    let exists = true;
    try { run('gh', ['repo', 'view', full], { stdio: 'pipe' }); }
    catch { exists = false; }
    if (exists) { console.log(`  skip  ${full} — already exists`); results.push([full, 'exists']); continue; }

    run('gh', ['repo', 'create', full, '--private',
      '--description', 'PII-clean, history-free licensing copy. Not the development repo.']);

    // One commit, no history. `git init` in the exported tree itself — the tree is a
    // throwaway copy, so initialising it here cannot touch a working repo.
    run('git', ['init', '-q', '-b', 'main'], { cwd: p.src });
    run('git', ['add', '-A'], { cwd: p.src });
    run('git', ['-c', 'user.name=Elena Revicheva', '-c', 'user.email=aipa@aideazz.xyz',
      'commit', '-q', '-m',
      'Licensing copy — PII and credentials removed, history-free\n\nBuilt by scripts/build-license-bundle.cjs from a clean-room export.\nNot the development repository.'], { cwd: p.src });
    run('git', ['remote', 'add', 'origin', `https://github.com/${full}.git`], { cwd: p.src });
    run('git', ['push', '-q', '-u', 'origin', 'main'], { cwd: p.src });

    console.log(`  ✓     ${full}`);
    results.push([full, 'created']);
  } catch (e) {
    const out = ((e.stdout || '') + (e.stderr || '') + (e.message || '')).split('\n').slice(0, 4).join(' ');
    console.log(`  ✖     ${full} — ${out}`);
    results.push([full, 'FAILED']);
  }
}

const failed = results.filter(([, s]) => s === 'FAILED');
console.log(`\ncreated=${results.filter(([, s]) => s === 'created').length} ` +
  `exists=${results.filter(([, s]) => s === 'exists').length} failed=${failed.length}`);

console.log(`
NEXT — these two steps are in DataVendor's UI and cannot be scripted:
  1. Integrations → GitHub → Manage access → grant the DataVendor App access to
     the new ${SUFFIX.replace(/^-/, '')} repos.
  2. Add supply → new listing → select them. QC re-runs on the snapshot.
  3. Archive the OLD listing only once the new one reads Active.
`);
process.exit(failed.length ? 2 : 0);
