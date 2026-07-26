/**
 * POST /resend/webhook — turn Resend delivery events into HubSpot truth.
 *
 * Why (July 26 2026): the one-click sender stamped the deal ⏳ Sent + 📧 EMAILED the
 * moment Resend ACCEPTED the API call. Dental Connect was `Suppressed` — never
 * delivered — and HubSpot still showed EMAILED, so Elena would have waited four days
 * for a reply that was impossible. Acceptance is not delivery.
 *
 * Events handled: delivered · bounced · complained · delivery_delayed · opened ·
 * clicked. Each one appends a stamp to the deal's latest note (idempotent per
 * Resend id + event); a bounce or complaint also raises a task so the deal stops
 * pretending it is in play.
 *
 * Deal lookup: the send path writes a resendId → dealId ledger; recipient address
 * against the outreach registry is the fallback.
 */
import type { Express, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = process.env.CTO_AIPA_ROOT || process.cwd();
const LEDGER_PATH = path.join(REPO_ROOT, 'data/resend-ledger.json');
const OUTREACH_REGISTRY = path.join(REPO_ROOT, 'docs/selling/outreach-registry.json');
const HUBSPOT_OWNER_ID = process.env.HUBSPOT_OWNER_ID?.trim() || '91612860';

export type ResendLedgerEntry = {
  dealId?: string | undefined;
  slug?: string | undefined;
  to?: string | undefined;
  subject?: string | undefined;
  at?: string | undefined;
};

/** Record a send so delivery events can be matched back to the deal. */
export function recordResendSend(resendId: string, entry: ResendLedgerEntry): void {
  if (!resendId) return;
  try {
    fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
    let ledger: Record<string, ResendLedgerEntry> = {};
    try {
      ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')) as Record<string, ResendLedgerEntry>;
    } catch {
      ledger = {};
    }
    ledger[resendId] = { ...entry, at: new Date().toISOString() };
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
  } catch (e) {
    console.warn('[resend-webhook] ledger write failed:', (e as Error).message?.slice(0, 80));
  }
}

function readLedger(): Record<string, ResendLedgerEntry> {
  try {
    return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')) as Record<string, ResendLedgerEntry>;
  } catch {
    return {};
  }
}

/** Fallback: recipient address → deal, via the outreach registry. */
function dealIdByRecipient(to: string): { dealId?: string; slug?: string } {
  try {
    const reg = JSON.parse(fs.readFileSync(OUTREACH_REGISTRY, 'utf8')) as Record<
      string,
      { email?: string; dealId?: string }
    >;
    const needle = to.trim().toLowerCase();
    for (const [slug, cfg] of Object.entries(reg)) {
      if ((cfg.email || '').trim().toLowerCase() === needle && cfg.dealId) {
        return { dealId: String(cfg.dealId), slug };
      }
    }
  } catch {
    /* registry unreadable */
  }
  return {};
}

/**
 * Svix signature check (Resend signs with Svix). Verified manually so we do not
 * add a dependency: HMAC-SHA256 over `id.timestamp.body` with the base64 secret.
 */
function verifySignature(req: Request & { rawBody?: Buffer }, secret: string): boolean {
  const id = String(req.header('svix-id') || req.header('webhook-id') || '');
  const ts = String(req.header('svix-timestamp') || req.header('webhook-timestamp') || '');
  const sigHeader = String(req.header('svix-signature') || req.header('webhook-signature') || '');
  if (!id || !ts || !sigHeader) return false;

  // Reject stale timestamps (replay protection), 5 minute window.
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(age) || age > 300) return false;

  const body = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body ?? {});
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');

  return sigHeader
    .split(' ')
    .map(part => part.split(',').pop() || '')
    .some(sig => {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    });
}

type Stamp = { text: string; task?: { subject: string; body: string } };

function stampFor(type: string, to: string, data: Record<string, unknown>): Stamp | null {
  const when = new Date().toISOString().slice(0, 10);
  const reason = String((data as { reason?: string }).reason || '').slice(0, 160);
  switch (type) {
    case 'email.delivered':
      return { text: `✅ ENTREGADO ${when} → ${to} (Resend confirmó la entrega)` };
    case 'email.bounced':
      return {
        text: `⛔ REBOTE ${when} → ${to}${reason ? ` — ${reason}` : ''} (NO llegó)`,
        task: {
          subject: `⛔ Email rebotó → buscar otra dirección (${to})`,
          body:
            `Resend reportó rebote para ${to}${reason ? `: ${reason}` : ''}. ` +
            `El prospecto NO recibió nada — buscar otro correo en su sitio/IG/Google Business, ` +
            `actualizar el contacto en HubSpot y reenviar el FU.`,
        },
      };
    case 'email.complained':
      return {
        text: `🚫 QUEJA DE SPAM ${when} → ${to} — no volver a escribir a esta dirección`,
        task: {
          subject: `🚫 Marcó como spam → no contactar (${to})`,
          body: `${to} marcó el correo como spam. No enviar más correos a esta dirección.`,
        },
      };
    case 'email.delivery_delayed':
      return { text: `⏳ ENTREGA DEMORADA ${when} → ${to} (Resend reintentando)` };
    case 'email.opened':
      return { text: `👀 ABIERTO ${when} → ${to}` };
    case 'email.clicked':
      return { text: `🔗 CLIC EN ENLACE ${when} → ${to} — señal de interés, seguir hoy` };
    default:
      return null;
  }
}

async function hs(method: string, p: string, body?: unknown): Promise<unknown> {
  const key = process.env.HUBSPOT_API_KEY?.trim();
  if (!key) throw new Error('HUBSPOT_API_KEY missing');
  const init: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const r = await fetch(`https://api.hubapi.com${p}`, init);
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${p} ${t.slice(0, 160)}`);
  return t ? JSON.parse(t) : null;
}

/** Append the stamp to the deal's latest note; idempotent per resend id + event. */
export async function applyResendEventToHubSpot(
  dealId: string,
  resendId: string,
  type: string,
  stamp: Stamp,
): Promise<'applied' | 'duplicate' | 'no-note'> {
  const assoc = (await hs('GET', `/crm/v4/objects/deals/${dealId}/associations/notes`)) as {
    results?: { toObjectId?: string; id?: string }[];
  };
  const ids = (assoc.results || []).map(r => r.toObjectId || r.id).filter(Boolean) as string[];
  if (!ids.length) return 'no-note';

  let best: { id: string; body: string; ts: string } | null = null;
  for (const id of ids.slice(0, 6)) {
    const n = (await hs('GET', `/crm/v3/objects/notes/${id}?properties=hs_note_body,hs_timestamp`)) as {
      id: string;
      properties?: { hs_note_body?: string; hs_timestamp?: string };
    };
    const ts = n.properties?.hs_timestamp || '';
    if (!best || ts > best.ts) best = { id: n.id, body: n.properties?.hs_note_body || '', ts };
  }
  if (!best) return 'no-note';

  const marker = `<!-- resend:${resendId}:${type} -->`;
  if (best.body.includes(marker)) return 'duplicate';

  await hs('PATCH', `/crm/v3/objects/notes/${best.id}`, {
    properties: { hs_note_body: `${best.body}<br>${marker}<b>${stamp.text}</b>` },
  });

  if (stamp.task) {
    const due = new Date();
    due.setHours(due.getHours() + 2);
    const task = (await hs('POST', '/crm/v3/objects/tasks', {
      properties: {
        hs_task_subject: stamp.task.subject,
        hs_task_body: stamp.task.body,
        hs_task_status: 'NOT_STARTED',
        hs_task_priority: 'HIGH',
        hs_timestamp: due.getTime(),
        hubspot_owner_id: HUBSPOT_OWNER_ID,
      },
    })) as { id?: string };
    if (task?.id) {
      await hs('PUT', `/crm/v3/objects/tasks/${task.id}/associations/deals/${dealId}/task_to_deal`).catch(
        () => undefined,
      );
    }
  }
  return 'applied';
}

export function registerResendWebhookRoutes(app: Express): void {
  app.post('/resend/webhook', async (req: Request & { rawBody?: Buffer }, res: Response) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
    if (!secret) {
      console.warn('[resend-webhook] RESEND_WEBHOOK_SECRET not set — rejecting');
      res.status(503).send('webhook not configured');
      return;
    }
    if (!verifySignature(req, secret)) {
      console.warn('[resend-webhook] bad signature from', req.ip);
      res.status(401).send('bad signature');
      return;
    }

    const evt = (req.body ?? {}) as { type?: string; data?: Record<string, unknown> };
    const type = String(evt.type || '');
    const data = evt.data || {};
    const resendId = String((data as { email_id?: string; id?: string }).email_id || (data as { id?: string }).id || '');
    const toRaw = (data as { to?: string[] | string }).to;
    const to = Array.isArray(toRaw) ? String(toRaw[0] || '') : String(toRaw || '');

    // Always 200 fast — Resend retries on non-2xx and we do not want a HubSpot
    // hiccup to cause duplicate deliveries of the same event.
    res.status(200).send('ok');

    try {
      const stamp = stampFor(type, to, data);
      if (!stamp) return;
      const ledger = readLedger();
      const hit = ledger[resendId] || dealIdByRecipient(to);
      if (!hit?.dealId) {
        console.log(`[resend-webhook] ${type} for ${to} (${resendId}) — no matching deal, skipped`);
        return;
      }
      const outcome = await applyResendEventToHubSpot(hit.dealId, resendId, type, stamp);
      console.log(`[resend-webhook] ${type} ${to} deal=${hit.dealId} → ${outcome}`);
    } catch (e) {
      console.error('[resend-webhook] handling failed:', (e as Error).message);
    }
  });

  console.log('📬 Resend webhook route ready: POST /resend/webhook');
}
