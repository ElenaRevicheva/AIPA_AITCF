/**
 * Quick AI Growth Operator Diagnostic ($100, sku `diagnostic_call`) — everything
 * that happens after PagueloFacil confirms the payment.
 *
 * Elena's flow (29 Sep 2026): client pays → she does the diagnostic → she emails the
 * written results TOGETHER WITH a one-off Calendly meeting link (her Calendly plan has
 * one event type; one-off meetings are free) → 45-minute call to go through them.
 * So this module prepares the diagnostic for her; it never books anything itself.
 *
 *   1. Client email in THEIR language (lng= on the pay page): what happens next + the $100 credit.
 *   2. The visibility engine scans their website ($0, deterministic, no LLM).
 *   3. HubSpot: deal in "🔥 I act TODAY" + a prep note (their answers, the scan, the
 *      six fit criteria, the six modules, a DRAFT results email) + a HIGH task.
 *   4. Telegram to Elena with the same essentials.
 *
 * Fit criteria and modules are the ones in the AI Growth Operator deck. Nothing here
 * is generated: every line is either the client's answer, a measured scan result,
 * or a placeholder Elena fills in after the call.
 */
import { getServiceProduct } from './aideazz-service-catalog.js';
import { getResendApiKey } from './marketing-notify.js';
import type { AuditResult } from './visibility-audit.js';

export interface PaidOrder {
  id: string;
  sku: string;
  amount_usd: number;
  client_name: string | null;
  client_email: string | null;
  company_name: string | null;
  notes: string | null;
  page_url: string | null;
}

type Lang = 'en' | 'es';

const CALL_MINUTES = 45;

/** The pay page sends `lng=en|es`; the site is LATAM-first, so Spanish is the default. */
export function orderLang(pageUrl: string | null): Lang {
  try {
    const lng = new URL(pageUrl || '').searchParams.get('lng');
    return lng === 'en' ? 'en' : 'es';
  } catch {
    return 'es';
  }
}

export interface Intake {
  website: string | null;
  channels: string | null;
  saleValue: string | null;
  freeText: string | null;
}

/**
 * The pay page writes the intake into `notes` as labelled lines
 * ("Website: …", "Customers reach us via: …", "Typical sale value: …", "Notes: …").
 * A client who skipped the fields may still have pasted a URL — take the first one.
 */
export function parseIntake(notes: string | null): Intake {
  const text = String(notes || '');
  const line = (label: RegExp) => {
    const m = text.match(label);
    return m?.[1]?.trim() || null;
  };
  let website = line(/^Website:\s*(.+)$/im);
  if (!website) {
    const url = text.match(/https?:\/\/[^\s,;]+/i)?.[0] || text.match(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\.[a-z]{2,}\b/i)?.[0];
    website = url || null;
  }
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  const structured = /^(Website|Customers reach us via|Typical sale value):/im.test(text);
  return {
    website,
    channels: line(/^Customers reach us via:\s*(.+)$/im),
    saleValue: line(/^Typical sale value:\s*(.+)$/im),
    freeText: structured ? line(/^Notes:\s*([\s\S]+)$/im) : text.trim() || null,
  };
}

type Mark = '✅' | '❌' | '❓';

/** The six "who it is designed for" criteria from the deck, ticked only from what the client told us. */
export function fitCriteria(intake: Intake): Array<{ mark: Mark; criterion: string; basis: string }> {
  const sale = (intake.saleValue || '').toLowerCase();
  const ch = (intake.channels || '').toLowerCase();
  // Pay-page options (always sent in English): Under $500 · $500–2,000 · $2,000–10,000 · Over $10,000
  const saleMark: Mark = !sale ? '❓' : /\$2,000–10,000|over \$10,000/.test(sale) ? '✅' : '❌';
  const online = /form|whatsapp|email|correo|formulario|instagram|social|redes/.test(ch);
  const waPhone = /whatsapp|phone|tel[eé]fono/.test(ch);
  return [
    { mark: saleMark, criterion: 'Average sale above roughly $2,000', basis: intake.saleValue ? `they said: ${intake.saleValue}` : 'not answered — ask' },
    { mark: online ? '✅' : '❓', criterion: 'Leads originate online; the sale is closed by a person', basis: intake.channels ? `they said: ${intake.channels}` : 'not answered — ask' },
    { mark: waPhone ? '✅' : '❓', criterion: 'WhatsApp or phone is part of the sales path', basis: intake.channels ? `they said: ${intake.channels}` : 'not answered — ask' },
    { mark: '❓', criterion: 'International or English-speaking audience; reputation and research matter', basis: 'ask on the call' },
    { mark: '❓', criterion: 'Margins high enough to justify a managed growth system', basis: 'ask on the call' },
    { mark: '❓', criterion: 'No large in-house AI team already doing the orchestration', basis: 'ask on the call' },
  ];
}

/** The six modules from the deck, each with the question that decides it. */
export const MODULES: Array<{ name: string; ask: string }> = [
  { name: 'AI search visibility', ask: 'Do customers find you through Google / ChatGPT? (the scan above is the evidence)' },
  { name: 'Autonomous prospect research', ask: 'Do you do outbound, or only wait for inbound?' },
  { name: 'WhatsApp / form qualification', ask: 'Who answers new inquiries today, and how fast?' },
  { name: 'Human-approved outreach & follow-up', ask: 'How many inquiries go quiet without a second message?' },
  { name: 'CRM operations', ask: 'Is there a CRM, and is it current?' },
  { name: 'Morning intelligence', ask: 'How does the owner know each morning what needs action?' },
];

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

async function scanWebsite(website: string | null): Promise<{ result: AuditResult | null; error: string | null }> {
  if (!website) return { result: null, error: 'no website given' };
  try {
    const { runVisibilityAudit } = await import('./visibility-audit.js');
    const result = await Promise.race([
      runVisibilityAudit(website),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('scan timed out after 60s')), 60_000)),
    ]);
    return { result, error: null };
  } catch (e) {
    return { result: null, error: String((e as Error)?.message || e).slice(0, 200) };
  }
}

export function buildClientEmail(order: PaidOrder, intake: Intake): { lang: Lang; subject: string; text: string } {
  const lang = orderLang(order.page_url);
  const product = getServiceProduct(order.sku);
  const site = intake.website ? ` (${intake.website})` : '';
  if (lang === 'en') {
    const title = product?.titleEn || order.sku;
    return {
      lang,
      subject: `Payment received — ${title} · AIdeazz`,
      text: [
        `Thank you — your payment of $${order.amount_usd} USD is confirmed.`,
        `Service: ${title}`,
        `Order: ${order.id}`,
        '',
        'What happens next:',
        `1. Elena runs your diagnostic: how AI search engines see your website${site}, and which AI Growth Operator modules fit your business — and which do not.`,
        `2. You receive the results in writing by email, together with a link to book a ${CALL_MINUTES}-minute video call with Elena to go through them.`,
        '3. On the call: what an installation would take, and whether it is worth it for you now.',
        '',
        `The $${order.amount_usd} is credited toward the audit or the installation if you decide to continue.`,
        '',
        'Just reply to this email if you have a question.',
        '',
        'Elena Revicheva · AIdeazz · https://aideazz.xyz/portfolio',
      ].join('\n'),
    };
  }
  const title = product?.titleEs || order.sku;
  return {
    lang,
    subject: `Pago recibido — ${title} · AIdeazz`,
    text: [
      `Gracias — su pago de $${order.amount_usd} USD está confirmado.`,
      `Servicio: ${title}`,
      `Orden: ${order.id}`,
      '',
      'Próximos pasos:',
      `1. Elena realiza su diagnóstico: cómo ven su sitio web los buscadores con IA${site}, y qué módulos del AI Growth Operator encajan con su negocio — y cuáles no.`,
      `2. Recibe los resultados por escrito por correo, junto con un enlace para reservar una videollamada de ${CALL_MINUTES} minutos con Elena para revisarlos.`,
      '3. En la llamada: qué implicaría la instalación y si le conviene ahora.',
      '',
      `Los $${order.amount_usd} se abonan a la auditoría o a la instalación si decide continuar.`,
      '',
      'Si tiene alguna pregunta, responda a este correo.',
      '',
      'Elena Revicheva · AIdeazz · https://aideazz.xyz/portfolio',
    ].join('\n'),
  };
}

/**
 * The results email Elena edits and sends: diagnostic results + her one-off Calendly link.
 * Measured facts only; everything else is a [bracket] she fills in.
 */
export function buildSummaryDraft(order: PaidOrder, lang: Lang, scan: AuditResult | null): string {
  const first = (order.client_name || '').trim().split(/\s+/)[0] || '';
  if (lang === 'en') {
    return [
      'Subject: Your AI Growth Operator diagnostic — results',
      '',
      `Hi ${first},`,
      '',
      'Here are the results of your diagnostic.',
      '',
      scan
        ? `AI search visibility (measured on ${scan.fetchedAt.slice(0, 10)}): your site scores ${scan.score}/100 (${scan.grade}). ` +
          (scan.topFixes.length
            ? `First fixes:\n${scan.topFixes.slice(0, 3).map((f, i) => `  ${i + 1}. ${f}`).join('\n')}`
            : 'No high-impact fixes needed.')
        : 'AI search visibility: [Elena: no scan — site unreachable or not given]',
      '',
      'Modules that fit your business now: [Elena: fill in]',
      'Modules you do not need yet: [Elena: fill in]',
      'Recommended next step: [Elena: audit ($200) / installation / nothing yet]',
      '',
      `Let's go through it together — book a ${CALL_MINUTES}-minute video call here: [Elena: paste your one-off Calendly link]`,
      '',
      `The $${order.amount_usd} you paid is credited toward the next step if you continue.`,
      '',
      'Elena Revicheva · AIdeazz',
    ].join('\n');
  }
  return [
    'Asunto: Su diagnóstico AI Growth Operator — resultados',
    '',
    `Hola ${first},`,
    '',
    'Aquí tiene los resultados de su diagnóstico.',
    '',
    scan
      ? `Visibilidad en búsquedas con IA (medido el ${scan.fetchedAt.slice(0, 10)}): su sitio obtiene ${scan.score}/100 (${scan.grade}). Primeras correcciones: [Elena: 2–3 de la lista del escaneo, en español]`
      : 'Visibilidad en búsquedas con IA: [Elena: sin escaneo — sitio no disponible o no indicado]',
    '',
    'Módulos que encajan con su negocio ahora: [Elena: completar]',
    'Módulos que todavía no necesita: [Elena: completar]',
    'Siguiente paso recomendado: [Elena: auditoría ($200) / instalación / nada por ahora]',
    '',
    `Revisémoslo juntos — reserve una videollamada de ${CALL_MINUTES} minutos aquí: [Elena: pegar su enlace único de Calendly]`,
    '',
    `Los $${order.amount_usd} que pagó se abonan al siguiente paso si decide continuar.`,
    '',
    'Elena Revicheva · AIdeazz',
  ].join('\n');
}

export function buildPrepNote(
  order: PaidOrder,
  intake: Intake,
  lang: Lang,
  scan: { result: AuditResult | null; error: string | null },
  emailSent: boolean,
): string {
  const r = scan.result;
  const lines: string[] = [
    `<strong>💳 PAID — Quick AI Growth Operator Diagnostic ($${order.amount_usd}) · ${CALL_MINUTES}-min call</strong>`,
    `Order ${esc(order.id)} · client language: ${lang.toUpperCase()} · confirmation email: ${emailSent ? 'sent' : 'NOT sent — email them yourself'}`,
    `<strong>YOUR MOVE:</strong> finish the diagnostic below → Calendly: New one-off meeting, Duration ${CALL_MINUTES} min → paste its link into the draft → send.`,
    '',
    '<strong>THEIR ANSWERS</strong>',
    `Website: ${esc(intake.website || '—')}`,
    `Customers reach them via: ${esc(intake.channels || '—')}`,
    `Typical sale value: ${esc(intake.saleValue || '—')}`,
    intake.freeText ? `Notes: ${esc(intake.freeText.slice(0, 800))}` : '',
    '',
    '<strong>AI-SEARCH SCAN (measured, visibility engine)</strong>',
    r
      ? [
          `Score ${r.score}/100 (${r.grade}) — ${esc(r.verdict)}`,
          `AI crawlers: ${r.aiEngines.map(e => `${e.engine} ${e.crawlable}`).join(' · ')}`,
          r.topFixes.length ? `Top fixes:<br>${r.topFixes.slice(0, 5).map((f, i) => `${i + 1}. ${esc(f)}`).join('<br>')}` : 'No high-impact fixes flagged.',
        ].join('<br>')
      : `No scan: ${esc(scan.error || 'unknown')}`,
    '',
    '<strong>FIT CRITERIA (from their answers — ❓ = ask on the call)</strong>',
    ...fitCriteria(intake).map(c => `${c.mark} ${esc(c.criterion)} — <em>${esc(c.basis)}</em>`),
    '',
    '<strong>MODULES TO WALK THROUGH</strong>',
    ...MODULES.map(m => `[ ] ${esc(m.name)} — ${esc(m.ask)}`),
    '',
    `<strong>DRAFT RESULTS EMAIL (${lang.toUpperCase()}) — fill the [brackets], add the one-off link, send to ${esc(order.client_email || 'the client')}</strong>`,
    `<pre style="white-space:pre-wrap;font-family:inherit">${esc(buildSummaryDraft(order, lang, r))}</pre>`,
  ];
  return lines.filter(l => l !== '').join('<br>');
}

async function sendClientEmail(order: PaidOrder, intake: Intake): Promise<boolean> {
  const apiKey = getResendApiKey();
  if (!apiKey || !order.client_email) return false;
  const { subject, text } = buildClientEmail(order, intake);
  const from = process.env.MARKETING_INQUIRY_FROM?.trim() || 'Elena Revicheva <consultas@aideazz.xyz>';
  const replyTo = process.env.MARKETING_INQUIRY_TEAM_TO?.trim() || process.env.ELENA_EMAIL?.trim();
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [order.client_email], subject, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (!r.ok) console.error(`[diagnostic] client email → ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.ok;
  } catch (e) {
    console.error('[diagnostic] client email:', e);
    return false;
  }
}

/** Runs once per paid diagnostic order (the caller already de-duplicates on status=paid). */
export async function deliverDiagnosticAfterPayment(order: PaidOrder): Promise<void> {
  const intake = parseIntake(order.notes);
  const lang = orderLang(order.page_url);
  const product = getServiceProduct(order.sku);
  const title = product?.titleEn || order.sku;

  const [emailSent, scan] = await Promise.all([sendClientEmail(order, intake), scanWebsite(intake.website)]);

  let dealId: string | null = null;
  let taskId: string | null = null;
  if (order.client_email?.trim()) {
    try {
      const { createPaidOrderDeal, addTaskToDeal } = await import('./paid-order-hubspot.js');
      const { addNoteToDeal } = await import('./hubspot-client.js');
      const pushed = await createPaidOrderDeal({
        orderId: order.id,
        service: title,
        amountUsd: order.amount_usd,
        name: order.client_name,
        email: order.client_email,
        company: order.company_name,
        website: intake.website,
        notes: order.notes,
      });
      dealId = pushed.dealId;
      if (dealId) {
        await addNoteToDeal(dealId, buildPrepNote(order, intake, lang, scan, emailSent));
        const due = new Date(Date.now() + 24 * 3600 * 1000);
        taskId = await addTaskToDeal(dealId, {
          subject: `Diagnostic results + one-off call link → ${order.company_name || order.client_name || 'client'} (paid $${order.amount_usd})`,
          body:
            `Paid ${title}. Prep note on this deal: their answers, the AI-search scan, fit criteria, modules, and a DRAFT results email. ` +
            `Fill it in, create a Calendly one-off meeting (${CALL_MINUTES} min), paste the link, send.`,
          priority: 'HIGH',
          due,
        });
      }
    } catch (e) {
      console.error('[diagnostic] hubspot:', e);
    }
  }

  const msg = [
    `💳 PAID — ${title} ($${order.amount_usd})`,
    `${order.company_name || order.client_name || 'Client'} · ${order.client_email || 'no email'} · ${lang.toUpperCase()}`,
    `Web: ${intake.website || '—'}`,
    scan.result ? `AI-search scan: ${scan.result.score}/100 (${scan.result.grade})` : `Scan: ${scan.error}`,
    `Reach: ${intake.channels || '—'} · Sale: ${intake.saleValue || '—'}`,
    `Client email: ${emailSent ? 'sent' : 'NOT SENT'}`,
    dealId ? `HubSpot: deal in 🔥 I act TODAY + prep note${taskId ? ' + HIGH task' : ' (task FAILED)'}` : 'HubSpot: FAILED — no deal created',
    `→ Your move: diagnostic results + a one-off Calendly link (${CALL_MINUTES} min). Draft is in the HubSpot note.`,
    `Order ${order.id}`,
  ].join('\n');
  console.log(`[diagnostic] delivered order ${order.id}: email=${emailSent} scan=${scan.result ? scan.result.score : 'none'} deal=${dealId ?? 'none'} task=${taskId ?? 'none'}`);
  try {
    const { sendTelegramBroadcast } = await import('./telegram-bot.js');
    await sendTelegramBroadcast(msg, { parseMode: false });
  } catch (e) {
    console.error('[diagnostic] telegram:', e);
  }
}
