/**
 * "Move paid cards" — roll this month's paid Cita cards to next month's board. ON DEMAND ONLY.
 *
 * Why (16 Nov 2026): Elena pays a batch of bills mid-month (10–15th), then moves each card by hand to next
 * month's Kira board and re-types its date. On 16 Nov that was 8 cards. She asked for the bot to do it — but
 * only when she says so, by voice or text, and only after she sees the list. Never on a timer.
 *
 * Flow: she says "move paid cards" / "перенеси оплаченные" / "pasa las pagadas" (optionally "up to the 15th")
 *   → planRollover() lists the Cita cards on THIS month's board due from the 1st up to that day
 *   → she taps ✅ (or ❌) → executeRollover() moves each card to next month's Cita column, same day next month,
 *     same Panama clock time, then reads every card back and reports what Trello actually holds.
 *
 * Deliberate choices:
 * - Boards are resolved by NAME from the date ("Kira Diciembre 2026") with the helpers in iendi-cita.ts —
 *   never a hardcoded month list (she recycles 3 boards by renaming them; see reference_trello_access).
 *   No next-month board → it refuses and says which name it looked for. It never creates a board.
 * - A card for a cancelled subscription is FLAGGED and left where it is: rolling it would remind her to pay
 *   something that will not charge. The list mirrors SUBSCRIPTIONS.md (audit 3 Nov 2026), section 6.
 * - Execute re-reads each card first: if it is no longer in the source column (she moved it by hand, or the
 *   ✅ was tapped twice) it is skipped. A double tap cannot push a card two months ahead.
 * - The billing day is whatever the card says. If a provider's real billing day differs, fix the date once
 *   on the card and every later roll carries the corrected day.
 */
import { MONTH_NAME, boardForMonth, citaList, sortCitaList, tGet, tSend, type Board } from './iendi-cita';

const PANAMA_MS = 5 * 3600 * 1000; // UTC-5, no DST

/** Cancelled per SUBSCRIPTIONS.md §6 (3 Nov 2026). Matched on the card title. */
export const CANCELLED_SUBSCRIPTIONS: { name: string; re: RegExp }[] = [
  { name: 'X Plus', re: /\bx\s*(\(twitter\)\s*)?plus\b|twitter\s*(plus|premium|blue)/i },
  { name: 'Google Ads', re: /google\s*ads/i },
  { name: 'ChatGPT Plus', re: /chat\s*gpt|openai\s*plus/i },
  { name: 'Cursor', re: /\bcursor\b/i },
  { name: 'Loom', re: /\bloom\b/i },
  { name: 'LinkedIn Premium', re: /linked\s*in/i },
  { name: 'Zoom', re: /\bzoom\b/i },
  { name: 'Spotify', re: /spotify/i },
  { name: 'CapCut', re: /cap\s*cut/i },
  { name: 'Google One', re: /google\s*one/i },
  { name: 'Prime Video', re: /prime\s*video|amazon\s*prime/i },
  { name: 'NordVPN', re: /nord\s*vpn/i },
  { name: 'SerpApi', re: /serp\s*api/i },
  { name: 'CCleaner', re: /ccleaner/i },
  { name: 'FlexJobs', re: /flex\s*jobs/i },
];

export function cancelledMatch(title: string): string | null {
  return CANCELLED_SUBSCRIPTIONS.find(c => c.re.test(title))?.name || null;
}

// ── Recognising the request ────────────────────────────────────────────────────

const MOVE_WORDS = /\b(move|roll|carry|shift|transfer)\b|перенес|перенест|переложи|передвин|перекин|\b(pasa|pasar|mueve|mover|traslada|trasladar|lleva|llevar)\b/i;
const PAID_WORDS = /\bpaid\b|оплачен|оплатил|\bpagad[oa]s?\b|\bpagos?\s+hechos\b|\bya\s+pagu[eé]\b/i;

/** "move paid cards", "перенеси оплаченные карточки", "pasa las pagadas al mes que viene". Both a move and a paid word. */
export function isRolloverRequest(text: string): boolean {
  const t = (text || '').slice(0, 400);
  return MOVE_WORDS.test(t) && PAID_WORDS.test(t);
}

/**
 * The last day to include, from "up to the 15th" / "until 15" / "до 15" / "по 15-е" / "hasta el 15" / "al 15".
 * Nothing said → null (the caller uses today).
 */
export function parseUpToDay(text: string): number | null {
  const m = (text || '').match(/(?:up\s*to|until|till|through|thru|by|до|по|hasta(?:\s+el)?|al)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th|-?е|-?го|го)?\b/i);
  if (!m) return null;
  const d = Number(m[1]);
  return d >= 1 && d <= 31 ? d : null;
}

// ── Dates (Panama wall clock) ──────────────────────────────────────────────────

interface Ymd { y: number; m: number; d: number }

export function panamaParts(iso: string | Date): Ymd & { hh: number; mm: number } {
  const p = new Date(new Date(iso).getTime() - PANAMA_MS);
  return { y: p.getUTCFullYear(), m: p.getUTCMonth() + 1, d: p.getUTCDate(), hh: p.getUTCHours(), mm: p.getUTCMinutes() };
}

function daysIn(y: number, m: number): number { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

/** Same day next month, same Panama clock time; 31 Jan → 28/29 Feb. Returns a UTC instant for Trello. */
export function nextMonthDue(dueIso: string): string {
  const p = panamaParts(dueIso);
  const y = p.m === 12 ? p.y + 1 : p.y;
  const m = p.m === 12 ? 1 : p.m + 1;
  const d = Math.min(p.d, daysIn(y, m));
  return new Date(Date.UTC(y, m - 1, d, p.hh, p.mm) + PANAMA_MS).toISOString();
}

export function fmtPanama(iso: string): string {
  const p = panamaParts(iso);
  return `${p.d} ${MONTH_NAME[p.m]?.slice(0, 3)} ${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}`;
}

// ── Plan ───────────────────────────────────────────────────────────────────────

export interface RolloverItem { id: string; name: string; due: string; newDue: string; cancelled: string | null }
export interface RolloverPlan {
  fromBoard: string; fromListId: string;
  toBoard: string; toBoardId: string; toListId: string;
  upTo: Ymd;
  items: RolloverItem[];
  problem: string | null;
}

interface CardRow { id: string; name: string; due: string | null; idList: string; idBoard?: string; closed?: boolean }

export async function planRollover(upToDay: number | null, now: Date = new Date()): Promise<RolloverPlan> {
  const today = panamaParts(now);
  const upTo: Ymd = { y: today.y, m: today.m, d: Math.min(upToDay ?? today.d, daysIn(today.y, today.m)) };
  const nextY = upTo.m === 12 ? upTo.y + 1 : upTo.y;
  const nextM = upTo.m === 12 ? 1 : upTo.m + 1;
  const empty: RolloverPlan = { fromBoard: '', fromListId: '', toBoard: '', toBoardId: '', toListId: '', upTo, items: [], problem: null };

  const boards = await tGet<Board[]>('/members/me/boards', { fields: 'name', filter: 'open' });
  const from = await boardForMonth(upTo.m, upTo.y, boards);
  if (!from) return { ...empty, problem: `no board named "Kira ${MONTH_NAME[upTo.m]} ${upTo.y}"` };
  const to = await boardForMonth(nextM, nextY, boards);
  if (!to) return { ...empty, fromBoard: from.name, problem: `no board named "Kira ${MONTH_NAME[nextM]} ${nextY}" — rename one first, I never create boards` };
  const fromList = await citaList(from.id);
  const toList = await citaList(to.id);
  if (!fromList || !toList) return { ...empty, fromBoard: from.name, toBoard: to.name, problem: `no Cita column on ${!fromList ? from.name : to.name}` };

  const startMs = Date.UTC(upTo.y, upTo.m - 1, 1) + PANAMA_MS;              // 1st, 00:00 Panama
  const endMs = Date.UTC(upTo.y, upTo.m - 1, upTo.d + 1) + PANAMA_MS;       // the day after upTo, 00:00 Panama
  const cards = await tGet<CardRow[]>(`/lists/${fromList.id}/cards`, { fields: 'name,due,idList' });
  const items = cards
    .filter(c => c.due && Date.parse(c.due) >= startMs && Date.parse(c.due) < endMs)
    .sort((a, b) => (a.due || '').localeCompare(b.due || ''))
    .map(c => ({ id: c.id, name: c.name.trim(), due: c.due as string, newDue: nextMonthDue(c.due as string), cancelled: cancelledMatch(c.name) }));
  return { fromBoard: from.name, fromListId: fromList.id, toBoard: to.name, toBoardId: to.id, toListId: toList.id, upTo, items, problem: null };
}

export function formatPlan(p: RolloverPlan): string {
  if (p.problem) return `⚠️ Move paid cards: ${p.problem}. Nothing moved.`;
  const head = `📦 ${p.fromBoard} → ${p.toBoard}, Cita cards due 1–${p.upTo.d} ${MONTH_NAME[p.upTo.m]}:`;
  if (!p.items.length) return `${head}\nNone. Nothing to move.`;
  const roll = p.items.filter(i => !i.cancelled);
  const flagged = p.items.filter(i => i.cancelled);
  const lines = roll.map((i, n) => `${n + 1}. ${i.name.slice(0, 60)} — ${fmtPanama(i.due)} → ${fmtPanama(i.newDue)}`);
  const flags = flagged.map(i => `⛔ ${i.name.slice(0, 60)} (${fmtPanama(i.due)}) — ${i.cancelled} is CANCELLED, staying put`);
  return [head, ...lines, ...(flags.length ? ['', ...flags] : []),
    '', roll.length ? `Tap ✅ to move these ${roll.length}, or ❌ to leave everything as it is.` : 'Nothing to move.'].join('\n');
}

// ── Pending confirmations (in memory, 30 min) ─────────────────────────────────

const pending = new Map<string, { plan: RolloverPlan; uid: number; ts: number }>();
const TTL_MS = 30 * 60 * 1000;

export function savePending(plan: RolloverPlan, uid: number): string {
  for (const [k, v] of pending) if (Date.now() - v.ts > TTL_MS) pending.delete(k);
  const token = Math.random().toString(36).slice(2, 10);
  pending.set(token, { plan, uid, ts: Date.now() });
  return token;
}

export function takePending(token: string, uid: number): RolloverPlan | null {
  const v = pending.get(token);
  pending.delete(token);
  if (!v || v.uid !== uid || Date.now() - v.ts > TTL_MS) return null;
  return v.plan;
}

// ── Execute + read back ────────────────────────────────────────────────────────

export interface RolloverResult { moved: string[]; skipped: string[]; failed: string[] }

export async function executeRollover(p: RolloverPlan): Promise<RolloverResult> {
  const r: RolloverResult = { moved: [], skipped: [], failed: [] };
  for (const i of p.items) {
    if (i.cancelled) { r.skipped.push(`${i.name} (cancelled: ${i.cancelled})`); continue; }
    try {
      const now = await tGet<CardRow>(`/cards/${i.id}`, { fields: 'name,due,idList,closed' });
      if (now.closed || now.idList !== p.fromListId) { r.skipped.push(`${i.name} (no longer in ${p.fromBoard} Cita)`); continue; }
      await tSend('PUT', `/cards/${i.id}`, { idBoard: p.toBoardId, idList: p.toListId, due: i.newDue, pos: 'bottom' });
      const back = await tGet<CardRow>(`/cards/${i.id}`, { fields: 'name,due,idList,idBoard' });
      if (back.idList === p.toListId && back.due && Date.parse(back.due) === Date.parse(i.newDue)) {
        r.moved.push(`${i.name.slice(0, 60)} → ${fmtPanama(back.due)}`);
      } else {
        r.failed.push(`${i.name}: Trello reads back list ${back.idList === p.toListId ? 'ok' : 'WRONG'}, due ${back.due ? fmtPanama(back.due) : 'none'}`);
      }
    } catch (e) {
      r.failed.push(`${i.name}: ${(e as Error).message.slice(0, 90)}`);
    }
  }
  if (r.moved.length) { try { await sortCitaList(p.toListId); } catch { /* order is cosmetic */ } }
  console.log(`[trello-rollover] ${p.fromBoard} → ${p.toBoard}: moved ${r.moved.length}, skipped ${r.skipped.length}, failed ${r.failed.length}`);
  return r;
}

export function formatResult(p: RolloverPlan, r: RolloverResult): string {
  return [
    `✅ Moved ${r.moved.length} card(s) to ${p.toBoard} → Cita (read back from Trello):`,
    ...r.moved.map(s => `• ${s}`),
    ...(r.skipped.length ? ['', 'Left where they were:', ...r.skipped.map(s => `• ${s}`)] : []),
    ...(r.failed.length ? ['', '⚠️ Failed:', ...r.failed.map(s => `• ${s}`)] : []),
  ].join('\n');
}
