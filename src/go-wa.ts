/**
 * GET /go/wa — WhatsApp click redirect + Atlas performance ledger (wa_clicks).
 * Public sidecar (same pattern as GA4 sync → performance-event); no Atlas pipeline changes.
 */
import type { Express, Request, Response } from 'express';
import { atlasConceptFromUtm } from './atlas-lead-sync.js';

const DEFAULT_PHONE = '50766623757';
const GO_WA_BASE = (process.env.CTO_AIPA_PUBLIC_URL || 'https://webhook.aideazz.xyz/cto').replace(/\/$/, '');

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
  return `${base}?text=${encodeURIComponent(text.slice(0, 500))}`;
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
  if (params.text?.trim()) q.set('text', params.text.trim().slice(0, 500));
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
}
