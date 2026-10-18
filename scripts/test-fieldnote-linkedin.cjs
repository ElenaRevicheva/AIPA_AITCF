#!/usr/bin/env node
/**
 * test-fieldnote-linkedin.cjs — the LinkedIn caption for a field note is the incident's own verified words.
 *
 * 18 Oct 2026 (Elena: "wire LinkedIn"). The daily article's AI-written caption told recruiters "216 restarts in
 * 48 hours" (false). Field notes must never go that way: title + subtitle + link, assembled, no model.
 *
 *   node scripts/test-fieldnote-linkedin.cjs     (needs the aideazz repo: AIDEAZZ_REPO_PATH or D:/aideazz/aideazz)
 */
const fs = require('fs');
const path = require('path');
const { linkedInCaption, parseDoc, blogSlug } = require('./incident-to-blog.cjs');

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const REPO = process.env.AIDEAZZ_REPO_PATH || 'D:/aideazz/aideazz';
const DIR = path.join(REPO, 'content', 'ai-ops-wiki', 'incidents');
const LEAK = /[\w.+-]+@[\w-]+\.[a-z]{2,}|Bearer\s+\S+|\b\d{9,}\b|\b\d{1,3}(\.\d{1,3}){3}\b/i;

const incidents = fs.readdirSync(DIR).filter(f => f.endsWith('.md')).map(f => {
  const d = parseDoc(fs.readFileSync(path.join(DIR, f), 'utf8'));
  d.meta.slug ||= f.replace(/\.md$/, '');
  return d;
}).filter(i => /^(yes|true)$/i.test(i.meta.blog || ''));

console.log(`\nField note → LinkedIn caption (${incidents.length} publishable incidents)\n`);
check('there are publishable incidents to test', incidents.length > 0);

for (const inc of incidents) {
  const slug = blogSlug(inc.meta.slug);
  const live = `https://aideazz.xyz/blog/${slug}/`;
  const c = linkedInCaption(inc, live, slug);
  const parts = c.split('\n\n');
  const bad = [];
  if (typeof c !== 'string') bad.push('not a plain string (a model call would be async)');
  if (parts[0] !== inc.meta.title.replace(/[*`]/g, '').trim()) bad.push('first line is not the title');
  if (parts.length !== 3) bad.push(`expected 3 blocks, got ${parts.length}`);
  if (!/[.!?]$/.test(parts[1] || '')) bad.push('summary line does not end a sentence');
  if (parts[2] !== `${live}?utm_source=linkedin&utm_medium=buffer_fieldnote&utm_campaign=${encodeURIComponent(slug)}`) bad.push('link is not the live page + UTM');
  if (/[*`]|\[\[/.test(c)) bad.push('markdown leftovers');
  if (LEAK.test(c)) bad.push('leak pattern');
  if (c.length > 1300) bad.push(`too long (${c.length})`);
  check(`${inc.meta.slug}`, bad.length === 0, bad.join('; '));
}

// The exact post Elena was shown on 18 Oct (16 Oct field note).
const busy = incidents.find(i => i.meta.slug === '2026-10-16-the-inbox-was-read-only-on-busy-hours');
if (busy) {
  const slug = blogSlug(busy.meta.slug);
  const c = linkedInCaption(busy, `https://aideazz.xyz/blog/${slug}/`, slug);
  check('16 Oct caption = the example Elena approved (+ UTM)', c.startsWith(
    'The inbox was read only on busy hours\n\nAn hourly job hunter also reads two mailboxes for employer replies. ' +
    'An hour that found no new jobs ended early, before the mailbox step, so replies were read in 278 of 466 cycles, ' +
    'with gaps of up to 14.4 hours.\n\nhttps://aideazz.xyz/blog/the-inbox-was-read-only-on-busy-hours-field-note/?utm_source=linkedin'), c.slice(0, 160));
}

// No subtitle → whole sentences of the symptom, capped, still a sentence.
const synthetic = { meta: { title: 'T', symptom: 'First fact here. Second fact here. ' + 'Long tail sentence. '.repeat(40) } };
const s = linkedInCaption(synthetic, 'https://aideazz.xyz/blog/x/', 'x').split('\n\n')[1];
check('no subtitle → symptom sentences, ≤ 400 chars, ends a sentence', s.startsWith('First fact here.') && s.length <= 400 && /[.!?]$/.test(s), s.slice(0, 80));

// The script never reaches for a model when it writes the caption.
const src = fs.readFileSync(path.join(__dirname, 'incident-to-blog.cjs'), 'utf8');
check('incident-to-blog.cjs never calls generateSocialVariant / an LLM', !/generateSocialVariant|claudeWithGroqFallback|anthropic|openai/i.test(src));
check('LinkedIn is off unless FIELDNOTE_LINKEDIN is draft|post', /li === 'draft' \|\| li === 'post'/.test(src));
check('requiring the script does not run it (no publish on import)', /if \(require\.main === module\) main\(\)/.test(src));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
