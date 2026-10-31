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
  // 28 Oct 2026: one YYYY-MM-DD per subtask (same order) when the steps happen on DIFFERENT dates
  // ("cycle 1 from 28 Oct, next from 28 Nov…"). Before this every card got dueDate — the first date.
  subtaskDueDates?: (string | null)[] | null;
  confidence: number;      // 0-1, how certain the AI is
  reasoning: string;       // AI explanation for routing decision
  titleGuessed?: boolean;  // set by guardTitle: she said where/when but no subject (12 Oct 2026, "CETA")
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
  desc?: string;
  idLabels?: string[];
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

// 28 Oct 2026: a series of cards from one voice note ("medication cycle 1 from 28 Oct, cycle 2 from 28 Nov…") all got
// the FIRST date, because each subtask card was created with the note's single dueDate. Each card now gets its own:
// 1) the model's subtaskDueDates[i], 2) else the first "Nov 28" / "28 nov" written in the card's own title,
// 3) else the note's dueDate. Layer 2 is deterministic, so a model that forgets layer 1 still cannot repeat the bug.
const TITLE_MONTH: [RegExp, number][] = [
  [/^(jan|ene)/, 1], [/^feb/, 2], [/^mar/, 3], [/^(apr|abr)/, 4], [/^may/, 5], [/^jun/, 6], [/^jul/, 7],
  [/^(aug|ago)/, 8], [/^(sep|set)/, 9], [/^oct/, 10], [/^nov/, 11], [/^(dec|dic)/, 12],
];
const MONTH_WORD = '(jan|ene|feb|mar|apr|abr|may|jun|jul|aug|ago|sep|set|oct|nov|dec|dic)[a-zé]*\\.?';

/** The first month-day date written in a title ("cycle 2 (Nov 28 - Dec 7)" → Nov 28), as YYYY-MM-DD on or after `from`. */
export function dateFromTitle(title: string, from: string): string | null {
  const t = title.toLowerCase();
  const m = t.match(new RegExp(`\\b${MONTH_WORD}\\s+(\\d{1,2})\\b`)) ?? t.match(new RegExp(`\\b(\\d{1,2})\\s+(?:de\\s+)?${MONTH_WORD}`));
  if (!m) return null;
  const [mon, day] = /^\d/.test(m[1]!) ? [m[2]!, Number(m[1])] : [m[1]!, Number(m[2])];
  const month = TITLE_MONTH.find(([re]) => re.test(mon))?.[1];
  if (!month || day < 1 || day > 31) return null;
  let year = Number(from.slice(0, 4));
  const iso = (y: number) => `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (iso(year) < from) year += 1;  // "Jan 6" in a series that starts in October is next year
  return iso(year);
}

/** The due date for subtask card i — see the three layers above. */
export function subtaskDue(c: Pick<CardClassification, 'dueDate' | 'subtaskDueDates'>, i: number, title: string): string | null {
  const own = Array.isArray(c.subtaskDueDates) ? c.subtaskDueDates[i] : null;
  if (own && /^\d{4}-\d{2}-\d{2}$/.test(own)) return own;
  return dateFromTitle(title, c.dueDate ?? panamaToday()) ?? c.dueDate ?? null;
}

// ─── Learning from her corrections (28 Oct 2026, Elena: "each agent learning and evolving on the go") ─────────────
// No new machinery: VJH's pattern (her decisions → few-shot lessons in the prompt, judge_feedback_sync) + OpenClaw's
// (repeated mistakes → a rule she approves before it applies). Two doors capture a correction: the `update` action
// below (she corrects by voice/text) and a nightly read-only sweep (she fixed the card by hand in Trello). The files
// live in data/ (gitignored, Oracle only), so her family detail never reaches the public repo.
// Only date, title and colour are learned: moving a card between lists or boards is her workflow, not a correction.
const LEARN_DIR = process.env.TRELLO_LEARN_DIR || path.join(__dirname, '..', 'data');  // tests point it at a temp dir
const CREATED_PATH = path.join(LEARN_DIR, 'trello-created.json');   // what the bot set on each card it made
const CORR_PATH = path.join(LEARN_DIR, 'trello-corrections.json');  // what she changed it to
const RULES_PATH = path.join(LEARN_DIR, 'trello-rules.json');       // rules she approved or rejected

export interface CardSnapshot { id: string; name: string; due: string | null; colour: string | null; heard: string; ts: string }
export interface Correction {
  ts: string; cardId: string; field: 'date' | 'title' | 'colour'; bot: string; her: string; heard: string;
  door: 'voice' | 'trello'; ruled?: string;
  card?: string;  // the card's title when the bot made it — it often carries the pattern ("cycle 2 (Nov 28 - Dec 7)")
}
export interface LearnedRule { id: string; text: string; field: string; status: 'proposed' | 'approved' | 'rejected'; examples: number; ts: string }
type LiveCard = { name?: string; due?: string | null; colour?: string | null };

function readJson<T>(p: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) as T; } catch { return fallback; }
}
function writeJson(p: string, v: unknown): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p + '.tmp', JSON.stringify(v, null, 1));
  fs.renameSync(p + '.tmp', p);  // atomic: the classifier never reads a half-written file
}

/** A due as she sees it in Trello: "2026-11-28 12:00" in Panama. */
export function dueKey(due: string | null | undefined): string {
  if (!due) return '';
  const d = new Date(due);
  return `${panamaToday(d)} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Panama' })}`;
}

/** What she changed on a card the bot made: date, title, colour. A field the live card does not report is unchanged. */
export function diffSnapshot(s: CardSnapshot, live: LiveCard): { field: Correction['field']; bot: string; her: string }[] {
  const out: { field: Correction['field']; bot: string; her: string }[] = [];
  if (live.due !== undefined && dueKey(live.due) !== dueKey(s.due)) out.push({ field: 'date', bot: dueKey(s.due) || 'none', her: dueKey(live.due) || 'none' });
  if (live.name !== undefined && live.name.trim() !== s.name.trim()) out.push({ field: 'title', bot: s.name, her: live.name });
  if (live.colour !== undefined && (live.colour ?? '') !== (s.colour ?? '')) out.push({ field: 'colour', bot: s.colour || 'none', her: live.colour || 'none' });
  return out;
}

/** Remember what the bot set on the cards it just made (the "bot" side of every later correction). */
export function rememberCreated(cards: TrelloCard[], heard: string, colour: string | null): void {
  try {
    const all = readJson<CardSnapshot[]>(CREATED_PATH, []);
    const ts = new Date().toISOString();
    for (const c of cards) all.push({ id: c.id, name: c.name, due: c.due ?? null, colour, heard: heard.slice(0, 240), ts });
    writeJson(CREATED_PATH, all.slice(-400));
  } catch (e) { console.warn('[TrelloVoice/learn] remember failed:', (e as Error).message); }
}

/** Log her changes to a card the bot made, then move the snapshot forward so the same change is never counted twice. */
export function recordCorrections(cardId: string, live: LiveCard, door: Correction['door']): number {
  try {
    const snaps = readJson<CardSnapshot[]>(CREATED_PATH, []);
    const s = snaps.find((x) => x.id === cardId);
    if (!s) return 0;  // not a card the bot made: nothing of the bot's to learn from
    const diffs = diffSnapshot(s, live);
    if (!diffs.length) return 0;
    const corr = readJson<Correction[]>(CORR_PATH, []);
    const ts = new Date().toISOString();
    for (const d of diffs) corr.push({ ts, cardId, ...d, heard: s.heard, door, card: s.name });
    writeJson(CORR_PATH, corr.slice(-500));
    if (live.name !== undefined) s.name = live.name;
    if (live.due !== undefined) s.due = live.due ?? null;
    if (live.colour !== undefined) s.colour = live.colour ?? null;
    writeJson(CREATED_PATH, snaps);
    console.log(`[TrelloVoice/learn] ${diffs.length} correction(s) via ${door}: ${diffs.map((d) => d.field).join(', ')}`);
    return diffs.length;
  } catch (e) { console.warn('[TrelloVoice/learn] record failed:', (e as Error).message); return 0; }
}

/** Nightly, read-only: cards the bot made in the last 21 days that she changed by hand in Trello. */
export async function sweepManualEdits(): Promise<number> {
  const since = Date.now() - 21 * 86_400_000;
  const sphere = new Set<string>(Object.values(CATEGORY_COLOR_MAP));
  let n = 0;
  for (const s of readJson<CardSnapshot[]>(CREATED_PATH, []).filter((x) => Date.parse(x.ts) >= since)) {
    try {
      const c = await trelloGet<{ name: string; due: string | null; closed: boolean; labels?: { color: string }[] }>(
        `/cards/${s.id}`, { fields: 'name,due,closed,labels' });
      if (c.closed) continue;  // archiving is not a correction
      const colour = (c.labels ?? []).map((l) => l.color).find((x) => sphere.has(x)) ?? null;
      n += recordCorrections(s.id, { name: c.name, due: c.due, colour }, 'trello');
    } catch { /* deleted card or a network blip: skip, the next night tries again */ }
  }
  return n;
}

/** The lessons the classifier reads: her approved rules, then her latest corrections (VJH's few-shot pattern). */
export function learnedBlock(corrections: Correction[], rules: LearnedRule[]): string {
  const approved = rules.filter((r) => r.status === 'approved').map((r) => `- ${r.text}`);
  const recent = corrections.slice(-12).map((c) =>
    `- ${c.card ? `card "${c.card.slice(0, 80)}", ` : ''}heard "${c.heard.slice(0, 200)}" → you set ${c.field} "${c.bot}" → she changed it to "${c.her}"`);
  if (!approved.length && !recent.length) return '';
  return `\n═══ LEARNED FROM ELENA'S OWN CORRECTIONS (follow these) ═══\n`
    + (approved.length ? `Rules she approved:\n${approved.join('\n')}\n` : '')
    + (recent.length ? `Her latest corrections to cards you made (avoid repeating these mistakes):\n${recent.join('\n')}\n` : '');
}
function learnedBlockFromDisk(): string {
  return learnedBlock(readJson<Correction[]>(CORR_PATH, []), readJson<LearnedRule[]>(RULES_PATH, []));
}

/** Weekly (OpenClaw's pattern): 2+ unruled corrections of one kind → ONE proposed rule. Nothing applies until she approves. */
export async function proposeRules(): Promise<LearnedRule[]> {
  const corr = readJson<Correction[]>(CORR_PATH, []);
  const rules = readJson<LearnedRule[]>(RULES_PATH, []);
  const { completeWithProfileDetailed } = await import('./llm-resilience');
  const proposed: LearnedRule[] = [];
  for (const field of ['date', 'title', 'colour'] as const) {
    const group = corr.filter((c) => c.field === field && !c.ruled);
    if (group.length < 2) continue;
    // Whole heard text + the card's title (28 Oct 2026): cut at 140 chars, "…the next mon" made the model invent a rule
    // about audio cut off mid-word instead of the real pattern visible in the titles.
    const examples = group.slice(-8).map((c) => `${c.card ? `card "${c.card}": ` : ''}heard "${c.heard}" → assistant set "${c.bot}" → she changed it to "${c.her}"`).join('\n');
    try {
      const r = await completeWithProfileDetailed('classify', null,
        `A voice assistant turns Elena's voice notes into Trello cards. She corrected the card ${field} like this:\n${examples}\n\n`
        + `Write ONE short general instruction (max 30 words) that would have got these right. Describe the pattern, not `
        + `these cards: no people's names, no medicines or diagnoses. If there is no common pattern, answer exactly NONE.`,
        120, 'trello-voice/rule');
      const text = r.text.trim().replace(/^["'-\s]+|["'\s]+$/g, '');
      const id = `R${Date.now().toString(36)}${field[0]}`;
      for (const c of group) c.ruled = id;  // used either way: a NONE or a rejected rule is never re-proposed from them
      if (!text || /^none\b/i.test(text)) continue;
      const rule: LearnedRule = { id, text: text.slice(0, 240), field, status: 'proposed', examples: group.length, ts: new Date().toISOString() };
      rules.push(rule);
      proposed.push(rule);
    } catch (e) { console.warn(`[TrelloVoice/learn] rule for ${field} failed:`, (e as Error).message); }
  }
  writeJson(CORR_PATH, corr);
  writeJson(RULES_PATH, rules);
  return proposed;
}

/** Her answer to a proposed rule. Only an approved rule reaches the classifier. */
export function decideRule(id: string, approve: boolean): LearnedRule | null {
  const rules = readJson<LearnedRule[]>(RULES_PATH, []);
  const r = rules.find((x) => x.id === id);
  if (!r || r.status !== 'proposed') return r ?? null;
  r.status = approve ? 'approved' : 'rejected';
  writeJson(RULES_PATH, rules);
  return r;
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

/**
 * Resolve the destination board for a MOVE. Handles (in order):
 *  1. a structured BoardTarget key
 *  2. a named month ("Kira Agosto [2026]") — REQUIRES the month token to match,
 *     so "Agosto" never collides with the first "Kira …" board
 *  3. BOARD_KEYWORDS match
 *  4. best word-overlap (most matching words wins — "kira agosto" beats "kira julio")
 */
/**
 * The Spanish month a spoken board name refers to, however it was transcribed.
 *
 * She SAYS the Spanish name, but Whisper writes what it hears in whichever
 * alphabet the rest of the sentence is in. "Поставь задачу в Kira октубре"
 * produced the hint "Kira октубре": no Spanish month matched, the word-overlap
 * fallback scored every board on "kira" alone, and the first one -- the FINANCE
 * board -- won. The classifier had even reasoned "October 2026". Found 6 Oct 2026.
 * Covers Spanish heard in Cyrillic, Russian month names, and English.
 */
const MONTH_STEMS: [RegExp, string][] = [
  [/enero|энер|январ|janu/, 'enero'],
  [/febrer|феврер|фебрер|феврал|febru/, 'febrero'],
  [/marzo|марсо|марзо|март|march/, 'marzo'],
  [/abril|абрил|апрел|april/, 'abril'],
  [/mayo|майо|мая|(?:^|\s)май(?:\s|$)|\bmay\b/, 'mayo'],
  [/junio|хунио|июн|\bjune\b/, 'junio'],
  [/julio|хулио|июл|\bjuly\b/, 'julio'],
  [/agosto|агост|август|august/, 'agosto'],
  [/septiembre|setiembre|сеп?т[ьи]?[еэ]мбр|сентябр|septem/, 'septiembre'],
  [/octubre|октубр|октябр|octob/, 'octubre'],
  [/noviembre|новиембр|новембр|ноябр|novem/, 'noviembre'],
  [/diciembre|дисиембр|дисьембр|декабр|decem/, 'diciembre'],
];

export function spokenMonth(text: string): string | undefined {
  const t = text.toLowerCase();
  return MONTH_STEMS.find(([re]) => re.test(t))?.[1];
}

// Every one of her boards starts with "Kira", so the word carries no signal.
// Scoring on it is what sent an October task to "Kira ФИН Дисциплина".
const UNINFORMATIVE_BOARD_WORDS = new Set(['kira', 'кира', 'board', 'доска', 'tablero']);

export function resolveMoveDestBoard(boards: TrelloBoard[], targetBoard: string): TrelloBoard | undefined {
  const tb = targetBoard.toLowerCase().trim();
  if (KNOWN_BOARD_KEYS.includes(tb as BoardTarget)) return resolveBoard(boards, tb as BoardTarget);

  const month = spokenMonth(tb);
  if (month) {
    const yr = (tb.match(/20\d\d/) || [])[0];
    const hit = boards.find((b) => {
      const n = b.name.toLowerCase();
      return n.includes(month) && n.includes('kira') && (!yr || n.includes(yr));
    });
    // She named a month. Its board or nothing -- never "some other Kira board".
    // undefined lets the caller fall back to the classifier's enum routing.
    return hit;
  }

  for (const key of KNOWN_BOARD_KEYS) {
    if (boardKeywordsFor(key).some((kw) => tb.includes(kw.toLowerCase()))) {
      const d = resolveBoard(boards, key);
      if (d) return d;
    }
  }

  const hint = tb.split(/\s+/).filter((w) => w.length > 2 && !UNINFORMATIVE_BOARD_WORDS.has(w));
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
/** Edit distance ≤ 1 — Whisper hears "CETA" for "Cita". */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

const PLACE_WORDS = ['task', 'tarea', 'задача', 'задачу', 'card', 'tarjeta', 'карточка', 'карточку', 'kira', 'cita', 'датировано'];

/**
 * A title that only repeats WHERE/WHEN she filed it is no title (12 Oct 2026): "Создай задачу на 16 октября на
 * 10 утра в Kira octubre, датировано CETA" became a card named "CETA" — the column name, misheard. The title
 * slot is required, so the model filled it with the only word left. When nothing but board/column words remain,
 * name the card "<column> <date>" and say so in the reply, so she can rename it in one sentence.
 */
export function guardTitle(c: CardClassification): CardClassification {
  const split = (s: string) => String(s || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const place = [...split(`${c.boardNameHint ?? ''} ${c.listNameHint ?? ''}`).filter((w) => w.length >= 3), ...PLACE_WORDS];
  const words = split(c.title).filter((w) => w.length >= 2);
  const onlyPlace = words.every((w) => place.some((p) => w === p || (w.length >= 4 && p.length >= 4 && withinOneEdit(w, p))));
  if (!onlyPlace) return c;
  const hint = (c.listNameHint || '').trim();
  // The dated column is "Cita" — say it right even when it was misheard ("CETA").
  const where = !hint || c.listTarget === 'dated' || withinOneEdit(hint.toLowerCase(), 'cita') ? 'Cita' : hint;
  const when = c.dueDate ? formatDueForReply(c.dueDate, c.dueTime) : '';
  return { ...c, title: [where, when].filter(Boolean).join(' '), titleGuessed: true };
}

/** Markdown-safe echo: a URL inside *…* or _…_ (underscores!) makes Telegram reject the whole reply. */
function stripUrls(s: string): string {
  return String(s || '').replace(URL_RE, '🔗');
}

/**
 * The first 80 characters of her message for the reply — counted by code point, so an emoji is never cut in half.
 * A lone surrogate makes Telegram reject the reply ("strings must be encoded in UTF-8") after the card was made.
 */
export function echo80(s: string | undefined): string {
  const chars = Array.from(stripUrls(s ?? ''));
  return chars.slice(0, 80).join('') + (chars.length > 80 ? '...' : '');
}

function applyCategoryColor(c: CardClassification): CardClassification {
  const derived = CATEGORY_COLOR_MAP[c.category];
  if (!derived) return c;
  if (c.labelColor !== derived) {
    console.log(`[TrelloVoice] colour corrected: ${c.labelColor} -> ${derived} (category=${c.category})`);
  }
  return { ...c, labelColor: derived };
}

// Words that can carry a date in her three languages (and Whisper's Latin spelling of Russian).
const DATE_SIGNAL_RE = new RegExp([
  '\\d',
  // months — the board name ("Kira Noviembre") is cut out before this test
  'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre',
  'january|february|march|april|june|july|august|september|october|november|december',
  'январ|феврал|март|апрел|ма[яйе]\\b|июн|июл|август|сентябр|октябр|ноябр|декабр',
  // weekdays
  'lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo',
  'monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend',
  'понедельник|вторник|сред[уае]|четверг|пятниц|суббот|воскресень|выходн',
  // relative days
  'today|tomorrow|tonight|next week|next month|end of|deadline',
  '\\bhoy\\b|ma[ñn]ana|pasado ma|semana|pr[oó]xim|fin de',
  'сегодня|завтра|послезавтра|недел|месяц|до конца|к концу',
  'sevodn|segodn|zavtra|nedel|mesjac|mesyac',
  // spoken numbers and ordinals
  '\\b(?:pervo|vtoro|tretje|chetvert|pjato|pyato|shesto|sedmo|vosmo|devjato|desjato|dvadcat|tridcat)',
  'первого|второго|третьего|четв[её]ртого|пятого|шестого|седьмого|восьмого|девятого|десятого|надцатого|двадцат|тридцат',
  '\\b(?:uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|treinta|primero)\\b',
  '\\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|twent\\w*|thirt\\w*)\\b',
].join('|'), 'iu');

/**
 * A due date the model INVENTED is dropped before it can move the card (31 Oct 2026).
 * "Поставь задачу, Kira Noviembre, надо сделать: сходить с дочкой в парк Метрополитано" — no date spoken —
 * came back due 28 November, and reconcileUrgency then filed it in "Датировано / Cita" BECAUSE of that date.
 * The prompt's own examples are full of "28th of October / 28th of November" and the month board's name is a
 * month, so the model filled a required-looking slot. A date is kept only when the words she said can carry one;
 * the board name ("Kira Noviembre") is cut out first, because naming the board is not naming a day.
 */
export function groundDueDate(c: CardClassification, spoken: string): CardClassification {
  if (!c.dueDate && !c.subtaskDueDates?.length) return c;
  const said = String(spoken || '').toLowerCase().replace(/(?:kira|кира)\s+\S+/giu, ' ');
  if (DATE_SIGNAL_RE.test(said)) return c;
  console.log(`[TrelloVoice] due date ${c.dueDate} dropped: no date in what she said`);
  return { ...c, dueDate: null, dueTime: null, subtaskDueDates: null };
}

/**
 * The column she NAMED wins, even when Whisper spelled it in Latin letters (31 Oct 2026).
 * She said "Надо сделать"; the transcript read "N'ada zdjela'c'", the model returned no listNameHint, and the card
 * went to Cita. Apostrophes and "j" softeners are stripped, then both alphabets are matched.
 */
export function spokenColumn(text: string): string | null {
  const t = String(text || '').toLowerCase().replace(/['’ʼ`]/g, '').replace(/(?<=[a-z])j(?=[aeiou])/g, '');
  if (/надо\s*с?делать|\bn[ao]d[ao]\s*[sz]?d[ei]la|поток|\bpotok\b/u.test(t)) return 'Надо сделать';
  if (/в\s*приоритете|\bv\s*prioritete\b|just for today/u.test(t)) return 'В приоритете';
  return null;
}

export function groundListHint(c: CardClassification, spoken: string): CardClassification {
  if (c.listNameHint?.trim()) return c;
  const col = spokenColumn(spoken);
  if (!col) return c;
  console.log(`[TrelloVoice] column "${col}" heard in her words — model missed it`);
  return { ...c, listNameHint: col };
}

function reconcileUrgency(c: CardClassification): CardClassification {
  if (!c.dueDate) {
    // If NLP said 'dated' but there's no extracted date, push to todo_flow
    if (c.listTarget === 'dated') {
      return { ...c, listTarget: 'todo_flow', urgency: 'soon' };
    }
    return c;
  }

  // Panama's date, not the server's: Oracle runs on UTC, so after 19:00 Panama "today" was already tomorrow and a
  // card for the day after landed in "just for today" (20 Oct 2026: the Oracle webinar on the 22nd, asked for Cita).
  const today = new Date(`${panamaToday()}T00:00:00`);
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
🔴 red    = FAMILY — her household: her daughter Alisa, husband, parents/stepfather, home, relationships
🟠 orange = BUSINESS — work, AI projects, clients, VibeJob, Aldeazz, EspaLuz, Algom, revenue, tech — and every
            work meeting: intro calls and networking (e.g. arranged by Boardy), recruiters, interviews, client calls
"Kira …" (Kira Octubre, Kira Ano 2026, Kira Horario …) is the NAME of her boards — never a person and never a
sphere signal. Her daughter is Alisa. A message that only says "Kira Octubre, Cita" carries no sphere at all.
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
${learnedBlockFromDisk()}
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

For subtaskDueDates: when the subtasks happen on DIFFERENT dates (a repeating cycle, a series of appointments,
"first on the 28th of October, the next on the 28th of November…"), return one YYYY-MM-DD per subtask, in the SAME
order as "subtasks" — the date that step STARTS or is due. "dueDate" stays the first one. A repeat said only as
"repeat it next month" means the same day of the following month. Steps that share one date → "subtaskDueDates": null.

Return JSON exactly like this (no markdown, no backticks, raw JSON only):
{
  "isTask": true,
  "title": "WHAT the task is — its subject (used when subtasks is null). Never just the board, the column (Cita, Датировано, Поток) or the date/time; if she named only where/when, return \"\"",
  "description": "Any extra detail from the speech, or empty string. Copy every link (https://…) character for character",
  "category": "family|business|spiritual|health|hobby",
  // category rule: anything belonging to HER COMPANY -- brand, products, clients,
  // income, marketing, merchandise -- is "business" even when the object sounds
  // domestic. Branded T-shirts, business cards, office furniture and company
  // phone plans are business, not family. "family" means her household and the
  // people in it. (labelColor below is IGNORED and re-derived from category.)
  "urgency": "urgent_today|soon|dated|not_sure|done",
  "boardTarget": "kira_current_month|kira_future|vibejob|aldeazz|espaluz|algom|kira_habits|kira_finance",
  "listTarget": "just_for_today|todo_flow|in_process_me|in_process_them|not_sure|dated|rules|done",
  "boardNameHint": "board the user named out loud, written as its REAL name in Latin letters (\"Kira октубре\"/\"Кира октябрь\" → \"Kira Octubre\"), else null",
  "listNameHint": "EXACT column the user named out loud (e.g. \"Cita\", \"Датировано\", \"Надо сделать\"), else null",
  "labelColor": "red|orange|purple|green|lime",
  "dueDate": "2026-05-31",
  "dueTime": "15:30",
  "subtasks": null,
  "subtaskDueDates": null,
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
    return applyCategoryColor(reconcileUrgency(groundListHint(groundDueDate(parsed, cleanedText), cleanedText)));
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
const HEARD_AS: [RegExp, string | ((...m: string[]) => string)][] = [
  // "STO APA" (2 Sep 2026), "STO AIPA" (6 Oct 2026). Whisper hears the C as S.
  [/\bS[T7]O\s+A[IY]?P+A\b/gi, "CTO AIPA"],
  [/(^|\s)СТО\s+(?:AIPA|АИПА|АЙПА)(?=\s|$|[.,!?])/gi, "$1CTO AIPA"],
  [/\bC\.?T\.?O\.?\s+A\.?I\.?P\.?A\.?\b/gi, "CTO AIPA"],
  [/\bC[MN]O\s+AP+A\b/gi, "CMO AIPA"],
  // Not plain "ideas" (14 Oct 2026, when this table went live on every voice note): "save these ideas" /
  // "tengo ideas" are real words, and the idea-saving intent would have heard "AIdeazz" instead.
  [/\b(?:idears|aideas)\b/gi, "AIdeazz"],
  // "датировано CETA" (12 Oct 2026) — her Cita column, heard as an acronym and filed as the card title.
  [/\bCETA\b/g, "Cita"],
  [/\bespa\s*luz\b/gi, "EspaLuz"],
  [/\bvibe\s*job\b/gi, "VibeJob"],
  [/\ba\s*tuona\b/gi, "Atuona"],
  [/\balg[oa]m\b/gi, "Algom"],
  // "Clean up golden rules of cloud agent memory" (29 Oct 2026) — she said Claude, Whisper wrote the weather word, and
  // it became the card's title. "cloud" is repaired ONLY in front of a Claude noun (agent, code, memory, desktop, app,
  // CLI, SDK, skills, rules, session, cofounder) and never after Cursor / Google / Oracle / AWS, which are real clouds.
  [/(?<!\b(?:cursor|google|oracle|aws|azure)\s)\bcloud\s+(agents?|code|memory|desktop|app|cli|sdk|skills?|rules?|sessions?|co-?founder)\b/gi,
    (_m: string, noun: string) => `Claude ${/^code$/i.test(noun) ? 'Code' : noun}`],
  // No "Alice → Alisa" since this table runs on every voice note (14 Oct 2026): it rewrote every real Alice into her
  // daughter's name. Alisa is now a soft hint in WHISPER_PROMPT instead, which cannot overwrite a real Alice.
];

export function repairNames(text: string): string {
  let out = text;
  for (const [re, to] of HEARD_AS) out = typeof to === 'string' ? out.replace(re, to) : out.replace(re, to);
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
  rememberCreated([card], transcript, labelId ? labelColor : null);  // the bot's side of any later correction

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
  opts: { source?: 'voice' | 'text' } = {},
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
  classification = guardTitle(classification);
  if (classification.titleGuessed) console.log(`[TrelloVoice] no subject said — title set to "${classification.title}"`);

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

  // Step 4: Duplicate detection — check existing cards on this list.
  // Not for a placeholder title: "Cita October 16, 10:00 AM" and "Cita October 20, 3:00 PM" share half their words
  // and would block each other (review, 12 Oct 2026) — two different appointments.
  if (!classification.titleGuessed) try {
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
  // No subject said → the sphere is unknowable; no colour beats a wrong one (the Boardy intro was filed red).
  const labelId = classification.titleGuessed
    ? null
    : await resolveOrCreateLabel(board.id, classification.labelColor, classification.category);

  const stamp = `${opts.source === 'text' ? 'Telegram note' : 'Voice note'}: ${new Date().toLocaleString('en-US', { timeZone: 'America/Panama' })}`;
  // Every link she sent goes into the description verbatim, even if the model dropped or reworded it (12 Oct 2026).
  // A link the model retyped (and may have altered) is dropped from its text; her exact links are appended.
  const sentUrls = extractUrls(transcript);
  const modelDesc = (classification.description || '')
    .replace(URL_RE, (m) => { const u = extractUrls(m)[0]; return u && sentUrls.includes(u) ? m : ''; }).trim();
  const descBase = [modelDesc || stamp, ...sentUrls.filter((u) => !modelDesc.includes(u))].join('\n');
  const labels = labelId ? [labelId] : [];

  // Step 6: Create card(s) — subtask decomposition or single card
  const subtasks = Array.isArray(classification.subtasks) && classification.subtasks.length >= 2
    ? classification.subtasks
    : null;

  if (subtasks) {
    // Create one card per subtask — same board/list/label; each its OWN due date (subtaskDue, 28 Oct 2026)
    const createdCards: TrelloCard[] = [];
    for (const [i, subtaskTitle] of subtasks.entries()) {
      try {
        const due = subtaskDue(classification, i, subtaskTitle);
        const c = await createCard(targetList.id, subtaskTitle, descBase, labels, due, 'bottom', classification.dueTime);
        createdCards.push(c);
        console.log(`[TrelloVoice] ✅ Subtask card: "${c.name}"`);
      } catch (err) {
        console.error(`[TrelloVoice] Subtask card failed for "${subtaskTitle}":`, err);
      }
    }
    if (createdCards.length === 0) {
      return { success: false, transcript, classification, error: 'All subtask card creations failed' };
    }
    rememberCreated(createdCards, transcript, labels.length ? classification.labelColor : null);
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
  rememberCreated([card], transcript, labels.length ? classification.labelColor : null);

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
  const colorEmoji = classification.titleGuessed ? '⬜' : (COLOR_EMOJI[classification.labelColor] ?? '⬜');
  const colorSphere = classification.titleGuessed
    ? 'no colour yet — no subject heard'
    : (COLOR_LABEL[classification.labelColor] ?? classification.category);

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
    // each card's date as Trello SAVED it (its `due`), not the note's first date — 28 Oct 2026
    const shownDay = (c: TrelloCard) => c.due
      ? new Date(c.due).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/Panama' })
      : '';
    const days = result.cards.map(shownDay);
    const ownDates = new Set(days).size > 1;
    const cardLines = result.cards.map((c, i) => `${i + 1}. [${c.name}](${c.shortUrl})${ownDates && days[i] ? ` — 📅 ${days[i]}` : ''}`);
    return [
      `✅ *${result.cards.length} Trello cards created!*`,
      ``,
      `${colorEmoji} *${classification.title || 'Subtasks'}*`,
      ``,
      `📋 Board: ${boardName}`,
      `📌 List: ${listName}`,
      `🎨 Sphere: ${colorSphere}`,
      ownDates ? `📅 Each card has its own date (below)` : dueLine,
      ``,
      ...cardLines,
      ``,
      `_"${echo80(result.transcript)}"_`,
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
    classification.description ? `📝 Note: ${stripUrls(classification.description)}` : '',
    extractUrls(result.transcript ?? '').length ? `🔗 Link saved in the card description` : '',
    classification.titleGuessed ? `✏️ No subject heard — say or type "rename it to …" and I'll fix this card.` : '',
    ``,
    `🔗 [Open card](${card.shortUrl})`,
    ``,
    `_"${echo80(result.transcript)}"_`,
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
const MGMT_RE = /(?<![\p{L}\p{N}])(move|moving|relocat\p{L}*|transfer\p{L}*|archiv\p{L}*|mueve|muévelo|mover|trasladar|pasar|перенес\p{L}*|переме\p{L}*|передвин\p{L}*|положи|заархивир\p{L}*|архивир\p{L}*|убери|скрой|отправь|change|changed|changing|reschedul\p{L}*|postpon\p{L}*|updat\p{L}*|correct\p{L}*|cambi\p{L}*|reprogram\p{L}*|posterg\p{L}*|измен\p{L}*|поменя\p{L}*|исправ\p{L}*|edit\p{L}*|clarif\p{L}*|редакт\p{L}*|отредакт\p{L}*|уточн\p{L}*|подправ\p{L}*|описани\p{L}*|modific\p{L}*|aclar\p{L}*|description|descripci\p{L}*|renam\p{L}*|renombr\p{L}*|переимен\p{L}*)(?![\p{L}\p{N}])/iu;
// 2026-10-12: + description (EN/ES), rename — "Wire this link into this task into task description …" only matched
// Russian "описани", so a typed or spoken edit in English or Spanish never reached the update path. Not "describe"
// (a question) and not "attach" (a new task can say it): link requests reach the classifier via isLinkAttachRequest.

/** True when a transcript must go to the action classifier (move / archive / update) first. */
export function isManagementCommand(transcript: string): boolean {
  return MGMT_RE.test(transcript);
}

// ── Links on cards (12 Oct 2026) ──────────────────────────────────────────────
// Elena: "if I ask 'wire this link to the task' and then send a link, it should be put in the description."
// That evening "Wire this link into this task …" was saved as an internal note and the Google Meet link for
// her Boardy intro never reached the card. A link is a fact, not a judgment: it is copied character for
// character by code, never re-typed by a model, and the card is read back to prove it landed.
// Parentheses are allowed inside a link (wikipedia "Foo_(bar)"); only an UNBALANCED trailing ")" is dropped.
const URL_RE = /https?:\/\/[^\s<>"'`\]]+/gi;

/** Every URL in the message, exactly as she sent it (trailing punctuation and an unbalanced ")" stripped). */
export function extractUrls(text: string): string[] {
  const out: string[] = [];
  for (const m of String(text || '').match(URL_RE) ?? []) {
    let u = m.replace(/[.,;:!?»”’]+$/u, '');
    while (u.endsWith(')') && (u.match(/\(/g) || []).length < (u.match(/\)/g) || []).length) {
      u = u.slice(0, -1).replace(/[.,;:!?»”’]+$/u, '');
    }
    if (u && !out.includes(u)) out.push(u);
  }
  return out;
}

// Whole words only: "link" must not match "LinkedIn" ("add the LinkedIn post to my tasks" is not a link request).
const LINK_NOUN_RE = /(?<![\p{L}\p{N}])(links?|urls?|enlaces?|ссылк\p{L}*|линк\p{L}?)(?![\p{L}\p{N}])/iu;
const ATTACH_VERB_RE = /(?<![\p{L}\p{N}])(wire|attach\p{L}*|add|put|insert|connect|pin|paste|include|conect\p{L}*|agreg\p{L}*|añad\p{L}*|adjunt\p{L}*|pon|ponle|vincul\p{L}*|insert\p{L}*|добав\p{L}*|прикреп\p{L}*|встав\p{L}*|привяж\p{L}*|положи|закин\p{L}*)(?![\p{L}\p{N}])/iu;
// A NEW task that happens to mention a link ("Add a task to send Marshall the link tomorrow") is a create, never an
// attach — the review of 12 Oct found six such phrasings the first version would have swallowed.
// A create verb that GOVERNS a task noun ("add a task", "crea la tarea", "создай задачу"), "remind me", or a message
// that STARTS with "new task:". Not modal words ("I need to add this link to the task" is an attach) and not a
// pointer phrase ("add this link to the new task", "la tarea que acabas de crear") — re-check of 12 Oct 2026.
const CREATE_VERB_RE = /(?<![\p{L}\p{N}])(?:(?:create|crea|crear|cre[aá]\p{L}*|make|add|agreg\p{L}*|añad\p{L}*|pon|создай|создать|заведи|добавь)\s+(?:(?:a|an|una|un|la|el|the|new|nueva|nuevo|новую|новая)\s+){0,2}(?:task|tarea|card|tarjeta|to-?do|задачу|задача|карточку)|add to (?:my )?(?:tasks|list|to-?do)|remind me|recu[eé]rda\p{L}*|напомни)(?![\p{L}\p{N}])|^\s*(?:new task|nueva tarea|nueva tarjeta|новая задача|to-?do)\b/iu;

/** A word that points at a card or task ("the dentist card", "esa tarea", "эту задачу"). */
const CARD_NOUN_RE = /(?<![\p{L}\p{N}])(cards?|tasks?|tareas?|tarjetas?|задач\p{L}*|карточк\p{L}*)(?![\p{L}\p{N}])/iu;

/** True for "remind me…", "add a task…", "crea la tarea…", "создай задачу…" — a new task, not an edit. */
export function isTaskCreation(text: string): boolean {
  return CREATE_VERB_RE.test(String(text || ''));
}

/** "Wire this link into this task", "agrega este enlace a la tarea", "прикрепи ссылку" — and NOT a create. */
export function isLinkAttachRequest(text: string): boolean {
  const t = String(text || '');
  return LINK_NOUN_RE.test(t) && ATTACH_VERB_RE.test(t) && !CREATE_VERB_RE.test(t);
}

// 29 Oct 2026 — "Find the task in the card, Kira noviembre, the card about my sub HTML, and add there …" became a NEW
// card. The sentence has no move/change/archive word and no link, so neither MGMT_RE nor isLinkAttachRequest fired and
// the message never reached the action classifier: it fell straight to "create a card", beside the card she named.
// Two shapes mean "add to an EXISTING card": a FIND verb next to a card noun ("find the card about…", "busca la
// tarjeta…", "найди карточку…"), or an ADD verb pointing at a card or at "there" ("add there", "add to the card",
// "agrega a la tarea", "добавь в карточку"). A create that merely says "add a task…" is excluded by CREATE_VERB_RE.
const FIND_VERB_RE = /(?<![\p{L}\p{N}])(find|look\s+(?:up|for)|locate|open|busca\p{L}*|encuentr\p{L}*|abre|найди|найти|ищи|поищи|открой)(?![\p{L}\p{N}])/iu;
const ADD_TARGET_RE = /(?<![\p{L}\p{N}])(there|to\s+(?:it|this|that|the|my)\b|into\s+(?:it|this|that|the)\b|ah[ií]|all[ií]|a\s+(?:la|esa|esta|mi)\s+(?:tarea|tarjeta)|туда|в\s+(?:эту|ту|карточку|задачу)|к\s+(?:этой|той|карточке|задаче))(?![\p{L}\p{N}])/iu;

/** "Find the card about X and add there Y", "busca la tarjeta … y agrega …", "найди карточку … добавь туда" — an edit of an existing card, never a create. */
export function isAddToCardRequest(text: string): boolean {
  const t = String(text || '');
  if (CREATE_VERB_RE.test(t)) return false;
  if (!CARD_NOUN_RE.test(t)) return false;
  return (FIND_VERB_RE.test(t) && ATTACH_VERB_RE.test(t)) || (ATTACH_VERB_RE.test(t) && ADD_TARGET_RE.test(t));
}

// Words that only POINT at "this task" and carry no subject of their own (EN / ES / RU).
const POINTER_WORDS = new Set((
  'wire attach add put insert connect pin paste include link links url urls this that the a an to into in on onto of ' +
  'for it its task card description desc please here is s and can you could my me ' +
  'conecta conectar agrega agregar añade añadir adjunta adjuntar pon ponle vincula inserta este esta ese esa el la lo ' +
  'al en de del enlace enlaces tarea tarjeta descripción descripcion por favor aquí aqui mi ' +
  'добавь прикрепи вставь привяжи положи закинь эту эта это этот к в на задаче задачу задача карточке карточку ' +
  'описание описанию ссылку ссылка ссылки линк пожалуйста сюда мою ' +
  // "the new task", "the task you just made", "la tarea que acabas de crear", "I need to add…", "нужно добавить…"
  'new nueva nuevo just made created last latest recent i need have que acabas crear creaste hiciste ' +
  'новую последнюю созданную нужно надо добавить прикрепить вставить ты только что'
).split(/\s+/));

/**
 * True when the message names NO card of its own — only "this/the task" plus the link — so the card just made is
 * the one she means. "Attach this link to the dentist card <url>" names another card (dentist), so it is false and
 * the action classifier finds that card by name (with its "N cards match — say which" guard).
 * Words of the fresh card's own title are allowed ("add this link to the Natalia task" right after making it).
 */
export function pointsOnlyAtRecentCard(text: string, recentTitle: string): boolean {
  const words = (s: string) => String(s || '').replace(URL_RE, ' ').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const own = new Set(words(recentTitle).filter((w) => w.length >= 3));
  return words(text).every((w) => POINTER_WORDS.has(w) || own.has(w));
}

/** Add `add` below `base`, once. Idempotent: a link already in the description is not added again. */
export function mergeDescription(base: string, add: string): string {
  const b = String(base || '').trim(), a = String(add || '').trim();
  if (!a) return b;
  if (b.includes(a)) return b;
  return [b, a].filter(Boolean).join('\n\n');
}

/** Every URL in `addition` must appear verbatim in what she sent — a model never invents or rewrites a link. */
export function urlsAreVerbatim(addition: string, message: string): boolean {
  // Whole-URL equality, not substring: a model's truncated "…/j/123" of her "…/j/123?pwd=abc" must not pass.
  const sent = extractUrls(message);
  return extractUrls(addition).every((u) => sent.includes(u));
}

/**
 * Append text (a link, a note) to a card's description and read it back. Never replaces what is there.
 * Returns ok=false with a reason when the card is archived or Trello stored something else.
 */
export async function appendToCardDescription(cardId: string, addition: string):
    Promise<{ ok: boolean; card?: TrelloCard; already?: boolean; error?: string }> {
  try {
    const live = await trelloGet<TrelloCard>(`/cards/${cardId}`, { fields: 'closed,name,desc,shortUrl' });
    if (live.closed) return { ok: false, card: live, error: `"${live.name}" is archived` };
    const merged = mergeDescription(live.desc ?? '', addition);
    if (merged === (live.desc ?? '').trim()) return { ok: true, card: live, already: true };
    await trelloPut<TrelloCard>(`/cards/${cardId}`, { desc: merged });
    const back = await trelloGet<TrelloCard>(`/cards/${cardId}`, { fields: 'name,id,shortUrl,due,desc' });
    const ok = (back.desc ?? '').trim() === merged;
    console.log(`[TrelloVoice] description ${ok ? 'appended' : 'NOT saved'} on "${back.name}" (+${addition.length} chars)`);
    return ok ? { ok: true, card: back } : { ok: false, card: back, error: 'Trello saved a different description' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 160) : String(e) };
  }
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
  appendDescription?: string | null; // update: a link or note to ADD below the existing description (12 Oct 2026)
  newSphere?: string | null;    // update: change the card's COLOUR = life sphere (27 Oct 2026)
  description?: string;
  cardQuery?: string;
  sourceBoardHint?: string;
  targetBoard?: string;
  targetList?: string;   // the column/list the user named for a move (e.g. "Cita", "dated", "just_for_today")
}

/**
 * The sphere a colour change names (27 Oct 2026): the model's newSphere first; if it left it out, her own words —
 * a colour or sphere said in English, Spanish or Russian next to "colour/color/цвет". Null when none is named.
 */
export function resolveSphere(modelSphere: string | null | undefined, transcript: string): CardCategory | null {
  const valid: CardCategory[] = ['family', 'business', 'spiritual', 'health', 'hobby'];
  const m = (modelSphere ?? '').toLowerCase().trim();
  if ((valid as string[]).includes(m)) return m as CardCategory;
  const t = transcript.toLowerCase();
  if (!/(colou?r|цвет|сфер|sphere|esfera|make it|paint it|ponlo|hazlo|сделай)/.test(t)) return null;
  const words: Array<[CardCategory, RegExp]> = [
    ['business', /(orange|naranja|оранж|business|negocio|бизнес|работ)/],
    ['family', /(red|rojo|красн|family|familia|семь)/],
    ['spiritual', /(purple|violet|morado|púrpura|фиолет|spiritual|mindful|creativ|духов)/],
    ['health', /(green|verde|зелен|health|salud|здоров)/],
    ['hobby', /(lime|lima|лайм|салат|hobby|хобби)/],
  ];
  // "lime green" must be hobby, not health: lime is checked before green wins.
  if (/(lime|lima|лайм|салат)/.test(t)) return 'hobby';
  for (const [k, rx] of words) if (rx.test(t)) return k;
  return null;
}

/** Lowercase, no accents, no silent Spanish "h" at a word start: "Hipódromo" and "Ipodromo" read the same. */
function spokenForm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9а-яё\s]/g, ' ').split(/\s+/).filter(Boolean)
    .map((w) => (w.length > 3 && w.startsWith('h') ? w.slice(1) : w)).join(' ');
}

/** Letter-pair (Dice) similarity 0–1 of two spoken forms — tolerant of one or two misheard letters. */
function spokenSimilarity(a: string, b: string): number {
  const pairs = (s: string) => {
    const t = s.replace(/\s+/g, ' ');
    const out: string[] = [];
    for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
    return out;
  };
  const pa = pairs(spokenForm(a));
  const pb = pairs(spokenForm(b));
  if (!pa.length || !pb.length) return 0;
  const pool = [...pb];
  let hit = 0;
  for (const p of pa) { const i = pool.indexOf(p); if (i >= 0) { hit++; pool.splice(i, 1); } }
  return (2 * hit) / (pa.length + pb.length);
}

/** Search Trello cards by text, optionally restricted to a board. */
export async function searchTrelloCards(query: string, boardHint?: string): Promise<TrelloCard[]> {
  const search = async (q: string) => (await trelloGet<{ cards?: TrelloCard[] }>('/search', {
    query: q,
    modelTypes: 'cards',
    card_fields: 'name,id,shortUrl,idList,idBoard,due,closed',
    cards_limit: '15',
  }))?.cards ?? [];
  let cards = await search(query);
  // 27 Oct 2026: "explore the Ipodromo" found nothing — the card is "Explore the hipodromo" and voice transcription
  // drops the silent Spanish h. Trello matches exact words only, so on a miss: search each word and its h/accent
  // variants, then keep the card whose whole name is clearly closest to what she said.
  if (cards.length === 0) {
    const words = [...new Set(query.split(/\s+/).filter((w) => w.length > 3))];
    const variants = new Set<string>();
    for (const w of words) {
      const plain = w.normalize('NFD').replace(/[̀-ͯ]/g, '');
      variants.add(plain);
      variants.add(/^h/i.test(plain) ? plain.slice(1) : `h${plain}`);
    }
    const seen = new Map<string, TrelloCard>();
    for (const v of variants) for (const c of await search(v)) seen.set(c.id, c);
    const ranked = [...seen.values()]
      .map((c) => ({ c, s: spokenSimilarity(query, c.name) }))
      .sort((a, b) => b.s - a.s);
    const best = ranked[0];
    // A clear winner only; two near-equal names go back to her as "say which one".
    if (best && best.s >= 0.6) cards = ranked.filter((r) => best.s - r.s < 0.08).map((r) => r.c);
  }
  if (!boardHint) return cards;

  const boards = await getAllBoards();
  const hintWords = boardHint.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  // "Kira Octubre": "kira" alone matches EVERY Kira board, so boards matching ALL the words win (28 Sep 2026).
  const all = boards.filter(b => hintWords.every(w => b.name.toLowerCase().includes(w)));
  const any = boards.filter(b => hintWords.some(w => b.name.toLowerCase().includes(w)));
  const matchIds = new Set((all.length ? all : any).map(b => b.id));
  // 29 Oct 2026: she NAMED the board ("Kira noviembre, the card about my sub HTML") and Trello's exact-word search
  // had nothing for "sub HTML" — the card is "Update SOAP AI Ops HTML …". A named board is a short list (a few dozen
  // open cards): read it and rank by the words she said. A clear winner is returned; near-ties go back as "say which".
  if (cards.length === 0 && matchIds.size > 0) {
    const open: TrelloCard[] = [];
    for (const id of matchIds) {
      try {
        open.push(...await trelloGet<TrelloCard[]>(`/boards/${id}/cards/open`, { fields: 'name,id,shortUrl,idList,idBoard,due,closed' }));
      } catch (e) { console.warn('[TrelloVoice] board cards read failed:', (e as Error).message?.slice(0, 120)); }
    }
    const picked = rankCardsForQuery(query, open);
    if (picked.length) console.log(`[TrelloVoice] "${query}" matched on the named board by sound: ${picked.map((c) => `"${c.name}"`).join(', ')}`);
    return picked;
  }
  if (cards.length === 0) return cards;
  const filtered = matchIds.size > 0 ? cards.filter(c => matchIds.has(c.idBoard ?? '')) : cards;
  return filtered.length > 0 ? filtered : cards; // fall back to unfiltered if hint yielded nothing
}

// Words that name the card as a thing, not its subject — never evidence for a match.
const QUERY_NOISE = new Set(('card cards task tasks tarea tareas tarjeta tarjetas карточка карточку карточке задача задачу задаче '
  + 'the a an my this that about de la el mi про о моя мою').split(' '));

/**
 * Rank a board's cards against what she said (pure, exported for tests). Score = the share of her distinctive words
 * (≥ 4 letters, spoken form) found in the card name, or the letter-pair similarity of the whole names, whichever is
 * higher. Only a clear winner (≥ 0.5) is returned; names within 0.08 of it come back together so the caller asks.
 */
export function rankCardsForQuery(query: string, cards: TrelloCard[]): TrelloCard[] {
  // Length is judged BEFORE the spoken form: spokenForm drops a leading h from "html" → "tml", which would then
  // fall under the 4-letter bar and leave "sub HTML" with no distinctive word at all.
  const qWords = query.toLowerCase().split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4 && !QUERY_NOISE.has(w)).map((w) => spokenForm(w)).filter(Boolean);
  const scored = cards.filter((c) => !c.closed).map((c) => {
    const nameWords = new Set(spokenForm(c.name).split(' '));
    const shared = qWords.filter((w) => nameWords.has(w)).length;
    const byWords = qWords.length ? shared / qWords.length : 0;
    return { c, s: Math.max(byWords, spokenSimilarity(query, c.name)) };
  }).sort((a, b) => b.s - a.s);
  const best = scored[0];
  if (!best || best.s < 0.5) return [];
  return scored.filter((r) => best.s - r.s < 0.08).map((r) => r.c);
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
  {"type":"update","cardQuery":"search term or __recent__","sourceBoardHint":"board name or null","newDueDate":"YYYY-MM-DD or null","newDueTime":"HH:MM 24h or null","newTitle":"new card name or null","newDescription":"corrected description or null","appendDescription":"text or link to ADD below the existing description, or null","newSphere":"family|business|spiritual|health|hobby or null"}
]

COLOUR = SPHERE ("change the color of this card to business orange", "make it green", "it's health, not family",
"поменяй цвет на оранжевый", "это бизнес", "cambia el color a naranja"): an UPDATE with newSphere —
red→"family", orange→"business", purple→"spiritual" (mindfulness/creative), green→"health", lime→"hobby".
Right after a card was created, "this card" is "__recent__". Never a "create" for a colour change.

ADDING to a card ("add / attach / wire this link to the task", "conecta / agrega este enlace", "добавь / прикрепи
ссылку к задаче"): this is an UPDATE with appendDescription = the link (copied character for character) plus any
words she wants with it. newDescription only when she says the description is WRONG and must be replaced. Never a
"create" for a message that adds something to an existing card.

FIND + ADD = UPDATE (29 Oct 2026). "Find the task/card about X [on board B] and add there Y", "busca la tarjeta de X y
agrega Y", "найди карточку про X и добавь туда Y": she is pointing at a card that ALREADY EXISTS. Emit ONE "update" with
cardQuery = the card's distinctive words, sourceBoardHint = the board she named, appendDescription = Y in her words.
Never a "create" — a second card beside the one she named is the mistake she corrects most often.
Speech recognition garbles acronyms and product names ("SOAP" → "sub"/"soap"/"sop", "GEO" → "geo"/"gio"): put the
STABLE words in cardQuery (e.g. "HTML" rather than "sub HTML") — the code ranks the board's cards by sound and asks her
when two fit.
${learnedBlockFromDisk()}
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
  source: 'voice' | 'text' = 'voice',
): Promise<{ handled: boolean; results: MultiActionItem[] }> {
  // A link request that names a card ("add this link to the dentist card …") must reach the classifier too.
  // 29 Oct 2026: "find the card about … and add there …" (no link, no move word) must reach it too.
  if (!MGMT_RE.test(transcript) && !isLinkAttachRequest(transcript) && !isAddToCardRequest(transcript)) return { handled: false, results: [] };

  const classified = await classifyMultiAction(transcript);
  if (!classified.length) return { handled: false, results: [] };
  // 27 Oct 2026: "Change the color in the card Prepare for Spanish exam … to family" came back as TWO updates —
  // the named card plus "__recent__" — so the card made just before ("Explore the hipodromo") turned red too.
  // When the message names a card, a "__recent__" update beside it is the model guessing, not her.
  const namesACard = classified.some((a) => a.type === 'update' && a.cardQuery && a.cardQuery !== '__recent__');
  const rawActions = namesACard
    ? classified.filter((a) => !(a.type === 'update' && a.cardQuery === '__recent__'))
    : classified;
  console.log(`[TrelloVoice] actions: ${classified.map((a) => `${a.type}(${a.cardQuery ?? a.description?.slice(0, 40) ?? ''})`).join(', ')}` +
    (rawActions.length < classified.length ? ` — dropped ${classified.length - rawActions.length} __recent__ guess` : ''));

  const results: MultiActionItem[] = [];

  for (const action of rawActions) {
    // ── CREATE ──────────────────────────────────────────────────────────────
    if (action.type === 'create' && action.description) {
      // The model paraphrases the task; links from her message are carried over verbatim (12 Oct 2026).
      const carried = extractUrls(transcript).filter((u) => !action.description!.includes(u));
      const r = await createTrelloCardFromTranscript([action.description, ...carried].join('\n'), { source });
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
        const live = await trelloGet<TrelloCard>(`/cards/${card.id}`, { fields: 'closed,due,name,desc,idBoard,idLabels' });
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
        if (action.newDescription && action.newDescription.trim()) {
          // REPLACE only the card she just made. A card found by SEARCH ("Edit the Datastar cover letter – make it
          // clear that …") gets the correction ADDED below — a search hit's description is never wiped (12 Oct 2026).
          body.desc = action.cardQuery === '__recent__'
            ? action.newDescription.trim()
            : mergeDescription(live.desc ?? '', action.newDescription.trim());
        }
        // ADD to the description (12 Oct 2026): merged below what is there, never replacing it. A link the model
        // wrote must appear verbatim in her message — otherwise refuse rather than store an invented URL.
        let added = '';
        if (action.appendDescription && action.appendDescription.trim()) {
          const add = [action.appendDescription.trim(),
            ...extractUrls(transcript).filter((u) => !action.appendDescription!.includes(u))].join('\n');
          if (!urlsAreVerbatim(add, transcript)) {
            results.push({ type: 'update', success: false, cardQuery: action.cardQuery,
              error: 'The link I understood is not exactly the one you sent — nothing changed; send the link again' });
            continue;
          }
          body.desc = mergeDescription(body.desc ?? live.desc ?? '', add);
          added = add;
        }
        // COLOUR = life sphere (27 Oct 2026). "Change color of this card to business orange color" was refused with
        // "No new date, time, name or description" — the update path had no colour field. Only her five sphere
        // colours are swapped; any other label on the card stays.
        const sphere = resolveSphere(action.newSphere, transcript);
        let sphereLabelId = '';
        if (sphere && live.idBoard) {
          const color = CATEGORY_COLOR_MAP[sphere];
          sphereLabelId = (await resolveOrCreateLabel(live.idBoard, color, sphere)) ?? '';
          if (sphereLabelId) {
            const boardLabels = await getBoardLabels(live.idBoard);
            const sphereColors = new Set<string>(Object.values(CATEGORY_COLOR_MAP));
            const sphereIds = new Set(boardLabels.filter((l) => sphereColors.has(l.color)).map((l) => l.id));
            const keep = (live.idLabels ?? []).filter((id) => !sphereIds.has(id));
            body.idLabels = [...keep, sphereLabelId].join(',');
          }
        }
        if (!Object.keys(body).length) {
          results.push({ type: 'update', success: false, cardQuery: action.cardQuery,
            error: 'No new date, time, name, description or colour was understood — nothing changed' });
          continue;
        }
        await trelloPut<TrelloCard>(`/cards/${card.id}`, body);
        const back = await trelloGet<TrelloCard>(`/cards/${card.id}`, { fields: 'name,id,shortUrl,due,desc,idLabels' });
        const dueOk = !body.due || (back.due ? new Date(back.due).toISOString() === body.due : false);
        const descOk = body.desc === undefined || (back.desc ?? '').trim() === body.desc.trim();
        const colorOk = !body.idLabels || (back.idLabels ?? []).includes(sphereLabelId);
        const ok = dueOk && descOk && colorOk;
        // Her correction by voice/text is a lesson (28 Oct 2026) — only what Trello confirmed it kept.
        if (ok) recordCorrections(card.id, { name: back.name, due: back.due ?? null,
          ...(body.idLabels && sphere ? { colour: CATEGORY_COLOR_MAP[sphere] } : {}) }, 'voice');
        results.push({ type: 'update', success: ok, cardQuery: action.cardQuery, cards: [back],
          detail: [when && `📅 ${when}`, body.name && `✏️ "${body.name}"`,
            body.idLabels && sphere && `🎨 ${COLOR_EMOJI[CATEGORY_COLOR_MAP[sphere]]} ${COLOR_LABEL[CATEGORY_COLOR_MAP[sphere]]}`,
            added ? `🔗 added to the description` : body.desc && `📝 "${stripUrls(body.desc).slice(0, 120)}"`]
            .filter(Boolean).join(' · '),
          ...(ok ? {} : { error: !colorOk ? 'Trello did not keep the new colour' : dueOk ? 'Trello saved a different description' : `Trello saved a different date (${back.due ?? 'none'})` }) });
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

  // Only failed "no card found" updates, and the message never pointed at a card or task: it was a NEW task that
  // mentioned a link or a description ("Put the link in the newsletter on Friday") — let the create path run instead
  // of answering "No card found" and dropping it (re-check, 12 Oct 2026).
  if (results.length && results.every((r) => r.type === 'update' && !r.success && /^No card found/.test(r.error ?? ''))
      && !CARD_NOUN_RE.test(transcript)) {
    console.log('[TrelloVoice] update found no card and the message names none — treating it as a new task');
    return { handled: false, results: [] };
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
