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

/**
 * Lead visibility: every audit is a self-qualified lead (someone just told us
 * their website and cares about its AI visibility). Log it to stdout (pm2
 * history) and ping Elena's Telegram — same channel + env vars the Lead
 * Concierge already uses (TELEGRAM_BOT_TOKEN + CONCIERGE_TG_CHAT), so leads
 * land where she already looks. Own properties are logged but NOT pinged, so
 * self-tests and the docs-page demo don't page her phone.
 */
const OWN_AUDIT_DOMAINS = /(^|\.)aideazz\.xyz$|(^|\.)atuona\.xyz$|^localhost$|^127\.0\.0\.1$/i;

function isOwnProperty(url: string): boolean {
  try {
    return OWN_AUDIT_DOMAINS.test(new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname);
  } catch {
    return false;
  }
}

function logAuditLead(params: {
  url: string;
  score: number;
  grade: string;
  key: string;
  ip: string | undefined;
  referer: string | undefined;
}): void {
  const { url, score, grade, key, ip, referer } = params;
  const keyLabel = key === DEMO_API_KEY ? 'demo' : `key:${key.slice(0, 8)}…`;
  const own = isOwnProperty(url);
  // Structured stdout line — grep-able in pm2 logs: grep visibility-lead
  console.log(
    `[visibility-lead] url=${url} score=${score} grade=${grade} key=${keyLabel} ip=${ip ?? '-'} referer=${referer ?? '-'}${own ? ' (own-property)' : ''}`,
  );
  if (own) return;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.CONCIERGE_TG_CHAT?.trim();
  if (!token || !chatId) {
    console.warn('[visibility-lead] TELEGRAM_BOT_TOKEN or CONCIERGE_TG_CHAT not set — lead logged to stdout only');
    return;
  }
  const text =
    `🔍 Visibility audit lead\n` +
    `${url} → ${score}/100 (${grade})\n` +
    `via ${keyLabel}${referer ? `, from ${referer}` : ''}\n` +
    `They just told you their site + their pain. Follow up: aideazz.xyz/api`;
  // Fire-and-forget: a Telegram hiccup must never fail or slow the audit response.
  fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4090), disable_web_page_preview: true }),
  })
    .then(async (r) => {
      if (!r.ok) console.error('[visibility-lead] TG send failed:', (await r.text()).slice(0, 200));
    })
    .catch((e) => console.error('[visibility-lead] TG send error:', e?.message ?? e));
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

  // Browser-friendly docs + try-it page at the same URL (the API itself is POST).
  // Without this, opening the endpoint on a phone shows Express's "Cannot GET".
  router.get('/v1/visibility', (_req, res) => {
    res.type('html').send(docsPage());
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
      logAuditLead({
        url: result.finalUrl || url,
        score: result.score,
        grade: result.grade,
        key,
        ip: req.ip ?? req.header('x-forwarded-for')?.split(',')[0]?.trim(),
        referer: req.header('referer') ?? undefined,
      });
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

/** Canonical public URL of the docs page (behind nginx). */
const PUBLIC_URL = 'https://webhook.aideazz.xyz/cto/v1/visibility';

/** FAQ content — rendered as question-H2 sections AND mirrored in FAQPage JSON-LD. */
const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'What does the AI Visibility Audit check?',
    a: 'It runs 34 evidence-backed checks in 4 weighted categories: AI crawler access (can GPTBot, ClaudeBot, PerplexityBot and Google-Extended even reach your pages?), structured data (GEO — can machines tell WHO you are and WHAT you offer?), answer-readiness (AEO — will an answer engine quote you?), and the technical foundation (HTTPS, speed, server-rendered content). Every check reports what it observed, not just a verdict.',
  },
  {
    q: 'Why does my beautiful React site score so low?',
    a: 'Most AI crawlers do not execute JavaScript. If your content only appears after the browser runs your bundle, GPTBot and PerplexityBot see an almost-empty shell. The audit detects this and tells you to server-render or prerender — usually the single highest-impact fix for a modern SPA.',
  },
  {
    q: 'How is this different from a classic SEO audit?',
    a: 'Classic SEO optimizes for ten blue links. This audit optimizes for being cited by answer engines: robots access for AI-specific crawlers, llms.txt, JSON-LD entity identity (including sameAs links to your profiles), question-shaped headings, and extractable facts that language models can lift verbatim.',
  },
  {
    q: 'Do you scrape or use paid data providers?',
    a: 'No. Audits are direct page reads only: your page, robots.txt, llms.txt and sitemap.xml. No SerpAPI, no Bright Data, no API keys to third parties — which is why the demo tier can stay free.',
  },
];

/** Single-file docs + try-it widget served at GET /v1/visibility. */
function docsPage(): string {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://aideazz.xyz/#org',
        name: 'AIdeazz',
        url: 'https://aideazz.xyz',
        logo: 'https://aideazz.xyz/favicon.ico',
        sameAs: ['https://github.com/ElenaRevicheva', 'https://www.linkedin.com/in/elena-revicheva/'],
      },
      {
        '@type': 'WebAPI',
        name: 'AIdeazz Lab AI Visibility Audit API',
        url: PUBLIC_URL,
        documentation: PUBLIC_URL,
        provider: { '@id': 'https://aideazz.xyz/#org' },
        description:
          'AEO/GEO/Tech-SEO audit API: 34 checks answering whether ChatGPT, Perplexity, Claude and Gemini can find, understand and quote a website.',
      },
      {
        '@type': 'FAQPage',
        mainEntity: FAQ.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
        dateModified: '2026-07-17',
      },
    ],
  };
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI Visibility Audit — is your site quotable by ChatGPT? | AIdeazz Lab</title>
<meta name="description" content="Free AEO/GEO/Tech-SEO audit: 34 checks that tell you if ChatGPT, Perplexity, Claude and Gemini can find, understand and quote your website — with fixes.">
<link rel="canonical" href="${PUBLIC_URL}">
<meta property="og:title" content="AI Visibility Audit — is your site quotable by ChatGPT?">
<meta property="og:description" content="Free audit of AI crawler access, structured data (GEO), answer-readiness (AEO) and tech SEO. Direct page reads, no keys, instant grade.">
<meta property="og:image" content="https://aideazz.xyz/favicon.ico">
<meta property="og:type" content="website">
<meta property="og:url" content="${PUBLIC_URL}">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>
  :root { --bg:#0d1117; --card:#161b22; --line:#30363d; --text:#e6edf3; --dim:#8b949e; --accent:#58a6ff; --ok:#3fb950; --warn:#d29922; --bad:#f85149; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:16px/1.6 -apple-system,'Segoe UI',Roboto,sans-serif; }
  .wrap { max-width:720px; margin:0 auto; padding:24px 16px 64px; }
  h1 { font-size:1.5rem; margin:.2em 0; }
  .sub { color:var(--dim); margin-bottom:24px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px; margin:16px 0; }
  code, pre { background:#010409; border:1px solid var(--line); border-radius:6px; font-family:ui-monospace,Menlo,monospace; font-size:.85em; }
  code { padding:2px 6px; } pre { padding:12px; overflow-x:auto; }
  .row { display:flex; gap:8px; }
  input[type=url] { flex:1; min-width:0; padding:12px; border-radius:8px; border:1px solid var(--line); background:#010409; color:var(--text); font-size:1rem; }
  button { padding:12px 20px; border:0; border-radius:8px; background:var(--accent); color:#04121f; font-weight:700; font-size:1rem; cursor:pointer; }
  button:disabled { opacity:.5; }
  .score { display:flex; align-items:center; gap:16px; margin:12px 0; }
  .grade { font-size:2.4rem; font-weight:800; }
  .bar { height:8px; border-radius:4px; background:#010409; overflow:hidden; flex:1; }
  .bar i { display:block; height:100%; }
  .cat { display:flex; justify-content:space-between; padding:6px 0; border-top:1px solid var(--line); }
  .fixes li { margin:8px 0; }
  .dim { color:var(--dim); } .hide { display:none; }
  .engines { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0; }
  .chip { display:flex; align-items:center; gap:6px; padding:6px 10px; border:1px solid var(--line); border-radius:20px; font-size:.85rem; background:#010409; }
  .chip b { font-weight:600; }
  details.checks { margin-top:12px; }
  details.checks summary { cursor:pointer; color:var(--accent); font-weight:600; }
  .chk { padding:8px 0; border-top:1px solid var(--line); font-size:.9rem; }
  .chk .st { font-weight:700; margin-right:6px; }
  .chk .d { color:var(--dim); display:block; }
  .chk .fx { color:var(--accent); display:block; margin-top:2px; }
</style>
</head>
<body><div class="wrap">
  <header>
    <h1>AIdeazz Lab — AI Visibility Audit</h1>
    <p class="sub">Can ChatGPT, Perplexity, Claude and Gemini find you, understand you, and quote you? One call audits any URL across 4 weighted categories: AI crawler access, structured data (GEO), answer-readiness (AEO), technical foundation. Engine v${ENGINE_VERSION}.</p>
  </header>
  <main>
  <section class="card">
    <strong>Try it now</strong> — free demo key, ${DEMO_LIMIT_PER_HOUR} audits/hour.
    <div class="row" style="margin-top:12px">
      <input id="url" type="url" placeholder="https://your-site.com" inputmode="url">
      <button id="go">Audit</button>
    </div>
    <div id="out" class="hide" style="margin-top:16px">
      <div class="score"><span class="grade" id="grade"></span><div class="bar"><i id="fill"></i></div><strong id="num"></strong></div>
      <p id="verdict"></p>
      <div class="engines" id="engines"></div>
      <div id="cats"></div>
      <div id="fixwrap" class="hide"><strong>Do these first</strong><ol class="fixes" id="fixes"></ol></div>
      <details class="checks"><summary id="chksum">All checks</summary><div id="chks"></div></details>
      <p class="dim" style="margin-top:12px">Shareable link: <a id="share" href="" style="color:var(--accent); word-break:break-all"></a></p>
    </div>
    <p id="err" class="hide" style="color:var(--bad)"></p>
  </section>

  <section class="card">
    <h2 style="font-size:1.1rem; margin:.2em 0">API</h2>
    <pre>curl -X POST ${PUBLIC_URL} \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${DEMO_API_KEY}" \\
  -d '{"url":"https://your-site.com"}'</pre>
    <p class="dim">Returns score (0–100), grade, per-engine crawlability (GPTBot, ClaudeBot, PerplexityBot, Google-Extended…), 4 category scores, 34 evidence-backed checks and a prioritized fix list. Production keys (${KEY_LIMIT_PER_HOUR}/hour): <a href="mailto:aipa@aideazz.xyz" style="color:var(--accent)">aipa@aideazz.xyz</a></p>
    <ul class="dim" style="margin:8px 0 0; padding-left:20px">
      <li>Direct page reads only — no scraping providers, no third-party keys</li>
      <li>Bot-blocked and JS-only sites get a scored diagnosis, not an error</li>
      <li>Shareable audit links: <code>?url=https://your-site.com</code></li>
    </ul>
  </section>

  <section class="card" id="faq">
    <h2 style="font-size:1.1rem; margin:.2em 0">FAQ</h2>
    ${FAQ.map(
      ({ q, a }) => `<article><h3 style="font-size:1rem; margin:14px 0 4px">${q}</h3><p class="dim" style="margin:0">${a}</p></article>`,
    ).join('\n    ')}
  </section>
  </main>
  <footer class="dim" style="margin-top:24px; font-size:.85rem">
    Built by <a href="https://aideazz.xyz" style="color:var(--accent)">AIdeazz</a> — AI Personal Assistants that ship. <time datetime="2026-07-17">Updated July 17, 2026</time>.
  </footer>

<script>
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
$('go').onclick = run;
$('url').addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
async function run() {
  const url = $('url').value.trim();
  if (!url) return;
  $('go').disabled = true; $('go').textContent = 'Auditing…';
  $('err').classList.add('hide'); $('out').classList.add('hide');
  try {
    const r = await fetch(location.pathname, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': '${DEMO_API_KEY}' }, body: JSON.stringify({ url }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || d.error || ('HTTP ' + r.status));
    $('grade').textContent = d.grade;
    $('grade').style.color = d.score >= 70 ? 'var(--ok)' : d.score >= 40 ? 'var(--warn)' : 'var(--bad)';
    $('fill').style.width = d.score + '%';
    $('fill').style.background = $('grade').style.color;
    $('num').textContent = d.score + '/100';
    $('verdict').textContent = d.verdict;
    const eIcon = { yes: ['✓', 'var(--ok)'], blocked: ['✕', 'var(--bad)'], unknown: ['?', 'var(--warn)'] };
    $('engines').innerHTML = (d.aiEngines || []).map((e) => {
      const [ic, col] = eIcon[e.crawlable] || eIcon.unknown;
      return '<span class="chip"><b style="color:' + col + '">' + ic + '</b>' + esc(e.engine) + '</span>';
    }).join('');
    $('cats').innerHTML = d.categories.map((c) =>
      '<div class="cat"><span>' + esc(c.label) + '</span><span><strong>' + c.score + '</strong><span class="dim">/100 · ' + c.passed + '/' + c.total + ' passed</span></span></div>').join('');
    const fx = d.topFixes || [];
    $('fixwrap').classList.toggle('hide', fx.length === 0);
    $('fixes').innerHTML = fx.map((f) => '<li>' + esc(f) + '</li>').join('');
    const cIcon = { pass: ['✓', 'var(--ok)'], warn: ['!', 'var(--warn)'], fail: ['✕', 'var(--bad)'] };
    const checks = d.checks || [];
    $('chksum').textContent = 'All ' + checks.length + ' checks (' + checks.filter((c) => c.status === 'pass').length + ' passed)';
    $('chks').innerHTML = checks.map((c) => {
      const [ic, col] = cIcon[c.status];
      return '<div class="chk"><span class="st" style="color:' + col + '">' + ic + '</span>' + esc(c.label) +
        '<span class="d">' + esc(c.detail) + '</span>' + (c.fix ? '<span class="fx">→ ' + esc(c.fix) + '</span>' : '') + '</div>';
    }).join('');
    const share = location.origin + location.pathname + '?url=' + encodeURIComponent(url);
    $('share').textContent = share; $('share').href = share;
    history.replaceState(null, '', '?url=' + encodeURIComponent(url));
    $('out').classList.remove('hide');
  } catch (e) {
    $('err').textContent = e.message; $('err').classList.remove('hide');
  }
  $('go').disabled = false; $('go').textContent = 'Audit';
}
// Shareable audit links: /cto/v1/visibility?url=https://site.com auto-runs on load.
const preset = new URLSearchParams(location.search).get('url');
if (preset) { $('url').value = preset; run(); }
</script>
</div></body></html>`;
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
