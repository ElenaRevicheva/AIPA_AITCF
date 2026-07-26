#!/usr/bin/env node
/**
 * Ops: put one-click WhatsApp FU (audit already in note + AI Growth Operator)
 * at the top of every CLIENT-MANUAL deal note. No re-audit API.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {
  buildHubSpotWaAnchor,
  buildHubSpotEmailAnchor,
  loadRegistry,
  saveRegistry,
  slugify,
  digitsOnly,
  formatPhone507,
} = require('./wa-link-lib.cjs');

const root = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(root, '.env'), 'utf8');
const KEY = env.match(/^HUBSPOT_API_KEY=(.+)$/m)?.[1]?.trim();
const OWNER = env.match(/^HUBSPOT_OWNER_ID=(.+)$/m)?.[1]?.trim() || '91612860';
if (!KEY) throw new Error('HUBSPOT_API_KEY missing');
const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SINCE = new Date('2026-07-18T00:00:00Z').getTime();
const FU_MARKER = '<!-- WA-FU-GROWTH-OPERATOR -->';

async function hs(method, p, body, attempt = 0) {
  const r = await fetch(`https://api.hubapi.com${p}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (r.status === 429 && attempt < 10) {
    await sleep(1400 * (attempt + 1));
    return hs(method, p, body, attempt + 1);
  }
  if (!r.ok) throw new Error(`${r.status} ${p} ${t.slice(0, 220)}`);
  return t ? JSON.parse(t) : null;
}

/**
 * Remove previously installed FU blocks.
 *
 * Used for BOTH rewriting the note and — critically — before parsing the audit:
 * the FU text we write contains `pregunta a ChatGPT … "…"`, so on the next run the
 * parser matched OUR OWN sentence and locked the generic fallback in as if it were
 * the prospect's real money query (caught on Hospital CIMA, July 26 2026).
 * HubSpot also strips the HTML comment marker, hence the visible-heading patterns.
 */
function stripFu(html) {
  return String(html)
    .replace(new RegExp(`${FU_MARKER}[\\s\\S]*?<hr>(?:<br>)?`, 'gi'), '')
    .replace(/(?:<b>)?FOLLOW-UP WhatsApp \(click[\s\S]*?<hr>(?:<br>)?/gi, '')
    .replace(/(?:<b>)?FOLLOW-UP — click y enviar[\s\S]*?<hr>(?:<br>)?/gi, '');
}

function plain(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAudit(dealName, notePlain) {
  const blob = `${dealName}\n${notePlain}`;
  const scoreM =
    blob.match(/audit:\s*(\d+)\s*\/\s*([A-F][+-]?)/i) ||
    blob.match(/(\d+)\s*\/\s*100[^\n]{0,40}?Grade\s*([A-F][+-]?)/i) ||
    blob.match(/obtuvo\s+(\d+)\s*\/\s*100/i) ||
    blob.match(/(\d+)\s*\/\s*100\s*\(([A-F][+-]?)\)/i);
  let score = scoreM ? Number(scoreM[1]) : null;
  let grade = scoreM && scoreM[2] && /[A-F]/i.test(scoreM[2]) ? scoreM[2].toUpperCase() : null;
  if (score != null && !grade) {
    const g2 = blob.match(/Grade\s*([A-F][+-]?)/i);
    grade = g2 ? g2[1].toUpperCase() : 'B';
  }
  const weakM =
    blob.match(/\(([A-Za-z][A-Za-z /]+?)\s+(\d+)\s+weakest\)/i) ||
    blob.match(/(GEO|AEO|Tech|AI Access|Structured Data)[^\d]{0,20}(\d+)\s*\/\s*100/i) ||
    blob.match(/(GEO|AEO)\s+(\d+)\s*\/\s*100/i) ||
    // Early notes wrote it bare: "AEO 69 (missing FAQ/answer-content)". Still her
    // own audit number — the verifier re-checks it against the note either way.
    blob.match(/\b(GEO|AEO|Tech|AI Access)\s+(\d{1,3})\b(?!\s*\/\s*\d)/i);
  const weakName = weakM ? weakM[1].trim() : 'visibilidad en IA';
  const weakScore = weakM ? weakM[2] : null;
  const mq =
    blob.match(/Money query:\s*([^|<\n]+)/i) ||
    blob.match(/pregunta a ChatGPT[^\"]*\"([^\"]+)\"/i) ||
    blob.match(/Perplexity\s+\"([^\"]+)\"/i);
  const moneyQuery = cleanMoneyQuery(mq ? mq[1] : null);
  return { score: score || 75, grade: grade || 'B', weakName, weakScore, moneyQuery };
}

/**
 * The prospect sees this string inside quotes, so it must be ONLY their question.
 *
 * Bug it fixes (July 25 2026, caught by Elena on Red Frog Beach): HubSpot flattens
 * the note HTML, so `Money query: …` and the next line `Top fixes: (1) FAQ …,
 * (2) LodgingBusiness/FAQPage JSON-LD …` end up on ONE line. The old regex stopped
 * only at a newline, swallowed the engineering to-do list, and `.slice(0,120)` then
 * cut it mid-word — the prospect got an unclosed quote full of JSON-LD jargon.
 * Anything that still smells like engineering notes → null (generic phrase instead).
 */
function cleanMoneyQuery(raw) {
  if (!raw) return null;
  let q = String(raw).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  // Drop any following note field that got flattened onto the same line
  q = q.split(/\s*(?:Top fixes|Fixes|Angle|Next|Contactos?|Contacts?|Audit|Auditor[ií]a|Score|Notas?)\s*:/i)[0];
  // Drop English analyst tails ("— not yet a citable answer", "- missing schema")
  q = q.split(/\s+[—–-]\s+(?:not\b|no\s|missing\b|todav[ií]a\b)/i)[0];
  // A money query is a question — end it at the question mark
  const qm = q.indexOf('?');
  if (qm > 0) q = q.slice(0, qm + 1);
  q = q.replace(/^[\s"'«»*]+|[\s"'«»*,;.]+$/g, '').trim();
  if (!q) return null;
  // Any surviving engineering token means the parse leaked — use the generic phrase
  if (/JSON-?LD|FAQPage|LodgingBusiness|schema|robots\.txt|llms\.txt|sitemap|\bH1\b|noindex|crawler/i.test(q)) {
    return null;
  }
  if (q.length < 8 || q.length > 120) return null; // truncated or runaway → generic
  // Belt and braces against the self-feeding loop: never accept our own fallbacks
  if (/^¿cuál es la mejor opción( en .+)?\?$/i.test(q)) return null;
  return q;
}

function buildFuText({ company, domain, score, grade, weakName, weakScore, moneyQuery, city, firstTouch }) {
  // Only claim the channel we can prove from the note stamps — some prospects were
  // emailed (📧 EMAILED), some WhatsApp-first (✅ SENT); saying "por correo" to a
  // WhatsApp-first prospect is a lie they will notice.
  const channel =
    firstTouch === 'email' ? ' por correo' : firstTouch === 'whatsapp' ? ' por WhatsApp' : '';
  // No invented query: when the note has no parsable money query we describe the
  // search instead of quoting a fake one — and NEVER hardcode "Panamá", half the
  // list is Costa Rica / Mexico / Colombia (Hospital CIMA is in San José).
  const place = city ? ` en ${city}` : '';
  const gapSentence = moneyQuery
    ? `Cuando un cliente pregunta a ChatGPT o Perplexity "${moneyQuery}", su empresa todavía no aparece como una respuesta citable`
    : `Cuando un cliente busca en ChatGPT o Perplexity opciones como la suya${place}, su empresa todavía no aparece como una respuesta citable`;
  // Only claim a category score when we actually parsed one.
  const weakBit = weakScore != null ? ` (${weakName} ${weakScore}/100)` : '';
  // Copy approved by Elena July 26 2026 — keep this wording verbatim.
  return [
    `Hola, ¡un gusto saludarles de nuevo! 👋 Soy Elena Revicheva, Ingeniera de IA y Automatización: https://aideazz.xyz/portfolio`,
    '',
    `Les escribí hace unos días${channel} sobre ${company}. Analicé ${domain || 'su sitio web'} con mi motor de visibilidad en IA: ${score}/100 (${grade}). ${gapSentence}${weakBit}.`,
    '',
    `No vendo otro CRM ni otro chatbot. Instalo un AI Growth Operator que trabaja 24/7 dentro de las herramientas que ya usan: que ChatGPT los recomiende, investigue prospectos, haga outreach y seguimiento, califique leads por WhatsApp, mantenga el CRM al día y les entregue un briefing diario con las mejores oportunidades.`,
    '',
    `Si les sirve, en 15 minutos les muestro los 3 principales arreglos de esa auditoría y cómo quedaría el Operator en su negocio — sin compromiso. Auditoría gratuita: https://aideazz.xyz/api`,
    '',
    `Saludos,`,
    `Elena Revicheva`,
    `Fundadora | Ingeniera de IA y Automatización`,
    `AIdeazz AI Lab✨`,
  ].join('\n');
}

/** Same FU, as an email: SUBJECT/TO header block + body (format read by /go/outreach-email). */
function buildFuEmailDraft({ company, to, score, fuText }) {
  const subject = `Seguimiento — auditoría de visibilidad en IA: ${company} (${score}/100)`;
  const body = fuText.replace(
    /^Hola, ¡un gusto saludarles de nuevo! 👋 /,
    `Estimado equipo de ${company}:\n\n¡Un gusto saludarles de nuevo! 👋 `,
  );
  return `SUBJECT: ${subject}\n\nTO: ${to}\n\n${body}\n`;
}

(async () => {
  const reg = loadRegistry();
  let registryDirty = false;
  const byDeal = new Map();
  for (const [slug, cfg] of Object.entries(reg)) {
    // Skip our own FU rows — they carry the SAME dealId as the base row, so they
    // used to win the map and the slug grew a `-fu` every run
    // (hospital-cima-fu-fu-fu-email.txt). The base slug is the only source here.
    if (/-fu$/.test(slug)) continue;
    if (cfg.dealId) byDeal.set(String(cfg.dealId), { slug, ...cfg });
  }

  const deals = [];
  let after;
  do {
    const body = {
      filterGroups: [
        {
          filters: [
            { propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: 'CLIENT-MANUAL' },
            { propertyName: 'createdate', operator: 'GTE', value: String(SINCE) },
          ],
        },
      ],
      properties: ['dealname', 'dealstage'],
      limit: 100,
    };
    if (after) body.after = after;
    const page = await hs('POST', '/crm/v3/objects/deals/search', body);
    deals.push(...(page.results || []));
    after = page.paging?.next?.after;
    await sleep(200);
  } while (after);

  // --only=<substring|dealId> → single-deal test run before touching the batch
  const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1];
  const real = deals
    .filter((d) => !/HIT-LIST|remaining|queue/i.test(d.properties.dealname || ''))
    .filter((d) => !ONLY || d.id === ONLY || (d.properties.dealname || '').toLowerCase().includes(ONLY.toLowerCase()));
  const results = { ok: [], skipNoPhone: [], errors: [] };

  for (let i = 0; i < real.length; i++) {
    const d = real[i];
    const company = (d.properties.dealname || '')
      .replace(/^\[CLIENT-MANUAL\]\s*/i, '')
      .replace(/\s+[—–-].*$/, '')
      .trim();
    process.stderr.write(`\r ${i + 1}/${real.length} ${company.slice(0, 30).padEnd(30)}`);

    try {
      await sleep(120);
      const cAssoc = await hs('GET', `/crm/v4/objects/deals/${d.id}/associations/companies`);
      const cIds = (cAssoc.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
      let domain = null;
      let phone = null;
      let city = null;
      if (cIds[0]) {
        await sleep(80);
        const co = await hs(
          'GET',
          `/crm/v3/objects/companies/${cIds[0]}?properties=domain,website,phone,name,city`,
        );
        city = (co.properties?.city || '').trim() || null;
        domain = (co.properties?.domain || co.properties?.website || '')
          .replace(/^https?:\/\//, '')
          .replace(/\/.*$/, '')
          .toLowerCase();
        phone = digitsOnly(co.properties?.phone);
      }
      const regHit = byDeal.get(String(d.id));
      if (regHit?.phone && regHit.phone !== '00000000000') phone = digitsOnly(regHit.phone);
      // Email drives the second FU button — registry first, live HubSpot contact as
      // fallback so an address Elena just typed into the contact record is picked up.
      let email = String(regHit?.email || '').trim().toLowerCase();
      {
        const ctAssoc = await hs('GET', `/crm/v4/objects/deals/${d.id}/associations/contacts`);
        const ctIds = (ctAssoc.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
        if (ctIds[0]) {
          await sleep(80);
          const ct = await hs('GET', `/crm/v3/objects/contacts/${ctIds[0]}?properties=email,phone,mobilephone`);
          const live = String(ct.properties?.email || '').trim().toLowerCase();
          if (live && /.+@.+\..+/.test(live)) email = live;
        }
      }
      if (regHit && !domain) {
        /* keep company domain from HS */
      }
      if (!phone || phone.length < 8) {
        const tAssoc = await hs('GET', `/crm/v4/objects/deals/${d.id}/associations/contacts`);
        const tIds = (tAssoc.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
        if (tIds[0]) {
          await sleep(80);
          const ct = await hs('GET', `/crm/v3/objects/contacts/${tIds[0]}?properties=phone,mobilephone`);
          phone = digitsOnly(ct.properties?.phone || ct.properties?.mobilephone);
        }
      }
      const hasPhone = !!phone && phone.length >= 8 && phone !== '00000000000';
      // Email-only prospects still get their FU button — skip only when we have
      // neither channel (was: skipped on missing phone, losing the email FU too).
      if (!hasPhone && !(email && /.+@.+\..+/.test(email))) {
        results.skipNoPhone.push({ dealId: d.id, company, reason: 'no phone and no email' });
        continue;
      }

      await sleep(100);
      const nAssoc = await hs('GET', `/crm/v4/objects/deals/${d.id}/associations/notes`);
      const nIds = (nAssoc.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
      if (!nIds.length) {
        results.errors.push({ dealId: d.id, company, err: 'no note' });
        continue;
      }
      let note = null;
      for (const nid of nIds.slice(0, 5)) {
        await sleep(80);
        const n = await hs('GET', `/crm/v3/objects/notes/${nid}?properties=hs_note_body,hs_timestamp`);
        if (!note || (n.properties?.hs_timestamp || '') > (note.properties?.hs_timestamp || '')) note = n;
      }
      const oldBody = note.properties?.hs_note_body || '';
      // Parse the ORIGINAL note only — never our own previously installed FU text.
      const originalPlain = plain(stripFu(oldBody));
      const audit = parseAudit(d.properties.dealname || '', originalPlain);
      const firstTouch = /📧\s*EMAILED|Resend:/i.test(originalPlain)
        ? 'email'
        : /✅\s*SENT/i.test(originalPlain)
          ? 'whatsapp'
          : null;
      // Name the domain ONLY if her own audit material names it. Two early deals
      // (Panama Yacht Group, Eurostone) had a domain in the HubSpot company field
      // that the audit note never mentions — Eurostone's contact is even
      // @eurostone-atelier.com while the field said eurostonepanama.com. Saying
      // "analicé X.com" when the audit may have run on another URL is exactly the
      // fabrication Elena rejected, so those fall back to "su sitio web".
      let firstDraftText = '';
      try {
        if (regHit?.draft && fs.existsSync(path.join(root, regHit.draft))) {
          firstDraftText = fs.readFileSync(path.join(root, regHit.draft), 'utf8');
        }
      } catch {
        /* no first-contact draft on disk */
      }
      const domainCorroborated =
        !!domain &&
        (originalPlain.toLowerCase().includes(domain.toLowerCase()) ||
          firstDraftText.toLowerCase().includes(domain.toLowerCase()));

      const fuText = buildFuText({
        company,
        domain: domainCorroborated ? domain : null,
        city,
        firstTouch,
        ...audit,
      });
      // Direct web.whatsapp.com prefill — LAPTOP ONLY, by Elena's decision
      // (July 25 2026, after WhatsApp restricted her linked devices). Do NOT
      // reintroduce a mobile bridge here without her explicit go-ahead.
      const waAnchor = hasPhone
        ? buildHubSpotWaAnchor(
            phone,
            fuText,
            `➡️ WHATSAPP FU (laptop) — AI Growth Operator + auditoría (${formatPhone507(phone)})`,
          )
        : null;

      // Second channel: one-click FU EMAIL. Its own registry slug `{slug}-fu` so the
      // existing /go/outreach-email route serves it without any server change — the
      // first-contact `emailDraft` on the base slug stays untouched.
      let emailAnchor = null;
      const slug = (regHit?.slug || slugify(company)).replace(/(-fu)+$/, '');
      if (email && /.+@.+\..+/.test(email)) {
        const fuEmailRel = `docs/selling/drafts/${slug}-fu-email.txt`;
        fs.writeFileSync(
          path.join(root, fuEmailRel),
          buildFuEmailDraft({ company, to: email, score: audit.score, fuText }),
          { encoding: 'utf8' },
        );
        reg[`${slug}-fu`] = {
          ...(reg[`${slug}-fu`] || {}),
          phone,
          company,
          email,
          emailDraft: fuEmailRel,
          dealId: String(d.id),
          score: audit.score,
        };
        registryDirty = true;
        emailAnchor = buildHubSpotEmailAnchor(
          `${slug}-fu`,
          email,
          `✉️ EMAIL FU — aipa@aideazz.xyz (${email})`,
        );
      }

      const block = [
        FU_MARKER,
        `<b>FOLLOW-UP — click y enviar (texto listo, sin editar)</b>`,
        ...(emailAnchor ? [emailAnchor] : []),
        ...(waAnchor ? [waAnchor] : []),
        `<br><i>Audit used from this deal (no re-crawl): ${audit.score}/100 ${audit.grade}` +
          (audit.weakScore != null ? ` · ${audit.weakName} ${audit.weakScore}` : '') +
          (emailAnchor ? '' : ' · sin email en el contacto → solo WhatsApp') +
          (waAnchor ? '' : ' · sin teléfono → solo email') +
          `</i>`,
        `<hr>`,
      ].join('<br>');

      // HubSpot strips the HTML comment marker from stored bodies, so matching on
      // FU_MARKER alone missed and every run prepended ANOTHER copy (Elena's phone
      // screenshot showed the block twice). Strip by the visible heading instead,
      // globally, then prepend one fresh block.
      const newBody = block + '<br>' + stripFu(oldBody);

      await sleep(100);
      await hs('PATCH', `/crm/v3/objects/notes/${note.id}`, {
        properties: { hs_note_body: newBody },
      });

      // Point open follow-up tasks at the note button
      await sleep(80);
      const taskAssoc = await hs('GET', `/crm/v4/objects/deals/${d.id}/associations/tasks`);
      const taskIds = (taskAssoc.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
      for (const tid of taskIds) {
        await sleep(70);
        const t = await hs(
          'GET',
          `/crm/v3/objects/tasks/${tid}?properties=hs_task_subject,hs_task_status,hs_task_body`,
        );
        if (t?.properties?.hs_task_status === 'COMPLETED') continue;
        const subj = t?.properties?.hs_task_subject || '';
        if (!/follow-up|Send outreach|Send WhatsApp/i.test(subj)) continue;
        await hs('PATCH', `/crm/v3/objects/tasks/${tid}`, {
          properties: {
            hubspot_owner_id: OWNER,
            hs_task_subject: `FU → ${company} (click link in deal note: email or WhatsApp)`,
            hs_task_body:
              `Open this deal → note → two buttons, same text: ` +
              `"✉️ EMAIL FU" (one click → preview → Send, moves the deal itself) or ` +
              `"➡️ WHATSAPP FU (laptop)" (opens WhatsApp Web prefilled — laptop only). ` +
              `Then mark this task done. If they reply → stage 💬 They replied.`,
          },
        });
      }

      results.ok.push({
        dealId: d.id,
        company,
        phone,
        score: audit.score,
        noteId: note.id,
      });
    } catch (e) {
      results.errors.push({ dealId: d.id, company, err: e.message });
    }
  }
  process.stderr.write('\n');

  // Registry rows feed the one-click FU email — commit + push after every run, or
  // the EMAIL FU button 404s (Oracle reads disk, then GitHub raw main).
  if (registryDirty) saveRegistry(reg);

  const summary = {
    deals: real.length,
    installed: results.ok.length,
    skipNoPhone: results.skipNoPhone.length,
    errors: results.errors.length,
    skipNoPhoneList: results.skipNoPhone,
    errorList: results.errors.slice(0, 20),
  };
  console.log(JSON.stringify(summary, null, 2));
  fs.writeFileSync(
    path.join(root, 'docs/selling/_install-wa-fu-notes.json'),
    JSON.stringify({ ...summary, ok: results.ok, at: new Date().toISOString() }, null, 2),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
