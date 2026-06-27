/**
 * atlas-command.ts — Telegram Atlas Shifted commands (ADDITIVE, isolated).
 *
 * Reads live brief + concepts from the whitespace data dir on Oracle (or ATLAS API fallback).
 * Does not modify captures, cron, or the web UI — read-only except /atlas_track (same as web Add to radar).
 *
 * Radar (daily memory): /atlas_move /atlas_export /atlas_brief /atlas_track
 * WHITESPACE (one-shot): /atlas_scan
 * /atlas = move
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = process.env.WHITESPACE_DATA_DIR || '/home/ubuntu/whitespace/data';
const ATLAS_BASE = (process.env.ATLAS_PUBLIC_BASE || 'https://webhook.aideazz.xyz/whitespace').replace(/\/$/, '');

interface Move {
  angle: string;
  state: string;
  score: number;
  why: string;
  basis?: string;
  evidence?: string | null;
}

interface BriefVertical {
  vertical: string;
  move: Move;
  avoid: Array<{ angle: string; advertisers: number; why?: string }>;
}

interface Brief {
  snapshot_date: string;
  verticals: BriefVertical[];
  resilience?: string;
}

interface TrackedVertical {
  id: string;
  label: string;
  added_at?: string;
}

interface AtlasApiPayload {
  brief?: Brief;
  concepts?: Record<string, ConceptRecord>;
  tracked_verticals?: TrackedVertical[];
  snapshot_date?: string;
}

interface ConceptRecord {
  vertical: string;
  move: Move;
  concept?: {
    concept_name?: string;
    hook?: string;
    headline?: string;
    primary_text?: string;
    scene_concept?: string;
    cta?: string;
    emotion?: string;
  };
  grounding_evidence?: Array<{ angle: string; advertiser: string; excerpt: string; url: string }>;
  asset?: { image_file?: string };
  video?: { video_file?: string };
}

function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function loadJson<T>(file: string): T | null {
  try {
    const p = path.join(DATA_DIR, file);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

async function loadAtlasApi(): Promise<{
  brief: Brief | null;
  concepts: Record<string, ConceptRecord>;
  tracked: TrackedVertical[];
}> {
  try {
    const res = await fetch(`${ATLAS_BASE}/api/atlas`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { brief: null, concepts: {}, tracked: [] };
    const d = (await res.json()) as AtlasApiPayload;
    return { brief: d.brief ?? null, concepts: d.concepts ?? {}, tracked: d.tracked_verticals ?? [] };
  } catch {
    return { brief: null, concepts: {}, tracked: [] };
  }
}

async function loadAtlasData(): Promise<{
  brief: Brief | null;
  concepts: Record<string, ConceptRecord>;
  tracked: TrackedVertical[];
}> {
  const brief = loadJson<Brief>('brief.json');
  const concepts = loadJson<Record<string, ConceptRecord>>('concepts.json') ?? {};
  const tracked = loadJson<{ verticals: TrackedVertical[] }>('tracked-verticals.json')?.verticals ?? [];
  if (brief) return { brief, concepts, tracked };
  return loadAtlasApi();
}

function matchVertical(brief: Brief, query?: string): BriefVertical | null {
  const list = brief.verticals || [];
  if (!list.length) return null;
  if (!query?.trim()) {
    const enters = list.filter((v) => v.move.state === 'ENTER').sort((a, b) => b.move.score - a.move.score);
    if (enters.length) return enters[0]!;
    return [...list].sort((a, b) => b.move.score - a.move.score)[0]!;
  }
  const q = query.trim().toLowerCase();
  const qSlug = slug(q);
  return (
    list.find((v) => v.vertical === qSlug) ||
    list.find((v) => v.vertical.includes(qSlug)) ||
    list.find((v) => q.includes(v.vertical.replace(/_/g, ' '))) ||
    null
  );
}

function confidenceLabel(score: number): string {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

const STATE_EMOJI: Record<string, string> = { ENTER: '🟢', WATCH: '🟡', AVOID: '🔴', STABLE: '⚪' };

export function formatTodayMove(v: BriefVertical, brief: Brief, concept?: ConceptRecord): string {
  const m = v.move;
  const em = STATE_EMOJI[m.state] || '•';
  const lines = [
    `🎯 TODAY'S MOVE · ${brief.snapshot_date}`,
    '',
    `Vertical: ${v.vertical.replace(/_/g, ' ')}`,
    `Recommendation: ${em} ${m.state} · ${m.angle.replace(/_/g, ' ')}`,
    `Confidence: ${confidenceLabel(m.score)} (${m.score}/100)`,
    `Reason: ${m.why}`,
    '',
    `Action: Launch campaign test`,
  ];
  if (v.avoid?.length) {
    lines.push(`Avoid: ${v.avoid.map((a) => a.angle).join(', ')}`);
  }
  if (concept?.concept?.hook) {
    lines.push('', `Campaign hook: ${concept.concept.hook}`);
  }
  lines.push(
    '',
    `📊 Radar: ${ATLAS_BASE}/atlas.html`,
    `📋 Export: /atlas_export ${v.vertical}`,
    `📡 Track new vertical: /atlas_track your niche`,
    `🔍 One-shot discovery: /atlas_scan medicare advantage`,
  );
  if (concept?.asset?.image_file) {
    lines.push(`🖼 Visual: ${ATLAS_BASE}/${concept.asset.image_file}`);
  }
  return lines.join('\n').slice(0, 4096);
}

export function formatCampaignExport(v: BriefVertical, brief: Brief, concept?: ConceptRecord): string {
  const m = v.move;
  const c = concept?.concept || {};
  const audience = `US buyers searching "${v.vertical.replace(/_/g, ' ')}" — angle: ${m.angle.replace(/_/g, ' ')}`;
  const visual = concept?.asset?.image_file
    ? `${ATLAS_BASE}/${concept.asset.image_file}`
    : c.scene_concept || '(run concept pipeline for rendered asset)';
  const evidence = (concept?.grounding_evidence || [])
    .slice(0, 2)
    .map((e) => `• ${e.advertiser}: "${e.excerpt.slice(0, 120)}…"`)
    .join('\n');
  const lines = [
    `📦 ATLAS CAMPAIGN EXPORT · ${brief.snapshot_date}`,
    `Vertical: ${v.vertical}`,
    '',
    'Campaign:',
    c.concept_name || `${m.state} ${m.angle} test`,
    '',
    'Audience:',
    audience,
    '',
    'Hook:',
    c.hook || '(no concept yet — add to radar or wait for daily concept run)',
    '',
    'Headline:',
    c.headline || '—',
    '',
    'Primary text:',
    c.primary_text || '—',
    '',
    'Visual:',
    visual,
    '',
    'CTA:',
    c.cta || '—',
    '',
    'Landing angle:',
    `${m.state} ${m.angle} — ${m.why}`,
    '',
    'Why Atlas picked it:',
    m.why,
    m.evidence ? `Evidence: ${m.evidence}` : '',
    evidence ? `\nGrounded in live ads:\n${evidence}` : '',
    '',
    `Dashboard: ${ATLAS_BASE}/atlas.html#concept-${v.vertical}`,
  ];
  return lines.filter(Boolean).join('\n').slice(0, 4096);
}

export function formatFullBrief(brief: Brief, tracked: TrackedVertical[] = []): string {
  const lines = [`🌐 ATLAS DAILY BRIEF · ${brief.snapshot_date}`, ''];
  for (const v of brief.verticals || []) {
    const m = v.move;
    const em = STATE_EMOJI[m.state] || '•';
    lines.push(`${em} ${v.vertical.toUpperCase()}`);
    lines.push(`   MOVE → ${m.state} · ${m.angle} (${m.score}/100, ${confidenceLabel(m.score)})`);
    lines.push(`   ${m.why}`);
    if (v.avoid?.length) lines.push(`   avoid: ${v.avoid.map((a) => a.angle).join(', ')}`);
    lines.push('');
  }
  if (tracked.length) {
    lines.push('📡 Your tracked verticals (daily cron 9 AM Panama):');
    for (const t of tracked) lines.push(`   • ${t.label}`);
    lines.push('');
  }
  lines.push(`📊 Radar: ${ATLAS_BASE}/atlas.html`);
  lines.push(`🎯 One move: /atlas_move`);
  lines.push(`📡 Add vertical: /atlas_track medicare advantage`);
  lines.push(`🔍 WHITESPACE (one-shot): /atlas_scan`);
  return lines.join('\n').slice(0, 4096);
}

function parseArg(ctx: any): string {
  return (ctx.message?.text || '').replace(/^\/\S+\s*/, '').trim();
}

export async function runAtlasMove(ctx: any): Promise<void> {
  const arg = parseArg(ctx);
  const { brief, concepts } = await loadAtlasData();
  if (!brief?.verticals?.length) {
    await ctx.reply(
      'No Atlas brief yet — daily capture runs at 9 AM Panama.\n\nOne-shot: /atlas_scan medicare advantage\nAdd to radar: /atlas_track medicare advantage',
    );
    return;
  }
  const v = matchVertical(brief, arg);
  if (!v) {
    const names = brief.verticals.map((x) => x.vertical).join(', ');
    await ctx.reply(`Unknown vertical "${arg}".\n\nOn radar: ${names}\n\nTry: /atlas_move auto_insurance`);
    return;
  }
  await ctx.reply(formatTodayMove(v, brief, concepts[v.vertical]));
}

export async function runAtlasExport(ctx: any): Promise<void> {
  const arg = parseArg(ctx);
  const { brief, concepts } = await loadAtlasData();
  if (!brief?.verticals?.length) {
    await ctx.reply('No Atlas data yet.');
    return;
  }
  const v = matchVertical(brief, arg);
  if (!v) {
    await ctx.reply(`Usage: /atlas_export auto_insurance\n\nTracked: ${brief.verticals.map((x) => x.vertical).join(', ')}`);
    return;
  }
  await ctx.reply(formatCampaignExport(v, brief, concepts[v.vertical]));
}

export async function runAtlasBrief(ctx: any): Promise<void> {
  const { brief, tracked } = await loadAtlasData();
  if (!brief?.verticals?.length) {
    await ctx.reply('No brief yet — Atlas captures every morning at 9 AM Panama.');
    return;
  }
  await ctx.reply(formatFullBrief(brief, tracked));
}

export async function runAtlasScan(ctx: any): Promise<void> {
  const q = parseArg(ctx);
  if (!q) {
    await ctx.reply(
      [
        '🔍 WHITESPACE — one-shot angle discovery (no daily memory)',
        '',
        'Finds the open angle almost nobody is running yet — Meta + TikTok, ~90s in browser.',
        '',
        'Usage: /atlas_scan medicare advantage',
        '',
        `Open: ${ATLAS_BASE}/`,
        '',
        '📡 To track a market daily (ENTER/WATCH over time): /atlas_track',
      ].join('\n'),
    );
    return;
  }
  const url = `${ATLAS_BASE}/?q=${encodeURIComponent(q)}`;
  await ctx.reply(
    [
      `🔍 WHITESPACE · "${q}"`,
      '',
      'One-shot discovery — click Find the whitespace in browser:',
      url,
      '',
      '📡 Want daily radar memory + cron refresh?',
      `/atlas_track ${q}`,
    ].join('\n'),
  );
}

interface TrackEvent {
  stage?: string;
  message?: string;
  vertical_id?: string;
}

/** Stream /api/atlas/track SSE — same as web "Add to radar". */
async function consumeTrackSse(vertical: string, onStage: (stage: string, message: string) => Promise<void>): Promise<TrackEvent> {
  const url = `${ATLAS_BASE}/api/atlas/track?vertical=${encodeURIComponent(vertical)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(600_000) });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(res.status === 409 ? 'Another track capture is in progress — try again in a few minutes.' : err.slice(0, 200) || `HTTP ${res.status}`);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response stream');
  const dec = new TextDecoder();
  let buf = '';
  let last: TrackEvent = {};
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      try {
        const ev = JSON.parse(line.slice(5).trim()) as TrackEvent;
        last = { ...last, ...ev };
        if (ev.stage && ev.message) await onStage(ev.stage, ev.message);
        if (ev.stage === 'error') throw new Error(ev.message || 'track failed');
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
  if (last.stage !== 'done') throw new Error(last.message || 'track stream ended early');
  return last;
}

export async function runAtlasTrack(ctx: any): Promise<void> {
  const q = parseArg(ctx);
  if (!q) {
    await ctx.reply(
      [
        '📡 ADD TO RADAR — daily memory + automatic 9 AM Panama refresh',
        '',
        'Captures live ads → scores ENTER/WATCH → persists for tomorrow\'s cron.',
        '',
        'Usage: /atlas_track personal ai companions on the go',
        '',
        `Web: ${ATLAS_BASE}/atlas.html`,
        '',
        '🔍 One-shot only (no memory): /atlas_scan',
      ].join('\n'),
    );
    return;
  }

  const progress = await ctx.reply(`📡 Adding "${q}" to Atlas radar…\n\ncapture → classify → brief (~2–5 min)`);
  const chatId = ctx.chat?.id;
  const msgId = progress.message_id;
  let lastLine = 'starting…';

  const editProgress = async (stage: string, message: string) => {
    lastLine = `${stage}: ${message}`;
    if (!chatId || !msgId) return;
    const text = `📡 "${q}"\n\n${lastLine}`.slice(0, 4096);
    try {
      await ctx.telegram.editMessageText(chatId, msgId, undefined, text);
    } catch {
      /* rate limit or unchanged — ignore */
    }
  };

  try {
    const done = await consumeTrackSse(q, editProgress);
    const vid = done.vertical_id || slug(q);
    await ctx.reply(
      [
        `✅ On radar: ${vid.replace(/_/g, ' ')}`,
        '',
        '• Captured & scored today',
        '• Saved for daily cron (9 AM Panama)',
        '• ENTER/WATCH updates each morning',
        '',
        `🎯 Move: /atlas_move ${vid}`,
        `📊 Board: ${ATLAS_BASE}/atlas.html`,
      ].join('\n'),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await ctx.reply(`❌ Add to radar failed: ${msg}\n\nLast: ${lastLine}`);
  }
}
