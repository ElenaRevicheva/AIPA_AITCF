#!/usr/bin/env node
/**
 * rebuild-license-history.cjs — rebuild the `-licensed` repos WITH scrubbed full history.
 *
 * Why this exists: the first clean-room build was history-free by construction, which
 * satisfied "clean git history" and then scored 16% / $28,073 against the originals'
 * 44% / $89,481. HUD scores 97 points and grows the price exponentially from $1,500 to
 * $100,000; **Commits (13 pts) and Churn x complexity (5 pts) are history-derived**, and
 * collapsing 2,791 commits into 8 took both to zero.
 *
 * So: scrub the history, do not delete it.
 *
 * Two passes with git-filter-repo, on a THROWAWAY clone:
 *   1. --invert-paths   remove the sales/ops/runtime paths from every commit. This alone
 *                       removes most PII, since docs/selling/ and .wwebjs_auth/ carry it.
 *   2. --replace-text   rewrite the remaining secrets and addresses in every blob.
 *
 * The replacement list is EXTRACTED FIRST by this script using the same guarded logic as
 * build-license-bundle.cjs, then handed to filter-repo as LITERALS. That matters: a bare
 * regex in filter-repo has no length or date guards, and the guards are what stop
 * `claude-haiku-4-5-20251001` becoming a phone number. Extract with judgement, replace
 * literally.
 *
 * The working repos are never touched — every operation runs inside a scratch clone.
 *
 * Usage:
 *   node scripts/rebuild-license-history.cjs --only dragontrade-agent      # dry run
 *   node scripts/rebuild-license-history.cjs --only dragontrade-agent --apply
 *   node scripts/rebuild-license-history.cjs --apply                       # all 8
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const APPLY = argv.includes('--apply');
const ROOT = arg('--repos-root', 'D:/aideazz');
const SCRATCH = arg('--scratch', 'D:/aideazz/_license-history');
const CANARIES = arg('--canaries', 'D:/aideazz/_license-canaries.txt');
const ONLY = (arg('--only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const OWNER = 'ElenaRevicheva';

const FR = execFileSync('python', ['-c', 'import git_filter_repo;print(git_filter_repo.__file__)'],
  { encoding: 'utf8' }).trim();

/** local checkout → the GitHub repo name the licensed copy carries. */
const REPOS = [
  ['dragontrade-agent', 'dragontrade-agent'],
  ['AILA', 'AILA'],
  ['atlas-captures', 'atlas-captures'],
  ['EspaLuz_Influencer', 'EspaLuz_Influencer'],
  ['EspaLuzFamilybot', 'EspaLuzFamilybot'],
  ['VibeJobHunterAIPA_AIMCF', 'VibeJobHunterAIPA_AIMCF'],
  ['EspaLuzWhatsApp', 'EspaLuzWhatsApp'],
  ['ai-cofounders/cto-aipa', 'AIPA_AITCF'],
];
const DATA_REPOS = new Set(['atlas-captures']);

/** Paths stripped from EVERY commit. Same list as the snapshot build. */
/**
 * `--keep dist-lambda` exists because dropping generated code COSTS MONEY. HUD's estimator
 * note says SOURCE LOC counts "checked-in generated or vendored code", and the mirror that
 * dropped `dist-lambda/` reported `SOURCE LOC: Unavailable` and scored 16% while the
 * ORIGINAL repo passed `codebase complexity`. 3 files, 173,562 lines, 4 emails, 0
 * credentials — cheap to scrub, expensive to omit.
 * The mirror should differ from the original ONLY by PII, never by my own tidiness.
 */
const KEEP = (arg('--keep', '') || '').split(',').map((s) => s.trim()).filter(Boolean);

const DROP_PATHS_ALL = [
  'docs/selling', 'docs/oracle', 'docs/applications', 'docs/interview',
  'dist-lambda', 'backups', 'docs/hubspot', 'docs/crm',
  '.wwebjs_auth', '.wwebjs_cache', '__pycache__', 'node_modules', '.venv', 'venv',
];
const DROP_PATHS = DROP_PATHS_ALL.filter((d) => !KEEP.some((k) => d.replace(/\/$/, '') === k));
const DROP_GLOBS = [
  '*.pyc', '*.pyo', '*.ldb', '*.pid', '*.sqlite', '*.sqlite3', '*.db',
  '*.pem', '*.p12', '*.pfx', '*.jks', '*.ppk', '*.key', '.env', '.env.*',
  'outreach-registry.json',
];
/** `*.log` is runtime noise everywhere EXCEPT a data repo, where the log is the product. */
const LOG_GLOB = '*.log';

const SAFE_EMAIL = /@(example\.(com|org|net)|test\.com|localhost|sentry\.io|schema\.org|w3\.org|npmjs\.com|users\.noreply\.github\.com)$/i;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?<![\w+-])(\+?)\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?![\w-])/g;
const PHONE_E164_RE = /(?<![\w+-])(\+)\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?![\w-])/g;
const DATEISH = /^(19|20)\d{6}$/;
const URL_CRED_RE = /\b[a-z][a-z0-9+.-]*:\/\/[A-Za-z0-9._%+-]{1,64}:([^@/\s"'`<>${}]{3,256})@/g;
const SQL_PW_RE = /\b(?:PASSWORD|IDENTIFIED\s+BY)\s+['"]([^'"\n\r]{4,200})['"]/gi;
const DB_HOST_RE = /\b[a-z0-9-]+\.proxy\.(?:rlwy\.net|render\.com)\b/gi;
const VENDOR_RE = /\b(sk-ant-api\d{2}-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{30,}|sk-proj-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|gsk_[A-Za-z0-9]{40,}|AIza[A-Za-z0-9_-]{35}|AKIA[0-9A-Z]{16}|\d{9,10}:AA[A-Za-z0-9_-]{32,})\b/g;

const OWNER_ID_EMAIL = 'ElenaRevicheva' + '@users.noreply.github.com';
const OWNER_EMAILS = new Set(['elena.revicheva2016' + '@gmail.com', 'aipa@aideazz.xyz',
  'elena@aideazz.xyz', 'elena@aideazz.com', 'your-email@example.com',
  // Replit stamps commits with its own per-user noreply identity.
  '42326283-elenarevicheva2@users.noreply.replit.com']);
/** Passwords that are documentation, not credentials — `postgres:password@host:port/db`. */
const PW_PLACEHOLDER = /^(password|passwd|pass|secret|token|user|admin|root|test|changeme|your[-_]?password|\.+|host|port|db)$/i;

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 30, ...opts });

function die(m) { console.error(`\n✖ ${m}`); process.exit(1); }

/**
 * Harvest every literal that must be replaced, from the WHOLE history, applying the same
 * guards as the snapshot scrubber. Emitting literals rather than regexes is deliberate:
 * filter-repo would apply a raw pattern with no length or date check, and those checks are
 * the only thing separating a phone number from a version string or an epoch timestamp.
 */
function harvest(src, dataRepo) {
  const emails = new Map();
  const phones = new Set();
  const secrets = new Set();
  let stable = (s, n) => parseInt(crypto.createHash('sha1').update(s.toLowerCase()).digest('hex').slice(0, 8), 16) % n;

  // Keep ONLY added/removed CONTENT lines. `git log -p` also emits `diff --git`,
  // `index 4842332..abc 100644`, `@@` hunk headers and `+++ b/path` — and the first run
  // harvested "4842332 100644" as a PHONE NUMBER from an index line. Commit headers
  // (Author:, Date:) are dropped here too; author identity is handled by --mailmap.
  const raw = run('git', ['log', '--all', '-p', '--no-color', '--no-renames'], { cwd: src });
  const content = raw.split('\n')
    .filter((l) => (l.startsWith('+') || l.startsWith('-')) && !/^(\+\+\+|---)/.test(l))
    .map((l) => l.slice(1))
    .join('\n');
  // COMMIT MESSAGES ARE A SOURCE TOO. Harvesting only from diffs meant an address that
  // appears solely in a message — an applications address on a school domain, in EspaLuzFamilybot, — got no
  // replacement rule at all, so --replace-message had nothing to apply and it survived.
  // The verify pass already reads three surfaces; the harvester has to read them as well,
  // or it writes rules for a smaller world than the checker inspects.
  const messages = run('git', ['log', '--all', '--format=%B'], { cwd: src });
  const diff = content + '\n' + messages;

  // Keyed by the ORIGINAL spelling, not the lowercased one. filter-repo's --replace-text
  // is CASE-SENSITIVE, so a rule written in lowercase never matched the UPPERCASE literal
  // of the same third-party address in the file — it survived the first run
  // while the log happily reported the rule as applied. Identity is decided
  // case-insensitively; the rule is emitted once per distinct casing actually present.
  const byLc = new Map();
  for (const m of diff.match(EMAIL_RE) || []) {
    if (SAFE_EMAIL.test(m)) continue;
    // `postgresql://user:pass@host` and doc placeholders like `...:...@...railway.app`
    // both match an email pattern. Neither is an address, and rewriting them as one
    // produces nonsense in the licensed copy.
    if (m.includes('..')) continue;
    if (m.split('@')[0].length > 40) continue;
    const lc = m.toLowerCase();
    if (!byLc.has(lc)) {
      // Her own addresses resolve to the same GitHub noreply identity the mailmap sets,
      // so authorship stays coherent across metadata, messages and file content.
      byLc.set(lc, OWNER_EMAILS.has(lc) ? OWNER_ID_EMAIL
        : `contact${String(byLc.size + 1).padStart(3, '0')}@example.com`);
    }
    emails.set(m, byLc.get(lc));
  }
  for (const m of diff.match(dataRepo ? PHONE_E164_RE : PHONE_RE) || []) {
    const digits = m.replace(/[^0-9]/g, '');
    if (digits.length < 9 || digits.length > 15) continue;   // versions, ports, short ids
    if (DATEISH.test(digits)) continue;                      // YYYYMMDD is a date
    // A literal containing whitespace is almost never a phone in this corpus; it is a
    // table cell or two adjacent numbers. Replacing it as one string corrupts both.
    if (/\s/.test(m)) continue;
    // 13-digit ms epoch timestamps read as phones. Real numbers here are <= 12 digits.
    if (digits.length >= 13 && !m.startsWith('+')) continue;
    // Round numbers are MONEY, not phones. dragontrade-agent is a trading repo, and the
    // first harvest wanted to rewrite 850000000000 and 25000000000 — market caps and
    // position sizes — into fake Panama mobile numbers. No real phone ends in five zeros.
    if (/0{5,}$/.test(digits)) continue;
    // Likewise a long run of one repeated digit is a placeholder or a padded constant.
    if (/(\d)\1{7,}/.test(digits)) continue;
    phones.add(m);
  }
  // A captured "secret" still has to LOOK like one. The first run harvested the literal
  // word `password` and the literal `...` out of documentation examples, and a rule like
  // `password==>REDACTED` rewrites the word everywhere in the codebase — silent corruption
  // that no email check would ever catch.
  const PLACEHOLDER = /^(your|example|placeholder|change[_-]?me|xxx+|dummy|sample|redacted|insert|here|password|passwd|secret|token|user|pass|admin|root|test|\.+)$/i;
  const looksSecret = (v) => v && v.length >= 8 && !/\s/.test(v) && !/[${}<>]/.test(v)
    && !PLACEHOLDER.test(v) && !/^\.+$/.test(v) && /[A-Za-z0-9]/.test(v);
  for (const re of [URL_CRED_RE, SQL_PW_RE]) {
    let m; re.lastIndex = 0;
    while ((m = re.exec(diff)) !== null) if (looksSecret(m[1])) secrets.add(m[1]);
  }
  for (const m of diff.match(VENDOR_RE) || []) secrets.add(m);
  for (const m of diff.match(DB_HOST_RE) || []) secrets.add(m);

  // 🚨 The canary list is not only a checker — anything on it that is PRESENT in this
  // history must be REWRITTEN, not merely reported. AIPA_AITCF carries Elena's cédula
  // (<redacted-see-canary-file>) and carné serial in old commits: the 4 Sep near-miss put the number in
  // a verifier script, and `scripts/` ships. Dropping `docs/selling/` never touched it.
  if (fs.existsSync(CANARIES)) {
    for (const c of fs.readFileSync(CANARIES, 'utf8').split(/\r?\n/)) {
      const v = c.trim();
      if (v && !v.startsWith('#') && diff.includes(v)) secrets.add(v);
    }
  }

  return { emails, phones, secrets, bytes: diff.length };
}

function writeReplacements(file, { emails, phones, secrets }) {
  const lines = [];
  // Longest first: filter-repo applies rules in order, and a short literal that is a
  // substring of a longer one would otherwise shadow it.
  for (const s of [...secrets].sort((a, b) => b.length - a.length)) lines.push(`${s}==>REDACTED`);
  for (const [addr, rep] of [...emails].sort((a, b) => b[0].length - a[0].length)) lines.push(`${addr}==>${rep}`);
  for (const p of [...phones].sort((a, b) => b.length - a.length)) {
    const plus = p.startsWith('+') ? '+' : '';
    lines.push(`${p}==>${plus}50700000${String(parseInt(crypto.createHash('sha1').update(p).digest('hex').slice(0, 8), 16) % 100).padStart(2, '0')}`);
  }
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  return lines.length;
}

function rebuild([local, name]) {
  const src = path.join(ROOT, local);
  const work = path.join(SCRATCH, name);
  const dataRepo = DATA_REPOS.has(path.basename(local));
  if (!fs.existsSync(path.join(src, '.git'))) return console.log(`  skip (no .git): ${local}`);

  const before = run('git', ['rev-list', '--count', 'HEAD'], { cwd: src }).trim();
  console.log(`\n▸ ${name}  (${before} commits)`);

  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(SCRATCH, { recursive: true });
  // --no-local forces a real object copy rather than hardlinks into the source .git.
  // Hardlinks + a history rewrite is how you damage the repo you promised not to touch.
  run('git', ['clone', '--no-local', '--quiet', src, work]);

  console.log('   harvesting replacements from full history…');
  const h = harvest(work, dataRepo);
  const rulesFile = path.join(SCRATCH, `${name}.replacements.txt`);
  const n = writeReplacements(rulesFile, h);
  console.log(`   ${h.emails.size} emails · ${h.phones.size} phones · ${h.secrets.size} secrets → ${n} rules`);

  if (!APPLY) { console.log('   DRY RUN — stopping before rewrite'); return; }

  const globs = DROP_GLOBS.concat(dataRepo ? [] : [LOG_GLOB]);
  const pathArgs = [];
  for (const p of DROP_PATHS) pathArgs.push('--path', p);
  for (const g of globs) pathArgs.push('--path-glob', g);

  // Author metadata carries her PERSONAL gmail on every commit. Map it to the GitHub
  // noreply form: standard, non-identifying, and it keeps her as the single contributor
  // so the "contributor entries" measurement still counts her.
  const mailmapFile = path.join(SCRATCH, `${name}.mailmap`);
  const ID = 'Elena Revicheva <ElenaRevicheva' + '@users.noreply.github.com>';
  fs.writeFileSync(mailmapFile, [
    ...[...OWNER_EMAILS].map((e) => `${ID} <${e}>`),
  ].join('\n') + '\n', 'utf8');

  console.log('   pass 0/2  normalising author identity…');
  run('python', [FR, '--mailmap', mailmapFile, '--force'], { cwd: work, stdio: 'pipe' });

  console.log('   pass 1/2  stripping paths from every commit…');
  run('python', [FR, ...pathArgs, '--invert-paths', '--force'], { cwd: work, stdio: 'pipe' });

  // --replace-text touches BLOBS ONLY. Her address survived in 33 Co-Authored-By trailers
  // until --replace-message was added: three different surfaces carry an email (author
  // metadata, commit message, file content) and each needs its own instrument.
  console.log('   pass 2/2  rewriting blobs and commit messages…');
  run('python', [FR, '--replace-text', rulesFile, '--replace-message', rulesFile, '--force'],
    { cwd: work, stdio: 'pipe' });

  const after = run('git', ['rev-list', '--count', 'HEAD'], { cwd: work }).trim();
  console.log(`   commits: ${before} → ${after}`);
  return { name, work, before, after };
}

/** Independent check of the REWRITTEN HISTORY, not just the final tree. */
function verifyHistory(work) {
  const canaries = fs.existsSync(CANARIES)
    ? fs.readFileSync(CANARIES, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'))
    : [];
  const raw = run('git', ['log', '--all', '-p', '--no-color'], { cwd: work });
  // THREE SURFACES, checked separately. Scanning the raw `git log -p` as one blob made a
  // Python decorator look like an address: on a diff line whose `+` prefix abuts a Python route decorator, that prefix
  // became the local part and `app.route` the domain. Content must be read without the
  // prefix; messages and author identity are their own surfaces and need their own reads.
  const content = raw.split('\n')
    .filter((l) => (l.startsWith('+') || l.startsWith('-')) && !/^(\+\+\+|---)/.test(l))
    .map((l) => l.slice(1)).join('\n');
  const messages = run('git', ['log', '--all', '--format=%B'], { cwd: work });
  const authors = run('git', ['log', '--all', '--format=%an <%ae>%n%cn <%ce>'], { cwd: work });

  const bad = {};
  // Bot/vendor noreply addresses in Co-Authored-By trailers are not personal data.
  // Platform noreply addresses: GitHub web-UI commits, Replit, and the AI agents.
  // These are machine identities, not personal data.
  const BOT_EMAIL = /^(noreply@(anthropic|github)\.com|cursoragent@cursor\.com|.*@users\.noreply\.(github|replit)\.com)$/i;
  const findEmails = (t) => (t.match(EMAIL_RE) || [])
    .filter((m) => !SAFE_EMAIL.test(m) && !/^contact\d+@example\.com$/i.test(m)
      && !/@example\.com$/i.test(m) && !BOT_EMAIL.test(m)
      && !m.includes('..') && m.split('@')[0].length <= 40);
  for (const [label, text] of [['emails', content], ['emailsInMessages', messages], ['emailsInAuthors', authors]]) {
    const hits = findEmails(text);
    if (hits.length) bad[label] = [...new Set(hits)].slice(0, 5);
  }
  const diff = content;
  // Blunt, but not wrong: `postgresql://postgres:password@host:port/db` in a README is an
  // instruction, not a leak. Only an explicit, narrow placeholder list is exempt —
  // anything else still trips the gate, including anything the harvester talked itself
  // out of.
  const credRe = /\b[a-z][a-z0-9+.-]*:\/\/[A-Za-z0-9._%+-]{1,64}:([^@/\s"'`<>${}]{6,})@/g;
  const creds = [];
  let cm;
  while ((cm = credRe.exec(diff)) !== null) {
    // `https://x-access-token:contact241@…` is our OWN placeholder landing inside a URL.
    if (cm[1] === 'REDACTED' || /^contact\d+$/i.test(cm[1]) || PW_PLACEHOLDER.test(cm[1])) continue;
    creds.push(cm[0]);
  }
  if (creds.length) bad.credUrls = [...new Set(creds)].slice(0, 3);
  const hits = canaries.filter((c) => diff.includes(c));
  if (hits.length) bad.canaries = hits;
  return bad;
}

const list = REPOS.filter(([, name]) => !ONLY.length || ONLY.includes(name) || ONLY.includes(path.basename(REPOS.find((r) => r[1] === name)[0])));

console.log(`filter-repo: ${FR}`);
console.log(`scratch:     ${SCRATCH}`);
console.log(`repos:       ${list.map(([, n]) => n).join(', ')}`);

const done = [];
for (const r of list) {
  const res = rebuild(r);
  if (!res) continue;
  console.log('   verifying rewritten history…');
  const bad = verifyHistory(res.work);
  if (Object.keys(bad).length) {
    console.log(`   ✖ VERIFY FAILED: ${JSON.stringify(bad)}`);
    console.log('   not pushing this repo');
    continue;
  }
  console.log('   ✓ history clean');
  done.push(res);
}

if (!APPLY) { console.log('\nDRY RUN complete.'); process.exit(0); }

console.log('\nPushing\n');
for (const d of done) {
  const full = `${OWNER}/${d.name}-licensed`;
  // Guard: force-push is only ever allowed against a `-licensed` mirror, which holds
  // nothing but the throwaway single commit this script replaces. Never a working repo.
  if (!/-licensed$/.test(full.split('/')[1])) die(`refusing to force-push to ${full}`);
  try {
    run('git', ['remote', 'remove', 'origin'], { cwd: d.work, stdio: 'pipe' });
  } catch { /* filter-repo already dropped it */ }
  run('git', ['remote', 'add', 'origin', `https://github.com/${full}.git`], { cwd: d.work });
  const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: d.work }).trim();
  run('git', ['push', '--force', '--quiet', 'origin', `${branch}:main`], { cwd: d.work });
  console.log(`  ✓ ${full}  ${d.after} commits`);
}
console.log('\nDone. Re-run the HUD estimate before listing.');
