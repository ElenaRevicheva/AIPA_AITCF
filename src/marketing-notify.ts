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

  const enterpriseProjectId = process.env.RECAPTCHA_ENTERPRISE_PROJECT_ID?.trim();
  const enterpriseApiKey = process.env.RECAPTCHA_ENTERPRISE_API_KEY?.trim();
  const siteKey = process.env.RECAPTCHA_SITE_KEY?.trim();

  if (enterpriseProjectId && enterpriseApiKey && siteKey) {
    const ent = await verifyRecaptchaEnterprise(
      token,
      siteKey,
      enterpriseProjectId,
      enterpriseApiKey,
      remoteIp
    );
    if (ent.ok) return ent;
    // Wrong GCP project or API key → Enterprise fails; classic siteverify may still work for non-Enterprise keys.
    console.warn(
      'verifyRecaptchaV3Token: Enterprise verification failed, falling back to classic siteverify:',
      ent.reason
    );
  }

  const body = new URLSearchParams();
  body.set('secret', secret);
  body.set('response', token);
  // Optional remoteip — wrong X-Forwarded-For behind nginx can hurt verification; off by default.
  if (process.env.RECAPTCHA_SEND_REMOTEIP === 'true' && remoteIp && remoteIp !== 'unknown') {
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
      hostname?: string;
      'error-codes'?: string[];
    };
    console.log('verifyRecaptchaV3Token: siteverify full response', JSON.stringify(data));
    if (!data.success) {
      const codes = data['error-codes']?.join(',') ?? 'none';
      console.error('verifyRecaptchaV3Token: success=false', { 'error-codes': codes, hostname: data.hostname });
      return { ok: false, reason: 'captcha_failed' };
    }
    // v3: very low scores in privacy mode; default 0.1 avoids blocking real users.
    const minScore = Number(process.env.RECAPTCHA_MIN_SCORE ?? 0.1);
    const score = data.score ?? 0;
    if (score < minScore) {
      console.error('verifyRecaptchaV3Token: low score', { score, minScore, action: data.action });
      return { ok: false, reason: 'captcha_low_score' };
    }
    if (data.action && data.action !== 'inquiry') {
      console.error('verifyRecaptchaV3Token: unexpected action (allowing)', { action: data.action });
    }
    return { ok: true };
  } catch (e) {
    console.error('verifyRecaptchaV3Token:', e);
    return { ok: false, reason: 'captcha_error' };
  }
}

async function verifyRecaptchaEnterprise(
  token: string,
  siteKey: string,
  projectId: string,
  apiKey: string,
  remoteIp: string | undefined
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const url = `https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/assessments?key=${apiKey}`;
    const event: Record<string, string> = { token, siteKey, expectedAction: 'inquiry' };
    if (remoteIp && remoteIp !== 'unknown') {
      event.userIpAddress = remoteIp;
    }
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event }),
    });
    const rawText = await r.text();
    let data: {
      tokenProperties?: { valid: boolean; hostname?: string; action?: string; invalidReason?: string };
      riskAnalysis?: { score?: number; reasons?: string[] };
      error?: { code: number; message: string; status?: string; details?: unknown[] };
    };
    try {
      data = JSON.parse(rawText) as typeof data;
    } catch {
      console.error('verifyRecaptchaEnterprise: non-JSON response', r.status, rawText.slice(0, 500));
      return { ok: false, reason: 'captcha_error' };
    }
    if (!r.ok) {
      console.error('verifyRecaptchaEnterprise: HTTP', r.status, rawText.slice(0, 800));
      return { ok: false, reason: 'captcha_error' };
    }
    console.log('verifyRecaptchaEnterprise: response', JSON.stringify(data));
    if (data.error) {
      console.error('verifyRecaptchaEnterprise: API error', data.error);
      return { ok: false, reason: 'captcha_error' };
    }
    if (!data.tokenProperties?.valid) {
      console.error('verifyRecaptchaEnterprise: invalid token', { invalidReason: data.tokenProperties?.invalidReason });
      return { ok: false, reason: 'captcha_failed' };
    }
    const minScore = Number(process.env.RECAPTCHA_MIN_SCORE ?? 0.1);
    const score = data.riskAnalysis?.score ?? 0;
    if (score < minScore) {
      console.error('verifyRecaptchaEnterprise: low score', { score, minScore });
      return { ok: false, reason: 'captcha_low_score' };
    }
    return { ok: true };
  } catch (e) {
    console.error('verifyRecaptchaEnterprise:', e);
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

  const teamToRaw = process.env.MARKETING_INQUIRY_NOTIFY_TO?.trim() || 'aipa@aideazz.xyz';
  const teamRecipients = teamToRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  /** Default matches verified aideazz.xyz in Resend; override for local/testing. */
  const from =
    process.env.MARKETING_INQUIRY_FROM?.trim() || 'AIdeazz <aipa@aideazz.xyz>';
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
      const err = new Error(`Resend ${r.status}: ${t}`);
      if (r.status === 403 && t.includes('verify a domain')) {
        console.error(
          '📧 Resend: unverified sender — verify aideazz.xyz at https://resend.com/domains and set MARKETING_INQUIRY_FROM to an address on that domain. Until then, Resend test mode only delivers to your Resend account email.'
        );
      }
      throw err;
    }
  };

  let teamError: unknown;
  try {
    await sendOne({
      to: teamRecipients,
      subject: `[AIdeazz] Inquiry — ${params.name || params.contactEmail || 'contact'}`,
      html: teamHtml,
      ...(params.contactEmail?.includes('@') ? { reply_to: params.contactEmail } : {}),
    });
  } catch (e) {
    teamError = e;
    console.error('📧 marketing inquiry team email failed:', e);
  }

  if (
    sendConfirmation &&
    params.contactEmail?.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.contactEmail.trim())
  ) {
    try {
      const confirmHtml = `
      <p>Hi${params.name ? ` ${esc(params.name)}` : ''},</p>
      <p>Your message was <strong>submitted successfully</strong>. We received it from <strong>aideazz.xyz</strong>.</p>
      <p>Our team will review it and get back to you at this email address when relevant.</p>
      <p style="color:#666;font-size:14px;">This is an automated confirmation — you do not need to reply unless you want to add more details.</p>
      <p>— AIdeazz</p>
    `;
      await sendOne({
        to: [params.contactEmail.trim()],
        subject: 'We received your inquiry — AIdeazz',
        html: confirmHtml,
      });
    } catch (e) {
      console.error('📧 marketing inquiry confirmation email failed:', e);
    }
  }

  if (teamError) {
    console.error(
      '📧 Team inbox notify did not send; fix Resend domain / MARKETING_INQUIRY_FROM (see logs above). Client confirmation may still have been sent.'
    );
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
