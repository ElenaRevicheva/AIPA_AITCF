/**
 * blog-evidence.ts — production evidence for the daily article, and the gate that
 * refuses to publish without it.
 *
 * WHY THIS EXISTS (23 Aug 2026)
 * ----------------------------------------------------------------------------
 * The daily publisher used to hand a model a topic brief and nothing else. The
 * briefs ask for first-person production war stories with specific numbers —
 * "the dedup failure that created 300 duplicate deals", "exact VM shape, RAM
 * ceiling, what crashes first" — while giving the model no access to any of it.
 * Completing that task REQUIRES invention. It is not a model defect and a better
 * model does not fix it; the strongest model available would also have to make
 * the numbers up, because the numbers were never supplied.
 *
 * It ran that way for months. When the Anthropic balance emptied and the chain
 * fell to a cheaper provider, the invention got louder — eleven near-identical
 * articles describing Redis distributed locks, SETNX calls and lock timings for
 * a checkpointer that is SQLite. Zero redis packages are installed.
 *
 * So the fix is not editorial and it is not a prompt tweak. It is structural:
 *
 *   1. MEASURE FIRST. Collect facts from the running system — pm2, git, the log
 *      files, the CRM — before a single token is generated. Every fact carries
 *      the command that produced it, so "how do you know?" is answerable.
 *   2. WRITE ONLY FROM THAT. The evidence bundle is the prompt. There is no
 *      topic brief to fill in from general knowledge.
 *   3. FAIL CLOSED. Thin evidence means no article. An article containing a
 *      number that is not in the bundle is rejected, not published with a
 *      caveat. Silence is a correct outcome; a plausible invention is not.
 *
 * Same principle as the citation tracker exiting non-zero on a keyless run: a
 * measurement that did not happen must never render as a measurement that did.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const sh = promisify(exec);

/** One measured fact. `source` is the command or file it came from — never a config value. */
export interface EvidenceFact {
  /** Stable short id, used for de-duplication across collectors. */
  key: string;
  /** Human-readable statement of what was measured. */
  label: string;
  /** The measured value, rendered as text exactly as it will be quoted. */
  value: string;
  /** HOW it was measured: the command, the log path, the API call. */
  source: string;
  /** Numeric tokens this fact licenses the article to use. */
  numbers: string[];
}

export interface EvidenceBundle {
  collectedAt: string;
  facts: EvidenceFact[];
  /** Technologies proven present — from pm2 process names and dependency manifests. */
  stack: string[];
  /** Collectors that failed, so a thin bundle is explainable rather than mysterious. */
  failures: string[];
}

/** Below this the day is not interesting enough to write about. Silence beats filler. */
export const MIN_FACTS = Number(process.env.BLOG_EVIDENCE_MIN_FACTS || 6);

const HOME = process.env.HOME || '/home/ubuntu';

/**
 * Git hashes, ISO timestamps, clock times and URLs are not claims. Strip them
 * before pulling numeric tokens so "35c1f53" does not license 35, and "14:30"
 * in a sentence about the cron does not look like an unsourced 30.
 */
export function stripStructuralNumericTokens(s: string): string {
  return s
    .replace(/\bhttps?:\/\/\S+/gi, ' ')
    .replace(/\b(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/gi, ' ')
    .replace(/\b\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ');
}

/** Pull every numeric token a fact licenses, so the verifier can check the article against it. */
function numbersIn(s: string): string[] {
  return (stripStructuralNumericTokens(s).match(/\d[\d,.]*/g) || []).map((n) => n.replace(/[.,]$/, ''));
}

/** Public pages must not carry identifiers, even when they showed up in a log line. */
function scrubPublic(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/Bearer\s+\S+/gi, '[token]')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '[ip]')
    .replace(/\b\d{9,}\b/g, '[id]');
}

function firstExistingDir(candidates: Array<string | undefined>): string | null {
  for (const d of candidates) {
    if (d && fs.existsSync(d)) return d;
  }
  return null;
}

function gitRepoDir(repo: string): string | null {
  const candidates: Array<string | undefined> = [path.join(HOME, repo)];
  if (repo === 'cto-aipa') candidates.push(process.cwd());
  if (repo === 'aideazz') candidates.push(process.env.AIDEAZZ_REPO_PATH);
  for (const d of candidates) {
    if (d && fs.existsSync(path.join(d, '.git'))) return d;
  }
  return null;
}

/**
 * A fact licenses every number it mentions — in its value, but also in its label
 * and its source. The first dry run rejected "48" from a legitimate sentence
 * about commits in the last 48 hours, because the 48 lived in the label
 * ("Commits in cto-aipa, last 48h") while only the value ("12") was licensed.
 * A window the evidence itself names is evidence.
 */
function fact(key: string, label: string, value: string, source: string): EvidenceFact {
  return { key, label, value, source, numbers: [...new Set([...numbersIn(value), ...numbersIn(label), ...numbersIn(source)])] };
}

async function run(cmd: string, timeoutMs = 25_000): Promise<string> {
  const { stdout } = await sh(cmd, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 });
  return stdout.trim();
}

/* ────────────────────────── collectors ────────────────────────── */

/** Fleet state: what is running, how long, how often it has restarted. */
async function collectPm2(facts: EvidenceFact[], stack: string[]): Promise<void> {
  const raw = await run('pm2 jlist');
  const list = JSON.parse(raw) as Array<{
    name: string;
    pm2_env?: { status?: string; pm_uptime?: number; restart_time?: number };
    monit?: { memory?: number };
  }>;
  const online = list.filter((p) => p.pm2_env?.status === 'online');
  facts.push(
    fact('pm2.count', 'Processes supervised by PM2', `${online.length} online of ${list.length}`, 'pm2 jlist'),
  );
  for (const p of list) {
    stack.push(p.name);
    const up = p.pm2_env?.pm_uptime ? Math.floor((Date.now() - p.pm2_env.pm_uptime) / 86_400_000) : null;
    const mem = p.monit?.memory ? Math.round(p.monit.memory / 1_048_576) : null;
    facts.push(
      fact(
        `pm2.${p.name}`,
        `Process ${p.name}`,
        `${p.pm2_env?.status ?? 'unknown'}, ${p.pm2_env?.restart_time ?? 0} restarts` +
          (up !== null ? `, up ${up}d` : '') +
          (mem !== null ? `, ${mem} MB` : ''),
        'pm2 jlist',
      ),
    );
  }
}

/** What actually changed in the last two days, in the author's own commit messages. */
async function collectGit(facts: EvidenceFact[]): Promise<void> {
  const repos = ['cto-aipa', 'aideazz', 'VibeJobHunterAIPA_AIMCF'];
  for (const repo of repos) {
    const dir = gitRepoDir(repo);
    if (!dir) continue;
    const log = await run(
      `cd ${JSON.stringify(dir)} && git log --since="48 hours ago" --no-merges --pretty=format:"%h|%ad|%s" --date=short | head -12`,
    );
    if (!log) continue;
    const lines = log.split('\n').filter(Boolean);
    facts.push(
      fact(`git.${repo}.count`, `Commits in ${repo}, last 48h`, `${lines.length}`, `git log --since="48 hours ago" in ${repo}`),
    );
    lines.slice(0, 6).forEach((l, i) => {
      const [hash, date, ...rest] = l.split('|');
      facts.push(
        fact(
          `git.${repo}.${i}`,
          `Commit in ${repo}`,
          `${hash} (${date}) ${rest.join('|')}`,
          `git log in ${repo}`,
        ),
      );
    });
  }
}

/** Outcome lines from the cron logs — what the automation actually did, not what it was configured to do. */
async function collectLogs(facts: EvidenceFact[], failures: string[]): Promise<void> {
  const logDir = path.join(HOME, 'logs');
  if (!fs.existsSync(logDir)) {
    failures.push('no ~/logs directory');
    return;
  }
  for (const f of fs.readdirSync(logDir).filter((n) => n.endsWith('.log'))) {
    const full = path.join(logDir, f);
    try {
      const st = fs.statSync(full);
      const ageH = (Date.now() - st.mtimeMs) / 3_600_000;
      if (ageH > 48) continue;
      const tail = await run(`tail -c 4000 ${JSON.stringify(full)}`);
      const interesting = tail
        .split('\n')
        .filter((l) => /\b(PASS|FAIL|ok|error|staged|sent|skipped|0 rows|rows|published|verdict|healthy)\b/i.test(l))
        .slice(-3)
        .map(scrubPublic);
      if (!interesting.length) continue;
      facts.push(
        fact(
          `log.${f}`,
          `Latest outcome in ${f}`,
          interesting.join(' ⏎ ').slice(0, 400),
          `tail of ~/logs/${f} (modified ${ageH.toFixed(1)}h ago)`,
        ),
      );
    } catch {
      failures.push(`log read failed: ${f}`);
    }
  }
}

/** Live CRM totals. Pipeline shape is a fact; revenue claims must come from here or not at all. */
async function collectHubSpot(facts: EvidenceFact[], failures: string[]): Promise<void> {
  const token = process.env.HUBSPOT_API_KEY?.trim();
  if (!token) {
    failures.push('HUBSPOT_API_KEY absent');
    return;
  }
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const countStage = async (stage: string): Promise<number | null> => {
    const r = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: 'dealstage', operator: 'EQ', value: stage }] }],
        limit: 1,
      }),
    });
    if (!r.ok) return null;
    return ((await r.json()) as { total?: number }).total ?? null;
  };
  try {
    const [replied, won] = await Promise.all([countStage('contractsent'), countStage('closedwon')]);
    if (replied !== null) {
      facts.push(fact('hs.replied', 'Deals at "They replied"', `${replied}`, 'HubSpot deals search API, dealstage=contractsent'));
    }
    if (won !== null) {
      facts.push(fact('hs.won', 'Deals closed won', `${won}`, 'HubSpot deals search API, dealstage=closedwon'));
    }
  } catch (e) {
    failures.push(`HubSpot: ${(e as Error).message.slice(0, 80)}`);
  }
}

/** Dependency manifests prove which technologies exist. Anything absent here cannot be claimed. */
async function collectStack(stack: string[], failures: string[]): Promise<void> {
  try {
    const pkgDir = gitRepoDir('cto-aipa') || path.join(HOME, 'cto-aipa');
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    stack.push(...Object.keys(pkg.dependencies || {}));
  } catch {
    failures.push('cto-aipa package.json unreadable');
  }
  try {
    const pipList = await run(`${HOME}/VibeJobHunterAIPA_AIMCF/venv/bin/python3 -m pip list --format=freeze 2>/dev/null | head -200`);
    stack.push(...pipList.split('\n').map((l) => l.split('==')[0]!.trim()).filter(Boolean));
  } catch {
    /* python stack is optional */
  }
}

function parseFrontMatterLite(raw: string): Record<string, string> {
  const m = raw.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const meta: Record<string, string> = {};
  let key: string | null = null;
  for (const line of m[1]!.split('\n')) {
    const hit = line.match(/^([a-z_]+):\s?(.*)$/);
    if (hit) {
      key = hit[1]!;
      meta[key] = hit[2]!.trim();
    } else if (key && line.trim()) {
      meta[key] += ` ${line.trim()}`;
    }
  }
  return meta;
}

/**
 * Wiki incidents from the last 48h — the Claude/Cursor sessions that earned a
 * write-up. Daily work is the article's actual source; without this collector
 * the model only sees pm2 uptime and invents the rest.
 */
async function collectWikiIncidents(facts: EvidenceFact[], failures: string[]): Promise<void> {
  const dir = firstExistingDir([
    path.join(HOME, 'aideazz', 'content', 'ai-ops-wiki', 'incidents'),
    process.env.AIDEAZZ_REPO_PATH
      ? path.join(process.env.AIDEAZZ_REPO_PATH, 'content', 'ai-ops-wiki', 'incidents')
      : undefined,
  ]);
  if (!dir) {
    failures.push('aideazz wiki incidents not on disk');
    return;
  }
  const cutoff = Date.now() - 48 * 3_600_000;
  const files = fs.readdirSync(dir).filter((n) => n.endsWith('.md')).sort().reverse();
  let kept = 0;
  for (const f of files) {
    if (kept >= 6) break;
    const full = path.join(dir, f);
    const st = fs.statSync(full);
    const dateM = f.match(/^(\d{4}-\d{2}-\d{2})/);
    const dateMs = dateM ? Date.parse(`${dateM[1]}T12:00:00Z`) : NaN;
    const recent = st.mtimeMs >= cutoff || (Number.isFinite(dateMs) && dateMs >= cutoff);
    if (!recent) continue;
    const meta = parseFrontMatterLite(fs.readFileSync(full, 'utf8'));
    const title = meta['title'] || f.replace(/\.md$/, '');
    const bits = ['subtitle', 'symptom', 'root_cause', 'verified', 'rule']
      .map((k) => meta[k])
      .filter(Boolean)
      .join(' — ')
      .slice(0, 400);
    facts.push(
      fact(
        `wiki.${f}`,
        `Wiki incident: ${title}`,
        bits || title,
        `aideazz content/ai-ops-wiki/incidents/${f}`,
      ),
    );
    kept += 1;
  }
}

/**
 * Operator queue from NOW.md when the file exists on the box. Scrubbed: this
 * can mention money-queue work, but public pages never get identifiers.
 */
async function collectNowMd(facts: EvidenceFact[]): Promise<void> {
  const file = firstExistingDir([
    path.join(process.cwd(), 'docs', 'oracle', 'NOW.md'),
    path.join(HOME, 'cto-aipa', 'docs', 'oracle', 'NOW.md'),
  ]);
  if (!file) return;
  const raw = scrubPublic(fs.readFileSync(file, 'utf8'));
  const lines = raw
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').trim())
    .filter((l) => l.length > 24 && !l.startsWith('<!--') && !l.startsWith('---'))
    .slice(0, 8);
  if (!lines.length) return;
  facts.push(
    fact('now.md', 'Current operator queue (NOW.md)', lines.join(' ⏎ ').slice(0, 500), file),
  );
}

/**
 * Collect everything. Individual collectors may fail — a thin bundle is a valid
 * outcome that the caller turns into "no article today", never into a guess.
 */
export async function collectProductionEvidence(): Promise<EvidenceBundle> {
  const facts: EvidenceFact[] = [];
  const stack: string[] = [];
  const failures: string[] = [];

  const collectors: Array<[string, () => Promise<void>]> = [
    ['pm2', () => collectPm2(facts, stack)],
    ['git', () => collectGit(facts)],
    ['logs', () => collectLogs(facts, failures)],
    ['hubspot', () => collectHubSpot(facts, failures)],
    ['wiki', () => collectWikiIncidents(facts, failures)],
    ['now', () => collectNowMd(facts)],
    ['stack', () => collectStack(stack, failures)],
  ];
  for (const [name, fn] of collectors) {
    try {
      await fn();
    } catch (e) {
      failures.push(`${name}: ${(e as Error).message.slice(0, 120)}`);
    }
  }

  return {
    collectedAt: new Date().toISOString(),
    facts,
    stack: [...new Set(stack.map((s) => s.toLowerCase()))],
    failures,
  };
}

/** Numbers the article may copy, excluding rhetorical 1–10 and years. */
export function licensedNumberList(bundle: EvidenceBundle): string[] {
  const licensed = new Set<string>();
  for (const f of bundle.facts) for (const n of f.numbers) licensed.add(n.replace(/,/g, ''));
  return [...licensed]
    .filter((n) => !isFreeNumber(n))
    .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
}

export function renderLicensedNumbersForPrompt(bundle: EvidenceBundle): string {
  const nums = licensedNumberList(bundle);
  if (!nums.length) {
    return 'LICENSED NUMBERS: none besides 1–10 and calendar years. If a point needs any other figure, omit the point.';
  }
  return `LICENSED NUMBERS — copy these exactly, or omit the point. Nothing else except 1–10 and years: ${nums.join(', ')}`;
}

/** The bundle as the model sees it. This is the ONLY material it may draw on. */
export function renderEvidenceForPrompt(b: EvidenceBundle): string {
  const lines = b.facts.map((f) => `- ${f.label}: ${f.value}\n    (measured by: ${f.source})`);
  return [
    `PRODUCTION EVIDENCE — collected ${b.collectedAt}`,
    '',
    ...lines,
    '',
    `TECHNOLOGIES PROVEN PRESENT: ${b.stack.slice(0, 60).join(', ')}`,
    '',
    renderLicensedNumbersForPrompt(b),
  ].join('\n');
}

/**
 * Topic briefs still ask for figures like "BrightData $40/run" and "76% of
 * inference". Those are not measurements. Before a brief is allowed near the
 * model, every digit is replaced so the draft cannot copy them and then fail
 * the gate — which is how 26 Aug 2026 skipped the day.
 */
export function stripUnverifiedNumbers(text: string): string {
  return text
    .replace(/\$?\d[\d,.]*\s*(?:%|k|\/run|\/month|\/mo)?/gi, ' a measured figure ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/\s+\./g, '.')
    .trim();
}

/**
 * Infrastructure that repeatedly shows up in generic articles about this kind of
 * system. Naming any of these while it is absent from the bundle is the exact
 * failure of 23 Aug 2026, so it is a hard reject rather than a warning.
 */
const INVENTION_MAGNETS = [
  'redis', 'kafka', 'kubernetes', 'k8s', 'rabbitmq', 'celery', 'airflow',
  'mongodb', 'dynamodb', 'cassandra', 'elasticsearch', 'memcached',
  'terraform', 'prometheus', 'grafana', 'datadog', 'snowflake',
];

/**
 * Numbers a piece of prose may use without a source: small counts used
 * rhetorically, ordinals, years, and clock-like fragments.
 */
function isFreeNumber(n: string): boolean {
  const clean = n.replace(/,/g, '');
  const v = Number(clean);
  if (!Number.isFinite(v)) return true;
  if (v <= 10) return true;                    // "three reasons", "two paths"
  if (v >= 1990 && v <= 2100) return true;     // years
  return false;
}

/**
 * The gate. Every number in the article must be traceable to the bundle, and no
 * absent infrastructure may be claimed. Fails closed: on doubt, do not publish.
 */
export function verifyArticleAgainstEvidence(
  markdown: string,
  bundle: EvidenceBundle,
): { ok: true } | { ok: false; reason: string } {
  const licensed = new Set<string>();
  for (const f of bundle.facts) for (const n of f.numbers) licensed.add(n.replace(/,/g, ''));

  // Strip fenced code — sample code legitimately contains arbitrary literals.
  // Then strip hashes, timestamps and URLs so they cannot look like claims.
  const prose = stripStructuralNumericTokens(
    markdown.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' '),
  );

  /**
   * Rounding is honest; invention is not. "roughly 55,000 restarts" for a
   * measured 55,193 is good writing, and the first dry run rejected all three
   * attempts partly for that. So a number also passes if it is within 2% of
   * something measured. Anything further away is not a rounding of a fact — it
   * is a different claim, and it fails.
   */
  const licensedNums = [...licensed].map(Number).filter(Number.isFinite);
  const isRoundingOfFact = (n: number): boolean =>
    licensedNums.some((L) => L !== 0 && Math.abs(n - L) / Math.abs(L) <= 0.02);

  const used = (prose.match(/\d[\d,.]*/g) || []).map((n) => n.replace(/[.,]$/, ''));
  const unsourced = [
    ...new Set(
      used.filter((n) => {
        const bare = n.replace(/,/g, '');
        if (isFreeNumber(n) || licensed.has(bare)) return false;
        const v = Number(bare);
        return !(Number.isFinite(v) && isRoundingOfFact(v));
      }),
    ),
  ];
  if (unsourced.length) {
    return { ok: false, reason: `unsourced number(s): ${unsourced.slice(0, 6).join(', ')}` };
  }

  const lower = prose.toLowerCase();
  const invented = INVENTION_MAGNETS.filter((t) => new RegExp(`\\b${t}\\b`).test(lower) && !bundle.stack.includes(t));
  if (invented.length) {
    return { ok: false, reason: `claims absent infrastructure: ${invented.join(', ')}` };
  }

  return { ok: true };
}

/**
 * Keep the day. If the model used one unsourced figure, drop the paragraphs
 * that contain it rather than throwing the whole article away. Cadence is the
 * product; invention is not.
 */
export function salvageArticleAgainstEvidence(
  markdown: string,
  bundle: EvidenceBundle,
): { ok: true; markdown: string } | { ok: false; reason: string; markdown: string } {
  const paragraphs = markdown.split(/\n{2,}/);
  const kept: string[] = [];
  for (const p of paragraphs) {
    const check = verifyArticleAgainstEvidence(p, bundle);
    if (check.ok) {
      kept.push(p);
      continue;
    }
    const trimmed = p.trim();
    if (/^#{2,3}\s/.test(trimmed) && !/\d/.test(trimmed)) kept.push(p);
  }
  const next = kept.join('\n\n').trim();
  if (!next) {
    return { ok: false, reason: 'salvage removed every paragraph', markdown: '' };
  }
  const v = verifyArticleAgainstEvidence(next, bundle);
  if (v.ok) return { ok: true, markdown: next };
  return { ok: false, reason: v.reason, markdown: next };
}

function pickDistinctiveFact(bundle: EvidenceBundle): EvidenceFact | null {
  const git = bundle.facts.find((f) => f.key.startsWith('git.') && !f.key.endsWith('.count'));
  if (git) return git;
  const wiki = bundle.facts.find((f) => f.key.startsWith('wiki.'));
  if (wiki) return wiki;
  return bundle.facts[0] ?? null;
}

/**
 * Deterministic last resort: an article assembled only from measured facts.
 * No model, so nothing to hallucinate. Used when four generation attempts
 * still invent numbers — silence is the wrong outcome if the day produced
 * evidence.
 */
export function composeEvidenceFallbackArticle(
  bundle: EvidenceBundle,
  opts?: { keyword?: string },
): { title: string; markdown: string } {
  const distinctive = pickDistinctiveFact(bundle);
  const date = bundle.collectedAt.slice(0, 10);
  const titleCore = distinctive
    ? distinctive.label.replace(/^Commit in /, 'Commit: ').slice(0, 80)
    : 'Production measurements';
  const title = `${titleCore} — ${date}`;

  const factLines = bundle.facts
    .slice(0, 18)
    .map((f) => `- **${f.label}:** ${f.value} _(measured by ${f.source})_`);
  const stack = bundle.stack.slice(0, 24).join(', ') || 'none recorded in the manifests this run';
  const failures = bundle.failures.length
    ? bundle.failures.map((x) => `- ${x}`).join('\n')
    : '- No collector reported a failure this run.';
  const keywordLine = opts?.keyword
    ? `Search angle for this note: ${stripUnverifiedNumbers(opts.keyword)}.`
    : 'This note has no rotation keyword — the angle is the measurements themselves.';

  const q1 = bundle.facts[0];
  const q2 = bundle.facts.find((f) => f.key.startsWith('git.')) || bundle.facts[1] || q1;
  const q3 = bundle.facts.find((f) => f.key.startsWith('hs.') || f.key.startsWith('pm2.')) || bundle.facts[2] || q1;

  const markdown = `The daily article is supposed to ship from measurements taken the same day, not from a topic brief that still asks for figures nobody measured. When a draft copies an unsourced number, the grounded path does not invent a replacement and it does not go silent either: it publishes the measurements.

${keywordLine}

## What the running system reported

These are the facts collected before a single sentence was drafted. Each line names the command or file that produced it.

${factLines.join('\n')}

## What I am willing to claim

I will claim only what is on that list. A percentage, a monthly cost, a duplicate-deal count, or a BrightData unit-price that is not on the list is not in this article. One failure mode was pages describing a database this fleet does not run. The other was the opposite: the gate correctly refused an unsourced figure copied from a topic brief, and then treated silence as the product.

Silence is the right answer when there is nothing to measure. It is the wrong answer when the day produced git, process, and outcome lines and the model could not stop decorating them. Claude and Cursor sessions are the source when they show up as commits, wiki incidents, or the operator queue. A rotating brief is an SEO hint, not a fact.

## What I am not claiming

${failures}

Proven stack names this run: ${stack}.

Anything not named there is out of scope. If a reader wants a cost matrix or a queue this fleet does not run, they will not find it here, because it was not measured here.

## Frequently Asked Questions

**Q: Why publish a measured-notes article instead of skipping the day?**
A: ${q1 ? `${q1.label} was ${q1.value}.` : 'The day produced verified facts.'} Skipping would have told operators the blog was down. Publishing the measurements keeps the cadence and keeps every figure traceable.

**Q: Where did today's git or session work go?**
A: ${q2 ? `${q2.label}: ${q2.value}.` : 'Git was silent this window, so it is not claimed.'} Claude and Cursor sessions become evidence when they land as commits, wiki incidents, or the operator queue — not when a brief asks for them.

**Q: What number is allowed in this article?**
A: ${q3 ? `${q3.label} measured ${q3.value}.` : 'Only figures that appear in the evidence bundle.'} Plus counts of ten or under, and calendar years. Everything else is omitted.

— Elena Revicheva · [AIdeazz](https://aideazz.xyz) · [Portfolio](https://aideazz.xyz/portfolio)
`;

  return { title, markdown };
}
