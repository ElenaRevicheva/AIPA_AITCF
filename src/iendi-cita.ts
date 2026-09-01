/**
 * IENDI appointments → Trello Cita cards, from a Telegram paste or voice note.
 *
 * Why this exists (1 Sep 2026): the clinic sends Elena a block of Spanish
 * appointment lines. Yesterday that became 19 Trello cards by hand — parsed,
 * date-converted, month-routed, labelled and sorted. She is a single mother on
 * the go and that job recurs every few months, so it belongs in the bot.
 *
 * Two things it does NOT do, deliberately:
 *
 * - **It does not use the stale board keyword list.** `trello-voice.ts` maps
 *   `kira_current_month` to a hardcoded `mayo/junio/julio 2026`, which cannot
 *   see September onward. Boards here are resolved *dynamically* from the
 *   appointment's own month, so this keeps working in December without an edit.
 * - **It does not overwrite anything.** Cards are matched on name + due before
 *   insert, so re-sending the same clinic block is a no-op rather than a
 *   duplicate. Sorting only ever changes card position, never content.
 *
 * Timezone: Panama is UTC-5 with no DST. Trello stores `due` as a UTC instant
 * and renders it in the viewer's zone, so 8:00 a.m. must be stored as 13:00Z.
 * Getting this wrong puts every medical appointment five hours out while the
 * API response still looks perfectly correct.
 */
const TRELLO_BASE = 'https://api.trello.com/1';
const PANAMA_OFFSET_HOURS = 5;

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12,
};
const MONTH_NAME = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export interface Appointment {
  day: number; month: number; year: number;
  hour: number; minute: number;
  specialty: string;
  doctor: string;
  centre: string;
  observation: string;
  /** UTC instant for Trello `due`. */
  dueIso: string;
}

export interface CitaResult {
  parsed: number;
  created: number;
  skipped: number;
  failed: number;
  byBoard: Record<string, number>;
  problems: string[];
  lines: string[];
}

function creds(): { key: string; token: string } {
  const key = process.env.TRELLO_API_KEY?.trim() || '';
  const token = process.env.TRELLO_TOKEN?.trim() || '';
  if (!key || !token) throw new Error('TRELLO_API_KEY / TRELLO_TOKEN missing from environment');
  return { key, token };
}

async function tGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const { key, token } = creds();
  const u = new URL(TRELLO_BASE + path);
  Object.entries({ ...params, key, token }).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${(await r.text()).slice(0, 120)}`);
  return (await r.json()) as T;
}

async function tSend<T>(method: 'POST' | 'PUT', path: string, body: Record<string, string>): Promise<T> {
  const { key, token } = creds();
  const u = new URL(TRELLO_BASE + path);
  u.searchParams.set('key', key);
  u.searchParams.set('token', token);
  const r = await fetch(u.toString(), {
    method,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${(await r.text()).slice(0, 120)}`);
  return (await r.json()) as T;
}

/**
 * Pull appointments out of the clinic's Spanish block.
 *
 * Tolerant on purpose: dictated text and copy-paste both arrive with broken
 * spacing, "a. m." variants and missing accents. Anything it cannot read is
 * reported rather than silently dropped — a missed appointment is the whole cost
 * of this feature being wrong.
 */
export function parseIendiText(raw: string): { appts: Appointment[]; problems: string[] } {
  const text = (raw || '').replace(/\r/g, '');
  const problems: string[] = [];
  const appts: Appointment[] = [];

  // Split into blocks, each starting at "Cita programada"
  const blocks = text.split(/(?=Cita\s+programada)/i).map(b => b.trim()).filter(Boolean);
  for (const block of blocks) {
    if (!/Cita\s+programada/i.test(block)) continue;
    const m = block.match(
      /Cita\s+programada\s+para\s+el\s+[^,]*,?\s*(\d{1,2})\s+de\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s+de\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*([ap])\s*\.?\s*m\s*\.?\s+para\s+(.+?)\s+con\s+el\s+m[eé]dico\s+(.+?)\s+en\s+el\s+centro\s+m[eé]dico\s+(.+?)(?:\n|$)/i,
    );
    if (!m) { problems.push('could not read: ' + block.slice(0, 70).replace(/\s+/g, ' ')); continue; }

    const [, dd, monthWord, yyyy, hh, mm, ampm, specialty, doctor, centre] = m;
    const month = MONTHS[(monthWord || '').toLowerCase()];
    if (!month) { problems.push(`unknown month "${monthWord}"`); continue; }

    let hour = parseInt(hh || '0', 10);
    if ((ampm || '').toLowerCase() === 'p' && hour !== 12) hour += 12;
    if ((ampm || '').toLowerCase() === 'a' && hour === 12) hour = 0;
    const minute = parseInt(mm || '0', 10);

    const obs = block.match(/Observaci[oó]n:\s*(?:Motivo\s*)?([\s\S]+?)(?:\n\s*\n|$)/i);

    appts.push({
      day: parseInt(dd || '0', 10), month, year: parseInt(yyyy || '0', 10),
      hour, minute,
      specialty: (specialty || '').trim(),
      doctor: (doctor || '').trim(),
      centre: (centre || '').trim(),
      observation: (obs?.[1] || '').trim().replace(/\s+/g, ' '),
      dueIso: new Date(Date.UTC(
        parseInt(yyyy || '0', 10), month - 1, parseInt(dd || '0', 10),
        hour + PANAMA_OFFSET_HOURS, minute, 0,
      )).toISOString(),
    });
  }
  return { appts, problems };
}

interface Board { id: string; name: string }
interface List { id: string; name: string }
interface Label { id: string; color: string }

/** Resolve `Kira <Mes> <Año>` from the appointment's own month — never a hardcoded list. */
async function boardForMonth(month: number, year: number, boards: Board[]): Promise<Board | null> {
  const want = `${MONTH_NAME[month]} ${year}`.toLowerCase();
  return boards.find(b => b.name.toLowerCase().includes(want.toLowerCase())
    && /kira/i.test(b.name)) || null;
}

/** The dated column. Matched fuzzily — October's is "Датировано." with a stray period. */
async function citaList(boardId: string): Promise<List | null> {
  const lists = await tGet<List[]>(`/boards/${boardId}/lists`, { fields: 'name' });
  return lists.find(l => /cita|датиров/i.test(l.name)) || null;
}

async function redLabel(boardId: string): Promise<Label | null> {
  const labels = await tGet<Label[]>(`/boards/${boardId}/labels`, { fields: 'name,color' });
  return labels.find(l => l.color === 'red') || null; // red = FAMILY, per trello-voice.ts
}

function cardTitle(a: Appointment): string {
  const clock = `${a.hour}:${String(a.minute).padStart(2, '0')}`;
  return `${a.specialty} ${clock} · IEN Neurodesarrollo`;
}

function cardDesc(a: Appointment): string {
  const clock = `${a.hour}:${String(a.minute).padStart(2, '0')}`;
  return [
    `Cita: ${a.day} de ${MONTH_NAME[a.month]?.toLowerCase()} de ${a.year}, ${clock} ${a.hour < 12 ? 'a.m.' : 'p.m.'}`,
    `Especialidad: ${a.specialty}`,
    `Médico: ${a.doctor}`,
    `Centro: ${a.centre}`,
    a.observation ? `Observación: ${a.observation}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * Create the cards. Idempotent on (name, due) so re-sending is a no-op.
 */
export async function createCitaCards(raw: string): Promise<CitaResult> {
  const { appts, problems } = parseIendiText(raw);
  const res: CitaResult = {
    parsed: appts.length, created: 0, skipped: 0, failed: 0,
    byBoard: {}, problems: [...problems], lines: [],
  };
  if (!appts.length) return res;

  const boards = await tGet<Board[]>('/members/me/boards', { fields: 'name', filter: 'open' });
  const cache = new Map<string, { list: List; red: Label | null; existing: Set<string>; name: string }>();

  for (const a of appts) {
    const key = `${a.month}-${a.year}`;
    if (!cache.has(key)) {
      const board = await boardForMonth(a.month, a.year, boards);
      if (!board) {
        res.problems.push(`no board named "Kira ${MONTH_NAME[a.month]} ${a.year}"`);
        res.failed++;
        continue;
      }
      const list = await citaList(board.id);
      if (!list) { res.problems.push(`no Cita list on ${board.name}`); res.failed++; continue; }
      const cards = await tGet<{ name: string; due: string | null }[]>(
        `/lists/${list.id}/cards`, { fields: 'name,due' });
      cache.set(key, {
        list, red: await redLabel(board.id), name: board.name,
        existing: new Set(cards.map(c => `${c.name}|${c.due || ''}`)),
      });
    }
    const ctx = cache.get(key);
    if (!ctx) continue;

    const name = cardTitle(a);
    if (ctx.existing.has(`${name}|${a.dueIso}`)) {
      res.skipped++;
      res.lines.push(`skip  ${a.dueIso.slice(0, 10)} ${a.specialty} (already there)`);
      continue;
    }
    try {
      await tSend('POST', '/cards', {
        idList: ctx.list.id, name, desc: cardDesc(a), due: a.dueIso,
        pos: 'bottom', ...(ctx.red ? { idLabels: ctx.red.id } : {}),
      });
      ctx.existing.add(`${name}|${a.dueIso}`);
      res.created++;
      res.byBoard[ctx.name] = (res.byBoard[ctx.name] || 0) + 1;
      res.lines.push(`ok    ${a.dueIso.slice(0, 10)} ${a.specialty} → ${ctx.name}`);
    } catch (e) {
      res.failed++;
      res.problems.push(`${a.dueIso.slice(0, 10)} ${a.specialty}: ${(e as Error).message.slice(0, 80)}`);
    }
  }

  // Leave every touched board's Cita list in date order.
  for (const ctx of cache.values()) {
    try { await sortCitaList(ctx.list.id); } catch { /* ordering is cosmetic; never fail the create */ }
  }
  return res;
}

/**
 * Put one Cita list in date order, earliest first, undated parked at the end.
 *
 * Only ever writes `pos`. Never touches a card's content, dates, labels or list,
 * so it is safe to run unattended against a board Elena is also editing by hand.
 */
export async function sortCitaList(listId: string): Promise<{ moved: number; total: number }> {
  const cards = await tGet<{ id: string; due: string | null; pos: number }[]>(
    `/lists/${listId}/cards`, { fields: 'due,pos' });
  const dated = cards.filter(c => c.due).sort((a, b) => (a.due || '').localeCompare(b.due || ''));
  const undated = cards.filter(c => !c.due);
  const ordered = [...dated, ...undated];
  let moved = 0;
  for (let i = 0; i < ordered.length; i++) {
    const want = (i + 1) * 65536;
    const c = ordered[i];
    if (!c || Number(c.pos) === want) continue;
    await tSend('PUT', `/cards/${c.id}`, { pos: String(want) });
    moved++;
  }
  return { moved, total: ordered.length };
}

/** Sort the Cita list on every open `Kira <Mes> <Año>` board. Used by the nightly cron. */
export async function sortAllKiraCitaLists(): Promise<string[]> {
  const boards = await tGet<Board[]>('/members/me/boards', { fields: 'name', filter: 'open' });
  const monthly = boards.filter(b => new RegExp(`kira\\s+(${MONTH_NAME.slice(1).join('|')})\\s+\\d{4}`, 'i').test(b.name));
  const out: string[] = [];
  for (const b of monthly) {
    try {
      const list = await citaList(b.id);
      if (!list) { out.push(`${b.name}: no Cita list`); continue; }
      const r = await sortCitaList(list.id);
      out.push(`${b.name}: ${r.moved} moved / ${r.total} cards`);
    } catch (e) {
      out.push(`${b.name}: FAILED ${(e as Error).message.slice(0, 70)}`);
    }
  }
  return out;
}

export function formatCitaReply(r: CitaResult): string {
  if (!r.parsed) {
    return '❌ No appointments found in that text.\n\nPaste the clinic block that starts with "Cita programada para el…" — one or many, they can all go at once.';
  }
  const head = `✅ ${r.created} card(s) created` +
    (r.skipped ? `, ${r.skipped} already there` : '') +
    (r.failed ? `, ${r.failed} failed` : '') +
    ` — from ${r.parsed} appointment(s) read.`;
  const boards = Object.entries(r.byBoard).map(([b, n]) => `• ${b}: ${n}`).join('\n');
  const probs = r.problems.length ? `\n\n⚠️ ${r.problems.slice(0, 5).join('\n⚠️ ')}` : '';
  return `${head}\n\n${boards}${probs}\n\nAll red (family), in the Cita column, sorted by date.`;
}
