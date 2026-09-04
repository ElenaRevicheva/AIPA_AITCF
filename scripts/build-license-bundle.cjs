#!/usr/bin/env node
/**
 * build-license-bundle.cjs — produce a PII-clean, history-free licensing bundle.
 *
 * Why this exists: the DataVendor QC PII check fails on the 8-pack. The PII is real
 * (prospect contact data), not a false positive. But it must NOT be scrubbed out of the
 * working repos — the outreach tooling needs those addresses to run. So the scrub happens
 * on an EXPORTED COPY and the live repos are never touched.
 *
 * History-free by construction: each repo is exported with `git archive HEAD`, which emits
 * a single flat tree with no .git and no commit history. That satisfies "clean git history"
 * without a filter-repo rewrite of repos that deploy from git (IRON RULE: never destroy).
 *
 * Usage:
 *   node scripts/build-license-bundle.cjs --out <dir> [--repos-root <dir>] [--verify-only]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const REPOS_ROOT = arg('--repos-root', 'D:/aideazz');
const OUT = arg('--out', path.join(REPOS_ROOT, '_license-bundle'));
const VERIFY_ONLY = argv.includes('--verify-only');

/** The 8-pack. Confirm against the live listing before shipping. */
const REPOS = [
  'ai-cofounders/cto-aipa',
  'ai-cofounders/cmo-aipa',
  'VibeJobHunterAIPA_AIMCF',
  'EspaLuzFamilybot',
  'EspaLuzWhatsApp',
  'EspaLuz_Influencer',
  'whitespace',
  'aideazz',
];

/**
 * Directories dropped from the bundle entirely. These are sales/ops working material —
 * CRM dumps, outreach registries, job applications. They carry the overwhelming majority
 * of the third-party PII and contain almost no code, so dropping them costs the buyer
 * nothing and removes the risk wholesale.
 */
const DROP_DIRS = [
  'docs/selling/', 'docs/oracle/', 'docs/applications/', 'docs/interview/',
  'dist-lambda/', 'backups/', 'docs/hubspot/', 'docs/crm/',
];
const DROP_FILES = /(^|\/)(\.env(\..*)?|.*\.pem|.*\.p12|.*\.key|outreach-registry\.json)$/i;
const TEXT_EXT = /\.(ts|tsx|js|jsx|cjs|mjs|py|sh|json|md|txt|yml|yaml|html|css|sql|toml|ini|env\.example)$/i;

/** Addresses that are already non-identifying and must survive untouched. */
const SAFE_EMAIL = /@(example\.(com|org|net)|test\.com|localhost|sentry\.io|schema\.org|w3\.org|npmjs\.com|users\.noreply\.github\.com)$/i;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/**
 * Panama/CR/MX/intl E.164-ish numbers as they appear in the prospect data.
 * The lookarounds are load-bearing: without them this matches the tail of hyphenated
 * identifiers and destroys them — `claude-haiku-4-5-20251001` became a phone number in
 * the first run. Never match a run of digits that is glued to a word char or a hyphen.
 */
const PHONE_RE = /(?<![\w+-])(\+?)\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?![\w-])/g;
/** YYYYMMDD and YYYY-MM-DD read as 8-digit "phones". They are dates. */
const DATEISH = /^(19|20)\d{6}$/;
/** HubSpot record ids appear as /record/0-1/12345678901 — never publish these. */
const HS_ID_RE = /(record\/0-\d+\/)\d{6,}/g;

const emailMap = new Map();
const stable = (s, n) => parseInt(crypto.createHash('sha1').update(s.toLowerCase()).digest('hex').slice(0, 8), 16) % n;
function placeholderEmail(addr) {
  const lc = addr.toLowerCase();
  if (!emailMap.has(lc)) emailMap.set(lc, `contact${String(emailMap.size + 1).padStart(3, '0')}@example.com`);
  return emailMap.get(lc);
}

const stats = { files: 0, dropped: 0, emails: 0, phones: 0, hsids: 0 };

function scrub(text) {
  let out = text.replace(EMAIL_RE, (m) => {
    if (SAFE_EMAIL.test(m)) return m;
    stats.emails++;
    return placeholderEmail(m);
  });
  out = out.replace(HS_ID_RE, (m, p) => { stats.hsids++; return `${p}000000000`; });
  out = out.replace(PHONE_RE, (m, plus) => {
    const digits = m.replace(/[^0-9]/g, '');
    // Leave version strings, ports, timestamps and short numerics alone.
    if (digits.length < 9 || digits.length > 15) return m;
    if (DATEISH.test(digits)) return m;
    stats.phones++;
    // Preserve the original +/no-+ shape so `wa.me/507…` stays a valid link.
    return `${plus}50700000${String(stable(m, 100)).padStart(2, '0')}`;
  });
  return out;
}

function keep(rel) {
  const p = rel; // git ls-files always emits forward slashes
  if (DROP_DIRS.some((d) => p.startsWith(d))) return false;
  if (DROP_FILES.test(p)) return false;
  return true;
}

function exportRepo(repo) {
  const src = path.join(REPOS_ROOT, repo);
  if (!fs.existsSync(path.join(src, '.git'))) return console.log(`  skip (no .git): ${repo}`);
  const dest = path.join(OUT, repo.split('/').join('__'));
  fs.mkdirSync(dest, { recursive: true });

  // -z, not plain ls-files: git QUOTES paths containing non-ASCII ("CL\303\215NICA…"),
  // and a quoted path fails every startsWith() in keep() — so PII-bearing files sail past
  // the drop filter and then die in `git show`. NUL-separated output is never quoted.
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: src, encoding: 'utf8', maxBuffer: 1 << 28 })
    .split('\0').filter(Boolean);

  let kept = 0;
  for (const rel of files) {
    if (!keep(rel)) { stats.dropped++; continue; }
    let buf;
    // Read from the commit, not the working tree: uncommitted local edits never ship.
    try { buf = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: src, maxBuffer: 1 << 28 }); }
    catch { continue; }
    const target = path.join(dest, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (TEXT_EXT.test(rel)) fs.writeFileSync(target, scrub(buf.toString('utf8')), 'utf8');
    else fs.writeFileSync(target, buf);
    kept++; stats.files++;
  }
  console.log(`  ${repo}: ${kept} files kept`);
}

/** Independent re-scan of the OUTPUT. The scrubber does not get to grade its own work. */
function verify() {
  const bad = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) { walk(fp); continue; }
      if (!TEXT_EXT.test(e.name)) continue;
      const t = fs.readFileSync(fp, 'utf8');
      const hits = (t.match(EMAIL_RE) || []).filter((m) => !SAFE_EMAIL.test(m));
      if (hits.length) bad.push([path.relative(OUT, fp), [...new Set(hits)].length]);
    }
  })(OUT);
  return bad;
}

if (!VERIFY_ONLY) {
  if (fs.existsSync(OUT)) { console.error(`refusing to overwrite existing ${OUT} — remove it first`); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`Exporting to ${OUT}\n`);
  REPOS.forEach(exportRepo);
  fs.writeFileSync(path.join(OUT, '_SCRUB_MANIFEST.json'),
    JSON.stringify({ generated: new Date().toISOString(), stats, distinctEmailsReplaced: emailMap.size, droppedDirs: DROP_DIRS }, null, 2));
  console.log(`\nfiles=${stats.files} dropped=${stats.dropped} emails=${stats.emails} phones=${stats.phones} hubspotIds=${stats.hsids}`);
}

const bad = verify();
console.log(`\nVERIFY: ${bad.length ? `${bad.length} file(s) STILL carry a real address` : 'clean — no real email addresses remain'}`);
bad.slice(0, 20).forEach(([f, n]) => console.log(`  ${n}  ${f}`));
process.exit(bad.length ? 2 : 0);
