#!/usr/bin/env node
/**
 * free-owner-scrape.cjs — find founder/owner names on company websites, $0 cost.
 *
 * Fallback for when Hunter.io credits are at 0 (resets 2026-08-20). Instead of a
 * paid domain-search API, this fetches each company's homepage + likely
 * About/Team/Contact page and looks for a mailto: (or plain-text) email sitting
 * near an owner-grade title (founder, dueño, director general, gerente general...).
 *
 * REPORT ONLY. Never writes to HubSpot. Mirrors hunter-owner-sweep.cjs's ADD-never-
 * replace philosophy, but the write step (addOwnerToDeal) is a separate, explicit
 * follow-up once Elena reviews which hits are real.
 *
 * Usage: node scripts/free-owner-scrape.cjs docs/selling/_scrape-targets.json
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TARGETS_FILE = process.argv[2] || 'docs/selling/_scrape-targets.json';
const targets = JSON.parse(fs.readFileSync(path.join(ROOT, TARGETS_FILE), 'utf8'));

const REPORT_JSON = path.join(ROOT, 'docs/selling/_free-owner-scrape.json');
const REPORT_MD = path.join(ROOT, 'docs/selling/_free-owner-scrape.md');

const OWNER = /\b(founder|co-?founder|owner|propietari[oa]|due[nñ]|ceo|chief executive|president[ae]?|managing director|managing partner|socio|gerente general|director general|general manager|partner|principal)\b/i;
const MARKETING = /\b(cmo|marketing director|director de marketing|head of marketing|marketing manager|gerente de marketing)\b/i;
const GENERIC = /^(info|contact|contacto|contactus|hello|hola|admin|office|mail|correo|web|webmaster|general|reservas|reservaciones|reservations|booking|sales|ventas|recepcion|reception|atencion|servicio|servicios|clientes|customer|marketing|rrhh|hr|admisiones|admissions|citas|soporte|support|team|inquiries|frontdesk|noreply)@/i;

const CANDIDATE_PATHS = ['/about', '/about-us', '/nosotros', '/quienes-somos', '/quienessomos', '/team', '/equipo', '/our-team', '/contact', '/contacto', '/leadership', '/staff'];
const LINK_KEYWORDS = /about|nosotros|quienes|equipo|team|contact|contacto|staff|leadership|founder|owner/i;

function timeoutFetch(url, ms = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIdeazzResearch/1.0)' } })
    .then(r => (r.ok ? r.text() : null))
    .catch(() => null)
    .finally(() => clearTimeout(t));
}

function extractCandidates(html, baseUrl) {
  const out = [];
  const re = /<a\s[^>]*href=["']([^"'#]+)["'][^>]*>(.*?)<\/a>/gis;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const text = m[2].replace(/<[^>]+>/g, ' ');
    if (!LINK_KEYWORDS.test(href) && !LINK_KEYWORDS.test(text)) continue;
    try {
      const u = new URL(href, baseUrl);
      if (u.hostname === new URL(baseUrl).hostname) out.push(u.href);
    } catch {}
  }
  return [...new Set(out)].slice(0, 3);
}

/** Find mailto/plain emails and grab ~200 chars of surrounding text to grade the title. */
function findPeople(html) {
  const hits = [];
  const text = html.replace(/\s+/g, ' ');
  const mailtoRe = /<a\s[^>]*href=["']mailto:([^"'?]+)["'][^>]*>(.*?)<\/a>/gis;
  let m;
  while ((m = mailtoRe.exec(text))) {
    const email = m[1].trim().toLowerCase();
    if (!email.includes('@')) continue;
    const idx = m.index;
    const context = text.slice(Math.max(0, idx - 300), idx + 300).replace(/<[^>]+>/g, ' ');
    hits.push({ email, context, linkText: m[2].replace(/<[^>]+>/g, ' ').trim() });
  }
  // plain-text emails near owner-title words (lighter signal)
  const emailRe = /\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/gi;
  while ((m = emailRe.exec(text))) {
    const email = m[1].toLowerCase();
    if (hits.some(h => h.email === email)) continue;
    const idx = m.index;
    const context = text.slice(Math.max(0, idx - 300), idx + 300).replace(/<[^>]+>/g, ' ');
    if (OWNER.test(context)) hits.push({ email, context, linkText: '' });
  }
  return hits;
}

function grade(context) {
  if (OWNER.test(context)) return 'owner';
  if (MARKETING.test(context)) return 'marketing';
  return 'other';
}

/** Try to pull a human name near the email/context (very rough heuristic). */
function guessName(context, linkText) {
  if (linkText && /^[A-ZÀ-Ý][a-zà-ÿ'-]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ'-]+){1,2}$/.test(linkText.trim())) return linkText.trim();
  const nameRe = /\b([A-ZÀ-Ý][a-zà-ÿ'-]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ'-]+){1,2})\b/g;
  let best = null, m;
  while ((m = nameRe.exec(context))) {
    const cand = m[1];
    if (/^(About|Contact|Team|Home|Nosotros|Contacto|Equipo|Read More|Click Here)/i.test(cand)) continue;
    best = cand; // keep last match closest scanning forward; good enough for a report
  }
  return best;
}

async function scrapeDomain(domain) {
  const bases = [`https://${domain}`, `https://www.${domain}`];
  let html = null, baseUrl = null;
  for (const b of bases) {
    html = await timeoutFetch(b);
    if (html) { baseUrl = b; break; }
  }
  if (!html) return { error: 'unreachable', people: [] };

  let people = findPeople(html);
  const candidates = extractCandidates(html, baseUrl);
  for (const url of candidates) {
    if (people.some(p => grade(p.context) === 'owner')) break; // already have a strong hit
    const sub = await timeoutFetch(url);
    if (sub) people = people.concat(findPeople(sub));
  }
  // de-dupe by email, keep best context
  const byEmail = new Map();
  for (const p of people) {
    if (!byEmail.has(p.email)) byEmail.set(p.email, p);
  }
  return { error: null, people: [...byEmail.values()] };
}

(async () => {
  console.log(`Scraping ${targets.length} domains (free, no API cost)...\n`);
  const results = [];
  let hits = 0, ownerGrade = 0;

  for (const t of targets) {
    const { error, people } = await scrapeDomain(t.domain);
    if (error) {
      console.log(`  ${t.company} (${t.domain}) → ${error}`);
      results.push({ ...t, error, best: null });
      continue;
    }
    const ranked = people
      .filter(p => !GENERIC.test(p.email) && p.email.split('@')[1] === t.domain.replace(/^www\./, ''))
      .map(p => ({ ...p, grade: grade(p.context), name: guessName(p.context, p.linkText) }))
      .sort((a, b) => {
        const rank = g => (g === 'owner' ? 0 : g === 'marketing' ? 1 : 2);
        return rank(a.grade) - rank(b.grade);
      });
    const best = ranked[0] || null;
    if (best) hits++;
    if (best && (best.grade === 'owner' || best.grade === 'marketing')) {
      ownerGrade++;
      const flag = best.grade === 'owner' ? '👑' : '📣';
      console.log(`${flag} ${t.company} → ${best.name || '(name unclear)'} · ${best.email} · ${best.grade}`);
    } else {
      console.log(`   ${t.company} (${t.domain}) → ${best ? 'found but not owner-grade' : 'nothing usable'}`);
    }
    results.push({
      ...t,
      found: people.length,
      best: best ? { name: best.name, email: best.email, grade: best.grade, contextSnippet: best.context.slice(0, 160) } : null,
    });
    await new Promise(r => setTimeout(r, 250)); // courtesy pacing
  }

  fs.writeFileSync(REPORT_JSON, JSON.stringify({ ranAt: new Date().toISOString(), scanned: results.length, hits, ownerGrade, results }, null, 2));

  const md = [
    `# Free owner scrape (no API cost) — ${new Date().toISOString().slice(0, 10)}`,
    ``,
    `Scanned **${results.length}** CLIENT-MANUAL/CLIENT-ATLAS domains · **${hits}** returned a plausible person · **${ownerGrade}** owner/marketing grade.`,
    `Nothing was written to HubSpot — this is a report only. Names are a heuristic guess (nearby capitalized words), verify before using.`,
    ``,
    `| Company | Current contact | Found | Grade | Email |`,
    `|---|---|---|---|---|`,
    ...results.filter(r => r.best).map(r => `| ${r.company} | ${r.email} | ${r.best.name || '—'} | ${r.best.grade} | ${r.best.email} |`),
    ``,
    `## Nothing usable / unreachable`,
    ...results.filter(r => !r.best).map(r => `- ${r.company} (${r.domain}) — ${r.error || 'no owner-grade person found'}, keep ${r.email}`),
  ].join('\n');
  fs.writeFileSync(REPORT_MD, md);

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Scanned ${results.length} · usable hits ${hits} · owner/marketing grade ${ownerGrade}`);
  console.log(`Report: docs/selling/_free-owner-scrape.md`);
})();
