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

/** Pull every numeric token a fact licenses, so the verifier can check the article against it. */
function numbersIn(s: string): string[] {
  return (s.match(/\d[\d,.]*/g) || []).map((n) => n.replace(/[.,]$/, ''));
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
    const dir = path.join(HOME, repo);
    if (!fs.existsSync(path.join(dir, '.git'))) continue;
    const log = await run(
      `cd ${dir} && git log --since="48 hours ago" --no-merges --pretty=format:"%h|%ad|%s" --date=short | head -12`,
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
        .slice(-3);
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
    const pkg = JSON.parse(fs.readFileSync(path.join(HOME, 'cto-aipa', 'package.json'), 'utf8')) as {
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

/** The bundle as the model sees it. This is the ONLY material it may draw on. */
export function renderEvidenceForPrompt(b: EvidenceBundle): string {
  const lines = b.facts.map((f) => `- ${f.label}: ${f.value}\n    (measured by: ${f.source})`);
  return [
    `PRODUCTION EVIDENCE — collected ${b.collectedAt}`,
    '',
    ...lines,
    '',
    `TECHNOLOGIES PROVEN PRESENT: ${b.stack.slice(0, 60).join(', ')}`,
  ].join('\n');
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
  const prose = markdown.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ');

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
