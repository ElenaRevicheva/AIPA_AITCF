/**
 * GET /go/wa — WhatsApp click redirect + Atlas performance ledger (wa_clicks).
 * GET /go/outreach/:slug — Manual Prospect Play (slug-only, HubSpot-safe emojis).
 */
import type { Express, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { atlasConceptFromUtm } from './atlas-lead-sync.js';

const DEFAULT_PHONE = '50766623757';
const GO_WA_BASE = (process.env.CTO_AIPA_PUBLIC_URL || 'https://webhook.aideazz.xyz/cto').replace(/\/$/, '');
const REPO_ROOT = process.env.CTO_AIPA_ROOT || process.cwd();
const OUTREACH_REGISTRY = path.join(REPO_ROOT, 'docs/selling/outreach-registry.json');

const goWaHits = new Map<string, number[]>();
const GO_WA_WINDOW_MS = 15 * 60 * 1000;
const GO_WA_MAX = Number(process.env.GO_WA_MAX_PER_WINDOW ?? 60);

function allowedPhones(): Set<string> {
  const extra =
    process.env.GO_WA_PHONES?.split(',')
      .map(s => s.replace(/\D/g, ''))
      .filter(Boolean) ?? [];
  return new Set([DEFAULT_PHONE, '50761666716', ...extra]);
}

export function normalizeWaPhone(raw: string | undefined): string {
  const digits = (raw || DEFAULT_PHONE).replace(/\D/g, '');
  const allowed = allowedPhones();
  if (allowed.has(digits)) return digits;
  return DEFAULT_PHONE;
}

export function buildWaMeUrl(phone: string, text?: string): string {
  const base = `https://wa.me/${phone}`;
  if (!text?.trim()) return base;
  const safe = [...text.trim()].slice(0, 2000).join('');
  return `${base}?text=${encodeURIComponent(safe)}`;
}

/**
 * Outreach prefill — NEVER wa.me when text contains emojis.
 * wa.me server-side redirect replaces 4-byte UTF-8 with U+FFFD (�) on desktop/Web.
 * @see https://stackoverflow.com/questions/66954605
 */
export function buildWhatsAppPrefillUrl(phone: string, text: string, opts?: { web?: boolean }): string {
  const digits = phone.replace(/\D/g, '');
  const safe = [...text.trim()].slice(0, 2000).join('');
  const encoded = encodeURIComponent(safe);
  const useWeb = opts?.web ?? true;
  if (useWeb) {
    return `https://web.whatsapp.com/send?phone=${digits}&text=${encoded}`;
  }
  return `https://api.whatsapp.com/send?phone=${digits}&text=${encoded}`;
}

function outreachBridgeHtml(phone: string, text: string): string {
  const payload = JSON.stringify({ phone, text }).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Abriendo WhatsApp…</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#111}
a{color:#25D366}</style>
</head><body>
<p>Abriendo WhatsApp con el mensaje listo…</p>
<p>Si no abre automáticamente, <a id="fallback" href="#">haz clic aquí</a>.</p>
<script>
(function(){
  var d=${payload};
  var mobile=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  var base=mobile?'https://api.whatsapp.com/send':'https://web.whatsapp.com/send';
  var url=base+'?phone='+d.phone+'&text='+encodeURIComponent(d.text);
  document.getElementById('fallback').href=url;
  location.replace(url);
})();
</script>
</body></html>`;
}

/** ASCII-only redirect for HubSpot manual-outreach notes (legacy b64 — prefer slug URLs). */
export function buildOutreachWaUrl(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, '');
  const safe = [...text.trim()].slice(0, 2000).join('');
  const b64 = Buffer.from(safe, 'utf8').toString('base64url');
  return `${GO_WA_BASE}/go/outreach?to=${digits}&b64=${b64}`;
}

export function buildOutreachSlugUrl(slug: string): string {
  const safe = slug.replace(/[^a-z0-9-]/gi, '');
  return `${GO_WA_BASE}/go/outreach/${safe}`;
}

function loadOutreachBySlug(slug: string): { phone: string; text: string } | null {
  try {
    const reg = JSON.parse(fs.readFileSync(OUTREACH_REGISTRY, 'utf8')) as Record<
      string,
      { phone?: string; draft?: string }
    >;
    const entry = reg[slug];
    if (!entry?.phone || !entry?.draft) return null;
    const draftPath = path.join(REPO_ROOT, entry.draft);
    const text = fs.readFileSync(draftPath, 'utf8').trim();
    const phone = entry.phone.replace(/\D/g, '');
    if (!/^507\d{8}$/.test(phone) || !text) return null;
    return { phone, text };
  } catch (e) {
    console.warn('[go/outreach] registry read failed:', (e as Error).message?.slice(0, 80));
    return null;
  }
}

/** Build tracked redirect URL for Atlas-tagged EspaLuz CTAs (browser-safe). */
export function buildGoWaUrl(params: {
  to?: string;
  text?: string;
  utm_campaign: string;
  utm_term?: string | null;
  utm_content?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
}): string {
  const q = new URLSearchParams();
  q.set('to', normalizeWaPhone(params.to));
  if (params.text?.trim()) q.set('text', [...params.text.trim()].slice(0, 2000).join(''));
  q.set('utm_campaign', params.utm_campaign);
  if (params.utm_term) q.set('utm_term', params.utm_term);
  if (params.utm_content) q.set('utm_content', params.utm_content);
  if (params.utm_source) q.set('utm_source', params.utm_source);
  if (params.utm_medium) q.set('utm_medium', params.utm_medium);
  return `${GO_WA_BASE}/go/wa?${q}`;
}

function allowGoWaRate(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - GO_WA_WINDOW_MS;
  const prev = goWaHits.get(ip) ?? [];
  const kept = prev.filter(t => t > windowStart);
  if (kept.length >= GO_WA_MAX) return false;
  kept.push(now);
  goWaHits.set(ip, kept);
  return true;
}

async function recordWaClick(params: {
  utm_campaign: string;
  utm_term?: string | null;
  utm_content?: string | null;
  clientIp?: string;
}): Promise<void> {
  if (process.env.GO_WA_TRACKING_ENABLED === 'false') return;
  const parsed = atlasConceptFromUtm(params.utm_campaign, params.utm_term, params.utm_content);
  if (!parsed) return;

  const day = new Date().toISOString().slice(0, 10);
  const { saveAtlasPerformanceEvent, saveAgentOutcome } = await import('./database.js');
  const id = await saveAtlasPerformanceEvent({
    concept_id: parsed.concept_id,
    vertical: parsed.vertical,
    ...(parsed.angle_id ? { angle_id: parsed.angle_id } : {}),
    source: 'wa_redirect',
    metrics: { wa_clicks: 1 },
    period_start: day,
    period_end: day,
    notes: params.clientIp ? `go/wa|${params.clientIp.slice(0, 48)}` : 'go/wa',
  });
  if (id) {
    await saveAgentOutcome('atlas', 'wa_click', { concept_id: parsed.concept_id, vertical: parsed.vertical }, 'verified_delivered', {
      event_id: id,
    });
    console.log(`[go/wa] wa_clicks +1 → ${parsed.concept_id}`);
  }
}

export function registerGoWaRoutes(app: Express, getClientIp: (req: Request) => string): void {
  app.get('/go/wa', (req: Request, res: Response) => {
    const phone = normalizeWaPhone(typeof req.query.to === 'string' ? req.query.to : undefined);
    const text = typeof req.query.text === 'string' ? req.query.text : undefined;
    const utm_campaign = typeof req.query.utm_campaign === 'string' ? req.query.utm_campaign.trim() : '';
    const utm_term = typeof req.query.utm_term === 'string' ? req.query.utm_term : undefined;
    const utm_content = typeof req.query.utm_content === 'string' ? req.query.utm_content : undefined;
    const dest = buildWaMeUrl(phone, text);

    if (utm_campaign.startsWith('atlas_')) {
      const ip = getClientIp(req);
      if (!allowGoWaRate(ip)) {
        res.status(429).send('Too many requests');
        return;
      }
      setImmediate(() => {
        recordWaClick({
          utm_campaign,
          utm_term: utm_term ?? null,
          utm_content: utm_content ?? null,
          clientIp: ip,
        }).catch(e => console.error('[go/wa] ledger error:', e));
      });
    }

    res.redirect(302, dest);
  });

  /** Manual Prospect Play — slug URL (preferred): zero query string, HubSpot cannot break emojis. */
  app.get('/go/outreach/:slug', (req: Request, res: Response) => {
    const ip = getClientIp(req);
    if (!allowGoWaRate(ip)) {
      res.status(429).send('Too many requests');
      return;
    }
    const slug = String(req.params.slug || '').replace(/[^a-z0-9-]/gi, '');
    const hit = loadOutreachBySlug(slug);
    if (!hit) {
      res.status(404).send('Unknown outreach slug');
      return;
    }
    // HTML bridge → web.whatsapp.com (desktop) or api.whatsapp.com (mobile).
    // Never 302 to wa.me — that redirect corrupts emojis (�).
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(outreachBridgeHtml(hit.phone, hit.text));
  });

  /** Legacy b64 fallback (HubSpot may mangle &amp;b64= — use slug URLs instead). */
  app.get('/go/outreach', (req: Request, res: Response) => {
    const ip = getClientIp(req);
    if (!allowGoWaRate(ip)) {
      res.status(429).send('Too many requests');
      return;
    }
    const raw = typeof req.query.to === 'string' ? req.query.to : '';
    const digits = raw.replace(/\D/g, '');
    if (!/^507\d{8}$/.test(digits)) {
      res.status(400).send('Invalid phone (expected 507xxxxxxxx)');
      return;
    }
    let text = '';
    const b64Raw =
      (typeof req.query.b64 === 'string' && req.query.b64.trim()) ||
      (typeof req.query['amp;b64'] === 'string' && req.query['amp;b64'].trim()) ||
      '';
    if (b64Raw) {
      try {
        text = Buffer.from(b64Raw.trim(), 'base64url').toString('utf8');
      } catch {
        res.status(400).send('Invalid b64');
        return;
      }
    } else if (typeof req.query.text === 'string') {
      text = req.query.text;
    } else {
      res.status(400).send('Missing message (b64 or text)');
      return;
    }
    if (!text.trim()) {
      res.status(400).send('Empty message');
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(outreachBridgeHtml(digits, text));
  });
}
