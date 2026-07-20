#!/usr/bin/env node
/**
 * stage-manual-prospect.cjs — Manual Prospect Play → HubSpot (5 records).
 * Usage: node scripts/stage-manual-prospect.cjs <domain> [--dry-run]
 * Reads HUBSPOT_API_KEY from .env. Writes draft + prospect pack under docs/selling/.
 */
const fs = require('fs');
const path = require('path');
const {
  buildHubSpotWaAnchor,
  buildDualChannelNoteLinks,
  buildManualEmailSubject,
  buildManualEmailBody,
  formatPhone507,
  registerOutreachSlug,
  slugify,
} = require('./wa-link-lib.cjs');

const root = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(root, '.env'), 'utf8');
const KEY = env.match(/^HUBSPOT_API_KEY=(.+)$/m)?.[1]?.trim();
const dryRun = process.argv.includes('--dry-run');
const domainArg = process.argv.find(a => a.startsWith('--') === false && a !== process.argv[0] && a !== process.argv[1]);
if (!domainArg) {
  console.error('Usage: node scripts/stage-manual-prospect.cjs <domain> [--dry-run]');
  process.exit(1);
}
const domain = domainArg.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
const url = `https://${domain}`;

if (!KEY && !dryRun) {
  console.error('HUBSPOT_API_KEY missing in .env');
  process.exit(1);
}

const HS = 'https://api.hubapi.com';
const VIS = 'https://webhook.aideazz.xyz/cto/v1/visibility';
const headers = KEY ? { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' } : {};

async function hs(method, urlPath, body) {
  const res = await fetch(`${HS}${urlPath}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

function parseContacts(html) {
  const out = new Set();
  const patterns = [
    /wa\.me\/(\d+)/gi,
    /api\.whatsapp\.com\/send[^"']*phone=(\d+)/gi,
    /tel:([+\d\s-]+)/gi,
    /mailto:([^"'\s?]+)/gi,
    /\+507[- ]?\d{3,4}[- ]?\d{4}/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(html)) !== null) out.add(m[1] || m[0]);
  }
  const phones = [...out]
    .map(p => {
      let d = p.replace(/\D/g, '');
      // wa.me/66150368 (local 8-digit) → 50766150368
      if (d.length === 8) d = `507${d}`;
      return d;
    })
    .filter(p => p.length >= 10 && p.startsWith('507'));
  // Emails: mailto links AND plain text (many Panama sites print info@… as text).
  const junk = /\.(png|jpg|jpeg|gif|webp|svg|css|js)$|@(2x|3x)\b|sentry|wixpress|example\.|correoernesto|^[0-9]+@/i;
  const emails = [
    ...[...html.matchAll(/mailto:([^"'\s?]+)/gi)].map(m => m[1]),
    ...(html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || []),
  ]
    .map(e => e.toLowerCase())
    .filter(e => !junk.test(e));
  const wa = phones[0] || null;
  const onDomain = emails.find(e => e.endsWith(`@${domain}`) || e.includes(domain.split('.')[0]));
  const email = onDomain || emails[0] || null;
  return { phones: [...new Set(phones)], email, whatsapp: wa };
}

function weakestCategory(audit) {
  const cats = audit.categories || [];
  if (Array.isArray(cats) && cats.length) {
    const sorted = [...cats].sort((a, b) => a.score - b.score);
    const w = sorted[0];
    const labelMap = { aiAccess: 'AI Access', geo: 'GEO', aeo: 'AEO', techSeo: 'Tech' };
    return { name: labelMap[w.id] || w.label || w.id, score: w.score, id: w.id };
  }
  const scores = audit.scores || audit.breakdown || {};
  const pairs = [
    ['Tech', scores.tech ?? scores.techSeo ?? scores.technical ?? 100],
    ['AI Access', scores.aiAccess ?? scores.ai_access ?? 100],
    ['GEO', scores.geo ?? 100],
    ['AEO', scores.aeo ?? 100],
  ];
  pairs.sort((a, b) => a[1] - b[1]);
  return { name: pairs[0][0], score: pairs[0][1], id: pairs[0][0] };
}

function buildDraft(ctx) {
  const {
    domain, score, grade, weakName, weakScore, moneyQuery, compliment, pdEmoji, pdLine,
  } = ctx;
  return [
    `Hola, ¡un gusto saludarles! 👋Soy Elena Revicheva, ingeniera de IA aquí en Panamá: https://aideazz.xyz/portfolio.`,
    '',
    `Primero, felicitaciones — ${compliment}. Les escribo porque analicé ${domain} con mi motor de visibilidad en IA y obtuvo ${score}/100: cuando un ${ctx.customer} le pregunta a ChatGPT o Perplexity "${moneyQuery}", su empresa todavía no aparece como respuesta citable — ${ctx.gapClause} (${weakName} ${weakScore}/100).`,
    '',
    `Son 3 arreglos concretos. Si les parece bien, con mucho gusto se los muestro en 15 minutos, sin ningún compromiso. La auditoría completa es gratuita aquí: https://aideazz.xyz/api ${pdEmoji}`,
    '',
    `PD: Además de visibilidad en IA, ${pdLine} Todo con demos en vivo en mi portafolio👆`,
    '',
    `¡Que tengan un excelente día!`,
    `Saludos,`,
    `Elena✨🌍💫`,
  ].join('\n');
}

const PROSPECT_META = {
  'dopanama.com': {
    company: 'DoPanama',
    city: 'Panama City',
    customer: 'expat que quiere mudarse o invertir en Panamá',
    moneyQuery: '¿cómo compro propiedad / me reubico en Panamá?',
    compliment: 'su sitio transmite confianza y experiencia real con expats (videos, podcast, equipo bilingüe)',
    gapClause: 'faltan respuestas en formato FAQ que los motores puedan citar directamente',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican leads y agendan consultas de reubicación 24/7 (EN/ES, conectados a su CRM), automatización de intake de documentos para visas/residencia, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ con preguntas reales de expats (residencia, costo de vida, zonas), (2) FAQPage/LocalBusiness JSON-LD, (3) llms.txt',
    contactFirstName: 'DoPanama',
    contactLastName: '(WhatsApp contact)',
  },
  'panamaaesthetics.com': {
    company: 'Panama Aesthetics',
    city: 'Panama City',
    customer: 'paciente internacional que busca cirugía plástica o estética en Panamá',
    moneyQuery: '¿cuál es la mejor clínica de cirugía plástica en Panamá?',
    compliment: 'su sitio transmite profesionalismo médico real — contenido completo, datos estructurados y abierto a todos los motores de IA',
    gapClause: 'la página tarda más de 11 segundos en responder (los motores de IA cortan la lectura) y falta una sección de preguntas y respuestas que puedan citar',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan consultas de pacientes 24/7 (EN/ES, conectados a su CRM), automatización de intake de pacientes internacionales, video con IA para marketing de procedimientos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ con preguntas reales de pacientes (precios, recuperación, paquetes internacionales) + FAQPage JSON-LD, (2) cache/CDN del HTML — 11s → <1.5s, (3) llms.txt',
    contactFirstName: 'Panama Aesthetics',
    contactLastName: '(WhatsApp contact)',
  },
  'ycyachts.com': {
    company: 'YC Panama Yachts',
    city: 'Panama City',
    customer: 'turista internacional que quiere alquilar un yate en Panamá o San Blas',
    moneyQuery: '¿cuál es el mejor charter de yates en Panamá?',
    compliment: 'su sitio está técnicamente impecable — 100/100 en fundación técnica, acceso de IA y datos estructurados, algo que casi nadie logra',
    gapClause: 'falta una sección de preguntas y respuestas que los motores puedan citar directamente',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas de charters 24/7 (EN/ES, conectados a su CRM), automatización completa de procesos, video con IA para marketing de destinos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) sección FAQ con las preguntas reales de sus clientes (precios, rutas San Blas, qué incluye el charter) como H2/H3, (2) FAQPage JSON-LD, (3) dateModified/fechas visibles en contenido actualizado',
    contactFirstName: 'YC Panama Yachts',
    contactLastName: '(WhatsApp contact)',
  },
  'flamencomarina.com': {
    company: 'Fuerte Amador Resort & Marina',
    city: 'Panama City',
    customer: 'turista o visitante que busca marina, charter o resort en Amador / Isla Flamenco',
    moneyQuery: '¿cuál es la mejor marina o resort en Amador Panamá?',
    compliment: 'tienen un complejo real y completo en Isla Flamenco — marina, resort, charters y restaurantes en la Calzada de Amador',
    gapClause: 'casi no hay datos estructurados que ChatGPT pueda citar (sin Organization/FAQ JSON-LD) y el título/H1 no describen claramente la oferta',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas de marina, charters y eventos 24/7 (EN/ES, conectados a su CRM), automatización completa de procesos, video con IA para marketing del destino, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) Organization + LocalBusiness/Marina JSON-LD con name/url/logo/sameAs, (2) un solo H1 + title 15–70 chars que nombren la oferta (marina/resort Amador), (3) FAQ con preguntas reales de visitantes + FAQPage',
    contactFirstName: 'Fuerte Amador',
    contactLastName: '(WhatsApp contact)',
  },
  'centromarino.com': {
    company: 'Centro Marino Panamá',
    city: 'Panama City',
    customer: 'dueño de bote o comprador que busca motores Mercury, botes o servicio náutico en Panamá',
    moneyQuery: '¿dónde compro motores Mercury o servicio de botes en Panamá?',
    compliment: 'más de 35 años en el sector náutico con varias sucursales (Amador/Flamenco Marina, Ocean Reef, Club de Yates) y representación Mercury',
    gapClause: 'falta un H1 claro, poco contenido profundo y no hay FAQ en formato de preguntas que los motores puedan citar',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y califican consultas de ventas/taller 24/7 (EN/ES, conectados a su CRM), automatización de cotizaciones e intake de servicio, video con IA para marketing de botes y motores, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) un solo H1 + copy sustantivo (qué venden, a quién, prueba), (2) FAQ con preguntas reales de dueños de botes + FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Centro Marino',
    contactLastName: '(WhatsApp contact)',
  },
};

(async () => {
  console.log('DOMAIN', domain);

  // Audit
  const auditRes = await fetch(VIS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': 'aidz_demo_visibility_2026' },
    body: JSON.stringify({ url }),
  });
  const auditText = await auditRes.text();
  if (!auditRes.ok) throw new Error(`visibility audit → ${auditRes.status}: ${auditText.slice(0, 300)}`);
  const audit = JSON.parse(auditText);
  const score = Math.round(audit.score ?? audit.overall ?? audit.total ?? 0);
  const grade = audit.grade || audit.letterGrade || 'B';
  const scores = audit.scores || audit.categories || audit.breakdown || {};
  const weak = weakestCategory(audit);
  console.log('AUDIT', score, grade, weak.name, weak.score);

  const catScores = Object.fromEntries(
    (audit.categories || []).map(c => [c.id, c.score]),
  );

  // Contacts
  let html = '';
  for (const page of [url, `${url}/contact`, `${url}/contact-us`, `${url}/contacto`]) {
    try {
      const r = await fetch(page, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIPA/1.0)' } });
      if (r.ok) html += '\n' + await r.text();
    } catch { /* skip */ }
  }
  const contacts = parseContacts(html);
  console.log('CONTACTS', JSON.stringify(contacts));

  const meta = PROSPECT_META[domain];
  if (!meta) throw new Error(`No PROSPECT_META for ${domain} — add to stage-manual-prospect.cjs`);

  const phoneDigits = contacts.whatsapp || contacts.phones[0];
  if (!phoneDigits) throw new Error(`No WhatsApp/phone found on ${domain} — add manually`);

  const draft = buildDraft({
    domain,
    score,
    grade,
    weakName: weak.name,
    weakScore: weak.score,
    customer: meta.customer,
    moneyQuery: meta.moneyQuery,
    compliment: meta.compliment,
    gapClause: meta.gapClause,
    pdEmoji: meta.pdEmoji,
    pdLine: meta.pdLine,
  });

  const slug = slugify(meta.company);
  const dealName = `[CLIENT-MANUAL] ${meta.company} — GEO/AEO fix (audit: ${score}/${grade})`;

  const draftPath = `docs/selling/drafts/${slug}.txt`;
  const emailDraftPath = `docs/selling/drafts/${slug}-email.txt`;
  const prospectPath = `docs/selling/prospects/${meta.company.toUpperCase().replace(/\s+/g, '_')}.md`;

  const emailSubject = contacts.email
    ? buildManualEmailSubject(meta.company, score)
    : null;
  const emailBody = contacts.email
    ? buildManualEmailBody(draft, { botFallback: false })
    : null;

  if (!dryRun) {
    fs.writeFileSync(path.join(root, draftPath), draft + '\n', { encoding: 'utf8' });
    registerOutreachSlug(slug, phoneDigits, draftPath, meta.company, {
      email: contacts.email || undefined,
      emailDraft: contacts.email ? emailDraftPath : undefined,
      score,
    });
    if (contacts.email && emailSubject && emailBody) {
      fs.writeFileSync(
        path.join(root, emailDraftPath),
        `SUBJECT: ${emailSubject}\n\nTO: ${contacts.email}\n\n${emailBody}\n`,
        { encoding: 'utf8' },
      );
    }
  }

  const dualLinks = buildDualChannelNoteLinks(
    phoneDigits,
    contacts.email,
    draft,
    meta.company,
    score,
    slug,
  );
  const phoneFmt = formatPhone507(phoneDigits);

  // Dedupe
  if (KEY) {
    const existing = await hs('POST', '/crm/v3/objects/deals/search', {
      filterGroups: [{ filters: [{ propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: meta.company.split(' ')[0] }] }],
      properties: ['dealname'],
      limit: 10,
    });
    const dup = (existing.results || []).find(d => (d.properties?.dealname || '').includes('[CLIENT-MANUAL]') && (d.properties?.dealname || '').includes(meta.company));
    if (dup) {
      console.error('DUPLICATE', dup.id, dup.properties.dealname);
      process.exit(1);
    }
  }

  const auditLine = `${score}/100 Grade ${grade} | Tech ${catScores.techSeo ?? '?'} | AI Access ${catScores.aiAccess ?? '?'} | GEO ${catScores.geo ?? '?'} | AEO ${catScores.aeo ?? '?'} (${weak.name} ${weak.score} weakest)`;
  const emailBlock = contacts.email && emailSubject && emailBody
    ? [
        '',
        '--- EMAIL (mismo texto que el link Gmail de arriba — backup si el link se trunca) ---',
        '',
        `SUBJECT: ${escHtml(emailSubject)}`,
        `TO: ${escHtml(contacts.email)}`,
        '',
        escHtml(emailBody),
      ]
    : [
        '',
        '--- EMAIL ---',
        '',
        '<i>No on-domain email found at staging — search again if WA is a bot.</i>',
      ];
  const noteHtml = [
    `[CLIENT-MANUAL] ${meta.company} — AI Visibility outreach (https links; data verified live)`,
    '',
    dualLinks,
    '',
    '--- MENSAJE WhatsApp (plain text) ---',
    '',
    escHtml(draft),
    ...emailBlock,
    '',
    '--- Audit (verified live) ---',
    escHtml(auditLine),
    '',
    `Angle: "${score >= 85 ? 'muy cerca — 3 arreglos' : 'invisible as citable answer'}". Money query: ${meta.moneyQuery}`,
    '',
    `Top fixes: ${meta.topFixes}.`,
    '',
    `Contacts: WhatsApp ${phoneFmt}${contacts.email ? ` | ${contacts.email}` : ''} | ${domain}`,
    '',
    'Next: Click WhatsApp OR Gmail one-click (prefilled → Send). If WA is a bot → use Gmail. Email watcher auto-advances HubSpot-logged/Gmail-synced sends when visible.',
  ].join('<br>');

  if (dryRun) {
    console.log('DRY_RUN dealName', dealName);
    console.log('DRAFT_PREVIEW', draft.slice(0, 200) + '...');
    console.log('WA', waUrl.slice(0, 80) + '...');
    return;
  }

  // Company
  const companyId = await hs('POST', '/crm/v3/objects/companies', {
    properties: {
      name: meta.company,
      domain,
      website: url,
      city: meta.city,
      phone: phoneFmt,
      ...(contacts.email ? { description: `Email: ${contacts.email}` } : {}),
    },
  }).then(r => r.id);

  // Contact
  const contactProps = {
    firstname: meta.contactFirstName,
    lastname: meta.contactLastName,
    company: meta.company,
    phone: phoneFmt,
    lifecyclestage: 'opportunity',
    hs_lead_status: 'OPEN',
    ...(contacts.email ? { email: contacts.email } : {}),
  };
  const contactId = await hs('POST', '/crm/v3/objects/contacts', { properties: contactProps }).then(r => r.id);

  // Deal — qualifiedtobuy = I Act TODAY
  const dealId = await hs('POST', '/crm/v3/objects/deals', {
    properties: {
      dealname: dealName,
      dealstage: 'qualifiedtobuy',
      pipeline: 'default',
    },
  }).then(r => r.id);

  // Note
  const note = await hs('POST', '/crm/v3/objects/notes', {
    properties: { hs_note_body: noteHtml, hs_timestamp: new Date().toISOString() },
  });
  await hs('PUT', `/crm/v4/objects/notes/${note.id}/associations/deals/${dealId}`, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 },
  ]);

  // Task — due today, HIGH
  const due = new Date();
  due.setHours(23, 59, 0, 0);
  const task = await hs('POST', '/crm/v3/objects/tasks', {
    properties: {
      hs_task_subject: `Send outreach → ${meta.company} (WhatsApp first; email if bot)`,
      hs_task_body: contacts.email
        ? `1) Open deal note → WhatsApp link → Send. 2) If a reservations/menu BOT answers → use EMAIL mailto or HubSpot Email to ${contacts.email} (subject + body in note).`
        : `Open deal note → click WhatsApp → Send. No email found at staging — search again if WA is a bot.`,
      hs_task_status: 'NOT_STARTED',
      hs_task_priority: 'HIGH',
      hs_timestamp: due.toISOString(),
    },
  });
  await hs('PUT', `/crm/v4/objects/tasks/${task.id}/associations/deals/${dealId}`, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 216 },
  ]);

  // Associations
  await hs('PUT', `/crm/v4/objects/contacts/${contactId}/associations/companies/${companyId}`, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 1 },
  ]);
  await hs('PUT', `/crm/v4/objects/deals/${dealId}/associations/contacts/${contactId}`, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 },
  ]);
  await hs('PUT', `/crm/v4/objects/deals/${dealId}/associations/companies/${companyId}`, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 5 },
  ]);

  // Prospect pack
  registerOutreachSlug(slug, phoneDigits, draftPath, meta.company, {
    email: contacts.email || undefined,
    emailDraft: contacts.email ? emailDraftPath : undefined,
    score,
    dealId,
  });
  const pack = `# [CLIENT-MANUAL] ${meta.company} — HubSpot note pack

> Staged ${new Date().toISOString().slice(0, 10)}. Deal: \`${dealName}\` (ID ${dealId}).
> Draft: \`${draftPath}\`
> Email one-click: \`https://webhook.aideazz.xyz/cto/go/outreach-email/${slug}\` (from aipa@aideazz.xyz)

Deal **${dealId}** | Company **${companyId}** | Contact **${contactId}** | Note **${note.id}** | Task **${task.id}**
`;
  fs.writeFileSync(path.join(root, prospectPath), pack, 'utf8');

  console.log(JSON.stringify({
    ok: true,
    domain,
    dealId,
    dealName,
    companyId,
    contactId,
    noteId: note.id,
    taskId: task.id,
    audit: { score, grade, weak },
    phone: phoneFmt,
    draftPath,
    prospectPath,
  }, null, 2));
})().catch(e => {
  console.error(String(e.message || e));
  process.exit(1);
});
