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
    contactLastName: '(WhatsApp contact)',
    preferredEmail: 'contact@sanblastour.com',
    preferredPhone: '50760000000',
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
  if (meta.preferredEmail && !contacts.email) {
    contacts.email = meta.preferredEmail;
  }
  const phoneDigits = contacts.whatsapp || contacts.phones[0] || (meta.preferredPhone && String(meta.preferredPhone).replace(/\D/g, ''));
  if (!phoneDigits) throw new Error(`No WhatsApp/phone found on ${domain} — add preferredPhone to PROSPECT_META`);

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
