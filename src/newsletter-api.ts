/**
 * Newsletter HTTP surface — subscribe, confirm, unsubscribe, stats.
 *
 * Mounted as its own router so nothing here can affect the inquiry proxy, the
 * concierge or the outreach pipeline. Public paths (nginx prefixes /cto/):
 *
 *   POST /v1/newsletter/subscribe      { email, source?, website? }
 *   GET  /v1/newsletter/confirm?token=
 *   GET  /v1/newsletter/unsubscribe?token=
 *   GET  /v1/newsletter/stats          (owner key)
 *
 * Confirm and unsubscribe answer in HTML rather than JSON: a human clicking a
 * link in their mail client should land on a page, not on a JSON blob.
 */

import express, { Router, Request, Response } from 'express';

const SUBSCRIBE_LIMIT_PER_HOUR = 10;
const ipHits = new Map<string, number[]>();

/** Where confirm/unsubscribe links point. The VM knows its own public URL. */
function publicBase(): string {
  const configured = process.env.CTO_AIPA_PUBLIC_URL?.trim().replace(/\/$/, '');
  return configured || 'https://webhook.aideazz.xyz/cto';
}

function siteBase(): string {
  return process.env.NEWSLETTER_SITE_URL?.trim().replace(/\/$/, '') || 'https://aideazz.xyz/portfolio';
}

function fromAddress(): string {
  return process.env.NEWSLETTER_FROM?.trim() || 'AIdeazz <aipa@aideazz.xyz>';
}

function getResendKey(): string | undefined {
  for (const name of ['RESEND_API_KEY', 'RESEND_KEY'] as const) {
    const v = process.env[name]?.trim();
    if (v) return v;
  }
  return undefined;
}

function underLimit(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - 3_600_000;
  const hits = (ipHits.get(ip) ?? []).filter((t) => t > cutoff);
  if (hits.length >= SUBSCRIBE_LIMIT_PER_HOUR) {
    ipHits.set(ip, hits);
    return false;
  }
  hits.push(now);
  ipHits.set(ip, hits);
  return true;
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function page(title: string, heading: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} — AIdeazz</title>
<style>
  body{margin:0;background:#0b0f17;color:#e8eefc;font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
       display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
  .card{max-width:520px;background:#131a27;border:1px solid #22304a;border-radius:14px;padding:32px}
  h1{margin:0 0 12px;font-size:22px}
  p{margin:0 0 16px;color:#b8c6e0}
  a.btn{display:inline-block;margin-top:8px;background:#4f8cff;color:#fff;text-decoration:none;
        padding:10px 18px;border-radius:9px;font-weight:600}
</style></head>
<body><div class="card">
<h1>${esc(heading)}</h1>
${body}
<a class="btn" href="${siteBase()}">Back to the portfolio</a>
</div></body></html>`;
}

async function sendConfirmEmail(email: string, confirmToken: string): Promise<void> {
  const apiKey = getResendKey();
  if (!apiKey) throw new Error('RESEND_API_KEY not set');
  const link = `${publicBase()}/v1/newsletter/confirm?token=${encodeURIComponent(confirmToken)}`;
  const html = `
    <div style="font:16px/1.6 system-ui,sans-serif;color:#111">
      <p>Hi — you asked for the AIdeazz build-in-public letter.</p>
      <p>One click and you are on the list:</p>
      <p><a href="${link}" style="background:#4f8cff;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block">Confirm subscription</a></p>
      <p style="color:#666;font-size:14px">If you did not request this, ignore this email and nothing happens — you are not subscribed until you click.</p>
      <p style="color:#666;font-size:14px">— Elena, AIdeazz</p>
    </div>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromAddress(),
      to: [email],
      subject: 'Confirm your AIdeazz subscription',
      html,
      text: `Confirm your AIdeazz subscription: ${link}\n\nIf you did not request this, ignore this email.`,
    }),
  });
  if (!r.ok) {
    throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
}

export function newsletterRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '4kb' }));

  router.use('/v1/newsletter', (_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    next();
  });
  router.options('/v1/newsletter/subscribe', (_req, res) => res.sendStatus(204));

  router.post('/v1/newsletter/subscribe', async (req: Request, res: Response) => {
    const ip = (req.ip || req.socket.remoteAddress || 'unknown').toString();
    if (!underLimit(ip)) {
      return res.status(429).json({ ok: false, error: 'rate_limited', message: 'Too many signups from here. Try later.' });
    }

    const body = req.body ?? {};

    // Honeypot: a field hidden from humans by CSS. Anything that fills it is a bot,
    // and answering 200 keeps it from learning that the attempt was discarded.
    if (typeof body.website === 'string' && body.website.trim() !== '') {
      return res.json({ ok: true, message: 'Check your inbox to confirm.' });
    }

    const { normalizeEmail, isPlausibleEmail } = await import('./newsletter-store');
    const email = normalizeEmail(body.email ?? '');
    if (!isPlausibleEmail(email)) {
      return res.status(400).json({ ok: false, error: 'invalid_email', message: 'That does not look like an email address.' });
    }

    try {
      const { subscribe } = await import('./newsletter-store');
      const source = typeof body.source === 'string' ? body.source.slice(0, 120) : 'portfolio';
      const result = await subscribe(email, source);

      if (result.outcome === 'already_confirmed') {
        return res.json({ ok: true, alreadySubscribed: true, message: 'You are already on the list.' });
      }
      if (result.confirmToken) {
        await sendConfirmEmail(email, result.confirmToken);
      }
      return res.json({ ok: true, message: 'Almost there — check your inbox and click the confirmation link.' });
    } catch (err: any) {
      console.error('[newsletter] subscribe failed:', err?.message ?? err);
      return res.status(500).json({ ok: false, error: 'subscribe_failed', message: 'Could not sign you up right now.' });
    }
  });

  router.get('/v1/newsletter/confirm', async (req: Request, res: Response) => {
    const token = String(req.query.token ?? '');
    if (!token) return res.status(400).type('html').send(page('Invalid link', 'That link is incomplete', '<p>The confirmation link is missing its token.</p>'));
    try {
      const { confirm } = await import('./newsletter-store');
      const result = await confirm(token);
      if (!result) {
        return res.status(404).type('html').send(
          page('Link expired', 'That link has already been used', '<p>Either you are confirmed already, or the link expired. Nothing else to do.</p>'),
        );
      }
      const unsubLink = `${publicBase()}/v1/newsletter/unsubscribe?token=${encodeURIComponent(result.unsubscribeToken)}`;
      return res.type('html').send(
        page(
          'Subscribed',
          'You are on the list',
          `<p>Confirmed <strong>${esc(result.email)}</strong>. You will get what I am building, what broke, and what the numbers actually said.</p>
           <p style="font-size:14px"><a href="${unsubLink}" style="color:#8fb4ff">Unsubscribe</a> any time — the link is in every email too.</p>`,
        ),
      );
    } catch (err: any) {
      console.error('[newsletter] confirm failed:', err?.message ?? err);
      return res.status(500).type('html').send(page('Error', 'Something went wrong', '<p>Try the link again in a minute.</p>'));
    }
  });

  router.get('/v1/newsletter/unsubscribe', async (req: Request, res: Response) => {
    const token = String(req.query.token ?? '');
    try {
      const { unsubscribe } = await import('./newsletter-store');
      const email = token ? await unsubscribe(token) : null;
      if (!email) {
        return res.status(404).type('html').send(
          page('Not found', 'Nothing to unsubscribe', '<p>That link does not match an active subscription.</p>'),
        );
      }
      return res.type('html').send(
        page('Unsubscribed', 'Done — you are off the list', `<p>Removed <strong>${esc(email)}</strong>. No further emails.</p>`),
      );
    } catch (err: any) {
      console.error('[newsletter] unsubscribe failed:', err?.message ?? err);
      return res.status(500).type('html').send(page('Error', 'Something went wrong', '<p>Try again in a minute.</p>'));
    }
  });

  router.get('/v1/newsletter/stats', async (req: Request, res: Response) => {
    const key = req.header('X-API-Key') ?? '';
    if (!key.startsWith('aidz_owner_')) {
      return res.status(403).json({ error: 'owner_key_required' });
    }
    try {
      const { stats } = await import('./newsletter-store');
      return res.json(await stats());
    } catch (err: any) {
      console.error('[newsletter] stats failed:', err?.message ?? err);
      return res.status(503).json({ error: 'unavailable' });
    }
  });

  return router;
}
