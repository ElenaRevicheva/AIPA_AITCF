/**
 * Follow-up radar cleanup — the approve half of the loop.
 *
 * VJH `scripts/followup_radar.py` recomputes the digest from the mailbox every
 * morning and posts the text. This module is the only thing that writes the
 * ledger, and it is also what builds the inline keyboard.
 *
 * Earned 6 Sep 2026: the keyboard was gated on `item.stale`. After a successful
 * clean-up the remaining threads (4–5 days) still appear in the digest text
 * but no longer qualify as stale, so Telegram posts a card with nothing to tap.
 * The threshold may decide what the radar *asks* about. It must not decide
 * whether Elena is *allowed* to clear a thread she can already see.
 *
 * "Clean" never touches mail. It means "stop showing me this thread".
 */

import * as fs from 'fs';
import * as path from 'path';

export interface RadarItem {
  key: string;
  who: string;
  subject: string;
  age: number;
  stale?: boolean;
}

export interface RadarLedgerRow {
  at: string;
  until?: string | null;
  who?: string;
  kind?: 'dismissed' | 'kept';
}

export interface RadarProposal {
  id: string;
  items: RadarItem[];
}

export type RadarKeyboard = {
  inline_keyboard: { text: string; callback_data: string }[][];
};

const PROPOSAL_NAME = 'radar-proposal.json';
const LEDGER_NAME = 'radar-dismissed.json';

export function radarDirCandidates(): string[] {
  const env = process.env.RADAR_STATE_DIR?.trim();
  const cwdData = path.join(process.cwd(), 'data');
  return [
    ...(env ? [env] : []),
    cwdData,
    '/home/ubuntu/cto-aipa/data',
    '/home/ubuntu/VibeJobHunterAIPA_AIMCF/data',
    '/home/ubuntu/VibeJobHunterAIPA_AIMCF/autonomous_data',
  ].filter((d, i, all) => all.indexOf(d) === i);
}

export function radarDir(): string {
  for (const dir of radarDirCandidates()) {
    if (fs.existsSync(path.join(dir, PROPOSAL_NAME)) || fs.existsSync(path.join(dir, LEDGER_NAME))) {
      return dir;
    }
  }
  return process.env.RADAR_STATE_DIR?.trim() || path.join(process.cwd(), 'data');
}

export function loadRadarProposal(dir = radarDir()): RadarProposal | null {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, PROPOSAL_NAME), 'utf8'));
    if (!raw || typeof raw.id !== 'string' || !Array.isArray(raw.items)) return null;
    return raw as RadarProposal;
  } catch {
    return null;
  }
}

export function saveRadarProposal(proposal: RadarProposal, dir = radarDir()): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, PROPOSAL_NAME), JSON.stringify(proposal, null, 2), 'utf8');
}

export function loadRadarLedger(dir = radarDir()): Record<string, RadarLedgerRow> {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, LEDGER_NAME), 'utf8'));
  } catch {
    return {};
  }
}

export function saveRadarLedger(ledger: Record<string, RadarLedgerRow>, dir = radarDir()): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, LEDGER_NAME), JSON.stringify(ledger, null, 2), 'utf8');
}

export function newRadarProposalId(): string {
  return `rdr-${Date.now().toString(36)}`;
}

export function radarItemKey(who: string, subject: string): string {
  const w = who.trim().toLowerCase();
  const s = subject.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
  return `${w}|${s}`;
}

/** A snooze that has expired is not a hide. Permanent dismissals have `until: null`. */
export function ledgerHides(row: RadarLedgerRow | undefined, now = new Date()): boolean {
  if (!row) return false;
  if (row.until) return new Date(row.until).getTime() > now.getTime();
  return row.kind !== 'kept';
}

export function itemKeyAliases(it: RadarItem): string[] {
  return [...new Set([
    it.key,
    it.who.trim().toLowerCase(),
    radarItemKey(it.who, it.subject || ''),
  ])];
}

export function ledgerHidesItem(
  it: RadarItem,
  ledger: Record<string, RadarLedgerRow>,
  now = new Date(),
): boolean {
  return itemKeyAliases(it).some((k) => ledgerHides(ledger[k], now));
}

export function dismissRadarItems(
  items: RadarItem[],
  ledger: Record<string, RadarLedgerRow>,
  row: RadarLedgerRow,
): void {
  for (const it of items) {
    for (const k of itemKeyAliases(it)) {
      ledger[k] = { ...row, who: it.who };
    }
  }
}

export function openRadarItems(
  items: RadarItem[],
  ledger: Record<string, RadarLedgerRow>,
  now = new Date(),
): { it: RadarItem; n: number }[] {
  return items.map((it, n) => ({ it, n })).filter(({ it }) => !ledgerHidesItem(it, ledger, now));
}

const BUTTONS_SENT = 'radar-buttons-sent.json';

export function radarButtonsSentToday(dir = radarDir(), now = new Date()): boolean {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, BUTTONS_SENT), 'utf8'));
    return raw?.date === now.toISOString().slice(0, 10);
  } catch {
    return false;
  }
}

export function markRadarButtonsSent(dir = radarDir(), now = new Date()): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, BUTTONS_SENT), JSON.stringify({
    date: now.toISOString().slice(0, 10),
    at: now.toISOString(),
  }, null, 2), 'utf8');
}

/**
 * Always list every still-open thread. `showAll` is kept so older callback
 * payloads (`rdrall:`) still work; it no longer hides anyone.
 */
export function radarKeyboard(
  pid: string,
  items: RadarItem[],
  ledger: Record<string, RadarLedgerRow>,
  _showAll = true,
): RadarKeyboard {
  const open = openRadarItems(items, ledger);
  const shown = open.slice(0, 12);
  const rows: { text: string; callback_data: string }[][] = shown.map(({ it, n }) => [{
    text: `🧹 ${it.age}d  ${buttonWho(it.who)}`,
    callback_data: `rdrone:${pid}:${n}`,
  }]);
  const tail: { text: string; callback_data: string }[] = [];
  if (shown.length) {
    tail.push({ text: `🧹 Clear ${shown.length}`, callback_data: `rdrcleanall:${pid}` });
  }
  if (open.length) tail.push({ text: 'Keep all', callback_data: `rdrkeep:${pid}` });
  if (tail.length) rows.push(tail);
  return { inline_keyboard: rows };
}

function buttonWho(who: string): string {
  const [local, domain] = who.split('@');
  return `${(local || who).slice(0, 18)}@${(domain || '').slice(0, 14)}`;
}

/**
 * Parse the digest the Python radar already posted. Format earned from the
 * live card (6 Sep 2026):
 *
 *   5d recruiter@example.com
 *   Interview Invitation + Next Steps
 */
export function parseRadarDigest(text: string): RadarItem[] {
  const items: RadarItem[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line == null) continue;
    const m = line.trim().match(/^(\d+)d\s+(\S+@\S+)/i);
    if (!m) continue;
    const age = Number(m[1]);
    const who = (m[2] || '').replace(/[<>]/g, '').replace(/[.,;:]+$/, '');
    let subject = '';
    for (let j = i + 1; j < lines.length; j++) {
      const raw = lines[j];
      if (raw == null) continue;
      const next = raw.trim();
      if (!next) continue;
      if (/^\d+d\s+\S+@/.test(next)) break;
      if (/Follow-up radar/i.test(next)) break;
      if (/WROTE LAST/i.test(next)) break;
      if (/^✅\s*POSTED/i.test(next)) break;
      if (/^[🔴🟡🟢📡🛰️]/.test(next)) break;
      subject = next.replace(/^["“]|["”]$/g, '');
      break;
    }
    items.push({
      key: radarItemKey(who, subject),
      who,
      subject,
      age,
      stale: true,
    });
  }
  return items;
}

export function isRadarDigest(text: string | undefined | null): boolean {
  if (!text) return false;
  return /Follow-up radar/i.test(text) && /\d+d\s+\S+@\S+/.test(text);
}

/**
 * Prefer keys from the on-disk proposal (what Python will honour tomorrow).
 * Fall back to parsed digest rows so a missing/stale-only proposal cannot
 * strand a thread Elena can already see.
 */
export function mergeRadarItems(proposal: RadarItem[] | undefined, parsed: RadarItem[]): RadarItem[] {
  if (!proposal?.length) return parsed;
  if (!parsed.length) return proposal;
  const byWho = new Map(proposal.map((it) => [it.who.trim().toLowerCase(), it]));
  const out: RadarItem[] = [];
  const seen = new Set<string>();
  for (const p of parsed) {
    const existing = byWho.get(p.who.trim().toLowerCase());
    if (existing) {
      out.push({ ...existing, age: p.age || existing.age, stale: true });
      seen.add(existing.key);
    } else {
      out.push(p);
      seen.add(p.key);
    }
  }
  for (const it of proposal) {
    if (!seen.has(it.key)) out.push({ ...it, stale: true });
  }
  return out;
}

export function resolveRadarProposal(opts: {
  digestText?: string | null | undefined;
  dir?: string;
}): { proposal: RadarProposal; source: 'file' | 'digest' | 'merged' } | null {
  const dir = opts.dir || radarDir();
  const file = loadRadarProposal(dir);
  const parsed = opts.digestText ? parseRadarDigest(opts.digestText) : [];
  if (file && parsed.length) {
    return {
      proposal: { id: file.id, items: mergeRadarItems(file.items, parsed) },
      source: 'merged',
    };
  }
  if (file) return { proposal: file, source: 'file' };
  if (parsed.length) {
    return {
      proposal: { id: newRadarProposalId(), items: parsed },
      source: 'digest',
    };
  }
  return null;
}
