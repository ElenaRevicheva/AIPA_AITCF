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
import type { Express, Request, Response } from 'express';
import { getQueue, setQueueStatus, getQueueCounts, type QueueStatus } from './daily-queue';
import { QUEUE_PAGE } from './queue-page';

const ALLOWED: QueueStatus[] = ['new', 'working', 'done', 'skipped'];

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
        getQueue('client', 25),
        getQueueCounts(),
      ]);
      res.set('cache-control', 'no-store').json({ hiring, client, counts });
    } catch (e) {
      console.error('[queue] today failed:', e);
      res.status(500).json({ error: (e as Error).message?.slice(0, 200) });
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
