#!/usr/bin/env node
/**
 * Atlas lead machine — turn Atlas lanes into REAL leads, contacts and stages.
 *
 * Why (Aug 1 2026, Elena): the Monday Atlas cycle detected windows, wrote creative,
 * and then asked her by Telegram to "adapt it into a campaign" — work that never got
 * done, so the loop earned nothing. Meanwhile the pool it could act on was 96 already
 * contacted prospects at a 1% reply rate. Reporting that harder does not make money;
 * new qualified humans entering the funnel might.
 *
 * Supply: SerpAPI's google_maps engine (Starter plan, already paid for) returns local
 * businesses WITH website + phone — the same shape Google Places gives, without the
 * missing GOOGLE_PLACES_API_KEY. Emails come from the business's own contact page, so
 * Hunter's 50/month free cap is never touched.
 *
 * Every lead is qualified before it is allowed into the CRM:
 *   - has a real website and a real email on that domain
 *   - scores inside AUDIT_BAND on Elena's own visibility audit (bad enough to need
 *     her, real enough to be a business that pays)
 *   - is not already a contact in HubSpot
 * Anything failing a check is counted and dropped, never guessed at.
 *
 * What lands in HubSpot per accepted lead:
 *   contact + deal "[CLIENT-ATLAS] {company} — GEO/AEO fix (audit: NN/G)"
 *   at stage qualifiedtobuy (🔥 I Act TODAY), with a note carrying the audit, the
 *   Atlas angle for that lane, and the ONE-CLICK send link. Elena reviews and taps —
 *   nothing is emailed by this script.
 *
 * Deliberately does NOT send. Yesterday proved a wrong premise can put 44 emails in
 * flight before anyone notices; the human gate stays.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {
  slugify,
  loadRegistry,
  saveRegistry,
  buildHubSpotEmailAnchor,
  buildHubSpotWaAnchor,
  digitsOnly,
  formatPhone507,
} = require('./wa-link-lib.cjs');
// The AI Growth Operator kit (Elena, 12 Oct 2026): every Atlas letter carries the deck
// PDF, the promo film for the lead's industry, and Elena in Cc — the same kit the
// hand-staged prospects have carried since 2 Oct.
const {
  AIGO_DECK_ES_LINE,
  AIGO_DECK_ES_ATTACHMENT,
  ELENA_COPY_CC,
  aigoVideoLinesFor,
} = require('../docs/selling/aigo-kit.cjs');
const { extractSiteEmails, isTemplateAddress, isNotABuyerInbox } = require('./lib/site-contacts.cjs');
const videoLines = (lead) => aigoVideoLinesFor(`${lead.query || ''} ${lead.company || ''}`);
// Elena's switch (13 Oct 2026: "I prefer to switch it on when I say so"). OFF by default, so
// syncing this file changes nothing: letters, registry rows and notes stay byte-identical to the
// pre-kit machine until ATLAS_AIGO_KIT=1 is set (Oracle .env or the cron line; AIGO_KIT_ON is below g).
const kitDeckLines = () => (AIGO_KIT_ON ? [AIGO_DECK_ES_LINE, ``] : []);
const kitVideoLines = (lead) => (AIGO_KIT_ON ? [...videoLines(lead), ``] : []);
const kitWaLines = (lead) => (AIGO_KIT_ON ? [``, AIGO_DECK_ES_LINE, ``, ...videoLines(lead)] : []);

const ROOT = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const g = (k) => (env.match(new RegExp('^' + k + '=(.+)$', 'm')) || [])[1]?.trim();
// The kit switch is read from BOTH places: this script parses .env itself (it is never
// loaded into process.env), so a process.env-only check would ignore ATLAS_AIGO_KIT=1 in .env.
const AIGO_KIT_ON = process.env.ATLAS_AIGO_KIT === '1' || g('ATLAS_AIGO_KIT') === '1';
// Elena's second switch (13 Oct 2026): read sites with the hand stager's contact rules
// (lib/site-contacts.cjs — Cloudflare-hidden emails, placeholder / pattern / complaints-desk
// filter) and stop quoting a score measured on a 403 block page. OFF = byte-identical to before.
const TRUE_CONTACTS_ON = process.env.ATLAS_TRUE_CONTACTS === '1' || g('ATLAS_TRUE_CONTACTS') === '1';
// Google Places = the maps data this machine was built on (name, own website, phone, rating), through
// Elena's own key (Elena, 13 Oct 2026: "fix that, but only within the free monthly allowance").
// Text Search with phone/website is Google's "Text Search Enterprise" SKU: 1,000 free requests a month
// (developers.google.com/maps/billing-and-pricing/pricing, read 13 Oct). Atlas stops itself at
// PLACES_MONTHLY_CAP (300 = 30% of the free cap, room for anything else on the account) and then
// falls back to Bright Data, the 17 Aug supply. ATLAS_PLACES=0 turns it off.
const PLACES_KEY = g('GOOGLE_PLACES_API_KEY');
const PLACES_OFF = (process.env.ATLAS_PLACES || g('ATLAS_PLACES')) === '0';
const PLACES_MONTHLY_CAP = Number(process.env.ATLAS_PLACES_MONTHLY_CAP || g('ATLAS_PLACES_MONTHLY_CAP') || 300);
const PLACES_LEDGER = path.join(ROOT, 'data', 'places-usage.json');
const placesMonth = () => new Date().toISOString().slice(0, 7);
function placesUsed() {
  try { return Number(JSON.parse(fs.readFileSync(PLACES_LEDGER, 'utf8'))[placesMonth()] || 0); } catch { return 0; }
}
function placesCount() {
  let led = {};
  try { led = JSON.parse(fs.readFileSync(PLACES_LEDGER, 'utf8')); } catch { /* first call this month */ }
  led[placesMonth()] = Number(led[placesMonth()] || 0) + 1;
  fs.mkdirSync(path.dirname(PLACES_LEDGER), { recursive: true });
  fs.writeFileSync(PLACES_LEDGER, JSON.stringify(led, null, 2) + '\n');
}
const placesReady = () => !!PLACES_KEY && !PLACES_OFF && placesUsed() < PLACES_MONTHLY_CAP;
/** The audit read a block page (HTTP 403 etc.), so its score measures the firewall, not the business. */
const blockedAudit = (a) => TRUE_CONTACTS_ON && !!(a && a.blocked);
const BLOCKED_LINE = (lead) =>
  `Intenté analizar ${lead.website} con mi motor de visibilidad en IA y su servidor bloqueó la lectura (acceso denegado) antes de mostrar la página. ` +
  `Esa misma protección contra bots puede estar frenando también a los rastreadores de IA (GPTBot, ClaudeBot, PerplexityBot): si no los deja pasar, ChatGPT no puede leer su sitio para recomendarlos.`;
const auditLabel = (a) => (blockedAudit(a) ? '403 bloqueado' : `${a.score}/${a.grade}`);

// This script reads .env itself via g() and never touched process.env — which is
// fine until it borrows a module that DOES read process.env. dist/brightdata-enrich
// resolves its token that way, and cron runs with a near-empty environment, so
// bdSerpSearch would have returned [] on every call: no error, no warning, just
// zero leads every Monday from a token that is sitting right there in .env.
// Verified under `env -i` before this line existed — 0 results; after it, real ones.
for (const k of ['BRIGHTDATA_API_TOKEN', 'BRIGHTDATA_ZONE']) {
  if (!process.env[k] && g(k)) process.env[k] = g(k);
}

const HS = g('HUBSPOT_API_KEY');
const SERP = g('SERPAPI_KEY');
const VIS = g('VISIBILITY_API_KEY');
const TG = g('TELEGRAM_BOT_TOKEN');
const CHAT = g('CONCIERGE_TG_CHAT') || (g('TELEGRAM_AUTHORIZED_USERS') || '').split(',')[0]?.trim();
const OWNER = g('HUBSPOT_OWNER_ID') || '91612860';
// Only a hard requirement when actually mining. Importing this module for its
// letter templates must not demand API keys the importer will never call.
// SERPAPI_KEY is no longer required: Bright Data is a full supply on its own, and
// the SerpAPI plan was cancelled 2026-08-11. Demanding it here would mean deleting
// a dead key from .env kills the whole lead machine — so require A supply, not THAT
// supply. HubSpot and the visibility audit stay mandatory: without them there is
// nowhere to write and nothing to qualify on.
const BD_OK = !!(g('BRIGHTDATA_API_TOKEN') && g('BRIGHTDATA_ZONE'));
if (require.main === module && (!HS || !VIS || (!SERP && !BD_OK))) {
  throw new Error(
    'need HUBSPOT_API_KEY + VISIBILITY_API_KEY + a supply (BRIGHTDATA_API_TOKEN+BRIGHTDATA_ZONE, or SERPAPI_KEY)',
  );
}

const DRY = process.argv.includes('--dry');
const MAX_NEW = (() => {
  const n = Number(process.env.LEAD_MAX_NEW || 8);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 8; // a typo must never make the run uncapped
})();
// 19 Oct 2026 (Elena: "make sure GEO AEO marketing is chosen!"). The weekly pick took the top-scoring lane only,
// so GEO/AEO — her flagship and career lane, whitespace score 13 — was never worked. Now PRIMARY_LANE is worked
// EVERY week, first, with up to PRIMARY_MIN of the MAX_NEW slots; the top-scoring other lane fills the rest; if it
// comes up short, the primary lane fills again. ATLAS_PRIMARY_LANE='' (process env) restores the old top-score-only
// pick. LEAD_LANE= still forces a single lane, as before.
const PRIMARY_LANE = String(process.env.ATLAS_PRIMARY_LANE ?? g('ATLAS_PRIMARY_LANE') ?? 'geo_aeo_tech_seo_makers').trim();
const PRIMARY_MIN = (() => {
  const n = Number(process.env.ATLAS_PRIMARY_MIN || g('ATLAS_PRIMARY_MIN') || Math.ceil(MAX_NEW / 2));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : Math.ceil(MAX_NEW / 2); // a typo must not disable the split
})();
// No-website businesses (Elena, 13 Oct 2026): ON TOP of MAX_NEW, stage the best NOWEB_MAX (2)
// of the Places results this run already paid for that have no website — or only an Instagram/
// Facebook page as their "website". Most reviews first, high-ticket queries only, ≥5 reviews.
// So a Monday is at most 8 + 2 = 10 deals. ATLAS_NOWEB=0 turns it off. Logic: lib/no-website-leads.cjs.
const NOWEB_MAX =
  (process.env.ATLAS_NOWEB || g('ATLAS_NOWEB')) === '0' ? 0 : Number(process.env.ATLAS_NOWEB_MAX || g('ATLAS_NOWEB_MAX') || 2);
const noWebsiteSeen = [];
// 19 Oct 2026 (Elena): the no-website pool fed ONLY on the week's lane queries, so an offshore/residency
// week saw 0 (every result had a website) and dental — the measured no-website high-ticket segment, where
// the first pilot "yes" came from — was never searched. When the lane leaves fewer than NOWEB_MAX eligible
// candidates, top up with at most 2 Places searches (Panama City) from this list. ATLAS_NOWEB_QUERIES='' = off.
const NOWEB_QUERIES = String(process.env.ATLAS_NOWEB_QUERIES ?? g('ATLAS_NOWEB_QUERIES') ?? 'dental implants|clínica dental')
  .split('|')
  .map((s) => s.trim())
  .filter(Boolean)
  .slice(0, 2);
const {
  pickNoWebsite,
  buildNoWebsiteNote,
  noWebsiteDealName,
  noWebsiteTelegramLine,
  socialPlatform,
} = require('./lib/no-website-leads.cjs');
/** Below 35 the site is usually broken/parked; above 90 there is no problem to sell. */
const AUDIT_MIN = Number(process.env.LEAD_AUDIT_MIN || 35);
// Raised 90 -> 98 on 2026-08-17, and ONLY because buildDraft now has a credential
// branch. The old cap was a safety rail against the letters, not a judgement about
// the prospect: every ANGLE_ES opening claims the site is not citable, so a 98/100
// business would have been told it is invisible. With CREDENTIAL_SCORE in place the
// rail is no longer needed, and the refocused ICP — which scores 91-99 precisely
// because it markets to international customers — becomes reachable at last.
// 100/100 stays excluded: there is genuinely nothing to open a conversation with.
const AUDIT_MAX = Number(process.env.LEAD_AUDIT_MAX || 98);
// At or above this the audit is the CREDENTIAL, never a gap. Same threshold as
// stage-manual-prospect.cjs — one number, one meaning, across both machines.
const CREDENTIAL_SCORE = Number(process.env.LEAD_CREDENTIAL_SCORE || 85);
const STAGE_ACT_TODAY = 'qualifiedtobuy'; // 🔥 I Act TODAY

/** Panama + LATAM verticals that match the offer Elena already sells. ll = geo bias. */
const PTY = '@8.9824,-79.5199,12z';
/** Atlas writes this every Monday; the lead machine only ever reads it. */
const CONCEPTS_PATH = process.env.ATLAS_CONCEPTS_PATH || '/home/ubuntu/whitespace/data/concepts.json';

/**
 * ICPs per Atlas lane — only lanes with a REACHABLE audience.
 *
 * Aug 2 2026: `fractional_cto` is Atlas's hottest lane (60) and is deliberately
 * absent. Every source was checked: 242 [CLIENT-CTO-SERP] signals for it hold ZERO
 * contact emails (Hacker News and Reddit posts by anonymous founders), the VJH ATS
 * cache is probe metadata, and the VJH outreach queue is 205 LinkedIn URLs with 2
 * emails. A lane score measures how hard competitors are ADVERTISING, not whether
 * Elena can reach a buyer. Mining it would rebuild the same 242 uncontactable deals
 * that are already parked in "AI working — ignore".
 *
 * So lanes are chosen by REACHABILITY × score, never score alone.
 */
/**
 * ICP refocus (Elena, Aug 17 2026 — from the Jul 24 market review).
 *
 * The queries below the HIGH-TICKET block are the original local set. They were
 * mining the wrong buyer: a `gimnasio` or `taller mecánico` has an average sale
 * far under $2,000, no international audience and a Spanish-only site — it cannot
 * buy a $2k+ AI Growth Operator. 96 contacted prospects at a 1% reply rate is what
 * that looks like from the outside.
 *
 * The real ICP is not a geography, it is a shape:
 *   average sale > $2,000 · leads arrive online · owner answers WhatsApp ·
 *   international audience · English or bilingual-EN site · high margins
 *
 * Same ICP, different costumes: medical tourism, dental implants & dental tourism,
 * immigration/relocation, cosmetic surgery, luxury charters and high-ticket
 * hospitality. The list is "AI-Discoverable Businesses", not a Panama list —
 * Panama → Costa Rica → Colombia → Mexico as the same ICP expands.
 *
 * ADDITIVE ON PURPOSE. High-ticket targets are PREPENDED, and the loop breaks at
 * MAX_NEW, so the money queries are worked first and the original local ones stay
 * as tail fallback if a lane comes back thin. Nothing was deleted; reverting is
 * deleting the prepended block.
 *
 * Queries are ENGLISH for the high-ticket set, on purpose: a clinic that markets
 * to international patients writes in English, so an English query surfaces the
 * businesses that already have the audience — and filters out the purely local
 * ones the old set kept finding.
 */
const SJO = '@9.9281,-84.0907,12z';   // San José, Costa Rica
const MDE = '@6.2442,-75.5812,12z';   // Medellín, Colombia
const CTG = '@10.3910,-75.4794,12z';  // Cartagena, Colombia
const CUN = '@21.1619,-86.8515,12z';  // Cancún, Mexico
const STE = '@9.6450,-85.1690,12z';   // Santa Teresa, Costa Rica
const TAM = '@10.2993,-85.8371,12z';  // Tamarindo / Guanacaste, Costa Rica
const PDS = '@7.5290,-80.0270,12z';   // Pedasí, Panama
const BOC = '@9.3400,-82.2419,12z';   // Bocas del Toro, Panama

/**
 * FRESH NICHES (Elena's go, 5 Oct 2026). The same ten queries ran every Monday, so the
 * money niches got mined out: on 5 Oct the whatsapp lane looked at 31 businesses and 18
 * were already in the CRM — every medical/dental-tourism query came back mostly worked.
 * These are the SAME ICP shape (sale > $2k · leads arrive online · owner answers WhatsApp
 * · international audience · English site) in costumes the machine has never searched.
 * Tagged tier 'fresh' so they run first; orderTargets() then keeps every lane's list
 * ordered by measured saturation, so this does not silently go stale again.
 */

const ICP_BY_LANE = {
  whatsapp_ai_agents: [
    // ── FRESH NICHES (5 Oct 2026 — never mined) ──
    { q: 'destination wedding venue', ll: CTG, city: 'Cartagena Colombia', gl: 'co', hl: 'en', tier: 'fresh' },
    { q: 'surf and yoga retreat', ll: STE, city: 'Santa Teresa Costa Rica', gl: 'cr', hl: 'en', tier: 'fresh' },
    { q: 'sport fishing lodge', ll: PDS, city: 'Pedasi Panama', gl: 'pa', hl: 'en', tier: 'fresh' },
    { q: 'luxury eco lodge', ll: BOC, city: 'Bocas del Toro Panama', gl: 'pa', hl: 'en', tier: 'fresh' },
    { q: 'luxury travel agency', ll: MDE, city: 'Medellin Colombia', gl: 'co', hl: 'en', tier: 'fresh' },
    // ── HIGH-TICKET ICP (worked first) ──
    { q: 'dental implants clinic', ll: PTY, city: 'Panama City', gl: 'pa', hl: 'en' },
    { q: 'dental tourism clinic', ll: SJO, city: 'San Jose Costa Rica', gl: 'cr', hl: 'en' },
    { q: 'plastic surgery clinic', ll: MDE, city: 'Medellin Colombia', gl: 'co', hl: 'en' },
    { q: 'medical tourism clinic', ll: CUN, city: 'Cancun Mexico', gl: 'mx', hl: 'en' },
    { q: 'yacht charter', ll: PTY, city: 'Panama City', gl: 'pa', hl: 'en' },
    // 19 Oct 2026 lane matrix (AIGO PDF slide 5): immigration & relocation was missing from this lane.
    { q: 'immigration and relocation services', ll: PTY, city: 'Panama City', gl: 'pa', hl: 'en' },
    // ── original local set (tail fallback) ──
    { q: 'restaurante', ll: PTY, city: 'Panama City' },
    { q: 'clínica veterinaria', ll: PTY, city: 'Panama City' },
    { q: 'gimnasio', ll: PTY, city: 'Panama City' },
    { q: 'spa', ll: PTY, city: 'Panama City' },
    { q: 'taller mecánico', ll: PTY, city: 'Panama City' },
  ],
  ai_automation: [
    // ── FRESH NICHES (5 Oct 2026 — never mined) ──
    { q: 'offshore company formation', ll: PTY, city: 'Panama City', gl: 'pa', hl: 'en', tier: 'fresh' },
    { q: 'residency by investment', ll: PTY, city: 'Panama City', gl: 'pa', hl: 'en', tier: 'fresh' },
    { q: 'pre-construction condo developer', ll: PTY, city: 'Panama City', gl: 'pa', hl: 'en', tier: 'fresh' },
    { q: 'vacation rental property management', ll: TAM, city: 'Tamarindo Costa Rica', gl: 'cr', hl: 'en', tier: 'fresh' },
    { q: 'international moving company', ll: PTY, city: 'Panama City', gl: 'pa', hl: 'en', tier: 'fresh' },
    // ── HIGH-TICKET ICP (worked first) ──
    { q: 'relocation services company', ll: PTY, city: 'Panama City', gl: 'pa', hl: 'en' },
    { q: 'immigration law firm expats', ll: PTY, city: 'Panama City', gl: 'pa', hl: 'en' },
    { q: 'relocation and visa services', ll: SJO, city: 'San Jose Costa Rica', gl: 'cr', hl: 'en' },
    { q: 'medical tourism agency', ll: MDE, city: 'Medellin Colombia', gl: 'co', hl: 'en' },
    { q: 'fertility clinic international patients', ll: CUN, city: 'Cancun Mexico', gl: 'mx', hl: 'en' },
    // 19 Oct 2026 lane matrix: dental implants & cosmetic dentistry was missing from this lane.
    { q: 'dental implants center', ll: SJO, city: 'San Jose Costa Rica', gl: 'cr', hl: 'en' },
    // ── original local set (tail fallback) ──
    { q: 'agencia de marketing', ll: PTY, city: 'Panama City' },
    { q: 'bienes raíces', ll: PTY, city: 'Panama City' },
    { q: 'contadores', ll: PTY, city: 'Panama City' },
    { q: 'agencia de aduanas', ll: PTY, city: 'Panama City' },
    { q: 'empresa de logística', ll: PTY, city: 'Panama City' },
  ],
  geo_aeo_tech_seo_makers: [
    // ── FRESH NICHES (5 Oct 2026 — never mined) ──
    { q: 'luxury real estate agency', ll: TAM, city: 'Guanacaste Costa Rica', gl: 'cr', hl: 'en', tier: 'fresh' },
    { q: 'yacht charter', ll: PTY, city: 'Panama City', gl: 'pa', hl: 'en', tier: 'fresh' },
    { q: 'luxury event venue', ll: PTY, city: 'Panama City', gl: 'pa', hl: 'en', tier: 'fresh' },
    { q: 'private chef and villa concierge', ll: CTG, city: 'Cartagena Colombia', gl: 'co', hl: 'en', tier: 'fresh' },
    // ── HIGH-TICKET ICP (worked first) ──
    { q: 'cosmetic dentistry veneers', ll: PTY, city: 'Panama City', gl: 'pa', hl: 'en' },
    { q: 'luxury villa rental', ll: CTG, city: 'Cartagena Colombia', gl: 'co', hl: 'en' },
    { q: 'private yacht charter', ll: CTG, city: 'Cartagena Colombia', gl: 'co', hl: 'en' },
    { q: 'bariatric surgery clinic', ll: SJO, city: 'San Jose Costa Rica', gl: 'cr', hl: 'en' },
    { q: 'luxury boutique resort', ll: CUN, city: 'Cancun Mexico', gl: 'mx', hl: 'en' },
    // 19 Oct 2026 lane matrix: immigration & relocation was missing from this lane.
    { q: 'residency and immigration lawyer', ll: SJO, city: 'San Jose Costa Rica', gl: 'cr', hl: 'en' },
    // ── original local set (tail fallback) ──
    { q: 'clínica dental', ll: PTY, city: 'Panama City' },
    { q: 'hotel boutique', ll: PTY, city: 'Panama City' },
    { q: 'bufete de abogados', ll: PTY, city: 'Panama City' },
    { q: 'clínica estética', ll: PTY, city: 'Panama City' },
    { q: 'tours y excursiones', ll: '@9.3400,-82.2419,12z', city: 'Bocas del Toro' },
    { q: 'hotel', ll: '@8.4333,-82.4333,12z', city: 'Boquete' },
  ],
  /**
   * AI video generation (19 Oct 2026, Elena: every profitable service x industry combination in Atlas).
   * A portfolio service whitespace already scores (ai_video_generation) that had no ICP here, so it was
   * never worked. Same buying pattern as the other lanes, in the 4 AIGO strong-fit industries, chosen for
   * businesses that sell an experience or a visible result. No local tail: it is a high-ticket offer only.
   */
  ai_video_generation: [
    { q: 'luxury yacht charter', ll: CTG, city: 'Cartagena Colombia', gl: 'co', hl: 'en' },
    { q: 'boutique hotel', ll: CTG, city: 'Cartagena Colombia', gl: 'co', hl: 'en' },
    { q: 'cosmetic dentistry smile makeover', ll: PTY, city: 'Panama City', gl: 'pa', hl: 'en' },
    { q: 'plastic surgery clinic', ll: SJO, city: 'San Jose Costa Rica', gl: 'cr', hl: 'en' },
    { q: 'real estate developer for expats', ll: PTY, city: 'Panama City', gl: 'pa', hl: 'en' },
  ],
};

/**
 * What Elena actually sells this lead — the audit stays the credibility hook
 * (it is real, measured, about THEIR site), but the offer changes per lane.
 */
/**
 * The AI Growth Operator paragraph (Elena, Aug 4 2026): every WhatsApp first contact
 * carries it, not just the follow-up. It is what moves her from "someone who audits
 * websites" to "someone who runs the growth motion" — the framing that carries a
 * retainer instead of a one-off fix.
 */
/**
 * WhatsApp sign-off. The letters closed properly and the WhatsApp messages just
 * stopped at a link (Elena, Aug 4 2026) — which reads like an unfinished draft to a
 * business owner, not like a person introducing herself.
 */
const WA_CLOSING = [
  '',
  '¡Que tengan un excelente día!',
  'Saludos,',
  'Elena Revicheva',
  'Fundadora | Ingeniera de IA y Automatización — AIdeazz AI Lab ✨',
].join('\n');

const OPERATOR_ES =
  'No vendo otro CRM ni otro chatbot. Instalo un AI Growth Operator que trabaja 24/7 dentro de las herramientas que ya usan: que ChatGPT los recomiende, investigue prospectos, haga outreach y seguimiento, califique leads por WhatsApp, mantenga el CRM al día y les entregue un briefing diario con las mejores oportunidades.';

const LANE_OFFER = {
  whatsapp_ai_agents: {
    label: 'agente de WhatsApp',
    pitch: (city) =>
      `La mayoría de los negocios en ${city} pierden consultas simplemente porque llegan fuera de horario y nadie contesta a tiempo. Instalo un agente de WhatsApp que responde al instante 24/7 en español e inglés, califica al cliente, agenda y deja todo registrado en su CRM.`,
  },
  ai_automation: {
    label: 'automatización con IA',
    pitch: () =>
      `Casi siempre hay dos o tres procesos que consumen horas del equipo cada semana — cotizaciones, seguimiento de clientes, reportes, carga de datos. Automatizo justo esos, conectados a las herramientas que ya usan, sin cambiar de sistema.`,
  },
  geo_aeo_tech_seo_makers: {
    label: 'visibilidad en IA',
    pitch: () =>
      `Son 3 arreglos concretos y de implementación rápida para que su negocio aparezca como respuesta citable cuando alguien le pregunta a ChatGPT o Perplexity por opciones en su sector.`,
  },
  ai_video_generation: {
    label: 'video promocional con IA',
    pitch: () =>
      `Producimos con IA un video promocional para su negocio, listo en días para Instagram, WhatsApp y su web, en español e inglés: muestra el tratamiento o la experiencia que venden a su público internacional.`,
  },
};

/**
 * Highest-scoring Atlas lane that has a reachable ICP. Score alone is not enough.
 * `exclude` (19 Oct 2026): the primary lane is worked anyway, so the second leg is the best OTHER lane;
 * returns lane null when no other lane has a score.
 */
function pickLane(exclude = null) {
  const forced = process.env.LEAD_LANE;
  if (!exclude && forced && ICP_BY_LANE[forced]) return { lane: forced, score: null, forced: true };
  let best = { lane: exclude ? null : 'geo_aeo_tech_seo_makers', score: -1 };
  try {
    const c = JSON.parse(fs.readFileSync(CONCEPTS_PATH, 'utf8'));
    for (const lane of Object.keys(ICP_BY_LANE)) {
      if (lane === exclude) continue;
      const s = c[lane]?.move?.score;
      if (typeof s === 'number' && s > best.score) best = { lane, score: s };
    }
  } catch {
    /* no concepts — fall back to the lane Elena provably converts on */
  }
  return best;
}

/** A lane's whitespace score this week, or null (for the log). */
function laneScore(lane) {
  try {
    const s = JSON.parse(fs.readFileSync(CONCEPTS_PATH, 'utf8'))[lane]?.move?.score;
    return typeof s === 'number' ? s : null;
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Query yield ledger (5 Oct 2026). What each query returned the last time it ran: how
 * many businesses it looked at, how many were ALREADY in the CRM, how many it staged.
 * Lives on the box (data/, gitignored) — a measurement, not outreach data.
 */
const YIELD_PATH = process.env.LEAD_YIELD_PATH || path.join(ROOT, 'data', 'lead-machine-query-yield.json');
const yieldKey = (lane, t) => `${lane}|${t.q}|${t.city}`;
function loadYield() {
  try {
    return JSON.parse(fs.readFileSync(YIELD_PATH, 'utf8'));
  } catch {
    return {};
  }
}
function saveYield(y) {
  try {
    fs.mkdirSync(path.dirname(YIELD_PATH), { recursive: true });
    fs.writeFileSync(YIELD_PATH, JSON.stringify(y, null, 2) + '\n');
  } catch (e) {
    console.warn(`[lead-machine] yield ledger not saved: ${String(e.message).slice(0, 80)}`);
  }
}
/**
 * Order a lane's queries: fresh → high-ticket → original local set. The ICP tiers stay
 * intact — a low-ticket local query must never jump ahead just because it is unworked —
 * and WITHIN a tier, a query whose last run was mostly already-in-CRM goes to the back.
 * "Mostly" = at least 4 looked at and 60%+ already worked. A query whose search FAILED
 * (Bright Data error, 0 looked at) is not penalised: a failure is not saturation.
 */
function orderTargets(lane, targets, y) {
  const tierRank = (t) => ({ fresh: 0, high: 1 }[t.tier || (t.hl === 'en' ? 'high' : 'local')] ?? 2);
  const saturated = (t) => {
    const r = y[yieldKey(lane, t)];
    return r && r.seen >= 4 && r.dupe / r.seen >= 0.6 ? 1 : 0;
  };
  return targets
    .map((t, i) => ({ t, i }))
    .sort((a, b) => tierRank(a.t) - tierRank(b.t) || saturated(a.t) - saturated(b.t) || a.i - b.i)
    .map((x) => x.t);
}

async function hs(method, p, body, attempt = 0) {
  const init = { method, headers: { Authorization: `Bearer ${HS}`, 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const r = await fetch(`https://api.hubapi.com${p}`, init);
  const t = await r.text();
  if (r.status === 429 && attempt < 6) {
    await sleep(1500 * (attempt + 1));
    return hs(method, p, body, attempt + 1);
  }
  if (!r.ok) {
    if (r.status === 404) return null;
    throw new Error(`HubSpot ${r.status} ${p} ${t.slice(0, 160)}`);
  }
  return t ? JSON.parse(t) : null;
}

/**
 * Is there any SerpAPI quota left? Checked ONCE per run, and the account endpoint
 * is free — it does not consume a search.
 *
 * Aug 17 2026: the Starter plan was cancelled (2026-08-11) with 0 searches left, so
 * this returns false and every lookup goes to Bright Data. Kept rather than ripped
 * out because the SerpAPI maps engine gives phone + reviews, which organic search
 * cannot — if a plan is ever restored, the better supply comes back automatically.
 * Without this probe each of the ~7 targets would burn a doomed round-trip first.
 */
let serpAlive = null;
async function serpHasQuota() {
  if (serpAlive !== null) return serpAlive;
  if (!SERP) return (serpAlive = false);
  try {
    const r = await fetch(`https://serpapi.com/account?api_key=${SERP}`, {
      signal: AbortSignal.timeout(20000),
    });
    const d = await r.json();
    serpAlive = Number(d.total_searches_left || 0) > 0;
    console.log(
      `[lead-machine] supply: ${serpAlive ? `SerpAPI (${d.total_searches_left} searches left)` : 'Bright Data (SerpAPI exhausted/cancelled)'}`,
    );
  } catch {
    serpAlive = false;
    console.log('[lead-machine] supply: Bright Data (SerpAPI unreachable)');
  }
  return serpAlive;
}

/**
 * Bright Data supply — the economical replacement for the SerpAPI maps engine.
 *
 * Reuses the fleet's already-compiled bdSerpSearch (Web Unlocker + brd_json), the
 * same primitive the May-31 "BrightData-first lead engine" and the Jul-19 Atlas
 * cheap-mode capture run on. Nothing new is integrated; one require, one call.
 *
 * ECONOMY: num:20 asks for twenty candidates in ONE request — the same trick that
 * commit 9c2716f used to get more leads per credit. A whole lane costs ~4 Web
 * Unlocker calls, against a Bright Data balance that spends ~$4/month fleet-wide.
 *
 * HONEST LOSS: organic results carry no phone, rating or review count. Phone is
 * already optional everywhere downstream (every use is `lead.phone ? … : {}`), so
 * email outreach is untouched and only the WhatsApp anchor is skipped. Ratings are
 * handled at the rescue check — see `realBusiness` there.
 */
async function bdSerpBusinesses(target) {
  const { bdSerpSearch } = require('../dist/brightdata-enrich.js');
  const results = await bdSerpSearch(`${target.q} ${target.city}`, {
    num: 20,
    // Per-target geo, defaulting to Panama/Spanish so every pre-existing target
    // behaves exactly as before. The ICP now spans PA/CR/CO/MX, and searching a
    // Costa Rica query from a Panama exit returns Panama businesses — the country
    // has to travel with the query, not be fixed to where Elena happens to live.
    gl: target.gl || 'pa', // without a gl the proxy once exited in South Africa
    hl: target.hl || 'es',
    // Oct 5 2026: 6 of 10 searches were lost to Bright Data timeouts / proxy refusals
    // and read as "no businesses". Two paced retries before a query is given up.
    retries: 2,
    // MUST be empty. bdSerpSearch defaults tbs to 'qdr:w' (indexed in the past
    // week), which is right for the fresh buying-signal queries it was built for
    // and wrong here: a restaurant's site is not news. With the default this
    // returned 0 results for every lane — a silent empty, not an error.
    tbs: '',
  });
  const seenDomain = new Set();
  const out = [];
  for (const r of results || []) {
    if (!r.link) continue;
    let host;
    try {
      host = new URL(r.link).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      continue;
    }
    // One lead per business, not one per indexed page of the same site.
    if (seenDomain.has(host)) continue;
    seenDomain.add(host);
    out.push({
      // Google's title is "Business — tagline | City"; keep the business part only.
      company: String(r.title || host).split(/[|–—·]/)[0].trim().slice(0, 80),
      website: `${new URL(r.link).protocol}//${new URL(r.link).hostname}`,
      phone: null,
      rating: null,
      reviews: null,
      city: target.city,
      source: 'brightdata',
      serpRank: r.rank || out.length + 1,
    });
  }
  return out;
}

/** Businesses with a website, from the maps engine — same data shape Places returns. */
async function mapsSearch(target) {
  if (placesReady()) {
    // One request = one billed event, up to 20 businesses. Counted BEFORE the call, so a
    // timeout still counts against the cap (Google may have billed it).
    placesCount();
    const m = String(target.ll || '').match(/@(-?[\d.]+),(-?[\d.]+)/);
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': PLACES_KEY,
        'X-Goog-FieldMask':
          'places.displayName,places.websiteUri,places.internationalPhoneNumber,places.rating,places.userRatingCount,places.businessStatus,' +
          // 13 Oct 2026, for the no-website leads: the Maps link and type ride on the same request
          // (Enterprise is already the highest SKU this mask hits, so the price does not change).
          'places.googleMapsUri,places.primaryType',
      },
      body: JSON.stringify({
        textQuery: `${target.q} ${target.city}`,
        maxResultCount: 20,
        languageCode: target.hl || 'es',
        ...(m ? { locationBias: { circle: { center: { latitude: Number(m[1]), longitude: Number(m[2]) }, radius: 30000 } } } : {}),
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!r.ok) throw new Error(`Places ${r.status}`);
    const d = await r.json();
    console.log(`[lead-machine] supply: Google Places (${placesUsed()}/${PLACES_MONTHLY_CAP} this month, free cap 1,000)`);
    // Keep the no-website businesses this request already returned, instead of dropping them.
    for (const x of d.places || []) {
      if (x.websiteUri || !x.displayName?.text || (x.businessStatus || 'OPERATIONAL') !== 'OPERATIONAL') continue;
      noWebsiteSeen.push({
        company: String(x.displayName.text).trim(),
        presence: null,
        phone: x.internationalPhoneNumber ? String(x.internationalPhoneNumber).trim() : null,
        rating: x.rating ?? null,
        reviews: x.userRatingCount ?? null,
        mapsUri: x.googleMapsUri || null,
        primaryType: x.primaryType || null,
        city: target.city,
        query: target.q,
        // The dental top-up passes highTicket explicitly, so its Spanish query still counts.
        highTicket: target.highTicket ?? target.hl === 'en',
      });
    }
    return (d.places || [])
      .filter((x) => x.websiteUri && x.displayName?.text && (x.businessStatus || 'OPERATIONAL') === 'OPERATIONAL')
      .map((x) => ({
        company: String(x.displayName.text).trim(),
        website: String(x.websiteUri).trim(),
        phone: x.internationalPhoneNumber ? String(x.internationalPhoneNumber).trim() : null,
        rating: x.rating ?? null,
        reviews: x.userRatingCount ?? null,
        city: target.city,
        mapsUri: x.googleMapsUri || null,
        primaryType: x.primaryType || null,
        source: 'places',
      }));
  }
  const u =
    `https://serpapi.com/search.json?engine=google_maps&type=search` +
    `&q=${encodeURIComponent(target.q)}&ll=${encodeURIComponent(target.ll)}&hl=es&api_key=${SERP}`;
  const r = await fetch(u, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`SerpAPI ${r.status}`);
  const d = await r.json();
  if (d.error) throw new Error(`SerpAPI: ${d.error}`);
  return (d.local_results || [])
    .filter((x) => x.website && x.title)
    .map((x) => ({
      company: String(x.title).trim(),
      website: String(x.website).trim(),
      phone: x.phone ? String(x.phone).trim() : null,
      rating: x.rating ?? null,
      reviews: x.reviews ?? null,
      city: target.city,
    }));
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
/** Addresses that are never a real inbox for a business owner. */
const JUNK_EMAIL =
  /(sentry|wixpress|example|yourdomain|domain\.com|\.png|\.jpg|\.jpeg|\.gif|\.webp|\.svg|godaddy|squarespace|wordpress|cloudflare)/i;

function pickBestEmail(emails, domain) {
  const clean = [...new Set(emails)].filter(
    (e) => !JUNK_EMAIL.test(e) && e.length < 70 && !(TRUE_CONTACTS_ON && (isTemplateAddress(e) || isNotABuyerInbox(e))),
  );
  const onDomain = clean.filter((e) => e.toLowerCase().endsWith(`@${domain}`));
  // Off-domain fallback is only safe for personal/ISP inboxes, which small LATAM
  // businesses genuinely use. An arbitrary OTHER COMPANY's address on the page is
  // a third-party widget, not the prospect — caught live when a Panama dental
  // clinic yielded a contacto@ address at a Chilean company. Emailing that is
  // worse than finding nothing: it is a stranger receiving a pitch about someone
  // else's website.
  const PERSONAL = /@(gmail|hotmail|outlook|yahoo|live|icloud|proton(mail)?|cableonda|cwpanama|.*\.movil)\./i;
  const offDomainSafe = clean.filter((e) => PERSONAL.test(e));
  const pool = onDomain.length ? onDomain : offDomainSafe;
  // Prefer a role inbox someone actually reads over a random personal address.
  const preferred = pool.find((e) => /^(info|contacto|contact|ventas|sales|hola|reservas|reservations|admin|citas)@/i.test(e));
  const picked = preferred || pool[0] || null;
  // Normalise: sites publish INFO@EXAMPLE.COM, and a case-mismatched address
  // creates a duplicate contact instead of matching the existing one.
  return picked ? picked.toLowerCase() : null;
}

/** Read the business's own site for a contact address — no Hunter, no quota. */
/**
 * A social profile is not a website.
 *
 * Google Maps lists an Instagram or Facebook page in the `website` field when a
 * business has no site of its own. That poisons everything downstream: the audit
 * scores INSTAGRAM instead of the clinic (a dental clinic came back 51/D — that was
 * Instagram's score), the domain becomes instagram.com, and the Google-index email
 * fallback duly returned Instagram's own support address as the "clinic's" address. One tap
 * and Elena would have pitched an AI visibility audit to Instagram's support desk.
 *
 * These businesses are also unsellable for this offer: with no site of their own
 * there is nothing to add JSON-LD or llms.txt to.
 */
const PLATFORM_DOMAINS = [
  'instagram.com', 'facebook.com', 'fb.com', 'linkedin.com', 'twitter.com', 'x.com',
  'tiktok.com', 'youtube.com', 'wa.me', 'whatsapp.com', 'linktr.ee', 'google.com',
  'business.site', 'sites.google.com', 'wixsite.com', 'blogspot.com', 'wordpress.com',
  'yelp.com', 'tripadvisor.com', 'booking.com', 'doctoralia.com', 'paginasamarillas.com',
  // Added 2026-08-17 with the Bright Data supply. The maps engine only ever returned
  // real businesses; ORGANIC search also surfaces directories and marketplaces that
  // rank for the same commercial query. Selling an AI-visibility audit to Encuentra24
  // is not a lead, so they are dropped before we spend a scrape or an audit on them.
  'encuentra24.com', 'mercadolibre.com', 'olx.com', 'foursquare.com', 'opentable.com',
  'expedia.com', 'waze.com', 'wikipedia.org', 'reddit.com', 'pinterest.com',
  'medium.com', 'indeed.com', 'glassdoor.com', 'craigslist.org', 'clasificados.com',
  'yellowpages.com', 'cybo.com', 'tuugo.net', 'infoisinfo.com', 'paginasblancas.com',
  // Added 2026-08-17 with the high-ticket ICP. English medical/dental-tourism
  // queries are dominated by AGGREGATORS and listicles, not by the clinics
  // themselves — the first ICP dry run staged whatclinic.com ("Top 10+ Dentists
  // in Panama") and medicaltourismco.com ("Dental Work in Costa Rica 2026") as if
  // they were prospects. They are competitors for the same buyer, and pitching a
  // directory its own AI-visibility audit is the fastest way to look automated.
  'whatclinic.com', 'medicaltourismco.com', 'bookimed.com', 'medigo.com',
  'placidway.com', 'dentaldepartures.com', 'medicaltourism.com', 'healthtrip.com',
  'mymeditravel.com', 'qunomedical.com', 'treatmentabroad.com', 'expatexchange.com',
  'internationalliving.com', 'numbeo.com', 'nomadlist.com', 'dentavacation.com',
  'dentaltourism.com', 'medicaltourismmag.com', 'patientsbeyondborders.com',
];
/**
 * Government, education and military sites are never prospects.
 *
 * The maps engine only ever returned businesses, so this never came up. ORGANIC
 * search does return institutional pages that rank for commercial queries — the
 * first Bright Data dry run staged "Inicio JTBR" with a Panama ministry address, which is
 * Panama's Ministry of Commerce. The email was not a scraping bug: the page WAS
 * the ministry's, so the address was legitimately on-domain. Pitching a paid
 * AI-visibility audit to a government ministry is the kind of lead that costs
 * credibility, so they are dropped before the audit spends anything on them.
 */
const INSTITUTIONAL = /(^|\.)(gob|gov|edu|mil|ac)\.[a-z]{2,3}$|\.(gov|edu|mil)$/i;

function isPlatformSite(website) {
  try {
    const h = new URL(website).hostname.replace(/^www\./, '').toLowerCase();
    if (INSTITUTIONAL.test(h)) return true;
    return PLATFORM_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return true; // unparseable — not a site we can audit or sell to
  }
}

/**
 * Phones recovered while scraping for email, keyed by domain.
 *
 * The SerpAPI maps engine carried `phone`; Bright Data organic does not, so every
 * lead staged after the supply switch reached HubSpot with NO WhatsApp anchor —
 * and WhatsApp is the close channel ("owner answers WhatsApp" is an ICP criterion,
 * not a nice-to-have). Verified live: 0 of the 6 leads staged on Aug 17 had one.
 *
 * findEmail() already downloads the contact page, and LATAM businesses publish a
 * WhatsApp number on exactly that page — so this costs ZERO extra requests.
 */
const phoneByDomain = new Map();

// wa.me / tel: are deliberate publisher signals; loose digits are a last resort.
const WA_LINK_RE = /(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)(\d{8,15})/gi;
const TEL_HREF_RE = /tel:\+?([\d\s().-]{7,20})/gi;
// PA +507 · CR +506 · CO +57 · MX +52 — the ICP's four countries.
const INTL_RE = /\+\s?(507|506|57|52)[\s.-]?(\d[\d\s.-]{6,13}\d)/g;

/**
 * MOBILE numbers only reach WhatsApp, so they win over a landline on the same
 * page. Live proof: csapty.com publishes 507-260-6043, a fixed line — staging
 * that as the WhatsApp anchor would produce a link that simply never delivers.
 * Mobile prefixes: PA 6 · CR 6-8 · CO 3 · MX 1 (or a bare 10-digit cell).
 */
const MOBILE_RE = /^(?:507[6]|506[678]|57[3]|521?[0-9])/;

function pickPhone(html) {
  const cands = [];
  for (const m of html.matchAll(WA_LINK_RE)) cands.push(m[1]);
  for (const m of html.matchAll(TEL_HREF_RE)) cands.push(m[1]);
  for (const m of html.matchAll(INTL_RE)) cands.push(m[1] + m[2]);
  const valid = [];
  for (const raw of cands) {
    const d = String(raw).replace(/\D/g, '');
    // 8 (bare PA/CR local) to 15 (E.164 max). Reject obvious junk like years,
    // tracking ids and 000-runs that regexes love to find in markup.
    if (d.length < 8 || d.length > 15) continue;
    if (/^(0+|1+|1234)/.test(d)) continue;
    valid.push(d);
  }
  // A wa.me link is the strongest signal of all and is already first in `cands`;
  // beyond that, take the first mobile, and only then settle for any valid number.
  return valid.find((d) => MOBILE_RE.test(d)) || valid[0] || null;
}

async function findEmail(website) {
  let domain;
  try {
    domain = new URL(website).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
  if (isPlatformSite(website)) return null;
  const pages = ['', '/contact', '/contacto', '/contact-us', '/contactenos', '/about', '/nosotros'];
  const found = [];
  for (const p of pages) {
    try {
      const r = await fetch(new URL(p, website).toString(), {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIdeazzBot/1.0; +https://aideazz.xyz)' },
      });
      if (!r.ok) continue;
      const html = await r.text();
      // Same bytes, second answer: recover the phone before deciding on email, so
      // a page that yields a WhatsApp number but no address still pays for itself.
      if (!phoneByDomain.has(domain)) {
        const ph = pickPhone(html);
        if (ph) phoneByDomain.set(domain, ph);
      }
      if (TRUE_CONTACTS_ON) {
        // mailto, Cloudflare-hidden, bounded plain text; placeholders already removed.
        found.push(...extractSiteEmails(html));
        // Junk alone used to end the search on page one; keep going until one is usable.
        if (pickBestEmail(found, domain)) break;
        continue;
      }
      const hits = html.match(EMAIL_RE) || [];
      found.push(...hits);
      // mailto: links are the most reliable signal a human put there on purpose
      const mailtos = [...html.matchAll(/mailto:([^"'?>\s]+)/gi)].map((m) => m[1]);
      found.push(...mailtos);
      if (found.length) break; // first page that yields anything is enough
    } catch {
      /* unreachable page — try the next */
    }
  }
  const direct = pickBestEmail(found, domain);
  if (direct) return direct;
  return emailFromGoogleIndex(domain);
}

/**
 * Fallback for the prospects worth the most: the ones whose sites block us.
 *
 * Elena, Aug 4 2026 — "the businesses whose sites block crawlers hardest are exactly
 * the ones our email discovery fails on, and the ones with most to gain from the
 * audit." Medical Depot Panama proved it: a direct fetch returns 0 bytes, which is
 * the same bot protection that scores them 32/100 on AI crawler access, and the
 * machine skipped them as "no email" — while being invisible to ChatGPT was the
 * entire pitch. Their address was public on their own /contactenos page all along.
 *
 * So when a site refuses us, we do NOT disguise the crawler as a browser to get
 * around it — their block is theirs to set. We read what they already published to
 * Google instead. Same address, no circumvention.
 *
 * Capped per run: each lookup is a paid SerpAPI search, and only ~180 remain.
 */
let googleEmailBudget = Number(process.env.LEAD_GOOGLE_EMAIL_LOOKUPS || 8);
async function emailFromGoogleIndex(domain) {
  if (googleEmailBudget <= 0) return null;
  googleEmailBudget--;
  const q = `"${domain}" (email OR contacto OR correo)`;
  try {
    let blob;
    if (await serpHasQuota()) {
      const u = new URL('https://serpapi.com/search.json');
      u.searchParams.set('engine', 'google');
      u.searchParams.set('q', q);
      u.searchParams.set('api_key', SERP);
      const r = await fetch(u.toString(), { signal: AbortSignal.timeout(45000) });
      if (!r.ok) return null;
      blob = await r.text();
    } else {
      // Same job on Bright Data: we are only regex-scanning the response for an
      // address on this domain, so the raw serialized results serve exactly as well
      // as SerpAPI's JSON. This is the leg that recovers the crawler-blocked
      // businesses the Aug 4 commit was written to stop discarding.
      const { bdSerpSearch } = require('../dist/brightdata-enrich.js');
      // tbs '' (5 Oct 2026): bdSerpSearch defaults to 'qdr:w' — pages indexed in the past
      // WEEK — the same silent-empty trap documented in bdSerpBusinesses. A business's
      // contact page is not news, so the email lookup was mostly searching nothing.
      const results = await bdSerpSearch(q, { num: 10, gl: 'pa', hl: 'es', tbs: '', retries: 1 });
      if (!results || !results.length) return null;
      blob = JSON.stringify(results);
    }
    const hits = (blob.match(EMAIL_RE) || []).filter((e) => e.toLowerCase().endsWith(`@${domain}`));
    const pick = pickBestEmail(hits, domain);
    if (pick) console.log(`      ↳ email recovered from Google's index (site blocks us): ${pick}`);
    return pick;
  } catch {
    return null;
  }
}

async function auditSite(url) {
  try {
    const r = await fetch('https://webhook.aideazz.xyz/cto/v1/visibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': VIS },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(120000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (typeof d.score !== 'number') return null;
    // The API returns aeo/geo inside `categories`, not at the top level — reading
    // d.aeo alone silently yielded null and the letters lost their sharpest number.
    const cat = (id) => (d.categories || []).find((c) => c.id === id)?.score ?? null;
    return {
      score: d.score,
      grade: d.grade || '',
      aeo: d.aeo ?? cat('aeo'),
      geo: d.geo ?? cat('geo'),
      /** Low = they are blocking GPTBot/ClaudeBot. The best prospects score worst here. */
      aiAccess: cat('aiAccess'),
      /** HTTP 403/401/429 from their server: the checks scored the block page. */
      blocked: (d.checks || []).some((c) => c.id === 'http-response' && c.status === 'fail'),
    };
  } catch {
    return null;
  }
}

/**
 * Company-name fingerprint for dedup.
 *
 * Exact-email matching is not enough: the dry run surfaced "Centro Odontologico
 * Paitilla", already a [CLIENT-MANUAL] deal, whose site advertises an address one
 * typo away from the one in HubSpot ("odontolologico"). Matching on the accent- and
 * punctuation-stripped name catches the same business however its address is spelled,
 * so an already-worked prospect is never re-created as a fresh lead.
 */
function fingerprint(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents: Odontológico -> Odontologico
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !/^(the|and|los|las|del|para|clinica|centro|hotel|dental|spa|inc|sa|srl)$/.test(w))
    .slice(0, 3)
    .join('-');
}

/** Every company already in the CRM or the outreach registry — built once per run. */
async function loadKnown() {
  const names = new Set();
  const domains = new Set();
  for (const prefix of ['CLIENT-MANUAL', 'CLIENT-ATLAS', 'CLIENT-CTO-INGEST', 'CLIENT-CTO-SERP']) {
    let after = null;
    do {
      const body = {
        filterGroups: [{ filters: [{ propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: prefix }] }],
        properties: ['dealname'],
        limit: 100,
      };
      if (after) body.after = after;
      const d = await hs('POST', '/crm/v3/objects/deals/search', body);
      for (const deal of d?.results || []) {
        const raw = (deal.properties?.dealname || '').replace(/^\[[^\]]+\]\s*/, '').replace(/ — .*$/, '');
        const fp = fingerprint(raw);
        if (fp) names.add(fp);
      }
      after = d?.paging?.next?.after || null;
    } while (after);
  }
  const reg = loadRegistry();
  for (const v of Object.values(reg)) {
    if (v?.company) {
      const fp = fingerprint(v.company);
      if (fp) names.add(fp);
    }
    if (v?.email) {
      const dom = String(v.email).split('@')[1];
      if (dom) domains.add(dom.toLowerCase());
    }
  }
  return { names, domains };
}

/**
 * A company with this exact phone is already in HubSpot (19 Oct 2026). The name fingerprint missed
 * "Dr. Enzo Cano - Cirujano Oral y Maxilofacial" vs the pilot deal "Dr. Enzo Cano" (enzo-cano-cirujano
 * vs enzo-cano). Places-sourced companies keep Google's phone format, so an exact match is reliable.
 */
async function companyPhoneExists(phone) {
  if (!phone) return false;
  const d = await hs('POST', '/crm/v3/objects/companies/search', {
    filterGroups: [{ filters: [{ propertyName: 'phone', operator: 'EQ', value: String(phone).trim() }] }],
    properties: ['name'],
    limit: 1,
  });
  return (d?.total || 0) > 0;
}

async function contactExists(email) {
  const d = await hs('POST', '/crm/v3/objects/contacts/search', {
    filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
    properties: ['email'],
    limit: 1,
  });
  return !!(d && d.total > 0);
}

/** The Atlas angle for this lane — grounded in real competitor ads, refreshed weekly. */
function atlasAngle(lane = 'geo_aeo_tech_seo_makers') {
  try {
    if (!fs.existsSync(CONCEPTS_PATH)) return null;
    const c = JSON.parse(fs.readFileSync(CONCEPTS_PATH, 'utf8'))[lane];
    if (!c || !c.concept) return null;
    return {
      lane,
      concept_id: c.tracking?.concept_id || null,
      hook: c.concept.hook || c.concept.HOOK || null,
      angle: c.move?.angle || null,
      score: c.move?.score ?? null,
      snapshot: c.snapshot_date || null,
    };
  } catch {
    return null;
  }
}

/**
 * Atlas writes its creative in English ("The Crowd Doesn't Lie"); these prospects
 * are Panamanian businesses who get a Spanish email. Pasting the English hook in
 * would read as machine-translated spam, so the ANGLE TYPE — which is the part
 * Atlas actually derives from live competitor ads — selects a real Spanish framing.
 * The audit stays the substance; only the way in changes.
 *
 * Because Atlas rewrites the angle every Monday, each weekly batch tests a
 * different opening, and the angle is stamped on the deal so replies can be
 * attributed back to it.
 */
const ANGLE_ES = {
  social_proof: {
    subject: (c, s) => `${c}: cómo aparecer en ChatGPT cuando le preguntan por su sector (${s}/100)`,
    opening: (city) =>
      `Cada vez más negocios en ${city} están apareciendo como respuesta cuando alguien le pregunta a ChatGPT o Perplexity por opciones en su sector. Otros no aparecen en absoluto — y esa diferencia ya se nota en quién recibe la consulta.`,
  },
  pain_point: {
    subject: (c, s) => `${c} no aparece cuando preguntan a ChatGPT (auditoría: ${s}/100)`,
    opening: (city) =>
      `Cuando un cliente potencial le pregunta a ChatGPT o Perplexity por opciones en ${city}, su negocio todavía no aparece como respuesta citable. La consulta existe; simplemente la recibe otro.`,
  },
  curiosity_gap: {
    subject: (c, s) => `Hay algo que su web no le está diciendo a ChatGPT — ${c} (${s}/100)`,
    opening: () =>
      `Su sitio está bien hecho para personas, pero le falta la estructura que los motores de IA necesitan para citarlo. Es un detalle técnico invisible en pantalla y decisivo en la respuesta.`,
  },
  urgency_scarcity: {
    subject: (c, s) => `${c}: el lugar en la respuesta de la IA se está ocupando ahora (${s}/100)`,
    opening: (city) =>
      `En ${city} casi nadie ha optimizado todavía para búsquedas con IA — por eso el lugar en la respuesta sigue libre. Cuando sus competidores lo hagan, recuperarlo cuesta mucho más que tomarlo hoy.`,
  },
  authority: {
    subject: (c, s) => `Auditoría de visibilidad en IA — ${c} (${s}/100): 3 arreglos concretos`,
    opening: (city) =>
      `Analizo cómo aparecen los negocios de ${city} en los motores de respuesta con IA. El suyo tiene una base sólida y tres huecos concretos que lo dejan fuera de la respuesta.`,
  },
};
const ANGLE_FALLBACK = 'authority';

/**
 * The services PD — the closing line every [CLIENT-MANUAL] letter carries and the
 * first Atlas letters did not (Elena, Aug 2 2026).
 *
 * The audit opens the door; the PD is what tells them she does more than SEO. It is
 * deliberately TAILORED per industry — a dental clinic hears "agenda citas y responde
 * urgencias", a hotel hears "reservas y eventos" — because a generic services list
 * reads like a brochure and gets skipped. Rule from her outreach doctrine: always
 * link aideazz.xyz/portfolio, never bare aideazz.xyz.
 */
const SERVICES_PD = {
  dental:
    'agentes de WhatsApp que responden y agendan citas 24/7 (EN/ES, conectados a su CRM), recordatorios automáticos para bajar ausencias, automatización de intake de pacientes, y video con IA para promocionar tratamientos',
  hotel:
    'agentes de WhatsApp que responden y agendan reservas y eventos 24/7 (EN/ES, conectados a su CRM), automatización de intake de grupos, y video con IA para marketing del destino',
  legal:
    'agentes de WhatsApp que califican consultas y agendan citas 24/7 (EN/ES, conectados a su CRM), automatización de intake de casos, y rescate de sistemas de IA que fallan',
  estetica:
    'agentes de WhatsApp que responden y agendan valoraciones 24/7 (EN/ES, conectados a su CRM), seguimiento automático de pacientes, y video con IA para mostrar resultados',
  tours:
    'agentes de WhatsApp que responden y reservan tours 24/7 (EN/ES, conectados a su CRM), automatización de disponibilidad y cupos, y video con IA para promocionar experiencias',
  default:
    'agentes de WhatsApp que responden y agendan 24/7 (EN/ES, conectados a su CRM), automatización de intake, video con IA para marketing, y rescate de sistemas de IA que fallan',
};

function servicesPD(lead) {
  const q = `${lead.query || ''} ${lead.company || ''}`.toLowerCase();
  const key = /dental|odonto|dentist/.test(q)
    ? 'dental'
    : /hotel|resort|hostal|lodge/.test(q)
      ? 'hotel'
      : /abogad|bufete|legal|law/.test(q)
        ? 'legal'
        : /estétic|estetic|spa|derma|belleza/.test(q)
          ? 'estetica'
          : /tour|excursion|viaje|charter|sail/.test(q)
            ? 'tours'
            : 'default';
  return `PD: Además de visibilidad en IA, construyo ${SERVICES_PD[key]}. Todo con demos en vivo en mi portafolio 👆`;
}

function buildDraft(lead, audit, angle) {
  const angleKey = angle?.angle && ANGLE_ES[angle.angle] ? angle.angle : ANGLE_FALLBACK;
  const v = ANGLE_ES[angleKey];

  // CREDENTIAL MODE — ported from stage-manual-prospect.cjs (Aug 17 2026).
  //
  // Every ANGLE_ES opening asserts some version of "no aparece como respuesta
  // citable". On an 85+ site that is simply FALSE, and it reads as not having
  // done the homework — a 98/100 clinic replies with its own score and the
  // conversation is over. This is also the exact contradiction Elena caught in
  // the Pesqueros letter: 90/100 quoted alongside "todavía no aparece".
  //
  // It matters more now than it did in August: the refocused ICP — medical
  // tourism, dental tourism, relocation, luxury charters — markets to
  // international customers and is therefore GOOD at AI visibility. The dry run
  // that proved the retarget also rejected nine prospects scoring 91-99. Without
  // this branch the band could never be raised past 90 without lying, so the
  // machine was structurally unable to contact the top of its own ICP.
  //
  // Above the threshold the audit becomes the CREDENTIAL that earns the read,
  // and the letter pivots to the Operator — which is what is being sold anyway.
  const blocked = blockedAudit(audit);
  const credential = !blocked && audit.score >= CREDENTIAL_SCORE;
  const subject = blocked
    ? `${lead.company}: su sitio bloquea la lectura automática — ¿también a ChatGPT?`
    : credential
    ? `${lead.company} — ${audit.score}/100 en visibilidad IA, y aun así les escribo`
    : v.subject(lead.company, audit.score);
  const body = [
    `Estimado equipo de ${lead.company}:`,
    ``,
    `¡Un gusto saludarles! 👋 Soy Elena Revicheva, ingeniera de IA y automatización aquí en Panamá: https://aideazz.xyz/portfolio`,
    ``,
    ...(credential
      ? [
          `Primero, felicitaciones de verdad. Analicé ${lead.website} con mi motor de visibilidad en IA: ${audit.score}/100 (${audit.grade}) — de los mejores puntajes que he medido en ${lead.city}.`,
          ``,
          `Se los digo porque casi nadie está en ese nivel, y porque no les voy a inventar un problema que no tienen.`,
          ``,
          `Les escribo por otra cosa: aparecer en la respuesta de la IA es el primer paso, pero la consulta que llega después todavía depende de que alguien la conteste a tiempo.`,
        ]
      : [
          v.opening(lead.city),
          ``,
          ...(blocked
            ? [BLOCKED_LINE(lead)]
            : [
                `Analicé ${lead.website} con mi motor de visibilidad en IA: ${audit.score}/100 (${audit.grade}).`,
                ...(audit.aeo != null
                  ? [`Su punto más débil es la respuesta-a-preguntas (AEO ${audit.aeo}/100) — y es el más rápido de arreglar.`]
                  : []),
              ]),
        ]),
    ``,
    (LANE_OFFER[lead.lane] || LANE_OFFER.geo_aeo_tech_seo_makers).pitch(lead.city),
    ``,
    `Si les parece bien, se lo muestro en 15 minutos, sin ningún compromiso.`,
    ``,
    `La auditoría completa es gratuita aquí: https://aideazz.xyz/api`,
    ``,
    ...kitDeckLines(),
    servicesPD(lead),
    ``,
    ...kitVideoLines(lead),
    `¡Que tengan un excelente día!`,
    `Saludos,`,
    `Elena Revicheva`,
    `Fundadora | Ingeniera de IA y Automatización`,
    `AIdeazz AI Lab ✨`,
  ].join('\n');
  return { subject, body, angleKey };
}

/**
 * Second touch, mirroring the [CLIENT-MANUAL] follow-up exactly.
 *
 * Its PD is the AI Growth Operator paragraph — the manual FU's closing move: it
 * reframes her from "someone who audits websites" to "someone who runs the whole
 * growth motion", which is the pitch that actually carries a retainer. Says
 * plainly that a previous EMAIL was sent, so it is only ever registered for leads
 * whose first outreach really went by email.
 */
function buildFuDraft(lead, audit, angle) {
  const subject = blockedAudit(audit)
    ? `Seguimiento — ${lead.company}: la IA no puede leer su sitio`
    : `Seguimiento — auditoría de visibilidad en IA: ${lead.company} (${audit.score}/100)`;
  const body = [
    `Estimado equipo de ${lead.company}:`,
    ``,
    `¡Un gusto saludarles de nuevo! 👋 Soy Elena Revicheva, Ingeniera de IA y Automatización: https://aideazz.xyz/portfolio`,
    ``,
    // Same credential branch as buildDraft: a follow-up that contradicts the first
    // letter is worse than no follow-up, and on 85+ the gap line is untrue anyway.
    blockedAudit(audit)
      ? `Les escribí hace unos días por correo sobre ${lead.company}. ${BLOCKED_LINE(lead)}`
      : audit.score >= CREDENTIAL_SCORE
      ? `Les escribí hace unos días sobre ${lead.company}. Analicé ${lead.website} con mi motor de visibilidad en IA: ${audit.score}/100 (${audit.grade}) — de los mejores que he medido en ${lead.city}, así que no les escribo por ahí.`
      : `Les escribí hace unos días por correo sobre ${lead.company}. Analicé ${lead.website} con mi motor de visibilidad en IA: ${audit.score}/100 (${audit.grade}). Cuando un cliente pregunta a ChatGPT o Perplexity por opciones como la suya en ${lead.city}, su empresa todavía no aparece como una respuesta citable${audit.aeo != null ? ` (AEO ${audit.aeo}/100)` : ''}.`,
    ``,
    `No vendo otro CRM ni otro chatbot. Instalo un AI Growth Operator que trabaja 24/7 dentro de las herramientas que ya usan: que ChatGPT los recomiende, investigue prospectos, haga outreach y seguimiento, califique leads por WhatsApp, mantenga el CRM al día y les entregue un briefing diario con las mejores oportunidades.`,
    ``,
    `Si les sirve, en 15 minutos les muestro los 3 principales arreglos de esa auditoría y cómo quedaría el Operator en su negocio — sin compromiso. Auditoría gratuita: https://aideazz.xyz/api`,
    ``,
    ...kitDeckLines(),
    servicesPD(lead),
    ``,
    ...kitVideoLines(lead),
    `Saludos,`,
    `Elena Revicheva`,
    `Fundadora | Ingeniera de IA y Automatización`,
    `AIdeazz AI Lab ✨`,
  ].join('\n');
  return { subject, body };
}

/** First-touch WhatsApp text — email is the tracked channel, WhatsApp is Elena's laptop-only close. */
function buildWaDraft(lead, audit) {
  return [
    `Hola, ¡un gusto saludarles! 👋 Soy Elena Revicheva, ingeniera de IA aquí en Panamá: https://aideazz.xyz/portfolio`,
    ``,
    ...(blockedAudit(audit)
      ? [BLOCKED_LINE(lead)]
      : [
    `Analicé ${lead.website} con mi motor de visibilidad en IA: ${audit.score}/100 (${audit.grade}).`,
    // WhatsApp gets the same treatment — it is the channel Elena actually closes
    // on, so a false "no aparece" line here costs the most.
    audit.score >= CREDENTIAL_SCORE
      ? `De los mejores puntajes que he medido en ${lead.city}. No les voy a inventar un problema que no tienen — les escribo por lo que pasa DESPUÉS de que la IA los recomiende.`
      : `Cuando alguien le pregunta a ChatGPT por opciones como la suya en ${lead.city}, su negocio todavía no aparece como respuesta citable.`,
        ]),
    ``,
    OPERATOR_ES,
    ``,
    `Son 3 arreglos concretos. ¿Les muestro en 15 minutos, sin compromiso? Auditoría gratuita: https://aideazz.xyz/api`,
    ...kitWaLines(lead),
    WA_CLOSING,
  ].join('\n');
}

/** Second-touch WhatsApp text. */
function buildFuWaDraft(lead, audit) {
  return [
    `Hola de nuevo 👋 Soy Elena Revicheva (AIdeazz): https://aideazz.xyz/portfolio`,
    ``,
    blockedAudit(audit)
      ? `Les escribí sobre ${lead.website}: su servidor bloqueó la lectura de mi motor de visibilidad en IA, y puede estar frenando también a ChatGPT.`
      : `Les escribí sobre la auditoría de ${lead.website}: ${audit.score}/100 (${audit.grade}).`,
    `No vendo otro chatbot — instalo un AI Growth Operator que trabaja 24/7: que ChatGPT los recomiende, califique leads por WhatsApp y mantenga el CRM al día.`,
    ``,
    `¿Les muestro en 15 minutos, sin compromiso? Auditoría gratuita: https://aideazz.xyz/api`,
    ...kitWaLines(lead),
    WA_CLOSING,
  ].join('\n');
}

async function stageLead(lead, audit, angle) {
  // Truncate the NAME, then append the marker — slicing the joined string cut the
  // "-atlas" off any company whose name ran past 54 chars (caught live on
  // "Odontologo Moisés Lukowiecki - Urgencia y Clínica Dental 24 Horas"), and two
  // long names sharing a prefix would collide onto one slug and overwrite each
  // other's draft.
  const slug = `${slugify(lead.company).slice(0, 48)}-atlas`;
  const draftRel = `docs/selling/drafts/${slug}-email.txt`;
  const { subject, body, angleKey } = buildDraft(lead, audit, angle);

  // The angle rides in the deal NAME because HubSpot custom properties 403 on this
  // plan (aideazz_lead_kind failed the same way). hs-outcomes-to-atlas.cjs already
  // parses deal names, so a " · angle" suffix is all it needs to report reply rate
  // PER ANGLE — the number that tells Elena which opening actually earns.
  // The lane MUST be readable from the deal name: hs-outcomes-to-atlas.cjs maps
  // deals to lanes by keyword, and its default is geo_aeo — so a WhatsApp-lane lead
  // would silently be scored against the wrong lane. The trailing " · angle" is the
  // per-angle attribution the same job parses.
  const LANE_TAG = {
    whatsapp_ai_agents: 'WhatsApp agent',
    ai_automation: 'automation',
    geo_aeo_tech_seo_makers: 'GEO/AEO fix',
    ai_video_generation: 'AI promo video',
  };
  const laneTag = LANE_TAG[lead.lane] || LANE_TAG.geo_aeo_tech_seo_makers;
  const dealName = `[CLIENT-ATLAS] ${lead.company} — ${laneTag} (audit: ${auditLabel(audit)}) · ${angleKey}`;
  if (DRY) return { slug, dealName, dealId: null };

  fs.mkdirSync(path.join(ROOT, 'docs/selling/drafts'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, draftRel), `SUBJECT: ${subject}\n\nTO: ${lead.email}\n\n${body}\n`, 'utf8');

  // Contact + deal FIRST. The registry entry must carry dealId: go-wa.ts gates the
  // whole post-send chain on it — `if (!key || !p.dealId) return;` — so without it
  // a send moves no stage, writes no ENTREGADO/ABIERTO stamp, and creates no
  // follow-up task. Writing the registry before the deal existed is exactly why the
  // first three Atlas leads looked dead after Elena clicked send.
  const contact = await hs('POST', '/crm/v3/objects/contacts', {
    properties: {
      email: lead.email,
      company: lead.company,
      website: lead.website,
      ...(lead.phone ? { phone: lead.phone } : {}),
      hs_lead_status: 'NEW',
    },
  });
  const deal = await hs('POST', '/crm/v3/objects/deals', {
    properties: {
      dealname: dealName,
      dealstage: STAGE_ACT_TODAY,
      pipeline: 'default',
      hubspot_owner_id: OWNER,
    },
  });
  if (contact?.id && deal?.id) {
    await hs('PUT', `/crm/v4/objects/deals/${deal.id}/associations/default/contacts/${contact.id}`, undefined).catch(
      () => {},
    );
  }

  // A TASK, due today. Added Aug 17 2026 — the machine created contact, deal and
  // note but never a task, so a staged lead only existed if Elena happened to
  // open the deal list. A lead nobody is reminded about is a lead that ages out;
  // "AGING >7d untouched" in the morning brief is the shape that failure takes.
  //
  // Best-effort: a task failure must never cost the lead itself, which is already
  // written by this point.
  if (deal?.id) {
    try {
      const task = await hs('POST', '/crm/v3/objects/tasks', {
        properties: {
          hs_task_subject: `Enviar 1er contacto — ${lead.company} (auditoría ${auditLabel(audit)})`,
          hs_task_body:
            `Lead de Atlas listo para enviar.\n\n` +
            `Sitio: ${lead.website}\nEmail: ${lead.email}\n` +
            `${lead.phone ? `WhatsApp: ${formatPhone507(lead.phone)}\n` : 'WhatsApp: no publicado en su sitio\n'}` +
            `Auditoría: ${blockedAudit(audit) ? 'su servidor bloqueó la lectura (HTTP 403) — sin puntaje' : `${audit.score}/100 (${audit.grade})`}\n\n` +
            `Los botones de envío están en la nota del deal.`,
          hs_task_status: 'NOT_STARTED',
          hs_task_priority: 'HIGH',
          hs_timestamp: Date.now(),
          hubspot_owner_id: OWNER,
        },
      });
      if (task?.id) {
        await hs('PUT', `/crm/v4/objects/tasks/${task.id}/associations/deals/${deal.id}`, [
          { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 216 },
        ]).catch(() => {});
        if (contact?.id) {
          await hs('PUT', `/crm/v4/objects/tasks/${task.id}/associations/contacts/${contact.id}`, [
            { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 204 },
          ]).catch(() => {});
        }
      }
    } catch (e) {
      console.warn(`      ⚠️ task not created for ${lead.company}: ${String(e.message).slice(0, 80)}`);
    }
  }

  // WhatsApp draft — same play as [CLIENT-MANUAL]: email is the tracked channel,
  // WhatsApp is Elena's laptop-only close. Registry needs digits-only phone.
  const waRel = `docs/selling/drafts/${slug}.txt`;
  const waText = buildWaDraft(lead, audit);
  if (lead.phone) fs.writeFileSync(path.join(ROOT, waRel), waText, 'utf8');

  // ── Second touch, staged up front ────────────────────────────────────────────
  // [CLIENT-MANUAL] deals carry BOTH touches in the note from day one, so the FU is
  // one click whenever Elena decides the first went unanswered. Atlas leads had no
  // FU slug at all, which meant a second touch required building one by hand — the
  // exact manual step that stops it from ever happening.
  const fuSlug = `${slug}-fu`;
  const fuRel = `docs/selling/drafts/${fuSlug}-email.txt`;
  const fuWaRel = `docs/selling/drafts/${fuSlug}.txt`;
  const fu = buildFuDraft(lead, audit, angle);
  fs.writeFileSync(path.join(ROOT, fuRel), `SUBJECT: ${fu.subject}\n\nTO: ${lead.email}\n\n${fu.body}\n`, 'utf8');
  const fuWaText = buildFuWaDraft(lead, audit);
  if (lead.phone) fs.writeFileSync(path.join(ROOT, fuWaRel), fuWaText, 'utf8');

  const reg = loadRegistry();
  const common = {
    company: lead.company,
    email: lead.email,
    score: audit.score,
    ...(deal?.id ? { dealId: String(deal.id) } : {}),
    ...(lead.phone ? { phone: digitsOnly(lead.phone) } : {}),
    // go-wa.ts reads both: Elena is copied on the send, and the deck rides as a real
    // PDF (the sender refuses the whole email if the file fails to load).
    ...(AIGO_KIT_ON ? { cc: ELENA_COPY_CC, attachments: [AIGO_DECK_ES_ATTACHMENT] } : {}),
  };
  reg[slug] = { ...common, emailDraft: draftRel, ...(lead.phone ? { draft: waRel } : {}) };
  reg[fuSlug] = { ...common, emailDraft: fuRel, ...(lead.phone ? { draft: fuWaRel } : {}) };
  saveRegistry(reg);

  // Labels matter beyond cosmetics: resend-webhook's findOutreachNote matches
  // /FOLLOW-UP|EMAIL FU|WHATSAPP FU|.../ to pick WHICH note to stamp, and
  // insertNoteStamp puts ENTREGADO/ABIERTO directly under the FOLLOW-UP block's
  // first <hr>. The old "ENVIAR PRIMER CONTACTO" heading matched nothing, so
  // stamps would have landed at the top of the note instead of under the buttons.
  const link = buildHubSpotEmailAnchor(slug, lead.email, `✉️ EMAIL 1er CONTACTO — aipa@aideazz.xyz (${lead.email})`);
  const waLink = lead.phone
    ? buildHubSpotWaAnchor(lead.phone, waText, `➡️ WHATSAPP 1er CONTACTO (laptop) — auditoría ${audit.score}/100 (${formatPhone507(lead.phone)})`)
    : null;
  const fuLink = buildHubSpotEmailAnchor(fuSlug, lead.email, `✉️ EMAIL FU — aipa@aideazz.xyz (${lead.email})`);
  const fuWaLink = lead.phone
    ? buildHubSpotWaAnchor(lead.phone, fuWaText, `➡️ WHATSAPP FU (laptop) — AI Growth Operator + auditoría (${formatPhone507(lead.phone)})`)
    : null;
  const noteBody = [
    `<b>FOLLOW-UP — click y enviar (texto listo, sin editar)</b><br>`,
    `${link}<br>`,
    waLink ? `${waLink}<br>` : '',
    `${fuLink}<br>`,
    fuWaLink ? `${fuWaLink}<br><br>` : `<br>`,
    `<b>🔥 NUEVO LEAD — Atlas lead machine</b><br>`,
    blockedAudit(audit)
      ? `<b>Auditoría:</b> bloqueada (HTTP 403) — el puntaje ${audit.score} midió la página de bloqueo, no el negocio`
      : `<b>Auditoría:</b> ${audit.score}/100 ${audit.grade}`,
    audit.aeo != null ? ` · AEO ${audit.aeo}` : '',
    `<br><b>Sitio:</b> ${lead.website}<br>`,
    `<b>Email:</b> ${lead.email}<br>`,
    lead.phone ? `<b>Tel:</b> ${lead.phone}<br>` : '',
    lead.rating ? `<b>Google:</b> ${lead.rating}★ (${lead.reviews || 0} reseñas)<br>` : '',
    `<b>Ciudad:</b> ${lead.city}<br>`,
    angle?.concept_id
      ? `<b>Atlas:</b> ángulo <code>${angleKey}</code> · lane ${angle.lane || '-'} · score ${angle.score ?? '-'} · snapshot ${angle.snapshot || '-'}<br><b>concept_id:</b> ${angle.concept_id}<br>`
      : `<b>Atlas:</b> ángulo <code>${angleKey}</code> (sin concepto fresco — fallback)<br>`,
    `<hr>`,
    `<b>Asunto:</b> ${subject}<br><br>`,
    `<pre style="white-space:pre-wrap;font-family:inherit">${body.replace(/</g, '&lt;')}</pre>`,
  ].join('');
  // The deck must exist IN the CRM too, not only in the Resend payload (CLAUDE.md:
  // "An attachment must also land IN HubSpot"). Best-effort: a Files-scope failure must
  // not cost the lead, and the email still attaches the PDF from disk — so it is logged.
  let attachProps = {};
  if (AIGO_KIT_ON) {
    try {
      const { uploadOutreachFile } = require('./hs-files.cjs');
      const f = await uploadOutreachFile(path.join(ROOT, AIGO_DECK_ES_ATTACHMENT.path), AIGO_DECK_ES_ATTACHMENT.filename);
      if (f?.id) attachProps = { hs_attachment_ids: String(f.id) };
    } catch (e) {
      console.warn(`      ⚠️ deck not attached to the HubSpot note for ${lead.company}: ${String(e.message).slice(0, 100)}`);
    }
  }
  const note = await hs('POST', '/crm/v3/objects/notes', {
    properties: { hs_note_body: noteBody, hs_timestamp: Date.now(), ...attachProps },
  });
  if (note?.id && deal?.id) {
    await hs('PUT', `/crm/v4/objects/notes/${note.id}/associations/default/deals/${deal.id}`, undefined).catch(() => {});
  }
  return { slug, dealName, dealId: deal?.id || null };
}

/**
 * A no-website business (13 Oct 2026): Company + Deal + HIGH task + one note with the
 * permission-first WhatsApp button. No email, no audit, no registry row — there is no
 * site to audit and no email to send; WhatsApp from the laptop is the only channel.
 */
async function stageNoWebsiteLead(c) {
  const dealName = noWebsiteDealName(c);
  if (DRY) return { dealName, dealId: null };
  const isMobile = MOBILE_RE.test(digitsOnly(c.phone));
  const company = await hs('POST', '/crm/v3/objects/companies', {
    properties: {
      name: c.company,
      phone: c.phone,
      city: c.city,
      description: `No website on Google profile${c.presence ? ` (links ${c.presence})` : ''} — Atlas Monday ${new Date().toISOString().slice(0, 10)}. Business Identity Audit.`,
    },
  });
  const deal = await hs('POST', '/crm/v3/objects/deals', {
    properties: { dealname: dealName, dealstage: STAGE_ACT_TODAY, pipeline: 'default', hubspot_owner_id: OWNER },
  });
  if (!deal?.id) throw new Error('deal not created');
  if (company?.id) {
    await hs('PUT', `/crm/v4/objects/deals/${deal.id}/associations/default/companies/${company.id}`, undefined).catch(() => {});
  }
  try {
    const task = await hs('POST', '/crm/v3/objects/tasks', {
      properties: {
        hs_task_subject: `Enviar 1er contacto (sin sitio web) — ${c.company}`,
        hs_task_body:
          `Lead de Atlas SIN sitio web.\n\nGoogle: ${c.rating ?? '—'}★ (${c.reviews} reseñas)\nTel: ${c.phone}${isMobile ? '' : ' (fijo)'}\n` +
          `${c.presence ? `Perfil social: ${c.presence}\n` : ''}\nBusca el nombre 1 vez antes de enviar. El botón está en la nota del deal.`,
        hs_task_status: 'NOT_STARTED',
        hs_task_priority: 'HIGH',
        hs_timestamp: Date.now(),
        hubspot_owner_id: OWNER,
      },
    });
    if (task?.id) {
      await hs('PUT', `/crm/v4/objects/tasks/${task.id}/associations/deals/${deal.id}`, [
        { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 216 },
      ]).catch(() => {});
    }
  } catch (e) {
    console.warn(`      ⚠️ task not created for ${c.company}: ${String(e.message).slice(0, 80)}`);
  }
  const note = await hs('POST', '/crm/v3/objects/notes', {
    properties: {
      hs_note_body: buildNoWebsiteNote(c, { isMobile, date: new Date().toISOString().slice(0, 10) }),
      hs_timestamp: Date.now(),
    },
  });
  if (note?.id) {
    await hs('PUT', `/crm/v4/objects/notes/${note.id}/associations/default/deals/${deal.id}`, undefined).catch(() => {});
  }
  return { dealName, dealId: deal.id };
}

async function telegram(text) {
  if (!TG || !CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text: text.slice(0, 4090), disable_web_page_preview: true }),
    });
  } catch {
    /* best effort */
  }
}

// Only run when executed directly. Without this, `require`-ing the module to reuse
// its letter templates would fire the whole machine — Google searches, audits, and
// real HubSpot contacts and deals — as an import side effect.
if (require.main === module) (async () => {
  const yieldLedger = loadYield();
  const forcedLane = process.env.LEAD_LANE && ICP_BY_LANE[process.env.LEAD_LANE] ? process.env.LEAD_LANE : null;
  const primary = !forcedLane && PRIMARY_LANE && ICP_BY_LANE[PRIMARY_LANE] ? PRIMARY_LANE : null;
  if (!forcedLane && PRIMARY_LANE && !ICP_BY_LANE[PRIMARY_LANE]) {
    console.warn(`[lead-machine] ⚠️ ATLAS_PRIMARY_LANE="${PRIMARY_LANE}" is not a lane — falling back to the top-score pick`);
  }
  // The week's legs, worked in order (19 Oct 2026). No primary lane (or a forced one): one leg, as before.
  const legs = [];
  if (primary) {
    const other = pickLane(primary);
    if (other.lane && other.lane !== primary) {
      legs.push({ lane: primary, score: laneScore(primary), role: 'primary', quota: Math.min(PRIMARY_MIN, MAX_NEW) });
      legs.push({ lane: other.lane, score: other.score, role: 'top score', quota: Infinity });
      legs.push({ lane: primary, score: laneScore(primary), role: 'primary refill', quota: Infinity, resume: true });
    } else {
      // No other lane scored (or concepts.json unreadable): one primary leg, no split, nothing thrown away.
      legs.push({ lane: primary, score: laneScore(primary), role: 'primary', quota: Infinity });
    }
  } else {
    const picked = pickLane();
    legs.push({
      lane: picked.lane,
      score: picked.score,
      role: picked.forced ? 'forced via LEAD_LANE' : 'top score',
      quota: Infinity,
    });
  }
  console.log(
    `[lead-machine] start${DRY ? ' (DRY RUN — nothing written)' : ''} · max ${MAX_NEW} · band ${AUDIT_MIN}-${AUDIT_MAX}`,
  );
  console.log(
    `[lead-machine] WEEK: ${legs.map((l) => `${l.lane} (${l.role}${Number.isFinite(l.quota) ? ` ≤${l.quota}` : ''})`).join(' → ')}`,
  );
  const known = await loadKnown();
  console.log(`[lead-machine] dedup set: ${known.names.size} companies, ${known.domains.size} domains already worked`);
  const staged = [];
  const skip = { noEmail: 0, dupe: 0, band: 0, noAudit: 0, seen: 0, rescued: 0 };

  // Run-wide memory (19 Oct 2026 review). Resume by IDENTITY, not by position: orderTargets() re-sorts as the yield
  // ledger changes mid-run, so an index from leg 1 points at the wrong query in the refill. Lanes also share queries
  // ('yacht charter' Panama City), so a search any leg already ran is never paid for twice. And the unprocessed tail
  // of a search a leg stopped in on its quota is carried to the refill instead of buying a new search.
  const searchKey = (t) => `${t.q}|${t.city}|${t.ll || ''}`;
  const searchedRun = new Set();
  const leftover = {};

  for (const leg of legs) {
    if (staged.length >= MAX_NEW) break;
    const fresh = orderTargets(leg.lane, ICP_BY_LANE[leg.lane], yieldLedger)
      .filter((t) => !searchedRun.has(searchKey(t)))
      .map((t) => ({ t }));
    const carry = leg.resume && leftover[leg.lane] ? [leftover[leg.lane]] : [];
    delete leftover[leg.lane];
    const TARGETS = [...carry, ...fresh];
    if (!TARGETS.length) continue;
    const angle = atlasAngle(leg.lane);
    const legStart = staged.length;
    const legFull = () => staged.length >= MAX_NEW || staged.length - legStart >= leg.quota;
    console.log(
      `[lead-machine] LANE: ${leg.lane} (${leg.role}${leg.score != null ? ` · Atlas score ${leg.score}` : ''})` +
        ` · offer: ${LANE_OFFER[leg.lane].label} · ${TARGETS.length} ICP queries` +
        ` · order: ${TARGETS.slice(0, 3).map((x) => x.t.q).join(' → ')} …` +
        (angle ? ` · angle ${angle.angle}` : ' · no fresh angle'),
    );

    for (const item of TARGETS) {
      if (legFull()) break;
      const target = item.t;
      // A carried tail is already paid for: work it without a new search.
      let businesses = item.businesses || [];
      if (!item.businesses) searchedRun.add(searchKey(target));
      if (!item.businesses) try {
        // Best supply first: the SerpAPI maps engine carries phone + reviews, which
        // organic search cannot. When it has no quota (cancelled Aug 11 2026) we go
        // straight to Bright Data rather than throwing the lane away — that `continue`
        // is what would have made this Monday, and every Monday after, produce zero.
        businesses = placesReady() || (await serpHasQuota()) ? await mapsSearch(target) : await bdSerpBusinesses(target);
      } catch (e) {
        console.warn(`[lead-machine] "${target.q}" primary supply failed: ${String(e.message).slice(0, 90)}`);
        // A provider hiccup must not silently cost a lane. Try the other supply once.
        try {
          businesses = await bdSerpBusinesses(target);
          console.log(`[lead-machine] "${target.q}" recovered via Bright Data`);
        } catch (e2) {
          console.warn(`[lead-machine] "${target.q}" Bright Data also failed: ${String(e2.message).slice(0, 90)}`);
          continue;
        }
      }
      console.log(
        `[lead-machine] ${target.city} · "${target.q}" → ${businesses.length} ` +
          (item.businesses ? 'left from the primary leg (no new search)' : 'with a website'),
      );
      const before = { seen: skip.seen, dupe: skip.dupe, staged: staged.length };

      for (let bi = 0; bi < businesses.length; bi++) {
        const b = businesses[bi];
        // A social profile is not a website: skip before spending an audit on it.
        if (isPlatformSite(b.website)) {
          // An Instagram/Facebook page as the Google "website" = a business with no site of its
          // own: a no-website candidate (13 Oct 2026). Places only — it carries phone + reviews.
          if (b.source === 'places' && socialPlatform(b.website)) {
            noWebsiteSeen.push({ ...b, presence: b.website, query: target.q, highTicket: target.hl === 'en' });
          }
          skip.noEmail++;
          continue;
        }
        if (legFull()) {
          // Stopped on the LEG quota (not MAX_NEW): keep the unworked tail for the refill leg.
          if (staged.length < MAX_NEW && bi < businesses.length) leftover[leg.lane] = { t: target, businesses: businesses.slice(bi) };
          break;
        }
        skip.seen++;
        // Cheapest checks first: never spend a scrape or an audit on a business
        // Elena has already worked.
        const fp = fingerprint(b.company);
        let domain = '';
        try {
          domain = new URL(b.website).hostname.replace(/^www\./, '').toLowerCase();
        } catch {
          /* handled below by findEmail */
        }
        if ((fp && known.names.has(fp)) || (domain && known.domains.has(domain))) {
          skip.dupe++;
          console.log(`   ↺ ${b.company.slice(0, 34)} — already in the CRM, skipped`);
          continue;
        }
        const email = await findEmail(b.website);
        if (!email) {
          skip.noEmail++;
          continue;
        }
        // Restore the WhatsApp close channel the maps engine used to supply. Only
        // fills a gap — if a supply ever returns a real phone again, that one wins.
        if (!b.phone && domain && phoneByDomain.has(domain)) {
          b.phone = phoneByDomain.get(domain);
          console.log(`      ↳ WhatsApp number found on their site: ${formatPhone507(b.phone)}`);
        }
        if (await contactExists(email)) {
          skip.dupe++;
          continue;
        }
        // Remember within this run too, so two branches of the same chain don't
        // both get staged.
        if (fp) known.names.add(fp);
        if (domain) known.domains.add(domain);
        const audit = await auditSite(b.website);
        if (!audit) {
          skip.noAudit++;
          continue;
        }
        // A site that blocks GPTBot/ClaudeBot scores near zero on AI access, which
        // drags its TOTAL under the floor — so the hardest blockers were being
        // discarded as "broken site" when they are the strongest prospects we have:
        // being invisible to ChatGPT is the entire pitch, and they are provably
        // real businesses (Google reviews, a live site that answers humans).
        // Rescue them below the floor; never above it, where there is nothing to sell.
        const crawlerBlocked = audit.aiAccess != null && audit.aiAccess <= 50;
        // Google reviews/stars are the maps-engine signal. Bright Data organic has
        // neither — so without a second signal this rescue would silently stop firing
        // the moment the supply switched, quietly undoing the Aug 4 fix that exists to
        // save exactly these prospects. Ranking on page one for a local commercial
        // query is its own proof of a real business, so it stands in for the stars.
        const realBusiness =
          (b.reviews || 0) >= 5 ||
          (b.rating || 0) >= 4 ||
          (b.source === 'brightdata' && (b.serpRank || 99) <= 10);
        const rescued = crawlerBlocked && realBusiness && audit.score < AUDIT_MIN;
        if ((audit.score < AUDIT_MIN && !rescued) || audit.score > AUDIT_MAX) {
          skip.band++;
          console.log(`   ✗ ${b.company.slice(0, 30)} — ${audit.score}/100 outside band`);
          continue;
        }
        if (rescued) {
          skip.rescued++;
          console.log(`   ⭐ ${b.company.slice(0, 30)} — ${audit.score}/100 but BLOCKS AI crawlers (access ${audit.aiAccess}) — top prospect`);
        }
        const r = await stageLead({ ...b, email, lane: leg.lane, query: target.q }, audit, angle);
        staged.push({ ...b, email, lane: leg.lane, score: audit.score, grade: audit.grade, ...r });
        console.log(`   ✅ ${b.company.slice(0, 32)} · ${audit.score}/${audit.grade} · ${email}`);
        await sleep(400);
      }
      // Record this query's yield so next Monday orders it by measured saturation. Never let a
      // weaker run erase a real measurement: a failed search (0 found — indistinguishable from
      // a Bright Data outage) writes nothing, and a run cut short by MAX_NEW or too small to
      // judge (< 4 looked at) does not overwrite an earlier record that was big enough to.
      const k = yieldKey(leg.lane, target);
      const rec = {
        last: new Date().toISOString().slice(0, 10),
        found: businesses.length,
        seen: skip.seen - before.seen,
        dupe: skip.dupe - before.dupe,
        staged: staged.length - before.staged,
      };
      const prev = yieldLedger[k];
      const carried = leftover[leg.lane] && leftover[leg.lane].t === target ? leftover[leg.lane] : null;
      if (carried) {
        // Cut by the leg quota: hold the partial count until the tail is worked (or the run ends).
        carried.rec = rec;
      } else if (item.businesses) {
        // A carried tail: record leg 1 + tail as ONE measurement of the query.
        const part = item.rec || { found: businesses.length, seen: 0, dupe: 0, staged: 0 };
        const merged = { last: rec.last, found: part.found, seen: part.seen + rec.seen, dupe: part.dupe + rec.dupe, staged: part.staged + rec.staged };
        if (merged.found && !(merged.seen < 4 && prev && prev.seen >= 4)) yieldLedger[k] = merged;
      } else if (businesses.length && !(rec.seen < 4 && prev && prev.seen >= 4)) {
        yieldLedger[k] = rec;
      }
    }
  }
  // Tails no leg came back for: record the partial count (the old single-lane behaviour for a query cut short)
  // and keep their Instagram/Facebook-only businesses as no-website candidates, so a cut never loses them.
  for (const [lane, lo] of Object.entries(leftover)) {
    const k = yieldKey(lane, lo.t);
    const prev = yieldLedger[k];
    if (lo.rec && lo.rec.found && !(lo.rec.seen < 4 && prev && prev.seen >= 4)) yieldLedger[k] = lo.rec;
    for (const b of lo.businesses) {
      if (isPlatformSite(b.website) && b.source === 'places' && socialPlatform(b.website)) {
        noWebsiteSeen.push({ ...b, presence: b.website, query: lo.t.q, highTicket: lo.t.hl === 'en' });
      }
    }
  }
  if (!DRY) saveYield(yieldLedger);

  // ── No-website top-up (19 Oct 2026): dental, only when the lane's queries left the slots short ──
  if (NOWEB_MAX > 0 && NOWEB_QUERIES.length && placesReady()) {
    for (const q of NOWEB_QUERIES) {
      if (pickNoWebsite(noWebsiteSeen, known.names, fingerprint, NOWEB_MAX).length >= NOWEB_MAX) break;
      try {
        // Websited results are ignored here: this search only feeds the no-website slots.
        await mapsSearch({ q, ll: PTY, city: 'Panama City', gl: 'pa', hl: /[áéíóúñ]/i.test(q) ? 'es' : 'en', highTicket: true });
        console.log(`[lead-machine] no-website top-up · "${q}" · Panama City`);
      } catch (e) {
        console.warn(`[lead-machine] no-website top-up "${q}" failed: ${String(e.message).slice(0, 90)}`);
      }
    }
  }

  // ── No-website businesses: the best NOWEB_MAX, on top of the regular MAX_NEW ──
  // A wider pool, so a candidate already in HubSpot by phone is replaced by the next best one.
  const nowebPicked = pickNoWebsite(noWebsiteSeen, known.names, fingerprint, NOWEB_MAX * 3);
  const nowebStaged = [];
  let nowebKnownByPhone = 0;
  for (const c of nowebPicked) {
    if (nowebStaged.length >= NOWEB_MAX) break;
    try {
      if (await companyPhoneExists(c.phone)) {
        nowebKnownByPhone++;
        console.log(`   ↺ ${c.company.slice(0, 32)} — already in HubSpot (same phone), skipped`);
        continue;
      }
      const r = await stageNoWebsiteLead(c);
      nowebStaged.push({ ...c, ...r });
      console.log(`   🧭 ${c.company.slice(0, 32)} · no website · ${c.rating ?? '—'}★ ${c.reviews} · ${c.phone}`);
    } catch (e) {
      console.warn(`   ⚠️ no-website lead not staged (${c.company.slice(0, 32)}): ${String(e.message).slice(0, 90)}`);
    }
  }
  console.log(`[lead-machine] no-website: ${noWebsiteSeen.length} seen · ${nowebPicked.length} eligible · ${nowebKnownByPhone} already in HubSpot by phone · ${nowebStaged.length} staged (max ${NOWEB_MAX})`);

  console.log(
    `[lead-machine] done · staged ${staged.length} · looked at ${skip.seen} · ` +
      `no-email ${skip.noEmail} · already-in-CRM ${skip.dupe} · outside-band ${skip.band} · audit-failed ${skip.noAudit} · crawler-blocked rescued ${skip.rescued}`,
  );

  // PUBLISH — the step whose absence made every send button dead.
  //
  // /go/outreach-email/:slug resolves a slug by reading the registry, and its
  // documented fallback is GitHub main. Until Aug 17 2026 this machine wrote the
  // drafts and the registry to Oracle's disk and stopped, so the buttons it had
  // just put in HubSpot resolved to "Unknown outreach email slug" — and worse, a
  // stale copy of the registry copied onto the box silently erased 20 entries
  // that existed nowhere else. Artifacts that live in exactly one place are one
  // careless `cp` from gone.
  //
  // Committing them closes the loop: the buttons work immediately, and the
  // registry is recoverable from git instead of from memory.
  if (staged.length && !DRY) await publishOutreachArtifacts(staged.length);

  if ((staged.length || nowebStaged.length) && !DRY) {
    const nowebLine = noWebsiteTelegramLine(nowebStaged);
    const lines = [
      `🔥 ${staged.length + nowebStaged.length} nuevos leads listos — 🔥 I Act TODAY`,
      ``,
      ...staged.map((s) => `· ${s.company} — ${s.score}/${s.grade} · ${s.city} · ${LANE_OFFER[s.lane]?.label || s.lane}`),
      ...(nowebLine ? [``, nowebLine] : []),
      ``,
      `Cada uno ya tiene contacto, deal, tarea y el botón ENVIAR en la nota de HubSpot.`,
      `Revisa y envía: https://app.hubspot.com/contacts/51409153/objects/0-3/views/all/list`,
    ];
    await telegram(lines.join('\n'));
  }
})();

/**
 * Commit and push the drafts + registry this run produced.
 *
 * Deliberately narrow: it stages ONLY docs/selling/drafts and the registry. This
 * repo carries runtime JSON drift and untracked scratch files everywhere, so a
 * `git add -A` here would sweep them into a commit — a mistake already made once
 * in this repo's history.
 *
 * Never throws. A push failure must not lose the leads that were just written to
 * HubSpot; it degrades to a loud warning telling Elena to push by hand, because a
 * silent failure here is what produced dead buttons in the first place.
 */
async function publishOutreachArtifacts(count) {
  const { execFileSync } = require('child_process');
  const git = (...args) =>
    execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('add', 'docs/selling/outreach-registry.json', 'docs/selling/drafts');
    const staged = git('diff', '--cached', '--name-only');
    if (!staged) {
      console.log('[lead-machine] publish: nothing new to commit');
      return;
    }
    git('commit', '-m', `selling: ${count} Atlas lead draft(s) + registry (auto)`);
    // Rebase first: cron runs unattended and a laptop push in between would
    // otherwise leave this commit stranded on the box, which is the same failure
    // in a different costume.
    try {
      git('pull', '--rebase', 'origin', 'main');
    } catch {
      console.warn('[lead-machine] publish: rebase failed — pushing may be rejected');
    }
    git('push', 'origin', 'main');
    console.log(`[lead-machine] publish: registry + drafts pushed — send buttons live`);
  } catch (e) {
    console.warn(
      `[lead-machine] ⚠️ PUBLISH FAILED: ${String(e.message).slice(0, 140)}\n` +
        `   The HubSpot send buttons will 404 until someone runs:\n` +
        `   git add docs/selling/outreach-registry.json docs/selling/drafts && git commit && git push`,
    );
  }
}

/**
 * Exported so the one-off backfill writes the SAME letters this machine writes.
 * Copy-pasting the templates into a second script guarantees they drift apart, and
 * the drift only surfaces when a prospect gets a letter nobody reviewed.
 * Guarded by require.main so exporting never triggers the run above.
 */
module.exports = { buildDraft, buildFuDraft, buildWaDraft, buildFuWaDraft, pickBestEmail, mapsSearch, servicesPD, atlasAngle, ANGLE_ES, ANGLE_FALLBACK, noWebsiteSeen };
