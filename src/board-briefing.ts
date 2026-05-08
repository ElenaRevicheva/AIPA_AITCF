/**
 * board-briefing.ts
 * Fetches open Trello boards, categorises cards by urgency, and generates
 * human-readable daily + weekly briefings via Claude Haiku.
 */

const TRELLO_API_KEY = process.env.TRELLO_API_KEY!;
const TRELLO_TOKEN   = process.env.TRELLO_TOKEN!;
const TRELLO_BASE    = 'https://api.trello.com/1';

// ─── Trello thin client ───────────────────────────────────────────────────────

async function tGet<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${TRELLO_BASE}${endpoint}`);
  url.searchParams.set('key', TRELLO_API_KEY);
  url.searchParams.set('token', TRELLO_TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Trello GET ${endpoint} → ${res.status}`);
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawBoard { id: string; name: string }
interface RawList  { id: string; name: string }
interface RawCard  { id: string; name: string; shortUrl: string; due: string | null; idList: string }

export interface CardEntry {
  id: string;
  name: string;
  shortUrl: string;
  due: string | null;
  listName: string;
  daysOverdue: number;   // negative = future, 0 = today, positive = overdue
}

export interface BoardSnapshot {
  boardId:   string;
  boardName: string;
  overdue:   CardEntry[];  // due < today
  dueToday:  CardEntry[];  // due === today
  dueSoon:   CardEntry[];  // due in 1–3 days
  dueWeek:   CardEntry[];  // due in 4–7 days
  undated:   number;       // open cards with no due date
}

// ─── Data fetching ────────────────────────────────────────────────────────────

/** Boards Elena actively manages (Kira* month boards + VibeJob). */
async function fetchActiveBoardSnapshots(): Promise<BoardSnapshot[]> {
  const boards = await tGet<RawBoard[]>('/members/me/boards', { filter: 'open', fields: 'name,id' });

  // Keep personal Kira boards + VibeJob; skip admin / template / archive boards
  const active = boards.filter(b => {
    const n = b.name.toLowerCase();
    return (n.includes('kira') || n.includes('vibejob') || n.includes('vibe job'));
  });

  const today = new Date(); today.setHours(0, 0, 0, 0);

  const snapshots: BoardSnapshot[] = [];

  for (const board of active) {
    try {
      const [cards, lists] = await Promise.all([
        tGet<RawCard[]>(`/boards/${board.id}/cards`, {
          filter: 'open',
          fields: 'name,id,shortUrl,due,idList',
        }),
        tGet<RawList[]>(`/boards/${board.id}/lists`, { filter: 'open', fields: 'name,id' }),
      ]);

      const listMap = new Map(lists.map(l => [l.id, l.name]));

      const snap: BoardSnapshot = {
        boardId: board.id, boardName: board.name,
        overdue: [], dueToday: [], dueSoon: [], dueWeek: [], undated: 0,
      };

      for (const card of cards) {
        if (!card.due) { snap.undated++; continue; }

        const due = new Date(`${card.due.slice(0, 10)}T00:00:00`);
        const daysAway = Math.round((due.getTime() - today.getTime()) / 86_400_000);

        const entry: CardEntry = {
          id: card.id, name: card.name, shortUrl: card.shortUrl,
          due: card.due, listName: listMap.get(card.idList) ?? '', daysOverdue: -daysAway,
        };

        if (daysAway < 0)       snap.overdue.push(entry);
        else if (daysAway === 0) snap.dueToday.push(entry);
        else if (daysAway <= 3)  snap.dueSoon.push(entry);
        else if (daysAway <= 7)  snap.dueWeek.push(entry);
      }

      // Sort overdue worst-first
      snap.overdue.sort((a, b) => b.daysOverdue - a.daysOverdue);

      snapshots.push(snap);
    } catch (err) {
      console.error(`[BoardBriefing] Failed to fetch board "${board.name}":`, err);
    }
  }

  return snapshots;
}

// ─── Claude Haiku helper ──────────────────────────────────────────────────────

async function askHaiku(prompt: string, maxTokens = 400): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY || '';
  if (!key) return '';
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (resp.ok) {
      const data = await resp.json() as { content?: Array<{ text?: string }> };
      return (data?.content?.[0]?.text || '').trim();
    }
  } catch { /* fall through */ }
  return '';
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function cardLine(c: CardEntry, showOverdue = false): string {
  const tag = showOverdue && c.daysOverdue > 0 ? ` (+${c.daysOverdue}d)` : '';
  return `• [${c.name}](${c.shortUrl})${tag}`;
}

function boardSection(snap: BoardSnapshot): string {
  const lines: string[] = [`📋 *${snap.boardName}*`];

  if (snap.overdue.length)  lines.push(`  🚨 Overdue (${snap.overdue.length}): ${snap.overdue.map(c => `${c.name} (+${c.daysOverdue}d)`).join(', ')}`);
  if (snap.dueToday.length) lines.push(`  📅 Today (${snap.dueToday.length}): ${snap.dueToday.map(c => c.name).join(', ')}`);
  if (snap.dueSoon.length)  lines.push(`  ⏰ Next 3 days (${snap.dueSoon.length}): ${snap.dueSoon.map(c => c.name).join(', ')}`);
  if (snap.dueWeek.length)  lines.push(`  📆 This week (${snap.dueWeek.length})`);
  if (snap.undated)         lines.push(`  ○ No date: ${snap.undated} cards`);

  if (!snap.overdue.length && !snap.dueToday.length && !snap.dueSoon.length) {
    lines.push('  ✅ All clear!');
  }

  return lines.join('\n');
}

// ─── Daily briefing ───────────────────────────────────────────────────────────

export async function generateDailyBriefing(): Promise<string> {
  const snapshots = await fetchActiveBoardSnapshots();
  if (snapshots.length === 0) return '';

  const totalOverdue  = snapshots.reduce((s, b) => s + b.overdue.length, 0);
  const totalToday    = snapshots.reduce((s, b) => s + b.dueToday.length, 0);
  const totalSoon     = snapshots.reduce((s, b) => s + b.dueSoon.length, 0);

  const boardLines = snapshots.map(boardSection).join('\n\n');

  // Build structured context for Haiku suggestion
  const overdueNames = snapshots.flatMap(b => b.overdue.map(c => `[${b.boardName}] ${c.name} (+${c.daysOverdue}d)`));
  const todayNames   = snapshots.flatMap(b => b.dueToday.map(c => `[${b.boardName}] ${c.name}`));

  const suggestionCtx = [
    overdueNames.length ? `Overdue: ${overdueNames.join('; ')}` : null,
    todayNames.length   ? `Due today: ${todayNames.join('; ')}` : null,
  ].filter(Boolean).join('\n');

  let suggestion = '';
  if (suggestionCtx) {
    suggestion = await askHaiku(
      `You are a personal assistant for Elena Revicheva (AI entrepreneur, Panama).
She uses Trello to manage her life. Here is her board status right now:

${suggestionCtx}

Write ONE short actionable suggestion in 1-2 sentences (max 120 chars).
Be specific — name the task. Do not repeat the count numbers already shown above.
Examples of good suggestions: "Start with the car inspection call — it's 5 days overdue and unblocks the court decision."`, 150);
  }

  const header = totalOverdue > 0
    ? `🌅 *Good morning, Elena!*\n\n🚨 *${totalOverdue} overdue · ${totalToday} today · ${totalSoon} due soon*`
    : `🌅 *Good morning, Elena!*\n\n✅ *${totalToday} due today · ${totalSoon} due soon*`;

  const parts = [header, '', boardLines];
  if (suggestion) parts.push('', `💡 ${suggestion}`);

  return parts.join('\n');
}

// ─── Weekly digest ────────────────────────────────────────────────────────────

export async function generateWeeklyDigest(): Promise<string> {
  const snapshots = await fetchActiveBoardSnapshots();
  if (snapshots.length === 0) return '';

  const totalOverdue = snapshots.reduce((s, b) => s + b.overdue.length, 0);
  const totalUndated = snapshots.reduce((s, b) => s + b.undated, 0);
  const totalWeek    = snapshots.reduce((s, b) => s + b.dueSoon.length + b.dueWeek.length, 0);

  // Detailed card lists for Haiku
  const allOverdue = snapshots.flatMap(b => b.overdue.map(c => `[${b.boardName}] ${c.name} (${c.daysOverdue}d overdue)`));
  const allWeek    = snapshots.flatMap(b => [...b.dueSoon, ...b.dueWeek].map(c => `[${b.boardName}] ${c.name}`));

  const digest = await askHaiku(
    `You are a personal assistant for Elena Revicheva (AI entrepreneur, Panama).
Weekly Trello board review. Give a 3–5 sentence insight — patterns you notice, what to tackle first, any bottlenecks. Speak directly to Elena, use "you". No bullet lists, plain paragraphs.

Overdue (${allOverdue.length}): ${allOverdue.join('; ') || 'none'}
Due this week (${allWeek.length}): ${allWeek.join('; ') || 'none'}
Undated cards: ${totalUndated}`, 300);

  const boardLines = snapshots.map(boardSection).join('\n\n');

  return [
    `📊 *Weekly Trello Digest — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}*`,
    '',
    boardLines,
    '',
    `📈 *Summary:* ${totalOverdue} overdue · ${totalWeek} due this week · ${totalUndated} undated`,
    '',
    digest ? `🧠 *Insight:*\n${digest}` : '',
  ].filter(l => l !== undefined).join('\n');
}
