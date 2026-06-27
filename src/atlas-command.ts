/**
 * atlas-command.ts — Telegram Atlas Shifted commands (ADDITIVE, isolated).
 *
 * Reads live brief + concepts from the whitespace data dir on Oracle (or ATLAS API fallback).
 * Does not modify captures, cron, or the web UI — read-only fleet integration.
 *
 * Commands: /atlas_move /atlas_export /atlas_brief /atlas_scan (/atlas = move)
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

async function loadAtlasApi(): Promise<{ brief: Brief | null; concepts: Record<string, ConceptRecord> }> {
  try {
    const res = await fetch(`${ATLAS_BASE}/api/atlas`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { brief: null, concepts: {} };
    const d = (await res.json()) as { brief?: Brief; concepts?: Record<string, ConceptRecord> };
    return { brief: d.brief ?? null, concepts: d.concepts ?? {} };
  } catch {
    return { brief: null, concepts: {} };
  }
}

async function loadAtlasData(): Promise<{ brief: Brief | null; concepts: Record<string, ConceptRecord> }> {
  const brief = loadJson<Brief>('brief.json');
  const concepts = loadJson<Record<string, ConceptRecord>>('concepts.json') ?? {};
  if (brief) return { brief, concepts };
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
    c.hook || '(no concept yet — /atlas_scan then wait for daily concept run)',
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

export function formatFullBrief(brief: Brief): string {
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
  lines.push(`📊 ${ATLAS_BASE}/atlas.html`);
  lines.push(`🎯 One move: /atlas_move`);
  return lines.join('\n').slice(0, 4096);
}

function parseArg(ctx: any): string {
  return (ctx.message?.text || '').replace(/^\/\S+\s*/, '').trim();
}

export async function runAtlasMove(ctx: any): Promise<void> {
  const arg = parseArg(ctx);
  const { brief, concepts } = await loadAtlasData();
  if (!brief?.verticals?.length) {
    await ctx.reply('No Atlas brief yet — daily capture runs at 9 AM Panama.\n\nLive scan: /atlas_scan medicare advantage');
    return;
  }
  const v = matchVertical(brief, arg);
  if (!v) {
    const names = brief.verticals.map((x) => x.vertical).join(', ');
    await ctx.reply(`Unknown vertical "${arg}".\n\nTracked: ${names}\n\nTry: /atlas_move auto_insurance`);
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
  const { brief } = await loadAtlasData();
  if (!brief?.verticals?.length) {
    await ctx.reply('No brief yet — Atlas captures every morning at 9 AM Panama.');
    return;
  }
  await ctx.reply(formatFullBrief(brief));
}

export async function runAtlasScan(ctx: any): Promise<void> {
  const q = parseArg(ctx);
  if (!q) {
    await ctx.reply(
      `🔍 Atlas whitespace finder — type any vertical for a live battle plan (~90s in browser).\n\nUsage: /atlas_scan medicare advantage\n\nOpens: ${ATLAS_BASE}/?q=your+vertical`,
    );
    return;
  }
  const url = `${ATLAS_BASE}/?q=${encodeURIComponent(q)}`;
  await ctx.reply(
    `🔍 Live scan ready for "${q}"\n\nOpen the finder and click Find the whitespace:\n${url}\n\nTo add to daily radar: open atlas.html → Add to radar`,
  );
}
