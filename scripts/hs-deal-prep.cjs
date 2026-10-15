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
  const entries = [], interviewDeals = [];
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
    const qs = likelyQuestions(notes);
    if (qs.length) interviewDeals.push({ title: `${company || role} — ${role} (${d.properties.dealstage})`, proof: readProof(name, notes), qs });
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
    '# "✅ Loaded: …" text from the READ-PROOF line at the very END of its output (note count + newest note), copied exactly —',
    '# or, for a deal under 🎤 INTERVIEW DEALS in her VERIFIED FACTS sheet, that ✅ Loaded line. NEVER compose it yourself',
    '# (15 Oct 2026: a made-up "7 notes, newest: …" line hid that the deal was never read). No such line: "⚠️ Deal NOT fully loaded".',
    '# Ask ONE mock question per message (🎙️ Q<n>/<total>) — never list the whole series.',
    '# SPANISH (Elena, 14 Oct 2026): "en español" or she writes in Spanish → the WHOLE interview in Spanish (questions, polished',
    '# answer, explanations) and EVERY message ends with a Spanish [[tts:text]]…[[/tts:text]] voice block; use the §0b template.',
    '# LIVE RULE (Elena, 11 Oct 2026): if she pastes an INTERVIEWER\'S question (not her answer to your mock question), reply',
    '# "🔴 LIVE — say this:" + ONE first-person answer, 3–5 sentences, true facts from the deal only — no other sections, no next',
    '# question, no voice note. FACTS always: titles exactly "Deputy CEO for Corporate Governance & Chief Legal Officer" (never',
    '# "CEO"); AI agents implement, she decides requirements and tests; no metric she does not have (conversions, revenue, hours).',
    '# EXAMPLE RULE (Elena, 11 Oct 2026): EVERY answer — polished or LIVE — has a line "For example, from my work:" with ONE true example from HER OWN products,',
    '# COPIED WORD FOR WORD from the "✅ VERIFIED EXAMPLES" list (always in her VERIFIED FACTS sheet) (pick the best fit; never reword',
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
  const proofOut = arg('proof-out');
  if (proofOut) {
    const sheet = proofSheet(interviewDeals);
    fs.mkdirSync(path.dirname(proofOut), { recursive: true });
    fs.writeFileSync(`${proofOut}.tmp`, sheet);
    fs.renameSync(`${proofOut}.tmp`, proofOut);
    console.log(`proof sheet: ${interviewDeals.length} interview deal(s) → ${proofOut} (${sheet.length} chars)`);
  }
}

// VERIFIED EXAMPLES (11 Oct 2026, Elena: answers must carry "examples of my true verified situations with my products").
// gpt-4.1 paraphrased a CV fact into a false one ("39 audits from 18 real users in one week"), while the 🛡️ line it
// copies verbatim never bent — so the example is copied too, from the reviewed CV bank, never re-told.
// --examples (12 Oct 2026): the same list for `spar` (no deal loaded) — without it Gemini invented "2,500+ analyses".
const loadBank = () => require(require('path').join(__dirname, '..', 'docs', 'applications', 'cv-bank.json'));
const plain = (t) => String(t || '').replace(/\*\*/g, '').trim();

function verifiedExampleLines() {
  try {
    const bank = loadBank();
    const told = (t) => t.replace(/^\*\*([^*]+?)\*\*\s*/, (m, lead) => (lead.includes(' — ') ? `${lead.split(' — ')[0]}: ` : ''));
    // Every reviewed bullet is a true story; "six products", "five junk results" carry numbers in words, so no digit filter.
    const ex = (bank.bullets || []).map((b) => told(String(b.text || ''))).filter(Boolean);
    // 14 Oct 2026 (Pitz, Spanish interview): a model TRANSLATING a story bent "1–10 October" into "una semana" — so the
    // Spanish versions are written once, numbers checked against the English, and copied like the English ones.
    const es = (bank.bullets || []).map((b) => String(b.text_es || '').trim()).filter(Boolean);
    const out = [];
    if (ex.length) out.push('', '===== ✅ VERIFIED EXAMPLES — for "For example, from my work:" copy ONE of these WORD FOR WORD (numbers are checked):', ...ex.map((t, i) => `${i + 1}. ${t}`));
    if (es.length) out.push('', '===== ✅ EJEMPLOS VERIFICADOS (ES) — para "Por ejemplo, en mi trabajo:" copia UNO PALABRA POR PALABRA (cifras verificadas):', ...es.map((t, i) => `${i + 1}. ${t}`));
    return out;
  } catch (e) { return ['', `(verified examples unavailable: ${e.message.slice(0, 80)})`]; }
}
const printVerifiedExamples = () => verifiedExampleLines().forEach((l) => console.log(l));

// 🎤 THIS COMPANY'S QUESTIONS — the "Preguntas probables / Likely questions" list of a 🔎 deep-dive note.
function likelyQuestions(notes) {
  const qs = [];
  for (const n of notes) {
    const lines = stripHtml(n.html).split('\n').map((l) => l.trim()); // a note pasted from Windows keeps "\r" per line
    const at = lines.findIndex((l) => /^\s*\d+\.\s*(Preguntas probables|Likely (interview )?questions)/i.test(l));
    if (at < 0) continue;
    for (const l of lines.slice(at + 1)) {
      if (/^\s*\d+\.\s/.test(l)) break; // the next numbered section ends the list
      const m = l.match(/^\s*[•*-]\s*(.+)$/);
      if (m) qs.push(m[1].trim());
    }
  }
  return qs;
}

// What she can check in HubSpot herself: the deal's note count and the first words of its newest note.
function readProof(dealname, notes, cut = 0) {
  const newest = [...notes].sort((a, b) => String(b.ts).localeCompare(String(a.ts)))[0];
  const newestTitle = newest ? stripHtml(newest.html).split('\n')[0].trim().slice(0, 60) : '';
  return `✅ Loaded: ${String(dealname).replace(/^\s*\[[^\]]*\]\s*/, '')} — ${notes.length} notes, newest: "${newestTitle}"${cut ? ` · ⚠️ ${cut} note(s) cut` : ''}`;
}

/*
 * PROOF SHEET (15 Oct 2026) — `--digest --proof-out=<file>`, injected into EVERY OpenClaw reply next to the deals sheet.
 * Elena's real Pitz session (14 Oct 21:07 → 15 Oct 10:58 UTC) never ran this script: gpt-4.1 wrote a "✅ Loaded … 7 notes"
 * line it had made up, then invented a client demo, "half the test cycle", a Slack bot and React dashboards, and on a free
 * question had no true fact about her at all. The reviewed facts only reached a model that ran a tool — so they now sit in
 * the context, like the deals did on 7 Oct. STACK lines: not in the CV bank (its rule: no new sentence), verified from each
 * repo's code on 15 Oct 2026 — cto-aipa src/*.ts (llm-resilience.ts chain, concierge.ts Resend webhook); EspaLuzWhatsApp
 * espaluz_rag.py + config/migrations/001_espaluz_embeddings.sql (pgvector), espaluz_bridge.py (Twilio), espaluz_memory.py
 * (LangChain); VibeJobHunterAIPA_AIMCF src/api/app.py (FastAPI), src/autonomous/orchestrator.py (HubSpot); aideazz/
 * package.json (React 18 + TypeScript + Vite + Tailwind, 86 .tsx), atuona/ and aideazz-ops-dashboard/ package.json (React).
 * Career ES: the 2011–2018 line is skill §0b's; the other two translate CV-bank summary s-cofounder-and-board and
 * s-products-end-to-end, numbers checked.
 */
const STACK_BY_PRODUCT = [
  ['CTO AIPA (my AI technical agent): TypeScript on Node.js; a Telegram bot; Trello and HubSpot REST APIs; Resend email webhooks; a five-provider model chain (Claude, OpenAI, Gemini, Groq, Grok) that fails over automatically.',
    'CTO AIPA (mi agente técnico de IA): TypeScript sobre Node.js; un bot de Telegram; APIs REST de Trello y HubSpot; webhooks de correo de Resend; una cadena de cinco proveedores de modelos (Claude, OpenAI, Gemini, Groq, Grok) que cambia de proveedor automáticamente.'],
  ['EspaLuz (bilingual AI Spanish tutor): Python; PostgreSQL with pgvector for each family\'s conversation memory (RAG); LangChain memory; WhatsApp through Twilio webhooks, plus a Telegram twin; Whisper for voice notes.',
    'EspaLuz (tutora bilingüe de español con IA): Python; PostgreSQL con pgvector para la memoria de conversación de cada familia (RAG); memoria con LangChain; WhatsApp mediante webhooks de Twilio, más un gemelo en Telegram; Whisper para las notas de voz.'],
  ['VibeJob Hunter (job-search sourcing and screening pipeline): Python with FastAPI; writes to HubSpot through its REST API.',
    'VibeJob Hunter (pipeline de búsqueda y filtrado de empleos): Python con FastAPI; escribe en HubSpot mediante su API REST.'],
  ['Front ends: aideazz.xyz is React + TypeScript (Vite, Tailwind); the Atuona gallery and my ops dashboard are React too.',
    'Front ends: aideazz.xyz está hecho en React + TypeScript (Vite, Tailwind); la galería de Atuona y mi panel de operaciones también son React.'],
  ['How I build: AI agents (Cursor, Claude Code) do much of the implementation; I own the requirements, the architecture, the tests a change must pass, deployment and production decisions.',
    'Cómo construyo: agentes de IA (Cursor, Claude Code) hacen gran parte de la implementación; yo decido los requisitos, la arquitectura, las pruebas que debe pasar un cambio, el despliegue y las decisiones en producción.'],
];
const CAREER_ES = [
  'De 2011 a 2018 fui Deputy CEO de Gobierno Corporativo y Directora Jurídica (CLO) de un operador regional de gobierno electrónico de ~60 personas: dirigí el proceso del consejo y el área jurídica del paso de los servicios públicos a formato electrónico.',
  'En 2024–2025 fui Operational Co-Founder de OmniBazaar, un marketplace de comercio electrónico descentralizado, donde lideré la planificación estratégica y su estructura operativa.',
  'Desde 2025 soy responsable de punta a punta de los productos de IA de AIdeazz AI Lab, que fundé: decido qué se construye y en qué orden, escribo los requisitos, decido las pruebas que debe pasar un cambio, lo lanzo y mido el resultado en producción. Agentes de IA especializados hacen gran parte de la implementación; las decisiones de producto, la aceptación y el resultado son míos.',
];
const NEVER_INVENT = '# NEVER invent: clients, users, demos, dashboards, Slack bots, onboarding agents, "twice as fast", "half the time", or any number not printed here.'
  + ' If nothing here fits (a tool, a stack, a result she does not have), SAY SO and give the closest true fact: "I don\'t have a verified example of X — the closest is …" / "No tengo un ejemplo verificado de X; lo más cercano es …".';

function proofSheet(interviewDeals) {
  let bank = {};
  try { bank = loadBank(); } catch { /* the examples block reports it */ }
  const out = [
    '# ✅ ELENA\'S VERIFIED FACTS — the ONLY source for anything you say about her experience, products, stack or background:',
    '# mock answers, LIVE answers and free questions, in English or Spanish. Refreshed every 30 min (cto-aipa hs-deal-prep.cjs --digest).',
    '# Copy these WORD FOR WORD (Spanish: copy the Spanish line — never translate a fact yourself).',
    NEVER_INVENT,
    '',
    '===== HER CAREER AND WORK (EN — reviewed CV lines):',
    ...(bank.summary || []).map((s) => `• ${plain(s.text)}`),
    '',
    '===== SU TRAYECTORIA (ES — copia exacta):',
    ...CAREER_ES.map((s) => `• ${s}`),
    '',
    '===== HER PRODUCTS (live):',
    ...(bank.live || []).map((l) => `• ${plain(l.text)}`),
    '',
    '===== HER STACK (reviewed CV line, word for word):',
    plain(bank.tools || ''),
    '',
    '===== WHICH PRODUCT RUNS ON WHAT (verified from the code, 15 Oct 2026) / QUÉ USA CADA PRODUCTO:',
    ...STACK_BY_PRODUCT.flatMap(([en, es]) => [`• ${en}`, `  ES: ${es}`]),
    ...verifiedExampleLines(),
  ];
  if (interviewDeals.length) {
    out.push('', '===== 🎤 INTERVIEW DEALS (a 🔎 deep-dive exists) — for "prep me for <company>": your FIRST line is this deal\'s ✅ Loaded line copied exactly; the mock questions are THESE, in this order:');
    for (const d of interviewDeals) {
      out.push(`### ${d.title}`, d.proof, ...d.qs.map((q, i) => `${i + 1}. ${q}`));
    }
  }
  out.push('', NEVER_INVENT);
  return `${out.join('\n')}\n`;
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
  // THIS COMPANY'S QUESTIONS (14 Oct 2026, Pitz): the 🔎 deep-dive lists what this company is likely to ask, but gpt-4.1
  // kept asking role-generic questions while that list sat inside a long note. The verified examples, printed as their
  // own block near the end, ARE followed — so the company's questions get the same treatment.
  const companyQs = likelyQuestions(notes);
  if (companyQs.length) {
    console.log("\n===== 🎤 THIS COMPANY'S LIKELY QUESTIONS (from the 🔎 deep-dive) — the CORE mock questions: ask THESE, in this order:");
    companyQs.forEach((q, i) => console.log(`${i + 1}. ${q}`));
  }
  printVerifiedExamples();
  // READ-PROOF (11 Oct 2026, Elena: "I just need a proof" that the coach read the full true deal). The LAST line of the
  // output, so it only reaches a model that received everything above it. It names what she can check in HubSpot herself:
  // the deal's note count and the first words of its newest note (the top of the Notes tab).
  console.log(`\n===== READ-PROOF — copy into your FIRST line: ${readProof(deal.properties.dealname, notes, cut)}`);
})().catch((e) => {
  console.error(`hs-deal-prep failed: ${e.message}`);
  process.exit(1);
});
