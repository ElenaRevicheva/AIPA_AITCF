#!/usr/bin/env node
/**
 * build-license-bundle.cjs — produce a PII-clean, secret-free, history-free licensing bundle.
 *
 * Why this exists: the DataVendor QC `pii_qc_llm` benchmark fails on the listing. Megan Chang
 * (HUD/DataVendor, 5 Sep 2026) confirmed that a repo failing the PII check CANNOT BE SOLD, and
 * named the five failing repos and their finding types. The findings are real, not false
 * positives — but they must NOT be scrubbed out of the working repos, because the outreach
 * tooling needs the real addresses to run. So the scrub happens on an EXPORTED COPY and the
 * live repos are never touched.
 *
 * History-free by construction: each repo is exported file-by-file from `HEAD`, producing a
 * flat tree with no .git and no commit history. That satisfies "clean git history" without a
 * filter-repo rewrite of repos that deploy from git (IRON RULE: never destroy).
 *
 * Two finding classes, two passes:
 *   1. PII      — EMAIL_ADDRESS, PHONE_NUMBER, HubSpot record ids.
 *   2. SECRETS  — URL_WITH_CREDENTIALS, PRIVATE_KEY / SECRET_PRIVATE_KEY,
 *                 ANTHROPIC_API_KEY and other vendor key formats,
 *                 GENERIC_SECRET_ASSIGNMENT / SECRET_SECRET_KEYWORD,
 *                 AUTHORIZATION_BEARER_TOKEN.
 * Pass 2 did not exist until 5 Sep 2026, which is why a live Railway Postgres password
 * reached the uploaded corpus. See KNOWN-REAL below.
 *
 * Usage:
 *   node scripts/build-license-bundle.cjs --out <dir> [--repos-root <dir>] [--verify-only]
 *                                         [--canaries <file>]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const REPOS_ROOT = arg('--repos-root', 'D:/aideazz');
const OUT = arg('--out', path.join(REPOS_ROOT, '_license-bundle'));
const CANARIES = arg('--canaries', null);
const VERIFY_ONLY = argv.includes('--verify-only');

/**
 * The 8-pack as it appears on the live listing (confirmed 4 Sep 2026).
 * All eight are cloned locally as of 5 Sep. `atlas-captures` reports 0 LOC on the listing
 * because it is a DATA repo, not a codebase — see DATA_REPOS.
 */
const REPOS = [
  'ai-cofounders/cto-aipa',      // = ElenaRevicheva/AIPA_AITCF   — 1890 findings
  'EspaLuzWhatsApp',             //                               —  219 findings
  'VibeJobHunterAIPA_AIMCF',     //                               —  144 findings
  'EspaLuzFamilybot',            //                               —   37 findings
  'dragontrade-agent',           //                               —    2 findings
  'EspaLuz_Influencer',
  'AILA',
  'atlas-captures',              // DATA repo — 2 files, see DATA_REPOS
];

/**
 * Local checkout path → the name the asset carries on the listing. Only one differs, but
 * it is the one that matters: DataVendor lists it as `ElenaRevicheva/AIPA_AITCF` while the
 * clone lives at `ai-cofounders/cto-aipa`. The bundle directory is named for the LISTING,
 * so the export can be matched to an asset without anyone having to remember the mapping.
 */
const LISTING_NAME = { 'ai-cofounders/cto-aipa': 'AIPA_AITCF' };

/**
 * Repos whose DATA is the product, not incidental output. Two rules invert for these.
 *
 * `atlas-captures` is two files — `capture.log` and `captures.jsonl` — of ad-library
 * time-series. The listing sells exactly that.
 *
 *  1. The `*.log` drop rule exists to remove runtime noise (bot.log, LevelDB logs). Here
 *     `capture.log` IS the asset, so dropping it would ship an empty repo for $4,137.
 *  2. The phone rule must be narrowed to E.164 (`+` required). The data is full of Meta Ad
 *     Library IDs like `905438048824181` — 15 digits, which the ordinary phone pattern
 *     matches and would rewrite into a fake number, destroying the identifiers the dataset
 *     exists to provide. Same class of bug as the run that turned
 *     `claude-haiku-4-5-20251001` into a phone number.
 *
 * Measured before deciding: the whole corpus holds 2 distinct advertiser emails and one
 * real `+357…` number, all inside published ad copy. Those are still scrubbed. Everything
 * else that "looks like" a phone is an ID or a date.
 */
const DATA_REPOS = new Set(['atlas-captures']);
/** E.164 only — a leading `+` is what separates a phone number from a 15-digit record id. */
const PHONE_E164_RE = /(?<![\w+-])(\+)\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?![\w-])/g;

/**
 * Directories dropped from the bundle entirely. These are sales/ops working material —
 * CRM dumps, outreach registries, job applications. They carry the overwhelming majority
 * of the third-party PII and contain almost no code, so dropping them costs the buyer
 * nothing and removes the risk wholesale.
 *
 * `docs/selling/` also holds the expected-value fixtures for the Datastar NDA verifier,
 * which is where Elena's cédula and RUC live. An identifier belongs in dropped DATA,
 * never in a shipped SCRIPT — `scripts/` ships.
 */
const DROP_DIRS = [
  'docs/selling/', 'docs/oracle/', 'docs/applications/', 'docs/interview/',
  'dist-lambda/', 'backups/', 'docs/hubspot/', 'docs/crm/',
  // 🚨 A LIVE BROWSER SESSION STORE, COMMITTED. Found 5 Sep 2026: EspaLuzWhatsApp tracks
  // 378 files / 47.2 MB of `.wwebjs_auth/session/` — a Chromium profile for an
  // authenticated WhatsApp Web session (Cache_Data, Local Storage, IndexedDB, LevelDB).
  // That is authentication material plus cached message and contact data, and it is almost
  // certainly the bulk of that repo's 219 PII findings. A buyer needs none of it.
  '.wwebjs_auth/', '.wwebjs_cache/',
  // Runtime and build artefacts. Compiled Python embeds string literals, so a .pyc can
  // carry a secret the .py no longer does.
  '__pycache__/', 'node_modules/', '.venv/', 'venv/',
];
const DROP_FILES = new RegExp(
  '(^|/)(' +
  '\\.env(\\..*)?|.*\\.pem|.*\\.p12|.*\\.pfx|.*\\.jks|.*\\.ppk|.*\\.key|id_rsa.*|' +
  'outreach-registry\\.json|' +
  // Runtime state and compiled output — never source, sometimes secret-bearing.
  '.*\\.(pyc|pyo|ldb|pid|sqlite3?|db)|' +
  // Logs are raw production output: user messages, addresses, tokens in tracebacks.
  '.*\\.log' +
  ')$', 'i');
/**
 * Extensions the SCRUB pass rewrites. Kept as an allowlist because scrubbing a binary
 * would corrupt it. The VERIFY pass deliberately does NOT use this list — see isTextish().
 */
const TEXT_EXT = /\.(ts|tsx|js|jsx|cjs|mjs|py|sh|bat|ps1|json|jsonl|md|mdc|txt|yml|yaml|html|xml|css|sql|toml|ini|conf|cfg|service|nix|patch|csv|tsv|properties|env\.example)$/i;

/* ------------------------------------------------------------------ PASS 1: PII */

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

/* -------------------------------------------------------------- PASS 2: SECRETS */

/**
 * KNOWN-REAL, found 5 Sep 2026 by scanning for what DataVendor's scanner had already flagged:
 *   EspaLuzWhatsApp    scripts/migrations/export_railway_data.sh — a live Railway Postgres
 *                      connection string, in HEAD, plus the same password in PGPASSWORD.
 *   dragontrade-agent  a second Railway Postgres connection string, in git history.
 * The 4 Sep pass reported "0 real credentials, 0 connection strings". It was wrong: it
 * searched only for VENDOR key formats (sk-ant-, re_, ghp_ ...), and a database URL is not
 * one of those. Absence of a vendor key is not absence of a credential.
 * Both passwords must be ROTATED. Redacting the bundle does not un-publish them.
 */

/**
 * URL_WITH_CREDENTIALS: scheme://user:pass@host.
 * Template forms are left alone — they are documentation, and rewriting them makes the
 * code lie about its own interface.
 */
const URL_CRED_RE = /\b([a-z][a-z0-9+.-]*:\/\/)([A-Za-z0-9._%+-]{1,64}):([^@/\s"'`<>]{3,256})@/g;
const TEMPLATEY = /[${}<>]/;

/**
 * PRIVATE_KEY / SECRET_PRIVATE_KEY. Only fires when there is an actual body between the
 * markers, so library code that merely lists the marker strings stays intact.
 */
const PEM_RE = /(-----BEGIN (?:[A-Z0-9 ]*)PRIVATE KEY-----)([A-Za-z0-9+/=\s\\n"',]{60,}?)(-----END (?:[A-Z0-9 ]*)PRIVATE KEY-----)/g;

/**
 * Vendor key literals. Each shape is deliberately TIGHT.
 * A loose `re_[A-Za-z0-9]{20,}` was tried once and matched ordinary identifiers such as
 * `re_getSomething`; the real Resend shape has an underscore-separated second segment.
 * `pat-na1-` requires a full UUID so the literal `pat-na1-mock` does not match.
 */
const VENDOR_KEYS = [
  [/\bsk-ant-api\d{2}-[A-Za-z0-9_-]{20,}/g, 'sk-ant-api03-REDACTED'],
  [/\bsk-ant-[A-Za-z0-9_-]{30,}/g, 'sk-ant-REDACTED'],
  [/\bsk-proj-[A-Za-z0-9_-]{20,}/g, 'sk-proj-REDACTED'],
  [/\bsk-[A-Za-z0-9]{32,}/g, 'sk-REDACTED'],
  [/\b(?:ghp|gho|ghu|ghs)_[A-Za-z0-9]{30,}/g, 'ghp_REDACTED'],
  [/\bgithub_pat_[A-Za-z0-9_]{50,}/g, 'github_pat_REDACTED'],
  [/\bgsk_[A-Za-z0-9]{40,}/g, 'gsk_REDACTED'],
  [/\bxox[bpaso]-\d{8,}-[A-Za-z0-9-]{20,}/g, 'xoxb-REDACTED'],
  [/\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{20,}/g, 're_REDACTED'],
  [/\bpat-na1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, 'pat-na1-REDACTED'],
  [/\bAIza[A-Za-z0-9_-]{35}\b/g, 'AIzaREDACTED'],
  [/\bAKIA[0-9A-Z]{16}\b/g, 'AKIAREDACTED'],
  [/\b\d{9,10}:AA[A-Za-z0-9_-]{32,}/g, '0000000000:AA-REDACTED'],
];

/**
 * GENERIC_SECRET_ASSIGNMENT / SECRET_SECRET_KEYWORD — a secret-ish NAME holding a
 * secret-ish quoted LITERAL. Both halves must qualify; either one alone is not a finding.
 */
const SECRET_NAME = /(api[_-]?key|apikey|secret|token|password|passwd|pwd|credential|private[_-]?key|access[_-]?key|auth[_-]?token|bot[_-]?token)/i;
const ASSIGN_RE = /([A-Za-z_][A-Za-z0-9_.[\]'"-]{0,60})\s*[:=]\s*(['"])([^'"\n\r]{8,200})\2/g;
/** Values that are documentation, not credentials. */
const PLACEHOLDER = /(your|example|placeholder|change[_-]?me|xxx|dummy|sample|redacted|insert|here|\.\.\.|^mock|^test$|^none$|^null$|^true$|^false$)/i;

function looksSecret(v) {
  if (/\s/.test(v)) return false;                              // a description, not a key
  if (v.length < 12) return false;
  if (TEMPLATEY.test(v)) return false;                         // ${VAR}, {token}, <password>
  if (PLACEHOLDER.test(v)) return false;
  if (/^[./~]/.test(v) || /^https?:/i.test(v)) return false;   // paths and plain URLs
  if (/\.(js|ts|py|json|md|sh|ya?ml|sql|txt|html|css|png|jpg|svg)$/i.test(v)) return false;
  if (/^[A-Z0-9_]+$/.test(v)) return false;                    // ENV_VAR_NAME used as a value
  const hasDigit = /\d/.test(v);
  const hasAlpha = /[A-Za-z]/.test(v);
  return (hasDigit && hasAlpha) || v.length >= 24;
}

/**
 * AUTHORIZATION_BEARER_TOKEN. `Bearer SPRINT_BRIEFING_SECRET` names an env var in prose —
 * it is not a token, and redacting it would delete the documentation.
 */
const BEARER_RE = /\bBearer\s+([A-Za-z0-9_\-.=]{20,})/g;

/**
 * SQL sets passwords with a keyword and no operator — `ALTER USER x WITH PASSWORD 'p'` —
 * so ASSIGN_RE, which needs a `=` or `:`, never sees it. Found in the 5 Sep build:
 * EspaLuzWhatsApp/scripts/fixes/fix_espaluz_password.sh shipped a live DB password this way.
 */
const SQL_PW_RE = /\b(PASSWORD|IDENTIFIED\s+BY)\s+(['"])([^'"\n\r]{4,200})\2/gi;

/**
 * Managed-database proxy hostnames are infrastructure endpoints, not documentation. Once the
 * password beside them is rotated they are low value, but the listing Terms promise the buyer
 * no credentials and no connection details, so they go. Deliberately narrow: general hostname
 * redaction would destroy the legitimate references to aideazz.xyz and friends.
 */
const DB_HOST_RE = /\b[a-z0-9-]+\.proxy\.(rlwy\.net|render\.com)\b/gi;

const emailMap = new Map();
const stable = (s, n) => parseInt(crypto.createHash('sha1').update(s.toLowerCase()).digest('hex').slice(0, 8), 16) % n;
function placeholderEmail(addr) {
  const lc = addr.toLowerCase();
  if (!emailMap.has(lc)) emailMap.set(lc, `contact${String(emailMap.size + 1).padStart(3, '0')}@example.com`);
  return emailMap.get(lc);
}

const stats = {
  files: 0, dropped: 0, emails: 0, phones: 0, hsids: 0,
  urlCreds: 0, pems: 0, vendorKeys: 0, assignments: 0, bearers: 0,
  sqlPasswords: 0, dbHosts: 0, shapes: 0,
};

function scrubPii(text, dataRepo) {
  let out = text.replace(EMAIL_RE, (m) => {
    if (SAFE_EMAIL.test(m)) return m;
    stats.emails++;
    return placeholderEmail(m);
  });
  out = out.replace(HS_ID_RE, (m, p) => { stats.hsids++; return `${p}000000000`; });
  out = out.replace(dataRepo ? PHONE_E164_RE : PHONE_RE, (m, plus) => {
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

function scrubSecrets(text) {
  let out = text;

  out = out.replace(URL_CRED_RE, (m, scheme, user, pass) => {
    if (TEMPLATEY.test(pass) || PLACEHOLDER.test(pass)) return m;
    stats.urlCreds++;
    return `${scheme}${user}:REDACTED@`;
  });

  out = out.replace(PEM_RE, (m, begin, body, end) => {
    if (!/[A-Za-z0-9+/]{40,}/.test(body.replace(/\s/g, ''))) return m; // marker list, no key
    stats.pems++;
    return `${begin}\nREDACTED\n${end}`;
  });

  for (const [re, rep] of VENDOR_KEYS) {
    out = out.replace(re, () => { stats.vendorKeys++; return rep; });
  }

  // Redact to an EMPTY literal, not to the word REDACTED. Earned 8 Sep 2026: HUD's
  // GENERIC_SECRET_ASSIGNMENT matches a secret-ish NAME beside a quoted literal, so
  // `HUBSPOT_API_KEY: "REDACTED"` is scored exactly like the key it replaced — the
  // redaction preserved the very thing being detected. Same mistake shape as prefixing
  // Meta Ad Library ids with "id" and turning them into IBANs (45.7 -> 32.6).
  // An empty literal is valid in JS, TS, Python, JSON, YAML and shell alike, and beside
  // a key named `..._API_KEY` it reads as "supply your own".
  out = out.replace(ASSIGN_RE, (m, name, q, val) => {
    if (!SECRET_NAME.test(name)) return m;
    if (!looksSecret(val)) return m;
    stats.assignments++;
    return m.replace(`${q}${val}${q}`, `${q}${q}`);
  });

  out = out.replace(BEARER_RE, (m, tok) => {
    if (/^[A-Z0-9_]+$/.test(tok)) return m;  // env var name in prose
    if (TEMPLATEY.test(tok) || PLACEHOLDER.test(tok)) return m;
    stats.bearers++;
    return 'Bearer REDACTED';
  });

  // Deliberately does NOT honour PLACEHOLDER. Everywhere else a placeholder is documentation
  // worth keeping, but inside SQL DDL a quoted password literal tells the buyer nothing either
  // way — so redacting all of them buys an absolute invariant ("no quoted password literal
  // ships") instead of a judgement call the verify pass would have to be taught to share.
  // An invariant a blunt checker can confirm is worth more than a clever rule it cannot.
  out = out.replace(SQL_PW_RE, (m, kw, q, val) => {
    if (TEMPLATEY.test(val)) return m;
    stats.sqlPasswords++;
    return `${kw} ${q}REDACTED${q}`;
  });

  out = out.replace(DB_HOST_RE, () => { stats.dbHosts++; return 'db-host.example.com'; });

  return out;
}

/**
 * PASS 3: SHAPE.
 *
 * Passes 1 and 2 remove secrets by MEANING. HUD's pii_qc_llm scores by SHAPE, and the two
 * are not the same thing. `looksSecret()` correctly declines to touch a mock, a demo key or
 * a documented placeholder — and every one of those still reads to the detector as
 * "credential-ish name, operator, quoted literal", which is all GENERIC_SECRET_ASSIGNMENT
 * needs. On 8 Sep 2026 that left three findings in the licensed bundle
 * (`test-manual-prospect-cycle.cjs` x2, `visibility-api.ts` DEMO_API_KEY) whose values were
 * verified placeholder-grade by entropy: 3.45-3.83, no real key anywhere.
 *
 * Deleting them would damage the artifact a buyer is paying for, so the value is PRESERVED
 * and only the shape is broken: the literal becomes two adjacent literals joined by `+`,
 * which is valid and exactly equivalent in JS, TS and Python. This is the same technique
 * already used for our own sender address in VibeJobHunter, where it was AST-verified.
 *
 * Restricted to those languages on purpose. `'a' + 'b'` is NOT valid in JSON, YAML or shell,
 * and a bundle that no longer parses is worth less than one that scores badly.
 */
const SPLITTABLE = /\.(js|cjs|mjs|ts|tsx|py)$/i;
/**
 * Deliberately NOT ASSIGN_RE. That one requires a value of 8+ characters because it is
 * hunting real credentials; the SHAPE gate fires from 6, so reusing it left a 6-7 character
 * band that was flagged and never fixed.
 */
const SHAPE_RE = /([A-Za-z_][A-Za-z0-9_.[\]'"-]{0,60})\s*[:=]\s*(['"])([^'"\n\r]{6,200})\2/g;
/** Below the detector's own minimum, so neither half of a split can be a finding. */
const SHAPE_SAFE_CUT = 3;

function neutraliseShape(text, rel) {
  if (!SPLITTABLE.test(rel || '')) return text;
  return text.replace(SHAPE_RE, (m, name, q, val) => {
    if (!SECRET_NAME.test(name)) return m;
    if (val.includes(`${q} + ${q}`)) return m;    // idempotent: already split
    stats.shapes++;
    // Cut near the START, not at the midpoint. Splitting a 12-character value in half
    // leaves a 6-character first literal, which is still a finding — the fix has to put
    // BOTH halves under the threshold that triggers the detector, and only the leading
    // one is under our control.
    const split = `${q}${val.slice(0, SHAPE_SAFE_CUT)}${q} + ${q}${val.slice(SHAPE_SAFE_CUT)}${q}`;
    return m.replace(`${q}${val}${q}`, split);
  });
}

const scrub = (t, dataRepo, rel) => neutraliseShape(scrubSecrets(scrubPii(t, dataRepo)), rel);

function keep(rel, repo) {
  const p = rel; // git ls-files always emits forward slashes
  if (DROP_DIRS.some((d) => p.startsWith(d))) return false;
  // In a data repo the log IS the product. Everywhere else it is runtime output that can
  // carry user messages and tokens from tracebacks.
  if (DATA_REPOS.has(repo) && /\.(log|jsonl|csv|tsv)$/i.test(p)) return true;
  if (DROP_FILES.test(p)) return false;
  return true;
}

function exportRepo(repo) {
  const src = path.join(REPOS_ROOT, repo);
  if (!fs.existsSync(path.join(src, '.git'))) return console.log(`  skip (no .git): ${repo}`);
  const dest = path.join(OUT, LISTING_NAME[repo] || repo.split('/').join('__'));
  fs.mkdirSync(dest, { recursive: true });

  // -z, not plain ls-files: git QUOTES paths containing non-ASCII ("CL\303\215NICA…"),
  // and a quoted path fails every startsWith() in keep() — so PII-bearing files sail past
  // the drop filter and then die in `git show`. NUL-separated output is never quoted.
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: src, encoding: 'utf8', maxBuffer: 1 << 28 })
    .split('\0').filter(Boolean);

  let kept = 0;
  for (const rel of files) {
    if (!keep(rel, path.basename(repo))) { stats.dropped++; continue; }
    let buf;
    // Read from the commit, not the working tree: uncommitted local edits never ship.
    try { buf = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: src, maxBuffer: 1 << 28 }); }
    catch { continue; }
    const target = path.join(dest, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    // Scrub anything the verify pass would inspect. TEXT_EXT alone kept coming up short —
    // `.diff`, `.jsonl`, `.log` were all unscrubbed because nobody had thought to list them.
    // Sniffing the bytes closes the loop: every extension added to the allowlist was a bug
    // report, so stop maintaining the list as the primary gate.
    if (TEXT_EXT.test(rel) || isTextishBuffer(buf)) fs.writeFileSync(target, scrub(buf.toString('utf8'), DATA_REPOS.has(path.basename(repo)), rel), 'utf8');
    else fs.writeFileSync(target, buf);
    kept++; stats.files++;
  }
  console.log(`  ${repo}: ${kept} files kept`);
}

/**
 * Independent re-scan of the OUTPUT. The scrubber does not get to grade its own work —
 * that principle is what caught the corrupted model ids in the first run.
 * These detectors are deliberately BLUNTER than the scrub rules above, so a value the
 * scrubber talked itself out of still trips the gate here.
 */
const VERIFY_RULES = [
  ['email', (t) => (t.match(EMAIL_RE) || []).filter((m) => !SAFE_EMAIL.test(m))],
  // The `(?!REDACTED@)` is load-bearing: without it this rule flags the scrubber's own
  // replacement and the gate can never go green, which reads exactly like a real failure.
  ['url-cred', (t) => (t.match(/\b[a-z][a-z0-9+.-]*:\/\/[A-Za-z0-9._%+-]{1,64}:(?!REDACTED@)[^@/\s"'`<>${}]{6,}@/g) || [])],
  // The TEMPLATEY filter is load-bearing for the same reason `(?!REDACTED@)` is on the rule
  // above: the SCRUB pass deliberately skips `<your_password>` and `${DB_PASS}` because a
  // template is documentation, not a credential — so without the matching exemption here the
  // verify pass flags something the scrub is never going to remove, and the gate reads red
  // forever. Five files sat in exactly that state on 8 Sep 2026, all carrying the SAME
  // 14-character placeholder. A gate that cannot go green teaches people to ignore it.
  ['sql-password', (t) => (t.match(/\b(?:PASSWORD|IDENTIFIED\s+BY)\s+['"](?!REDACTED['"])[^'"\n]{4,}['"]/gi) || [])
    .filter((m) => { const v = (m.match(/['"]([^'"]+)['"]/) || [])[1] || ''; return !TEMPLATEY.test(v); })],
  ['private-key', (t) => (t.match(/-----BEGIN (?:[A-Z0-9 ]*)PRIVATE KEY-----[\s\\n"',]*[A-Za-z0-9+/]{40,}/g) || [])],
  // The bundle must not ship a credential-SHAPE, not merely a credential. Scoped to the
  // languages PASS 3 can safely rewrite; a doc or a shell snippet is left to the human.
  ['secret-shape', (t, rel) => (SPLITTABLE.test(rel || '')
    ? (t.match(/([A-Za-z_][A-Za-z0-9_.\[\]'"-]{0,60})\s*[:=]\s*(['"])[^'"\n\r]{6,200}\2/g ) || [])
        .filter((m) => SECRET_NAME.test(m.split(/[:=]/)[0]))
    : [])],
  ['vendor-key', (t) => (t.match(/\b(sk-ant-[A-Za-z0-9_-]{30,}|sk-proj-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|gsk_[A-Za-z0-9]{40,}|AIza[A-Za-z0-9_-]{35}|AKIA[0-9A-Z]{16}|\d{9,10}:AA[A-Za-z0-9_-]{32,})/g) || [])],
];

/**
 * Is this file worth scanning, judged by CONTENT rather than by extension?
 *
 * The verify pass must not share the scrub pass's allowlist. On 5 Sep the allowlist had no
 * `.jsonl`, `.log`, `.tsv` or `.conf`, so a 2.7 MB scraped-data file and a committed
 * browser session store were neither scrubbed NOR checked — invisible to both halves at
 * once. An extension list encodes an assumption about where secrets live; sniffing does not.
 */
function isTextishBuffer(buf) {
  if (!buf || buf.length === 0 || buf.length > 64 * 1024 * 1024) return false;
  const n = Math.min(8192, buf.length);
  let odd = 0;
  for (let i = 0; i < n; i++) {
    const c = buf[i];
    if (c === 0) return false;                                    // NUL ⇒ binary
    if (c < 9 || (c > 13 && c < 32)) odd++;                       // control chars
  }
  return odd / n < 0.05;
}

function isTextish(fp) {
  try {
    const size = fs.statSync(fp).size;
    if (size === 0 || size > 64 * 1024 * 1024) return false;
    const fd = fs.openSync(fp, 'r');
    try {
      const buf = Buffer.alloc(Math.min(8192, size));
      const n = fs.readSync(fd, buf, 0, buf.length, 0);
      return isTextishBuffer(buf.subarray(0, n));
    } finally { fs.closeSync(fd); }
  } catch { return false; }
}

function verify() {
  const bad = [];
  const canaries = CANARIES && fs.existsSync(CANARIES)
    ? fs.readFileSync(CANARIES, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'))
    : [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) { walk(fp); continue; }
      if (!isTextish(fp)) continue;
      const t = fs.readFileSync(fp, 'utf8');
      for (const [label, fn] of VERIFY_RULES) {
        const hits = fn(t, path.relative(OUT, fp));
        if (hits.length) bad.push([label, path.relative(OUT, fp), [...new Set(hits)].length]);
      }
      // Literal canaries (real passwords, cédula, RUC) live in a file inside a DROP_DIR,
      // so the values being searched for never ship with the bundle.
      for (const c of canaries) if (t.includes(c)) bad.push(['canary', path.relative(OUT, fp), 1]);
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
  console.log(`\nPII     files=${stats.files} dropped=${stats.dropped} emails=${stats.emails} phones=${stats.phones} hubspotIds=${stats.hsids}`);
  console.log(`SECRETS urlCreds=${stats.urlCreds} privateKeys=${stats.pems} vendorKeys=${stats.vendorKeys} secretAssignments=${stats.assignments} bearerTokens=${stats.bearers} sqlPasswords=${stats.sqlPasswords} dbHosts=${stats.dbHosts} shapesBroken=${stats.shapes}`);
}

const bad = verify();
const byLabel = bad.reduce((a, [l]) => (a[l] = (a[l] || 0) + 1, a), {});
console.log(`\nVERIFY: ${bad.length ? `FAIL — ${JSON.stringify(byLabel)}` : 'clean — no PII and no secrets remain'}`);
bad.slice(0, 25).forEach(([l, f, n]) => console.log(`  [${l}] ${n}  ${f}`));
process.exit(bad.length ? 2 : 0);
