/**
 * AWS Lambda entry — Sprint Briefing Agent.
 *
 * Deduplication: calls CTO AIPA server /sprint-briefing/dedup-check at start.
 * If today's briefing was already sent (Panama time), exits immediately.
 * After successful delivery, calls /sprint-briefing/dedup-mark to record the date.
 *
 * Override for testing: set env var SPRINT_BRIEFING_FORCE=1 to skip dedup check.
 *
 * Bundle: `npx esbuild src/lambda/sprint-briefing-aws.ts --bundle --platform=node --target=node20
 *   --outfile=dist-lambda/sprint/lambda-pkg/handler.js`
 */
import Groq from 'groq-sdk';
import { Anthropic } from '@anthropic-ai/sdk';
import { Octokit } from '@octokit/rest';
import * as https from 'https';
import { runSprintBriefing, deliverBriefingToTelegram } from '../sprint-briefing/run';

process.env.SPRINT_BRIEFING_SKIP_ORACLE = '1';

/** HTTPS GET helper — same pattern as knowledge-context.ts */
function httpsGet(url: string, secret: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Authorization: `Bearer ${secret}` } }, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve({}); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('dedup HTTP timeout')); });
  });
}

/** HTTPS POST helper (no body needed — just the signal) */
function httpsPost(url: string, secret: string): Promise<void> {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const req = https.request(
      { hostname: parsed.hostname, port: parsed.port || 443, path: parsed.pathname + parsed.search, method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Length': 0 } },
      (res) => { res.resume(); res.on('end', resolve); }
    );
    req.on('error', () => resolve()); // dedup-mark failure is non-fatal
    req.setTimeout(8000, () => { req.destroy(); resolve(); });
    req.end();
  });
}

export async function handler(): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const force = process.env.SPRINT_BRIEFING_FORCE === '1';
  const apiBase = (process.env.SPRINT_KNOWLEDGE_API_URL || '').replace(/\/sprint-knowledge.*$/, '');
  const secret = (process.env.OUTREACH_SECRET || '').trim();

  // ── Deduplication guard ──────────────────────────────────────────────────
  if (!force && apiBase && secret) {
    try {
      const checkUrl = `${apiBase}/sprint-briefing/dedup-check`;
      console.log('[dedup] checking:', checkUrl);
      const json = await httpsGet(checkUrl, secret) as { ok?: boolean; alreadySent?: boolean; date?: string; lastSent?: string };
      if (json.ok && json.alreadySent) {
        console.log(`[dedup] briefing already sent today (${json.date}) — skipping`);
        return { ok: true, skipped: true };
      }
      console.log(`[dedup] not yet sent today (${json.date}), lastSent=${json.lastSent || 'never'} — proceeding`);
    } catch (e: unknown) {
      // Dedup check failure is non-fatal — proceed with briefing
      console.warn('[dedup] check failed (non-fatal):', String((e as Error)?.message || e));
    }
  } else if (force) {
    console.log('[dedup] SPRINT_BRIEFING_FORCE=1 — bypassing dedup');
  } else {
    console.warn('[dedup] SPRINT_KNOWLEDGE_API_URL or OUTREACH_SECRET not set — dedup skipped');
  }

  // ── Run briefing ─────────────────────────────────────────────────────────
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || process.env.GH_TOKEN,
    });
    const repos = (process.env.SPRINT_BRIEFING_GITHUB_REPOS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const result = await runSprintBriefing({ groq, anthropic, octokit }, { githubRepos: repos });
    await deliverBriefingToTelegram(result);

    // ── Mark as sent ─────────────────────────────────────────────────────
    if (!force && apiBase && secret) {
      try {
        await httpsPost(`${apiBase}/sprint-briefing/dedup-mark`, secret);
        console.log('[dedup] marked as sent');
      } catch (e: unknown) {
        console.warn('[dedup] mark failed (non-fatal):', String((e as Error)?.message || e));
      }
    }

    return { ok: true };
  } catch (e: unknown) {
    console.error(e);
    return { ok: false, error: String((e as Error)?.message || e) };
  }
}
