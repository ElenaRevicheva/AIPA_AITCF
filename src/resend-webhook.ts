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
  /** HubSpot EMAIL activity id, so a later bounce can flip it from SENT to BOUNCED. */
  engagementId?: string | undefined;
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

function stampFor(
  type: string,
  to: string,
  data: Record<string, unknown>,
  resendId?: string,
  /** 'PRIMER CONTACTO' | 'SEGUIMIENTO' — from the recorded send slug, never guessed. */
  kind?: string | null,
  /** True when `to` is a Cc, not the ledger primary. A Cc bounce is not a failed send. */
  isCc?: boolean,
): Stamp | null {
  const when = new Date().toISOString().slice(0, 10);
  const reason = String((data as { reason?: string }).reason || '').slice(0, 160);
  const kindTag = kind ? `[${kind}] ` : '';
  // The Resend message id is the only handle that ties a stamp back to a real
  // provider event. Without it "ENTREGADO" is an unverifiable claim in a note —
  // Elena asked (July 31 2026) that a delivery mark always carry the id she can
  // look up in the Resend dashboard. Only ever rendered from the actual webhook
  // payload, never inferred.
  const idSuffix = resendId ? ` · Resend id ${resendId}` : '';
  switch (type) {
    case 'email.delivered':
      return { text: `✅ ${kindTag}ENTREGADO ${when} → ${to} (Resend confirmó la entrega${idSuffix})` };
    case 'email.bounced':
      if (isCc) {
        return {
          text: `⛔ ${kindTag}REBOTE (Cc) ${when} → ${to}${reason ? ` — ${reason}` : ''} (esta COPIA no llegó; el To puede sí${idSuffix})`,
          task: {
            subject: `⛔ Cc rebotó (${to}) — el To puede haber llegado`,
            body:
              `Resend reportó rebote para el Cc ${to}${reason ? `: ${reason}` : ''}. ` +
              `Eso no significa que el correo entero falló. El To puede haber sido entregado. ` +
              `No buscar otra dirección solo por este Cc.`,
          },
        };
      }
      return {
        text: `⛔ ${kindTag}REBOTE ${when} → ${to}${reason ? ` — ${reason}` : ''} (NO llegó${idSuffix})`,
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
    // Opens and clicks carry the same provenance as a delivery: which message it
    // was, and the Resend id to look it up. An open is a SOFT signal — Apple Mail
    // Privacy Protection and Gmail's image proxy pre-fetch the tracking pixel, so
    // some "opens" are machines, not people. Labelled as such so it is never read
    // as proof. A click is a deliberate human act and is called out as the real
    // buying signal.
    case 'email.opened':
      return { text: `👀 ${kindTag}ABIERTO ${when} → ${to} (señal blanda — puede ser el proxy del correo${idSuffix})` };
    case 'email.clicked':
      return {
        text: `🔗 ${kindTag}CLIC EN ENLACE ${when} → ${to} — señal REAL de interés, seguir hoy${idSuffix}`,
        task: {
          subject: `🔗 Hizo clic en el enlace → contactar hoy (${to})`,
          body:
            `${to} abrió el correo y además hizo clic en un enlace — es la señal de interés más fuerte ` +
            `que da el sistema (un clic es un acto humano, no un proxy). Vale la pena escribirle o ` +
            `llamarle hoy mismo, mientras el tema le resulta presente.`,
        },
      };
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

/**
 * Pick the OUTREACH note, not simply the newest one.
 *
 * July 26 2026: Elena typed her own note ("WA fu not sent — account blocked") on a
 * deal, which made it the newest — so the next delivery stamp would have landed on
 * her note instead of the one holding the audit and the FU buttons. Prefer a note
 * that actually carries outreach content; fall back to newest.
 */
export async function findOutreachNote(
  dealId: string,
  /** The slug this send went out under — its note is where Elena pressed the button. */
  slug?: string,
): Promise<{ id: string; body: string } | null> {
  const assoc = (await hs('GET', `/crm/v4/objects/deals/${dealId}/associations/notes?limit=500`)) as {
    results?: { toObjectId?: string; id?: string }[];
  };
  const ids = (assoc.results || []).map(r => String(r.toObjectId || r.id || '')).filter(Boolean);
  if (!ids.length) return null;

  // Every note, not the first 8. Associations come back OLDEST first, so the old
  // slice(0, 8) never saw a new send note on a long deal: IntelliOps (5 Sep and again
  // 4 Oct 2026, 20+ notes) had ENTREGADO land on the 25 Aug letter while the note with
  // the button Elena pressed stayed blank. Batch read = one call per 100 notes instead
  // of one per note, so a webhook burst does not trip HubSpot's 10-second limit.
  const notes: { id: string; body: string; ts: string }[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const b = (await hs('POST', '/crm/v3/objects/notes/batch/read', {
      properties: ['hs_note_body', 'hs_timestamp'],
      inputs: ids.slice(i, i + 100).map(id => ({ id })),
    })) as { results?: { id: string; properties?: { hs_note_body?: string; hs_timestamp?: string } }[] };
    for (const n of b.results || []) {
      notes.push({ id: n.id, body: n.properties?.hs_note_body || '', ts: n.properties?.hs_timestamp || '' });
    }
  }
  notes.sort((a, b) => (a.ts < b.ts ? 1 : -1)); // newest first
  // The note carrying THIS send's link wins. Exact link with a right boundary, so
  // `grand-tours` never matches a note that only holds the `grand-tours-fu` button.
  const esc = (slug || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const slugRe = slug ? new RegExp(`/outreach-email/${esc}(?![A-Za-z0-9-])`) : null;
  const slugHit = slugRe ? notes.find(n => slugRe.test(n.body)) : undefined;
  const isOutreach = (b: string) =>
    /FOLLOW-UP|MENSAJE|ENVIAR POR (WHATSAPP|EMAIL)|SEND BY EMAIL|EMAIL FU|WHATSAPP FU|CLIENT-MANUAL|LICENSE|EMAILED|outreach-email/i.test(
      b,
    );
  const hit = slugHit || notes.find(n => isOutreach(n.body)) || notes[0];
  return hit ? { id: hit.id, body: hit.body } : null;
}

/**
 * Put a stamp where Elena will actually see it: the TOP of the note, immediately
 * under the FU buttons — not appended to the bottom of a long note where a
 * delivery confirmation goes unnoticed (July 26 2026, her call).
 *
 * The FU block ends at its first <hr>; the stamp goes right after it so the
 * buttons stay first. Without a FU block the stamp leads the note.
 */
export function insertNoteStamp(body: string, stampHtml: string): string {
  const fuEnd = body.search(/<hr\s*\/?>/i);
  const fuHeading = /FOLLOW-UP/i.test(body.slice(0, Math.max(fuEnd, 0)));
  if (fuEnd >= 0 && fuHeading) {
    const cut = fuEnd + (body.slice(fuEnd).match(/<hr\s*\/?>/i)?.[0].length || 4);
    return `${body.slice(0, cut)}${stampHtml}<br>${body.slice(cut)}`;
  }
  return `${stampHtml}<br>${body}`;
}

/**
 * Write a stamp, then re-read. Two writers (webhook + EMAILED) used to PATCH from
 * a stale body and wipe ENTREGADO — AfterQuery 30 Aug 2026. Retry against the
 * fresh body instead of inventing a queue.
 */
export async function patchNoteStamp(
  noteId: string,
  stampHtml: string,
  alreadyThere: (body: string) => boolean,
  attempts = 4,
): Promise<'applied' | 'duplicate'> {
  for (let i = 0; i < attempts; i++) {
    const n = (await hs('GET', `/crm/v3/objects/notes/${noteId}?properties=hs_note_body`)) as {
      properties?: { hs_note_body?: string };
    };
    const body = n.properties?.hs_note_body || '';
    if (alreadyThere(body)) return 'duplicate';
    await hs('PATCH', `/crm/v3/objects/notes/${noteId}`, {
      properties: { hs_note_body: insertNoteStamp(body, stampHtml) },
    });
    const check = (await hs('GET', `/crm/v3/objects/notes/${noteId}?properties=hs_note_body`)) as {
      properties?: { hs_note_body?: string };
    };
    if (alreadyThere(check.properties?.hs_note_body || '')) return 'applied';
  }
  console.warn('[resend-webhook] note stamp lost after retries note=', noteId);
  return 'applied';
}

/**
 * Log the send as a real HubSpot EMAIL activity.
 *
 * Resend never touches HubSpot's email object, so the deal's Emails tab and the
 * Activities timeline stayed empty and the send looked like it never happened —
 * only the note body knew. This makes agent-sent mail show up exactly like mail
 * sent from the HubSpot UI. Returns the engagement id (stored in the ledger so a
 * later bounce can flip its status).
 */
/**
 * Render a plain-text email body as HTML: escape, keep the line breaks, and make
 * bare URLs clickable.
 *
 * Two things depended on this. HubSpot renders `hs_email_text` in an HTML
 * context, so newlines collapsed and the timeline showed sentences fused to each
 * other and a link fused to the words around it — the record was right, the
 * display was not. And a bare URL in an outgoing mail is only clickable if the
 * recipient's client happens to auto-linkify; an explicit anchor does not leave
 * that to chance.
 */
export function emailBodyToHtml(body: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Escape first, then linkify, so the anchor we add is the only markup present.
  // Trailing . , ) ; : are sentence punctuation, not part of the URL.
  const linkified = esc(body).replace(/https?:\/\/[^\s<>"']+/g, raw => {
    const m = raw.match(/^(.*?)([.,);:]*)$/s);
    const url = m?.[1] ?? raw;
    const tail = m?.[2] ?? '';
    return `<a href="${url}" target="_blank" rel="noopener">${url}</a>${tail}`;
  });
  return `<div style="white-space:pre-wrap;font-family:inherit;">${linkified}</div>`;
}

export async function logEmailEngagement(input: {
  dealId?: string | undefined;
  /** Pass when the caller already knows the contact (Lead Concierge does). */
  contactId?: string | undefined;
  to: string;
  /** Extra recipients, so the CRM records everyone who actually received it. */
  cc?: string[] | undefined;
  subject: string;
  body: string;
  resendId: string;
}): Promise<string | null> {
  try {
    const created = (await hs('POST', '/crm/v3/objects/emails', {
      properties: {
        hs_timestamp: Date.now(),
        hs_email_direction: 'EMAIL', // logged outgoing email
        hs_email_status: 'SENT',
        hs_email_subject: input.subject,
        hs_email_text: `${input.body}\n\n— enviado por aipa@aideazz.xyz (Resend ${input.resendId})`,
        // Without this HubSpot renders the text in an HTML context and every line
        // break collapses, gluing sentences together and welding the link to the
        // words beside it.
        hs_email_html: emailBodyToHtml(
          `${input.body}\n\n— enviado por aipa@aideazz.xyz (Resend ${input.resendId})`,
        ),
        // From/to must go through hs_email_headers — HubSpot rejects the flat
        // hs_email_from_email / hs_email_to_email properties with a 400 ("derived
        // from the hs_email_headers property"), which would silently cost the
        // Emails-tab visibility this whole change exists for.
        hs_email_headers: JSON.stringify({
          from: { email: 'aipa@aideazz.xyz', firstName: 'Elena', lastName: 'Revicheva' },
          to: [{ email: input.to }],
          // Was hardcoded empty, so a copied recipient never reached the CRM and
          // the deal understated who had actually seen the message.
          cc: (input.cc || []).map(email => ({ email })),
          bcc: [],
        }),
        hubspot_owner_id: HUBSPOT_OWNER_ID,
      },
    })) as { id?: string };
    if (!created?.id) return null;

    if (input.dealId) {
      await hs('PUT', `/crm/v4/objects/emails/${created.id}/associations/default/deals/${input.dealId}`).catch(
        e => console.warn('[resend-webhook] email→deal association failed:', (e as Error).message?.slice(0, 90)),
      );
    }
    // Associate the contact too, so it shows on their timeline as well — taken
    // from the caller when known, otherwise resolved from the deal.
    let contactId = input.contactId;
    if (!contactId && input.dealId) {
      const cAssoc = (await hs('GET', `/crm/v4/objects/deals/${input.dealId}/associations/contacts`).catch(
        () => null,
      )) as { results?: { toObjectId?: string; id?: string }[] } | null;
      contactId = (cAssoc?.results || []).map(r => r.toObjectId || r.id).filter(Boolean)[0];
    }
    if (contactId) {
      await hs('PUT', `/crm/v4/objects/emails/${created.id}/associations/default/contacts/${contactId}`).catch(
        () => undefined,
      );
    }
    return created.id;
  } catch (e) {
    console.warn('[resend-webhook] logEmailEngagement failed:', (e as Error).message?.slice(0, 120));
    return null;
  }
}

/** Flip the logged email's status when Resend says it never arrived. */
async function updateEngagementStatus(engagementId: string, status: 'BOUNCED' | 'FAILED'): Promise<void> {
  await hs('PATCH', `/crm/v3/objects/emails/${engagementId}`, {
    properties: { hs_email_status: status },
  }).catch(e => console.warn('[resend-webhook] engagement status update failed:', (e as Error).message?.slice(0, 90)));
}

/** Append the stamp to the deal's outreach note; idempotent per resend id + event. */
export async function applyResendEventToHubSpot(
  dealId: string,
  resendId: string,
  type: string,
  stamp: Stamp,
  engagementId?: string,
  /** False for a Cc bounce — the To may have been delivered. */
  flipEngagement?: boolean,
  /** Send slug from the ledger — picks the note whose button was pressed. */
  slug?: string,
): Promise<'applied' | 'duplicate' | 'no-note'> {
  const best = await findOutreachNote(dealId, slug);
  if (!best) return 'no-note';

  // A send that never arrived must not keep showing as SENT in the Emails tab.
  // A Cc bounce is not that — flipping the whole EMAIL row to BOUNCED made
  // AfterQuery look undelivered while atrium@ and support@ had already landed.
  if (
    flipEngagement !== false &&
    engagementId &&
    (type === 'email.bounced' || type === 'email.complained')
  ) {
    await updateEngagementStatus(engagementId, type === 'email.bounced' ? 'BOUNCED' : 'FAILED');
  }

  const marker = `<!-- resend:${resendId}:${type} -->`;
  const stampHtml = `${marker}<b>${stamp.text}</b>`;
  const outcome = await patchNoteStamp(
    best.id,
    stampHtml,
    body => body.includes(marker) || body.includes(stamp.text),
  );
  if (outcome === 'duplicate') return 'duplicate';

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
      const ledger = readLedger();
      const hit = ledger[resendId] || dealIdByRecipient(to);
      // Which message was delivered — the first outreach or the follow-up?
      // The ledger records the slug used for the send, and the `-fu` suffix is the
      // only reliable discriminator (Elena, July 31 2026: a bare "ENTREGADO" left
      // her unable to tell whether the FIRST contact had actually landed). Derived
      // solely from the recorded send; when the slug is unknown we say nothing
      // rather than guess.
      const slug = (hit as ResendLedgerEntry)?.slug;
      const kind = slug ? (/-fu$/i.test(slug) ? 'SEGUIMIENTO' : 'PRIMER CONTACTO') : null;
      const ledgerTo = String((hit as ResendLedgerEntry)?.to || '').trim().toLowerCase();
      const eventTo = to.trim().toLowerCase();
      const isCc = Boolean(ledgerTo && eventTo && eventTo !== ledgerTo);
      const stamp = stampFor(type, to, data, resendId, kind, isCc);
      if (!stamp) return;
      if (!hit?.dealId) {
        console.log(`[resend-webhook] ${type} for ${to} (${resendId}) — no matching deal, skipped`);
        return;
      }
      const outcome = await applyResendEventToHubSpot(
        hit.dealId,
        resendId,
        type,
        stamp,
        (hit as ResendLedgerEntry).engagementId,
        !(type === 'email.bounced' && isCc),
        slug,
      );
      console.log(`[resend-webhook] ${type} ${to} deal=${hit.dealId} → ${outcome}`);
    } catch (e) {
      console.error('[resend-webhook] handling failed:', (e as Error).message);
    }
  });

  console.log('📬 Resend webhook route ready: POST /resend/webhook');
}
