/**
 * Trello Kanban integration for CTO AIPA.
 *
 * Two public surfaces:
 *  - analyzeKanban()           → full Kanban health analysis (for /trello_analyze Telegram command)
 *  - fetchTodaysTrelloTasks()  → short "Today" card list for Sprint Briefing
 *
 * Env vars required (set in .env on Oracle + Lambda console):
 *   TRELLO_API_KEY   — from https://trello.com/app-key
 *   TRELLO_TOKEN     — generated at https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&key=YOUR_KEY
 */
import Anthropic from '@anthropic-ai/sdk';
import { claudeWithGroqFallback } from './llm-resilience';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  due: string | null;
  labels: { name: string; color: string }[];
  idList: string;
  pos: number;
}

export interface TrelloList {
  id: string;
  name: string;
  cards: TrelloCard[];
}

export interface TrelloBoard {
  id: string;
  name: string;
  lists: TrelloList[];
}

// ─────────────────────────────────────────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────────────────────────────────────────

function trelloBase(): string {
  const key = process.env.TRELLO_API_KEY?.trim();
  const token = process.env.TRELLO_TOKEN?.trim();
  if (!key || !token) throw new Error('TRELLO_API_KEY and TRELLO_TOKEN must be set in .env');
  return `key=${key}&token=${token}`;
}

async function trelloGet<T>(path: string): Promise<T> {
  const auth = trelloBase();
  const sep = path.includes('?') ? '&' : '?';
  const url = `https://api.trello.com/1${path}${sep}${auth}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Trello API ${res.status} at ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data fetching
// ─────────────────────────────────────────────────────────────────────────────

async function fetchBoards(): Promise<{ id: string; name: string }[]> {
  return trelloGet('/members/me/boards?filter=open&fields=id,name');
}

async function fetchBoardSnapshot(boardId: string): Promise<TrelloBoard> {
  const [boardRaw, listsRaw, cardsRaw] = await Promise.all([
    trelloGet<{ id: string; name: string }>(`/boards/${boardId}?fields=id,name`),
    trelloGet<{ id: string; name: string }[]>(`/boards/${boardId}/lists?filter=open&fields=id,name`),
    trelloGet<TrelloCard[]>(`/boards/${boardId}/cards?filter=open&fields=id,name,desc,due,labels,idList,pos`),
  ]);

  const lists: TrelloList[] = listsRaw.map(l => ({
    ...l,
    cards: cardsRaw.filter(c => c.idList === l.id),
  }));

  return { id: boardRaw.id, name: boardRaw.name, lists };
}

// ─────────────────────────────────────────────────────────────────────────────
// Kanban analysis
// ─────────────────────────────────────────────────────────────────────────────

function boardToText(board: TrelloBoard): string {
  const lines: string[] = [`## Board: ${board.name}`];
  for (const list of board.lists) {
    lines.push(`\n### Column: "${list.name}" (${list.cards.length} cards)`);
    if (list.cards.length === 0) {
      lines.push('  (empty)');
    } else {
      for (const card of list.cards) {
        const due = card.due ? ` [due: ${new Date(card.due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}]` : '';
        const labels = card.labels.length ? ` [${card.labels.map(l => l.name || l.color).join(', ')}]` : '';
        const hasDesc = card.desc?.trim() ? '' : ' ⚠️no-desc';
        lines.push(`  - ${card.name}${due}${labels}${hasDesc}`);
      }
    }
  }
  return lines.join('\n');
}

const KANBAN_ANALYSIS_PROMPT = `You are a Kanban expert analyzing a personal productivity board.

Apply strict Kanban philosophy:
1. **Flow**: work should move smoothly left→right. Identify where it stalls.
2. **WIP limits**: too many items in any active column = bottleneck. Flag columns with >3 cards in "doing/in progress/today" stages.
3. **Bottleneck columns**: which column has the most cards relative to its purpose?
4. **Stale cards**: items that seem stuck (no due date in urgent columns, duplicates, vague names).
5. **Column structure**: do the column names reflect proper Kanban stages? Suggest renames if needed.
6. **Card quality**: cards without descriptions, missing due dates in time-sensitive columns.
7. **Queue management**: is Backlog too large to be actionable? Is Done being cleared?

Output format (use this exactly):
---
## 📊 Board Snapshot
[One line per column: "Column Name: N cards"]

## 🚧 Bottlenecks
[Numbered list — specific column/card names, not generalities]

## 🔴 Critical Issues
[Only real problems. Skip this section if none.]

## 🟡 Improvements
[Numbered list of actionable changes]

## ✅ Fix Plan (priority order)
[Numbered, specific, doable in next 48h]
---

Be specific. Name the actual columns and cards. No generic Kanban theory — only what's wrong here.`;

export async function analyzeKanban(): Promise<string> {
  if (!process.env.TRELLO_API_KEY?.trim()) {
    return '⚠️ TRELLO_API_KEY not set. Add it to .env on Oracle and restart.';
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Fetch all boards
  const boardList = await fetchBoards();
  if (boardList.length === 0) return '⚠️ No open Trello boards found.';

  // Fetch all board snapshots in parallel
  const boards = await Promise.all(boardList.map(b => fetchBoardSnapshot(b.id)));

  // Build full text representation
  const boardsText = boards.map(boardToText).join('\n\n---\n\n');
  const totalCards = boards.reduce((sum, b) => sum + b.lists.reduce((s, l) => s + l.cards.length, 0), 0);

  const prompt = `${KANBAN_ANALYSIS_PROMPT}\n\n# Your Trello workspace (${boards.length} boards, ${totalCards} total cards)\n\n${boardsText}`;

  return await claudeWithGroqFallback(
    anthropic, 'claude-opus-4-8', 4096, null, prompt, 'trello-kanban/analyze'
  ) || '(no analysis returned)';
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint Briefing: today's tasks
// ─────────────────────────────────────────────────────────────────────────────

// 2026-09-18: SCOPED TO THE CURRENT MONTH BOARD. The old patterns below matched any
// list called "today", "doing" or "active" on ANY of the ten open boards, so every
// briefing recited 27 cards of which NONE had been touched in 30 days — the youngest
// was 119 days old, the oldest 553 ("CoinGecko AZ Token", "Web3 site builder").
// Elena's actual daily work lives on the CURRENT month board ("Kira Septiembre 2026"),
// in two lists only: "Just for Today" and "To Dos". Cita is her family/medical column
// and is never read. Project boards (AIdeazz AI Lab, EspaLuz, VibeJob) are backlogs,
// not day plans — they are deliberately out of scope now.
const ACTIVE_LIST_PATTERNS = ['just for today', 'to do', 'to-do', 'todo', 'надо сделать', 'nado zdelat'];
// Cita is her family/medical column. "Not sure's / To-do or not?" is a maybe-pile, not a
// commitment — it contains "to-do" and would otherwise slip in through the pattern above.
const NEVER_READ_LIST_PATTERNS = ['cita', 'citas', 'not sure', 'or not?'];

const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december'];

function isActiveList(name: string): boolean {
  const lower = name.toLowerCase();
  if (NEVER_READ_LIST_PATTERNS.some(p => lower.includes(p))) return false;
  return ACTIVE_LIST_PATTERNS.some(p => lower.includes(p));
}

/** Panama (UTC-5) month + year — the board is named for Elena's local month, not UTC's. */
function panamaMonthYear(now = new Date()): { month: number; year: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Panama', year: 'numeric', month: 'numeric',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value || 0);
  return { month: get('month') - 1, year: get('year') };
}

/**
 * The board for the month we are actually in. She keeps exactly three month boards and
 * RECYCLES them by renaming, so matching on the month name is the only stable key —
 * board ids are reused for a different month later.
 */
function findCurrentMonthBoard(boards: { id: string; name: string }[], now = new Date()) {
  const { month, year } = panamaMonthYear(now);
  const es = MONTHS_ES[month] ?? '';
  const en = MONTHS_EN[month] ?? '';
  if (!es || !en) return undefined;
  const withYear = boards.find(b => {
    const n = b.name.toLowerCase();
    return (n.includes(es) || n.includes(en)) && n.includes(String(year));
  });
  if (withYear) return withYear;
  return boards.find(b => {
    const n = b.name.toLowerCase();
    return n.includes(es) || n.includes(en);
  });
}

/**
 * Returns a short Markdown snippet of TODAY's cards from the CURRENT month board.
 * Returns empty string if credentials are missing or the month board cannot be found —
 * silence is correct here, because the alternative is reciting a year-old backlog as
 * if it were today's plan.
 */
export async function fetchTodaysTrelloTasks(): Promise<string> {
  if (!process.env.TRELLO_API_KEY?.trim() || !process.env.TRELLO_TOKEN?.trim()) return '';

  try {
    const boardList = await fetchBoards();
    const monthBoard = findCurrentMonthBoard(boardList);
    if (!monthBoard) {
      console.warn('[trello] no board found for the current month — no day plan to read');
      return '';
    }
    const boards = [await fetchBoardSnapshot(monthBoard.id)];

    const todayCards: { board: string; list: string; card: TrelloCard }[] = [];
    for (const board of boards) {
      for (const list of board.lists) {
        if (isActiveList(list.name)) {
          for (const card of list.cards) {
            todayCards.push({ board: board.name, list: list.name, card });
          }
        }
      }
    }

    if (todayCards.length === 0) return '';

    // The list name is carried through: "Just for Today" is today's commitment,
    // "To Dos" is this month's queue, and the briefing should not blur the two.
    const lines = [`### 📋 Trello — ${monthBoard.name} (current month board, Just for Today + To Dos)`];
    for (const { list, card } of todayCards) {
      const due = card.due ? ` (due ${new Date(card.due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})` : '';
      lines.push(`- **[${list}]** ${card.name}${due}`);
    }
    return lines.join('\n');
  } catch (e: unknown) {
    console.warn('[trello] fetchTodaysTrelloTasks failed:', (e as Error)?.message);
    return '';
  }
}
