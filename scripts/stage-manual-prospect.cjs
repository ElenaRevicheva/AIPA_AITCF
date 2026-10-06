#!/usr/bin/env node
/**
 * stage-manual-prospect.cjs — Manual Prospect Play → HubSpot (5 records).
 * Usage: node scripts/stage-manual-prospect.cjs <domain> [--with-fu] [--dry-run]
 * Reads HUBSPOT_API_KEY from .env or the environment. Writes draft + prospect pack
 * under docs/selling/.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  buildHubSpotWaAnchor,
  buildDualChannelNoteLinks,
  buildManualEmailSubject,
  buildManualEmailBody,
  formatPhone507,
  registerOutreachSlug,
  slugify,
} = require('./wa-link-lib.cjs');
const {
  hubspotKey,
  hubspotOwnerId,
  hubspotBase,
  visibilityUrl,
  visibilityKey,
} = require('./hs-env.cjs');

const root = path.join(__dirname, '..');
const KEY = hubspotKey();
/** Elena Revicheva — always assign Manual Prospect tasks/deals so Tasks UI "Assigned to me" works */
const HUBSPOT_OWNER_ID = hubspotOwnerId();
const VIS_KEY = visibilityKey();
const dryRun = process.argv.includes('--dry-run');
const skipAudit = process.argv.includes('--skip-audit');
/**
 * --prepare-only writes every artifact (WhatsApp + email drafts, registry row, prospect
 * pack with the exact note HTML) without creating anything in HubSpot, so the letter can
 * be read before a deal exists — and so the play can be prepared from a machine that
 * cannot reach api.hubapi.com.
 */
const prepareOnly = process.argv.includes('--prepare-only');
/** Skip the prospect-site crawl (contacts then come from PROSPECT_META) — used by tests. */
const noScrape = process.argv.includes('--no-scrape');
/** Run the follow-up installer on the new deal, so one command ends the full cycle. */
const withFu = process.argv.includes('--with-fu');
const scoreArg = process.argv.find((a) => a.startsWith('--score='));
const scoreOverride = scoreArg ? Number(scoreArg.split('=')[1]) : null;
/**
 * --update=<dealId> refreshes an ALREADY-staged prospect: rewrites its drafts + registry
 * and posts a fresh note on the existing deal, instead of creating a second one. Purely
 * additive — the old note stays in the deal's history, nothing is deleted.
 */
const updateArg = process.argv.find((a) => a.startsWith('--update='));
const updateDealId = updateArg ? updateArg.split('=')[1].trim() : null;
const domainArg = process.argv.find(a => a.startsWith('--') === false && a !== process.argv[0] && a !== process.argv[1]);
if (!domainArg) {
  console.error('Usage: node scripts/stage-manual-prospect.cjs <domain> [--with-fu] [--prepare-only] [--dry-run] [--skip-audit] [--score=75] [--no-scrape] [--update=<dealId>]');
  process.exit(1);
}
const domain = domainArg.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
const url = `https://${domain}`;

/** Modes that never call HubSpot; everything else needs the Service Key up front. */
const offline = dryRun || prepareOnly;
if (!KEY && !offline) {
  console.error('HUBSPOT_API_KEY missing — put it in .env or the environment (docs/HUBSPOT_CURSOR_CONNECTION.md)');
  process.exit(1);
}

const HS = hubspotBase();
const VIS = visibilityUrl();
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

/** Panama mobiles are 8 digits starting with 6; landlines are 7 and have no WhatsApp. */
const PA_MOBILE = /^5076\d{7}$/;

function parseContacts(html) {
  const out = new Set();
  const patterns = [
    /wa\.me\/(\d+)/gi,
    /api\.whatsapp\.com\/send[^"']*phone=(\d+)/gi,
    /tel:([+\d\s-]+)/gi,
    /mailto:([^"'\s?]+)/gi,
    // The plus is optional: Panama sites commonly print "507 300-2858". Requiring it
    // made those sites look phone-less and silently downgraded them to email-only.
    /(?<!\d)\+?507[\s.-]?\d{3,4}[\s.-]?\d{4}(?!\d)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(html)) !== null) out.add(m[1] || m[0]);
  }
  // An explicit wa.me / api.whatsapp link is the site declaring a WhatsApp number —
  // authoritative even when it is not a Panama mobile.
  const waExplicit = [
    ...[...html.matchAll(/wa\.me\/(\d+)/gi)].map(m => m[1]),
    ...[...html.matchAll(/api\.whatsapp\.com\/send[^"']*phone=(\d+)/gi)].map(m => m[1]),
  ]
    .map(d => (d.length === 8 ? `507${d}` : d))
    .filter(d => d.length >= 10);
  const phones = [...out]
    .map(p => {
      let d = p.replace(/\D/g, '');
      // wa.me/66150368 (local 8-digit) → 50766150368
      if (d.length === 8) d = `507${d}`;
      return d;
    })
    .filter(p => p.length >= 10 && p.startsWith('507'));
  // Emails: mailto links AND plain text (many Panama sites print info@… as text).
  // Placeholder addresses printed inside form previews and demo screenshots are the one
  // class of scrape that is worse than finding nothing: it looks like a real contact, so
  // it silently outranks the hand-researched preferredEmail and ships a one-click button
  // aimed at a fictional person. PUMAS.digital (Aug 11 2026) published `jane@company.com`
  // in its demo-request mock and the staged deal took it as the prospect's address.
  const placeholder = /^(jane|john|joe|name|you|your(name|email|company)?|firstname|email|test|demo|sample)@|@(company|yourcompany|yourdomain|domain|example|acme|email|mail|test|sample)\.(com|org|net|io|co)$/i;
  const junk = /\.(png|jpg|jpeg|gif|webp|svg|css|js|html)$|@(2x|3x)\b|sentry|wixpress|example\.|correoernesto|^[0-9]+@|@.*-seccion\.|user@domain|john@doe|ttycirugia/i;
  // mailto: is authoritative — the site itself declares the address there.
  const mailtoEmails = [...html.matchAll(/mailto:([^"'\s?<>]+)/gi)].map(m => m[1].toLowerCase());
  // Cloudflare "Email Address Obfuscation" replaces every address with a
  // data-cfemail hex blob (first byte = XOR key). The site is still declaring the
  // address, so it is as authoritative as mailto:. alquilerdeyatespanama.com
  // (2 Oct 2026) printed info@ in its footer and the scrape saw no email at all.
  for (const m of html.matchAll(/data-cfemail="([0-9a-f]{4,})"/gi)) {
    const hex = m[1];
    const key = parseInt(hex.slice(0, 2), 16);
    let s = '';
    for (let i = 2; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
    mailtoEmails.push(s.toLowerCase());
  }
  // Plain text needs a LEFT boundary, or a label glued to the address is swallowed
  // into the local part: "Email" + "contactus@<clinic domain>" became
  // emailcontactus@… and the send was suppressed (caught July 26 2026).
  const textEmails = [
    ...html.matchAll(/(?<![A-Za-z0-9._%+-])[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g),
  ].map(m => m[0].toLowerCase());

  /**
   * Last-resort repair for addresses that still arrive glued to a label
   * ("emailcontactus@…", "correoinfo@…"). Only accepts the stripped variant when
   * the site itself also shows it — never guesses a new address.
   */
  const unglue = (addr) => {
    const m = addr.match(/^(e-?mail|correo(?:electronico)?|mail|escr[ií]benos|cont[áa]ctenos)([a-z][a-z0-9._%+-]{2,})@(.+)$/i);
    if (!m) return addr;
    const candidate = `${m[2]}@${m[3]}`.toLowerCase();
    const shown = new RegExp(`(?<![A-Za-z0-9._%+-])${candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    return shown.test(html) || mailtoEmails.includes(candidate) ? candidate : addr;
  };

  const emails = [...mailtoEmails, ...textEmails]
    .map(e => e.toLowerCase())
    .map(unglue)
    .filter(e => !junk.test(e))
    .filter(e => !placeholder.test(e))
    .filter(e => /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e));
  // Only a declared WhatsApp link or a Panama mobile can receive a WhatsApp message.
  // Handing a landline to wa.me produces a button that opens a chat with nobody.
  const wa = waExplicit[0] || phones.find(p => PA_MOBILE.test(p)) || null;
  const onDomain = emails.find(e => e.endsWith(`@${domain}`) || e.includes(domain.split('.')[0]));
  const email = onDomain || emails[0] || null;
  return { phones: [...new Set(phones)], email, whatsapp: wa };
}

/**
 * Uploads meta.attachments to HubSpot Files so the deck exists IN the CRM, not only in the
 * Resend payload (CLAUDE.md: "An attachment must also land IN HubSpot"). Fails loudly:
 * a note that claims a deck it does not carry is the bug this guards against.
 */
async function noteAttachmentProps(meta) {
  if (!meta.attachments || !meta.attachments.length) return {};
  const { filesScopeOk, uploadOutreachFile } = require('./hs-files.cjs');
  const sc = await filesScopeOk();
  if (!sc.ok) throw new Error(`HubSpot files scope: ${sc.reason}`);
  const ids = [];
  for (const a of meta.attachments) {
    const f = await uploadOutreachFile(path.join(root, a.path), a.filename);
    ids.push(String(f.id));
  }
  return { hs_attachment_ids: ids.join(';') };
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

/** The AI Growth Operator paragraph — canonical wording (MANUAL_PROSPECT_PLAY.md). */
const OPERATOR_PARA =
  'No vendo otro CRM ni otro chatbot. Instalo un AI Growth Operator que trabaja 24/7 dentro de las herramientas que ya usan: que ChatGPT los recomiende, investigue prospectos, haga outreach y seguimiento, califique leads por WhatsApp, mantenga el CRM al día y les entregue un briefing diario con las mejores oportunidades.';

/** A site scoring this high has no visibility problem to sell against. */
const CREDENTIAL_SCORE = 85;

/**
 * The one place Elena says she is open to roles (`openToRoles: true` in PROSPECT_META).
 *
 * Written for search firms, where a senior engineer is not a favour to place but
 * inventory to map, and worded to keep that footing: it is disclosed as transparency,
 * not asked as a favour; it names the level she would consider instead of "cualquier
 * oportunidad"; and it closes by putting the paid offer back on the table, so the letter
 * cannot be read as a pitch that was really a job application. One block, one review —
 * per-prospect wording would drift into pleading on the fourth rewrite.
 *
 * Said once, in the first letter only. The follow-up stays purely commercial: asking
 * twice is what turns a peer's disclosure into a request.
 */

const OPEN_TO_ROLES_NOTE =
  'Y una nota personal, con transparencia: además de instalar estos sistemas para empresas, estoy abierta a escuchar oportunidades — liderazgo técnico en IA, arquitectura o automatización, en Panamá o remoto. Si en alguna de sus búsquedas calza ese perfil, con gusto les envío mi CV y conversamos; y si no, la propuesta de arriba sigue en pie igual.';

/**
 * English market path (`lang: 'en'` in PROSPECT_META). Panama/LATAM stays the default —
 * every existing prospect keeps the Spanish letter byte-for-byte. This exists because a
 * Spanish cold letter to Dubai reads as a mis-send, which costs the read before the
 * first line is judged on merit.
 */
const OPERATOR_PARA_EN =
  'I do not sell another CRM or another chatbot. I install an AI Growth Operator that works 24/7 inside the tools a company already uses: getting recommended by ChatGPT and Claude, researching prospects, running outreach and follow-up, qualifying inbound leads, keeping the CRM current, and delivering a daily briefing of the best opportunities.';

/** Same discipline as the Spanish note: disclosed once, after the paid ask, never asked twice. */
const OPEN_TO_ROLES_NOTE_EN =
  'And one personal note, in the interest of transparency: alongside installing these systems for companies, I am open to hearing about roles — technical AI leadership, architecture or automation, remote or relocating. If that profile is ever useful to you, I will gladly send my CV and we can talk; and if not, the proposal above stands exactly as it is.';

function buildDraftEn(ctx) {
  const { domain, score, grade, compliment, pdEmoji, pdLine } = ctx;
  return [
    `Hi ${ctx.greetName || 'there'}, good to meet you 👋 I'm Elena Revicheva, an AI and automation engineer — portfolio: https://aideazz.xyz/portfolio`,
    '',
    `First, genuine congratulations — ${compliment}.`,
    '',
    `I analysed ${domain} with my own AI-visibility engine (I built it; it runs at https://aideazz.xyz/api) and it scored ${score}/100 (${grade}). One finding is worth sixty seconds of your time.`,
    '',
    ctx.finding,
    ...(ctx.nuance ? ['', ctx.nuance] : []),
    '',
    OPERATOR_PARA_EN,
    '',
    ctx.ask || 'If it is useful, I can show you what that looks like on your side in 15 minutes — no obligation.',
    // After the paid ask, never before it: the offer is the reason for writing.
    ...(ctx.openToRoles ? ['', OPEN_TO_ROLES_NOTE_EN] : []),
    ...(ctx.deckLine ? ['', ctx.deckLine] : []),
    '',
    `PS: beyond AI visibility, ${pdLine} All of it with live demos in my portfolio 👆 ${pdEmoji}`,
    ...(ctx.tailLines ? ['', ...ctx.tailLines] : []),
    '',
    'Have a great day,',
    'Elena Revicheva',
    'Founder | AI & Automation Engineer — AIdeazz AI Lab ✨',
  ].join('\n');
}

/**
 * Optional per-prospect personal touch (6 Oct 2026, Ford Realty — the realtor who helped Elena's family):
 * `greeting` replaces the template's first line; `opener` is a personal paragraph right after it. Both
 * absent → the letter is byte-identical to before.
 */
function buildDraft(ctx) {
  const text = buildDraftCore(ctx);
  if (!ctx.greeting && !ctx.opener) return text;
  const lines = text.split(String.fromCharCode(10));
  if (ctx.greeting) lines[0] = ctx.greeting;
  if (ctx.opener) lines.splice(1, 0, '', ctx.opener);
  return lines.join(String.fromCharCode(10));
}

function buildDraftCore(ctx) {
  if (ctx.lang === 'en') return buildDraftEn(ctx);
  const {
    domain, score, grade, weakName, weakScore, moneyQuery, compliment, pdEmoji, pdLine,
  } = ctx;

  // Rapid Tires precedent (Aug 4 2026): telling an 87-94/100 site that it "todavía no
  // aparece como respuesta citable" is simply false, and reads as not having done the
  // homework. Above CREDENTIAL_SCORE the audit becomes the CREDENTIAL that earns the
  // read, and the letter pivots to what they actually lack. Requires a `pivot` in meta
  // so the reason for writing is specific to their business, never a template.
  if (score >= CREDENTIAL_SCORE && ctx.pivot) {
    return [
      `Hola, ¡un gusto saludarles! 👋 Soy Elena Revicheva, ingeniera de IA aquí en Panamá: https://aideazz.xyz/portfolio`,
      '',
      `Primero, felicitaciones de verdad. Analicé ${domain} con mi propio motor de auditoría de visibilidad en IA (lo desarrollé yo, corre en https://aideazz.xyz/api) y sacó ${score}/100 (${grade}) — ${compliment}.`,
      '',
      `Se los digo porque casi nadie está en ese nivel, y porque no les voy a inventar un problema que no tienen.`,
      '',
      `Les escribo por otra cosa. ${ctx.pivot}`,
      '',
      OPERATOR_PARA,
      '',
      ctx.ask ||
        `Si les sirve, en 15 minutos les muestro cómo quedaría el Operator en su negocio — sin compromiso.`,
      // After the paid ask, never before it: the offer is the reason for writing.
      ...(ctx.openToRoles ? ['', OPEN_TO_ROLES_NOTE] : []),
      ...(ctx.deckLine ? ['', ctx.deckLine] : []),
      '',
      `PD: para llegar a 100/100 solo les falta afinar un par de detalles (${ctx.gapClause}). Se los dejo listos sin costo, trabajemos juntos o no. ${pdEmoji}`,
      ...(ctx.tailLines ? ['', ...ctx.tailLines] : []),
      '',
      `¡Que tengan un excelente día!`,
      `Saludos,`,
      `Elena Revicheva`,
      `Fundadora | Ingeniera de IA y Automatización — AIdeazz AI Lab ✨`,
    ].join('\n');
  }

  // Only quote a category number when the live audit produced one. With --score the
  // overall figure is a human assertion and the per-category breakdown does not exist;
  // printing the old default ("AEO 60/100") would invent a measurement.
  const weakBit = weakScore != null && weakName ? ` (${weakName} ${weakScore}/100)` : '';

  return [
    `Hola, ¡un gusto saludarles! 👋 Soy Elena Revicheva, ingeniera de IA aquí en Panamá: https://aideazz.xyz/portfolio.`,
    '',
    `Primero, felicitaciones — ${compliment}. Les escribo porque analicé ${domain} con mi motor de visibilidad en IA y obtuvo ${score}/100: cuando un ${ctx.customer} le pregunta a ChatGPT o Perplexity "${moneyQuery}", los asistentes todavía no los pueden recomendar con claridad — ${ctx.gapClause}.`,
    '',
    `Son 3 arreglos concretos. Si les parece bien, con mucho gusto se los muestro en 15 minutos, sin ningún compromiso. La auditoría completa es gratuita aquí: https://aideazz.xyz/api ${pdEmoji}`,
    ...(ctx.openToRoles ? ['', OPEN_TO_ROLES_NOTE] : []),
    ...(ctx.deckLine ? ['', ctx.deckLine] : []),
    '',
    `PD: Además de visibilidad en IA, ${pdLine} Todo con demos en vivo en mi portafolio👆`,
    ...(ctx.tailLines ? ['', ...ctx.tailLines] : []),
    '',
    `¡Que tengan un excelente día!`,
    `Saludos,`,
    `Elena✨🌍💫`,
  ].join('\n');
}

/**
 * Close the cycle on a deal: FU WhatsApp + FU email drafts, the `{slug}-fu` registry row
 * and both FU buttons at the top of its note.
 *
 * Reports what the installer actually did, not merely that it exited 0. On Abolu's first
 * staging the installer found the deal missing from HubSpot's search index — it is
 * eventually consistent and the deal was seconds old — so it patched nothing, exited 0,
 * and the run announced a follow-up that did not exist.
 */
function installFollowUp(dealId) {
  const fu = spawnSync(process.execPath, [path.join(__dirname, '_install-wa-fu-notes.cjs'), `--only=${dealId}`], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  });
  if (fu.stderr) process.stderr.write(fu.stderr);
  if (fu.stdout) console.log(fu.stdout.trim());
  const retry = `run: node scripts/_install-wa-fu-notes.cjs --only=${dealId}`;
  if (fu.status !== 0) return `FAILED (exit ${fu.status}) — ${retry}`;
  let summary = {};
  try {
    summary = JSON.parse(fu.stdout.slice(fu.stdout.indexOf('{')));
  } catch {
    return `UNKNOWN — installer printed no summary; ${retry}`;
  }
  if (summary.installed === 1) return 'installed';
  return `NOT installed (${JSON.stringify(summary.errorList || summary.skipNoPhoneList || [])}) — ${retry}`;
}

/**
 * The reviewable pack for a staged prospect. Written by both paths: with HubSpot ids
 * after a live stage, and with the note HTML alone under --prepare-only.
 */
function buildPack(o) {
  return [
    `# [CLIENT-MANUAL] ${o.company} — HubSpot note pack`,
    '',
    `> Staged ${new Date().toISOString().slice(0, 10)}. Deal: \`${o.dealName}\`${o.ids ? ` (ID ${o.ids.dealId})` : ' — NOT created yet (--prepare-only)'}.`,
    `> WhatsApp draft: \`${o.draftPath}\` · Email draft: \`${o.emailDraftPath}\``,
    `> Email one-click: \`https://webhook.aideazz.xyz/cto/go/outreach-email/${o.slug}\` (from aipa@aideazz.xyz)`,
    ...(o.emailUnverified ? [`> ⚠️ Email \`${o.email}\` is UNVERIFIED fallback — confirm before send.`] : []),
    ...(o.emailOnlyOk ? ['> ⚠️ EMAIL-PRIMARY — no public WhatsApp found; use email one-click.'] : []),
    ...(o.auditNote ? [`> ⚠️ ${o.auditNote}`] : []),
    '',
    o.ids
      ? `Deal **${o.ids.dealId}** | Company **${o.ids.companyId}** | Contact **${o.ids.contactId}** | Note **${o.ids.noteId}** | Send task **${o.ids.taskId}**`
      : `Create the deal with: \`node scripts/stage-manual-prospect.cjs ${domain} --with-fu\``,
    '',
    '## Deal note (HTML as posted to HubSpot)',
    '',
    '```html',
    o.noteHtml,
    '```',
    '',
  ].join('\n');
}

/**
 * The prospect address book (company, clauses, contacts per domain) lives in
 * docs/selling/prospect-meta.cjs — data, kept out of the code so the tool carries no
 * customer PII. Add new prospects THERE.
 */
const PROSPECT_META = require('../docs/selling/prospect-meta.cjs');

(async () => {
  console.log('DOMAIN', domain);

  // Audit. The score is not decoration: it names the deal, it is the email subject line,
  // and the prospect reads it in the first paragraph ("obtuvo N/100"). A placeholder that
  // reaches any of those is a claim about their business that nobody measured — so a
  // number is either measured here or asserted on the command line with --score, and
  // there is no third path (the old code silently shipped 75/B on a skip or a 429).
  let audit = {};
  let score = scoreOverride;
  let grade = 'B';
  let weak = { name: null, score: null, id: null };
  let catScores = {};
  let auditNote = '';

  if (scoreOverride != null) {
    if (!Number.isFinite(scoreOverride) || scoreOverride < 0 || scoreOverride > 100) {
      throw new Error(`--score must be 0-100, got "${scoreArg.split('=')[1]}"`);
    }
    console.warn('AUDIT_ASSERTED — using --score', score);
    auditNote = `Score ${score} asserted with --score (no live audit in this run) — re-audit before quoting category numbers.`;
  } else if (skipAudit) {
    throw new Error(
      '--skip-audit needs --score=<0-100>: the score goes into the deal name, the email ' +
        'subject and the prospect\'s first sentence, so it cannot default to a placeholder.',
    );
  } else {
    async function runVisibilityAudit(auditTarget) {
      const res = await fetch(VIS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': VIS_KEY },
        body: JSON.stringify({ url: auditTarget }),
      });
      const text = await res.text();
      return { res, text, auditTarget };
    }

    let { res: auditRes, text: auditText, auditTarget } = await runVisibilityAudit(url);
    const wwwUrl = `https://www.${domain}`;
    if (
      !auditRes.ok &&
      auditRes.status === 422 &&
      auditText.includes('unfetchable_url') &&
      !domain.startsWith('www.') &&
      auditTarget !== wwwUrl
    ) {
      console.warn(`AUDIT_RETRY — ${url} unfetchable, trying ${wwwUrl}`);
      ({ res: auditRes, text: auditText, auditTarget } = await runVisibilityAudit(wwwUrl));
    }

    if (auditRes.ok) {
      audit = JSON.parse(auditText);
      score = Math.round(audit.score ?? audit.overall ?? audit.total ?? 0);
      grade = audit.grade || audit.letterGrade || 'B';
      weak = weakestCategory(audit);
      catScores = Object.fromEntries((audit.categories || []).map((c) => [c.id, c.score]));
      if (auditTarget !== url) {
        auditNote = `Audit ran against ${auditTarget} (${url} was unfetchable from the engine).`;
      }
    } else if (auditRes.status === 429) {
      throw new Error(
        'visibility audit → 429 rate limited. Use VISIBILITY_API_KEY (owner key, not the ' +
          '20/hour demo key) and retry, or pass --score=<measured value>. Staging with a ' +
          'placeholder would put an invented score in front of the prospect.',
      );
    } else {
      throw new Error(`visibility audit → ${auditRes.status}: ${auditText.slice(0, 300)}`);
    }
  }
  console.log('AUDIT', score, grade, weak.name, weak.score);

  // Contacts
  let html = '';
  if (!noScrape) {
    for (const page of [url, `${url}/contact`, `${url}/contact-us`, `${url}/contacto`]) {
      try {
        const r = await fetch(page, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIPA/1.0)' } });
        if (r.ok) html += '\n' + await r.text();
      } catch { /* skip */ }
    }
  }
  const contacts = parseContacts(html);
  console.log('CONTACTS', JSON.stringify(contacts));

  const meta = PROSPECT_META[domain];
  if (!meta) throw new Error(`No PROSPECT_META for ${domain} — add to docs/selling/prospect-meta.cjs`);

  // `PENDING_AUDIT` marks copy that must be written from the audit rather than guessed:
  // the gap clause is what the letter offers to fix for free, and the note's fix list is
  // what Elena walks the prospect through. A --dry-run prints the audit's own findings,
  // and the sentinel keeps that from being skipped — the string itself must never reach
  // a prospect. The dry run is exempt: printing the audit is how the copy gets written.
  if (!dryRun) {
    const pending = Object.entries(meta).filter(([, v]) => v === 'PENDING_AUDIT');
    if (pending.length) {
      throw new Error(
        `PROSPECT_META.${domain} still has placeholder copy (${pending.map(([k]) => k).join(', ')}). ` +
          `Run with --dry-run, then write it from what the audit actually found.`,
      );
    }
  }

  if (meta.preferredPhone) {
    contacts.whatsapp = String(meta.preferredPhone).replace(/\D/g, '');
  }
  // Iron rule (MANUAL_PROSPECT_PLAY.md): BOTH WhatsApp + email on every deal.
  // Prefer scraped → preferredEmail → info@{domain} flagged UNVERIFIED (Elena confirms).
  let emailUnverified = false;
  if (meta.preferredEmail && !contacts.email) {
    contacts.email = meta.preferredEmail;
    // A preferredEmail is normally a human-verified address lifted off the prospect's own
    // site. When the site publishes no address at all and the entry carries a pattern
    // guess instead, it has to travel with the same UNVERIFIED warning as the info@
    // fallback — otherwise the one-click button looks as trustworthy as a scraped one.
    emailUnverified = !!meta.preferredEmailUnverified;
  }
  if (!contacts.email) {
    contacts.email = `info@${domain}`;
    emailUnverified = true;
  }
  // Two different questions, previously answered by one variable: which number goes on
  // the CRM record (any published line is useful — Elena can call it), and which number
  // can receive a WhatsApp message (only a declared WA link, a Panama mobile, or a
  // human-asserted preferredPhone). A landline answering the first must not answer the
  // second, or the deal ships a WhatsApp button that opens a chat with nobody.
  const preferred = meta.preferredPhone ? String(meta.preferredPhone).replace(/\D/g, '') : '';
  const crmPhone = contacts.whatsapp || contacts.phones[0] || preferred || '';
  const waPhone = contacts.whatsapp || preferred || '';
  if (!waPhone) {
    if (meta.emailOnlyOk && contacts.email) {
      console.warn(
        `EMAIL_ONLY — no WhatsApp-capable number${crmPhone ? ` (published line ${formatPhone507(crmPhone)} is not a mobile)` : ''}; note will be email-primary`,
      );
    } else {
      throw new Error(`No WhatsApp/phone found on ${domain} — add preferredPhone to PROSPECT_META`);
    }
  }
  const phoneDigits = crmPhone;
  const phoneForLinks = waPhone || '00000000000';
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
    pivot: meta.pivot,
    ask: meta.ask,
    openToRoles: !!meta.openToRoles,
    lang: meta.lang,
    greetName: meta.greetName,
    finding: meta.finding,
    nuance: meta.nuance,
    deckLine: meta.deckLine,
    tailLines: meta.tailLines,
    greeting: meta.greeting,
    opener: meta.opener,
  });

  const slug = slugify(meta.company);
  // The letter buildDraft() produced: above CREDENTIAL_SCORE with a pivot it leads with
  // the score as a credential instead of a gap, and the deal name and subject line have
  // to say the same thing the prospect is reading.
  const credentialLetter = score >= CREDENTIAL_SCORE && !!meta.pivot;
  // A site above CREDENTIAL_SCORE has no GEO/AEO deficit to fix — naming the deal
  // "GEO/AEO fix" would misdescribe the offer (and mis-route hs-outcomes-to-atlas).
  const offerLabel = credentialLetter ? meta.dealOffer || 'AI Growth Operator' : 'GEO/AEO fix';
  const dealName = `[CLIENT-MANUAL] ${meta.company} — ${offerLabel} (audit: ${score}/${grade})`;

  const draftPath = `docs/selling/drafts/${slug}.txt`;
  const emailDraftPath = `docs/selling/drafts/${slug}-email.txt`;
  const prospectPath = `docs/selling/prospects/${meta.company.toUpperCase().replace(/\s+/g, '_')}.md`;

  // Optional personal subject (6 Oct 2026, Ford Realty) — absent → the template subject, unchanged.
  const emailSubject = meta.subject || buildManualEmailSubject(meta.company, score, {
    credential: credentialLetter,
    lang: meta.lang,
  });
  const emailBody = buildManualEmailBody(draft, {
    botFallback: false,
    lang: meta.lang,
    greetName: meta.greetName,
  });

  if (!dryRun) {
    fs.mkdirSync(path.join(root, 'docs/selling/drafts'), { recursive: true });
    fs.mkdirSync(path.join(root, 'docs/selling/prospects'), { recursive: true });
    fs.writeFileSync(path.join(root, draftPath), draft + '\n', { encoding: 'utf8' });
    registerOutreachSlug(slug, phoneForLinks, draftPath, meta.company, {
      email: contacts.email,
      emailDraft: emailDraftPath,
      score,
      cc: meta.cc,
      attachments: meta.attachments,
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
  const phoneDisplay = waPhone
    ? phoneFmt
    : crmPhone
      ? `${phoneFmt} (fijo — sin WhatsApp; EMAIL PRIMARY)`
      : '(no public WhatsApp — EMAIL PRIMARY)';

  // Dedupe (skipped in --update mode, where hitting the existing deal is the point)
  if (KEY && !updateDealId && !offline) {
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

  const auditLine =
    `${score}/100 Grade ${grade} | Tech ${catScores.techSeo ?? '?'} | AI Access ${catScores.aiAccess ?? '?'} | GEO ${catScores.geo ?? '?'} | AEO ${catScores.aeo ?? '?'}` +
    (weak.score != null ? ` (${weak.name} ${weak.score} weakest)` : ' (no live category breakdown)');
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
    // Surfaced at the TOP: Elena must see a prior relationship before sending what would
    // otherwise read as a cold first-touch to someone who already knows her.
    ...(meta.noteFlag ? [`<b>⚠️ ${escHtml(meta.noteFlag)}</b>`, ''] : []),
    dualLinks,
    '',
    '--- MENSAJE WhatsApp (plain text) ---',
    '',
    escHtml(draft),
    ...emailBlock,
    '',
    auditNote ? '--- Audit (ASSERTED, not measured in this run) ---' : '--- Audit (verified live) ---',
    escHtml(auditLine),
    ...(auditNote ? [`<b>⚠️ ${escHtml(auditNote)}</b>`] : []),
    '',
    `Angle: "${credentialLetter ? 'audit is the CREDENTIAL — pivot to AI Growth Operator' : score >= CREDENTIAL_SCORE ? 'muy cerca — 3 arreglos' : 'invisible as citable answer'}". Money query: ${meta.moneyQuery}`,
    ...(meta.openToRoles
      ? [
          '',
          '<b>DUAL TRACK</b> — this letter also states Elena is open to roles (senior AI/automation, Panama or remote), once, after the paid ask. If they reply about a role, that is still a 💬 They replied. The follow-up does not repeat it.',
        ]
      : []),
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
    console.log('WA', phoneDisplay, '| EMAIL', contacts.email, emailUnverified ? '(UNVERIFIED)' : '');
    return;
  }

  // --prepare-only: every artifact on disk, nothing in HubSpot. The pack carries the
  // note HTML verbatim, so the two send buttons can be reviewed (or pasted into a deal
  // by hand) exactly as the live path would post them.
  if (prepareOnly) {
    fs.writeFileSync(
      path.join(root, prospectPath),
      buildPack({
        company: meta.company,
        dealName,
        draftPath,
        emailDraftPath,
        slug,
        email: contacts.email,
        emailUnverified,
        emailOnlyOk: !!meta.emailOnlyOk,
        auditNote,
        ids: null,
        noteHtml,
      }),
      'utf8',
    );
    console.log(JSON.stringify({
      ok: true,
      mode: 'prepare-only',
      domain,
      dealName,
      email: contacts.email,
      emailUnverified,
      phone: phoneDisplay,
      draftPath,
      emailDraftPath,
      prospectPath,
      emailOneClick: `https://webhook.aideazz.xyz/cto/go/outreach-email/${slug}`,
      hubspot: 'not touched (--prepare-only)',
    }, null, 2));
    return;
  }

  // --update: refresh an already-staged prospect. Rewrites drafts + registry (done
  // above) and posts a corrected note; renames the deal if the offer label changed.
  // Never deletes the previous note — it stays in the deal history.
  if (updateDealId) {
    await hs('PATCH', `/crm/v3/objects/deals/${updateDealId}`, {
      properties: { dealname: dealName },
    });
    const upNote = await hs('POST', '/crm/v3/objects/notes', {
      properties: { hs_note_body: noteHtml, hs_timestamp: new Date().toISOString(), ...(await noteAttachmentProps(meta)) },
    });
    await hs('PUT', `/crm/v4/objects/notes/${upNote.id}/associations/deals/${updateDealId}`, [
      { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 },
    ]);
    registerOutreachSlug(slug, phoneForLinks, draftPath, meta.company, {
      email: contacts.email,
      emailDraft: emailDraftPath,
      score,
      cc: meta.cc,
      attachments: meta.attachments,
      dealId: updateDealId,
    });
    fs.writeFileSync(
      path.join(root, prospectPath),
      buildPack({
        company: meta.company,
        dealName,
        draftPath,
        emailDraftPath,
        slug,
        email: contacts.email,
        emailUnverified,
        emailOnlyOk: !!meta.emailOnlyOk,
        auditNote,
        ids: { dealId: updateDealId, companyId: '—', contactId: '—', noteId: upNote.id, taskId: '—' },
        noteHtml,
      }),
      'utf8',
    );
    // The FU block lives at the top of the newest note, so it has to be reinstalled after
    // one is posted — otherwise --update silently buries the follow-up buttons.
    const upFu = withFu ? installFollowUp(updateDealId) : null;
    console.log(JSON.stringify({
      ok: true, mode: 'update', dealId: updateDealId, dealName, noteId: upNote.id,
      email: contacts.email, emailUnverified, audit: { score, grade },
      followUp: upFu || 'not installed (pass --with-fu)',
    }, null, 2));
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
    properties: { hs_note_body: noteHtml, hs_timestamp: new Date().toISOString(), ...(await noteAttachmentProps(meta)) },
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
    cc: meta.cc,
    attachments: meta.attachments,
    dealId,
  });
  fs.writeFileSync(
    path.join(root, prospectPath),
    buildPack({
      company: meta.company,
      dealName,
      draftPath,
      emailDraftPath,
      slug,
      email: contacts.email,
      emailUnverified,
      emailOnlyOk: !!meta.emailOnlyOk,
      auditNote,
      ids: { dealId, companyId, contactId, noteId: note.id, taskId: task.id },
      noteHtml,
    }),
    'utf8',
  );

  // --with-fu closes the cycle in the same command: the follow-up installer writes the
  // FU WhatsApp + FU email drafts, registers the `{slug}-fu` row and puts both FU
  // buttons at the top of the note. Without it the deal ships with first-contact
  // buttons only and someone has to remember a second command.
  const fuResult = withFu ? installFollowUp(dealId) : null;

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
    audit: { score, grade, weak, ...(auditNote ? { warning: auditNote } : {}) },
    phone: phoneDisplay,
    draftPath,
    emailDraftPath,
    prospectPath,
    followUp: fuResult || 'not installed (pass --with-fu)',
    emailOneClick: `https://webhook.aideazz.xyz/cto/go/outreach-email/${slug}`,
  }, null, 2));
  console.warn('');
  console.warn('⚠️  EMAIL ONE-CLICK requires GitHub push (else UI: Unknown outreach email slug):');
  console.warn(`    git add docs/selling/outreach-registry.json docs/selling/drafts/${slug}*.txt ${prospectPath}`);
  console.warn('    git commit && git push origin main');
  console.warn('    Oracle: cd ~/cto-aipa && git pull && npm run build && pm2 restart cto-aipa');
  console.warn('    (After go-wa GitHub fallback is deployed: push alone is enough for confirm page.)');
  console.warn('');
})().catch(e => {
  console.error(String(e.message || e));
  process.exit(1);
});
