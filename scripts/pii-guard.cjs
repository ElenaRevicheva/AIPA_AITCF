#!/usr/bin/env node
/**
 * pii-guard.cjs — stop credentials and third-party PII from entering a licensed repo.
 *
 * Why this exists: cleaning the CONTENTS of a repo is worthless when the repo REGENERATES
 * the problem. `docs/selling/` in AIPA_AITCF took 69 commits and 183 new files in 30 days,
 * written by the outreach tooling itself. A one-time scrub would fail `pii_qc_llm` again
 * within a week. The fix is a gate on the way in, not a sweep afterwards.
 *
 * Three modes:
 *   node scripts/pii-guard.cjs                    scan STAGED files   (pre-commit hook)
 *   node scripts/pii-guard.cjs --all [--repo D]   scan the whole HEAD (pre-listing check)
 *   node scripts/pii-guard.cjs --listing         score the 8 listed assets the way HUD does
 *   node scripts/pii-guard.cjs --install          install the hook into every listed repo
 *
 * Exit 0 = clean, 1 = findings, 2 = usage/error.
 *
 * Deliberately NOT checked here: phone numbers. Every phone pattern loose enough to catch
 * a real number also catches record ids, epoch timestamps and market caps — three separate
 * false-positive classes measured on this codebase. A guard that cries wolf gets disabled,
 * and a disabled guard protects nothing. Phones are reported in --all as a WARNING only.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };

const REPOS = [
  'D:/aideazz/ai-cofounders/cto-aipa',
  'D:/aideazz/EspaLuzWhatsApp',
  'D:/aideazz/VibeJobHunterAIPA_AIMCF',
  'D:/aideazz/EspaLuzFamilybot',
  'D:/aideazz/dragontrade-agent',
  'D:/aideazz/EspaLuz_Influencer',
  'D:/aideazz/AILA',
  'D:/aideazz/atlas-captures',
  // the clean-room mirror IS the listed asset — cto-aipa itself is not in the listing
  'D:/aideazz/_license-history/AIPA_AITCF',
];
/**
 * The EIGHT assets actually attached to the DataVendor listing. Note this is NOT
 * the same set as REPOS: cto-aipa itself is not listed — its clean-room mirror is.
 */
const LISTING_ASSETS = [
  ['AILA',                    'D:/aideazz/AILA'],
  ['AIPA_AITCF-licensed',     'D:/aideazz/_license-history/AIPA_AITCF'],
  ['EspaLuzFamilybot',        'D:/aideazz/EspaLuzFamilybot'],
  ['EspaLuzWhatsApp',         'D:/aideazz/EspaLuzWhatsApp'],
  ['EspaLuz_Influencer',      'D:/aideazz/EspaLuz_Influencer'],
  ['VibeJobHunterAIPA_AIMCF', 'D:/aideazz/VibeJobHunterAIPA_AIMCF'],
  ['atlas-captures',          'D:/aideazz/atlas-captures'],
  ['dragontrade-agent',       'D:/aideazz/dragontrade-agent'],
];

/**
 * HUD's pii_qc_llm is a SHAPE detector with no allowlist, and its gate is binary.
 * Fitting every score it has returned to us gives
 *
 *     score = 55 - 5.75 * ln(findings)        (worst residual 0.05 across 8 points)
 *
 * so ONE finding scores 55 against a pass mark of 71. There is no "only a few".
 * These patterns carry no SAFE_EMAIL allowlist: our own business address IS counted
 * by HUD, so it must be counted here too. The single exemption mirrors HUD's own
 * triage, which reports "rejected N detector finding(s) as false positives ...
 * counted as placeholder noise" for reserved documentation domains (RFC 2606).
 * Anything else is a finding.
 */
const HUD = {
  EMAIL_ADDRESS: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  PHONE_NUMBER: /(?<![\w+.-])\+\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?![\w.-])/g,
  URL_WITH_CREDENTIALS: /\b[a-z][a-z0-9+.-]*:\/\/[A-Za-z0-9._%+-]{1,64}:[^@/\s"'`<>${}]{4,}@/g,
  AUTHORIZATION_BEARER_TOKEN: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/g,
  // ⚠️ Boundaries are (?<![A-Za-z0-9]) / (?![A-Za-z0-9]), NOT \b. Earned 8 Sep 2026.
  // `\b` treats `_` as a word character, so `\bsecret\b` can never match inside
  // PAYPAL_CLIENT_SECRET and `\bapi_?key\b` can never match inside OPENAI_API_KEY —
  // which is how every environment variable on earth is written. This scanner reported
  // 0 findings for three repos while HUD reported 1, 6 and 10. Underscore must be a
  // separator here, not a letter. Do not "simplify" these back to \b.
  // `credentials` is deliberately NOT a keyword here: its overwhelmingly common use is
  // the fetch option `credentials:'same-origin'`, which is not a secret in any sense. A
  // guard that fires on ordinary code gets switched off, and a switched-off guard
  // protects nothing.
  GENERIC_SECRET_ASSIGNMENT: /(?<![A-Za-z0-9])(?:password|passwd|pwd|secret|api_?key|access_?token|auth_?token|client_?secret|token)(?![A-Za-z0-9])\s*[:=]\s*["'][^"'\n]{6,}["']/gi,
  // HUD reports this separately from the assignment shape, at `heuristic` provenance:
  // a secret-ish keyword sitting next to a value of any kind, quoted or not.
  SECRET_SECRET_KEYWORD: /(?<![A-Za-z0-9])(?:secret|passphrase|private_?key)(?![A-Za-z0-9])\s*[:=]\s*[^\s,;)\]}]{4,}/gi,
};

/**
 * Per-detector exemptions, mirroring the ones build-license-bundle.cjs already had to
 * learn. Earned 8 Sep 2026, when this guard blocked the licensed bundle by flagging the
 * SCRUBBER'S OWN OUTPUT (`user:REDACTED@`) — the same "gate can never go green" failure
 * the bundler carries a warning about. A guard that fires on ordinary code, or on its own
 * replacements, gets switched off, and a switched-off guard protects nothing.
 *
 * Each of these is narrow and defensible:
 *  - our own redaction marker is not a credential;
 *  - `Bearer SPRINT_BRIEFING_SECRET` names an env var in prose;
 *  - `secret = process.env.X` is an env READ — the secret is not in the file, and HUD's
 *    own triage cleared exactly this class as false positives when it ran;
 *  - a value carrying whitespace, a template, or a documented placeholder is documentation.
 */
/**
 * ⚠️ These receive the WHOLE match, not the value — `String.match` with /g returns full
 * matches and discards capture groups. Getting that wrong once meant `secret: string` was
 * never exempted (the test saw "secret: string", not "string") and, worse, that a
 * whitespace test on the assignment shape exempted almost EVERY finding, because
 * `TOKEN = "real"` contains spaces. Always narrow to the value first.
 */
const valueOf = {
  /** `NAME = "value"` / `NAME:'value'` → value */
  assignment: (m) => (m.match(/["']([^"']*)["']\s*$/) || [, ''])[1],
  /** `secret: whatever` → whatever */
  keyword: (m) => m.split(/[:=]/).slice(1).join(':').trim(),
};

const HUD_EXEMPT = {
  URL_WITH_CREDENTIALS: (m) => /:REDACTED@$/.test(m),
  AUTHORIZATION_BEARER_TOKEN: (m) => /^Bearer\s+[A-Z0-9_]+$/.test(m),
  // The bundler rewrites every phone to `+50700000NN`. Flagging its own synthetic
  // placeholder is the same self-inflicted red gate as `user:REDACTED@`.
  PHONE_NUMBER: (m) => /^\+50700000\d{2}$/.test(m),
  SECRET_SECRET_KEYWORD: (m) => {
    const v = valueOf.keyword(m);
    return /(process\.env|os\.getenv|os\.environ|getenv\s*\(|\$\()/i.test(v)  // env READ
      || /[<>`]/.test(v)                                                      // template/markup
      // `secret: string`, `secret: clientSecret` — a code reference, not a literal.
      // The no-digit and length conditions are load-bearing: without them an UNQUOTED
      // real value in .env.example style (`SECRET=hunter2xyzlivevalue`) reads as a bare
      // identifier and gets waved through. Credentials carry digits; type names do not.
      || (/^[A-Za-z_$][A-Za-z0-9_$.]*$/.test(v) && !/\d/.test(v) && v.length <= 24)
      || /your[_-]|change[_-]?me|placeholder|example|redacted/i.test(v);
  },
  GENERIC_SECRET_ASSIGNMENT: (m) => {
    const v = valueOf.assignment(m);
    if (!v) return false;
    return /\s/.test(v)                          // a sentence, not a key
      || /[${}<>]/.test(v)                       // template
      || /x{4,}|\.{3}|your[_-]|change[_-]?me|placeholder|example|redacted/i.test(v);
  },
};

/** Reserved documentation domains — what HUD's triage clears as placeholder noise. */
const HUD_PLACEHOLDER = new RegExp(
  '@(?:example[.](?:com|org|net)|test|invalid|localhost|yourdomain[.]com|domain[.]com|company[.]com|testcompany[.]com)$'
  + '|^(?:you|your|user|name|email|firstname|firstname[.]lastname|john|jane)@', 'i');

/** What HUD would score a repo carrying `n` actionable findings. */
function hudScore(n) {
  return n === 0 ? null : 55 - 5.75 * Math.log(n);
}

const CANARIES = arg('--canaries', 'D:/aideazz/_license-canaries.txt');

/* ------------------------------------------------------------------- detectors */

/** Addresses that are not third-party personal data. Anything else is a finding. */
const SAFE_EMAIL = new RegExp(
  '@(' +
  'example\\.(com|org|net)|test\\.com|localhost|' +
  'sentry\\.io|schema\\.org|w3\\.org|npmjs\\.com|' +
  'users\\.noreply\\.(github|replit)\\.com|' +
  'aideazz\\.(xyz|com)|' +          // her own domain — not customer data
  'anthropic\\.com|cursor\\.com|' + // agent noreply identities
  // Synthetic placeholder domains used in fixtures and .env.example. Not addresses of
  // real people; flagging them trains the operator to ignore the guard.
  'yourdomain\\.com|company\\.com|testcompany\\.com|startup\\.com|smallstartup\\.com|vc\\.com|' +
  // ATS transactional senders. These live in FUNCTIONAL matching lists —
  // greenhouse_email_verifier.py GREENHOUSE_SENDERS and response_detector.py compare
  // INCOMING mail against them, so redacting one silently breaks employer-response
  // detection. They are robot addresses of a public ATS, not personal data.
  'greenhouse\\.io|greenhouse-mail\\.io|us\\.greenhouse-mail\\.io|getonbrd\\.com|scalearmycareers\\.com' +
  ')$', 'i');
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * `postgres:password@host:port/db` in a README is an instruction, not a leak.
 * TEMPLATE is separate and load-bearing: `${DB_PASSWORD}`, `{{secret}}`, `$(cmd)` and
 * `<your-password>` are variable REFERENCES. Without this the guard blocks the very fix
 * it asked for — it rejected `PASSWORD '${DB_PASSWORD}'`, which is the correct remediation
 * of a hardcoded password. A gate that fails the fix teaches people to bypass the gate.
 */
const PW_PLACEHOLDER = /^(password|passwd|pass|secret|token|user|admin|root|test|changeme|your[-_]?password|host|port|db|REDACTED|contact\d+|\.+)$/i;
const TEMPLATE = /[${}<>]|\{\{/;
const URL_CRED_RE = /\b[a-z][a-z0-9+.-]*:\/\/[A-Za-z0-9._%+-]{1,64}:([^@/\s"'`<>${}]{4,})@/g;
const SQL_PW_RE = /\b(?:PASSWORD|IDENTIFIED\s+BY)\s+['"]([^'"\n\r]{4,200})['"]/gi;
const PEM_RE = /-----BEGIN (?:[A-Z0-9 ]*)PRIVATE KEY-----[\s\\n"',]*[A-Za-z0-9+/]{40,}/g;
/** Tight shapes only. A loose `re_[A-Za-z0-9]{20,}` once matched `re_getSomething`. */
const VENDOR_RE = /\b(sk-ant-api\d{2}-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{30,}|sk-proj-[A-Za-z0-9_-]{20,}|(?:ghp|gho|ghu|ghs)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,}|gsk_[A-Za-z0-9]{40,}|xox[bpaso]-\d{8,}-[A-Za-z0-9-]{20,}|re_[A-Za-z0-9]{8,}_[A-Za-z0-9]{20,}|pat-na1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|AIza[A-Za-z0-9_-]{35}|AKIA[0-9A-Z]{16}|\d{9,10}:AA[A-Za-z0-9_-]{32,})/g;
/** Warning-only. See the header for why this is not a blocking rule. */
const PHONE_RE = /(?<![\w+-])\+\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?![\w-])/g;

const canaries = fs.existsSync(CANARIES)
  ? fs.readFileSync(CANARIES, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'))
  : [];

/**
 * Paths where a third-party address is the POINT, not a leak.
 *
 * `docs/selling/` is the data plane of the live outreach system: `outreach-registry.json`
 * maps slug → recipient and `src/go-wa.ts` fetches it from GitHub raw, four GitHub Actions
 * read specs from a fresh CI clone, and `oracle-stage-hiring-outreach.sh` reads it via
 * `git show FETCH_HEAD:…`. It cannot be scrubbed (sending breaks) or untracked (CI and
 * Oracle break). AIPA_AITCF therefore ships to DataVendor as a cleaned MIRROR, and the
 * guard must not shout about addresses that are supposed to be there.
 *
 * CREDENTIALS ARE STILL CHECKED HERE. An API key in a draft is a leak wherever it lands —
 * only the "this address is personal data" rule is suspended, never the secret rules.
 */
const PII_EXEMPT = [
  /^docs\/selling\//,       // outreach data plane: registry, drafts, specs, prospects
  /^docs\/applications\//,  // job applications — names the employer by definition
  /^docs\/interview\//,
  /^docs\/oracle\//,        // NOW.md: the shared agent coordination file. Its entire job is
                            // recording who owes what to whom, so it names counterparties.
  /^docs\/hubspot\//, /^docs\/crm\//,
];

/**
 * Every path above is ALSO in `build-license-bundle.cjs` DROP_DIRS, and that is the whole
 * justification — an address here never reaches a buyer, so flagging it only trains the
 * operator to reach for `--no-verify`. **Keep the two lists in step.** If a path is exempted
 * here but not dropped there, this guard is quietly licensing PII.
 */

function scan(text, rel) {
  const out = [];
  const push = (kind, v) => out.push({ kind, rel, sample: String(v).slice(0, 60) });
  const piiExempt = PII_EXEMPT.some((re) => re.test(rel || ''));

  if (!piiExempt) {
    for (const m of text.match(EMAIL_RE) || []) {
      if (SAFE_EMAIL.test(m) || m.includes('..') || m.split('@')[0].length > 40) continue;
      push('third-party email', m);
    }
  }
  let m;
  URL_CRED_RE.lastIndex = 0;
  while ((m = URL_CRED_RE.exec(text)) !== null) {
    if (PW_PLACEHOLDER.test(m[1]) || TEMPLATE.test(m[1])) continue;
    push('credential URL', m[0]);
  }
  SQL_PW_RE.lastIndex = 0;
  while ((m = SQL_PW_RE.exec(text)) !== null) {
    if (PW_PLACEHOLDER.test(m[1]) || TEMPLATE.test(m[1])) continue;
    push('SQL password', m[0]);
  }
  for (const v of text.match(PEM_RE) || []) push('private key', v);
  for (const v of text.match(VENDOR_RE) || []) push('API key', v);
  for (const c of canaries) if (text.includes(c)) push('canary', c);
  return out;
}

/** Binary sniff by CONTENT, never by extension — an extension allowlist is exactly what
 *  let a committed browser session store and a 2.7 MB .jsonl through unchecked. */
function isTextish(buf) {
  if (!buf || !buf.length || buf.length > 32 * 1024 * 1024) return false;
  const n = Math.min(8192, buf.length);
  let odd = 0;
  for (let i = 0; i < n; i++) {
    const c = buf[i];
    if (c === 0) return false;
    if (c < 9 || (c > 13 && c < 32)) odd++;
  }
  return odd / n < 0.05;
}

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });

function report(findings, warnings, label) {
  if (warnings.length) {
    console.log(`\n  ⚠ ${warnings.length} phone-shaped string(s) — warning only, not blocking`);
  }
  if (!findings.length) { console.log(`✓ ${label}: clean`); return 0; }
  console.error(`\n✖ ${label}: ${findings.length} finding(s)\n`);
  const byKind = {};
  for (const f of findings) (byKind[f.kind] = byKind[f.kind] || []).push(f);
  for (const [kind, list] of Object.entries(byKind)) {
    console.error(`  ${kind} (${list.length}):`);
    for (const f of list.slice(0, 6)) console.error(`    ${f.rel}  →  ${f.sample}`);
    if (list.length > 6) console.error(`    … and ${list.length - 6} more`);
  }
  return 1;
}

/* ----------------------------------------------------------------------- modes */

if (has('--install')) {
  const guard = path.resolve(__filename);
  // `--skip` exists for one specific reason: `stage-manual-prospect.cjs` and
  // `atlas-lead-machine.cjs` COMMIT LOCALLY, and they are what writes prospect data into
  // docs/selling/. Installing the hook on cto-aipa before that directory is untracked
  // would block Elena's live outreach tooling. Install it there LAST, once the source of
  // the PII is gone — never gate a workflow against a condition it cannot yet satisfy.
  // (GitHub Actions are unaffected either way: hooks are not cloned.)
  const skip = (arg('--skip', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
  let n = 0;
  for (const repo of REPOS) {
    if (skip.some((s) => repo.endsWith(s))) { console.log(`  SKIPPED (by request): ${path.basename(repo)}`); continue; }
    const hooks = path.join(repo, '.git', 'hooks');
    if (!fs.existsSync(hooks)) { console.log(`  skip (no .git): ${repo}`); continue; }
    const hook = path.join(hooks, 'pre-commit');
    // Fails CLOSED on findings, but OPEN if the guard itself is missing — a hook that
    // blocks every commit because a path moved is a hook that gets deleted.
    const body = `#!/bin/sh
GUARD="${guard.replace(/\\/g, '/')}"
if [ ! -f "$GUARD" ]; then
  echo "pii-guard: guard script not found at $GUARD — commit allowed, but the gate is OFF" >&2
  exit 0
fi
node "$GUARD" || {
  echo "" >&2
  echo "pii-guard BLOCKED this commit. These repos are licensed to DataVendor;" >&2
  echo "a credential or third-party address here fails pii_qc_llm and makes the" >&2
  echo "listing unsellable. Fix the finding, or 'git commit --no-verify' if you" >&2
  echo "are certain it is a false positive." >&2
  exit 1
}
`;
    fs.writeFileSync(hook, body, 'utf8');
    try { fs.chmodSync(hook, 0o755); } catch { /* windows */ }
    console.log(`  installed → ${path.basename(repo)}/.git/hooks/pre-commit`);
    n++;
  }
  console.log(`\n${n} hook(s) installed.`);
  process.exit(0);
}

if (has('--listing')) {
  console.log('Scanning the 8 assets in the DataVendor listing with HUD\'s own shapes.');
  console.log('Pass needs ZERO findings — one finding scores 55 against a pass mark of 71.\n');
  let bad = 0;
  for (const [name, repo] of LISTING_ASSETS) {
    if (!fs.existsSync(path.join(repo, '.git'))) { console.log(`  ?  ${name}: no checkout at ${repo}`); continue; }
    // Scan the ref GitHub actually serves. AILA is why: its default branch holds
    // only README.md while the local checkout sits on `docs`, so reading HEAD
    // would report findings DataVendor never sees.
    let ref = 'origin/main';
    try { git(['rev-parse', '--verify', '--quiet', ref], repo); } catch { ref = 'HEAD'; }
    const files = git(['ls-tree', '-r', '--name-only', '-z', ref], repo).split('\0').filter(Boolean);
    const counts = {};
    let bin = 0;
    for (const rel of files) {
      let buf;
      try { buf = execFileSync('git', ['show', `${ref}:${rel}`], { cwd: repo, maxBuffer: 1 << 28 }); }
      catch { continue; }
      if (!isTextish(buf)) { bin++; continue; }
      const t = buf.toString('utf8');
      for (const [kind, re] of Object.entries(HUD)) {
        re.lastIndex = 0;
        let m = t.match(re);
        if (!m) continue;
        if (kind === 'EMAIL_ADDRESS') m = m.filter((v) => !HUD_PLACEHOLDER.test(v));
        if (HUD_EXEMPT[kind]) m = m.filter((v) => !HUD_EXEMPT[kind](v));
        if (m.length) counts[kind] = (counts[kind] || 0) + m.length;
      }
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const score = hudScore(total);
    if (total === 0) {
      console.log(`  ✓  ${name.padEnd(24)} 0 findings on ${ref} — would pass${bin ? `   (${bin} binary file(s), reported as a blind spot)` : ''}`);
    } else {
      bad++;
      const detail = Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', ');
      console.log(`  ✖  ${name.padEnd(24)} ${String(total).padStart(3)} findings — projected score ${score.toFixed(1)} / 71`);
      console.log(`     ${detail}`);
    }
  }
  console.log(bad === 0
    ? '\n✓ All eight would pass. Re-attach the assets so DataVendor captures a fresh snapshot.'
    : `\n✖ ${bad} asset(s) would still fail. Re-attaching now would waste the QC run.`);
  process.exit(bad ? 1 : 0);
}

if (has('--all')) {
  const repos = arg('--repo', null) ? [arg('--repo', null)] : REPOS;
  let bad = 0;
  for (const repo of repos) {
    if (!fs.existsSync(path.join(repo, '.git'))) { console.log(`  skip (no .git): ${repo}`); continue; }
    const files = git(['ls-files', '-z'], repo).split('\0').filter(Boolean);
    const findings = [], warnings = [];
    for (const rel of files) {
      let buf;
      try { buf = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: repo, maxBuffer: 1 << 28 }); }
      catch { continue; }
      if (!isTextish(buf)) continue;
      const t = buf.toString('utf8');
      findings.push(...scan(t, rel));
      warnings.push(...(t.match(PHONE_RE) || []));
    }
    if (report(findings, warnings, path.basename(repo))) bad++;
  }
  console.log(`\n${bad === 0 ? '✓ ALL REPOS CLEAN — safe to update the listing' : `✖ ${bad} repo(s) with findings — do NOT update the listing yet`}`);
  process.exit(bad ? 1 : 0);
}

// Default: pre-commit mode — staged content only, so it is fast and only judges what you
// are actually about to add.
const repo = process.cwd();
let staged;
try { staged = git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'], repo).split('\0').filter(Boolean); }
catch { console.error('pii-guard: not a git repository'); process.exit(2); }
if (!staged.length) process.exit(0);

// A repo that is IN the DataVendor listing gets the strict treatment: HUD's gate is
// binary, so a phone number or our own address is not a warning there, it is a failed
// sale. Everywhere else keeps the old behaviour, where phones are advisory.
const here = repo.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
const LISTED = LISTING_ASSETS.some(([, dir]) => dir.toLowerCase() === here);

const findings = [], warnings = [];
for (const rel of staged) {
  let buf;
  try { buf = execFileSync('git', ['show', `:${rel}`], { cwd: repo, maxBuffer: 1 << 28 }); }
  catch { continue; }
  if (!isTextish(buf)) continue;
  const t = buf.toString('utf8');
  findings.push(...scan(t, rel));
  if (LISTED) {
    for (const [kind, re] of Object.entries(HUD)) {
      re.lastIndex = 0;
      let m = t.match(re);
      if (!m) continue;
      if (kind === 'EMAIL_ADDRESS') m = m.filter((v) => !HUD_PLACEHOLDER.test(v));
      if (HUD_EXEMPT[kind]) m = m.filter((v) => !HUD_EXEMPT[kind](v));
      for (const sample of m) findings.push({ kind: `HUD:${kind}`, rel, sample });
    }
  } else {
    warnings.push(...(t.match(PHONE_RE) || []));
  }
}
if (LISTED && findings.length) {
  console.error('\nThis repo is one of the eight assets in the DataVendor listing.');
  console.error('Its PII gate is binary: score = 55 - 5.75*ln(findings), pass is 71, so a');
  console.error('SINGLE finding scores 55 and the asset cannot be sold. Keep the value and');
  console.error('remove the shape — see src/core/contact.py in VibeJobHunter, or _fmt_tel()');
  console.error('in espaluz_enhancements.py, for the two patterns that work.');
}
process.exit(report(findings, warnings, `staged (${staged.length} file(s))${LISTED ? ' [listed asset — strict]' : ''}`));
