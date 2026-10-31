#!/usr/bin/env node
/**
 * hs-audit-apply-kit.cjs — prove every "🔥 I Act TODAY" JOB deal (VJH or hand-staged) carries the FULL kit:
 *   LINK  a clickable apply link (<a href>) in a note        L   a cover letter (not a stub)
 *   CV    a CV SHAPED TO THE POSTING — a CV_*.pdf that is not a generic lane CV AND the 🛡️ note's
 *         "📎 CV FOR THIS POSTING" line (11 Oct 2026). A different file name alone proved nothing: the Puente
 *         PM deal passed ✓CV with the AI-builder CV under a "Product Manager" headline.
 *   D     the 🛡️ TECHNICAL DEFENSE note                        R   the 🎯 ROLE DEFENSE note (written for this posting)
 *   C     the 📋 COMET PROMPT note (1 Oct 2026) — paste into Comet; it fills the form and stops
 * (29 Sep 2026, Elena: "no matter hand or auto staged, the deal … should be automatically genuinely stuffed".)
 *
 *   node scripts/hs-audit-apply-kit.cjs            → read-only report, exit 1 on any gap
 *   node scripts/hs-audit-apply-kit.cjs --telegram → same, plus a Telegram alert when a gap exists
 *
 * WHY. The attach job's own log is not proof: on 22 Sep it said "no note 7 · failed 0" while
 * those deals had notes. This script trusts nothing the writers say about themselves — it reads
 * HubSpot back, deal by deal, and checks the finished state. It writes nothing to HubSpot.
 */
'use strict';

const path = require('path');
const { hubspotKey, hubspotBase, envValue, vjhTelegram } = require(path.join(__dirname, 'hs-env.cjs'));
const { jobDealFilterGroups, isJobDeal } = require(path.join(__dirname, 'lib', 'hiring-deals.cjs'));
const { COMET_MARK } = require(path.join(__dirname, 'lib', 'comet-prompt.cjs'));
const { CV_MARK } = require(path.join(__dirname, 'lib', 'job-tailor.cjs'));

const TELEGRAM = process.argv.includes('--telegram');
const STAGE = 'qualifiedtobuy';
// The letter VJH writes is headed "--- COVER LETTER"; hand-staged deals say "Cover letter".
const LETTER_RE = /COVER LETTER/i;
const MIN_LETTER_CHARS = 400; // a heading with no letter under it is not a letter
// A stub is not a letter. Same markers hs-fill-apply-kit.cjs uses — keep them in step.
const STUB_RE = /Edit this stub|Boilerplate — not tailored/i;
const fs = require('fs');
// The generic lane CVs. A deal that only carries one of these is NOT tailored.
const LANE_CVS = new Set(Object.values(JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'docs', 'applications', 'cv-by-lane', 'lanes.json'), 'utf8')).lanes).map((l) => String(l.cv).toLowerCase()));
// An apply link is any clickable external link that is not HubSpot's or our own site.
const APPLY_LINK_RE = /<a\s[^>]*href="https?:\/\/(?![^"]*(hubspot|webhook\.aideazz|aideazz\.xyz))[^"]+"/i;

async function hs(method, urlPath, body) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${hubspotBase()}${urlPath}`, {
      method,
      headers: { Authorization: `Bearer ${hubspotKey()}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 429 && attempt < 4) {
      await r.text();
      await new Promise((res) => setTimeout(res, Number(r.headers.get('retry-after')) * 1000 || 1500 * (attempt + 1)));
      continue;
    }
    const text = await r.text();
    if (!r.ok) throw new Error(`${method} ${urlPath.split('?')[0]} → ${r.status}: ${text.slice(0, 120)}`);
    return JSON.parse(text);
  }
}

// 11 Oct 2026: a CV made by hand (the 5–6 Oct recipe) is the gold standard, not a gap. Any non-lane CV that the kit
// did not build (its PDFs live in cv-by-job/auto/; uploadCv may add "_<4 digits>") is hand-built — same rule as the kit.
const KIT_CVS = (() => {
  try {
    return new Set(fs.readdirSync(path.join(__dirname, '..', 'docs', 'applications', 'cv-by-job', 'auto'))
      .filter((f) => f.endsWith('.pdf')).map((f) => f.toLowerCase()));
  } catch { return new Set(); }
})();
const isKitCv = (fname) => KIT_CVS.has(fname) || KIT_CVS.has(fname.replace(/_\d{4}\.pdf$/, '.pdf'));

function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

async function auditDeal(d) {
  const assoc = await hs('GET', `/crm/v4/objects/deals/${d.id}/associations/notes`);
  const ids = (assoc.results || []).map((r) => r.toObjectId);
  let letter = false, cv = false, cvName = '', link = false, defense = false, role = false, comet = false, shaped = false, handBuilt = '';
  let tailored = false, tailoredWhy = '', warning = '';
  const notes = [];
  for (const id of ids) notes.push(await hs('GET', `/crm/v3/objects/notes/${id}?properties=hs_note_body,hs_attachment_ids`));
  if (!isJobDeal(d.properties.dealname, notes.map((n) => n.properties?.hs_note_body))) return null;
  for (const n of notes) {
    const html = String(n.properties?.hs_note_body || '');
    // 1 Oct 2026: the 📋 Comet note quotes the letter under a COVER LETTER heading and lists her own links —
    // it is neither the letter nor the apply link. Checked FIRST so no other test ever sees it.
    if (stripHtml(html).includes(COMET_MARK)) { comet = true; continue; }
    if (APPLY_LINK_RE.test(html)) link = true;
    if (html.includes('TECHNICAL DEFENSE')) {
      defense = true;
      // 31 Oct 2026: the reviewer's warning on the CV this note says to use (its FIRST 📎 line) is read, not filed away.
      const top = stripHtml(html).split('📎')[1] || '';
      warning = (top.match(/Its reviewer's note:\s*(.+?)(?: — read the CV|$)/) || [])[1] || '';
    }
    if (html.includes('🎯 ROLE DEFENSE')) role = true;
    const body = stripHtml(html);
    if (body.includes(CV_MARK)) shaped = true;
    // 16 Oct 2026: the kit's own honest choice — its CV composer could not shape this posting from her verified facts, so it
    // attached the tailored CV and (since 16 Oct) wrote why. A complete kit, not a gap; the reason travels with the line.
    if (body.includes('Tailored CV attached to this note')) {
      tailored = true;
      tailoredWhy = (body.match(/Not shaped to this posting:\s*(.+?)(?: — |$)/) || [])[1] || tailoredWhy;
    }
    const at0 = STUB_RE.test(body);
    const at = body.search(LETTER_RE);
    if (!at0 && at >= 0 && body.length - at >= MIN_LETTER_CHARS) letter = true;
    for (const fid of String(n.properties?.hs_attachment_ids || '').split(';').filter(Boolean)) {
      const f = await hs('GET', `/files/v3/files/${fid}`);
      const fname = `${f.name}.${String(f.extension).toLowerCase()}`;
      if (/^CV_/i.test(fname) && fname.endsWith('.pdf') && !LANE_CVS.has(fname.toLowerCase())) {
        cv = true; cvName = fname;
        if (!isKitCv(fname.toLowerCase())) handBuilt = fname;
      }
    }
  }
  // Deals staged before 11 Oct 2026 predate posting-shaped CVs; Elena (16 Oct): no backfill — their tailored CV is the kit.
  const legacy = String(d.properties.createdate || '') < '2026-10-11';
  if (cv && !shaped) {
    // Only what is known: the kit's recorded reason, else the staging date, else the bare fact — never a guessed reason.
    cvName = handBuilt ? `${handBuilt} (hand-built)`
      : tailoredWhy ? `${cvName} (tailored — not shaped: ${tailoredWhy})`
      : legacy ? `${cvName} (staged before posting-shaped CVs)`
      : tailored ? `${cvName} (tailored — the kit could not shape it to this posting)`
      : `${cvName} (generic — not shaped to the posting)`;
  }
  return { id: d.id, name: String(d.properties.dealname).replace(/^\[[^\]]*\]\s*/, ''), notes: ids.length, letter, cv: cv && (shaped || !!handBuilt || tailored || legacy), cvName, link, defense, role, comet, warning };
}

async function telegram(text) {
  // Jobs arrive in the VibeJob Hunter bot (Elena, 16 Oct 2026); this repo's bot only where VJH is not on the box.
  const vjh = vjhTelegram();
  const token = vjh ? vjh.token : envValue('TELEGRAM_BOT_TOKEN');
  const chat = vjh ? vjh.chat : (envValue('TELEGRAM_LEADS_DIGEST_CHAT_ID') || envValue('TELEGRAM_AUTHORIZED_USERS').split(',')[0].trim());
  console.log(`  telegram via ${vjh ? 'VibeJob Hunter bot' : 'CTO AIPA bot'}`);
  if (!token || !chat) { console.log('  (telegram not configured — alert printed only)'); return; }
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: text.slice(0, 3900) }),
  });
  console.log(`  telegram ${r.status}`);
}

(async () => {
  const search = await hs('POST', '/crm/v3/objects/deals/search', {
    // VJH deals AND hand-staged jobs (29 Sep 2026) — recruiter-outreach deals return null below.
    filterGroups: jobDealFilterGroups(STAGE),
    properties: ['dealname', 'createdate'],
    limit: 100,
  });
  const deals = search.results || [];
  const rows = [];
  for (const d of deals) {
    try { const r = await auditDeal(d); if (r) rows.push(r); }
    catch (e) { rows.push({ id: d.id, name: d.properties.dealname, error: e.message }); }
  }

  const missing = (r) => [!r.link && 'no apply link', !r.letter && 'no letter', !r.cv && 'no CV for this posting (none attached, or only a generic lane CV)',
    !r.defense && 'no 🛡️ defense', !r.role && 'no 🎯 role defense', !r.comet && 'no 📋 Comet prompt'].filter(Boolean);
  const gaps = rows.filter((r) => r.error || missing(r).length);
  for (const r of rows) {
    const t = (ok, k) => `${ok ? '✓' : '✖'}${k}`;
    const mark = r.error ? '✖ ERR ' : [t(r.link, 'LINK'), t(r.letter, 'L'), t(r.cv, 'CV'), t(r.defense, 'D'), t(r.role, 'R'), t(r.comet, 'C')].join(' ');
    console.log(`  ${mark}  ${String(r.name).slice(0, 60).padEnd(62)} ${r.error || r.cvName || ''}`);
  }
  console.log(`\n${rows.length} job deals · complete ${rows.length - gaps.length} · gaps ${gaps.length}`);

  if (gaps.length) {
    process.exitCode = 1;
    if (TELEGRAM) {
      const lines = gaps.map((g) => `• ${String(g.name).slice(0, 70)} — ${g.error ? 'audit error' : [!g.letter && 'no letter', !g.cv && 'no CV'].filter(Boolean).join(' + ')}`.replace(/ — .*$/, ` — ${g.error ? 'audit error' : missing(g).join(' + ')}`));
      await telegram(`⚠️ Apply kit gap: ${gaps.length} of ${rows.length} ACT TODAY job deals are not fully stuffed\n\n${lines.join('\n')}`);
    }
  }
  // A complete kit can still carry a CV its own reviewer doubted: not a gap, but a reason to read it before sending.
  const warned = rows.filter((r) => r.warning);
  for (const r of warned) console.log(`  ⚠️ CV warning  ${String(r.name).slice(0, 60)} — ${r.warning.slice(0, 160)}`);
  if (warned.length && TELEGRAM) {
    await telegram(`🔎 ${warned.length} CV(s) its own reviewer doubted — read before sending:\n\n${warned.map((r) => `• ${String(r.name).slice(0, 70)} — ${r.warning.slice(0, 200)}`).join('\n')}`);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
