/**
 * trello-voice.ts — Voice-to-Trello Card Creator
 * Part of CTO AIPA (AIPA_AITCF)
 *
 * Flow:
 *   Voice message → Groq Whisper transcription
 *   → detect trigger phrase ("add card", "create task", etc.)
 *   → Claude Haiku NLP classification
 *   → smart board/list routing
 *   → Trello card created with correct color label
 *   → Telegram confirmation
 *
 * Trigger phrases supported (EN / ES / RU):
 *   "add card", "create task", "create card", "add task", "add to trello"
 *   "agregar tarjeta", "crear tarea", "nueva tarea"
 *   "добавить карточку", "создать задачу", "добавить задачу"
 */

import Anthropic from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';
import { claudeWithGroqFallback } from './llm-resilience';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CardClassification {
  isTask: boolean;         // false = question/command/casual speech, not a Trello card
  title: string;           // Clean card title (no trigger phrase)
  description: string;     // Additional detail extracted from speech
  category: CardCategory;
  urgency: Urgency;
  boardTarget: BoardTarget;
  listTarget: ListTarget;
  /**
   * The board/column the user NAMED OUT LOUD, verbatim, when they named one.
   *
   * boardTarget is a fixed enum and literally cannot express "Kira Septiembre
   * 2026", so an explicit instruction used to be collapsed into whichever enum
   * the topic suggested: "Создай и занеси эту карточку Kira septiembre, колонка
   * Cita" about a credit-card debt filed itself on the FINANCE board, and Elena
   * then needed a second voice message to move it. These hints win over the
   * enums whenever present. Found 1 Sep 2026.
   */
  boardNameHint?: string | null;
  listNameHint?: string | null;
  labelColor: TrelloColor;
  dueDate: string | null;  // ISO date YYYY-MM-DD extracted from speech ("by Friday", "end of May") or null
  dueTime?: string | null; // 24h "HH:MM" in Panama time when a time was spoken ("3 y 30 pm" → "15:30"), else null
  subtasks: string[] | null; // 2-5 subtask titles if task naturally decomposes; null for single-step tasks
  confidence: number;      // 0-1, how certain the AI is
  reasoning: string;       // AI explanation for routing decision
}

/**
 * ELENA'S COLOR SYSTEM — life sphere based (NOT urgency based):
 *
 * 🔴 red    = FAMILY — anything related to family members, relationships
 * 🟠 orange = BUSINESS — professional work, AI projects, clients, revenue
 * 🟣 purple = MINDFULNESS / SPIRITUAL / CREATIVE — AA, meditation, Atuona poetry, NFT art
 * 🟢 green  = HEALTH — medical appointments, wellness, fitness, nutrition
 * 🟩 lime   = HOBBY — personal interests, learning for fun, travel, leisure
 *
 * Note: yellow/blue/sky/pink/black are NOT in Elena's system — never use them.
 */

type CardCategory =
  | 'family'        // → red
  | 'business'      // → orange (work, AI projects, clients, VibeJob, Aldeazz, EspaLuz, Algom)
  | 'spiritual'     // → purple (AA, mindfulness, Atuona poetry, creative projects)
  | 'health'        // → green (medical, fitness, nutrition, wellness)
  | 'hobby';        // → lime (personal interests, fun learning, travel)

type Urgency = 'urgent_today' | 'soon' | 'dated' | 'not_sure' | 'done';

type BoardTarget =
  | 'kira_current_month'   // the rolling "Kira <Mes> <Año>" boards — see rollingMonthNames()
  | 'kira_future'          // Kira Ano 2026 и дальше — long-term plans
  | 'vibejob'              // VibeJob AI Hunter — job search
  | 'aldeazz'              // Aldeazz Web3 Ecosystem — Web3/NFT/blockchain
  | 'espaluz'              // EspaLuz AI Family Tutor — tutoring business
  | 'algom'                // Algom Alpha Crypto Coach — crypto/trading
  | 'kira_habits'          // Kira Horario del dia / Habits — daily routines
  | 'kira_finance';        // Kira ФИН Дисциплина — finance/budget

/**
 * LIST NAMES — exact names used across all boards (universal structure):
 *
 * 'rules'         → "Reglas / NB"
 * 'todo_flow'     → "Надо сделать / «Поток»"
 * 'just_for_today'→ "Just for Today / «В приоритете»"
 * 'in_process_me' → "В процессе. Мяч на моей стороне."
 * 'in_process_them'→ "В процессе. Мяч на стороне Контрагента."
 * 'not_sure'      → "Not sure's / To-do or not?"
 * 'dated'         → "Датировано / «Cita»"
 * 'done'          → "Сделано!!! / Gane!!!!"
 */
export type ListTarget =
  | 'just_for_today'    // "Just for Today / «В приоритете»" — urgent, must do today
  | 'todo_flow'         // "Надо сделать / «Поток»" — backlog, to-do soon
  | 'in_process_me'     // "В процессе. Мяч на моей стороне." — I'm working on it
  | 'in_process_them'   // "В процессе. Мяч на стороне Контрагента." — waiting on others
  | 'not_sure'          // "Not sure's / To-do or not?" — maybe list
  | 'dated'             // "Датировано / «Cita»" — has a specific date/appointment
  | 'rules'             // "Reglas / NB" — recurring rules, habits reference
  | 'done';             // "Сделано!!! / Gane!!!!" — completed

type TrelloColor =
  | 'red'      // FAMILY
  | 'orange'   // BUSINESS
  | 'purple'   // MINDFULNESS / SPIRITUAL / CREATIVE
  | 'green'    // HEALTH
  | 'lime';    // HOBBY

interface TrelloBoard {
  id: string;
  name: string;
}

interface TrelloList {
  id: string;
  name: string;
}

interface TrelloLabel {
  id: string;
  color: string;
  name: string;
}

export interface TrelloCard {
  id: string;
  name: string;
  url: string;
  shortUrl: string;
  due?: string | null;
  idBoard?: string;
  idList?: string;
  closed?: boolean;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const TRELLO_API_KEY = process.env.TRELLO_API_KEY!;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN!;
const TRELLO_BASE = 'https://api.trello.com/1';

// Trigger phrases that activate voice-to-Trello (multilingual)
// Include article variants ("add a card", "create a task") — Whisper often inserts "a"
const TRIGGER_PHRASES_EN = [
  'add card', 'add a card', 'create card', 'create a card', 'new card',
  'add task', 'add a task', 'create task', 'create a task', 'new task',
  'add to trello', 'add it to trello', 'trello card', 'trello task',
  'add item', 'create item', 'add to kanban', 'add a card to',
];
const TRIGGER_PHRASES_ES = [
  'agregar tarjeta', 'agregar una tarjeta', 'crear tarjeta', 'crear una tarjeta', 'nueva tarjeta',
  'agregar tarea', 'agregar una tarea', 'crear tarea', 'crear una tarea', 'nueva tarea',
  'añadir tarea', 'añadir una tarea', 'añadir tarjeta',
  'agregar a trello', 'agregar al kanban', 'trello nueva',
];
const TRIGGER_PHRASES_RU = [
  'добавить карточку', 'создать карточку', 'новая карточка',
  'добавить задачу', 'создать задачу', 'новая задача',
  'добавить в trello', 'добавить в треллo', 'добавить в канбан',
  'создать задание', 'добавить задание',
];

const ALL_TRIGGERS = [
  ...TRIGGER_PHRASES_EN,
  ...TRIGGER_PHRASES_ES,
  ...TRIGGER_PHRASES_RU,
];

// Category → label color mapping (Elena's life-sphere system)
const CATEGORY_COLOR_MAP: Record<CardCategory, TrelloColor> = {
  family:    'red',     // 🔴 family relationships, kids, parents, home
  business:  'orange',  // 🟠 work, AI projects, clients, income
  spiritual: 'purple',  // 🟣 AA, mindfulness, Atuona, creative/NFT
  health:    'green',   // 🟢 medical, fitness, nutrition, wellness
  hobby:     'lime',    // 🟩 personal interests, fun, travel, leisure
};

// Board name substrings for fuzzy matching (case-insensitive)
// Verified against actual board names fetched from Trello API (May 2026)
const BOARD_KEYWORDS: Record<BoardTarget, string[]> = {
  // Month boards. These literals are a FLOOR only — rollingMonthNames() adds the
  // current window at runtime. Do not add months here; they go stale silently.
  kira_current_month: ['mayo 2026', 'junio 2026', 'julio 2026', 'kira mayo', 'kira junio', 'kira julio', 'june 2026', 'july 2026'],
  // "Kira Ano 2026 и дальше"
  kira_future: ['ano 2026', 'año 2026', 'дальше', 'future', 'kira ano', 'and beyond', '2026 and'],
  // "VibeJob AI Hunter"
  vibejob: ['vibejob', 'vibe job', 'job hunter', 'job hunt'],
  // "AIdeazz Web3 Ecosystem" — note: board name is AIdeazz not Aldeazz
  aldeazz: ['aideazz', 'aldeazz', 'web3', 'ecosystem', 'nft', 'blockchain'],
  // "EspaLuz AI Family Tutor"
  espaluz: ['espaluz', 'espa luz', 'tutor', 'family tutor', 'spanish tutor'],
  // "Algom Alpha Crypto Coach"
  algom: ['algom', 'crypto coach', 'alpha', 'crypto', 'trading', 'defi'],
  // "Kira Horario del dia / Habits"
  kira_habits: ['horario', 'habits', 'hábitos', 'horario del dia', 'schedule'],
  // "Kira FIN Discipline / Shopping / Expenses" — board name is Latin not Cyrillic!
  kira_finance: ['fin discipline', 'fin disci', 'shopping', 'expenses', 'фин дисц', 'финансы', 'бюджет', 'budget'],
};

/**
 * The rolling month boards, derived from today's date — never a hardcoded list.
 *
 * Earned 1 Sep 2026: `BOARD_KEYWORDS.kira_current_month` was pinned to
 * 'mayo/junio/julio 2026' and the LLM prompt stated outright that Elena "does
 * NOT have boards for all 12 months", naming those three. From September that
 * was simply false, so voice notes about September onward were routed to a June
 * board or refused. A stale literal reads exactly like a fact.
 *
 * Elena keeps ~3 rolling month boards on the free plan, so previous/current/next
 * is the right window. Returns lowercase Spanish, e.g. ['agosto 2026', ...].
 */
const ES_MONTHS = ['enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre'];

export function rollingMonthNames(now: Date = new Date()): string[] {
  const out: string[] = [];
  // CURRENT, +1, +2 -- never the previous month.
  //
  // Corrected 1 Sep 2026 after Elena described her actual flow: she is on the
  // free plan and keeps exactly three month boards, which she RECYCLES BY
  // RENAMING. When August ended she renamed "Kira Agosto" to "Kira Noviembre",
  // so her boards became Septiembre / Octubre / Noviembre. A previous/current/
  // next window names a board that no longer exists and misses the furthest one
  // she actually plans into. Verified against the live account: Septiembre,
  // Octubre, Noviembre -- no Agosto.
  for (const delta of [0, 1, 2]) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + delta, 1));
    out.push(`${ES_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`);
  }
  return out;
}

/**
 * Her REAL month boards, read from Trello. Prefer this over the computed window:
 * she renames boards by hand, so the account is the only source of truth. Falls
 * back to rollingMonthNames() if the API is unreachable, because a degraded hint
 * is better than an empty prompt.
 */
export async function actualMonthBoardNames(): Promise<string[]> {
  try {
    const boards = await getAllBoards();
    const re = new RegExp(`^kira\s+(${ES_MONTHS.join('|')})\s+\d{4}`, 'i');
    const found = boards.map(b => b.name).filter(n => re.test(n.trim()));
    return found.length ? found : rollingMonthNames().map(m => `Kira ${m.charAt(0).toUpperCase()}${m.slice(1)}`);
  } catch {
    return rollingMonthNames().map(m => `Kira ${m.charAt(0).toUpperCase()}${m.slice(1)}`);
  }
}

/** Board keywords, with the month window computed rather than frozen. */
function boardKeywordsFor(target: BoardTarget): string[] {
  const base = BOARD_KEYWORDS[target];
  if (target !== 'kira_current_month') return base;
  const rolling = rollingMonthNames();
  return Array.from(new Set([
    ...base,
    ...rolling,
    ...rolling.map(m => 'kira ' + m.split(' ')[0]),
  ]));
}

// List name substrings for fuzzy matching — verified against all 10 actual boards (May 2026)
//
// Boards with standard lists: the Kira month boards, VibeJob, Algom, Web3, EspaLuz
// Boards with variant lists:
//   - Algom / Web3 / EspaLuz: "In process. Does NOT depend on Me." → in_process_them
//   - Kira FIN Discipline: "Купить / Оплатить СРОЧНО!!!" → just_for_today; "Купить / оплатить..." → todo_flow
//   - Kira Horario del dia: day-of-week lists only (no standard mapping — fallback to lists[0])
//   - Kira Ano 2026: two "Надо сделать" lists, no in_process/rules
const LIST_KEYWORDS: Record<ListTarget, string[]> = {
  just_for_today: [
    'just for today', 'в приоритете', 'приоритете', '1st things', 'first things',
    'срочно',                            // "Купить / Оплатить СРОЧНО!!!" on FIN board
  ],
  todo_flow: [
    'надо сделать', 'поток', 'надо', 'нужно', 'todo', 'to do', 'flow',
    'купить',                            // "Купить / оплатить..." on FIN board
  ],
  in_process_me: [
    'мяч на моей', 'на моей стороне', 'depends on me', 'в процессе',
  ],
  in_process_them: [
    'мяч на стороне контрагента', 'контрагента', 'waiting on', 'depends on them',
    'does not depend', 'not depend on me', // "In process. Does NOT depend on Me." on Web3/Algom/EspaLuz
  ],
  not_sure: [
    'not sure', 'to-do or not', 'maybe', 'не уверена', 'под вопросом',
  ],
  dated: [
    'датировано', 'cita', 'dated', 'appointment', 'scheduled', 'appointed',
  ],
  rules: [
    'reglas', 'rules', 'nb', 'правила', 'nota bene', 'регулярные',  // "Покупки / Расходы регулярные" on FIN board
  ],
  done: [
    'сделано', 'gane', 'done', 'completed', 'выполнено', 'performed',
  ],
};

// ─── Trello API Helpers ───────────────────────────────────────────────────────

async function trelloGet<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${TRELLO_BASE}${endpoint}`);
  url.searchParams.set('key', TRELLO_API_KEY);
  url.searchParams.set('token', TRELLO_TOKEN);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Trello API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function trelloPost<T>(endpoint: string, body: Record<string, string>): Promise<T> {
  const url = new URL(`${TRELLO_BASE}${endpoint}`);
  url.searchParams.set('key', TRELLO_API_KEY);
  url.searchParams.set('token', TRELLO_TOKEN);

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Trello POST error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function trelloPut<T>(endpoint: string, body: Record<string, string>): Promise<T> {
  const url = new URL(`${TRELLO_BASE}${endpoint}`);
  url.searchParams.set('key', TRELLO_API_KEY);
  url.searchParams.set('token', TRELLO_TOKEN);

  const res = await fetch(url.toString(), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Trello PUT error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Move a card to a list.
 *
 * `idBoard` is REQUIRED when the destination list lives on a different board.
 * Sending idList alone makes Trello reject the call ("list is not on the same
 * board as the card"), which is every cross-board move — the common case here,
 * since Elena dictates "перенеси эту карточку в Kira Septiembre" about a card
 * that was just filed on the finance board. Found 1 Sep 2026: the failure was
 * invisible because the caller swallowed it in an empty catch.
 */
async function moveCard(cardId: string, targetListId: string, targetBoardId?: string): Promise<TrelloCard> {
  const body: Record<string, string> = { idList: targetListId };
  if (targetBoardId) body.idBoard = targetBoardId;
  return trelloPut<TrelloCard>(`/cards/${cardId}`, body);
}

async function getAllBoards(): Promise<TrelloBoard[]> {
  return trelloGet<TrelloBoard[]>('/members/me/boards', { filter: 'open', fields: 'name,id' });
}

async function getBoardLists(boardId: string): Promise<TrelloList[]> {
  return trelloGet<TrelloList[]>(`/boards/${boardId}/lists`, { filter: 'open' });
}

async function getBoardLabels(boardId: string): Promise<TrelloLabel[]> {
  return trelloGet<TrelloLabel[]>(`/boards/${boardId}/labels`);
}

// ── Due dates: her calendar is America/Panama (UTC-5, no DST) ─────────────────
// Trello stores `due` as a UTC INSTANT and shows it in the viewer's zone. A bare "2026-10-15" is
// midnight UTC = 14 Oct 19:00 in Panama, and the spoken time was never sent at all. Seen 28 Sep 2026:
// "Cita ... 15 de octubre, 3 y 30 pm" became a card showing "14 окт.".
const PANAMA_OFFSET = '-05:00';

function normTime(t?: string | null): string | null {
  const m = (t || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h <= 23 && mi <= 59 ? `${String(h).padStart(2, '0')}:${m[2]}` : null;
}

/** Today's date in Panama, not in UTC — after 19:00 Panama the UTC date is already tomorrow. */
export function panamaToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Panama' });
}

/** A Panama date (+ optional spoken time) as the UTC instant Trello expects. No time → midday, so the
 *  card can never shift to the previous or next day. */
export function toTrelloDue(date: string, time?: string | null): string {
  return new Date(`${date}T${normTime(time) ?? '12:00'}:00${PANAMA_OFFSET}`).toISOString();
}

/** "October 15, 3:30 PM" (Panama) for the Telegram reply — the day the card will SHOW in Trello. */
export function formatDueForReply(date: string, time?: string | null): string {
  const d = new Date(toTrelloDue(date, time));
  const day = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/Panama' });
  return normTime(time)
    ? `${day}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Panama' })}`
    : day;
}

async function createCard(
  listId: string,
  name: string,
  description: string,
  labelIds: string[],
  dueDate?: string | null,
  pos: 'top' | 'bottom' = 'top',
  dueTime?: string | null,
): Promise<TrelloCard> {
  const body: Record<string, string> = {
    idList: listId,
    name,
    desc: description,
    idLabels: labelIds.join(','),
    pos,
  };
  if (dueDate) body.due = /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? toTrelloDue(dueDate, dueTime) : dueDate;
  return trelloPost<TrelloCard>('/cards', body);
}

async function getListCards(listId: string): Promise<TrelloCard[]> {
  return trelloGet<TrelloCard[]>(`/lists/${listId}/cards`, { fields: 'name,id,shortUrl,due' });
}

/** Word-overlap similarity 0–1. Ignores short stop-words (≤2 chars). */
function titleSimilarity(a: string, b: string): number {
  const words = (s: string) =>
    new Set(s.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  const overlap = [...wa].filter((w) => wb.has(w)).length;
  return overlap / Math.max(wa.size, wb.size);
}

// ─── Board & List Resolution ──────────────────────────────────────────────────

function fuzzyMatch(name: string, keywords: string[]): boolean {
  const lower = name.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

function resolveBoard(boards: TrelloBoard[], target: BoardTarget, dueDate?: string | null): TrelloBoard | undefined {
  const MONTH_NAMES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];

  if (target === 'kira_current_month') {
    // If we have a specific due date, try to match that month's board first.
    // Elena keeps rolling month boards (Mayo, Junio, Julio...) — free plan limit.
    // Fall back to current month, then to any kira board.
    const candidates: string[] = [];

    if (dueDate) {
      const d = new Date(`${dueDate}T00:00:00`);
      candidates.push(`${MONTH_NAMES[d.getMonth()]}|${d.getFullYear()}`);
    }
    // Always add current month as fallback
    const now = new Date();
    candidates.push(`${MONTH_NAMES[now.getMonth()]}|${now.getFullYear()}`);

    for (const candidate of candidates) {
      const parts = candidate.split('|');
      const month = parts[0] ?? '';
      const year = parts[1] ?? '';
      const found = boards.find((b) => {
        const lower = b.name.toLowerCase();
        return lower.includes(month) && lower.includes(year) && lower.includes('kira');
      });
      if (found) return found;
    }
  }

  const keywords = boardKeywordsFor(target);
  return boards.find((b) => fuzzyMatch(b.name, keywords));
}

function resolveList(lists: TrelloList[], target: ListTarget): TrelloList | undefined {
  const keywords = LIST_KEYWORDS[target];
  return lists.find((l) => fuzzyMatch(l.name, keywords)) ?? lists[0];
}

const KNOWN_BOARD_KEYS: BoardTarget[] = [
  'kira_current_month', 'kira_future', 'kira_habits', 'kira_finance',
  'vibejob', 'aldeazz', 'espaluz', 'algom',
];
const KNOWN_LIST_KEYS: ListTarget[] = [
  'just_for_today', 'todo_flow', 'in_process_me', 'in_process_them',
  'not_sure', 'dated', 'rules', 'done',
];
const ALL_MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * Resolve the destination board for a MOVE. Handles (in order):
 *  1. a structured BoardTarget key
 *  2. a named month ("Kira Agosto [2026]") — REQUIRES the month token to match,
 *     so "Agosto" never collides with the first "Kira …" board
 *  3. BOARD_KEYWORDS match
 *  4. best word-overlap (most matching words wins — "kira agosto" beats "kira julio")
 */
function resolveMoveDestBoard(boards: TrelloBoard[], targetBoard: string): TrelloBoard | undefined {
  const tb = targetBoard.toLowerCase().trim();
  if (KNOWN_BOARD_KEYS.includes(tb as BoardTarget)) return resolveBoard(boards, tb as BoardTarget);

  const month = ALL_MONTHS.find((m) => tb.includes(m));
  if (month) {
    const yr = (tb.match(/20\d\d/) || [])[0];
    const hit = boards.find((b) => {
      const n = b.name.toLowerCase();
      return n.includes(month) && n.includes('kira') && (!yr || n.includes(yr));
    });
    if (hit) return hit;
  }

  for (const key of KNOWN_BOARD_KEYS) {
    if (boardKeywordsFor(key).some((kw) => tb.includes(kw.toLowerCase()))) {
      const d = resolveBoard(boards, key);
      if (d) return d;
    }
  }

  const hint = tb.split(/\s+/).filter((w) => w.length > 2);
  let best: TrelloBoard | undefined;
  let bestScore = 0;
  for (const b of boards) {
    const n = b.name.toLowerCase();
    const score = hint.filter((w) => n.includes(w)).length;
    if (score > bestScore) { bestScore = score; best = b; }
  }
  return bestScore > 0 ? best : undefined;
}

/**
 * Resolve the destination list for a MOVE from the column the user actually named.
 * "Cita" → "Датировано / «Cita»"; "dated"/"appointment" → dated; a ListTarget key
 * → that list. Falls back to todo_flow only when nothing was specified/matched.
 */
function resolveMoveDestList(lists: TrelloList[], targetList: string | undefined): TrelloList | undefined {
  if (!targetList || !targetList.trim()) return resolveList(lists, 'todo_flow') ?? lists[0];
  const tl = targetList.toLowerCase().trim();

  if (KNOWN_LIST_KEYS.includes(tl as ListTarget)) return resolveList(lists, tl as ListTarget);

  // Direct substring against the real list names (handles "Cita", "Поток", etc.)
  const direct = lists.find((l) => l.name.toLowerCase().includes(tl));
  if (direct) return direct;

  // Map the spoken word onto a ListTarget via LIST_KEYWORDS (both directions)
  for (const key of KNOWN_LIST_KEYS) {
    if (LIST_KEYWORDS[key].some((kw) => tl.includes(kw.toLowerCase()) || kw.toLowerCase().includes(tl))) {
      const r = resolveList(lists, key);
      if (r) return r;
    }
  }
  return resolveList(lists, 'todo_flow') ?? lists[0];
}

async function resolveOrCreateLabel(
  boardId: string,
  color: TrelloColor,
  categoryName: string,
): Promise<string | undefined> {
  const labels = await getBoardLabels(boardId);

  // Try to find existing label with this color
  const existing = labels.find((l) => l.color === color);
  if (existing) return existing.id;

  // Create new label if not found
  try {
    const newLabel = await trelloPost<TrelloLabel>('/labels', {
      name: categoryName,
      color,
      idBoard: boardId,
    });
    return newLabel.id;
  } catch (err) {
    console.error('[TrelloVoice] Could not create label:', err);
    return undefined;
  }
}

// ─── Trigger Detection ────────────────────────────────────────────────────────

export function detectTrelloTrigger(transcript: string): boolean {
  const lower = transcript.toLowerCase();
  return ALL_TRIGGERS.some((phrase) => lower.includes(phrase));
}

function removeTriggerPhrase(transcript: string): string {
  let cleaned = transcript;
  const lower = transcript.toLowerCase();

  for (const phrase of ALL_TRIGGERS) {
    const idx = lower.indexOf(phrase);
    if (idx !== -1) {
      cleaned = (cleaned.slice(0, idx) + cleaned.slice(idx + phrase.length)).trim();
      // Remove leading punctuation/conjunctions after stripping
      cleaned = cleaned.replace(/^[,:\s\-–—]+/, '').trim();
      break;
    }
  }
  return cleaned;
}

// ─── Urgency Reconciliation ───────────────────────────────────────────────────

/**
 * Post-NLP correction: align listTarget with dueDate so they never contradict.
 * - dueDate is today or tomorrow → just_for_today (urgent)
 * - dueDate is set but list isn't urgent/dated → correct to 'dated'
 * - no dueDate, listTarget is 'dated' → correct to 'todo_flow'
 */
/**
 * The label colour is DERIVED from the category, never taken from the model.
 *
 * Earned 2 Sep 2026. The schema asked the model for `category` AND `labelColor`
 * as two independent fields, with nothing forcing them to agree — so a card
 * could come back `category: business` wearing a red (family) label, and one
 * did: "Оценить возможность изготовления фирменной футболки" (branded company
 * T-shirts) was filed red.
 *
 * `CATEGORY_COLOR_MAP` had existed since May and was referenced by nothing. The
 * mapping was documented, agreed, and unenforced.
 *
 * Category is a JUDGEMENT and belongs to the model. Colour is a LOOKUP and
 * belongs to the code. Asking a model for both invites them to disagree, and
 * the disagreement is silent because both values are individually plausible.
 */
function applyCategoryColor(c: CardClassification): CardClassification {
  const derived = CATEGORY_COLOR_MAP[c.category];
  if (!derived) return c;
  if (c.labelColor !== derived) {
    console.log(`[TrelloVoice] colour corrected: ${c.labelColor} -> ${derived} (category=${c.category})`);
  }
  return { ...c, labelColor: derived };
}

function reconcileUrgency(c: CardClassification): CardClassification {
  if (!c.dueDate) {
    // If NLP said 'dated' but there's no extracted date, push to todo_flow
    if (c.listTarget === 'dated') {
      return { ...c, listTarget: 'todo_flow', urgency: 'soon' };
    }
    return c;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${c.dueDate}T00:00:00`);
  const daysAway = Math.round((due.getTime() - today.getTime()) / 86_400_000);

  if (daysAway <= 1) {
    // Due today or tomorrow → urgent
    return { ...c, listTarget: 'just_for_today', urgency: 'urgent_today' };
  }
  if (daysAway <= 7) {
    // Due this week → dated list (specific appointment/deadline)
    return { ...c, listTarget: 'dated', urgency: 'dated' };
  }
  // Due further out → dated list, urgency soon
  return { ...c, listTarget: 'dated', urgency: 'dated' };
}

// ─── Claude Haiku NLP Classification ─────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function classifyCard(rawTranscript: string): Promise<CardClassification> {
  const cleanedText = removeTriggerPhrase(rawTranscript);

  const systemPrompt = `You are a personal assistant for Elena Revicheva — AI builder, executive, and mother in Panama.
You classify voice notes into Trello card metadata using HER EXACT system.

═══ ELENA'S BOARDS (exact real names) ═══
IMPORTANT — month board rule: Elena is on a FREE Trello plan, so she keeps only ~3 rolling month boards
at a time (right now: ${rollingMonthNames().map(m => `"Kira ${m.charAt(0).toUpperCase() + m.slice(1)}"`).join(', ')}).
She does NOT have boards for all 12 months. Use boardTarget "kira_current_month" for ANY personal task within the next 3 months —
the routing code will find the correct month board automatically. Use "kira_future" ONLY for tasks
that are 4+ months away or have no specific month at all.

- ${rollingMonthNames().map(m => `"Kira ${m.charAt(0).toUpperCase() + m.slice(1)}"`).join(' / ')} — rolling month boards (→ kira_current_month)
- "Kira Ano 2026 и дальше" — tasks 4+ months away, no specific month, or multi-year goals (→ kira_future)
- "Kira Horario del dia / Habits" — daily schedule, recurring routines, day-of-week habits
- "Kira FIN Discipline / Shopping / Expenses" — finance, budget, purchases, payments, expenses (use kira_finance)
- "VibeJob AI Hunter" — job search, applications, LinkedIn outreach, interviews, recruiters
- "AIdeazz Web3 Ecosystem" — Web3, NFTs, blockchain, Atuona poetry, AI film, creative projects (use aldeazz)
- "EspaLuz AI Family Tutor" — Spanish tutoring business, EspaLuz app, students, revenue, WhatsApp bot
- "Algom Alpha Crypto Coach" — crypto signals, trading, DeFi, Algom Alpha agent, market analysis

═══ ELENA'S LIST STRUCTURE (same across all boards) ═══
- "just_for_today"   = "Just for Today / «В приоритете»" → urgent, do today
- "todo_flow"        = "Надо сделать / «Поток»" → backlog, do soon
- "in_process_me"    = "В процессе. Мяч на моей стороне." → I am actively working on this
- "in_process_them"  = "В процессе. Мяч на стороне Контрагента." → waiting on someone else
- "not_sure"         = "Not sure's / To-do or not?" → maybe, undecided
- "dated"            = "Датировано / «Cita»" → has a specific date or appointment
- "rules"            = "Reglas / NB" → recurring rule, habit, standing reminder
- "done"             = "Сделано!!! / Gane!!!!" → already completed

═══ ELENA'S COLOR SYSTEM (life sphere, NOT urgency) ═══
🔴 red    = FAMILY — family members (Kira=daughter, Alisa, husband), home, relationships
🟠 orange = BUSINESS — work, AI projects, clients, VibeJob, Aldeazz, EspaLuz, Algom, revenue, tech
🟣 purple = MINDFULNESS/SPIRITUAL/CREATIVE — AA, meditation, Atuona poetry, NFT art, soul work
🟢 green  = HEALTH — doctors, medical appointments, fitness, nutrition, wellness, vaccinations
🟩 lime   = HOBBY — personal interests, fun learning, travel, leisure, non-work projects

NEVER use yellow, blue, sky, pink, or black — Elena does not use these colors.

List routing logic:
- Has a specific date/time → "dated"
- Waiting on another person → "in_process_them"  
- Currently doing it yourself → "in_process_me"
- Urgent/today → "just_for_today"
- Normal to-do → "todo_flow"
- Unsure if needed → "not_sure"
- Standing rule/habit → "rules"`;

  const today = panamaToday(); // YYYY-MM-DD in Panama — toISOString() was UTC, a day ahead after 19:00

  const userPrompt = `Classify this voice note:
"${cleanedText}"

Today's date: ${today} (Panama timezone, America/Panama).

First decide: is this an actionable to-do item that belongs on a Kanban board?
- isTask: true  → it describes something that needs to be done (task, errand, appointment, goal, reminder, project step)
- isTask: false → it's a question TO the bot, a command ("show my tasks"), casual chat, or a statement with no action

For dueDate: extract any date mentioned in the text.
- "by end of May" → "${today.slice(0, 4)}-05-31"
- "by end of June" → "${today.slice(0, 4)}-06-30"
- "by Friday" → the upcoming Friday's date
- "tomorrow" → the day after today
- "next week" → 7 days from today
- "by Monday" → the upcoming Monday's date
- No date mentioned → null
Return date as YYYY-MM-DD string, or null.

For dueTime: if a clock time is spoken ("3:30 pm", "3 y 30 pm", "a las tres y media", "15:30", "в 15:30"),
return it as 24-hour "HH:MM" in Panama time ("3 y 30 pm" → "15:30"). No time spoken → null.
If a time is repeated with stumbles ("3 y 30 pm, 3, 3, 3 pm"), use the most complete one — the one with
minutes ("15:30"). Only an explicit correction ("no, a las 4", "actually 4 pm") replaces it.

For subtasks: does this voice note describe a MULTI-STEP task with 2-5 clearly distinct actions?
- YES → list each as a short imperative title in "subtasks" (e.g. ["Design slides", "Set up demo env", "Send invites"])
- NO → "subtasks": null
Only decompose when steps are explicitly enumerated OR naturally distinct (not just one task rephrased). Atomic tasks like "call the doctor" or "buy groceries" → null.

Return JSON exactly like this (no markdown, no backticks, raw JSON only):
{
  "isTask": true,
  "title": "Parent task title (used when subtasks is null)",
  "description": "Any extra detail from the speech, or empty string",
  "category": "family|business|spiritual|health|hobby",
  // category rule: anything belonging to HER COMPANY -- brand, products, clients,
  // income, marketing, merchandise -- is "business" even when the object sounds
  // domestic. Branded T-shirts, business cards, office furniture and company
  // phone plans are business, not family. "family" means her household and the
  // people in it. (labelColor below is IGNORED and re-derived from category.)
  "urgency": "urgent_today|soon|dated|not_sure|done",
  "boardTarget": "kira_current_month|kira_future|vibejob|aldeazz|espaluz|algom|kira_habits|kira_finance",
  "listTarget": "just_for_today|todo_flow|in_process_me|in_process_them|not_sure|dated|rules|done",
  "boardNameHint": "EXACT board the user named out loud (e.g. \"Kira Septiembre\"), else null",
  "listNameHint": "EXACT column the user named out loud (e.g. \"Cita\", \"Датировано\", \"Надо сделать\"), else null",
  "labelColor": "red|orange|purple|green|lime",
  "dueDate": "2026-05-31",
  "dueTime": "15:30",
  "subtasks": null,
  "confidence": 0.90,
  "reasoning": "One sentence: why this board + list + color"
}

If isTask is false, still return the full JSON but the other fields can be empty/default.`;

  // Five-provider chain, not the old Anthropic->Groq pair. Anthropic has been at a
  // zero balance since 17 Aug, so every classification was landing on one
  // remaining provider and, when its reply did not parse, silently degrading to
  // the fallback below -- which routes to kira_current_month/todo_flow and drops
  // every hint the user spoke. That is why "занеси в Kira Octubre, колонка Cita"
  // filed itself somewhere else with confidence 0.3. Found 1 Sep 2026.
  const { completeWithProfileDetailed } = await import('./llm-resilience');
  let text = '';
  try {
    const r = await completeWithProfileDetailed('classify', systemPrompt, userPrompt, 900, 'trello-voice/classify');
    text = r.text;
    console.log(`[TrelloVoice] classify via ${r.provider}`);
  } catch (e) {
    console.error('[TrelloVoice] classify chain FAILED:', (e as Error).message?.slice(0, 160));
  }

  try {
    // Take the outermost JSON object rather than trusting the whole reply: some
    // providers wrap it in prose or a fenced block, and a strict parse turns a
    // perfectly good classification into a silent fallback.
    const cleaned = text.replace(/```json|```/g, '').trim();
    const block = cleaned.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(block ? block[0] : cleaned) as CardClassification;
    return applyCategoryColor(reconcileUrgency(parsed));
  } catch {
    // Fallback classification if parsing fails
    console.error('[TrelloVoice] classify parse failed, using fallback. Raw:', text.slice(0, 400));
    return {
      isTask: true,
      title: cleanedText.slice(0, 60),
      description: '',
      category: 'hobby',
      urgency: 'soon',
      boardTarget: 'kira_current_month',
      listTarget: 'todo_flow',
      labelColor: 'lime',
      dueDate: null,
      subtasks: null,
      confidence: 0.3,
      reasoning: 'Fallback classification — parsing failed',
    };
  }
}

// ─── Voice Transcription ──────────────────────────────────────────────────────

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function downloadTelegramVoice(fileId: string, botToken: string): Promise<Buffer> {
  // Step 1: get file path from Telegram
  const fileInfoRes = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`,
  );
  const fileInfo = (await fileInfoRes.json()) as { ok: boolean; result: { file_path: string } };
  if (!fileInfo.ok) throw new Error('Could not get file info from Telegram');

  const filePath = fileInfo.result.file_path;
  const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

  // Step 2: download the OGG audio
  const audioRes = await fetch(fileUrl);
  if (!audioRes.ok) throw new Error(`Failed to download audio: ${audioRes.status}`);
  const arrayBuffer = await audioRes.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Repair the names Whisper reliably mishears.
 *
 * The vocabulary prompt is a SOFT bias -- it makes the right spelling more
 * likely, never certain. "CTO AIPA" still came back as "STO APA" and was filed
 * as a Trello card under that name. These are hard corrections applied after
 * transcription, so a known mishearing cannot reach a card title.
 *
 * Only add a pair here after actually SEEING the left side in a transcript.
 * Guessing at mishearings invents false corrections, which are worse than the
 * original error because they look deliberate.
 */
const HEARD_AS: [RegExp, string][] = [
  [/\bS[T7]O\s+AP+A\b/gi, "CTO AIPA"],
  [/\bC\.?T\.?O\.?\s+A\.?I\.?P\.?A\.?\b/gi, "CTO AIPA"],
  [/\bC[MN]O\s+AP+A\b/gi, "CMO AIPA"],
  [/\b(?:ideas|idears|aideas)\b/gi, "AIdeazz"],
  [/\bespa\s*luz\b/gi, "EspaLuz"],
  [/\bvibe\s*job\b/gi, "VibeJob"],
  [/\ba\s*tuona\b/gi, "Atuona"],
  [/\balg[oa]m\b/gi, "Algom"],
  [/\bAlic[ea]\b/g, "Alisa"],
];

function repairNames(text: string): string {
  let out = text;
  for (const [re, to] of HEARD_AS) out = out.replace(re, to);
  return out;
}

async function transcribeVoice(audioBuffer: Buffer, fileId: string): Promise<string> {
  // Save to temp file (Groq SDK needs a file path or File object)
  const tmpPath = path.join('/tmp', `voice_${fileId}.ogg`);
  fs.writeFileSync(tmpPath, audioBuffer);

  try {
    // No language lock — Elena speaks EN, ES and RU mixed.
    // Prompt seeds Whisper with vocabulary to prevent common substitutions
    // ("desk" → "card", "me" → "May", etc.)
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(tmpPath),
      model: 'whisper-large-v3',
      response_format: 'text',
      prompt: [
        'January, February, March, April, May, June, July, August, September, October, November, December.',
        // Her own product and place names. Whisper transcribes what it EXPECTS to
        // hear, so anything absent here comes back mangled: "CTO AIPA" arrived as
        // "STO APA" and was filed as a Trello card under that name (2 Sep 2026).
        'CTO AIPA, CMO AIPA, AIdeazz, AIdeazz Lab, EspaLuz, VibeJob Hunter, Atlas Shifted,',
        'Algom Alpha, Atuona, AILA, Whitespace, Trello, HubSpot, GitHub, Telegram, WhatsApp.',
        'Elena Revicheva, Alisa, Kira.',
        'Panama, Balboa, Clayton, Llano Bonito, Parkside, MEDUCA, ENSA, IDAAN, Banco General,',
        'Poco a Poco, Tigo, Mas Movil, Panapass, Neurodesarrollo, Terapia Ocupacional.',
        'Move card, create card, add card, archive card, move this card, add task, new task.',
        'Trello card. Kira board. ' + rollingMonthNames().map(m => 'Kira ' + m.split(' ')[0]).join('. ') + '.',
      ].join(' '),
    });
    const raw = typeof transcription === 'string' ? transcription : (transcription as { text: string }).text;
    const fixed = repairNames(raw);
    if (fixed !== raw) console.log('[TrelloVoice] name repair applied');
    return fixed;
  } finally {
    // Clean up temp file
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────

export interface VoiceTrelloResult {
  success: boolean;
  transcript?: string;
  classification?: CardClassification;
  card?: TrelloCard;          // single card (when no subtasks)
  cards?: TrelloCard[];       // multiple cards (when subtasks were decomposed)
  boardName?: string;
  listName?: string;
  error?: string;
  noTrigger?: boolean;        // true = voice had no trigger phrase (handleVoiceToTrello path)
  notATask?: boolean;         // true = NLP decided this is not a Trello task — fall through
  duplicate?: boolean;        // true = a similar card already exists on the target list
  existingCard?: TrelloCard;  // the card that was found as a duplicate
}

/**
 * Main entry point — called from telegram-bot.ts voice handler
 *
 * Usage in telegram-bot.ts:
 *   import { handleVoiceToTrello, detectTrelloTrigger } from './trello-voice';
 *
 *   bot.on('message:voice', async (ctx) => {
 *     const fileId = ctx.message.voice.file_id;
 *     const result = await handleVoiceToTrello(fileId, process.env.BOT_TOKEN!);
 *     if (result.noTrigger) {
 *       // Fall through to existing voice handler
 *       return existingVoiceHandler(ctx);
 *     }
 *     await ctx.reply(formatVoiceTrelloReply(result));
 *   });
 */
export async function handleVoiceToTrello(
  fileId: string,
  botToken: string,
): Promise<VoiceTrelloResult> {
  // Step 1: Download + transcribe
  let transcript: string;
  try {
    const audioBuffer = await downloadTelegramVoice(fileId, botToken);
    transcript = await transcribeVoice(audioBuffer, fileId);
    console.log(`[TrelloVoice] Transcript: "${transcript}"`);
  } catch (err) {
    return { success: false, error: `Transcription failed: ${String(err)}` };
  }

  // Step 2: Check for trigger phrase
  if (!detectTrelloTrigger(transcript)) {
    return { success: false, noTrigger: true, transcript };
  }

  // Step 3: NLP classification via Claude Haiku
  let classification: CardClassification;
  try {
    classification = await classifyCard(transcript);
    console.log(`[TrelloVoice] Classification:`, classification);
  } catch (err) {
    return { success: false, transcript, error: `Classification failed: ${String(err)}` };
  }

  // Step 4: Resolve boards
  let boards: TrelloBoard[];
  try {
    boards = await getAllBoards();
  } catch (err) {
    return { success: false, transcript, classification, error: `Trello board fetch failed: ${String(err)}` };
  }

  // A board she NAMED wins over the topic-derived enum. If she said where it
  // goes, she is not guessing and neither should we.
  const spokenBoard = classification.boardNameHint?.trim()
    ? resolveMoveDestBoard(boards, classification.boardNameHint.trim())
    : undefined;
  if (spokenBoard) console.log(`[TrelloVoice] board from spoken name "${classification.boardNameHint}" -> ${spokenBoard.name}`);
  const targetBoard = spokenBoard ?? resolveBoard(boards, classification.boardTarget, classification.dueDate);
  if (!targetBoard) {
    // Fallback: use Kira current month board
    const fallbackBoard = boards.find((b) => b.name.toLowerCase().includes('kira'));
    if (!fallbackBoard) {
      return { success: false, transcript, classification, error: 'No suitable Trello board found' };
    }
    console.warn(`[TrelloVoice] Board ${classification.boardTarget} not found, using fallback: ${fallbackBoard.name}`);
  }

  const board = targetBoard ?? boards.find((b) => b.name.toLowerCase().includes('kira'))!;

  // Step 5: Resolve list
  let lists: TrelloList[];
  try {
    lists = await getBoardLists(board.id);
  } catch (err) {
    return { success: false, transcript, classification, error: `Trello list fetch failed: ${String(err)}` };
  }

  const spokenList = classification.listNameHint?.trim()
    ? resolveMoveDestList(lists, classification.listNameHint.trim())
    : undefined;
  if (spokenList) console.log(`[TrelloVoice] list from spoken name "${classification.listNameHint}" -> ${spokenList.name}`);
  const targetList = spokenList ?? resolveList(lists, classification.listTarget);
  if (!targetList) {
    return { success: false, transcript, classification, error: 'No suitable list found on board' };
  }

  // Step 6: Resolve label color
  const labelColor = classification.labelColor;
  const labelId = await resolveOrCreateLabel(board.id, labelColor, classification.category);

  // Step 7: Create the card
  let card: TrelloCard;
  try {
    card = await createCard(
      targetList.id,
      classification.title,
      classification.description || `Voice note: ${new Date().toLocaleString('en-US', { timeZone: 'America/Panama' })}`,
      labelId ? [labelId] : [],
      classification.dueDate, 'top', classification.dueTime,
    );
  } catch (err) {
    return { success: false, transcript, classification, error: `Card creation failed: ${String(err)}` };
  }

  console.log(`[TrelloVoice] ✅ Card created: "${card.name}" → ${board.name} / ${targetList.name}`);

  return {
    success: true,
    transcript,
    classification,
    card,
    boardName: board.name,
    listName: targetList.name,
  };
}

/**
 * Lightweight entry point for callers that already have a transcript.
 * Used by telegram-bot.ts to avoid double-transcription — the existing
 * voice handler already calls Groq Whisper, so we skip that step here.
 */
export async function createTrelloCardFromTranscript(
  transcript: string,
): Promise<VoiceTrelloResult> {
  // Step 1: NLP classification via Claude Haiku
  let classification: CardClassification;
  try {
    classification = await classifyCard(transcript);
    console.log(`[TrelloVoice] Classification:`, classification);
  } catch (err) {
    return { success: false, transcript, error: `Classification failed: ${String(err)}` };
  }

  // If NLP says this is not an actionable task, signal caller to fall through
  if (!classification.isTask) {
    console.log(`[TrelloVoice] Not a task — falling through to regular handler`);
    return { success: false, notATask: true, transcript, classification };
  }

  // Step 2: Resolve boards
  let boards: TrelloBoard[];
  try {
    boards = await getAllBoards();
  } catch (err) {
    return { success: false, transcript, classification, error: `Trello board fetch failed: ${String(err)}` };
  }

  // A board she NAMED wins over the topic-derived enum. If she said where it
  // goes, she is not guessing and neither should we.
  const spokenBoard = classification.boardNameHint?.trim()
    ? resolveMoveDestBoard(boards, classification.boardNameHint.trim())
    : undefined;
  if (spokenBoard) console.log(`[TrelloVoice] board from spoken name "${classification.boardNameHint}" -> ${spokenBoard.name}`);
  const targetBoard = spokenBoard ?? resolveBoard(boards, classification.boardTarget, classification.dueDate);
  if (!targetBoard) {
    const fallbackBoard = boards.find((b) => b.name.toLowerCase().includes('kira'));
    if (!fallbackBoard) {
      return { success: false, transcript, classification, error: 'No suitable Trello board found' };
    }
    console.warn(`[TrelloVoice] Board ${classification.boardTarget} not found, using fallback: ${fallbackBoard.name}`);
  }

  const board = targetBoard ?? boards.find((b) => b.name.toLowerCase().includes('kira'))!;

  // Step 3: Resolve list
  let lists: TrelloList[];
  try {
    lists = await getBoardLists(board.id);
  } catch (err) {
    return { success: false, transcript, classification, error: `Trello list fetch failed: ${String(err)}` };
  }

  const spokenList = classification.listNameHint?.trim()
    ? resolveMoveDestList(lists, classification.listNameHint.trim())
    : undefined;
  if (spokenList) console.log(`[TrelloVoice] list from spoken name "${classification.listNameHint}" -> ${spokenList.name}`);
  const targetList = spokenList ?? resolveList(lists, classification.listTarget);
  if (!targetList) {
    return { success: false, transcript, classification, error: 'No suitable list found on board' };
  }

  // Step 4: Duplicate detection — check existing cards on this list
  try {
    const existingCards = await getListCards(targetList.id);
    const dup = existingCards.find((c) => titleSimilarity(c.name, classification.title) >= 0.5);
    if (dup) {
      console.log(`[TrelloVoice] Duplicate detected: "${dup.name}" ~ "${classification.title}"`);
      return {
        success: false,
        duplicate: true,
        existingCard: dup,
        transcript,
        classification,
        boardName: board.name,
        listName: targetList.name,
      };
    }
  } catch (err) {
    // Non-fatal — if we can't check, proceed with creation
    console.warn('[TrelloVoice] Duplicate check failed (proceeding):', err);
  }

  // Step 5: Resolve label color
  const labelId = await resolveOrCreateLabel(board.id, classification.labelColor, classification.category);

  const descBase = classification.description || `Voice note: ${new Date().toLocaleString('en-US', { timeZone: 'America/Panama' })}`;
  const labels = labelId ? [labelId] : [];

  // Step 6: Create card(s) — subtask decomposition or single card
  const subtasks = Array.isArray(classification.subtasks) && classification.subtasks.length >= 2
    ? classification.subtasks
    : null;

  if (subtasks) {
    // Create one card per subtask — same board/list/label/due date
    const createdCards: TrelloCard[] = [];
    for (const subtaskTitle of subtasks) {
      try {
        const c = await createCard(targetList.id, subtaskTitle, descBase, labels, classification.dueDate, 'bottom', classification.dueTime);
        createdCards.push(c);
        console.log(`[TrelloVoice] ✅ Subtask card: "${c.name}"`);
      } catch (err) {
        console.error(`[TrelloVoice] Subtask card failed for "${subtaskTitle}":`, err);
      }
    }
    if (createdCards.length === 0) {
      return { success: false, transcript, classification, error: 'All subtask card creations failed' };
    }
    return {
      success: true,
      transcript,
      classification,
      cards: createdCards,
      boardName: board.name,
      listName: targetList.name,
    };
  }

  // Single card
  let card: TrelloCard;
  try {
    card = await createCard(targetList.id, classification.title, descBase, labels, classification.dueDate, 'top', classification.dueTime);
  } catch (err) {
    return { success: false, transcript, classification, error: `Card creation failed: ${String(err)}` };
  }

  console.log(`[TrelloVoice] ✅ Card created: "${card.name}" → ${board.name} / ${targetList.name}${classification.dueDate ? ` (due: ${classification.dueDate})` : ''}`);

  return {
    success: true,
    transcript,
    classification,
    card,
    boardName: board.name,
    listName: targetList.name,
  };
}

// ─── Telegram Reply Formatter ─────────────────────────────────────────────────

const COLOR_EMOJI: Record<TrelloColor, string> = {
  red:    '🔴', // FAMILY
  orange: '🟠', // BUSINESS
  purple: '🟣', // MINDFULNESS / SPIRITUAL / CREATIVE
  green:  '🟢', // HEALTH
  lime:   '🟩', // HOBBY
};

const COLOR_LABEL: Record<TrelloColor, string> = {
  red:    'Family',
  orange: 'Business',
  purple: 'Mindfulness / Creative',
  green:  'Health',
  lime:   'Hobby',
};

const URGENCY_LABEL: Record<Urgency, string> = {
  urgent_today: '🚨 Today',
  soon:         '⏰ Soon',
  dated:        '📅 Dated',
  not_sure:     '💭 Not sure',
  done:         '✅ Done',
};

export function formatVoiceTrelloReply(result: VoiceTrelloResult): string {
  // Duplicate found — don't create, inform user
  if (result.duplicate && result.existingCard && result.classification) {
    return [
      `⚠️ *Card already exists*`,
      ``,
      `A similar card is already on *${result.listName}*:`,
      `📌 "${result.existingCard.name}"`,
      `🔗 [Open existing card](${result.existingCard.shortUrl})`,
      ``,
      `_Skipped creating: "${result.classification.title}"_`,
    ].join('\n');
  }

  if (!result.success || !result.classification) {
    if (result.error) {
      return `❌ Could not create Trello card\n\n${result.error}`;
    }
    return '❌ Something went wrong creating the card.';
  }

  const { classification, boardName, listName } = result;
  const colorEmoji = COLOR_EMOJI[classification.labelColor] ?? '⬜';
  const colorSphere = COLOR_LABEL[classification.labelColor] ?? classification.category;

  // Format due date for display (YYYY-MM-DD → "May 31")
  let dueLine = '';
  if (classification.dueDate) {
    try {
      dueLine = `📅 Due: ${formatDueForReply(classification.dueDate, classification.dueTime)}`;
    } catch {
      dueLine = `📅 Due: ${classification.dueDate}`;
    }
  }

  // Multiple cards (subtask decomposition)
  if (result.cards && result.cards.length > 0) {
    const cardLines = result.cards.map((c, i) => `${i + 1}. [${c.name}](${c.shortUrl})`);
    return [
      `✅ *${result.cards.length} Trello cards created!*`,
      ``,
      `${colorEmoji} *${classification.title || 'Subtasks'}*`,
      ``,
      `📋 Board: ${boardName}`,
      `📌 List: ${listName}`,
      `🎨 Sphere: ${colorSphere}`,
      dueLine,
      ``,
      ...cardLines,
      ``,
      `_"${result.transcript?.slice(0, 80)}${(result.transcript?.length ?? 0) > 80 ? '...' : ''}"_`,
    ].filter(Boolean).join('\n');
  }

  // Single card
  const card = result.card;
  if (!card) return '❌ Something went wrong creating the card.';

  return [
    `✅ *Trello card created!*`,
    ``,
    `${colorEmoji} *${classification.title}*`,
    ``,
    `📋 Board: ${boardName}`,
    `📌 List: ${listName}`,
    `🎨 Sphere: ${colorSphere}`,
    dueLine,
    classification.description ? `📝 Note: ${classification.description}` : '',
    ``,
    `🔗 [Open card](${card.shortUrl})`,
    ``,
    `_"${result.transcript?.slice(0, 80)}${(result.transcript?.length ?? 0) > 80 ? '...' : ''}"_`,
  ]
    .filter(Boolean)
    .join('\n');
}

// ─── Integration Snippet ──────────────────────────────────────────────────────

/**
 * PASTE THIS INTO telegram-bot.ts voice handler:
 *
 * import { handleVoiceToTrello, formatVoiceTrelloReply } from './trello-voice';
 *
 * // Inside your existing bot.on('message:voice', ...) handler,
 * // BEFORE your existing voice logic:
 *
 * const voiceFileId = ctx.message.voice.file_id;
 * const trelloResult = await handleVoiceToTrello(voiceFileId, process.env.BOT_TOKEN!);
 *
 * if (!trelloResult.noTrigger) {
 *   // Voice had a trigger phrase — reply with card result and stop
 *   await ctx.reply(formatVoiceTrelloReply(trelloResult), { parse_mode: 'Markdown' });
 *   return;
 * }
 *
 * // No trigger phrase detected — fall through to existing voice handling
 * // ... your existing code continues here ...
 */

// ─── Multi-Action: Create / Move / Archive ───────────────────────────────────
//
// Triggered when the transcript contains management vocabulary.
// Claude Haiku classifies the full message into an array of typed actions,
// then each action is executed independently.  A single voice message can
// combine creation, relocation and archiving across any boards.

/**
 * Keyword pre-check — fires the multi-action LLM path for management commands.
 * Broad on purpose: better to call Haiku unnecessarily than to silently create
 * a new card when the user wanted to MOVE an existing one.
 *
 * EN:  move, relocate, transfer, put it to, send it to, take it to, archive
 * ES:  mueve, muévelo, mover, trasladar, pasar, poner, enviar, archivar
 * RU:  перенеси, переместить, перемести, перенести, передвинь, положи,
 *      заархивируй, убери, скрой, отправь
 */
/**
 * Does this transcript ask to MANAGE existing cards (move/archive) rather than
 * create one?
 *
 * WARNING: do NOT put \b back. JavaScript's \b is defined on ASCII word
 * characters, so a Cyrillic letter is not a word character and \bперемести\b can
 * never match ANY string. Every Russian move/archive command was silently falling
 * through to "create a card" — including "Заархивируй те карточки", which is the
 * example printed in the bot's own help text. Found 1 Sep 2026.
 *
 * Unicode lookarounds instead, with the u flag. Stems take \p{L}* so "archive",
 * "archived", "заархивируй" and "перемести" all match, while the leading
 * lookbehind still stops "remove" matching "move".
 */
// 2026-09-28: correction vocabulary added — "Appointment should be changed to 15th of October" never
// reached the action classifier, so it became a NEW card instead of an edit to the one just made.
const MGMT_RE = /(?<![\p{L}\p{N}])(move|moving|relocat\p{L}*|transfer\p{L}*|archiv\p{L}*|mueve|muévelo|mover|trasladar|pasar|перенес\p{L}*|переме\p{L}*|передвин\p{L}*|положи|заархивир\p{L}*|архивир\p{L}*|убери|скрой|отправь|change|changed|changing|reschedul\p{L}*|postpon\p{L}*|updat\p{L}*|correct\p{L}*|cambi\p{L}*|reprogram\p{L}*|posterg\p{L}*|измен\p{L}*|поменя\p{L}*|исправ\p{L}*|edit\p{L}*|clarif\p{L}*|редакт\p{L}*|отредакт\p{L}*|уточн\p{L}*|подправ\p{L}*|описани\p{L}*|modific\p{L}*|aclar\p{L}*)(?![\p{L}\p{N}])/iu;

/** True when a transcript must go to the action classifier (move / archive / update) first. */
export function isManagementCommand(transcript: string): boolean {
  return MGMT_RE.test(transcript);
}

export interface MultiActionItem {
  type: 'create' | 'move' | 'archive' | 'update';
  detail?: string | undefined;          // update: what changed, e.g. "📅 October 15, 3:30 PM"
  success: boolean;
  description?: string | undefined;
  cardQuery?: string | undefined;
  cards?: TrelloCard[] | undefined;
  boardName?: string | undefined;
  listName?: string | undefined;
  movedCount?: number | undefined;
  archivedCount?: number | undefined;
  error?: string | undefined;
}

interface _RawAction {
  type: 'create' | 'move' | 'archive' | 'update';
  newDueDate?: string | null;   // update: YYYY-MM-DD (Panama)
  newDueTime?: string | null;   // update: "HH:MM" 24h (Panama)
  newTitle?: string | null;     // update: only when she renames the card
  newDescription?: string | null; // update: the corrected description, in her words (replaces the old one)
  description?: string;
  cardQuery?: string;
  sourceBoardHint?: string;
  targetBoard?: string;
  targetList?: string;   // the column/list the user named for a move (e.g. "Cita", "dated", "just_for_today")
}

/** Search Trello cards by text, optionally restricted to a board. */
export async function searchTrelloCards(query: string, boardHint?: string): Promise<TrelloCard[]> {
  const data = await trelloGet<{ cards?: TrelloCard[] }>('/search', {
    query,
    modelTypes: 'cards',
    card_fields: 'name,id,shortUrl,idList,idBoard,due,closed',
    cards_limit: '15',
  });
  const cards = data?.cards ?? [];
  if (!boardHint || cards.length === 0) return cards;

  const boards = await getAllBoards();
  const hintWords = boardHint.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  // "Kira Octubre": "kira" alone matches EVERY Kira board, so boards matching ALL the words win (28 Sep 2026).
  const all = boards.filter(b => hintWords.every(w => b.name.toLowerCase().includes(w)));
  const any = boards.filter(b => hintWords.some(w => b.name.toLowerCase().includes(w)));
  const matchIds = new Set((all.length ? all : any).map(b => b.id));
  const filtered = matchIds.size > 0 ? cards.filter(c => matchIds.has(c.idBoard ?? '')) : cards;
  return filtered.length > 0 ? filtered : cards; // fall back to unfiltered if hint yielded nothing
}

/**
 * Decompose the transcript into typed actions.
 *
 * WARNING: this goes through the 5-provider chain, NOT a direct Anthropic call.
 * It used to POST api.anthropic.com with claude-haiku directly. Anthropic has
 * been at a zero balance since 17 Aug, so it returned [] for every message and
 * the caller fell through to "create a card" — which is why "Archive this card"
 * produced a card named "Archive this card". Completely silent: exactly the
 * failure a five-provider chain exists to prevent, bypassed by a hand-rolled
 * fetch that no chain could see. Found 1 Sep 2026.
 */
export async function classifyMultiAction(transcript: string): Promise<_RawAction[]> {
  const prompt = `You manage Trello boards for Elena Revicheva (AI entrepreneur, Panama).

Analyze this voice message and extract ALL Trello card management actions.
Return ONLY a JSON array — no explanation, no markdown.

Action schema:
[
  {"type":"create","description":"full task description to create as a new card"},
  {"type":"move","cardQuery":"search term to find cards","sourceBoardHint":"board name or null","targetBoard":"BOARD_KEY or exact board name","targetList":"the column the user named, or null"},
  {"type":"archive","cardQuery":"search term to find cards","sourceBoardHint":"board name or null"},
  {"type":"update","cardQuery":"search term or __recent__","sourceBoardHint":"board name or null","newDueDate":"YYYY-MM-DD or null","newDueTime":"HH:MM 24h or null","newTitle":"new card name or null","newDescription":"corrected description or null"}
]

UPDATE also covers the DESCRIPTION ("edit this task", "make it clear that…", "отредактируй задачу", "это описание…",
"уточни, что…", "aclara que…"): put the corrected text in newDescription, in her own words and language — it REPLACES
the old description. Write the STATEMENT itself, not her instruction to you: drop "making it clear that", "edit it so",
"уточни, что", "aclara que" ("make it clear the appointment is not for Kira but for my stepfather Marshall" →
"The appointment is for my stepfather Marshall, not for Kira."). When she names the card ("задача в Kira octubre, Cita, доктор Фернандо Агилар"), cardQuery is the
card's distinctive words written the way the card most likely spells them — a person's name spoken in Cyrillic goes in
Latin letters ("Fernando Aguilar") — and sourceBoardHint is the board she named ("Kira Octubre"). Never emit a
"create" for a message that edits a card, and never create a card that DESCRIBES an edit.

UPDATE — changing an EXISTING card's date, time or name (NOT moving it to another board or column):
- "should be changed to 15th of October, 3.30 pm", "reschedule to Friday", "the appointment is at 4, not 3",
  "cambia la cita al 15 a las 3 y media", "перенеси на 15 октября в 15:30" → "update".
- A DATE or TIME after "move"/"change"/"перенеси" is an update. A BOARD or COLUMN after "move" is a move.
- Right after a card was created, a correction about "the appointment", "it", "the card", "the date" refers to
  that card: set cardQuery to "__recent__".
- newDueDate as YYYY-MM-DD (today in Panama is ${panamaToday()}; a month without a year is the next such date).
  newDueTime as 24-hour "HH:MM" in Panama time ("3.30 pm" → "15:30"); null if no time was said.
- Do NOT also emit a "create" for the same correction.

targetBoard rules:
  Prefer one of these exact keys when it fits:
  "kira_current_month"  — Elena's personal Kira board for the CURRENT month
  "kira_future"         — Kira Ano 2026 и дальше — long-term plans
  "kira_habits"         — Kira Horario del dia / Habits
  "kira_finance"        — Kira FIN Discipline / Shopping / Expenses
  "vibejob"             — VibeJob AI Hunter (job search)
  "aldeazz"             — AIdeazz Web3 Ecosystem
  "espaluz"             — EspaLuz AI Family Tutor
  "algom"               — Algom Alpha Crypto Coach
  BUT when the user names a SPECIFIC MONTH board (e.g. "Kira Agosto", "Kira Septiembre",
  "move to August board"), output targetBoard as the EXACT board name string
  "Kira <Month> 2026" (Spanish month, capitalized; append 2026 if no year said) — do NOT
  collapse a named month into "kira_current_month".

targetList rules (the COLUMN — capture it, it matters):
  Set targetList to what the user said. Map obvious synonyms to these keys when clear:
  "just_for_today" (priority/today/приоритет) · "todo_flow" (backlog/поток/надо) ·
  "in_process_me" (I'm working on it/мяч на моей) · "in_process_them" (waiting on them/контрагента) ·
  "not_sure" · "dated"  ← use this for "Cita", "Датировано", "appointment", "scheduled" ·
  "rules" (NB/reglas) · "done" (gane/сделано).
  If the user says a literal column name that isn't an obvious synonym (e.g. "Cita"), pass that
  raw word as targetList — the code fuzzy-matches it to the real column. null only if no column named.

CRITICAL — "to me" / "me" / "my board" / "my personal board" / "Kira" / "to myself" rules:
- When the user says "move to me", "move to my board", "put it on my board", "to myself", "to Kira" — this ALWAYS means Elena's personal Kira board → use targetBoard: "kira_current_month"
- NEVER output a person's name (e.g. "Elena Revicheva") as targetBoard — that is always wrong
- If you genuinely cannot determine the destination board, use "kira_current_month" as default

Rules:
- Return [] if no Trello card management is requested (e.g. "transfer the hospital card to another clinic" is NOT a Trello action)
- "move" / "archive" when the user refers to EXISTING cards by name, topic, or vague pronoun ("those", "them", "those cards", "this card", "it")
- "create" for new tasks
- One message can contain multiple actions of different types
- For vague pronouns ("those", "them", "this", "it", "this one"), set cardQuery to "__recent__"
- Note: Whisper may mishear "card" as "desk" or "task" — treat "this desk/task/item" as referring to a card

Message: "${transcript}"`;

  try {
    const { completeWithProfileDetailed } = await import('./llm-resilience');
    const { text, provider } = await completeWithProfileDetailed(
      'classify', null, prompt, 700, 'trello-multiaction',
    );
    const cleaned = text.trim().replace(/```json\n?|\n?```/g, '');
    const arr = cleaned.match(/\[[\s\S]*\]/);
    const actions = JSON.parse(arr ? arr[0] : cleaned) as _RawAction[];
    console.log(`[TrelloVoice] multi-action via ${provider}: ${Array.isArray(actions) ? actions.length : 0} action(s)`);
    return Array.isArray(actions) ? actions : [];
  } catch (e) {
    // Loud, never silent: falling through to CREATE is a real behaviour change
    // and the operator must be able to see it in the log.
    console.error('[TrelloVoice] multi-action classify FAILED — falling through to CREATE:', (e as Error).message?.slice(0, 180));
    return [];
  }
}

/**
 * Main entry point for voice management commands.
 * Returns `{ handled: false }` when the transcript is not a management command
 * so the caller can fall through to normal task creation.
 */
export async function processMultiAction(
  transcript: string,
  recentCards: TrelloCard[] = [],
): Promise<{ handled: boolean; results: MultiActionItem[] }> {
  if (!MGMT_RE.test(transcript)) return { handled: false, results: [] };

  const rawActions = await classifyMultiAction(transcript);
  if (!rawActions.length) return { handled: false, results: [] };

  const results: MultiActionItem[] = [];

  for (const action of rawActions) {
    // ── CREATE ──────────────────────────────────────────────────────────────
    if (action.type === 'create' && action.description) {
      const r = await createTrelloCardFromTranscript(action.description);
      results.push({
        type: 'create',
        success: r.success,
        description: r.classification?.title || action.description,
        cards: r.cards ?? (r.card ? [r.card] : []),
        boardName: r.boardName,
        listName: r.listName,
        error: r.error,
      });
      continue;
    }

    // ── MOVE ────────────────────────────────────────────────────────────────
    if (action.type === 'move' && action.cardQuery && action.targetBoard) {
      try {
        const cards = action.cardQuery === '__recent__'
          ? recentCards
          : await searchTrelloCards(action.cardQuery, action.sourceBoardHint ?? undefined);

        if (cards.length === 0) {
          results.push({ type: 'move', success: false, cardQuery: action.cardQuery,
            error: `No cards found matching "${action.cardQuery}"` });
          continue;
        }

        const boards = await getAllBoards();

        // Resolve destination board — structured key, named month, keywords, or best word-overlap
        const dest = resolveMoveDestBoard(boards, action.targetBoard);
        if (!dest) {
          results.push({ type: 'move', success: false, cardQuery: action.cardQuery,
            error: `Board not found: "${action.targetBoard}"` });
          continue;
        }

        const lists = await getBoardLists(dest.id);
        // Honor the COLUMN the user named ("Cita" → Датировано/Cita); todo_flow only as last resort
        const destList = resolveMoveDestList(lists, action.targetList);
        if (!destList) {
          results.push({ type: 'move', success: false, error: `No lists on "${dest.name}"` });
          continue;
        }

        let moved = 0;
        const moveErrors: string[] = [];
        for (const c of cards) {
          try {
            await moveCard(c.id, destList.id, dest.id);
            moved++;
          } catch (e) {
            // Never swallow: a move that fails for every card used to report
            // `undefined`, which is indistinguishable from a bug in our own code.
            moveErrors.push(e instanceof Error ? e.message.slice(0, 120) : String(e));
          }
        }

        results.push({
          type: 'move', success: moved > 0, cardQuery: action.cardQuery,
          cards: cards.slice(0, moved), boardName: dest.name, listName: destList.name, movedCount: moved,
          ...(moved === 0 ? { error: moveErrors[0] || 'Trello refused the move and gave no reason' } : {}),
        });
      } catch (err: unknown) {
        results.push({ type: 'move', success: false,
          error: err instanceof Error ? err.message : String(err) });
      }
      continue;
    }

    // ── UPDATE (28 Sep 2026) ────────────────────────────────────────────────
    // A correction edits EXACTLY ONE card: the one just created (__recent__) or the single search hit.
    // Two or more candidates → ask, never guess — this is her daughter's medical calendar.
    if (action.type === 'update' && action.cardQuery) {
      try {
        const found = action.cardQuery === '__recent__'
          ? recentCards
          : await searchTrelloCards(action.cardQuery, action.sourceBoardHint ?? undefined);
        // Never edit an archived card: an archived duplicate is exactly what a correction must not revive.
        const cards = found.filter(c => !c.closed);
        if (cards.length !== 1) {
          results.push({ type: 'update', success: false, cardQuery: action.cardQuery,
            error: cards.length === 0
              ? `No card found for "${action.cardQuery}"`
              : `${cards.length} cards match — say which one: ${cards.slice(0, 4).map(c => `"${c.name}"`).join(', ')}` });
          continue;
        }
        const card = cards[0]!;
        // __recent__ comes from the bot's own memory, which does not know if she archived the card since.
        const live = await trelloGet<TrelloCard>(`/cards/${card.id}`, { fields: 'closed,due,name' });
        if (live.closed) {
          results.push({ type: 'update', success: false, cardQuery: action.cardQuery,
            error: `"${card.name}" is archived — say the name of the card to edit` });
          continue;
        }
        const body: Record<string, string> = {};
        let when = '';
        const newDate = action.newDueDate && /^\d{4}-\d{2}-\d{2}$/.test(action.newDueDate) ? action.newDueDate : null;
        // Only a time was said ("make it 4 pm"): keep the card's own Panama date.
        const baseDate = newDate ?? (card.due ? panamaToday(new Date(card.due)) : null);
        if (baseDate && (newDate || action.newDueTime)) {
          body.due = toTrelloDue(baseDate, action.newDueTime);
          when = formatDueForReply(baseDate, action.newDueTime);
        }
        if (action.newTitle && action.newTitle.trim()) body.name = action.newTitle.trim();
        if (action.newDescription && action.newDescription.trim()) body.desc = action.newDescription.trim();
        if (!Object.keys(body).length) {
          results.push({ type: 'update', success: false, cardQuery: action.cardQuery,
            error: 'No new date, time, name or description was understood — nothing changed' });
          continue;
        }
        await trelloPut<TrelloCard>(`/cards/${card.id}`, body);
        const back = await trelloGet<TrelloCard>(`/cards/${card.id}`, { fields: 'name,id,shortUrl,due' });
        const ok = !body.due || (back.due ? new Date(back.due).toISOString() === body.due : false);
        results.push({ type: 'update', success: ok, cardQuery: action.cardQuery, cards: [back],
          detail: [when && `📅 ${when}`, body.name && `✏️ "${body.name}"`,
            body.desc && `📝 "${body.desc.slice(0, 120)}"`].filter(Boolean).join(' · '),
          ...(ok ? {} : { error: `Trello saved a different date (${back.due ?? 'none'})` }) });
      } catch (err: unknown) {
        results.push({ type: 'update', success: false, error: err instanceof Error ? err.message : String(err) });
      }
      continue;
    }

    // ── ARCHIVE ─────────────────────────────────────────────────────────────
    if (action.type === 'archive' && action.cardQuery) {
      try {
        const cards = action.cardQuery === '__recent__'
          ? recentCards
          : await searchTrelloCards(action.cardQuery, action.sourceBoardHint ?? undefined);

        if (cards.length === 0) {
          results.push({ type: 'archive', success: false, cardQuery: action.cardQuery,
            error: `No cards found matching "${action.cardQuery}"` });
          continue;
        }

        let archived = 0;
        const archErrors: string[] = [];
        for (const c of cards) {
          try {
            await trelloPut<TrelloCard>(`/cards/${c.id}`, { closed: 'true' });
            archived++;
          } catch (e) {
            archErrors.push(e instanceof Error ? e.message.slice(0, 120) : String(e));
          }
        }

        results.push({
          type: 'archive', success: archived > 0, cardQuery: action.cardQuery,
          cards: cards.slice(0, archived), archivedCount: archived,
          ...(archived === 0 ? { error: archErrors[0] || 'Trello refused the archive and gave no reason' } : {}),
        });
      } catch (err: unknown) {
        results.push({ type: 'archive', success: false,
          error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  return { handled: results.length > 0, results };
}

export function formatMultiActionReply(results: MultiActionItem[]): string {
  if (results.length === 0) return '❌ No actions were executed.';

  const lines: string[] = [];
  const anyFail = results.some(r => !r.success);

  for (const r of results) {
    if (r.type === 'create') {
      if (r.success) {
        const n = r.cards?.length || 1;
        lines.push(`✅ *${n} card${n > 1 ? 's' : ''} created* on *${r.boardName}* (${r.listName})`);
        r.cards?.forEach(c => lines.push(`  • [${c.name}](${c.shortUrl})`));
      } else {
        lines.push(`❌ Create failed: ${r.error}`);
      }
    } else if (r.type === 'move') {
      if (r.success) {
        const n = r.movedCount ?? 0;
        lines.push(`🔀 *${n} card${n > 1 ? 's' : ''} moved* → *${r.boardName}* (${r.listName})`);
        r.cards?.forEach(c => lines.push(`  • [${c.name}](${c.shortUrl})`));
      } else {
        lines.push(`❌ Move failed${r.cardQuery ? ` ("${r.cardQuery}")` : ''}: ${r.error}`);
      }
    } else if (r.type === 'update') {
      if (r.success) {
        r.cards?.forEach(c => lines.push(`✏️ *Card updated:* [${c.name}](${c.shortUrl})`));
        if (r.detail) lines.push(`  ${r.detail}`);
      } else {
        lines.push(`❌ Update failed${r.cardQuery && r.cardQuery !== '__recent__' ? ` ("${r.cardQuery}")` : ''}: ${r.error}`);
      }
    } else if (r.type === 'archive') {
      if (r.success) {
        const n = r.archivedCount ?? 0;
        lines.push(`🗑️ *${n} card${n > 1 ? 's' : ''} archived*`);
        r.cards?.forEach(c => lines.push(`  • ${c.name}`));
      } else {
        lines.push(`❌ Archive failed${r.cardQuery ? ` ("${r.cardQuery}")` : ''}: ${r.error}`);
      }
    }
  }

  const header = anyFail ? '⚠️ *Partial success*' : '✅ *Done!*';
  return [header, '', ...lines].filter(l => l !== undefined).join('\n');
}
