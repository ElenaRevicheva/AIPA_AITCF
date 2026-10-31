/**
 * The two-card view — Elena's own CRM, reading her own database.
 *
 * Reads `daily_queue` only. It issues **no HubSpot calls of any kind**: not a
 * read, not a write. HubSpot remains the system of record and is entirely
 * unaffected by anything on this page; `hubspot_deal_id` is carried purely so a
 * card can deep-link to the record for the full history.
 *
 * Mounted at /queue/ rather than under /cto/, because /cto/ is deliberately
 * public — the one-click outreach links are opened from email clients that
 * cannot authenticate. This page shows the pipeline, so it sits behind the same
 * nginx basic auth as /ops/, same origin, browser-supplied credentials. That is
 * the pattern already documented for the ops dashboard: a static page cannot
 * hold a secret, so same-origin plus browser auth is the honest option.
 */
import fs from 'fs';
import path from 'path';
import type { Express, Request, Response } from 'express';
import { getQueue, setQueueStatus, getQueueCounts, getQueueItemById, type QueueStatus } from './daily-queue';
import { getRecordTimeline } from './record-timeline';
import { QUEUE_PAGE } from './queue-page';
import { getPoolConnection } from './database';

const ALLOWED: QueueStatus[] = ['new', 'working', 'done', 'skipped'];
const ESPALUZ_SNAPSHOT = path.resolve(__dirname, '..', 'data', 'espaluz-truth.json');

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function registerQueueRoutes(app: Express): void {
  // No '/queue' -> '/queue/' redirect here: express's default (non-strict)
  // routing treats both as the same path, so redirecting one to the other is an
  // infinite loop. nginx already does `location = /queue { return 301 /queue/; }`.

  app.get('/queue/', (_req: Request, res: Response) => {
    res.set('cache-control', 'no-store').type('html').send(QUEUE_PAGE);
  });

  app.get('/queue/api/today', async (_req: Request, res: Response) => {
    try {
      const [hiring, client, counts] = await Promise.all([
        getQueue('hiring', 25),
        getQueue('client', 50), // 30 Oct: lane = I Act TODAY client deals (28) — 25 cut 3 off
        getQueueCounts(),
      ]);
      res.set('cache-control', 'no-store').json({ hiring, client, counts });
    } catch (e) {
      console.error('[queue] today failed:', e);
      res.status(500).json({ error: (e as Error).message?.slice(0, 200) });
    }
  });

  // 29 Oct 2026: the EspaLuz lane. scripts/espaluz-truth-sync.py (hourly) writes this snapshot
  // from truth_people in espaluz_unified; this route only reads it. Age is returned so the page
  // can say when the numbers were last proven, and warn when the sync has gone quiet.
  app.get('/queue/api/espaluz', (_req: Request, res: Response) => {
    try {
      const snap = JSON.parse(fs.readFileSync(ESPALUZ_SNAPSHOT, 'utf8'));
      const ageMin = Math.round((Date.now() - Date.parse(snap.checked_at)) / 60000);
      res.set('cache-control', 'no-store').json({ ...snap, ageMin });
    } catch (e) {
      res.status(503).json({ error: 'EspaLuz snapshot not available', detail: (e as Error).message?.slice(0, 120) });
    }
  });

  // Record page data: history first, then the draft. The id is looked up server
  // side rather than taking the email as a query param -- a recipient address is
  // personal data and does not belong in a URL, a log line or a referrer header.
  app.get('/queue/api/record/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id || '');
    if (!/^[0-9A-Fa-f]{32}$/.test(id)) return res.status(400).json({ error: 'bad id' });
    try {
      const item = await getQueueItemById(id);
      if (!item) return res.status(404).json({ error: 'not found' });
      const timeline = await getRecordTimeline({
        queueId: item.id,
        dealId: item.hubspotDealId,
        // Client records carry the recipient in `company`; hiring records do not.
        email: item.lane === 'client' && item.company.includes('@') ? item.company : undefined,
      });
      return res.set('cache-control', 'no-store').json({ item, timeline });
    } catch (e) {
      console.error('[queue] record failed:', e);
      return res.status(500).json({ error: (e as Error).message?.slice(0, 200) });
    }
  });

  // 31 Oct 2026: download a kit file (the CV) — the PDF stays PRIVATE in HubSpot (her rule: CVs live on
  // the deal note). Two READ calls only: is this id on one of HER live deals (our DB), then a 5-minute
  // signed link from HubSpot. Nothing is written to HubSpot, nothing is stored here.
  app.get('/queue/api/file/:fileId', async (req: Request, res: Response) => {
    const fileId = String(req.params.fileId || '');
    if (!/^\d{6,20}$/.test(fileId)) return res.status(400).json({ error: 'bad id' });
    try {
      const c = await getPoolConnection();
      let known = 0;
      try {
        const r = await c.execute(
          `SELECT COUNT(*) AS n FROM daily_queue
            WHERE kit_notes IS NOT NULL AND DBMS_LOB.INSTR(kit_notes, :needle) > 0`,
          { needle: `"id":"${fileId}"` });
        known = Number(((r.rows as unknown[][]) || [[0]])[0]?.[0] || 0);
      } finally {
        await c.close();
      }
      if (!known) return res.status(404).json({ error: 'not a file on your live deals' });
      const s = await fetch(`https://api.hubapi.com/files/v3/files/${fileId}/signed-url?expirationSeconds=300`,
        { headers: { Authorization: `Bearer ${process.env.HUBSPOT_API_KEY}` } });
      const j = await s.json() as { url?: string };
      if (!s.ok || !j.url) return res.status(502).json({ error: `HubSpot ${s.status}` });
      return res.set('cache-control', 'no-store').json({ url: j.url });
    } catch (e) {
      console.error('[queue] file failed:', e);
      return res.status(500).json({ error: (e as Error).message?.slice(0, 200) });
    }
  });

  app.post('/queue/api/act', async (req: Request, res: Response) => {
    const { id, status } = (req.body || {}) as { id?: string; status?: string };
    if (!id || !/^[0-9A-Fa-f]{32}$/.test(id)) return res.status(400).json({ error: 'bad id' });
    if (!status || !ALLOWED.includes(status as QueueStatus)) return res.status(400).json({ error: 'bad status' });
    try {
      const ok = await setQueueStatus(id, status as QueueStatus);
      console.log(`[queue] ${id.slice(0, 8)} -> ${status} (${ok ? 'updated' : 'not found'})`);
      return res.json({ ok });
    } catch (e) {
      console.error('[queue] act failed:', e);
      return res.status(500).json({ error: (e as Error).message?.slice(0, 200) });
    }
  });

  console.log('[queue] routes registered at /queue/ (behind nginx basic auth)');
}

export const _esc = esc;
