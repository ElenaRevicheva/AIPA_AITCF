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
/** GitHub raw fallback when Oracle disk registry/drafts are stale (common after local staging without pull). */
const OUTREACH_GITHUB_RAW_BASE = (
  process.env.OUTREACH_GITHUB_RAW_BASE ||
  'https://raw.githubusercontent.com/ElenaRevicheva/AIPA_AITCF/main'
).replace(/\/$/, '');

const goWaHits = new Map<string, number[]>();
const GO_WA_WINDOW_MS = 15 * 60 * 1000;
const GO_WA_MAX = Number(process.env.GO_WA_MAX_PER_WINDOW ?? 60);

type OutreachRegistryEntry = {
  email?: string;
  emailDraft?: string;
  draft?: string;
  company?: string;
  dealId?: string;
  score?: number;
  phone?: string;
};

let githubRegistryCache: { at: number; data: Record<string, OutreachRegistryEntry> } | null = null;
const GITHUB_REGISTRY_CACHE_MS = 60_000;

async function fetchGithubRegistry(): Promise<Record<string, OutreachRegistryEntry> | null> {
  const now = Date.now();
  if (githubRegistryCache && now - githubRegistryCache.at < GITHUB_REGISTRY_CACHE_MS) {
    return githubRegistryCache.data;
  }
  try {
    const r = await fetch(`${OUTREACH_GITHUB_RAW_BASE}/docs/selling/outreach-registry.json`, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json', 'User-Agent': 'AIPA-go-wa/1.0' },
    });
    if (!r.ok) return null;
    const data = (await r.json()) as Record<string, OutreachRegistryEntry>;
    githubRegistryCache = { at: now, data };
    return data;
  } catch (e) {
    console.warn('[go/outreach-email] GitHub registry fetch failed:', (e as Error).message?.slice(0, 80));
    return null;
  }
}

async function readOutreachText(relPath: string): Promise<string | null> {
  const localPath = path.join(REPO_ROOT, relPath);
  try {
    if (fs.existsSync(localPath)) return fs.readFileSync(localPath, 'utf8');
  } catch {
    /* fall through to GitHub */
  }
  try {
    const r = await fetch(`${OUTREACH_GITHUB_RAW_BASE}/${relPath.replace(/^\/+/, '')}`, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'text/plain', 'User-Agent': 'AIPA-go-wa/1.0' },
    });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

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

type OutreachEmailPayload = {
  slug: string;
  to: string;
  subject: string;
  body: string;
  company: string;
  dealId?: string;
};

async function buildOutreachEmailPayload(
  slug: string,
  entry: OutreachRegistryEntry,
): Promise<OutreachEmailPayload | null> {
  const company = entry.company || slug;
  let subject = '';
  let body = '';
  let to = (entry.email || '').trim().toLowerCase();

  if (entry.emailDraft) {
    const raw = (await readOutreachText(entry.emailDraft))?.trim();
    if (!raw) return null;
    const subjM = raw.match(/^SUBJECT:\s*(.+)$/m);
    const toM = raw.match(/^TO:\s*(.+)$/m);
    subject = subjM?.[1]?.trim() || '';
    // Drafts may append " (UNVERIFIED — …)" after the address. Resend 422s if
    // `to` contains non-ASCII (em dash). Extract the email token only.
    if (toM?.[1]?.trim()) {
      const rawTo = toM[1].trim();
      const emailTok = rawTo.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0];
      to = (emailTok || entry.email || '').trim().toLowerCase();
    }
    body = raw
      .replace(/^SUBJECT:.*$/m, '')
      .replace(/^TO:.*$/m, '')
      .replace(/^NOTE:.*$/m, '')
      .replace(/^\s+/, '')
      .trim();
  } else if (entry.draft) {
    const wa = (await readOutreachText(entry.draft))?.trim();
    if (!wa) return null;
    const score = entry.score ?? 0;
    subject = `Auditoría de visibilidad en IA — ${company} (${score}/100): 3 arreglos concretos`;
    body = `Estimado equipo:\n\n${wa.replace(/^Hola, ¡un gusto saludarles! 👋/, '¡Un gusto saludarles! 👋')}`.replace(
      /\nElena✨🌍💫\s*$/,
      '\nElena Revicheva✨🌍💫',
    );
  }

  if (!to || !to.includes('@') || !subject || !body) return null;
  const out: OutreachEmailPayload = { slug, to, subject, body, company };
  if (entry.dealId) out.dealId = entry.dealId;
  return out;
}

/**
 * Resolve email one-click payload.
 * 1) Local Oracle disk registry+drafts (fast path after git pull)
 * 2) GitHub main raw fallback — fixes the recurring UI 404 when agents stage
 *    locally but Oracle has not pulled yet (as long as GitHub is pushed).
 */
async function loadOutreachEmailBySlug(slug: string): Promise<OutreachEmailPayload | null> {
  try {
    let localReg: Record<string, OutreachRegistryEntry> | null = null;
    try {
      localReg = JSON.parse(fs.readFileSync(OUTREACH_REGISTRY, 'utf8')) as Record<
        string,
        OutreachRegistryEntry
      >;
    } catch {
      localReg = null;
    }

    if (localReg?.[slug]) {
      const localHit = await buildOutreachEmailPayload(slug, localReg[slug]);
      if (localHit) return localHit;
    }

    const ghReg = await fetchGithubRegistry();
    if (ghReg?.[slug]) {
      const ghHit = await buildOutreachEmailPayload(slug, ghReg[slug]);
      if (ghHit) {
        console.log(`[go/outreach-email] resolved ${slug} via GitHub fallback`);
        return ghHit;
      }
    }
    return null;
  } catch (e) {
    console.warn('[go/outreach-email] registry read failed:', (e as Error).message?.slice(0, 80));
    return null;
  }
}

function outreachEmailConfirmHtml(p: OutreachEmailPayload, sendPath: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Enviar email — ${esc(p.company)}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;color:#111;line-height:1.45}
.box{border:1px solid #ddd;border-radius:12px;padding:1.25rem;background:#fafafa}
.meta{font-size:.95rem;margin:.35rem 0}
.preview{white-space:pre-wrap;background:#fff;border:1px solid #eee;border-radius:8px;padding:1rem;max-height:50vh;overflow:auto;margin:1rem 0}
button{background:#ff7a59;color:#fff;border:0;border-radius:8px;padding:.85rem 1.25rem;font-size:1.05rem;font-weight:600;cursor:pointer;width:100%}
button:hover{filter:brightness(.95)}
.dim{color:#666;font-size:.9rem}
</style>
</head><body>
<h1>Enviar outreach</h1>
<div class="box">
  <p class="meta"><b>From:</b> Elena Revicheva &lt;aipa@aideazz.xyz&gt;</p>
  <p class="meta"><b>To:</b> ${esc(p.to)}</p>
  <p class="meta"><b>Subject:</b> ${esc(p.subject)}</p>
  <div class="preview">${esc(p.body)}</div>
  <form method="POST" action="${esc(sendPath)}">
    <button type="submit">✉️ Enviar ahora desde aipa@aideazz.xyz</button>
  </form>
  <p class="dim">Igual que WhatsApp: revisas → un click → Send. Se registra en HubSpot automáticamente.</p>
</div>
</body></html>`;
}

function outreachEmailDoneHtml(ok: boolean, detail: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${ok ? 'Enviado' : 'Error'}</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem}</style>
</head><body>
<h1>${ok ? '✅ Email enviado' : '❌ No se pudo enviar'}</h1>
<p>${esc(detail)}</p>
<p><a href="https://app.hubspot.com">Volver a HubSpot</a></p>
</body></html>`;
}

async function sendOutreachEmailViaResend(p: OutreachEmailPayload): Promise<string> {
  const { getResendApiKey } = await import('./marketing-notify.js');
  const apiKey = getResendApiKey();
  if (!apiKey) throw new Error('RESEND_API_KEY not set');
  const rawFrom = (process.env.CONCIERGE_FROM || process.env.OUTREACH_FROM || '').trim().replace(/^["']|["']$/g, '');
  const fromOk =
    /^[^\s<>]+@[^\s<>]+\.[^\s<>]+$/.test(rawFrom) || /^.+\s*<[^\s<>]+@[^\s<>]+\.[^\s<>]+>\s*$/.test(rawFrom);
  const from = fromOk ? rawFrom : 'Elena Revicheva <aipa@aideazz.xyz>';
  const replyTo = (process.env.CONCIERGE_REPLY_TO || 'elena.revicheva2016@gmail.com').trim().replace(/^["']|["']$/g, '');
  const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<div style="white-space:pre-wrap;font-family:inherit;">${escHtml(p.body)}</div>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [p.to],
      subject: p.subject,
      html,
      text: p.body,
      reply_to: replyTo,
    }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { id?: string };
  return j.id || 'ok';
}

async function markHubSpotAfterOutreachEmail(p: OutreachEmailPayload, resendId: string): Promise<void> {
  const key = process.env.HUBSPOT_API_KEY?.trim();
  if (!key || !p.dealId) return;
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const when = new Date().toISOString().slice(0, 10);
  await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${p.dealId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ properties: { dealstage: 'decisionmakerboughtin' } }),
  });
  const notesAssoc = await fetch(
    `https://api.hubapi.com/crm/v4/objects/deals/${p.dealId}/associations/notes`,
    { headers },
  ).then(r => r.json() as Promise<{ results?: { toObjectId?: string; id?: string }[] }>);
  const noteIds = (notesAssoc.results || []).map(r => r.toObjectId || r.id).filter(Boolean) as string[];
  if (noteIds.length) {
    let best: { id: string; body: string; ts: string } | null = null;
    for (const id of noteIds) {
      const n = await fetch(
        `https://api.hubapi.com/crm/v3/objects/notes/${id}?properties=hs_note_body,hs_timestamp`,
        { headers },
      ).then(r => r.json() as Promise<{ id: string; properties?: { hs_note_body?: string; hs_timestamp?: string } }>);
      const ts = n.properties?.hs_timestamp || '';
      if (!best || ts > best.ts) best = { id: n.id, body: n.properties?.hs_note_body || '', ts };
    }
    if (best && !best.body.includes(`Resend:${resendId}`)) {
      const add =
        `<br><br>📧 EMAILED ${when} from <b>aipa@aideazz.xyz</b> → ${p.to}` +
        `<br>Subject: ${p.subject}` +
        `<br>Resend:${resendId} (one-click /go/outreach-email/${p.slug}).`;
      await fetch(`https://api.hubapi.com/crm/v3/objects/notes/${best.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ properties: { hs_note_body: best.body + add } }),
      });
    }
  }
  // +4 day follow-up if none open
  const due = new Date();
  due.setDate(due.getDate() + 4);
  due.setHours(23, 59, 0, 0);
  const task = await fetch('https://api.hubapi.com/crm/v3/objects/tasks', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      properties: {
        hs_task_subject: `Soft follow-up email/WA → ${p.company} (no reply yet?)`,
        hs_task_body: `Auto after aipa@ one-click send. Deal ${p.dealId}`,
        hs_task_status: 'NOT_STARTED',
        hs_task_priority: 'MEDIUM',
        hs_timestamp: due.toISOString(),
        // Elena Revicheva — Tasks UI "Assigned to me"
        hubspot_owner_id: process.env.HUBSPOT_OWNER_ID || '91612860',
      },
    }),
  }).then(r => r.json() as Promise<{ id?: string }>);
  if (task.id) {
    await fetch(`https://api.hubapi.com/crm/v4/objects/tasks/${task.id}/associations/deals/${p.dealId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 216 }]),
    });
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

  /**
   * Manual Prospect Play — email from aipa@aideazz.xyz (Resend).
   * GET = confirm (like WhatsApp open-then-Send). POST = send + HubSpot update.
   */
  app.get('/go/outreach-email/:slug', async (req: Request, res: Response) => {
    const ip = getClientIp(req);
    if (!allowGoWaRate(ip)) {
      res.status(429).send('Too many requests');
      return;
    }
    const slug = String(req.params.slug || '').replace(/[^a-z0-9-]/gi, '');
    const hit = await loadOutreachEmailBySlug(slug);
    if (!hit) {
      res
        .status(404)
        .type('text')
        .send(
          `Unknown outreach email slug "${slug}".\n\n` +
            `Need email + emailDraft in docs/selling/outreach-registry.json on GitHub main ` +
            `(and drafts under docs/selling/drafts/).\n` +
            `Usual cause: staged locally but not pushed — commit/push registry+drafts, ` +
            `then retry (Oracle also git-pulls ~/cto-aipa).\n`,
        );
      return;
    }
    const sendPath = `${GO_WA_BASE}/go/outreach-email/${slug}/send`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(outreachEmailConfirmHtml(hit, sendPath));
  });

  app.post('/go/outreach-email/:slug/send', async (req: Request, res: Response) => {
    const ip = getClientIp(req);
    if (!allowGoWaRate(ip)) {
      res.status(429).send('Too many requests');
      return;
    }
    const slug = String(req.params.slug || '').replace(/[^a-z0-9-]/gi, '');
    const hit = await loadOutreachEmailBySlug(slug);
    if (!hit) {
      res.status(404).send(outreachEmailDoneHtml(false, `Unknown slug "${slug}" — push registry+drafts to GitHub main`));
      return;
    }
    try {
      const resendId = await sendOutreachEmailViaResend(hit);
      await markHubSpotAfterOutreachEmail(hit, resendId).catch(e =>
        console.error('[go/outreach-email] HubSpot update failed:', e),
      );
      console.log(`[go/outreach-email] sent ${slug} → ${hit.to} resend=${resendId}`);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(
        outreachEmailDoneHtml(
          true,
          `Enviado a ${hit.to} desde aipa@aideazz.xyz. Subject: ${hit.subject}. Resend id: ${resendId}. Deal movido a ⏳ Sent si tenía dealId.`,
        ),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[go/outreach-email] send failed:', msg);
      res.status(500);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(outreachEmailDoneHtml(false, msg));
    }
  });
}
