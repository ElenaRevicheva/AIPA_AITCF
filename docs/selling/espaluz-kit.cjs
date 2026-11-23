'use strict';
/**
 * EspaLuz partner kit (Elena, 22 Nov 2026: "refocus Atlas on EspaLuz, the gun must be loaded 100%").
 *
 * Atlas in EspaLuz mode (ATLAS_OFFER=espaluz) writes to businesses that meet relocating families every week —
 * relocation firms, international schools, immigration lawyers, expat real estate, international movers — and
 * offers them a free welcome link for their clients. It never sells them anything: EspaLuz is a family product,
 * the business is the door. Proven-dead shape it avoids: Aug 2026, 10 chamber/school "pilot" emails, 0 replies
 * (asked institutions to run a pilot; this asks a person to forward one link).
 *
 * Every claim below is a shipped EspaLuz feature (docs/espaluz/USER_CATEGORIES_2026-11-18.md,
 * memory project_espaluz_family_memory_grounding): WhatsApp / Telegram / app, remembers each family member,
 * kids classroom, 21 Latin American countries, 14 days free. No user counts, no outcomes.
 */
const crypto = require('crypto');
const { ELENA_COPY_CC } = require('./aigo-kit.cjs');

const WA = '50766623757';

/** The films (YouTube channel feed, 22 Nov 2026): v18 EN/ES = the current promo; school film = the clearest scene. */
const FILMS = {
  en: 'https://youtube.com/shorts/vsshZlJL6YQ', // "Moved to Latin America with your family?" (21 Nov)
  es: 'https://youtube.com/shorts/lxgnQhEnvmo', // "¿Te mudaste a Latinoamérica con tu familia?" (22 Nov)
  school: 'https://youtube.com/shorts/1ItWH7p4xtg', // "Lee la nota de la escuela. Entiéndela." (2 Nov)
};

/** One code per Monday run, film-style f<YYYYMMDD><4 hex>, so arrivals group by the week's batch. */
function weekCode(now = new Date()) {
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `f${day}${crypto.createHash('md5').update(`espaluz-atlas-${day}`).digest('hex').slice(0, 4)}`;
}

/** The partner's own link: utm_content = the deal slug, so every family that arrives names the business. */
function partnerLink(slug, code) {
  return `https://app.espaluz.lat/?utm_source=partner&utm_medium=email&utm_campaign=${code}&utm_content=${encodeURIComponent(slug)}`;
}

/** Families who prefer WhatsApp: the hello carries the partner in plain words (the bots log the first message). */
function partnerWa(company) {
  return `https://wa.me/${WA}?text=${encodeURIComponent(`Hola EspaLuz 👋 (vengo de ${company})`)}`;
}

/** Atlas targets carry search-style city names ("Panama City"); a Spanish letter says the city in Spanish. */
const CITY_ES = {
  'Panama City': 'Ciudad de Panamá',
  'San Jose Costa Rica': 'San José',
  'Mexico City': 'Ciudad de México',
  'Medellin Colombia': 'Medellín',
  'Boquete Panama': 'Boquete',
  'Coronado Panama': 'Coronado',
  'Guanacaste Costa Rica': 'Guanacaste',
  'San Miguel de Allende Mexico': 'San Miguel de Allende',
  'Cuenca Ecuador': 'Cuenca',
};
const esCity = (city) => CITY_ES[city] || city;

/** Why THIS business meets the families, in one sentence. Keyed by the target's `seg`. */
const SEGMENT_LINE = {
  relocation: (city) => `Ustedes acompañan a familias que se mudan a ${city}.`,
  school: (city) => `Cada año reciben en ${city} a familias que llegan de otro país con sus hijos.`,
  immigration: (city) => `Ustedes llevan la residencia de familias que llegan a ${city}.`,
  realestate: (city) => `Muchas de las familias a las que ayudan a encontrar casa en ${city} llegan de otro país.`,
  movers: (city) => `Ustedes traen a ${city} las cosas de familias que empiezan una nueva vida aquí.`,
};
const SEGMENT_LABEL = {
  relocation: 'relocation',
  school: 'international school',
  immigration: 'immigration law',
  realestate: 'expat real estate',
  movers: 'international movers',
};

// 23 Nov 2026 (Elena: "they should understand that I'm a professional, not just a mother who relocated"): who she is
// first - AI systems engineer in Panama, founder of AIdeazz AI Lab - with the Professional Outlook deck (clearer and more
// visual than the portfolio page), THEN why EspaLuz exists. Spanish letter -> the Spanish deck.
const OUTLOOK_ES = 'https://aideazz.xyz/Elena_Revicheva_Professional_Outlook_2026_ES.pdf';
const INTRO_ES = [
  `¡Un gusto saludarles! 👋 Soy Elena Revicheva, ingeniera de sistemas de IA radicada en Panamá y fundadora de AIdeazz AI Lab, donde creamos EspaLuz, una tutora de IA para familias. Quién soy y cómo trabajo, en pocas páginas: ${OUTLOOK_ES}`,
  ``,
  `EspaLuz nació de mi propia mudanza: llegué a Panamá con mi hija pequeña — somos una familia bilingüe ruso-inglés — y empezamos el español desde cero.`,
];
const CLOSING = ['Saludos,', 'Elena Revicheva', 'Ingeniera de sistemas de IA · Fundadora de AIdeazz AI Lab ✨', 'EspaLuz, tutora de IA para familias: https://app.espaluz.lat'];

function buildEspaluzDraft(lead, code) {
  const seg = SEGMENT_LINE[lead.seg] || SEGMENT_LINE.relocation;
  const city = esCity(lead.city);
  const subject = `${lead.company}: un regalo de bienvenida para las familias que llegan a ${city}`;
  const body = [
    `Estimado equipo de ${lead.company}:`,
    ``,
    ...INTRO_ES,
    ``,
    `${seg(city)} Lo más difícil de las primeras semanas casi nunca es el papeleo: es la nota de la escuela, el pediatra, el vecino, el supermercado — todo en español.`,
    ``,
    `EspaLuz es la compañera de la familia para esa nueva vida en español: responde por WhatsApp, Telegram o en la app, recuerda a cada miembro de la familia y tiene clases para los niños. Funciona en los 21 países de Latinoamérica. Los primeros 14 días son gratis.`,
    ``,
    `Mi propuesta es sencilla: un enlace de bienvenida propio de ${lead.company} para sus clientes. Ustedes lo incluyen en su correo o paquete de bienvenida, y cada familia empieza gratis. Sin costo ni compromiso para ustedes.`,
    ``,
    `Su enlace: ${partnerLink(lead.slug, code)}`,
    `Por WhatsApp: ${partnerWa(lead.company)}`,
    ``,
    `Dos videos cortos (menos de un minuto):`,
    `▶️ En español: ${FILMS.es}`,
    `▶️ In English: ${FILMS.en}`,
    ``,
    `Si les sirve, se lo muestro en 15 minutos.`,
    ``,
    `¡Que tengan un excelente día!`,
    ...CLOSING,
  ].join('\n');
  return { subject, body };
}

function buildEspaluzFuDraft(lead, code) {
  const subject = `Seguimiento — enlace de bienvenida EspaLuz para ${lead.company}`;
  const body = [
    `Estimado equipo de ${lead.company}:`,
    ``,
    `Les escribí hace unos días sobre un enlace de bienvenida para las familias que llegan a ${esCity(lead.city)}. Se lo dejo de nuevo, por si es útil en su próximo correo de bienvenida:`,
    ``,
    `${partnerLink(lead.slug, code)}`,
    ``,
    `Cada familia empieza con 14 días gratis: español para la nota de la escuela, el pediatra y los vecinos — por WhatsApp, Telegram o en la app, con clases para los niños.`,
    ``,
    `▶️ ${FILMS.school}`,
    ``,
    ...CLOSING,
  ].join('\n');
  return { subject, body };
}

function buildEspaluzWaDraft(lead, code) {
  return [
    `Hola, ¡un gusto saludarles! 👋 Soy Elena Revicheva, ingeniera de sistemas de IA en Panamá y fundadora de AIdeazz AI Lab. Llegué a Panamá con mi hija pequeña (familia bilingüe ruso-inglés, español desde cero) y creé EspaLuz, tutora de IA para familias (WhatsApp, Telegram o app, con clases para niños; 14 días gratis). Quién soy: ${OUTLOOK_ES}`,
    ``,
    `${(SEGMENT_LINE[lead.seg] || SEGMENT_LINE.relocation)(esCity(lead.city))} ¿Les sirve un enlace de bienvenida propio de ${lead.company} para sus clientes? Sin costo para ustedes:`,
    partnerLink(lead.slug, code),
    ``,
    `▶️ ${FILMS.es}`,
    ``,
    'Saludos, Elena',
  ].join('\n');
}

module.exports = {
  ESPALUZ_CC: ELENA_COPY_CC,
  FILMS,
  SEGMENT_LABEL,
  weekCode,
  partnerLink,
  partnerWa,
  buildEspaluzDraft,
  buildEspaluzFuDraft,
  buildEspaluzWaDraft,
};
