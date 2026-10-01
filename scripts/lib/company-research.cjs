/**
 * company-research.cjs — the Perplexity company brief, shared by the morning page and the deal kit.
 *
 * Moved out of apply-queue.cjs on 28 Sep 2026 WITHOUT changing it — same prompt, same model, same
 * cache file (~/.apply-queue-research.json) — so a company is paid for once, whichever script sees
 * it first. Two users:
 *   · hs-fill-apply-kit.cjs writes it onto the deal as a "🔎 COMPANY BRIEF" note, so HubSpot holds
 *     the whole kit (letter, tailored CV, defense, brief). HubSpot is the record.
 *   · apply-queue.cjs shows it on the card. The page is a VIEW of HubSpot, rebuilt every morning.
 *
 * THE NOTE MUST NOT LOOK LIKE ANY OTHER NOTE. Every reader of these deals pulls "the first https://
 * link in a note" as the APPLY link (apply-queue parseNote, hs-fill-apply-kit jobUrlOf), and the
 * learning loop in VJH reads notes for Elena's own words. So the brief carries NO scheme-prefixed
 * URL and no href (sources are shown as bare domains), no "COVER LETTER", no "Source:", and a marker
 * VJH's judge_feedback_sync._KIT_NOTE skips. scripts/test-company-brief.cjs pins all of it.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const CACHE = path.join(os.homedir(), '.apply-queue-research.json');
const BRIEF_MARK = '🔎 COMPANY BRIEF';

/** "Scale%20Army%20Careers" and "Scale Army Careers" are one company. */
function companyKey(company) {
  let c = String(company || '');
  try { c = decodeURIComponent(c); } catch { /* a stray % is just a character */ }
  return c.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * research(company, title) → { brief, angle, sources } | null. Cached by company; fails soft (null)
 * and counts the failure so the caller can print it — a silent skip is the failure mode this repo
 * keeps getting bitten by.
 */
function createResearcher(apiKey, { cacheFile = CACHE } = {}) {
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { /* first run */ }
  const stats = { spent: 0, researched: 0, cached: 0, failed: 0 };
  const fresh = {};

  async function research(company, title) {
    if (!company) return null;
    const raw = String(company).toLowerCase().trim();
    const key = companyKey(company);
    // Entries written before 28 Sep were keyed on the raw deal text, sometimes still URL-encoded.
    const hit = cache[key] || cache[raw] || cache[key.replace(/ /g, '%20')];
    if (hit) { stats.cached++; return hit; }
    if (!apiKey) return null;
    const prompt = `Company: ${company}. Role being applied for: ${title || 'unspecified'}.\n\n`
      + 'Answer in exactly this format, nothing else:\n'
      + 'BRIEF: two sentences on what this company actually does and who pays them.\n'
      + 'ANGLE: one sentence naming the single most relevant thing about them for a candidate '
      + 'whose background is building and operating production AI automation — AI agents, CRM and '
      + 'outreach automation, multi-provider LLM fallback chains, and making companies visible to '
      + 'AI search (GEO/AEO). Be specific to this company; if you cannot find enough about them, '
      + 'write ANGLE: (not enough public information) rather than inventing something.';
    try {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'sonar', max_tokens: 220, temperature: 0.2,
          messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) { stats.failed++; return null; }
      const j = await res.json();
      const text = j.choices?.[0]?.message?.content || '';
      stats.spent += j.usage?.cost?.total_cost || 0;
      const out = {
        brief: (text.match(/BRIEF:\s*([\s\S]*?)(?=\nANGLE:|$)/i) || [])[1]?.trim() || text.trim(),
        angle: (text.match(/ANGLE:\s*([\s\S]*)/i) || [])[1]?.trim() || '',
        sources: (j.search_results || j.citations || [])
          .map((c) => (typeof c === 'string' ? c : c.url)).filter(Boolean).slice(0, 4),
      };
      cache[key] = out; fresh[key] = out; stats.researched++;
      return out;
    } catch { stats.failed++; return null; }
  }

  /** Re-read before writing: the kit (every 10 min since 1 Oct, flock-guarded) and the page (13:15) can overlap. */
  function save() {
    if (!Object.keys(fresh).length) return;
    let disk = {};
    try { disk = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { /* none yet */ }
    try { fs.writeFileSync(cacheFile, JSON.stringify({ ...disk, ...fresh }, null, 1)); } catch { /* cache is optional */ }
  }

  return { research, save, stats };
}

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const domainOf = (u) => String(u || '').replace(/^[a-z]+:\/\//i, '').replace(/^www\./i, '').replace(/[?#].*$/, '')
  .replace(/\/+$/, '').slice(0, 60);
/** Perplexity's "[1][8]" markers mean nothing outside its UI; any URL in the prose becomes a bare domain. */
const tidy = (s) => String(s || '').replace(/\s*\[\d+\](?:\[\d+\])*/g, '')
  .replace(/https?:\/\/\S+/gi, (u) => domainOf(u)).replace(/\s{2,}/g, ' ').trim();

/** The deal note. Short, one screen, readable on a phone. null when there is nothing to say. */
function renderBriefHtml({ company, research, date = new Date() }) {
  if (!research || !tidy(research.brief)) return null;
  const angle = tidy(research.angle);
  const sources = (research.sources || []).map(domainOf).filter(Boolean);
  return [
    `<strong>${BRIEF_MARK} — ${esc(decodeSafe(company))}</strong>`,
    `<p><strong>What they do:</strong> ${esc(tidy(research.brief))}</p>`,
    angle ? `<p><strong>Your angle:</strong> ${esc(angle)}</p>` : '',
    '<p><em>Use it in the first line of your letter, the "why us?" question, and the first two minutes of the call.</em></p>',
    `<p><em>Researched by Perplexity ${esc(date.toISOString().slice(0, 10))}${sources.length ? ` · cited from: ${esc(sources.join(' · '))}` : ''}`
      + ' — check a fact on its source before you say it out loud.</em></p>',
  ].filter(Boolean).join('');
}

function decodeSafe(s) {
  try { return decodeURIComponent(String(s || '')); } catch { return String(s || ''); }
}

module.exports = { BRIEF_MARK, CACHE, companyKey, createResearcher, renderBriefHtml, tidy, domainOf, decodeSafe };
