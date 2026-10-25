#!/usr/bin/env node
/**
 * hs-study-pack.cjs — a company's case task and Elena's submitted deliverables, kept as notes ON THE HUBSPOT DEAL,
 * and loaded into OpenClaw as the one active study pack (23 Oct 2026).
 *
 * Why: for Pitz (Senior PM, AI Agents) the coaching sheets were hand-built in a Claude Code session, and OpenClaw
 * explained her own deliverables from memory with 8 errors ("users don't return", "WhatsApp changes fast"). Elena:
 * the menu must truly work for ANY company — interviews, then a task, then defending deliverables in person — with
 * the HubSpot deal as the source of truth that VJH, CTO AIPA and OpenClaw all read. So:
 *   - the original file is uploaded to HubSpot and its text is split into blocks by CODE (quotes cannot be invented);
 *   - plain words, likely questions and answers are written by Claude from that company's material only, then every
 *     number in them is checked against the sources; an unbacked number is retried once, then marked ⚠️ [check];
 *   - then every coaching sentence is AUDITED against the source TEXT only (25 Oct: 20 of 46 Pitz answers added
 *     reasons her document never gave): rewritten once from the sources, re-checked, and marked ⚠️ if still unsupported;
 *   - the pack is a 🎓 STUDY PACK note on the deal; OpenClaw's sheet (workspace/pack*) is only a copy of those notes,
 *     rebuilt every 30 min by --refresh, which also unloads a pack whose deal is won/lost or 30 days old.
 *   - LEARNING (25 Oct): fact-check flags are kept per company; openclaw-fallback-alert.cjs --propose-rules turns a
 *     repeated mistake TYPE into a proposed rule; Elena approves it ("/rules approve R1") and it joins the RULES of
 *     every future pack (private/learned-rules.json). Nothing becomes a rule without her yes.
 *
 *   --add      --company=X [--role=Y | --deal=ID] --kind=task|deliverables --file=PATH   (her caption decides kind)
 *   --import   --company=X  --deal=ID --kind=task|deliverables --sheet=PATH [--title=T]   (a ready sheet, no model)
 *   --activate --company=X [--role=Y | --deal=ID]     load that deal's pack into OpenClaw
 *   --deactivate                                       unload ("done with <company>")
 *   --list | --refresh
 *   --rules [--approve=R1 | --reject=R1 | --forget=L1]  proposed and learned rules
 *   --auto     (cron hourly) build packs from case-task / deliverable attachments on hiring-deal emails (25 Oct)
 *   --background  (with --add) answer at once, build in the background, message her when it is ready
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const { hubspotKey, hubspotBase, envValue } = require('./hs-env.cjs');

const HOME = process.env.HOME || '/home/ubuntu';
const WS = process.env.STUDY_PACK_WS || path.join(HOME, '.openclaw', 'workspace');
const PRIV = process.env.STUDY_PACK_PRIVATE || path.join(HOME, '.openclaw', 'private');
const PY = process.env.STUDY_PACK_PY || path.join(HOME, 'VibeJobHunterAIPA_AIMCF', 'venv', 'bin', 'python');
const ACTIVE = path.join(PRIV, 'active-pack.json');
const REGISTRY = path.join(PRIV, 'study-packs.json');
const PROPOSALS = path.join(PRIV, 'rule-proposals.json');   // written by openclaw-fallback-alert.cjs --propose-rules
const LEARNED = path.join(PRIV, 'learned-rules.json');      // only what Elena approved
const MODEL = envValue('STUDY_PACK_MODEL') || 'claude-opus-5-5';   // 23 Oct: the strongest model while the $100 promo credit (expires 8 Nov 2026) lasts
const PACK_FILES = ['pack', 'pack2', 'pack3', 'pack4']; // each ≤ SHEET_MAX (OpenClaw bootstrapMaxChars is 40,000)
const SHEET_MAX = 38000;
const NOTE_MAX = 60000;                              // HubSpot note body limit is 65,536
const MARK = '🎓 STUDY PACK';
const MAX_AGE_DAYS = 30;

const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3).trim();
const flag = (k) => process.argv.includes(`--${k}`);
// Every line Elena reads ends with a fresh proof code (23 Oct 2026): gpt-4.1 twice wrote "✅ Pitz study pack loaded"
// without running this script. A reply must copy the script's line, so a reply with no [proof …] did not run it —
// the same READ-PROOF idea that made the mock interview reliable (hs-deal-prep.cjs, 15 Oct).
const PROOF = `[proof ${require('crypto').randomBytes(3).toString('hex')}]`;
const log = (...a) => console.log(...a.map((x, i) => (i === a.length - 1 && typeof x === 'string' && /^[✅⏳⚠🎓📚]|^No /.test(x) ? `${x} ${PROOF}` : x)));

// ───────────────────────────── HubSpot ─────────────────────────────
async function hs(method, urlPath, body) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${hubspotBase()}${urlPath}`, {
      method,
      headers: { Authorization: `Bearer ${hubspotKey()}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 429 && attempt < 4) { await new Promise((s) => setTimeout(s, 1500 * (attempt + 1))); continue; }
    const text = await r.text();
    if (!r.ok) throw new Error(`HubSpot ${method} ${urlPath} → ${r.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : {};
  }
}

/** The deal: --deal, else the company's open hiring deals (newest first), narrowed by --role words. */
async function findDeal(company, role, dealId) {
  if (dealId) {
    const d = await hs('GET', `/crm/v3/objects/deals/${dealId}?properties=dealname,dealstage`);
    return { id: d.id, name: d.properties.dealname, stage: d.properties.dealstage, others: [] };
  }
  const res = await hs('POST', '/crm/v3/objects/deals/search', {
    filterGroups: [{ filters: [{ propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: `*${company}*` }] }],
    properties: ['dealname', 'dealstage'], sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }], limit: 50,
  });
  const tail = ` @ ${company}`.toLowerCase();
  let open = (res.results || []).filter((d) => {
    const n = (d.properties.dealname || '').trim().toLowerCase();
    return n.startsWith('[hiring') && n.endsWith(tail) && !['closedwon', 'closedlost'].includes(d.properties.dealstage);
  });
  if (!open.length) return null;
  const words = (role || '').toLowerCase().split(/\W+/).filter((w) => w.length > 1);
  if (words.length) {
    const hits = (d) => words.filter((w) => d.properties.dealname.toLowerCase().includes(w)).length;
    open = [...open].sort((a, b) => hits(b) - hits(a));
  }
  const [hit, ...rest] = open;
  return { id: hit.id, name: hit.properties.dealname, stage: hit.properties.dealstage, others: rest.map((d) => d.properties.dealname) };
}

async function notesOf(dealId) {
  const assoc = await hs('GET', `/crm/v4/objects/deals/${dealId}/associations/notes`);
  const ids = (assoc.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const b = await hs('POST', '/crm/v3/objects/notes/batch/read', {
      properties: ['hs_note_body', 'hs_timestamp'], inputs: ids.slice(i, i + 100).map((id) => ({ id: String(id) })),
    });
    out.push(...(b.results || []));
  }
  return out.sort((a, b) => String(a.properties.hs_timestamp).localeCompare(String(b.properties.hs_timestamp)));
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const htmlToText = (h) => String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

async function addNote(dealId, title, text, fileId) {
  const parts = [];
  for (let i = 0; i < text.length; i += NOTE_MAX) parts.push(text.slice(i, i + NOTE_MAX));
  for (let i = 0; i < parts.length; i++) {
    const head = `${title}${parts.length > 1 ? ` · part ${i + 1}/${parts.length}` : ''}`;
    const body = `<p><strong>${esc(head)}</strong></p><p>${esc(parts[i]).replace(/\n/g, '<br>')}</p>`;
    await hs('POST', '/crm/v3/objects/notes', {
      properties: { hs_note_body: body, hs_timestamp: new Date().toISOString(), ...(fileId && i === 0 ? { hs_attachment_ids: String(fileId) } : {}) },
      associations: [{ to: { id: String(dealId) }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }] }],
    });
  }
  return parts.length;
}

// ───────────────────────────── reading the file ─────────────────────────────
const PY_READ = `
import json,sys,os
p=sys.argv[1]; ext=os.path.splitext(p)[1].lower(); out={"pages":[],"landscape":0,"paged":True}
if ext==".pdf":
    import PyPDF2
    r=PyPDF2.PdfReader(p)
    for pg in r.pages:
        out["pages"].append(pg.extract_text() or "")
        w,h=float(pg.mediabox.width),float(pg.mediabox.height)
        out["landscape"]+= 1 if w>h else 0
elif ext==".docx":
    out["paged"]=False
    import docx
    d=docx.Document(p)
    out["pages"].append(chr(10)+chr(10).join(x.text for x in d.paragraphs)+chr(10))
else:
    out["pages"].append(open(p,encoding="utf8",errors="replace").read())
print(json.dumps(out))
`;

function readFile(file) {
  const raw = execFileSync(PY, ['-I', '-B', '-W', 'ignore', '-c', PY_READ, file], { maxBuffer: 64 * 1024 * 1024 }).toString();
  return JSON.parse(raw);
}

const clean = (s) => s.replace(/\s+/g, ' ').trim();

/** Paragraphs from wrapped PDF/Word lines: a short line that ends a sentence, or a blank line, closes a paragraph. */
function paragraphs(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const long = lines.filter((l) => l.length > 40).map((l) => l.length).sort((a, b) => a - b);
  const typical = long.length ? long[Math.floor(long.length * 0.75)] : 80;
  const paras = [];
  let cur = [];
  const close = () => { if (cur.length) { paras.push(clean(cur.join(' '))); cur = []; } };
  for (const l of lines) {
    if (!l) { close(); continue; }
    cur.push(l);
    const shortLine = l.length < typical * 0.7;
    if (shortLine && /[.:?!)"”»]$/.test(l)) close();
    else if (shortLine && l.length < 70 && !/[,;]$/.test(l) && cur.length === 1) close();   // a heading line
  }
  close();
  // Headings and fragments join the paragraph after them; very long paragraphs split at a sentence end.
  // A piece that does not end a sentence (a heading, or a table row the PDF reader cut mid-cell: "fix the undecided —
  // cases.Deep link…" on 23 Oct) joins the next piece, up to a readable length.
  const merged = [];
  for (const p of paras) {
    const last = merged[merged.length - 1];
    if (last !== undefined && !/[.?!:"”)]$/.test(last) && last.length + p.length < 1200) merged[merged.length - 1] = `${last} ${p}`;
    else merged.push(p);
  }
  const out = [];
  for (const p of merged) {
    if (p.length <= 1400) { out.push(p); continue; }
    let rest = p;
    while (rest.length > 1400) {
      const cut = rest.lastIndexOf('. ', 1200);
      const at = cut > 400 ? cut + 1 : 1200;
      out.push(rest.slice(0, at).trim()); rest = rest.slice(at).trim();
    }
    if (rest) out.push(rest);
  }
  return out.filter((p) => p.length > 2);
}

function toBlocks(doc, kind) {
  const pages = doc.pages.map((p) => p || '');
  const words = pages.reduce((n, p) => n + p.split(/\s+/).length, 0);
  const slides = kind === 'deliverables' && pages.length > 1 && (doc.landscape > pages.length / 2 || words / pages.length < 220);
  if (slides) {
    const kept = pages.map((p, i) => [clean(p), i + 1]).filter(([p]) => p);
    return { prefix: 'S', unit: 'slide', blocks: kept.map(([p]) => p), where: kept.map(([, n]) => `slide ${n} of ${pages.length}`) };
  }
  const blocks = paragraphs(pages.join('\n\n'));
  return { prefix: kind === 'task' ? 'P' : 'D', unit: 'paragraph', blocks, where: locate(blocks, pages, doc.paged) };
}

/**
 * 📍 WHERE each block sits in the REAL file, so Elena can check it with her finger (24 Oct 2026: "make OpenClaw write
 * where to find it in the real deliverable — I verify it really sits there"). PDF: page found by matching the block's
 * own words (letters and digits only, so line breaks and table spacing do not matter) + its order on that page.
 * Word has no pages: the paragraph number in the file.
 */
function locate(blocks, pages, paged) {
  const key = (s) => s.toLowerCase().replace(/[^a-z0-9áéíóúñüç]/g, '');
  const pk = pages.map(key);
  const onPage = {};
  return blocks.map((b, i) => {
    if (paged === false) return `paragraph ${i + 1} of ${blocks.length} in the file (a Word file has no pages)`;
    const k = key(b);
    let page = null;
    for (const size of [60, 40, 24]) {
      for (let s = 0; s < Math.max(1, k.length - size) && !page; s += 15) {
        const probe = k.slice(s, s + size);
        const hit = pk.findIndex((p) => probe && p.includes(probe));
        if (hit >= 0) page = hit + 1;
      }
      if (page) break;
    }
    if (!page) return 'page not found automatically — find it by its first words';
    onPage[page] = (onPage[page] || 0) + 1;
    return `page ${page} of ${pages.length} · paragraph ${onPage[page]} on that page`;
  });
}

// ───────────────────────────── writing the coaching (grounded) ─────────────────────────────
const NUM_RE = /\d[\d.,]*\s?%?/g;
const normNum = (s) => s.replace(/\s/g, '').replace(/[.,]$/, '').replace(/,/g, '');
function numbersIn(text) { return new Set((text.match(NUM_RE) || []).map(normNum)); }
function unbacked(field, allowed) {
  return (field.match(NUM_RE) || []).map(normNum).filter((n) => n && !allowed.has(n) && !allowed.has(n.replace(/%$/, '')));
}

/**
 * Opus first; on ANY failure (the $100 promo credit ends 8 Nov 2026, a 529, a timeout) the fleet's own waterfall
 * llm-resilience 'quality' (Claude → OpenAI → Gemini → Groq → Grok) takes over — the same chain CTO AIPA uses, not a
 * second one. The number check in coach() applies to whichever model answered. `usedFallback` is reported to her.
 */
let usedFallback = '';
async function claude(prompt, maxTokens = 8000) {
  const key = envValue('ANTHROPIC_API_KEY');
  const free = envValue('MODEL_TIER') === 'free';   // scripts/model-tier.cjs: no Claude credit this month → free first
  try {
    if (free) throw new Error('MODEL_TIER=free — Gemini/Groq first');
    if (!key) throw new Error('ANTHROPIC_API_KEY missing');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`Claude ${r.status}: ${JSON.stringify(j).slice(0, 160)}`);
    return (j.content || []).map((c) => c.text || '').join('');
  } catch (e) {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    const { completeWithProfileDetailed } = require('../dist/llm-resilience.js');
    const r = await completeWithProfileDetailed(free ? 'bulk' : 'quality', 'You follow the instructions exactly and return only what is asked.', prompt, maxTokens, 'study-pack');
    usedFallback = `${MODEL} failed (${String(e.message).slice(0, 90)}) → the fleet waterfall answered${r.provider ? ` with ${r.provider}` : ''}`;
    log(`fallback: ${usedFallback}`);
    return r.text;
  }
}

function parseJsonArray(text) {
  const s = text.indexOf('['), e = text.lastIndexOf(']');
  if (s < 0 || e < s) throw new Error('model returned no JSON array');
  return JSON.parse(text.slice(s, e + 1));
}

const FIELDS = {
  task: { simple: 'IN SIMPLE WORDS', want: 'WHAT THEY WANT HERE' },
  deliverables: { simple: 'IN SIMPLE WORDS', ask: 'THEY MAY ASK', say: 'YOU SAY' },
};

async function coach(kind, company, ids, blocks, sources) {
  const allowed = numbersIn(sources.join('\n'));
  const fields = Object.keys(FIELDS[kind]);
  const role = kind === 'task'
    ? `These blocks are the case task ${company} sent to Elena. For each block write:
"simple": what it says, in plain everyday English, 1–3 sentences, for a smart non-native speaker;
"want": what the company is really testing or expects in this block, 1–2 sentences.`
    : `These blocks are Elena's OWN submitted deliverable for ${company} (she will present and defend it in person). For each block write:
"simple": what she wrote here, in plain everyday English, 1–3 sentences, addressed to her ("you…");
"ask": the single most likely tough question an interviewer at ${company} would ask about this block;
"say": a strong answer IN HER VOICE (first person), 2–3 sentences, using only facts from her deliverable and the task.`;
  const out = {};
  for (let i = 0; i < blocks.length; i += 10) {
    const batch = blocks.slice(i, i + 10).map((t, k) => ({ id: ids[i + k], text: t }));
    let feedback = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt = `${role}

HARD RULES: use ONLY facts in the SOURCES below. Never invent a number, name, feature, date or claim. Copy numbers exactly
as written in the sources (no rounding, no new arithmetic, no "almost", "most", "nobody" when the source gives a number).
If the sources do not say something, write "the document doesn't say". Return ONLY a JSON array:
[{"id": "...", ${fields.map((f) => `"${f}": "..."`).join(', ')}}] — one object per block, same ids, nothing else.
${feedback}
SOURCES:
${sources.map((s, n) => `--- source ${n + 1} ---\n${s.slice(0, 60000)}`).join('\n')}

BLOCKS:
${JSON.stringify(batch)}`;
      const arr = parseJsonArray(await claude(prompt));
      const bad = [];
      for (const o of arr) {
        if (!batch.find((b) => b.id === o.id)) continue;
        const nums = fields.flatMap((f) => unbacked(String(o[f] || ''), allowed));
        if (nums.length) bad.push(`${o.id}: ${[...new Set(nums)].join(', ')}`);
        out[o.id] = o;
      }
      if (!bad.length) break;
      feedback = `\nYOUR LAST ANSWER USED NUMBERS THAT ARE NOT IN THE SOURCES — remove or correct them: ${bad.join(' · ')}\n`;
      if (attempt === 1) {
        for (const o of Object.values(out)) for (const f of fields) {
          const nums = unbacked(String(o[f] || ''), allowed);
          if (nums.length) { let v = String(o[f]); for (const n of nums) v = v.split(n).join('[check]'); o[f] = `⚠️ ${v}`; }
        }
      }
    }
  }
  return out;
}

/**
 * 25 Oct 2026: the Pitz audit found 20 of 46 coaching answers adding reasons her document never gave ("waiting would
 * hold Mexico hostage", "the CEO decides") — the number check cannot see a reason. Every field is judged against the
 * SOURCES only (block TEXT, never other coaching notes); an unsupported field is rewritten once, the rewrite is judged
 * again, and whatever still fails is marked ⚠️ so she checks it. A batch the judge cannot read is reported, never passed.
 */
async function auditCoaching(kind, coached, ids, blocks, sources) {
  const fields = Object.keys(FIELDS[kind]);
  const allowed = numbersIn(sources.join('\n'));
  const res = { fixed: 0, marked: 0, unaudited: 0 };
  const judgeBatch = async (items, rewrite) => {
    const prompt = `Each ITEM is one block of a document (text) plus coaching notes about it (${fields.join(', ')}).
The SOURCES below are the ONLY truth. Find every note field that states a fact, number, reason, goal, label or link between
things that the SOURCES do not state or directly support. A faithful paraphrase is supported; a suggested answer may
rephrase but must not add facts or reasons.${rewrite ? ' For each one, also write "fixed": the same field, same purpose, using ONLY what the SOURCES say.' : ''}
Fields that are fine: leave out. Use single quotes inside strings. Return ONLY a JSON array (empty if all supported):
[{"id":"…","field":"${fields.join('|')}","problem":"…"${rewrite ? ',"fixed":"…"' : ''}}]

SOURCES:
${sources.map((s, n) => `--- source ${n + 1} ---\n${s.slice(0, 60000)}`).join('\n')}

ITEMS:
${JSON.stringify(items)}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      try { return parseJsonArray(await claude(prompt, 6000)).filter((f) => f && ids.includes(f.id) && fields.includes(f.field)); }
      catch (e) { log(`audit: judge unreadable (${String(e.message).slice(0, 80)})${attempt ? ' — batch reported unaudited' : ', retrying'}`); }
    }
    return null;
  };
  const item = (id) => ({ id, text: blocks[ids.indexOf(id)], ...Object.fromEntries(fields.map((f) => [f, (coached[id] || {})[f] || ''])) });
  for (let i = 0; i < ids.length; i += 10) {
    const batchIds = ids.slice(i, i + 10).filter((id) => coached[id]);
    const found = await judgeBatch(batchIds.map(item), true);
    if (!found) { res.unaudited += batchIds.length; continue; }
    const changed = new Set();
    for (const f of found) {
      const fix = String(f.fixed || '').trim();
      if (fix && !unbacked(fix, allowed).length) { coached[f.id][f.field] = fix; changed.add(f.id); }
      else { coached[f.id][f.field] = `⚠️ [check: ${String(f.problem).slice(0, 120)}] ${coached[f.id][f.field]}`; res.marked++; }
    }
    if (!changed.size) continue;
    const still = await judgeBatch([...changed].map(item), false);   // the rewrite is not trusted until judged again
    if (!still) { res.unaudited += changed.size; continue; }
    for (const f of still) {
      if (String(coached[f.id][f.field]).startsWith('⚠️')) continue;
      coached[f.id][f.field] = `⚠️ [check: ${String(f.problem).slice(0, 120)}] ${coached[f.id][f.field]}`; res.marked++;
    }
    res.fixed += found.filter((f) => changed.has(f.id)).length - still.length;
  }
  return res;
}

function renderBlocks(kind, prefix, blocks, notesById, unit, where = [], fileName = '') {
  const labels = FIELDS[kind];
  return blocks.map((t, i) => {
    const id = `${prefix}${i + 1}`;
    const n = notesById[id] || {};
    const lines = [`${id} — ${unit} ${i + 1} of ${blocks.length}`,
      `📍 WHERE: ${where[i] || `${unit} ${i + 1}`} of ${fileName || 'the file'}`, `TEXT: "${t}"`];
    for (const [f, label] of Object.entries(labels)) lines.push(`${label}: ${n[f] || '⚠️ not generated — read TEXT only'}`);
    return lines.join('\n');
  }).join('\n\n');
}

// ───────────────────────────── the OpenClaw sheet ─────────────────────────────
const RULES = (company, dealName) => `# 🎓 ACTIVE STUDY PACK — ${company} (copy of the ${MARK} notes on the HubSpot deal "${dealName}"; refreshed every 30 min)
# HOW TO COACH (Elena's rule: her words set the format):
# - CROSS-REFERENCES (24 Oct: "D9 says … source tag" was false): name another block ONLY by copying THAT block's own
#   📍 WHERE line, and quote ONLY words that appear in THAT block's TEXT. Never cite a block, page or quote from memory.
#   Unsure which block holds it? Say "Ask me for D9 and I'll show it" — never guess.
# - QUOTES (25 Oct: P18 and P20 quoted with words silently dropped): a quote is the block's words EXACTLY, start to
#   end, or shorter with "…" where you cut. Never end a cut quote with a full stop as if it were complete.
# - LINKS BETWEEN BLOCKS (25 Oct: "D18 answers P20", "the biggest connection"): say block X answers block Y ONLY if
#   X's own TEXT names Y's issue. Otherwise start with "My opinion:". Never rank links ("biggest", "most important").
# - NO EMBELLISHMENT (24 Oct: "completely different experience", "wholesale parts"): in your own words add no new
#   adjective, example, number or reason the TEXT lacks. Want to add a view? Start it with "My opinion:".
# - LISTS (25 Oct: "explain each input" got an invented "Why / Protects against" for every item): give a purpose
#   ONLY where the document states one, quoting where it says it. Otherwise write "Your document doesn't say why" and,
#   if useful, one line "My opinion: …". A named concept she did not write (e.g. prompt injection) goes on an
#   "Outside your document:" line. An example you make up is labelled "For example (not in your document):".
# - OUTSIDE KNOWLEDGE (24 Oct: app-store review, "greasy hands", accounting): allowed ONLY on its own line starting
#   "Outside your document:" — never mixed into what her document says, and never as a reason she wrote.
# - STORIES / EXAMPLES (24 Oct): when she asks for a story or analogy, open with "Illustrative story — the details are
#   examples, not from your document:" and never state as TODAY's facts what the document does not say (e.g. today NO ONE
#   can get a cart — writes are closed; login matters only once writes open).
# - NATURAL DIALOGUE FIRST: if her message is a question or a remark in her own words (not "next", an id, or "quiz me"),
#   answer THAT directly, in plain words, from this pack — then offer to continue. Never answer a question with the next block.
# - "walk me through the task" → P blocks · "walk me through my deliverables" → D blocks, then S (slides) · "paragraph by
#   paragraph" / "next" → ONE block per message: "<id> — …", the 📍 WHERE line copied exactly (she checks it in the real
#   file), TEXT quoted exactly, then the other fields of that block, then
#   ask "Next, or practise this one?". Never summarise several blocks in one message. "P12" / "D7" / "slide 3" → jump.
# - "quiz me" / "/quiz" / "D26, quiz me" → send ONLY "🎯 <id> — <THEY MAY ASK>" + "Answer by voice or text". NEVER show
#   YOU SAY or TEXT before she answers (it gives the answer away) and never grade an answer she has not given. Her NEXT
#   message is her answer: then what she got right, what is missing compared with YOU SAY, and one better sentence.
# - If she sends a file whose name is listed under FILES below, coach from THIS pack — never from your own reading of it.
# - TRUTH: only this pack. If it does not say it: "The document doesn't say." A field starting ⚠️ holds an unchecked
#   number — tell her to check it. Anything else starts with "My opinion:".
${learnedRulesText()}`;

/** Rules Elena approved from OpenClaw's own repeated mistakes — they apply to EVERY company's pack. */
function learnedRulesText() {
  const learned = readJson(LEARNED, []);
  if (!learned.length) return '';
  return `# - LEARNED FROM YOUR OWN MISTAKES (Elena approved each one; they are as binding as the rules above):\n${learned
    .map((r) => `#   ${r.id} (${String(r.approvedAt).slice(0, 10)}): ${r.rule}`).join('\n')}\n`;
}

function writeSheet(company, dealName, sections) {
  const full = `${RULES(company, dealName)}\n${sections.join('\n\n')}\n`;
  const parts = [];
  let rest = full;
  while (rest.length && parts.length < PACK_FILES.length) {
    if (rest.length <= SHEET_MAX) { parts.push(rest); rest = ''; break; }
    const cut = rest.lastIndexOf('\n\n', SHEET_MAX);
    const at = cut > SHEET_MAX / 2 ? cut : SHEET_MAX;
    parts.push(rest.slice(0, at)); rest = rest.slice(at).replace(/^\n+/, '');
  }
  if (rest.length) parts[parts.length - 1] += `\n\n# ⚠️ CUT: this pack is longer than ${PACK_FILES.length} sheets; the end is missing — tell Elena.`;
  PACK_FILES.forEach((name, i) => {
    fs.mkdirSync(path.join(WS, name), { recursive: true });
    const body = parts[i] ? `${i ? `# 🎓 ${company} study pack, part ${i + 1}/${parts.length} — same rules as part 1\n` : ''}${parts[i]}` : '# (empty)\n';
    const file = path.join(WS, name, 'TOOLS.md');
    fs.writeFileSync(`${file}.${process.pid}.tmp`, body, { mode: 0o600 });
    fs.renameSync(`${file}.${process.pid}.tmp`, file);
  });
  return { chars: full.length, files: parts.length };
}

function emptySheet(why) {
  PACK_FILES.forEach((name, i) => {
    fs.mkdirSync(path.join(WS, name), { recursive: true });
    fs.writeFileSync(path.join(WS, name, 'TOOLS.md'),
      i ? '# (empty)\n' : `# 🎓 NO ACTIVE STUDY PACK (${why}). Elena loads one with "pack <company>"; "packs" lists them.\n`, { mode: 0o600 });
  });
}

const readJson = (f, dflt) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return dflt; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2), { mode: 0o600 }); };

/** Rebuild the OpenClaw sheet from the deal's 🎓 notes — HubSpot stays the source of truth. */
async function activate(deal, company) {
  const notes = (await notesOf(deal.id)).map((n) => htmlToText(n.properties.hs_note_body)).filter((t) => t.includes(MARK));
  if (!notes.length) return { ok: false, why: `no ${MARK} notes on "${deal.name}"` };
  // Keep the newest note of each title (task / deliverables file), joined across its parts.
  const byTitle = new Map();
  for (const t of notes) {
    const head = t.split('\n')[0].replace(/ · part \d+\/\d+$/, '').trim();
    const body = t.split('\n').slice(1).join('\n').trim();
    const partNo = Number((t.split('\n')[0].match(/part (\d+)\//) || [])[1] || 1);
    if (partNo === 1) byTitle.set(head, [body]); else (byTitle.get(head) || byTitle.set(head, []).get(head)).push(body);
  }
  // Stable order by title (TASK, then MY DELIVERABLES part A, part B…): a re-imported part must not move to the end.
  const ordered = new Map([...byTitle.entries()].sort(([a], [b]) => a.localeCompare(b)));
  byTitle.clear(); for (const [k, v] of ordered) byTitle.set(k, v);
  // What the fact-checker caught (openclaw-fallback-alert.cjs --factcheck, 24 Oct) sits first, so it is not repeated.
  // 25 Oct: per company — the next company's prep must not carry Pitz's traps (the lessons travel as learned rules).
  const caught = readJson(path.join(PRIV, 'factcheck-flags.json'), [])
    .filter((f) => String(f.company || '').toLowerCase() === company.toLowerCase()).slice(-30);
  const flagSection = caught.length
    ? `# ⚠️ FACT-CHECK FLAGS — you said these to Elena and they are NOT in her document. Never repeat them:\n${caught.map((f) => `#   - "${String(f.claim).slice(0, 200)}" — ${String(f.why).slice(0, 200)}${f.source_says ? ` (document: ${String(f.source_says).slice(0, 160)})` : ''}`).join('\n')}\n`
    : '';
  const files = [...byTitle.keys()].map((h) => `#   - ${h.replace(`${MARK} · `, '')}`);
  const sections = [...(flagSection ? [flagSection] : []), `# FILES in this pack:\n${files.join('\n')}`, ...[...byTitle.entries()].map(([h, parts]) => `# ===== ${h}\n${parts.join('\n')}`)];
  const r = writeSheet(company, deal.name, sections);
  // A merged deal gets a NEW id (Pitz, 23 Oct: 4 deals → 66670194056). Keep ONE id everywhere — the registry follows.
  const reg = readJson(REGISTRY, {});
  if (reg[company.toLowerCase()] && reg[company.toLowerCase()].dealId !== deal.id) {
    Object.assign(reg[company.toLowerCase()], { dealId: deal.id, dealName: deal.name }); writeJson(REGISTRY, reg);
  }
  writeJson(ACTIVE, { company, dealId: deal.id, dealName: deal.name, activatedAt: readJson(ACTIVE, {}).dealId === deal.id ? readJson(ACTIVE, {}).activatedAt : new Date().toISOString() });
  return { ok: true, ...r, notes: byTitle.size };
}

function register(company, deal, entry) {
  const reg = readJson(REGISTRY, {});
  const k = company.toLowerCase();
  reg[k] = reg[k] || { company, dealId: deal.id, dealName: deal.name, items: [] };
  reg[k].dealId = deal.id; reg[k].dealName = deal.name;
  reg[k].items.push({ ...entry, at: new Date().toISOString() });
  writeJson(REGISTRY, reg);
}

// ───────────────────────────── notify ─────────────────────────────
function notify(text) {
  try {
    const sess = readJson(path.join(HOME, '.openclaw', 'agents', 'main', 'sessions', 'sessions.json'), {});
    const main = sess['agent:main:main'] || {};
    const channel = main.lastChannel || 'telegram';
    const to = String(main.lastTo || '').replace(/^telegram:/, '');
    if (!to) return log('notify: no target');
    execFileSync('openclaw', ['message', 'send', '--channel', channel, '--target', to, '--message', text], { stdio: 'ignore', timeout: 60000 });
  } catch (e) { log(`notify failed: ${String(e.message).slice(0, 120)}`); }
}

// ───────────────────────────── commands ─────────────────────────────
/** /rules — what OpenClaw proposes to learn from its repeated mistakes, and what Elena already approved. */
async function cmdRules() {
  const props = readJson(PROPOSALS, []);
  const learned = readJson(LEARNED, []);
  const pick = (k) => { const id = arg(k).toUpperCase(); const p = props.find((x) => x.id === id && x.status === 'pending'); if (!p) throw new Error(`no pending rule ${id || '(none given)'} — send /rules to see them`); return p; };
  let done = '';
  if (arg('approve')) {
    const p = pick('approve');
    const id = `L${learned.reduce((m, r) => Math.max(m, Number(String(r.id).slice(1)) || 0), 0) + 1}`;
    learned.push({ id, rule: p.rule, from: p.id, example: p.example, approvedAt: new Date().toISOString() });
    p.status = 'approved'; writeJson(LEARNED, learned); writeJson(PROPOSALS, props);
    done = `✅ ${p.id} approved → learned rule ${id}. It now applies to every company's pack.`;
  } else if (arg('reject')) {
    const p = pick('reject'); p.status = 'rejected'; writeJson(PROPOSALS, props);
    done = `✅ ${p.id} rejected — it will not be proposed again.`;
  } else if (arg('forget')) {
    const id = arg('forget').toUpperCase();
    if (!learned.some((r) => r.id === id)) throw new Error(`no learned rule ${id}`);
    writeJson(LEARNED, learned.filter((r) => r.id !== id));
    done = `✅ Learned rule ${id} removed.`;
  }
  if (done) {
    const a = readJson(ACTIVE, {});
    if (a.dealId) await cmdRefresh().catch(() => {});   // the active pack carries the change now, not in 30 min
    return log(done);
  }
  const pending = props.filter((p) => p.status === 'pending');
  const now = readJson(LEARNED, []);
  log([
    pending.length ? `📚 Proposed rules (from OpenClaw's repeated mistakes):\n${pending.map((p) => `${p.id}: ${p.rule}\n   seen ${p.count}× — e.g. ${p.example}`).join('\n')}\nApprove: /rules approve R1 · Reject: /rules reject R1` : '📚 No proposed rules waiting.',
    now.length ? `Learned (apply to every pack):\n${now.map((r) => `${r.id}: ${r.rule}`).join('\n')}\nRemove one: /rules forget L1` : 'No learned rules yet.',
  ].join('\n\n'));
}

async function cmdAdd() {
  const company = arg('company'), kind = arg('kind'), file = arg('file');
  if (!company || !['task', 'deliverables'].includes(kind) || !file) throw new Error('need --company --kind=task|deliverables --file');
  if (!/^[\w./ -]+$/.test(file) || !fs.existsSync(file)) throw new Error(`file not readable: ${file}`);
  if (flag('background')) {
    const child = spawn(process.execPath, [__filename, ...process.argv.slice(2).filter((a) => a !== '--background'), '--notify'],
      { detached: true, stdio: ['ignore', fs.openSync(path.join(HOME, 'logs', 'study-pack.log'), 'a'), fs.openSync(path.join(HOME, 'logs', 'study-pack.log'), 'a')] });
    child.unref();
    return log(`⏳ Building the ${kind === 'task' ? 'task' : 'deliverables'} study pack for ${company} — I'll message you when it is ready (2–5 min).`);
  }
  const deal = await findDeal(company, arg('role'), arg('deal'));
  if (!deal) throw new Error(`no open hiring deal for "${company}" in HubSpot — stage the job first`);
  const doc = readFile(file);
  const { prefix, unit, blocks, where } = toBlocks(doc, kind);
  if (!blocks.length) throw new Error('no text in the file (a scan?) — send screenshots or a PDF with text');
  const ids = blocks.map((_, i) => `${prefix}${i + 1}`);
  // Sources for grounding: this file + every other pack note on the deal (the task, when coaching deliverables).
  const prior = (await notesOf(deal.id)).map((n) => htmlToText(n.properties.hs_note_body)).filter((t) => t.includes(MARK));
  // Only TEXT lines of earlier notes: their coaching fields are our words, not a source (source-of-truth drift, 25 Oct).
  const sources = [blocks.join('\n'), ...prior.map((t) => t.split('\n').filter((l) => /^TEXT/.test(l)).join('\n')).filter(Boolean)];
  const coached = await coach(kind, company, ids, blocks, sources);
  const audit = await auditCoaching(kind, coached, ids, blocks, sources);
  log(`audit: ${audit.fixed} rewritten, ${audit.marked} marked ⚠️, ${audit.unaudited} unaudited`);
  const warn =Object.values(coached).filter((o) => Object.values(o).some((v) => String(v).startsWith('⚠️'))).length;
  const name = path.basename(file);
  let fileId = arg('file-id');   // --auto: the file is already in HubSpot (the email attachment) — never a second copy
  if (!fileId) {
    try { fileId = (await require('./hs-files.cjs').uploadOutreachFile(path.resolve(file), name)).id; }
    catch (e) { log(`file upload skipped: ${String(e.message).slice(0, 120)}`); }
  }
  const title = `${MARK} · ${kind === 'task' ? 'TASK' : unit === 'slide' ? 'MY SLIDES' : 'MY DOCUMENT'} · ${name}`;
  const parts = await addNote(deal.id, title, renderBlocks(kind, prefix, blocks, coached, unit, where, name), fileId);
  register(company, deal, { kind, file: name, blocks: blocks.length, prefix, warn });
  // A pack built by --auto never pushes out the pack she is studying right now.
  const busy = readJson(ACTIVE, {});
  const keep = flag('auto-built') && busy.dealId && String(busy.dealId) !== String(deal.id);
  const act = keep ? { chars: 0, files: 0 } : await activate(deal, company);
  const msg = (flag('auto-built') ? `📥 Found in HubSpot: ${name} on the email "${arg('found').slice(0, 90)}". ` : '')
    + `✅ ${company} study pack ready: ${blocks.length} ${unit}s (${prefix}1–${prefix}${blocks.length}) from ${name}, saved on the HubSpot deal "${deal.name}"`
    + `${deal.others.length ? ` (the company has ${deal.others.length + 1} open deals)` : ''}. `
    + `🔍 Every coaching answer was checked against your document: ${audit.fixed} rewritten to what it says. `
    + `${warn ? `⚠️ ${warn} block(s) carry something to check (marked ⚠️). ` : ''}`
    + `${audit.unaudited ? `⚠️ ${audit.unaudited} block(s) could NOT be checked — compare their YOU SAY with TEXT. ` : ''}`
    + (keep ? `Your ${busy.company} pack stays loaded — say "pack ${company}" when you want this one.`
      : `Loaded now — say "walk me through ${kind === 'task' ? 'the task' : 'my deliverables'}" or "quiz me".`)
    + (usedFallback ? ` ⚠️ Written by a backup model: ${usedFallback}.` : '');
  log(msg + ` [note parts ${parts}, sheet ${act.chars} chars in ${act.files} file(s)]`);
  if (flag('notify')) notify(msg);
}

/**
 * 25 Oct 2026 (Elena: "the bot is designed to pick all the data from the HubSpot deal!"). The case task arrives as an
 * attachment on the employer's email and her deliverables leave as attachments on her reply — both already sit on the
 * deal (Pitz: Senior-PM-AI-Agents-Case-Candidate.pdf in, her PDF + slides out), yet a pack was built only when she
 * re-sent the file in Telegram. Hourly: emails of the last 14 days with attachments on an open [HIRING…] deal → an
 * incoming case-like file becomes the TASK pack, a file she sent in a case thread becomes MY DOCUMENT / MY SLIDES.
 * A file whose name is already in a 🎓 note title on that deal is skipped (Pitz's hand-checked sheets) — never twice.
 */
const CASE_RE = /case|caso|task|tarea|assignment|challenge|desaf[ií]o|ejercicio|prueba|take.?home|exercise|homework|test/i;
const NOT_WORK = /\b(cv|resume|r[eé]sum[eé]|curr[ií]cul\w*|cover.?letter|carta|nda|offer|oferta|contract|contrato|invite|invoice)\b/i;
const AUTO_MAX = 3;   // builds per run (each is an Opus coaching + audit)

async function cmdAuto() {
  const seenFile = path.join(PRIV, 'auto-seen.json');
  const seen = readJson(seenFile, {});
  const res = await hs('POST', '/crm/v3/objects/emails/search', {
    filterGroups: [{ filters: [
      { propertyName: 'hs_attachment_ids', operator: 'HAS_PROPERTY' },
      { propertyName: 'hs_timestamp', operator: 'GTE', value: String(Date.now() - 14 * 86400000) },
    ] }],
    properties: ['hs_email_subject', 'hs_email_direction', 'hs_attachment_ids', 'hs_timestamp'],
    sorts: [{ propertyName: 'hs_timestamp', direction: 'ASCENDING' }], limit: 100,
  });
  const jobs = [];
  for (const e of res.results || []) {
    const subject = e.properties.hs_email_subject || '';
    const incoming = e.properties.hs_email_direction === 'INCOMING_EMAIL';
    const assoc = await hs('GET', `/crm/v4/objects/emails/${e.id}/associations/deals`);
    for (const a of assoc.results || []) {
      const d = await hs('GET', `/crm/v3/objects/deals/${a.toObjectId}?properties=dealname,dealstage`);
      const dealName = (d.properties || {}).dealname || '';
      if (!/^\[HIRING/i.test(dealName) || ['closedwon', 'closedlost'].includes(d.properties.dealstage) || !dealName.includes(' @ ')) continue;
      const company = dealName.slice(dealName.lastIndexOf(' @ ') + 3).trim();
      const titles = (await notesOf(d.id)).map((n) => htmlToText(n.properties.hs_note_body).split('\n')[0]).filter((t) => t.includes(MARK)).join('\n');
      for (const fid of String(e.properties.hs_attachment_ids).split(';').filter(Boolean)) {
        if ((seen[fid] || {}).done || (seen[fid] || {}).tries >= 3) continue;
        const f = await hs('GET', `/files/v3/files/${fid}`);
        const name = `${f.name}${f.extension ? `.${f.extension}` : ''}`;
        const why = !/\.(pdf|docx)$/i.test(name) ? 'not a PDF/Word file'
          : NOT_WORK.test(name.replace(/[_.-]/g, ' ')) ? 'a CV / letter / contract, not case work'
          : !CASE_RE.test(`${subject} ${name}`) ? 'not a case-task thread'
          : titles.includes(name) ? 'already in a study pack on this deal' : '';
        if (why) { if (why.startsWith('already') || why.startsWith('a CV') || why.startsWith('not a PDF')) seen[fid] = { done: true, skipped: why, name }; continue; }
        jobs.push({ fid, name, subject, company, dealId: d.id, kind: incoming ? 'task' : 'deliverables' });
      }
    }
  }
  // Task before deliverables: her coaching is grounded on the task's TEXT.
  jobs.sort((x, y) => (x.kind === 'task' ? 0 : 1) - (y.kind === 'task' ? 0 : 1));
  if (flag('dry')) {
    console.log(Object.entries(seen).map(([id, s]) => `seen ${s.name}: ${s.skipped || (s.done ? 'built' : `tries ${s.tries}`)}`).join('\n'));
    return log(`auto (dry): ${jobs.length} would be built${jobs.map((j) => `\n  ${j.kind} · ${j.company} · ${j.name}`).join('')}`);
  }
  const dir = path.join(HOME, 'tmp', 'study-pack-auto');
  fs.mkdirSync(dir, { recursive: true });
  let built = 0;
  for (const j of jobs.slice(0, AUTO_MAX)) {
    seen[j.fid] = { ...(seen[j.fid] || {}), tries: ((seen[j.fid] || {}).tries || 0) + 1, name: j.name };
    writeJson(seenFile, seen);
    try {
      const { url } = await hs('GET', `/files/v3/files/${j.fid}/signed-url`);
      const local = path.join(dir, j.name.replace(/[^\w. -]/g, '_'));
      fs.writeFileSync(local, Buffer.from(await (await fetch(url)).arrayBuffer()));
      execFileSync(process.execPath, [__filename, '--add', `--company=${j.company}`, `--deal=${j.dealId}`, `--kind=${j.kind}`,
        `--file=${local}`, `--file-id=${j.fid}`, `--found=${j.subject}`, '--auto-built', '--notify'],
      { stdio: 'inherit', timeout: 20 * 60000 });
      fs.rmSync(local, { force: true });
      seen[j.fid].done = true; built++;
    } catch (e) { log(`auto: ${j.name} for ${j.company} failed (try ${seen[j.fid].tries}/3): ${String(e.message).split('\n')[0].slice(0, 120)}`); }
    writeJson(seenFile, seen);
  }
  writeJson(seenFile, seen);
  log(`auto: ${(res.results || []).length} email(s) with attachments in 14 days · ${jobs.length} new case file(s) · ${built} built${jobs.length > AUTO_MAX ? ` (${jobs.length - AUTO_MAX} next run)` : ''}`);
}

async function cmdImport() {
  const company = arg('company'), kind = arg('kind'), sheet = arg('sheet');
  const deal = await findDeal(company, arg('role'), arg('deal'));
  if (!deal) throw new Error(`no deal for ${company}`);
  const text = fs.readFileSync(sheet, 'utf8');
  const title = `${MARK} · ${arg('title') || (kind === 'task' ? 'TASK' : 'MY DELIVERABLES')}`;
  const parts = await addNote(deal.id, title, text, '');
  register(company, deal, { kind, file: path.basename(sheet), imported: true });
  log(`imported ${sheet} → ${parts} note(s) on ${deal.name}`);
}

async function cmdActivate() {
  const company = arg('company');
  const deal = await findDeal(company, arg('role'), arg('deal') || (readJson(REGISTRY, {})[company.toLowerCase()] || {}).dealId);
  if (!deal) throw new Error(`no deal for ${company}`);
  const r = await activate(deal, company);
  log(r.ok ? `✅ ${company} study pack loaded (${r.notes} file(s), ${r.chars} chars) from "${deal.name}". Say "walk me through my deliverables", "walk me through the task" or "quiz me".`
    : `⚠️ ${r.why}. Send the task or your deliverables with the caption "task for ${company}" / "my deliverables for ${company}".`);
}

function cmdDeactivate(why = 'unloaded by Elena') {
  const a = readJson(ACTIVE, null);
  emptySheet(why);
  try { fs.unlinkSync(ACTIVE); } catch {}
  log(a ? `✅ ${a.company} study pack unloaded (${why}). It stays on the HubSpot deal — "pack ${a.company}" loads it again.` : 'No pack was loaded.');
}

function cmdList() {
  const reg = readJson(REGISTRY, {}), a = readJson(ACTIVE, null);
  const rows = Object.values(reg).map((r) => `• ${r.company}${a && a.dealId === r.dealId ? ' (loaded)' : ''} — ${r.items.map((i) => `${i.kind}: ${i.file}`).join(' · ')}`);
  log(rows.length ? `🎓 Study packs:\n${rows.join('\n')}\nSay "pack <company>" to load one, "unpack" to unload.` : 'No study packs yet.');
}

async function cmdRefresh() {
  const a = readJson(ACTIVE, null);
  if (!a) return log('refresh: no active pack');
  const d = await hs('GET', `/crm/v3/objects/deals/${a.dealId}?properties=dealname,dealstage`);
  const age = (Date.now() - Date.parse(a.activatedAt)) / 86400000;
  if (['closedwon', 'closedlost'].includes(d.properties.dealstage)) return cmdDeactivate(`the ${a.company} deal is ${d.properties.dealstage === 'closedwon' ? 'won' : 'closed'}`);
  if (age > MAX_AGE_DAYS) return cmdDeactivate(`${MAX_AGE_DAYS} days old`);
  const r = await activate({ id: a.dealId, name: d.properties.dealname }, a.company);
  log(`refresh: ${a.company} ${r.ok ? `rebuilt (${r.chars} chars)` : r.why}`);
}

(async () => {
  if (flag('add')) return cmdAdd();
  if (flag('import')) return cmdImport();
  if (flag('activate')) return cmdActivate();
  if (flag('deactivate')) return cmdDeactivate();
  if (flag('list')) return cmdList();
  if (flag('refresh')) return cmdRefresh();
  if (flag('rules')) return cmdRules();
  if (flag('auto')) return cmdAuto();
  log('usage: --add | --import | --activate | --deactivate | --list | --refresh | --rules | --auto (see the header)');
})().catch((e) => { log(`⚠️ ${String(e.message).split('\n')[0]}`); if (flag('notify')) notify(`⚠️ Study pack failed: ${String(e.message).split('\n')[0].slice(0, 200)}`); process.exitCode = 1; });
