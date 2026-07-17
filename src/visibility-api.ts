/**
 * visibility-api.ts — HTTP surface for the AEO/GEO/Tech-SEO audit engine
 *
 * The public face of the AIdeazz Lab API:
 *   POST /v1/visibility  { url }  → full AuditResult   (X-API-Key required)
 *   GET  /v1/health               → { ok, engineVersion }
 *
 * Design constraints:
 *  - CORS open: the docs page on aideazz.xyz (4everland static hosting) calls this
 *    cross-origin from the browser's try-it widget.
 *  - Demo-friendly auth: keys come from VISIBILITY_API_KEYS (comma-separated) with a
 *    published demo key so the docs page works out of the box; per-key rate limits
 *    keep the free tier from being farmed.
 *  - Zero paid upstreams: audits are direct page fetches only (see visibility-audit.ts).
 *
 * Runs two ways:
 *  - standalone:  `node dist/visibility-api.js` (local review / own port)
 *  - mounted:     `app.use(visibilityRouter())` from cto-aipa.ts at deploy time
 */

import express, { Router, Request, Response } from 'express';
import { runVisibilityAudit, AuditFetchError, ENGINE_VERSION } from './visibility-audit';

/** Published demo key — intentionally public, printed on the docs page. */
export const DEMO_API_KEY = 'aidz_demo_visibility_2026';

const DEMO_LIMIT_PER_HOUR = 20;
const KEY_LIMIT_PER_HOUR = 200;

function configuredKeys(): Set<string> {
  const extra = (process.env.VISIBILITY_API_KEYS ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  return new Set([DEMO_API_KEY, ...extra]);
}

/** Sliding-hour request counter per API key. In-memory is fine: limits are per-process courtesy caps, not billing. */
const usage = new Map<string, number[]>();

function underLimit(key: string): boolean {
  const now = Date.now();
  const cutoff = now - 3_600_000;
  const stamps = (usage.get(key) ?? []).filter((t) => t > cutoff);
  const limit = key === DEMO_API_KEY ? DEMO_LIMIT_PER_HOUR : KEY_LIMIT_PER_HOUR;
  if (stamps.length >= limit) {
    usage.set(key, stamps);
    return false;
  }
  stamps.push(now);
  usage.set(key, stamps);
  return true;
}

export function visibilityRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '10kb' }));

  // CORS — the docs page calls this from the browser.
  router.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    next();
  });
  router.options('/v1/visibility', (_req, res) => res.sendStatus(204));

  router.get('/v1/health', (_req, res) => {
    res.json({ ok: true, service: 'aideazz-lab-visibility-api', engineVersion: ENGINE_VERSION });
  });

  router.post('/v1/visibility', async (req: Request, res: Response) => {
    const key = req.header('X-API-Key') ?? '';
    if (!configuredKeys().has(key)) {
      return res.status(401).json({
        error: 'invalid_api_key',
        message: `Missing or invalid X-API-Key. Use the demo key "${DEMO_API_KEY}" to try the API, or contact aipa@aideazz.xyz for a production key.`,
      });
    }
    if (!underLimit(key)) {
      return res.status(429).json({
        error: 'rate_limited',
        message:
          key === DEMO_API_KEY
            ? `Demo key is limited to ${DEMO_LIMIT_PER_HOUR} audits/hour. For a production key: aipa@aideazz.xyz`
            : `Rate limit of ${KEY_LIMIT_PER_HOUR} audits/hour reached.`,
      });
    }

    const url = typeof req.body?.url === 'string' ? req.body.url : '';
    if (!url) {
      return res.status(400).json({
        error: 'missing_url',
        message: 'Body must be JSON: { "url": "https://example.com" }',
      });
    }

    try {
      const result = await runVisibilityAudit(url);
      return res.json(result);
    } catch (err) {
      if (err instanceof AuditFetchError) {
        return res.status(422).json({ error: 'unfetchable_url', message: err.message });
      }
      if (err instanceof TypeError) {
        return res.status(400).json({ error: 'invalid_url', message: `"${url}" is not a valid URL.` });
      }
      console.error('[visibility-api] audit crashed:', err);
      return res.status(500).json({ error: 'audit_failed', message: 'Internal error running the audit.' });
    }
  });

  return router;
}

export function startVisibilityServer(port: number): void {
  const app = express();
  app.use(visibilityRouter());
  app.listen(port, () => {
    console.log(`[visibility-api] AIdeazz Lab Visibility API listening on :${port} (engine ${ENGINE_VERSION})`);
    console.log(`[visibility-api] try: curl -X POST http://localhost:${port}/v1/visibility -H "Content-Type: application/json" -H "X-API-Key: ${DEMO_API_KEY}" -d "{\\"url\\":\\"https://aideazz.xyz\\"}"`);
  });
}

if (require.main === module) {
  startVisibilityServer(Number(process.env.VISIBILITY_PORT ?? 8098));
}
