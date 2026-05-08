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
  labelColor: TrelloColor;
  dueDate: string | null;  // ISO date YYYY-MM-DD extracted from speech ("by Friday", "end of May") or null
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
  | 'kira_current_month'   // Kira Mayo 2026 — personal life this month
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
type ListTarget =
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

interface TrelloCard {
  id: string;
  name: string;
  url: string;
  shortUrl: string;
  due?: string | null;
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
  // "Kira Mayo 2026" / "Kira Junio 2026" / "Kira Julio 2026" — month boards
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

// List name substrings for fuzzy matching — verified against all 10 actual boards (May 2026)
//
// Boards with standard lists: Kira Mayo/Junio/Julio, VibeJob, Algom, Web3, EspaLuz
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

async function getAllBoards(): Promise<TrelloBoard[]> {
  return trelloGet<TrelloBoard[]>('/members/me/boards', { filter: 'open', fields: 'name,id' });
}

async function getBoardLists(boardId: string): Promise<TrelloList[]> {
  return trelloGet<TrelloList[]>(`/boards/${boardId}/lists`, { filter: 'open' });
}

async function getBoardLabels(boardId: string): Promise<TrelloLabel[]> {
  return trelloGet<TrelloLabel[]>(`/boards/${boardId}/labels`);
}

async function createCard(
  listId: string,
  name: string,
  description: string,
  labelIds: string[],
  dueDate?: string | null,
): Promise<TrelloCard> {
  const body: Record<string, string> = {
    idList: listId,
    name,
    desc: description,
    idLabels: labelIds.join(','),
    pos: 'top',
  };
  if (dueDate) body.due = dueDate;
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

function resolveBoard(boards: TrelloBoard[], target: BoardTarget): TrelloBoard | undefined {
  // Special case: current month board — detect the current month name
  if (target === 'kira_current_month') {
    const monthNames = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
    ];
    const currentMonth = monthNames[new Date().getMonth()] as string;
    const currentYear = new Date().getFullYear().toString();

    // Try to find current month board first
    const currentMonthBoard = boards.find((b) => {
      const lower = b.name.toLowerCase();
      return lower.includes(currentMonth) && lower.includes(currentYear) && lower.includes('kira');
    });
    if (currentMonthBoard) return currentMonthBoard;
  }

  const keywords = BOARD_KEYWORDS[target];
  return boards.find((b) => fuzzyMatch(b.name, keywords));
}

function resolveList(lists: TrelloList[], target: ListTarget): TrelloList | undefined {
  const keywords = LIST_KEYWORDS[target];
  return lists.find((l) => fuzzyMatch(l.name, keywords)) ?? lists[0];
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

// ─── Claude Haiku NLP Classification ─────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function classifyCard(rawTranscript: string): Promise<CardClassification> {
  const cleanedText = removeTriggerPhrase(rawTranscript);

  const systemPrompt = `You are a personal assistant for Elena Revicheva — AI builder, executive, and mother in Panama.
You classify voice notes into Trello card metadata using HER EXACT system.

═══ ELENA'S BOARDS (exact real names) ═══
- "Kira Mayo 2026" (current month, May 2026) — personal life this month: family, health, home, visa, admin, appointments, errands
- "Kira Junio 2026" / "Kira Julio 2026" — next months (use kira_current_month for ALL month boards)
- "Kira Ano 2026 и дальше" — long-term personal goals, multi-year life plans, big future projects
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

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD Panama time reference

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

Return JSON exactly like this (no markdown, no backticks, raw JSON only):
{
  "isTask": true,
  "title": "Clean actionable card title (3-8 words, imperative verb)",
  "description": "Any extra detail from the speech, or empty string",
  "category": "family|business|spiritual|health|hobby",
  "urgency": "urgent_today|soon|dated|not_sure|done",
  "boardTarget": "kira_current_month|kira_future|vibejob|aldeazz|espaluz|algom|kira_habits|kira_finance",
  "listTarget": "just_for_today|todo_flow|in_process_me|in_process_them|not_sure|dated|rules|done",
  "labelColor": "red|orange|purple|green|lime",
  "dueDate": "2026-05-31",
  "confidence": 0.90,
  "reasoning": "One sentence: why this board + list + color"
}

If isTask is false, still return the full JSON but the other fields can be empty/default.`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const firstBlock = response.content[0];
  const text = firstBlock && firstBlock.type === 'text' ? (firstBlock as { type: 'text'; text: string }).text : '';

  try {
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim()) as CardClassification;
    return parsed;
  } catch {
    // Fallback classification if parsing fails
    console.error('[TrelloVoice] Haiku parse failed, using fallback. Raw:', text);
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

async function transcribeVoice(audioBuffer: Buffer, fileId: string): Promise<string> {
  // Save to temp file (Groq SDK needs a file path or File object)
  const tmpPath = path.join('/tmp', `voice_${fileId}.ogg`);
  fs.writeFileSync(tmpPath, audioBuffer);

  try {
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(tmpPath),
      model: 'whisper-large-v3',
      response_format: 'text',
    });
    return typeof transcription === 'string' ? transcription : (transcription as { text: string }).text;
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
  card?: TrelloCard;
  boardName?: string;
  listName?: string;
  error?: string;
  noTrigger?: boolean;      // true = voice had no trigger phrase (handleVoiceToTrello path)
  notATask?: boolean;       // true = NLP decided this is not a Trello task — fall through
  duplicate?: boolean;      // true = a similar card already exists on the target list
  existingCard?: TrelloCard; // the card that was found as a duplicate
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

  const targetBoard = resolveBoard(boards, classification.boardTarget);
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

  const targetList = resolveList(lists, classification.listTarget);
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

  const targetBoard = resolveBoard(boards, classification.boardTarget);
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

  const targetList = resolveList(lists, classification.listTarget);
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

  // Step 6: Create the card (with due date if extracted)
  let card: TrelloCard;
  try {
    card = await createCard(
      targetList.id,
      classification.title,
      classification.description || `Voice note: ${new Date().toLocaleString('en-US', { timeZone: 'America/Panama' })}`,
      labelId ? [labelId] : [],
      classification.dueDate,
    );
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

  if (!result.success || !result.card || !result.classification) {
    if (result.error) {
      return `❌ Could not create Trello card\n\n${result.error}`;
    }
    return '❌ Something went wrong creating the card.';
  }

  const { classification, card, boardName, listName } = result;
  const colorEmoji = COLOR_EMOJI[classification.labelColor] ?? '⬜';
  const colorSphere = COLOR_LABEL[classification.labelColor] ?? classification.category;

  // Format due date for display (YYYY-MM-DD → "May 31")
  let dueLine = '';
  if (classification.dueDate) {
    try {
      const d = new Date(`${classification.dueDate}T12:00:00`);
      dueLine = `📅 Due: ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
    } catch {
      dueLine = `📅 Due: ${classification.dueDate}`;
    }
  }

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
