#!/usr/bin/env node
/**
 * hunter-owner-sweep.cjs — find the real decision-maker behind staged deals.
 *
 * The problem it solves: ~86% of staged prospects are reachable only at a role
 * inbox (info@, ventas@, recepcion@). Those never reach the person who would
 * care about the portfolio. Hunter's domain-search returns named people WITH
 * their job title and a confidence score, which is exactly the missing piece.
 *
 * Economics (measured live Aug 8 2026): a domain-search that finds NOTHING costs
 * nothing — only hits are billed. On this registry roughly half the domains come
 * back empty, so a full pass over 112 domains costs ~50-56 credits, not 112.
 * The free tier is 50/month. This never needs a paid plan.
 *
 * ADD, NEVER REPLACE. The existing info@ contact stays exactly as it is. A found
 * owner is created as an ADDITIONAL contact on the same deal, plus a note. Nothing
 * is overwritten or deleted, ever.
 *
 * Usage:
 *   node scripts/hunter-owner-sweep.cjs                  # report only (default)
 *   node scripts/hunter-owner-sweep.cjs --limit=19       # cap credits spent
 *   node scripts/hunter-owner-sweep.cjs --apply          # also write owners to HubSpot
 *   node scripts/hunter-owner-sweep.cjs --min-conf=90    # auto-add threshold
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const HUNTER_KEY = env.match(/^HUNTER_API_KEY=(.+)$/m)?.[1]?.trim();
const HS_KEY = env.match(/^HUBSPOT_API_KEY=(.+)$/m)?.[1]?.trim();
const HUBSPOT_OWNER_ID = env.match(/^HUBSPOT_OWNER_ID=(.+)$/m)?.[1]?.trim() || '91612860';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const LIMIT = Number(args.find(a => a.startsWith('--limit='))?.split('=')[1] || 0);
const MIN_CONF = Number(args.find(a => a.startsWith('--min-conf='))?.split('=')[1] || 90);

const REGISTRY = path.join(ROOT, 'docs/selling/outreach-registry.json');
const REPORT_JSON = path.join(ROOT, 'docs/selling/_hunter-owner-sweep.json');
const REPORT_MD = path.join(ROOT, 'docs/selling/_hunter-owner-sweep.md');

if (!HUNTER_KEY) { console.error('HUNTER_API_KEY missing in .env'); process.exit(1); }
if (APPLY && !HS_KEY) { console.error('HUBSPOT_API_KEY missing in .env (needed for --apply)'); process.exit(1); }

const HS = 'https://api.hubapi.com';
const hsHeaders = { Authorization: `Bearer ${HS_KEY}`, 'Content-Type': 'application/json' };

async function hs(method, urlPath, body) {
  const res = await fetch(`${HS}${urlPath}`, {
    method, headers: hsHeaders, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// --- who counts as worth contacting -----------------------------------------
// Owner-grade: the person whose money it is. Marketing-grade: the person whose
// problem Elena's offer actually solves. Both beat info@; everyone else does not.
const OWNER = /\b(founder|co-?founder|owner|propietari|due[nñ]|ceo|chief executive|president|presidenta?|managing director|managing partner|socio|gerente general|director general|general manager|partner|principal|chief operating|coo)\b/i;
const MARKETING = /\b(cmo|chief marketing|marketing director|director de marketing|head of marketing|marketing manager|gerente de marketing|growth|digital manager|e-?commerce manager)\b/i;

function grade(position) {
  const p = position || '';
  if (OWNER.test(p)) return 'owner';
  if (MARKETING.test(p)) return 'marketing';
  return 'other';
}

const GENERIC = /^(info|contact|contacto|contactus|hello|hola|admin|office|mail|correo|web|webmaster|general|reservas|reservaciones|reservations|booking|sales|ventas|recepcion|reception|atencion|servicio|servicios|serviciocliente|servicioalcliente|clientes|customer|marketing|rrhh|hr|admisiones|admissions|citas|soporte|support|team|inquiries)@/i;

async function hunterAccount() {
  const r = await fetch(`https://api.hunter.io/v2/account?api_key=${HUNTER_KEY}`);
  const d = await r.json();
  return d.data.requests.credits; // { used, available, remaining }
}

async function domainSearch(domain) {
  const r = await fetch(
    `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=10&api_key=${HUNTER_KEY}`
  );
  if (!r.ok) return { error: `HTTP ${r.status}`, emails: [] };
  const d = await r.json();
  const emails = (d.data?.emails || []).map(e => ({
    email: e.value,
    name: `${e.first_name || ''} ${e.last_name || ''}`.trim(),
    firstName: e.first_name || '',
    lastName: e.last_name || '',
    position: e.position || '',
    confidence: e.confidence || 0,
    type: e.type,
  }));
  return { organization: d.data?.organization || null, emails };
}

/** Best contact for Elena's offer: owner first, then marketing, then confidence. */
function pickBest(emails) {
  const ranked = emails
    .map(e => ({ ...e, grade: grade(e.position) }))
    .filter(e => e.type === 'personal' && e.name)
    .sort((a, b) => {
      const rank = g => (g === 'owner' ? 0 : g === 'marketing' ? 1 : 2);
      const d = rank(a.grade) - rank(b.grade);
      return d !== 0 ? d : b.confidence - a.confidence;
    });
  return ranked[0] || null;
}

async function findExistingContact(email) {
  const r = await hs('POST', '/crm/v3/objects/contacts/search', {
    filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
    properties: ['email'], limit: 1,
  });
  return r.results?.[0]?.id || null;
}

/** ADD the owner as an extra contact on the deal. Never touches what is there. */
async function addOwnerToDeal(entry, best) {
  let contactId = await findExistingContact(best.email);
  if (!contactId) {
    contactId = await hs('POST', '/crm/v3/objects/contacts', {
      properties: {
        firstname: best.firstName || best.name.split(' ')[0] || 'Decision',
        lastname: best.lastName || best.name.split(' ').slice(1).join(' ') || 'Maker',
        email: best.email,
        company: entry.company,
        jobtitle: best.position || '',
        lifecyclestage: 'opportunity',
        hs_lead_status: 'OPEN',
      },
    }).then(r => r.id);
  }
  await hs('PUT', `/crm/v4/objects/deals/${entry.dealId}/associations/contacts/${contactId}`, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 },
  ]);
  const noteHtml =
    `<b>Decision-maker found (Hunter.io)</b><br>` +
    `${best.name} — ${best.position || 'sin cargo publicado'}<br>` +
    `<b>${best.email}</b> · confianza ${best.confidence}%<br><br>` +
    `Contacto anterior <b>${entry.email}</b> sigue activo en este deal — esto se AGREGA, no reemplaza.<br>` +
    `Si escribes al owner, personaliza con su nombre; el info@ queda como respaldo.`;
  const note = await hs('POST', '/crm/v3/objects/notes', {
    properties: { hs_note_body: noteHtml, hs_timestamp: new Date().toISOString() },
  });
  await hs('PUT', `/crm/v4/objects/notes/${note.id}/associations/deals/${entry.dealId}`, [
    { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 },
  ]);
  return contactId;
}

(async () => {
  const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));

  // One row per real company domain, best-scored first, skipping free-mail hosts
  // (gmail/hotmail have no company domain for Hunter to search).
  const seen = new Map();
  for (const [slug, v] of Object.entries(registry)) {
    if (!v.email || !v.dealId) continue;
    const domain = v.email.split('@')[1]?.toLowerCase();
    if (!domain || /gmail|hotmail|outlook|yahoo|live\./.test(domain)) continue;
    const prev = seen.get(domain);
    if (!prev || (v.score || 0) > (prev.score || 0)) {
      seen.set(domain, { slug, domain, company: v.company, email: v.email, dealId: v.dealId, score: v.score || 0 });
    }
  }
  const targets = [...seen.values()].sort((a, b) => b.score - a.score);

  const credits = await hunterAccount();
  const budget = LIMIT > 0 ? Math.min(LIMIT, credits.remaining) : credits.remaining;
  console.log(`Hunter credits: ${credits.remaining} remaining · budget this run: ${budget}`);
  console.log(`Domains in registry: ${targets.length} · mode: ${APPLY ? 'APPLY (add owners)' : 'REPORT ONLY'}\n`);

  const results = [];
  let spent = 0, hits = 0, ownerGrade = 0, added = 0;

  for (const t of targets) {
    if (spent >= budget) { console.log(`\n⏸  budget reached (${spent}/${budget}) — stopping cleanly`); break; }

    const res = await domainSearch(t.domain);
    if (res.error) { console.log(`  ${t.domain} → ${res.error}`); continue; }

    // Only hits are billed — an empty result costs nothing.
    if (res.emails.length > 0) { spent++; hits++; }

    const best = pickBest(res.emails);
    const row = {
      company: t.company, domain: t.domain, dealId: t.dealId, score: t.score,
      currentEmail: t.email, currentIsGeneric: GENERIC.test(t.email),
      found: res.emails.length,
      best: best ? { name: best.name, email: best.email, position: best.position, confidence: best.confidence, grade: best.grade } : null,
      applied: false,
    };

    if (!best) {
      console.log(`  ${t.company} (${t.domain}) → ${res.emails.length ? 'no named person' : 'nothing (free)'}`);
    } else {
      const flag = best.grade === 'owner' ? '👑' : best.grade === 'marketing' ? '📣' : '  ';
      console.log(`${flag} ${t.company} → ${best.name} · ${best.position || '—'} · ${best.email} (${best.confidence}%)`);
      if (best.grade === 'owner' || best.grade === 'marketing') ownerGrade++;

      const qualifies = (best.grade === 'owner' || best.grade === 'marketing') && best.confidence >= MIN_CONF;
      if (APPLY && qualifies) {
        try {
          await addOwnerToDeal(t, best);
          row.applied = true; added++;
          console.log(`     ↳ added to deal ${t.dealId} (existing ${t.email} untouched)`);
        } catch (e) {
          row.applyError = String(e.message || e);
          console.log(`     ↳ ⚠️ HubSpot: ${row.applyError}`);
        }
      } else if (APPLY) {
        console.log(`     ↳ held for your review (${best.grade}, ${best.confidence}% < ${MIN_CONF}%)`);
      }
    }
    results.push(row);
    await new Promise(r => setTimeout(r, 400)); // courtesy pacing
  }

  const after = await hunterAccount();
  fs.writeFileSync(REPORT_JSON, JSON.stringify({
    ranAt: new Date().toISOString(), mode: APPLY ? 'apply' : 'report',
    creditsBefore: credits.remaining, creditsAfter: after.remaining,
    scanned: results.length, hits, ownerGrade, added, minConfidence: MIN_CONF, results,
  }, null, 2));

  const md = [
    `# Hunter owner sweep — ${new Date().toISOString().slice(0, 10)}`,
    ``,
    `Scanned **${results.length}** domains · **${hits}** returned people · **${ownerGrade}** owner/marketing grade · **${added}** added to HubSpot.`,
    `Credits ${credits.remaining} → ${after.remaining}.`,
    ``,
    `| Company | Current contact | Decision-maker found | Title | Conf | Added |`,
    `|---|---|---|---|---|---|`,
    ...results.filter(r => r.best).map(r =>
      `| ${r.company} | ${r.currentEmail} | ${r.best.name} — ${r.best.email} | ${r.best.position || '—'} | ${r.best.confidence}% | ${r.applied ? '✅' : '—'} |`),
    ``,
    `## No named person found`,
    ...results.filter(r => !r.best).map(r => `- ${r.company} (${r.domain}) — keep ${r.currentEmail}, ask for an intro`),
  ].join('\n');
  fs.writeFileSync(REPORT_MD, md);

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Scanned ${results.length} · people found on ${hits} · owner/marketing grade ${ownerGrade} · added ${added}`);
  console.log(`Credits ${credits.remaining} → ${after.remaining} (spent ${credits.remaining - after.remaining})`);
  console.log(`Report: docs/selling/_hunter-owner-sweep.md`);
  if (!APPLY && ownerGrade > 0) console.log(`\nRe-run with --apply to add these ${ownerGrade} owners to their deals.`);
})();
