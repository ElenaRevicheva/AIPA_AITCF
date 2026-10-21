#!/usr/bin/env node
/**
 * prod-truth-sheet.cjs — OpenClaw's PRODUCTION TRUTH sheet (21 Oct 2026).
 *
 * Why: asked about her own products, OpenClaw answered with plausible filler and one false claim (Atlas "creates up
 * to 10 opportunities with company screenshots"). It was fed CV facts and job deals only — never production history.
 * The fix is the one that worked for the deals sheet on 7 and 15 Oct: put the verified data IN its context, built
 * outside the model on a schedule, and tell it to say "no tengo un dato verificado" when the sheet is silent.
 *
 * Sources, all read from the LATEST committed text (git fetch + git show origin/main), never from the working tree:
 * Oracle's cto-aipa checkout lags on purpose (named-file deploys), so its own files are stale.
 *   1. cto-aipa  docs/oracle/PRODUCT_TRUTH.md       — what each product really does (verified lines)
 *   2. cto-aipa  docs/oracle/NOW.md                 — newest handoffs that carry a VERIFIED BY line
 *   3. aideazz   content/ai-ops-wiki/incidents/*.md — newest incidents: title, measured `verified`, named concepts
 *
 * Run (Oracle crontab, right after the deals digest):
 *   node scripts/prod-truth-sheet.cjs --out=/home/ubuntu/.openclaw/workspace/prod/TOOLS.md --private=/home/ubuntu/.openclaw/private/CAREER_DEEP.md
 * Budget: --max=15000 chars (OpenClaw injects every sheet into every reply under a 110k total cap).
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const OUT = arg('out', '');
const MAX = Number(arg('max', '15000'));
// Her deep background lives in the PRIVATE docs repo and on Oracle only (résumés left git HEAD on 6 Sep for privacy);
// --private=<file> includes it as written. A missing file is skipped, never fatal.
const PRIVATE = arg('private', '');
const ROOT = path.resolve(__dirname, '..');
const WIKI_REPO = process.env.AIDEAZZ_REPO_PATH || path.join(os.homedir(), 'aideazz');
const INCIDENTS = 'content/ai-ops-wiki/incidents';

const git = (repo, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 8 << 20 });
const fetched = new Set();
/** The committed text of a file on origin/main (one fetch per repo); the working tree only if that fails. */
function committed(repo, file) {
  if (!fetched.has(repo)) {
    fetched.add(repo);
    try { git(repo, 'fetch', '-q', 'origin', 'main'); } catch { /* offline: origin/main as last fetched */ }
  }
  try { return git(repo, 'show', `origin/main:${file}`); } catch { /* fall through */ }
  try { return fs.readFileSync(path.join(repo, file), 'utf8'); } catch { return ''; }
}
const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : s);

// 1. Product truth: everything from the first "## " section on (the file's own intro is for humans).
const truth = committed(ROOT, 'docs/oracle/PRODUCT_TRUTH.md');
const truthBody = truth.slice(Math.max(0, truth.indexOf('\n## ') + 1)).trim();

// 2. NOW.md handoffs that were verified: "### ✅ …" heading + its "VERIFIED BY" bullet.
const now = committed(ROOT, 'docs/oracle/NOW.md');
const handoffs = [];
for (const block of now.split(/\n(?=### )/)) {
  const head = block.match(/^### (✅[^\n]*)/);
  const ver = block.match(/\*\*VERIFIED BY:?\*\*:?\s*([^\n]+)/i);
  if (head && ver) handoffs.push(`- ${cut(oneLine(head[1]), 130)}\n  VERIFIED: ${cut(oneLine(ver[1]).replace(/`/g, ''), 220)}`);
  if (handoffs.length >= 4) break;
}

// 3. Wiki incidents, newest first: front matter only (the file is front matter by contract).
const field = (fm, k) => { const m = fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm')); return m ? oneLine(m[1]).replace(/^["']|["']$/g, '') : ''; };
let names = [];
try { names = git(WIKI_REPO, 'ls-tree', '--name-only', 'origin/main', `${INCIDENTS}/`).split('\n').filter((n) => n.endsWith('.md')); } catch { /* none */ }
if (!names.length) { try { names = fs.readdirSync(path.join(WIKI_REPO, INCIDENTS)).map((n) => `${INCIDENTS}/${n}`); } catch { /* none */ } }
const incidents = names.sort().reverse().map((n) => {
  const fm = committed(WIKI_REPO, n);
  const title = field(fm, 'title');
  const verified = field(fm, 'verified');
  if (!title || !verified) return '';
  return `- ${field(fm, 'date')} · ${title} [${field(fm, 'concepts')}]\n  ${cut(verified, 200)}`;
}).filter(Boolean);

const HEAD = `# 🏭 PRODUCCIÓN REAL / PRODUCTION TRUTH — the ONLY source for what her products and agents do
# Rebuilt every 30 min from committed, verified records (prod-truth-sheet.cjs). Built ${new Date().toISOString().slice(0, 16)}Z.
# RULE: any question about her products, agents, Atlas, WHITESPACE, how the agents work together, why she built them, or a
# production incident → answer ONLY from this sheet (and the proof sheet), copying its facts and numbers exactly.
# If the answer is not here, say "No tengo un dato verificado de eso" / "I don't have a verified fact on that" and give the
# closest true line. Never add capabilities, counts, screenshots, clients, "real-time collaboration", any number or any DATE
# not printed here. Quote a line only if it is printed here word for word; never stitch two lines into one "quote".
`;

let privateBody = '';
if (PRIVATE) { try { privateBody = fs.readFileSync(PRIVATE, 'utf8').trim(); } catch { /* not on this box */ } }

const sections = [
  HEAD,
  truthBody,
  privateBody,
  handoffs.length ? `## LATEST VERIFIED PRODUCTION WORK (NOW.md handoffs, newest first)\n${handoffs.join('\n')}` : '',
];
let sheet = sections.filter(Boolean).join('\n\n');
// Incidents fill what is left of the budget, newest first.
const incHead = '\n\n## PRODUCTION INCIDENTS (AI Ops Wiki — measured, newest first)\n';
let inc = '';
for (const line of incidents) {
  if ((sheet + incHead + inc + line).length + 1 > MAX) break;
  inc += `${line}\n`;
}
if (inc) sheet += incHead + inc.trimEnd();
if (sheet.length > MAX) sheet = sheet.slice(0, MAX);
// OpenClaw sends any "MEDIA:<path|url>" it sees as a file (19 Oct send-token trap): never let one through.
sheet = sheet.replace(/medi(a):/gi, 'media :');

if (!OUT) { process.stdout.write(`${sheet}\n`); process.exit(0); }
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(`${OUT}.tmp`, `${sheet}\n`);
fs.renameSync(`${OUT}.tmp`, OUT);
console.log(`[prod-truth] ${new Date().toISOString()} wrote ${OUT}: ${sheet.length} chars · ${handoffs.length} handoffs · ${inc ? inc.trim().split('\n- ').length : 0} incidents`);
