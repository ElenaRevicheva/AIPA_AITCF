#!/usr/bin/env node
/**
 * hs-deal-prep.cjs — print a job deal's prep material from HubSpot, for interview practice. READ-ONLY.
 *
 *   node scripts/hs-deal-prep.cjs --company="Addepto"      # best matching [HIRING-…] deal
 *   node scripts/hs-deal-prep.cjs --company="Puente" --role="Chief of Staff"   # several deals at one company
 *   node scripts/hs-deal-prep.cjs --deal=<dealId>
 *   node scripts/hs-deal-prep.cjs --examples               # only the ✅ VERIFIED EXAMPLES list (spar, no deal)
 *   node scripts/hs-deal-prep.cjs --digest --out=<file>      # compact sheet of ALL live job deals (≤ 11,000 chars)
 *
 * --digest (7 Oct 2026): the mock interview must not depend on a model REMEMBERING to call this script — gpt-4.1
 * skipped it in Elena's chat and invented "AI Product Engineer @ Shortical". The digest is written to the OpenClaw
 * workspace and injected into every reply's context by OpenClaw's bundled `bootstrap-extra-files` hook, so the
 * right role and the posting's requirements are always in front of whichever model answers. Cron: every 30 min.
 *
 * WHY (7 Oct 2026, Elena: "it should be able to pick the deal data from hubspot"). The OpenClaw mock-interview
 * skill (openclaw-vibejob-shortlist, docs/openclaw/interview-spar) prepares her for a SPECIFIC job. Everything that
 * job needs is already on its deal, written by the apply kit: the posting link, 🔎 COMPANY BRIEF, 🛡️ TECHNICAL
 * DEFENSE, 🎯 ROLE DEFENSE, the letter. Nothing could read it back. This only reads — same calls as
 * hs-audit-apply-kit.cjs, same job-deal definition (lib/hiring-deals.cjs). It never writes to HubSpot.
 */
'use strict';
const { hubspotKey, hubspotBase } = require('./hs-env.cjs');
const { isJobDeal } = require('./lib/hiring-deals.cjs');
const { COMET_MARK } = require('./lib/comet-prompt.cjs');

const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3).trim();
// 11 Oct 2026: 2,500 cut the 🎯 note's honest gaps and the 🛡️ note's last answer mid-sentence (Puente PM). The
// single-deal read goes into the conversation, not the injected digest, so whole notes fit; the digest keeps its own cap.
const MAX_NOTE = 10000;

async function hs(method, urlPath, body) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${hubspotBase()}${urlPath}`, {
      method,
      headers: { Authorization: `Bearer ${hubspotKey()}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if ((r.status === 429 || r.status >= 500) && attempt < 4) {   // HubSpot 502s happen; one must not sink the run
      await r.text();
      await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
      continue;
    }
    const text = await r.text();
    if (!r.ok) throw new Error(`${method} ${urlPath.split('?')[0]} → ${r.status}: ${text.slice(0, 120)}`);
    return JSON.parse(text);
  }
}

const stripHtml = (s) => String(s || '')
  .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

function label(text) {
  if (text.includes('📌 JOB POSTING')) return '📌 JOB POSTING';
  if (text.includes('COMPANY BRIEF')) return '🔎 COMPANY BRIEF';
  if (text.includes('ROLE DEFENSE')) return '🎯 ROLE DEFENSE (model-written from verified material — context, not a quotable proof)';
  if (text.includes('TECHNICAL DEFENSE')) return '🛡️ TECHNICAL DEFENSE';
  if (/cover letter|dear hiring|hiring team/i.test(text)) return '✉️ LETTER';
  return '📝 NOTE';
}

async function notesOf(dealId) {
  const assoc = await hs('GET', `/crm/v4/objects/deals/${dealId}/associations/notes`);
  const out = [];
  for (const r of assoc.results || []) {
    const n = await hs('GET', `/crm/v3/objects/notes/${r.toObjectId}?properties=hs_note_body,hs_timestamp`);
    out.push({ html: String(n.properties?.hs_note_body || ''), ts: n.properties?.hs_timestamp || '' });
  }
  return out;
}

// ── --digest: one compact entry per live job deal ───────────────────────────────────────────────────────────
const DIGEST_MAX = 11000;      // fits EVERY model in the chain: Groq's per-file bootstrap limit measured 12,506 (7 Oct 2026)
const firstSentence = (s) => (String(s || '').match(/^[^.!?]{20,240}[.!?]/) || [String(s || '').slice(0, 200)])[0].trim();

async function digest(outPath) {
  const res = await hs('POST', '/crm/v3/objects/deals/search', {
    filterGroups: [{ filters: [
      { propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: '*HIRING*' },
      { propertyName: 'dealstage', operator: 'NOT_IN', values: ['closedwon', 'closedlost'] },
    ] }],
    properties: ['dealname', 'dealstage', 'createdate'],
    sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
    limit: 60,
  });
  const entries = [];
  for (const d of res.results || []) {
    const name = String(d.properties.dealname || '');
    if (!/^\s*\[HIRING-/i.test(name)) continue;
    let notes;
    try { notes = await notesOf(d.id); } catch (e) { console.warn(`skip deal ${d.id}: ${e.message.slice(0, 80)}`); continue; }
    if (!isJobDeal(name, notes.map((n) => n.html))) continue;
    const m = name.replace(/^\s*\[[^\]]*\]\s*/, '').match(/^(.*?)\s+@\s+(.*)$/);
    const role = m ? m[1].trim() : name, company = m ? m[2].trim() : '';
    let link = '', reqs = [], what = '';
    for (const n of notes) {
      const text = stripHtml(n.html);
      if (text.includes(COMET_MARK)) continue;
      if (!link) { const l = [...n.html.matchAll(/href="(https?:\/\/[^"]+)"/gi)].map((x) => x[1]).find((u) => !/hubspot|webhook\.aideazz|aideazz\.xyz/i.test(u)); if (l) link = l; }
      for (const r of text.matchAll(/\(because:\s*([^)]+)\)/g)) reqs.push(r[1].trim());
      if (!what && text.includes('COMPANY BRIEF')) { const w = text.split(/What they do:?/i)[1]; if (w) what = firstSentence(w); }
    }
    // Compact on purpose: every live deal must fit the smallest context in the chain. Role + stage + the
    // posting's own requirements is what the interview needs; links and full notes are one tool call away.
    const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);
    reqs = [...new Set(reqs)].slice(0, 3).map((r) => cut(r, 90));
    entries.push([
      `### ${cut(company || role, 40)} — ${cut(role, 70)} (${d.properties.dealstage})`,
      what ? `does: ${cut(what, 110)}` : '',
      reqs.length ? `needs: ${reqs.join(' • ')}` : '',
    ].filter(Boolean).join('\n'));
  }
  const head = [
    '# LIVE JOB DEALS (HubSpot) — read-only snapshot, refreshed every 30 min by cto-aipa/scripts/hs-deal-prep.cjs --digest',
    `# ${new Date().toISOString()} · ${entries.length} live job deals. Use this for the mock interview: when Elena names a company,`,
    '# take the role and requirements from HERE. Never invent a role. For full notes run hs-deal-prep.cjs --company="<company>".',
    '# PROOF RULE (Elena, 11 Oct 2026): when you prepare her for a company, RUN that command in that same turn, before writing',
    '# anything (add --role="<role she named>" — one company can have several deals). Your first line must be the',
    '# "✅ Loaded: …" text from the READ-PROOF line at the very END of its output (note count + newest note), copied exactly.',
    '# Only if the command FAILED or printed no READ-PROOF line: "⚠️ Deal NOT fully loaded" — never guess it, never skip running it.',
    '# Ask ONE mock question per message (🎙️ Q<n>/<total>) — never list the whole series.',
    '# LIVE RULE (Elena, 11 Oct 2026): if she pastes an INTERVIEWER\'S question (not her answer to your mock question), reply',
    '# "🔴 LIVE — say this:" + ONE first-person answer, 3–5 sentences, true facts from the deal only — no other sections, no next',
    '# question, no voice note. FACTS always: titles exactly "Deputy CEO for Corporate Governance & Chief Legal Officer" (never',
    '# "CEO"); AI agents implement, she decides requirements and tests; no metric she does not have (conversions, revenue, hours).',
    '# EXAMPLE RULE (Elena, 11 Oct 2026): EVERY answer — polished or LIVE — has a line "For example, from my work:" with ONE true example from HER OWN products,',
    '# COPIED WORD FOR WORD from the "✅ VERIFIED EXAMPLES" list at the end of the deal output (pick the best fit; never reword',
    '# or round a number — "18 websites" is not "18 users"). A generic answer with no example from her products is a miss.',
    '# HER CAREER, exactly: 2011–2018 Deputy CEO for Corporate Governance & Chief Legal Officer of a ~60-person regional e-government',
    '# operator — she ran the BOARD PROCESS and the LEGAL side of moving public services online (not product delivery, not IT). 2024–2025',
    '# Operational Co-Founder of OmniBazaar. 2025– she FOUNDED AIdeazz AI Lab (never "co-founded"); she and her AI agents are one unit.',
    '',
  ].join('\n');
  let body = head;
  for (const e of entries) { if ((body + e).length + 2 > DIGEST_MAX) break; body += `${e}\n\n`; }
  const fs = require('fs'), path = require('path');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(`${outPath}.tmp`, body);
  fs.renameSync(`${outPath}.tmp`, outPath);      // atomic: OpenClaw never reads a half-written sheet
  console.log(`digest: ${entries.length} live job deals → ${outPath} (${body.length} chars)`);
}

// VERIFIED EXAMPLES (11 Oct 2026, Elena: answers must carry "examples of my true verified situations with my products").
// gpt-4.1 paraphrased a CV fact into a false one ("39 audits from 18 real users in one week"), while the 🛡️ line it
// copies verbatim never bent — so the example is copied too, from the reviewed CV bank, never re-told.
// --examples (12 Oct 2026): the same list for `spar` (no deal loaded) — without it Gemini invented "2,500+ analyses".
function printVerifiedExamples() {
  try {
    const bank = require(require('path').join(__dirname, '..', 'docs', 'applications', 'cv-bank.json'));
    const told = (t) => t.replace(/^\*\*([^*]+?)\*\*\s*/, (m, lead) => (lead.includes(' — ') ? `${lead.split(' — ')[0]}: ` : ''));
    // Every reviewed bullet is a true story; "six products", "five junk results" carry numbers in words, so no digit filter.
    const ex = (bank.bullets || []).map((b) => told(String(b.text || ''))).filter(Boolean);
    if (ex.length) {
      console.log('\n===== ✅ VERIFIED EXAMPLES — for "For example, from my work:" copy ONE of these WORD FOR WORD (numbers are checked):');
      ex.forEach((t, i) => console.log(`${i + 1}. ${t}`));
    }
  } catch (e) { console.log(`\n(verified examples unavailable: ${e.message.slice(0, 80)})`); }
}

(async () => {
  if (process.argv.includes('--examples')) return printVerifiedExamples();
  if (process.argv.includes('--digest')) {
    const out = arg('out');
    if (!out) { console.error('--digest needs --out=<file>'); process.exit(2); }
    return digest(out);
  }
  const company = arg('company');
  let dealId = arg('deal');
  if (!company && !dealId) {
    console.error('usage: --company="<company>" | --deal=<dealId>');
    process.exit(2);
  }

  if (!dealId) {
    const res = await hs('POST', '/crm/v3/objects/deals/search', {
      query: company,
      properties: ['dealname', 'dealstage', 'createdate'],
      sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
      limit: 20,
    });
    const found = (res.results || []).filter((d) => /^\s*\[HIRING-/i.test(d.properties.dealname || ''));
    if (!found.length) {
      console.log(`No [HIRING-…] deal in HubSpot matches "${company}".`);
      return;
    }
    // Prefer a live deal (I act TODAY / interview stages) over a closed one.
    const live = found.filter((d) => !/closed/i.test(d.properties.dealstage || ''));
    let pick = (live.length ? live : found)[0];
    // --role: one company can carry several deals (Puente: seven). Take the one whose title holds the most role words.
    const roleWords = (arg('role') || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
    if (roleWords.length) {
      const title = (d) => (d.properties.dealname || '').replace(/^\s*\[[^\]]*\]\s*/, '').split(' @ ')[0].toLowerCase();
      const hits = (d) => roleWords.filter((w) => title(d).includes(w)).length;
      const best = [...(live.length ? live : found)].sort((a, b) => hits(b) - hits(a))[0];
      if (hits(best) > 0) pick = best;
    }
    if (found.length > 1) {
      console.log(`${found.length} matching job deals (newest first):`);
      for (const d of found.slice(0, 12)) console.log(`  · ${d.properties.dealname} [${d.properties.dealstage}] id=${d.id}`);
      console.log('');
    }
    dealId = pick.id;
  }

  const deal = await hs('GET', `/crm/v3/objects/deals/${dealId}?properties=dealname,dealstage,createdate`);
  const notes = await notesOf(dealId);
  if (!isJobDeal(deal.properties.dealname, notes.map((n) => n.html))) {
    console.log(`Deal ${dealId} is not a job deal: ${deal.properties.dealname}`);
    return;
  }

  console.log(`===== DEAL: ${deal.properties.dealname}`);
  console.log(`stage: ${deal.properties.dealstage} · created: ${String(deal.properties.createdate).slice(0, 10)} · id: ${dealId}`);
  const links = new Set();
  for (const n of notes) {
    for (const m of n.html.matchAll(/href="(https?:\/\/[^"]+)"/gi)) {
      if (!/hubspot|webhook\.aideazz|aideazz\.xyz/i.test(m[1])) links.add(m[1]);
    }
  }
  if (links.size) console.log(`posting / apply links: ${[...links].slice(0, 3).join(' · ')}`);

  let cut = 0;
  for (const n of notes) {
    const text = stripHtml(n.html);
    if (!text || text.includes(COMET_MARK)) continue; // the Comet prompt only re-quotes the letter
    console.log(`\n===== ${label(text)}`);
    if (text.length > MAX_NOTE) cut++;
    console.log(text.length > MAX_NOTE ? `${text.slice(0, MAX_NOTE)} …[cut]` : text);
  }
  printVerifiedExamples();
  // READ-PROOF (11 Oct 2026, Elena: "I just need a proof" that the coach read the full true deal). The LAST line of the
  // output, so it only reaches a model that received everything above it. It names what she can check in HubSpot herself:
  // the deal's note count and the first words of its newest note (the top of the Notes tab).
  const newest = [...notes].sort((a, b) => String(b.ts).localeCompare(String(a.ts)))[0];
  const newestTitle = newest ? stripHtml(newest.html).split('\n')[0].trim().slice(0, 60) : '';
  console.log(`\n===== READ-PROOF — copy into your FIRST line: ✅ Loaded: ${deal.properties.dealname.replace(/^\s*\[[^\]]*\]\s*/, '')}`
    + ` — ${notes.length} notes, newest: "${newestTitle}"${cut ? ` · ⚠️ ${cut} note(s) cut` : ''}`);
})().catch((e) => {
  console.error(`hs-deal-prep failed: ${e.message}`);
  process.exit(1);
});
