// =============================================================================
// ATUONA FACT ENGINE (7 Oct 2026, Elena: "each command, each time, rare true facts
// from the whole knowledge base — not stale lilies every time").
//
// Why: the creative commands pasted all 610 knowledge-base facts into every prompt
// and ASKED the model to pick obscure ones. A model shown 610 facts picks the most
// salient ones every time (salience bias). Here the CODE picks: 4 facts per command,
// 3 from the art lanes (the book is art history + Impressionism first) and 1 from
// the rest, always the least-used, with a ledger on disk so restarts do not reset it.
// =============================================================================
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface KbFact { id: string; domain: string; text: string; hash: string; }
interface Ledger { facts: Record<string, { n: number; last: number }>; domains: Record<string, number>; }

const ART_DOMAINS = ['ATU', 'GAU', 'ART', 'MOD', 'AUC'];   // Atuona, Gauguin, art history, museums, auctions
const OTHER_DOMAINS = ['FAS', 'VIB', 'NFT', 'ATL', 'AGT']; // fashion, vibe coding, NFT fusion, Atlas, agentic AI

let POOL: KbFact[] = [];

function ledgerPath(): string {
  const root = process.env.HASHNODE_TOPIC_STATE_DIR || path.join(process.cwd(), 'data');
  return path.join(root, 'atuona', 'fact-ledger.json');
}

function readLedger(): Ledger {
  try {
    const l = JSON.parse(fs.readFileSync(ledgerPath(), 'utf8'));
    return { facts: l.facts || {}, domains: l.domains || {} };
  } catch {
    return { facts: {}, domains: {} };
  }
}

function writeLedger(l: Ledger): void {
  try {
    fs.mkdirSync(path.dirname(ledgerPath()), { recursive: true });
    const tmp = ledgerPath() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(l));
    fs.renameSync(tmp, ledgerPath());
  } catch (e) {
    console.warn('[fact-engine] ledger write failed:', (e as Error).message);
  }
}

/** Split each module into its bullet facts, each prefixed with the module title and section header. */
export function initFactPool(modules: Record<string, string>): number {
  const pool: KbFact[] = [];
  for (const [domain, body] of Object.entries(modules)) {
    const lines = body.split('\n');
    const title = (lines.find(l => l.trim()) || '').trim().replace(/:$/, '');
    let section = '';
    let i = 0;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const m = line.match(/^(?:[-•*]|\d+\.)\s+(.*)$/);
      if (!m) { section = line.replace(/:$/, ''); continue; }
      const fact = (m[1] || '').trim();
      if (fact.length < 12) continue;
      i += 1;
      const ctx = section && section !== title ? `${title} › ${section}` : title;
      const text = `${ctx}: ${fact}`;
      pool.push({ id: `${domain}-${String(i).padStart(3, '0')}`, domain, text,
        hash: crypto.createHash('sha1').update(fact).digest('hex').slice(0, 12) });
    }
  }
  POOL = pool;
  console.log(`[fact-engine] pool: ${pool.length} facts in ${Object.keys(modules).length} lanes`);
  return pool.length;
}

/** Least-used fact of a domain; ties broken at random. */
function pickFromDomain(domain: string, l: Ledger): KbFact | undefined {
  const cands = POOL.filter(f => f.domain === domain);
  if (!cands.length) return undefined;
  const min = Math.min(...cands.map(f => l.facts[f.hash]?.n || 0));
  const fresh = cands.filter(f => (l.facts[f.hash]?.n || 0) === min);
  return fresh[Math.floor(Math.random() * fresh.length)];
}

/** Least-recently-drawn domains first, ties at random. */
function orderDomains(domains: string[], l: Ledger): string[] {
  return [...domains].sort((a, b) => (l.domains[a] || 0) - (l.domains[b] || 0) || Math.random() - 0.5);
}

export function drawFacts(artCount = 3, otherCount = 1): KbFact[] {
  if (!POOL.length) return [];
  const l = readLedger();
  const picked: KbFact[] = [];
  for (const d of orderDomains(ART_DOMAINS, l).slice(0, artCount)) { const f = pickFromDomain(d, l); if (f) picked.push(f); }
  for (const d of orderDomains(OTHER_DOMAINS, l).slice(0, otherCount)) { const f = pickFromDomain(d, l); if (f) picked.push(f); }
  const now = Date.now();
  for (const f of picked) {
    const e = l.facts[f.hash] || { n: 0, last: 0 };
    l.facts[f.hash] = { n: e.n + 1, last: now };
    l.domains[f.domain] = now;
  }
  writeLedger(l);
  console.log(`[fact-engine] drew ${picked.map(f => f.id).join(' ')}`);
  return picked;
}

export function factsPromptBlock(facts: KbFact[]): string {
  if (!facts.length) return '';
  return `
═══════════════════════════════════════════════════════════════
TODAY'S FACTS — chosen for this piece from the knowledge base (rotated; never the same twice running)
═══════════════════════════════════════════════════════════════
${facts.map(f => `[${f.id}] ${f.text}`).join('\n')}

Build the piece on THESE facts — the first three are art history (the book's spine), the fourth is the counterpoint.
Use at least three of them, as wounds and images, not as a lecture. Do not add any other historical names, dates,
prices or numbers that are not in these facts or in the canon poems.
`;
}

/** Footer shown under the Telegram reply. Plain text: no Markdown control characters. */
export function factsFooter(facts: KbFact[]): string {
  if (!facts.length) return '';
  const clean = (s: string) => s.replace(/[*_`\[\]]/g, '').replace(/\s+/g, ' ');
  return '\n\n📚 Facts: ' + facts.map(f => {
    const body = clean(f.text.split(': ').slice(1).join(': ') || f.text);
    return `${f.id} ${body.length > 70 ? body.slice(0, 69) + '…' : body}`;
  }).join(' · ');
}
