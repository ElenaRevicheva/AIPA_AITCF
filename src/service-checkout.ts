/**
 * AIdeazz service checkout — PagueloFacil pay links for consulting SKUs.
 * Sidecar pattern: does not modify EspaLuz WA/TG payment flows.
 */
import type { Express, Request, Response, NextFunction } from 'express';
import {
  createServiceOrder,
  getServiceOrderById,
  markServiceOrderPaid,
  clientHasPaidSku,
  findPendingServiceOrders,
  findServiceOrderIdByCodOper,
} from './database.js';
import { getServiceProduct, listPublicServiceProducts, parseSvcParm1 } from './aideazz-service-catalog.js';
import { createServicePaymentLink, pagueloFacilConfigured } from './paguelofacil-client.js';
import { getResendApiKey } from './marketing-notify.js';
import { orderRefFromDescription, pickOrderForPayment } from './service-payment-match.js';

type CorsFn = (req: Request, res: Response, next: NextFunction) => void;
type SiteCheckFn = (req: Request) => boolean;
type ClientIpFn = (req: Request) => string;
type RateFn = (ip: string) => boolean;

async function sendServicePaidEmails(order: NonNullable<Awaited<ReturnType<typeof getServiceOrderById>>>) {
  const apiKey = getResendApiKey();
  if (!apiKey) return;

  const product = getServiceProduct(order.sku);
  const title = product?.titleEs || order.sku;
  const teamTo = process.env.MARKETING_INQUIRY_TEAM_TO?.trim() || process.env.ELENA_EMAIL?.trim();
  const from =
    process.env.MARKETING_INQUIRY_FROM?.trim() || 'Elena Revicheva <consultas@aideazz.xyz>';

  const summary = [
    `Servicio: ${title}`,
    `Monto: $${order.amount_usd} USD`,
    `Cliente: ${order.client_name || '—'}`,
    `Email: ${order.client_email || '—'}`,
    `Empresa: ${order.company_name || '—'}`,
    `Orden: ${order.id}`,
    order.notes ? `Notas: ${order.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const send = async (to: string, subject: string, text: string) => {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
  };

  if (teamTo) {
    await send(teamTo, `[AIdeazz] Pago recibido — ${title}`, summary).catch(e =>
      console.error('[service-paid] team email:', e),
    );
  }
  // The diagnostic sends its own client email (their language, next steps, credit) — diagnostic-delivery.ts
  if (order.client_email && order.sku !== 'diagnostic_call') {
    await send(
      order.client_email,
      `Pago recibido — ${title} · AIdeazz`,
      `Gracias por su pago.\n\n${summary}\n\nElena Revicheva comenzará el trabajo tras confirmar sus respuestas al cuestionario técnico (si aún no las envió).\n\nAIdeazz · aideazz.xyz`,
    ).catch(e => console.error('[service-paid] client email:', e));
  }
}

async function notifyTelegramServicePaid(order: NonNullable<Awaited<ReturnType<typeof getServiceOrderById>>>) {
  const product = getServiceProduct(order.sku);
  const msg = [
    '💳 Servicio pagado (PagueloFacil)',
    `${product?.titleEs || order.sku} — $${order.amount_usd}`,
    order.company_name || order.client_name || 'Cliente',
    order.client_email || '',
    `Orden ${order.id}`,
  ]
    .filter(Boolean)
    .join('\n');
  try {
    const { sendTelegramBroadcast } = await import('./telegram-bot.js');
    await sendTelegramBroadcast(msg, { parseMode: false });
  } catch (e) {
    console.error('[service-paid] telegram:', e);
  }
}

async function pushServicePaidToHubSpot(order: NonNullable<Awaited<ReturnType<typeof getServiceOrderById>>>) {
  if (!order.client_email?.trim()) return;
  try {
    // Not pushLeadToHubSpot: its prospect gate dropped every paid order — see paid-order-hubspot.ts
    const { createPaidOrderDeal, addTaskToDeal } = await import('./paid-order-hubspot.js');
    const product = getServiceProduct(order.sku);
    const title = product?.titleEn || order.sku;
    const pushed = await createPaidOrderDeal({
      orderId: order.id,
      service: title,
      amountUsd: order.amount_usd,
      name: order.client_name,
      email: order.client_email,
      company: order.company_name,
      website: null,
      notes: order.notes,
    });
    if (pushed.dealId) {
      await addTaskToDeal(pushed.dealId, {
        subject: `Deliver ${title} → ${order.company_name || order.client_name || 'client'} (paid $${order.amount_usd})`,
        body: `Paid order ${order.id}. Their notes are in the deal description. Deliver, then move the deal to Won.`,
        priority: 'HIGH',
        due: new Date(Date.now() + 24 * 3600 * 1000),
      });
    } else {
      console.error(`[service-paid] hubspot: NO deal created for paid order ${order.id}`);
    }
  } catch (e) {
    console.error('[service-paid] hubspot:', e);
  }
}

export function registerServiceCheckoutRoutes(
  app: Express,
  opts: {
    marketingCors: CorsFn;
    isAllowedSite: SiteCheckFn;
    allowRate: RateFn;
    getClientIp: ClientIpFn;
    internalAuth: (req: Request, res: Response, next: NextFunction) => void;
  },
): void {
  app.get('/api/service-catalog', opts.marketingCors, (_req, res) => {
    res.json({
      ok: true,
      paguelofacil: pagueloFacilConfigured(),
      products: listPublicServiceProducts().map(p => ({
        sku: p.sku,
        amountUsd: p.amountUsd,
        titleEn: p.titleEn,
        titleEs: p.titleEs,
        descriptionEn: p.descriptionEn,
        descriptionEs: p.descriptionEs,
        requiresPrelim: Boolean(p.requiresPrelim),
      })),
    });
  });

  app.options('/api/service-checkout', opts.marketingCors);
  app.post('/api/service-checkout', opts.marketingCors, async (req, res) => {
    if (!opts.isAllowedSite(req)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const ip = opts.getClientIp(req);
    if (!opts.allowRate(ip)) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    if (!pagueloFacilConfigured()) {
      res.status(503).json({ error: 'PagueloFacil not configured' });
      return;
    }

    const b = (req.body || {}) as Record<string, unknown>;
    const sku = typeof b.sku === 'string' ? b.sku.trim() : '';
    const product = getServiceProduct(sku);
    if (!product) {
      res.status(400).json({ error: 'Unknown service sku' });
      return;
    }

    const name = typeof b.name === 'string' ? b.name.trim() : '';
    const email = typeof b.email === 'string' ? b.email.trim() : '';
    const company = typeof b.company === 'string' ? b.company.trim() : '';
    const notes = typeof b.notes === 'string' ? b.notes.trim() : '';
    if (!name || !email) {
      res.status(400).json({ error: 'Name and email are required' });
      return;
    }

    if (product.requiresPrelim && b.allow_blueprint !== true && b.allow_blueprint !== 'true') {
      const hasPrelim = await clientHasPaidSku(email, 'web_audit_prelim');
      if (!hasPrelim) {
        res.status(400).json({
          error: 'blueprint_requires_prelim',
          message: 'Complete the preliminary audit first, or contact Elena for an invitation link.',
        });
        return;
      }
    }

    const orderId = await createServiceOrder({
      sku: product.sku,
      amountUsd: product.amountUsd,
      clientName: name,
      clientEmail: email,
      ...(company ? { companyName: company } : {}),
      ...(notes ? { notes } : {}),
      ...(typeof b.utm_source === 'string' ? { utm_source: b.utm_source } : {}),
      ...(typeof b.utm_medium === 'string' ? { utm_medium: b.utm_medium } : {}),
      ...(typeof b.utm_campaign === 'string' ? { utm_campaign: b.utm_campaign } : {}),
      ...(typeof b.page_url === 'string' ? { page_url: b.page_url } : {}),
    });
    if (!orderId) {
      res.status(500).json({ error: 'Failed to create order' });
      return;
    }

    const clientLabel = (company || name).slice(0, 60);
    const pf = await createServicePaymentLink({ product, orderIdHex: orderId, clientLabel });
    if (!pf.success || !pf.url) {
      res.status(502).json({ error: pf.error || 'Payment link failed' });
      return;
    }

    res.json({
      ok: true,
      order_id: orderId,
      checkout_url: pf.url,
      amount: product.amountUsd,
      sku: product.sku,
    });
  });

  app.get('/api/service-order/:id', opts.marketingCors, async (req, res) => {
    const id = req.params.id?.trim();
    if (!id) {
      res.status(400).json({ error: 'Missing order id' });
      return;
    }
    const order = await getServiceOrderById(id);
    if (!order) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({
      ok: true,
      order_id: order.id,
      sku: order.sku,
      status: order.status,
      amount_usd: order.amount_usd,
      paid_at: order.paid_at,
    });
  });

  /**
   * Called by the PagueloFacil webhook receiver on Oracle (Flask :5000, shared by every
   * PagueloFacil payment on the account) once it recognises an AIdeazz service payment.
   * With order_id when the description carried "Ref <id>"; without it for links created
   * before that existed — then the order is matched by amount + payer email.
   */
  app.post('/internal/service-paid', opts.internalAuth, async (req, res) => {
    const { order_id, cod_oper, sku, total_pay, payer_email, description } = req.body as {
      order_id?: string;
      cod_oper?: string;
      sku?: string;
      total_pay?: string | number;
      payer_email?: string;
      description?: string;
    };
    if (!cod_oper) {
      res.status(400).json({ error: 'cod_oper required' });
      return;
    }

    let orderId = String(order_id || '').trim() || orderRefFromDescription(description) || '';
    if (!orderId) {
      const already = await findServiceOrderIdByCodOper(cod_oper);
      if (already) {
        res.json({ ok: true, duplicate: true, order_id: already });
        return;
      }
      const amount = Number(total_pay);
      const candidates = Number.isFinite(amount) && amount > 0 ? await findPendingServiceOrders(amount) : [];
      const pick = pickOrderForPayment(candidates, payer_email);
      if (!pick.id) {
        console.error(`[service-paid] UNMATCHED payment ${cod_oper} $${total_pay}: ${pick.reason}`);
        notifyTelegramUnmatchedPayment({ cod_oper, total_pay, payer_email, description, reason: pick.reason }).catch(() => {});
        res.status(404).json({ error: 'no_matching_order', reason: pick.reason });
        return;
      }
      orderId = pick.id;
      console.log(`[service-paid] payment ${cod_oper} matched order ${orderId} by ${pick.reason}`);
    }
    const order_id_resolved = orderId;

    const existing = await getServiceOrderById(order_id_resolved);
    if (!existing) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    if (existing.status === 'paid') {
      res.json({ ok: true, duplicate: true, order_id: order_id_resolved });
      return;
    }
    if (sku && existing.sku !== sku) {
      res.status(400).json({ error: 'sku mismatch' });
      return;
    }

    const updated = await markServiceOrderPaid({ orderIdHex: order_id_resolved, pfCodOper: cod_oper });
    if (!updated) {
      res.status(500).json({ error: 'Failed to mark paid' });
      return;
    }

    const order = await getServiceOrderById(order_id_resolved);
    if (order) {
      setImmediate(() => {
        sendServicePaidEmails(order).catch(() => {});
        if (order.sku === 'diagnostic_call') {
          import('./diagnostic-delivery.js')
            .then(d => d.deliverDiagnosticAfterPayment(order))
            .catch(e => console.error('[service-paid] diagnostic delivery:', e));
        } else {
          notifyTelegramServicePaid(order).catch(() => {});
          pushServicePaidToHubSpot(order).catch(() => {});
        }
        import('./database.js')
          .then(db =>
            db.saveAgentOutcome('aideazz', 'service_paid', { sku: order.sku, order_id: order.id }, 'verified_delivered', {
              amount: order.amount_usd,
            }),
          )
          .catch(() => {});
      });
    }

    res.json({ ok: true, order_id: order_id_resolved });
  });
}

async function notifyTelegramUnmatchedPayment(p: {
  cod_oper: string;
  total_pay?: string | number | undefined;
  payer_email?: string | undefined;
  description?: string | undefined;
  reason: string;
}) {
  const msg = [
    '⚠️ PagueloFacil payment received but NOT matched to an order',
    `$${p.total_pay ?? '?'} · ${p.payer_email || 'no email'} · ${p.cod_oper}`,
    p.description ? `"${p.description.slice(0, 120)}"` : '',
    `Why: ${p.reason}`,
    'The money is in PagueloFacil — deliver by hand and tell Claude the order.',
  ]
    .filter(Boolean)
    .join('\n');
  try {
    const { sendTelegramBroadcast } = await import('./telegram-bot.js');
    await sendTelegramBroadcast(msg, { parseMode: false });
  } catch (e) {
    console.error('[service-paid] telegram (unmatched):', e);
  }
}

export { parseSvcParm1 };
