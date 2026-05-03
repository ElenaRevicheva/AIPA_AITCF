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

  const msg = await anthropic.messages.create({
    model: 'claude-opus-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = msg.content[0];
  return block && block.type === 'text' ? block.text : '(no analysis returned)';
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint Briefing: today's tasks
// ─────────────────────────────────────────────────────────────────────────────

// Column names that represent "active today" work — matched case-insensitively
const TODAY_COLUMN_PATTERNS = [
  'just for today', 'today', 'doing', 'in progress', 'in-progress',
  'current', 'this week', 'active', 'now',
];

function isTodayColumn(name: string): boolean {
  const lower = name.toLowerCase();
  return TODAY_COLUMN_PATTERNS.some(p => lower.includes(p));
}

/**
 * Returns a short Markdown snippet of active Trello cards for the Sprint Briefing.
 * Returns empty string if credentials not set (never throws).
 */
export async function fetchTodaysTrelloTasks(): Promise<string> {
  if (!process.env.TRELLO_API_KEY?.trim() || !process.env.TRELLO_TOKEN?.trim()) return '';

  try {
    const boardList = await fetchBoards();
    const boards = await Promise.all(boardList.map(b => fetchBoardSnapshot(b.id)));

    const todayCards: { board: string; list: string; card: TrelloCard }[] = [];
    for (const board of boards) {
      for (const list of board.lists) {
        if (isTodayColumn(list.name)) {
          for (const card of list.cards) {
            todayCards.push({ board: board.name, list: list.name, card });
          }
        }
      }
    }

    if (todayCards.length === 0) return '';

    const lines = ['### 📋 Trello — active today'];
    for (const { board, list, card } of todayCards) {
      const due = card.due ? ` (due ${new Date(card.due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})` : '';
      lines.push(`- **[${board}]** ${card.name}${due}`);
    }
    return lines.join('\n');
  } catch (e: unknown) {
    console.warn('[trello] fetchTodaysTrelloTasks failed:', (e as Error)?.message);
    return '';
  }
}
