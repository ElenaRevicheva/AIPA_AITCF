/**
 * Marketing inquiry: reCAPTCHA v3 verification + Resend email (team + optional confirmation).
 */

/** First non-empty: RESEND_API_KEY, RESEND_KEY (common on servers). */
export function getResendApiKey(): string | undefined {
  for (const name of ['RESEND_API_KEY', 'RESEND_KEY'] as const) {
    const v = process.env[name]?.trim();
    if (v) return v;
  }
  return undefined;
}

export async function verifyRecaptchaV3Token(
  token: string | undefined,
  remoteIp: string | undefined
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const secret = process.env.RECAPTCHA_SECRET_KEY?.trim();
  if (!secret) {
    return { ok: true };
  }
  if (!token?.trim()) {
    return { ok: false, reason: 'captcha_required' };
  }
  const body = new URLSearchParams();
  body.set('secret', secret);
  body.set('response', token);
  if (remoteIp && remoteIp !== 'unknown') {
    body.set('remoteip', remoteIp);
  }
  try {
    const r = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = (await r.json()) as {
      success: boolean;
      score?: number;
      action?: string;
      'error-codes'?: string[];
    };
    if (!data.success) {
      return { ok: false, reason: 'captcha_failed' };
    }
    const minScore = Number(process.env.RECAPTCHA_MIN_SCORE ?? 0.35);
    const score = data.score ?? 0;
    if (score < minScore) {
      return { ok: false, reason: 'captcha_low_score' };
    }
    if (data.action && data.action !== 'inquiry') {
      return { ok: false, reason: 'captcha_bad_action' };
    }
    return { ok: true };
  } catch (e) {
    console.error('verifyRecaptchaV3Token:', e);
    return { ok: false, reason: 'captcha_error' };
  }
}

export async function sendMarketingInquiryEmails(params: {
  leadId: string;
  name?: string;
  contactEmail?: string;
  message?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  page_url?: string;
}): Promise<void> {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    console.warn('marketing-notify: RESEND_API_KEY or RESEND_KEY not set — no email sent');
    return;
  }

  const teamTo = process.env.MARKETING_INQUIRY_NOTIFY_TO?.trim() || 'aipa@aideazz.xyz';
  const from = process.env.MARKETING_INQUIRY_FROM?.trim() || 'AIdeazz <onboarding@resend.dev>';
  const sendConfirmation = process.env.MARKETING_INQUIRY_SEND_CONFIRMATION !== 'false';

  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const teamHtml = `
    <h2>New inquiry (Oracle lead ${esc(params.leadId.slice(0, 16))}…)</h2>
    <p><strong>Name:</strong> ${esc(params.name || '—')}</p>
    <p><strong>Email:</strong> ${esc(params.contactEmail || '—')}</p>
    <p><strong>Message:</strong></p>
    <pre style="white-space:pre-wrap;font-family:inherit;">${esc(params.message || '—')}</pre>
    <p><strong>Page:</strong> ${esc(params.page_url || '—')}</p>
    <p><strong>UTM:</strong> ${esc([params.utm_source, params.utm_medium, params.utm_campaign].filter(Boolean).join(' / ') || '—')}</p>
  `;

  const sendOne = async (payload: {
    to: string[];
    subject: string;
    html: string;
    reply_to?: string;
  }) => {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        ...(payload.reply_to ? { reply_to: payload.reply_to } : {}),
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`Resend ${r.status}: ${t}`);
    }
  };

  await sendOne({
    to: [teamTo],
    subject: `[AIdeazz] Inquiry — ${params.name || params.contactEmail || 'contact'}`,
    html: teamHtml,
    ...(params.contactEmail?.includes('@') ? { reply_to: params.contactEmail } : {}),
  });

  if (
    sendConfirmation &&
    params.contactEmail?.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.contactEmail.trim())
  ) {
    const confirmHtml = `
      <p>Hi${params.name ? ` ${esc(params.name)}` : ''},</p>
      <p>We received your message on <strong>aideazz.xyz</strong>. Our team will review it and get back to you.</p>
      <p style="color:#666;font-size:14px;">This is an automated confirmation — please reply if you need to add details.</p>
      <p>— AIdeazz</p>
    `;
    await sendOne({
      to: [params.contactEmail.trim()],
      subject: 'We received your inquiry — AIdeazz',
      html: confirmHtml,
    });
  }
}

/** Fire-and-forget after Oracle save (does not block HTTP response). */
export function scheduleMarketingInquiryEmails(
  leadId: string | null,
  fields: {
    name?: string;
    contactEmail?: string;
    message?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    page_url?: string;
  }
): void {
  if (!leadId) return;
  const payload: Parameters<typeof sendMarketingInquiryEmails>[0] = { leadId };
  if (fields.name !== undefined) payload.name = fields.name;
  if (fields.contactEmail !== undefined) payload.contactEmail = fields.contactEmail;
  if (fields.message !== undefined) payload.message = fields.message;
  if (fields.utm_source !== undefined) payload.utm_source = fields.utm_source;
  if (fields.utm_medium !== undefined) payload.utm_medium = fields.utm_medium;
  if (fields.utm_campaign !== undefined) payload.utm_campaign = fields.utm_campaign;
  if (fields.page_url !== undefined) payload.page_url = fields.page_url;
  void sendMarketingInquiryEmails(payload).catch((e) =>
    console.error('📧 marketing inquiry email failed:', e)
  );
}
