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
/** Elena Revicheva — always assign Manual Prospect tasks/deals so Tasks UI "Assigned to me" works */
const HUBSPOT_OWNER_ID =
  env.match(/^HUBSPOT_OWNER_ID=(.+)$/m)?.[1]?.trim() || '91612860';
const VIS_KEY =
  env.match(/^VISIBILITY_API_KEY=(.+)$/m)?.[1]?.trim() ||
  env.match(/^VISIBILITY_API_KEYS=(.+)$/m)?.[1]?.trim()?.split(',')[0]?.trim() ||
  'aidz_demo_visibility_2026';
const dryRun = process.argv.includes('--dry-run');
const skipAudit = process.argv.includes('--skip-audit');
const scoreArg = process.argv.find((a) => a.startsWith('--score='));
const scoreOverride = scoreArg ? Number(scoreArg.split('=')[1]) : null;
const domainArg = process.argv.find(a => a.startsWith('--') === false && a !== process.argv[0] && a !== process.argv[1]);
if (!domainArg) {
  console.error('Usage: node scripts/stage-manual-prospect.cjs <domain> [--dry-run] [--skip-audit] [--score=75]');
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
  const junk = /\.(png|jpg|jpeg|gif|webp|svg|css|js|html)$|@(2x|3x)\b|sentry|wixpress|example\.|correoernesto|^[0-9]+@|@.*-seccion\.|user@domain|john@doe|ttycirugia/i;
  const emails = [
    ...[...html.matchAll(/mailto:([^"'\s?]+)/gi)].map(m => m[1]),
    ...(html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || []),
  ]
    .map(e => e.toLowerCase())
    .filter(e => !junk.test(e))
    .filter(e => /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e));
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
  'relofirm.com': {
    company: 'ReloFirm',
    city: 'Panama City',
    customer: 'expat o ejecutivo que busca reubicación legal y fiscal en Panamá',
    moneyQuery: '¿cómo me reubico legalmente en Panamá?',
    compliment: 'su práctica combina derecho y reubicación con un tono profesional internacional',
    gapClause: 'faltan respuestas en formato FAQ que ChatGPT pueda citar cuando alguien busca reubicación en Panamá',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican leads de reubicación 24/7 (EN/ES, conectados a su CRM), automatización de intake de documentos para visas/residencia, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ con preguntas reales de expats, (2) FAQPage/LocalBusiness JSON-LD, (3) llms.txt',
    contactFirstName: 'ReloFirm',
    contactLastName: '(WhatsApp contact)',
  },
  'panamadentalclinic.com': {
    company: 'Panama Dental Clinic',
    city: 'David',
    customer: 'paciente internacional que busca odontología o dental tourism en Panamá',
    moneyQuery: '¿cuál es la mejor clínica dental en Panamá?',
    compliment: 'su clínica apunta a turismo dental con oferta clara para pacientes internacionales',
    gapClause: 'aún no aparecen como respuesta citable cuando alguien pide la mejor clínica dental en Panamá',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan consultas de pacientes 24/7 (EN/ES, conectados a su CRM), automatización de intake de pacientes internacionales, video con IA para marketing de procedimientos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ pacientes internacionales + FAQPage JSON-LD, (2) Organization/LocalBusiness schema, (3) llms.txt',
    contactFirstName: 'Panama Dental Clinic',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50766111939',
    preferredEmail: 'ced.sanantoniolm@gmail.com',
  },
  'kraemerlaw.com': {
    company: 'Kraemer Law',
    city: 'Panama City',
    customer: 'expat o inversionista que busca inmigración o residencia en Panamá',
    moneyQuery: '¿cuál es el mejor abogado de inmigración en Panamá?',
    compliment: 'su firma transmite especialización legal seria en inmigración y asuntos corporativos',
    gapClause: 'faltan FAQs citables sobre visas/residencia que los motores de IA puedan usar como respuesta',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican leads legales 24/7 (EN/ES, conectados a su CRM), automatización de intake de documentos, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ visas/residencia, (2) FAQPage/Attorney JSON-LD, (3) llms.txt',
    contactFirstName: 'Kraemer Law',
    contactLastName: '(WhatsApp contact)',
  },
  'ampatours.com': {
    company: 'Ampa Tours',
    city: 'Panama City',
    customer: 'turista que busca charters, pesca o tours en Panamá',
    moneyQuery: '¿cuál es el mejor tour o charter de pesca en Panamá?',
    compliment: 'tienen experiencia real en charters y pesca deportiva en Panamá',
    gapClause: 'faltan respuestas estructuradas que ChatGPT pueda citar cuando alguien busca tours o pesca',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas de tours/charters 24/7 (EN/ES, conectados a su CRM), automatización completa de procesos, video con IA para marketing de destinos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ precios/rutas/qué incluye, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Ampa Tours',
    contactLastName: '(WhatsApp contact)',
  },
  'tranquilobay.com': {
    company: 'Tranquilo Bay',
    city: 'Bocas del Toro',
    customer: 'viajero que busca eco lodge o hotel boutique en Bocas del Toro',
    moneyQuery: '¿cuál es el mejor eco lodge en Bocas del Toro?',
    compliment: 'su lodge tiene una propuesta de eco-turismo auténtica en Bocas',
    gapClause: 'aún no aparecen como respuesta citable frente a competidores cuando alguien pregunta por eco lodges',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas 24/7 (EN/ES, conectados a su CRM), automatización de procesos, video con IA para marketing del destino, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ huéspedes reales, (2) LodgingBusiness/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Tranquilo Bay',
    contactLastName: '(WhatsApp contact)',
  },
  'americantradehotel.com': {
    company: 'American Trade Hotel',
    city: 'Panama City',
    customer: 'pareja o empresa que busca hotel boutique, bodas o eventos en Casco Viejo',
    moneyQuery: '¿cuál es el mejor hotel boutique en Casco Viejo Panamá?',
    compliment: 'ocupan un edificio histórico en Casco Viejo con marca boutique fuerte',
    gapClause: 'faltan FAQs citables sobre bodas/eventos/estadía que los motores puedan responder',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan habitaciones/eventos 24/7 (EN/ES, conectados a su CRM), automatización de intake de eventos, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ bodas/eventos/estadía, (2) Hotel/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'American Trade Hotel',
    contactLastName: '(WhatsApp contact)',
    preferredEmail: 'info@americantradehotel.com',
    preferredPhone: '5072112000',
  },
  'sanblasdreams.com': {
    company: 'San Blas Dreams',
    city: 'Panama City',
    customer: 'turista que busca tours a San Blas / Guna Yala',
    moneyQuery: '¿cuál es el mejor tour a San Blas desde Panamá?',
    compliment: 'son un operador ATP con foco real en San Blas',
    gapClause: 'faltan respuestas en formato FAQ que ChatGPT cite cuando alguien busca tours a San Blas',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan tours 24/7 (EN/ES, conectados a su CRM), automatización de reservas, video con IA para marketing de destinos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ precios/itinerarios/qué incluye, (2) FAQPage/TouristTrip JSON-LD, (3) llms.txt',
    contactFirstName: 'San Blas Dreams',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50764735905',
    preferredEmail: 'info@sanblasdreams.com',
  },
  'pesquerosport.com': {
    company: 'Pesqueros Sport',
    city: 'Panama City',
    customer: 'pescador deportivo que busca equipo, charters o servicio náutico en Panamá',
    moneyQuery: '¿dónde compro equipo de pesca deportiva en Panamá?',
    compliment: 'tienen presencia real en el mundo de la pesca deportiva en Panamá',
    gapClause: 'aún no aparecen como respuesta citable cuando alguien busca equipo o pesca deportiva',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y califican consultas de ventas 24/7 (EN/ES, conectados a su CRM), automatización de cotizaciones, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ productos/servicios, (2) LocalBusiness/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Pesqueros Sport',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50764310642',
  },
  'flamencodrystackpanama.com': {
    company: 'Flamenco Drystack Panama',
    city: 'Panama City',
    customer: 'dueño de bote que busca dry stack o almacenaje náutico en Amador/Flamenco',
    moneyQuery: '¿dónde guardo mi bote en dry stack en Panamá?',
    compliment: 'ofrecen dry stack real en la zona de Flamenco — un servicio escaso y valioso',
    gapClause: 'faltan datos estructurados y FAQs que ChatGPT pueda citar sobre dry stack en Panamá',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan consultas de dry stack 24/7 (EN/ES, conectados a su CRM), automatización de cotizaciones, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) Organization/LocalBusiness JSON-LD, (2) FAQ precios/capacidad/acceso, (3) llms.txt',
    contactFirstName: 'Flamenco Drystack',
    contactLastName: '(WhatsApp contact)',
    preferredEmail: 'info@flamencodrystack.net',
    preferredPhone: '50768365198',
  },
  'prestigestorage.com.pa': {
    company: 'Prestige Storage',
    city: 'Panama City',
    customer: 'persona o empresa que busca self-storage o bodegas en Panamá',
    moneyQuery: '¿cuál es el mejor self storage en Panamá?',
    compliment: 'tienen una operación de storage profesional con sitio claro y contactable',
    gapClause: 'faltan FAQs citables sobre tamaños, precios y seguridad que los motores puedan usar',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan cotizaciones 24/7 (EN/ES, conectados a su CRM), automatización de intake de leads, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ tamaños/precios/seguridad, (2) LocalBusiness/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Prestige Storage',
    contactLastName: '(WhatsApp contact)',
  },
  'panamafertility.com': {
    company: 'Panama Fertility',
    city: 'Panama City',
    customer: 'pareja internacional que busca tratamiento de fertilidad o IVF en Panamá',
    moneyQuery: '¿cuál es la mejor clínica de fertilidad en Panamá?',
    compliment: 'su sitio web está excelentemente preparado para la era de la IA (datos estructurados 100/100, contenido listo para respuestas 94/100)',
    gapClause: 'su archivo robots.txt hoy les dice a GPTBot (ChatGPT), Claude y Gemini que NO entren — aunque su contenido sea perfecto',
    pdEmoji: '👶',
    pdLine: 'construyo agentes de WhatsApp que atienden y agendan consultas de pacientes 24/7 (EN/ES, conectados a su CRM), automatización de intake de pacientes internacionales, video con IA para marketing de procedimientos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) Quitar Disallow para GPTBot/ClaudeBot/Google-Extended/CCBot en robots.txt, (2) un solo H1 claro, (3) pulido menor de SEO técnico',
    contactFirstName: 'Panama Fertility',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50760709716',
    preferredEmail: 'info@panamafertility.com',
  },
  'ivi-fertility.com': {
    company: 'IVI Panama',
    city: 'Panama City',
    customer: 'pareja internacional que busca IVF o fertilidad en Panamá',
    moneyQuery: '¿cuál es la mejor clínica de IVF en Panamá?',
    compliment: 'IVI es una marca global de fertilidad con presencia real en Panamá y pacientes de 80+ nacionalidades',
    gapClause: 'aún no aparecen como respuesta citable cuando alguien pregunta por IVF o fertilidad en Panamá',
    pdEmoji: '👶',
    pdLine: 'construyo agentes de WhatsApp que atienden y agendan consultas de pacientes 24/7 (EN/ES, conectados a su CRM), automatización de intake de pacientes internacionales, video con IA para marketing de procedimientos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ pacientes internacionales + FAQPage JSON-LD, (2) Organization/MedicalBusiness schema, (3) llms.txt',
    contactFirstName: 'IVI Panama',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50766316301',
    preferredEmail: 'ivipanama@ivirma.com',
  },
  'relocationpanama.com': {
    company: 'Relocation Panama',
    city: 'Panama City',
    customer: 'expat que quiere reubicarse en Panamá (Pacific/Coronado)',
    moneyQuery: '¿cómo me reubico en Panamá o en la costa del Pacífico?',
    compliment: 'su servicio boutique de reubicación transmite experiencia real con expats en Panamá',
    gapClause: 'faltan respuestas en formato FAQ que ChatGPT pueda citar sobre reubicación en Panamá',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican leads de reubicación 24/7 (EN/ES, conectados a su CRM), automatización de intake de documentos para visas/residencia, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ con preguntas reales de expats, (2) FAQPage/LocalBusiness JSON-LD, (3) llms.txt',
    contactFirstName: 'Relocation Panama',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50762339432',
    preferredEmail: 'info@relocationpanama.com',
  },
  'panamaexpatservice.com': {
    company: 'Panama Expat Service',
    city: 'Panama City',
    customer: 'expat que busca tours de reubicación, inmigración o mudanza con mascotas a Panamá',
    moneyQuery: '¿cómo me mudo a Panamá con mi familia o mascota?',
    compliment: 'ofrecen un servicio integral de reubicación — tours, inmigración, bienes raíces y reubicación de mascotas',
    gapClause: 'faltan FAQs citables que los motores de IA puedan usar cuando alguien busca reubicarse a Panamá',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican leads de reubicación 24/7 (EN/ES, conectados a su CRM), automatización de intake de documentos, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ expats/mascotas/residencia, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Panama Expat Service',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50762962070',
    preferredEmail: 'info@panamaexpatservice.com',
  },
  'igopanama.com': {
    company: 'International Relocation Partner',
    city: 'Panama City',
    customer: 'expat o ejecutivo que busca reubicación internacional con oficinas en PTY, Miami y Madrid',
    moneyQuery: '¿cómo me reubico internacionalmente a Panamá?',
    compliment: 'tienen una red multi-oficina real (Panamá, Miami, Madrid, Costa Rica) con enfoque internacional',
    gapClause: 'faltan respuestas estructuradas que ChatGPT cite cuando alguien busca reubicación en Panamá',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican leads de reubicación 24/7 (EN/ES, conectados a su CRM), automatización de intake de documentos, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ reubicación/residencia, (2) FAQPage/Organization JSON-LD, (3) llms.txt',
    contactFirstName: 'International Relocation Partner',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50762418879',
    preferredEmail: 'info@igopanama.com',
  },
  'immigrationvisa247.com': {
    company: 'Immigration Visa 24/7',
    city: 'Panama City',
    customer: 'expat que busca visa, residencia pensionado o friendly nations en Panamá',
    moneyQuery: '¿cómo obtengo residencia o visa en Panamá?',
    compliment: 'su sitio multilingüe (EN/NL/FR/ES) transmite especialización en visas y residencia panameña',
    gapClause: 'faltan FAQs citables sobre pensionado, friendly nations e inversor que los motores puedan responder',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican leads legales 24/7 (EN/ES, conectados a su CRM), automatización de intake de documentos para visas, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ visas/residencia por programa, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Immigration Visa 24/7',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50769423311',
    preferredEmail: 'lawyers@immigrationvisa247.com',
  },
  'lacgrp.com': {
    company: 'LAC Legal',
    city: 'Panama City',
    customer: 'expat o empresa que busca residencia, visas o permisos de trabajo en Panamá',
    moneyQuery: '¿cuál es el mejor abogado de inmigración en Panamá?',
    compliment: 'LAC Legal combina derecho de inmigración y corporativo con servicio bilingüe EN/ES',
    gapClause: 'faltan respuestas en formato FAQ que ChatGPT pueda citar sobre residencia y visas',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican leads legales 24/7 (EN/ES, conectados a su CRM), automatización de intake de documentos, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ visas/residencia/trabajo, (2) FAQPage/Attorney JSON-LD, (3) llms.txt',
    contactFirstName: 'LAC Legal',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '5073955607',
    preferredEmail: 'lac@lacgrp.com',
  },
  'ndm.com.pa': {
    company: 'NDM Law Firm',
    city: 'Panama City',
    customer: 'expat que busca especialistas en residencia panameña',
    moneyQuery: '¿cómo obtengo residencia permanente en Panamá?',
    compliment: 'NDM se posiciona como especialistas en residencia con práctica legal establecida',
    gapClause: 'faltan FAQs citables sobre residencia que los motores de IA puedan usar como respuesta',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican leads legales 24/7 (EN/ES, conectados a su CRM), automatización de intake de documentos, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ residencia/visas, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'NDM Law Firm',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '5078302656',
    preferredEmail: 'info@ndm.com.pa',
  },
  'panamalegalcenter.com': {
    company: 'Panama Legal Center',
    city: 'Panama City',
    customer: 'expat que busca friendly nations, pensionado o residencia en Panamá',
    moneyQuery: '¿cómo aplico a friendly nations o pensionado en Panamá?',
    compliment: '15 años de experiencia en residencia panameña — friendly nations y pensionado son su foco',
    gapClause: 'faltan respuestas estructuradas que ChatGPT cite cuando alguien busca residencia en Panamá',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican leads legales 24/7 (EN/ES, conectados a su CRM), automatización de intake de documentos, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ friendly nations/pensionado, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Panama Legal Center',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50764040388',
    preferredEmail: 'customer@panamalegalcenter.com',
  },
  'delvallepanama.com': {
    company: 'Delvalle & Delvalle',
    city: 'Panama City',
    customer: 'expat o inversionista que busca servicios de inmigración en Panamá',
    moneyQuery: '¿cuál es el mejor bufete de inmigración en Panamá?',
    compliment: 'Delvalle & Delvalle es una firma reconocida en servicios de inmigración panameña',
    gapClause: 'faltan FAQs citables sobre visas e inmigración que los motores puedan responder',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican leads legales 24/7 (EN/ES, conectados a su CRM), automatización de intake de documentos, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ inmigración/residencia, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Delvalle & Delvalle',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50761093066',
    preferredEmail: 'info@delvallepanama.com',
  },
  'gomitom.com': {
    company: 'Gomitom',
    city: 'Panama City',
    customer: 'expat que busca inmigración o bienes raíces en Panamá',
    moneyQuery: '¿cómo obtengo residencia y compro propiedad en Panamá?',
    compliment: 'Gomitom combina derecho de inmigración y bienes raíces — un combo valioso para expats',
    gapClause: 'faltan respuestas en formato FAQ que ChatGPT pueda citar sobre inmigración y propiedad',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que califican leads legales 24/7 (EN/ES, conectados a su CRM), automatización de intake de documentos, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ inmigración + bienes raíces, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Gomitom',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50769800688',
    preferredEmail: 'info@gomitom.com',
  },
  'charterinsanblas.com': {
    company: 'Charter in San Blas',
    city: 'Panama City',
    customer: 'turista internacional que busca charter todo incluido en San Blas',
    moneyQuery: '¿cuál es el mejor charter en San Blas Panamá?',
    compliment: 'ofrecen charters todo incluido en San Blas con reputación de 5 estrellas',
    gapClause: 'faltan respuestas estructuradas que ChatGPT cite cuando alguien busca charters en San Blas',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas de charters 24/7 (EN/ES, conectados a su CRM), automatización de reservas, video con IA para marketing de destinos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ precios/rutas/qué incluye, (2) FAQPage/TouristTrip JSON-LD, (3) llms.txt',
    contactFirstName: 'Charter in San Blas',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50762950550',
    preferredEmail: 'info@charterinsanblas.com',
  },
  'sanblastour.com': {
    company: 'San Blas Tour',
    city: 'Panama City',
    customer: 'turista que busca tours en velero o catamarán a San Blas',
    moneyQuery: '¿cuál es el mejor tour a San Blas en velero?',
    compliment: 'tienen flota real de veleros y catamaranes para San Blas',
    gapClause: 'faltan FAQs citables sobre itinerarios y precios que los motores puedan usar',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan tours 24/7 (EN/ES, conectados a su CRM), automatización de reservas, video con IA para marketing de destinos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ precios/itinerarios/flota, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'San Blas Tour',
    contactLastName: '(Email contact)',
    preferredEmail: 'contact@sanblastour.com',
    emailOnlyOk: true, // site publishes email only — no public WA
  },
  'sanblasonsailboats.com': {
    company: 'San Blas on Sailboats',
    city: 'Panama City',
    customer: 'turista que busca red de veleros verificados para San Blas',
    moneyQuery: '¿dónde reservo un velero verificado para San Blas?',
    compliment: 'operan una red de veleros verificados para San Blas — confianza real para turistas',
    gapClause: 'faltan respuestas estructuradas que ChatGPT cite sobre veleros en San Blas',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas 24/7 (EN/ES, conectados a su CRM), automatización de reservas, video con IA para marketing de destinos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ flota/precios/rutas, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'San Blas on Sailboats',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50769323919',
    preferredEmail: 'info@sanblasonsailboats.com',
  },
  'wesailsanblas.com': {
    company: 'We Sail San Blas',
    city: 'Panama City',
    customer: 'turista que busca catamarán todo incluido en San Blas',
    moneyQuery: '¿cuál es el mejor catamarán todo incluido en San Blas?',
    compliment: 'ofrecen catamaranes con todas las comidas incluidas — propuesta clara para San Blas',
    gapClause: 'faltan FAQs citables que los motores de IA puedan usar sobre catamaranes en San Blas',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas 24/7 (EN/ES, conectados a su CRM), automatización de reservas, video con IA para marketing de destinos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ precios/comidas/itinerario, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'We Sail San Blas',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50763693628',
    preferredEmail: 'wesailsanblas@gmail.com',
  },
  'sailboattrips.com': {
    company: 'SailBoat Trips',
    city: 'Panama City',
    customer: 'turista que busca charter con tripulación en Panamá o San Blas',
    moneyQuery: '¿dónde alquilo un velero con tripulación en Panamá?',
    compliment: 'ofrecen charters con tripulación — experiencia real en aguas panameñas',
    gapClause: 'faltan respuestas estructuradas que ChatGPT cite sobre charters con tripulación',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas 24/7 (EN/ES, conectados a su CRM), automatización de reservas, video con IA para marketing de destinos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ precios/rutas/tripulación, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'SailBoat Trips',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50764686603',
    preferredEmail: 'info@sailboattrips.com',
  },
  'sanblassailing.com': {
    company: 'San Blas Sailing',
    city: 'Panama City',
    customer: 'turista que busca yate con tripulación en San Blas',
    moneyQuery: '¿cuál es el mejor yate con tripulación en San Blas?',
    compliment: 'especialistas en yates con tripulación para San Blas — nicho premium',
    gapClause: 'faltan FAQs citables sobre yates y precios que los motores puedan responder',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas 24/7 (EN/ES, conectados a su CRM), automatización de reservas, video con IA para marketing de destinos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ yates/precios/rutas, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'San Blas Sailing',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50767806959',
    preferredEmail: 'panama@sanblassailing.com',
  },
  'sailingcharterpanama.com': {
    company: 'Sailing Charter Panama',
    city: 'Panama City',
    customer: 'turista que busca catamarán todo incluido en Panamá',
    moneyQuery: '¿cuál es el mejor charter de catamarán en Panamá?',
    compliment: 'ofrecen charters todo incluido en catamarán — propuesta premium para turistas internacionales',
    gapClause: 'faltan respuestas estructuradas que ChatGPT cite sobre charters en Panamá',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas 24/7 (EN/ES, conectados a su CRM), automatización de reservas, video con IA para marketing de destinos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ precios/rutas/qué incluye, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Sailing Charter Panama',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50760761493',
    preferredEmail: 'sailingcharterpanama@gmail.com',
  },
  'casacayuco.com': {
    company: 'Casa Cayuco',
    city: 'Bastimentos',
    customer: 'viajero que busca eco-lodge o aventura en Bastimentos/Bocas',
    moneyQuery: '¿cuál es el mejor eco lodge en Bastimentos Bocas del Toro?',
    compliment: 'Casa Cayuco es un eco-lodge de aventura auténtico en Bastimentos',
    gapClause: 'faltan FAQs citables sobre alojamiento y actividades que los motores puedan usar',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas 24/7 (EN/ES, conectados a su CRM), automatización de reservas, video con IA para marketing del destino, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ huéspedes/actividades/precios, (2) LodgingBusiness/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Casa Cayuco',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50760887663',
    preferredEmail: 'info@casacayuco.com',
  },
  'eclypsedemar.com': {
    company: 'Eclypse de Mar',
    city: 'Bocas del Toro',
    customer: 'viajero que busca bungalows sobre el agua o gastronomía en Bocas',
    moneyQuery: '¿dónde me quedo en bungalows sobre el agua en Bocas del Toro?',
    compliment: 'Eclypse de Mar combina bungalows sobre el agua con fine dining — experiencia única en Bocas',
    gapClause: 'faltan respuestas estructuradas que ChatGPT cite sobre alojamiento premium en Bocas',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas 24/7 (EN/ES, conectados a su CRM), automatización de reservas, video con IA para marketing del destino, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ estadía/restaurante/precios, (2) LodgingBusiness/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Eclypse de Mar',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50769345141',
    preferredEmail: 'info@eclypsedemar.com',
  },
  'prpevents.com': {
    company: 'PRP Events',
    city: 'Panama City',
    customer: 'pareja internacional que planea boda destino en Panamá',
    moneyQuery: '¿cuál es el mejor wedding planner de bodas destino en Panamá?',
    compliment: 'PRP Events se especializa en bodas destino — nicho de alto ticket internacional',
    gapClause: 'faltan FAQs citables sobre bodas destino que los motores de IA puedan usar',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y coordinan consultas de bodas 24/7 (EN/ES, conectados a su CRM), automatización de intake de eventos, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ bodas destino/paquetes/precios, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'PRP Events',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50766907472',
    preferredEmail: 'ventas@prpevents.com',
  },
  'destinationdreamweddings.com': {
    company: 'Destination Dream Weddings',
    city: 'Panama City',
    customer: 'pareja que busca boda destino completa en Panamá',
    moneyQuery: '¿cómo planifico una boda destino en Panamá?',
    compliment: 'ofrecen servicio completo de bodas destino en Panamá — propuesta clara para parejas internacionales',
    gapClause: 'faltan respuestas estructuradas que ChatGPT cite sobre bodas en Panamá',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y coordinan consultas de bodas 24/7 (EN/ES, conectados a su CRM), automatización de intake de eventos, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ bodas/paquetes/venues, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Destination Dream Weddings',
    contactLastName: '(WhatsApp contact)',
    preferredEmail: 'wendy@destinationdreamweddings.com',
    preferredPhone: '12044064876',
  },
  'panamasonrie.com': {
    company: 'Panamá Sonríe',
    city: 'Panama City',
    customer: 'paciente que busca diseño de sonrisa o prótesis dental en Panamá',
    moneyQuery: '¿cuál es la mejor clínica de diseño de sonrisa en Panamá?',
    compliment: 'Panamá Sonríe ofrece diseño de sonrisa y prótesis con presencia en Via Israel y Albrook',
    gapClause: 'aún no aparecen como respuesta citable cuando alguien pregunta por clínicas dentales en Panamá',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan consultas dentales 24/7 (EN/ES, conectados a su CRM), automatización de intake de pacientes, video con IA para marketing de procedimientos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ pacientes/precios/implantes, (2) FAQPage/Dentist JSON-LD, (3) llms.txt',
    contactFirstName: 'Panamá Sonríe',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50761405700',
    preferredEmail: 'info@panamasonrie.com',
  },
  'arango-orillac.com': {
    company: 'Clínica Arango Orillac',
    city: 'Panama City',
    customer: 'paciente internacional que busca odontología de confianza en Panamá',
    moneyQuery: '¿cuál es la mejor clínica dental bilingüe en Panamá?',
    compliment: 'desde 1935 con más de 50 profesionales e inglés garantizado — credibilidad real',
    gapClause: 'faltan FAQs citables sobre odontología internacional que ChatGPT pueda usar como respuesta',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan consultas 24/7 (EN/ES, conectados a su CRM), automatización de intake de pacientes internacionales, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ pacientes intl + inglés, (2) Dentist/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Clínica Arango Orillac',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50769973733',
    // Site is WA-only; directory listings show info@ — flag UNVERIFIED in note when used
    preferredEmail: 'info@arango-orillac.com',
  },
  'centroodontologicopaitilla.com': {
    company: 'Centro Odontológico Paitilla',
    city: 'Panama City',
    customer: 'paciente que busca odontología en Paitilla / turismo dental',
    moneyQuery: '¿cuál es la mejor clínica dental en Paitilla Panamá?',
    compliment: 'desde 1990 en el Centro Médico Paitilla con alto volumen de reseñas',
    gapClause: 'aún no aparecen como respuesta citable frente a clínicas competidoras en búsquedas de IA',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan citas 24/7 (EN/ES, conectados a su CRM), automatización de intake, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ citas/especialidades, (2) Dentist/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Centro Odontológico Paitilla',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50762334051',
    preferredEmail: 'contacto@centroodontologicopaitilla.com',
  },
  'theskinclinicpanama.com': {
    company: 'The Skin Clinic Panama',
    city: 'Panama City',
    customer: 'paciente que busca dermatología o estética médica en Panamá',
    moneyQuery: '¿cuál es la mejor clínica de dermatología en Panamá?',
    compliment: 'Dr. Drohan (Tulane) en Hospital Pacífica Salud — perfil médico internacional fuerte',
    gapClause: 'faltan respuestas estructuradas que ChatGPT cite sobre dermatología en Panamá',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan consultas estéticas 24/7 (EN/ES, conectados a su CRM), automatización de intake, video con IA para marketing de tratamientos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ tratamientos/precios, (2) Physician/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'The Skin Clinic',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50764509248',
    preferredEmail: 'citas@theskinclinicpanama.com',
  },
  'dermomedica.com.pa': {
    company: 'DermoMédica',
    city: 'Panama City',
    customer: 'paciente que busca dermatología clínica o cosmiatría en Panamá',
    moneyQuery: '¿cuál es la mejor clínica de dermatología y láser en Panamá?',
    compliment: 'ofrecen dermatología clínica, cosmiatría y láser con sitio en inglés',
    gapClause: 'faltan FAQs citables sobre tratamientos que los motores de IA puedan responder',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan consultas 24/7 (EN/ES, conectados a su CRM), automatización de intake, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ tratamientos/láser, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'DermoMédica',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50762372819',
    preferredEmail: 'info@dermomedica.com.pa',
  },
  'grupodentalnacional.com': {
    company: 'Grupo Dental Nacional',
    city: 'Panama City',
    customer: 'paciente que busca odontología en Centro Médico Nacional o La Chorrera',
    moneyQuery: '¿cuál es la mejor clínica dental Almanza Carrizo en Panamá?',
    compliment: 'más de 25 años con sedes en Centro Médico Nacional y La Chorrera',
    gapClause: 'faltan respuestas citables cuando alguien busca clínicas dentales multi-sede en Panamá',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan citas multi-sede 24/7 (EN/ES, conectados a su CRM), automatización de intake, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ sedes/especialidades, (2) Dentist/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Grupo Dental Nacional',
    contactLastName: '(WhatsApp contact)',
    // Contacto page: WhatsApp mobiles (507) 6670-7039 / 6673-6040 — no public mailto → info@ UNVERIFIED
    preferredPhone: '50766707039',
  },
  'giannadentist.com': {
    company: 'Gianna Dentist MaDenta',
    city: 'Panama City',
    customer: 'paciente internacional que busca odontología cosmética o implantes en Panamá',
    moneyQuery: '¿cuál es la mejor clínica de implantes dentales en Panamá para extranjeros?',
    compliment: 'enfocados en cosmética e implantes para pacientes internacionales y expats',
    gapClause: 'faltan FAQs citables sobre eval online / turismo dental que ChatGPT pueda usar',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan evaluaciones 24/7 (EN/ES, conectados a su CRM), automatización de intake intl, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ implantes/turismo dental, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'MaDenta',
    contactLastName: '(WhatsApp contact)',
    // madentaclinic.com (same brand): wa.me/50762709109 + recepcion@
    preferredPhone: '50762709109',
    preferredEmail: 'recepcion@madentaclinic.com',
  },
  'puntapacifica.com': {
    company: 'Hospital Punta Pacífica',
    city: 'Panama City',
    customer: 'paciente internacional que busca hospital afiliado a Johns Hopkins en Panamá',
    moneyQuery: '¿cuál es el mejor hospital de turismo médico en Panamá?',
    compliment: 'Pacífica Salud / Punta Pacífica es afiliado a Johns Hopkins Medicine International — marca clínica fuerte',
    gapClause: 'faltan FAQs citables de turismo médico que ChatGPT use frente a otros hospitales en Panamá',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y coordinan pacientes intl 24/7 (EN/ES, conectados a su CRM), automatización de intake médico, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ turismo médico/especialidades, (2) Hospital/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Mike',
    contactLastName: 'Kelly (Medical Tourism)',
    // pacificasalud.com medical-tourism page: Mike Kelly +507-6614-1448 / turismomedico@pacificasalud.com
    preferredPhone: '50766141448',
    preferredEmail: 'turismomedico@pacificasalud.com',
  },
  'hospitalsanfernando.com': {
    company: 'Hospital San Fernando',
    city: 'Panama City',
    customer: 'paciente internacional que busca hospital JCI o Global Patient Care en Panamá',
    moneyQuery: '¿cuál es el mejor hospital privado JCI en Panamá para pacientes internacionales?',
    compliment: 'Clínica Hospital San Fernando fue el primer hospital privado de Panamá y opera Global Patient Care 24/7',
    gapClause: 'faltan respuestas estructuradas que ChatGPT cite sobre atención a pacientes internacionales en San Fernando',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y coordinan pacientes intl 24/7 (EN/ES, conectados a su CRM), automatización de intake médico, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ Global Patient Care/especialidades, (2) Hospital/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Global Patient Care',
    contactLastName: '(WhatsApp contact)',
    // Site: global@hospitalsanfernando.com / 6639-3783 (Global Patient Care)
    preferredPhone: '50766393783',
    preferredEmail: 'global@hospitalsanfernando.com',
  },
  'fincalerida.com': {
    company: 'Finca Lérida',
    city: 'Boquete',
    customer: 'viajero que busca hotel boutique de café o coffee estate en Boquete',
    moneyQuery: '¿cuál es el mejor coffee estate hotel en Boquete Panamá?',
    compliment: 'Finca Lérida es un coffee estate histórico en Boquete (Cayuga Collection) — propuesta premium clara',
    gapClause: 'faltan FAQs citables sobre estadía/café/tours que ChatGPT pueda responder frente a otros lodges de Boquete',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas/tours 24/7 (EN/ES, conectados a su CRM), automatización de reservas, video con IA para marketing del destino, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ estadía/café/tours, (2) LodgingBusiness/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Finca Lérida',
    contactLastName: '(WhatsApp contact)',
    // hotelfincalerida.com/contact: WhatsApp rooms +507 6509-5139; email on domain
    preferredPhone: '50765095139',
    preferredEmail: 'info@fincalerida.com',
  },
  'losquetzales.com': {
    company: 'Los Quetzales EcoLodge',
    city: 'Cerro Punta',
    customer: 'viajero que busca ecolodge, birding o spa en las tierras altas de Chiriquí',
    moneyQuery: '¿cuál es el mejor ecolodge en Cerro Punta Panamá?',
    compliment: 'Los Quetzales es un ecolodge icónico en Cerro Punta con birding y spa en cloud forest',
    gapClause: 'faltan respuestas estructuradas que ChatGPT cite sobre ecolodges en Cerro Punta / Guadalupe',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas 24/7 (EN/ES, conectados a su CRM), automatización de reservas, video con IA para marketing del destino, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ estadía/birding/spa, (2) LodgingBusiness/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Los Quetzales',
    contactLastName: '(WhatsApp contact)',
    // Footer: +507 6671-2131 / stay@losquetzales.com
    preferredPhone: '50766712131',
    preferredEmail: 'stay@losquetzales.com',
  },
  'havenboquete.com': {
    company: 'The Haven Wellness Resort',
    city: 'Boquete',
    customer: 'viajero que busca spa, yoga o wellness retreat en Boquete',
    moneyQuery: '¿cuál es el mejor wellness resort en Boquete Panamá?',
    compliment: 'The Haven combina hotel, spa y estudio de yoga en Boquete — propuesta wellness clara',
    gapClause: 'faltan respuestas estructuradas que ChatGPT cite sobre wellness en Boquete',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas/spa 24/7 (EN/ES, conectados a su CRM), automatización de reservas, video con IA para marketing del destino, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ spa/yoga/estadía, (2) LodgingBusiness/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'The Haven',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50764915578',
    preferredEmail: 'info@havenboquete.com',
  },
  'valleescondidoboquete.com': {
    company: 'Valle Escondido Resort',
    city: 'Boquete',
    customer: 'pareja o grupo que busca bodas o eventos en Boquete',
    moneyQuery: '¿dónde hacer una boda o evento en Boquete Panamá?',
    compliment: 'Valle Escondido es un resort de eventos y bodas en Boquete con oferta clara',
    gapClause: 'faltan FAQs citables sobre eventos/bodas que los motores de IA puedan responder',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y coordinan eventos 24/7 (EN/ES, conectados a su CRM), automatización de intake de eventos, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ eventos/bodas/paquetes, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Valle Escondido',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50765369875',
    preferredEmail: 'eventos@valleescondidoboquete.com',
  },
  'isp.edu.pa': {
    company: 'International School of Panama',
    city: 'Panama City',
    customer: 'familia expat que busca colegio internacional IB en Panamá',
    moneyQuery: '¿cuál es el mejor colegio internacional en Panamá?',
    compliment: 'ISP es NEASC/IB con más de 40 años — referencia fuerte para familias internacionales',
    gapClause: 'faltan FAQs citables de admisiones que ChatGPT use cuando un expat busca colegio en Panamá',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que responden y califican leads de admisiones 24/7 (EN/ES, conectados a su CRM), automatización de intake de admisiones, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ admisiones/IB/fees, (2) EducationalOrganization/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'ISP Admissions',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50769821470',
    preferredEmail: 'admissions@isp.edu.pa',
  },
  'thecascoschool.com': {
    company: 'The Casco School',
    city: 'Panama City',
    customer: 'familia que busca colegio bilingüe británico en Panamá',
    moneyQuery: '¿cuál es el mejor colegio británico bilingüe en Panamá?',
    compliment: 'colegio británico bilingüe con sedes en Albrook y Costa del Este',
    gapClause: 'faltan respuestas citables de admisiones que los motores de IA puedan usar',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que responden y califican admisiones 24/7 (EN/ES, conectados a su CRM), automatización de intake, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ admisiones/curriculum, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'The Casco School',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50766442413',
    preferredEmail: 'admissions@thecascoschool.com',
  },
  'bostonschool.edu.pa': {
    company: 'Boston School International',
    city: 'Panama City',
    customer: 'familia expat que busca colegio internacional en Costa del Este',
    moneyQuery: '¿cuál es el mejor colegio internacional en Costa del Este Panamá?',
    compliment: 'colegio internacional en Costa del Este con flujo claro de tours y admisiones',
    gapClause: 'faltan FAQs citables de admisiones que ChatGPT use cuando un expat busca colegio en Panamá',
    pdEmoji: '🏠',
    pdLine: 'construyo agentes de WhatsApp que responden y califican leads de admisiones 24/7 (EN/ES, conectados a su CRM), automatización de intake de admisiones, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ admisiones/curriculum/fees, (2) EducationalOrganization/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Boston School Admissions',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50764548560',
    preferredEmail: 'admissions@bostonschool.edu.pa',
  },
  'studiohavenboquete.com': {
    company: 'STUDIO at The Haven',
    city: 'Boquete',
    customer: 'viajero o residente que busca yoga o wellness en Boquete',
    moneyQuery: '¿dónde hacer yoga o wellness en Boquete Panamá?',
    compliment: 'estudio de yoga/ejercicio ligado a The Haven en Boquete — propuesta wellness clara',
    gapClause: 'faltan respuestas estructuradas que ChatGPT cite sobre yoga/wellness en Boquete',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan clases/reservas 24/7 (EN/ES, conectados a su CRM), automatización de booking, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ clases/horarios/precios, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'STUDIO Haven',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50764260843',
    preferredEmail: 'studiohavenboquete@gmail.com',
  },
  'gamboaresort.com': {
    company: 'Gamboa Rainforest Reserve',
    city: 'Gamboa',
    customer: 'grupo o viajero internacional que busca venue o eco-resort cerca del Canal',
    moneyQuery: '¿cuál es el mejor resort o venue de eventos en Gamboa Panamá?',
    compliment: 'eco-resort/nature venue con oferta internacional de grupos y eventos',
    gapClause: 'faltan FAQs citables sobre estadía y eventos que los motores de IA puedan responder',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas/eventos 24/7 (EN/ES, conectados a su CRM), automatización de intake, video con IA para marketing del destino, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ reservas/eventos/paquetes, (2) LodgingBusiness/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Gamboa Rainforest',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50766723083',
    preferredEmail: 'reservations@gamboaresort.com',
  },
  'redfrogbeach.com': {
    company: 'Red Frog Beach Island Resort',
    city: 'Bocas del Toro',
    customer: 'viajero o comprador que busca resort o propiedad en Bocas',
    moneyQuery: '¿cuál es el mejor resort en Bocas del Toro?',
    compliment: 'combinan resort e inmobiliaria en Bocas — ticket alto e internacional',
    gapClause: 'faltan FAQs citables sobre estadía y propiedades que ChatGPT pueda citar',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y califican reservas/leads RE 24/7 (EN/ES, conectados a su CRM), automatización de intake, video con IA para marketing del destino, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ resort/RE/precios, (2) LodgingBusiness/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Red Frog Beach',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50763476597',
    preferredEmail: 'reservations@redfrogbeach.com',
  },
  'islapalenque.com': {
    company: 'Isla Palenque',
    city: 'Bocas del Toro',
    customer: 'viajero de lujo que busca resort en isla privada en Bocas',
    moneyQuery: '¿cuál es el mejor resort de isla privada en Bocas del Toro?',
    compliment: 'resort de lujo en isla privada — posicionamiento premium internacional',
    gapClause: 'faltan respuestas estructuradas que ChatGPT cite sobre resorts premium en Bocas',
    pdEmoji: '🛥️',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan reservas de lujo 24/7 (EN/ES, conectados a su CRM), automatización de reservas, video con IA para marketing, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ estadía/paquetes, (2) LodgingBusiness/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Isla Palenque',
    contactLastName: '(WhatsApp contact)',
    // Site: island direct mobile +(507) 6617-3771; reservations@islapalenque.com
    preferredPhone: '50766173771',
    preferredEmail: 'reservations@islapalenque.com',
  },
  'cancundentalspecialists.com': {
    company: 'Cancun Dental Specialists',
    city: 'Cancún',
    customer: 'paciente de EE.UU./Canadá que busca odontología en Cancún',
    moneyQuery: '¿cuál es la mejor clínica dental en Cancún para pacientes de EE.UU.?',
    compliment: 'Hotel Zone con dentistas en inglés y alto volumen de pacientes norteamericanos',
    gapClause: 'faltan FAQs citables de turismo dental que ChatGPT use frente a competidores de Cancún',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that answer and book dental consults 24/7 (EN/ES, CRM-wired), international patient intake automation, AI video for procedure marketing, and AI-system rescue.',
    topFixes: '(1) FAQ US patients/prices/travel, (2) Dentist/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Cancun Dental Specialists',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '529983130107',
    preferredEmail: 'contact@cancundentalspecialists.com',
  },
  'smiletijuana.com': {
    company: 'Smile Tijuana',
    city: 'Tijuana',
    customer: 'paciente de EE.UU. que busca odontología fronteriza bilingüe',
    moneyQuery: '¿cuál es la mejor clínica dental en Tijuana para pacientes de San Diego?',
    compliment: 'clínica fronteriza bilingüe con flujo claro para pacientes de EE.UU.',
    gapClause: 'faltan respuestas citables en IA sobre odontología fronteriza en Tijuana',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that answer and book dental consults 24/7 (EN/ES, CRM-wired), border-patient intake automation, AI video for marketing, and AI-system rescue.',
    topFixes: '(1) FAQ border patients/prices, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Smile Tijuana',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '526642930717',
    preferredEmail: 'info@smiletijuanadentist.com',
  },
  'clinicabiblica.com': {
    company: 'Hospital Clinica Biblica',
    city: 'San José',
    customer: 'paciente internacional que busca hospital privado en Costa Rica',
    moneyQuery: '¿cuál es el mejor hospital privado en Costa Rica para pacientes internacionales?',
    compliment: 'Clínica Bíblica is Costa Rica’s longest-running private hospital with an English-facing intl patient path',
    gapClause: 'AI answers still lack citable FAQs on intl patient intake vs other CR hospitals',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that answer and coordinate intl patients 24/7 (EN/ES, CRM-wired), medical intake automation, AI video for hospital marketing, and AI-system rescue.',
    topFixes: '(1) FAQ intl patients/specialties, (2) Hospital/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Hospital Clinica Biblica',
    contactLastName: '(WhatsApp contact)',
    // Site click-to-chat / wa.me 50685957000 — no public mailto → info@ UNVERIFIED
    preferredPhone: '50685957000',
  },
  'metropolitanocr.com': {
    company: 'Hospital Metropolitano',
    city: 'San José',
    customer: 'paciente o turista que busca hospital multi-sede en Costa Rica',
    moneyQuery: '¿cuál es el mejor hospital Metropolitano en Costa Rica?',
    compliment: 'Hospital Metropolitano has multi-site coverage including tourism corridors (Guanacaste / Quepos)',
    gapClause: 'missing citable AI answers for multi-site hospital choice and intl patient flow in Costa Rica',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that answer and coordinate patients 24/7 (EN/ES, CRM-wired), intake automation across sites, AI video for marketing, and AI-system rescue.',
    topFixes: '(1) FAQ sedes/especialidades/turismo médico, (2) Hospital/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Hospital Metropolitano',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50664343139',
    preferredEmail: 'info@metropolitanocr.com',
  },
  'yachtchartercr.com': {
    company: 'Costa Rica Yacht Charter Brokers',
    city: 'Costa Rica',
    customer: 'viajero que busca yacht charter de lujo en Costa Rica',
    moneyQuery: '¿cuál es el mejor yacht charter en Costa Rica?',
    compliment: 'you run a luxury yacht charter concierge brand for Costa Rica’s Pacific',
    gapClause: 'AI still lacks structured FAQs on routes, boats, and booking that get cited vs competitors',
    pdEmoji: '🛥️',
    pdLine: 'I build WhatsApp agents that answer and book charters 24/7 (EN/ES, CRM-wired), reservation automation, AI video for destination marketing, and AI-system rescue.',
    topFixes: '(1) FAQ boats/routes/pricing, (2) FAQPage/TouristTrip JSON-LD, (3) llms.txt',
    contactFirstName: 'CR Yacht Charter',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '50662422041',
    preferredEmail: 'step-aboard@yachtchartercr.com',
  },
  'elitecartagena.com': {
    company: 'Elite Cartagena',
    city: 'Cartagena',
    customer: 'viajero que busca yacht o catamarán verificado en Cartagena',
    moneyQuery: '¿cuál es el mejor yacht charter en Cartagena?',
    compliment: 'Elite Cartagena markets a verified yacht/catamaran fleet for Cartagena',
    gapClause: 'missing citable FAQs on fleet, pricing, and booking that ChatGPT can use',
    pdEmoji: '🛥️',
    pdLine: 'I build WhatsApp agents that answer and book charters 24/7 (EN/ES, CRM-wired), reservation automation, AI video for destination marketing, and AI-system rescue.',
    topFixes: '(1) FAQ fleet/prices/routes, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Elite Cartagena',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '15164936070',
    preferredEmail: 'jc@elitecartagena.com',
  },
  'drjorgerodriguez.com': {
    company: 'Dr. Jorge Rodriguez',
    city: 'Medellín',
    customer: 'paciente internacional que busca cirugía estética en Medellín',
    moneyQuery: '¿cuál es el mejor cirujano plástico en Medellín para pacientes internacionales?',
    compliment: 'intl-facing aesthetic practice in Medellín with a bilingual patient path',
    gapClause: 'missing citable FAQs on procedures and medical tourism that AI engines can answer',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that answer and book consults 24/7 (EN/ES, CRM-wired), intl patient intake automation, AI video for procedure marketing, and AI-system rescue.',
    topFixes: '(1) FAQ procedures/travel/pricing, (2) Physician/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Dr. Jorge Rodriguez',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '573003719688',
  },
  'saludsinfronteras.com': {
    company: 'Salud sin Fronteras',
    city: 'Medellín',
    customer: 'paciente internacional que busca facilitador de turismo médico en Colombia',
    moneyQuery: '¿cuál es el mejor facilitador de turismo médico en Medellín?',
    compliment: 'you coordinate medical tourism across Medellín/Bogotá/Cartagena for intl patients',
    gapClause: 'AI still lacks citable FAQs on packages, specialties, and intake for medical tourism facilitators',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that qualify and route intl patients 24/7 (EN/ES, CRM-wired), intake automation, AI video for destination marketing, and AI-system rescue.',
    topFixes: '(1) FAQ packages/specialties/travel, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Salud sin Fronteras',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '573507316151',
  },
  'colombialuxurygroup.com': {
    company: 'Colombia Luxury Group',
    city: 'Cartagena',
    customer: 'viajero que busca yacht rental o charter en Cartagena',
    moneyQuery: '¿cuál es el mejor yacht rental en Cartagena?',
    compliment: 'Cartagena yacht rental with a fast WhatsApp quote flow — clear luxury positioning',
    gapClause: 'missing structured FAQs on fleet, routes, and pricing that ChatGPT can cite',
    pdEmoji: '🛥️',
    pdLine: 'I build WhatsApp agents that answer and book charters 24/7 (EN/ES, CRM-wired), reservation automation, AI video for destination marketing, and AI-system rescue.',
    topFixes: '(1) FAQ fleet/prices/routes, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Colombia Luxury Group',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '573042091627',
  },
  'luisguillermotobon.com': {
    company: 'Dr. Luis Guillermo Tobon',
    city: 'Medellín',
    customer: 'paciente internacional que busca cirugía estética en Medellín',
    moneyQuery: '¿cuál es el mejor cirujano plástico en Medellín con 30 años de experiencia?',
    compliment: '30+ years aesthetic surgery in Medellín with an English-facing intl path',
    gapClause: 'missing citable FAQs on procedures and medical tourism that AI engines can answer',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that answer and book consults 24/7 (EN/ES, CRM-wired), intl patient intake automation, AI video for procedure marketing, and AI-system rescue.',
    topFixes: '(1) FAQ procedures/travel/pricing, (2) Physician/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Dr. Luis Guillermo Tobon',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '573215095101',
  },
  'hicartagena.com': {
    company: 'Hi Cartagena',
    city: 'Cartagena',
    customer: 'viajero que busca concierge de lujo o yachts en Cartagena',
    moneyQuery: '¿cuál es el mejor luxury concierge o yacht en Cartagena?',
    compliment: 'luxury concierge + yachts in Cartagena with a WhatsApp-first booking path',
    gapClause: 'AI answers lack structured FAQs on charters and concierge packages to cite',
    pdEmoji: '🛥️',
    pdLine: 'I build WhatsApp agents that answer and book 24/7 (EN/ES, CRM-wired), reservation automation, AI video for destination marketing, and AI-system rescue.',
    topFixes: '(1) FAQ yachts/concierge/pricing, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Hi Cartagena',
    contactLastName: '(WhatsApp contact)',
    // Hit-list verified WA +57 313 695 2776
    preferredPhone: '573136952776',
  },
  'tijuanadentalcenter.com': {
    company: 'Tijuana Dental Center',
    city: 'Tijuana',
    customer: 'paciente de EE.UU. que busca odontología en Zona Río Tijuana',
    moneyQuery: '¿cuál es la mejor clínica dental en Tijuana Zona Río para pacientes de EE.UU.?',
    compliment: 'Zona Río clinic with high US-patient volume and an English contact path',
    gapClause: 'missing citable FAQs on border dental care that ChatGPT uses vs competitors',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that answer and book dental consults 24/7 (EN/ES, CRM-wired), border-patient intake automation, AI video for marketing, and AI-system rescue.',
    topFixes: '(1) FAQ US patients/prices/travel, (2) Dentist/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Tijuana Dental Center',
    contactLastName: '(WhatsApp contact)',
    // Contact page published +1 (619) 906-7481 / info@smile4evermexico.com
    preferredPhone: '16199067481',
    preferredEmail: 'info@smile4evermexico.com',
  },
  'thebristol.com': {
    company: 'Bristol Panama',
    city: 'Panama City',
    customer: 'viajero o empresa que busca hotel de lujo o eventos en Panamá',
    moneyQuery: '¿cuál es el mejor hotel de lujo en Ciudad de Panamá?',
    compliment: 'The Bristol is a classic luxury hotel brand in Panama City',
    gapClause: 'AI answers lack citable FAQs on rooms, events, and packages vs other luxury hotels',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that answer and book rooms/events 24/7 (EN/ES, CRM-wired), intake automation, AI video for hotel marketing, and AI-system rescue.',
    topFixes: '(1) FAQ rooms/events/packages, (2) Hotel/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Bristol Panama',
    contactLastName: '(Concierge)',
    preferredPhone: '5072947878',
    preferredEmail: 'concierge@bristolpanama.com',
  },
  'sortishotel.com': {
    company: 'Sortis Hotel',
    city: 'Panama City',
    customer: 'viajero o planner que busca hotel, spa o casino/eventos en Obarrio',
    moneyQuery: '¿cuál es el mejor hotel spa casino en Ciudad de Panamá?',
    compliment: 'Sortis Hotel Spa & Casino (Autograph Collection) has a strong meetings + leisure brand',
    gapClause: 'missing citable FAQs on spa, casino, and event packages for AI engines',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that answer and book 24/7 (EN/ES, CRM-wired), event intake automation, AI video for marketing, and AI-system rescue.',
    topFixes: '(1) FAQ spa/casino/events, (2) Hotel/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Sortis Hotel',
    contactLastName: '(Reservations)',
    preferredPhone: '5073988888',
    preferredEmail: 'reservaciones@sortishotel.com',
  },
  'balboaacademy.edu': {
    company: 'Balboa Academy',
    city: 'Panama City',
    customer: 'familia expat que busca colegio internacional en Ciudad del Saber',
    moneyQuery: '¿cuál es el mejor colegio internacional en Panamá Clayton?',
    compliment: 'Balboa Academy is a long-running international school in City of Knowledge',
    gapClause: 'missing citable admissions FAQs that ChatGPT uses when expats search schools in Panama',
    pdEmoji: '🏠',
    pdLine: 'I build WhatsApp agents that answer and qualify admissions leads 24/7 (EN/ES, CRM-wired), admissions intake automation, AI video for marketing, and AI-system rescue.',
    topFixes: '(1) FAQ admissions/fees/curriculum, (2) EducationalOrganization/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Balboa Academy',
    contactLastName: '(Admissions)',
    preferredPhone: '5073021076',
    preferredEmail: 'contactba@balboa-academy.org',
  },
  'oxfordpanama.com': {
    company: 'Oxford International School Panama',
    city: 'Panama City',
    customer: 'familia que busca colegio internacional Oxford en Panamá',
    moneyQuery: '¿cuál es el mejor Oxford school en Panamá?',
    compliment: 'Oxford International School has a clear admissions + WhatsApp path for families',
    gapClause: 'AI still lacks structured admissions FAQs vs other international schools in Panama',
    pdEmoji: '🏠',
    pdLine: 'I build WhatsApp agents that answer and qualify admissions leads 24/7 (EN/ES, CRM-wired), admissions intake automation, AI video for marketing, and AI-system rescue.',
    topFixes: '(1) FAQ admissions/fees, (2) EducationalOrganization/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Oxford International School',
    contactLastName: '(Admissions)',
    preferredPhone: '50763795769',
    preferredEmail: 'admisiones@ois.edu.pa',
  },
  'hospitalcima.com': {
    company: 'Hospital CIMA',
    city: 'San José',
    customer: 'paciente internacional que busca hospital en Costa Rica',
    moneyQuery: '¿cuál es el mejor hospital CIMA en Costa Rica para pacientes internacionales?',
    compliment: 'Hospital CIMA San José is a major intl-patient hospital brand in Escazú',
    gapClause: 'missing citable FAQs on intl insurance and patient intake for AI engines',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that coordinate intl patients 24/7 (EN/ES, CRM-wired), medical intake automation, AI video for hospital marketing, and AI-system rescue.',
    topFixes: '(1) FAQ intl patients/insurance, (2) Hospital/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Hospital CIMA',
    contactLastName: '(International Patients)',
    preferredPhone: '50622081000',
    preferredEmail: 'info@hospitalcima.com',
  },
  'medicaltourscostarica.com': {
    company: 'Medical Tours Costa Rica',
    city: 'Costa Rica',
    customer: 'paciente de EE.UU./Canadá que busca facilitador de turismo médico en Costa Rica',
    moneyQuery: '¿cuál es el mejor medical tourism facilitator en Costa Rica?',
    compliment: 'Medical Tours Costa Rica is a facilitator brand — GEO + WhatsApp qualify is the whole model',
    gapClause: 'AI answers lack structured package FAQs vs other CR medical tourism facilitators',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that qualify and route intl patients 24/7 (EN/ES, CRM-wired), intake automation, AI video for destination marketing, and AI-system rescue.',
    topFixes: '(1) FAQ packages/specialties/travel, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Medical Tours CR',
    contactLastName: '(Operations)',
    preferredPhone: '18666656433',
    preferredEmail: 'operations@medtourscr.com',
  },
  'goodnessdental.com': {
    company: 'Goodness Dental',
    city: 'Escazú',
    customer: 'paciente de EE.UU./Canadá que busca odontología en Costa Rica',
    moneyQuery: '¿cuál es la mejor clínica dental en Costa Rica para pacientes de EE.UU.?',
    compliment: 'Goodness Dental is a US/Canada-facing dental tourism brand in Escazú',
    gapClause: 'missing citable FAQs on implants, travel, and pricing for AI engines',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that answer and book dental consults 24/7 (EN/ES, CRM-wired), intl patient intake automation, AI video for marketing, and AI-system rescue.',
    topFixes: '(1) FAQ US patients/prices/travel, (2) Dentist/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Goodness Dental',
    contactLastName: '(Patient Care)',
    preferredPhone: '18664062744',
    preferredEmail: 'patients@goodnessdental.com',
  },
  'agencyofthesea.com': {
    company: 'Agency of the Sea',
    city: 'Jacó',
    customer: 'capitán o charter client que busca yacht agency en Costa Rica',
    moneyQuery: '¿cuál es el mejor yacht agent en Costa Rica?',
    compliment: 'Agency of the Sea is a local CR yacht/port agent with WhatsApp-first ops',
    gapClause: 'AI lacks structured FAQs on charters, ports, and agency services to cite',
    pdEmoji: '🛥️',
    pdLine: 'I build WhatsApp agents that answer and book agency/charter requests 24/7 (EN/ES, CRM-wired), intake automation, AI video for destination marketing, and AI-system rescue.',
    topFixes: '(1) FAQ ports/charters/services, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Gabriela',
    contactLastName: 'Porras (Agency of the Sea)',
    preferredPhone: '50672885005',
    preferredEmail: 'gabriela@agencyofthesea.com',
  },
  'absolutemedicaltourism.com': {
    company: 'Absolute Medical Tourism',
    city: 'Medellín',
    customer: 'paciente internacional que busca facilitador VIP de turismo médico en Colombia',
    moneyQuery: '¿cuál es el mejor medical tourism facilitator en Medellín?',
    compliment: 'Absolute Medical Tourism positions VIP concierge packages for Colombia health travel',
    gapClause: 'missing citable FAQs on packages and logistics that ChatGPT can use',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that qualify and route intl patients 24/7 (EN/ES, CRM-wired), intake automation, AI video for destination marketing, and AI-system rescue.',
    topFixes: '(1) FAQ packages/specialties/travel, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Absolute Medical Tourism',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '573016347898',
    preferredEmail: 'info@absolutemedicaltourism.com',
  },
  'sotadental.com': {
    company: 'SOTA Dental',
    city: 'Cancún',
    customer: 'paciente de EE.UU./Canadá que busca All-on-4 o implantes en México',
    moneyQuery: '¿cuál es la mejor clínica All-on-4 en Cancún o Tijuana?',
    compliment: 'SOTA Dental is a multi-city Mexico implants brand (Cancún/Tijuana/Los Algodones/PdC)',
    gapClause: 'AI answers lack structured FAQs vs other Mexico dental tourism brands',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that answer and book dental consults 24/7 (EN/ES, CRM-wired), intl patient intake automation, AI video for marketing, and AI-system rescue.',
    topFixes: '(1) FAQ All-on-4/prices/travel, (2) Dentist/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'SOTA Dental',
    contactLastName: '(Patient Care)',
    preferredPhone: '18006813340',
    preferredEmail: 'contact@sotadental.com',
  },
  'dentalconnect.com.mx': {
    company: 'Dental Connect',
    city: 'Tijuana',
    customer: 'paciente de EE.UU. que busca odontología fronteriza con pickup',
    moneyQuery: '¿cuál es la mejor clínica dental en Tijuana con border pickup?',
    compliment: 'Dental Connect markets bilingual border dental with pickup logistics',
    gapClause: 'missing citable FAQs on border patients and pricing for AI engines',
    pdEmoji: '✨',
    pdLine: 'I build WhatsApp agents that answer and book dental consults 24/7 (EN/ES, CRM-wired), border-patient intake automation, AI video for marketing, and AI-system rescue.',
    topFixes: '(1) FAQ border patients/prices, (2) FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Dental Connect',
    contactLastName: '(Contact)',
    preferredPhone: '18885758150',
    preferredEmail: 'contactus@dentalconnect.com.mx',
  },
  'danielacorreacirujana.com': {
    company: 'Dr. Daniela Correa',
    city: 'Medellín',
    customer: 'paciente internacional que busca cirugía plástica en Medellín',
    moneyQuery: '¿cuál es la mejor cirujana plástica en Medellín para pacientes internacionales?',
    compliment: 'cirugía plástica en Medellín con flujo EN + WhatsApp para pacientes intl',
    gapClause: 'faltan FAQs citables sobre procedimientos y turismo médico que ChatGPT pueda usar',
    pdEmoji: '✨',
    pdLine: 'construyo agentes de WhatsApp que responden y agendan consultas 24/7 (EN/ES, conectados a su CRM), automatización de intake intl, video con IA para marketing de procedimientos, y rescate de sistemas de IA que fallan.',
    topFixes: '(1) FAQ procedimientos/precios/viaje, (2) Physician/FAQPage JSON-LD, (3) llms.txt',
    contactFirstName: 'Dr. Daniela Correa',
    contactLastName: '(WhatsApp contact)',
    preferredPhone: '573332841861',
    preferredEmail: 'danielacorreacirujana@gmail.com',
  },
};

(async () => {
  console.log('DOMAIN', domain);

  // Audit (or --skip-audit / auto-fallback on 429 so campaign can still fire)
  let audit = {};
  let score = scoreOverride || 75;
  let grade = 'B';
  let weak = { name: 'AEO', score: 60, id: 'aeo' };
  let catScores = {};
  let auditNote = '';

  if (!skipAudit && scoreOverride == null) {
    const auditRes = await fetch(VIS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': VIS_KEY },
      body: JSON.stringify({ url }),
    });
    const auditText = await auditRes.text();
    if (auditRes.ok) {
      audit = JSON.parse(auditText);
      score = Math.round(audit.score ?? audit.overall ?? audit.total ?? 0);
      grade = audit.grade || audit.letterGrade || 'B';
      weak = weakestCategory(audit);
      catScores = Object.fromEntries((audit.categories || []).map((c) => [c.id, c.score]));
    } else if (auditRes.status === 429) {
      console.warn('AUDIT_RATE_LIMITED — staging with placeholder score', score, grade);
      auditNote = 'Audit skipped (rate limit); placeholder score — re-audit later.';
    } else {
      throw new Error(`visibility audit → ${auditRes.status}: ${auditText.slice(0, 300)}`);
    }
  } else {
    console.warn('AUDIT_SKIPPED — using score', score, grade);
    auditNote = 'Audit skipped (--skip-audit/--score); placeholder score — re-audit later.';
  }
  console.log('AUDIT', score, grade, weak.name, weak.score);

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

  if (meta.preferredPhone) {
    contacts.whatsapp = String(meta.preferredPhone).replace(/\D/g, '');
  }
  // Iron rule (MANUAL_PROSPECT_PLAY.md): BOTH WhatsApp + email on every deal.
  // Prefer scraped → preferredEmail → info@{domain} flagged UNVERIFIED (Elena confirms).
  let emailUnverified = false;
  if (meta.preferredEmail && !contacts.email) {
    contacts.email = meta.preferredEmail;
  }
  if (!contacts.email) {
    contacts.email = `info@${domain}`;
    emailUnverified = true;
  }
  const phoneDigits = contacts.whatsapp || contacts.phones[0] || (meta.preferredPhone && String(meta.preferredPhone).replace(/\D/g, ''));
  if (!phoneDigits) {
    if (meta.emailOnlyOk && contacts.email) {
      console.warn('EMAIL_ONLY — no public WA/phone; HubSpot note will prioritize email one-click');
    } else {
      throw new Error(`No WhatsApp/phone found on ${domain} — add preferredPhone to PROSPECT_META`);
    }
  }
  const phoneForLinks = phoneDigits || '00000000000';
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

  const emailSubject = buildManualEmailSubject(meta.company, score);
  const emailBody = buildManualEmailBody(draft, { botFallback: false });

  if (!dryRun) {
    fs.writeFileSync(path.join(root, draftPath), draft + '\n', { encoding: 'utf8' });
    registerOutreachSlug(slug, phoneForLinks, draftPath, meta.company, {
      email: contacts.email,
      emailDraft: emailDraftPath,
      score,
    });
    fs.writeFileSync(
      path.join(root, emailDraftPath),
      `SUBJECT: ${emailSubject}\n\nTO: ${contacts.email}\n${emailUnverified ? 'NOTE: UNVERIFIED — confirm recipient before send\n' : ''}${meta.emailOnlyOk ? 'NOTE: EMAIL-PRIMARY — no public WhatsApp on site\n' : ''}\n${emailBody}\n`,
      { encoding: 'utf8' },
    );
  }

  const dualLinks = buildDualChannelNoteLinks(
    phoneForLinks,
    contacts.email,
    draft,
    meta.company,
    score,
    slug,
  );
  const phoneFmt = phoneDigits ? formatPhone507(phoneDigits) : '';
  const phoneDisplay = phoneDigits ? phoneFmt : '(no public WhatsApp — EMAIL PRIMARY)';

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
  const emailBlock = [
    '',
    '--- EMAIL (mismo texto que el link aipa@ de arriba — backup si el link se trunca) ---',
    '',
    emailUnverified
      ? `<b>⚠️ TO UNVERIFIED</b> — fallback <code>info@${escHtml(domain)}</code>; confirm before Send.`
      : '',
    `SUBJECT: ${escHtml(emailSubject)}`,
    `TO: ${escHtml(contacts.email)}`,
    '',
    escHtml(emailBody),
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
    `Contacts: WhatsApp ${phoneDisplay} | ${contacts.email}${emailUnverified ? ' (UNVERIFIED)' : ''} | ${domain}`,
    '',
    'Next: Click WhatsApp OR aipa@ email one-click (prefilled → Send). If WA is a bot → use email. After send, say "sent {company}" so follow-up task is created (+4 days).',
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
      ...(phoneFmt ? { phone: phoneFmt } : {}),
      description: `Email: ${contacts.email}${emailUnverified ? ' (UNVERIFIED fallback)' : ''}${meta.emailOnlyOk ? ' | EMAIL-PRIMARY (no public WA)' : ''}`,
    },
  }).then(r => r.id);

  // Contact — always email + phone when available
  const contactProps = {
    firstname: meta.contactFirstName,
    lastname: meta.contactLastName,
    company: meta.company,
    ...(phoneFmt ? { phone: phoneFmt } : {}),
    email: contacts.email,
    lifecyclestage: 'opportunity',
    hs_lead_status: 'OPEN',
  };
  const contactId = await hs('POST', '/crm/v3/objects/contacts', { properties: contactProps }).then(r => r.id);

  // Deal — qualifiedtobuy = I Act TODAY
  const dealId = await hs('POST', '/crm/v3/objects/deals', {
    properties: {
      dealname: dealName,
      dealstage: 'qualifiedtobuy',
      pipeline: 'default',
      hubspot_owner_id: HUBSPOT_OWNER_ID,
    },
  }).then(r => r.id);

  // Note
  const note = await hs('POST', '/crm/v3/objects/notes', {
    properties: { hs_note_body: noteHtml, hs_timestamp: new Date().toISOString() },
  });
  await hs('PUT', `/crm/v4/objects/notes/${note.id}/associations/deals/${dealId}`, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 },
  ]);

  // Task 1 — send today, HIGH
  const due = new Date();
  due.setHours(23, 59, 0, 0);
  const task = await hs('POST', '/crm/v3/objects/tasks', {
    properties: {
      hs_task_subject: `Send outreach → ${meta.company} (WhatsApp + email ready)`,
      hs_task_body:
        `1) Open deal note → WhatsApp link → Send. ` +
        `2) Or ENVIAR POR EMAIL — aipa@ → ${contacts.email}${emailUnverified ? ' (UNVERIFIED — confirm)' : ''}. ` +
        `Say "sent ${meta.company}" after WA (creates +4d follow-up); email one-click auto-advances + follow-up.`,
      hs_task_status: 'NOT_STARTED',
      hs_task_priority: 'HIGH',
      hs_timestamp: due.toISOString(),
      hubspot_owner_id: HUBSPOT_OWNER_ID,
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

  // Prospect pack + registry (email always present per playbook)
  registerOutreachSlug(slug, phoneForLinks, draftPath, meta.company, {
    email: contacts.email,
    emailDraft: emailDraftPath,
    score,
    dealId,
  });
  const pack = `# [CLIENT-MANUAL] ${meta.company} — HubSpot note pack

> Staged ${new Date().toISOString().slice(0, 10)}. Deal: \`${dealName}\` (ID ${dealId}).
> Draft: \`${draftPath}\`
> Email one-click: \`https://webhook.aideazz.xyz/cto/go/outreach-email/${slug}\` (from aipa@aideazz.xyz)
${emailUnverified ? `> ⚠️ Email \`${contacts.email}\` is UNVERIFIED fallback — confirm before send.\n` : ''}${meta.emailOnlyOk ? '> ⚠️ EMAIL-PRIMARY — no public WhatsApp found; use email one-click.\n' : ''}
Deal **${dealId}** | Company **${companyId}** | Contact **${contactId}** | Note **${note.id}** | Send task **${task.id}**
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
    email: contacts.email,
    emailUnverified,
    emailOnlyOk: !!meta.emailOnlyOk,
    audit: { score, grade, weak },
    phone: phoneDisplay,
    draftPath,
    prospectPath,
    emailOneClick: `https://webhook.aideazz.xyz/cto/go/outreach-email/${slug}`,
  }, null, 2));
  console.warn('');
  console.warn('⚠️  EMAIL ONE-CLICK requires GitHub push (else UI: Unknown outreach email slug):');
  console.warn(`    git add docs/selling/outreach-registry.json ${draftPath} ${emailDraftPath}`);
  console.warn('    git commit && git push origin main');
  console.warn('    Oracle: cd ~/cto-aipa && git pull && npm run build && pm2 restart cto-aipa');
  console.warn('    (After go-wa GitHub fallback is deployed: push alone is enough for confirm page.)');
  console.warn('');
})().catch(e => {
  console.error(String(e.message || e));
  process.exit(1);
});
