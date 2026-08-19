#!/usr/bin/env node
/**
 * incident-to-blog.cjs — turn a wiki incident into a published field note.
 *
 * Elena's blog is the visible half of her AEO/GEO/Tech-SEO machine, and the
 * incidents in the AI Ops Wiki are the most credible thing she writes: real
 * outages on live systems, with numbers verified from production logs. Those
 * belong on the blog as well as in the wiki. This bridges the two.
 *
 * ── Why the article is TEMPLATED, not model-written ─────────────────────────
 * Her instruction was blunt: "I do not want to scam anybody." An LLM asked to
 * expand a bullet list into an engaging post will, reliably, invent a detail —
 * a metric, a duration, a cause that sounds right. Once one invented number is
 * published under her name the whole corpus is suspect, and the corpus is the
 * entire asset. So the article is assembled deterministically from the fields
 * that were already verified when the incident was written. There is no
 * generation step, so there is nothing to hallucinate. The prose quality comes
 * from the incident being written carefully in the first place.
 *
 * ── Selectivity ─────────────────────────────────────────────────────────────
 * Publishing is opt-in per incident: only files carrying `blog: yes` in their
 * front-matter are eligible. Routine work earns neither a wiki entry nor a post.
 *
 * Usage:
 *   node scripts/incident-to-blog.cjs --list
 *   node scripts/incident-to-blog.cjs <slug>              # print the draft, publish nothing
 *   node scripts/incident-to-blog.cjs <slug> --publish    # blog page + Dev.to canonical
 *
 * Publishing is never the default. --publish is an explicit, outward-facing act.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const WIKI_REPO = process.env.AIDEAZZ_REPO_PATH || 'D:/aideazz/aideazz';
const INCIDENTS = path.join(WIKI_REPO, 'content', 'ai-ops-wiki', 'incidents');
const CONCEPTS = path.join(WIKI_REPO, 'content', 'ai-ops-wiki', 'concepts');
const STATE = path.join(process.cwd(), 'data', 'incident-blog-published.json');
const WIKI_URL = 'https://aideazz.xyz/ai-ops-wiki.html';

function parseDoc(raw) {
  const text = raw.replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error('missing front-matter (check the closing --- line)');
  const meta = {};
  let key = null;
  for (const line of m[1].split('\n')) {
    const hit = line.match(/^([a-z_]+):\s?(.*)$/);
    if (hit) { key = hit[1]; meta[key] = hit[2].trim(); }
    else if (key && line.trim()) meta[key] += ' ' + line.trim();
  }
  return { meta, body: m[2].trim() };
}

const loadDir = dir =>
  fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => {
    const d = parseDoc(fs.readFileSync(path.join(dir, f), 'utf8'));
    d.meta.slug ||= f.replace(/\.md$/, '');
    return d;
  });

const readState = () => {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; }
};
const writeState = s => {
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2), 'utf8');
};

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const fmtDate = d => {
  const [y, m, day] = (d || '').split('-');
  return y ? `${MONTHS[Number(m) - 1]} ${Number(day)}, ${y}` : '';
};

/** Blog slug: the incident slug minus its date prefix, which the date line already carries. */
const blogSlug = incidentSlug => incidentSlug.replace(/^\d{4}-\d{2}-\d{2}-/, '') + '-field-note';

/**
 * Assemble the article. Every sentence below is either fixed framing or a field
 * copied verbatim from the incident file — nothing is paraphrased or inferred.
 */
function buildArticle(inc, conceptBySlug) {
  const m = inc.meta;
  const linked = (m.concepts || '').split(',').map(s => s.trim()).filter(Boolean);
  const L = [];

  L.push(`*A field note from the AIdeazz AI Lab — a real incident on a live production system, written up from the logs. ${fmtDate(m.date)}.*`);
  L.push('');
  if (m.subtitle) { L.push(`**${m.subtitle}.**`); L.push(''); }

  L.push('## What it looked like from outside');
  L.push('');
  L.push(m.symptom);
  L.push('');
  L.push('## What was actually happening');
  L.push('');
  L.push(m.root_cause);
  L.push('');
  L.push('## The fix');
  L.push('');
  L.push(m.fix);
  L.push('');
  if (m.verified) {
    L.push('## How I know it worked');
    L.push('');
    L.push(m.verified);
    L.push('');
  }
  L.push('## The rule this earned');
  L.push('');
  L.push(`> ${m.rule}`);
  L.push('');

  if (linked.length) {
    L.push('## The named concepts behind it');
    L.push('');
    L.push('Naming a failure mode is what makes it possible to recognise the same shape somewhere new, before it costs another weekend.');
    L.push('');
    for (const slug of linked) {
      const c = conceptBySlug.get(slug);
      if (!c) continue;
      L.push(`### ${c.meta.title}`);
      L.push('');
      L.push(`*${c.meta.one_liner}*`);
      L.push('');
      L.push(c.body);
      L.push('');
    }
  }

  L.push('---');
  L.push('');
  L.push(`This note is one entry in a running wiki of production engineering lessons — every concept linked to the incident that taught it — at [aideazz.xyz/ai-ops-wiki.html](${WIKI_URL}).`);
  L.push('');
  L.push('No customer data, credentials, hostnames or internal record identifiers appear in these write-ups.');

  return L.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const publish = args.includes('--publish');
  const slugArg = args.find(a => !a.startsWith('--'));

  if (!fs.existsSync(INCIDENTS)) {
    console.error(`incidents not found at ${INCIDENTS} — set AIDEAZZ_REPO_PATH`);
    process.exit(1);
  }

  const incidents = loadDir(INCIDENTS);
  const conceptBySlug = new Map(loadDir(CONCEPTS).map(c => [c.meta.slug, c]));
  const state = readState();

  if (args.includes('--list') || !slugArg) {
    console.log('\nIncidents (blog: yes = eligible to publish)\n');
    for (const i of incidents.sort((a, b) => (b.meta.date || '').localeCompare(a.meta.date || ''))) {
      const eligible = /^(yes|true)$/i.test(i.meta.blog || '');
      const done = state[i.meta.slug];
      console.log(
        `  ${eligible ? '✓' : ' '} ${i.meta.slug}` +
        `${done ? `  [published ${done.publishedAt.slice(0, 10)}]` : ''}`,
      );
    }
    console.log('\n  node scripts/incident-to-blog.cjs <slug>            print the draft');
    console.log('  node scripts/incident-to-blog.cjs <slug> --publish  publish it\n');
    return;
  }

  const inc = incidents.find(i => i.meta.slug === slugArg);
  if (!inc) {
    console.error(`no incident with slug "${slugArg}" — run --list`);
    process.exit(1);
  }
  if (!/^(yes|true)$/i.test(inc.meta.blog || '')) {
    console.error(`"${slugArg}" is not marked for the blog. Add "blog: yes" to its front-matter if it genuinely earns a public post.`);
    process.exit(1);
  }

  const title = inc.meta.title;
  const slug = blogSlug(inc.meta.slug);
  const markdown = buildArticle(inc, conceptBySlug);
  const canonical = `https://aideazz.xyz/blog/${slug}`;

  if (!publish) {
    console.log(`\n─── DRAFT (nothing published) ───`);
    console.log(`title     : ${title}`);
    console.log(`slug      : ${slug}`);
    console.log(`canonical : ${canonical}`);
    console.log(`words     : ${markdown.split(/\s+/).length}`);
    console.log(`─────────────────────────────────\n`);
    console.log(markdown);
    console.log(`\n─── end draft — re-run with --publish to ship ───\n`);
    return;
  }

  if (state[inc.meta.slug]) {
    console.error(`already published on ${state[inc.meta.slug].publishedAt} → ${state[inc.meta.slug].devtoUrl || canonical}`);
    process.exit(1);
  }

  // Leak scan before anything leaves the machine. The wiki is scrubbed by hand;
  // this is the automated backstop, and it fails closed.
  const leaks = markdown.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}|Bearer\s+\S+|\b\d{9,}\b|\b\d{1,3}(\.\d{1,3}){3}\b/gi);
  if (leaks) {
    console.error(`REFUSING TO PUBLISH — possible sensitive data: ${[...new Set(leaks)].slice(0, 5).join(', ')}`);
    process.exit(1);
  }

  const article = {
    slug,
    title,
    markdown,
    publishedAt: new Date().toISOString(),
    url: canonical,
  };

  const { pushOneArticleHtml } = require('../dist/blog-static-pages.js');
  const { saveBlogPostCache, pushSitemapToGithub } = require('../dist/daily-blog-publisher.js');

  // Dev.to with canonical pointing home, so aideazz.xyz keeps the ranking credit.
  let devtoUrl = null;
  const apiKey = (process.env.DEVTO_API_KEY || '').trim();
  if (apiKey) {
    const body = `*Originally published on [AIdeazz](${canonical}) — cross-posted here with canonical link.*\n\n${markdown}`;
    const res = await fetch('https://dev.to/api/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        article: {
          title, body_markdown: body, published: true, canonical_url: canonical,
          tags: ['devops', 'programming', 'ai', 'postmortem'],
        },
      }),
    });
    if (res.ok) {
      devtoUrl = (await res.json()).url || null;
      console.log(`Dev.to: ${devtoUrl}`);
    } else {
      console.warn(`Dev.to failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    }
  } else {
    console.warn('DEVTO_API_KEY missing — blog page only, no cross-post');
  }

  if (devtoUrl) article.devtoUrl = devtoUrl;
  saveBlogPostCache({ slug, title, markdown, devtoUrl: devtoUrl || '', aideazzBlogUrl: canonical });
  const ok = await pushOneArticleHtml(article);
  console.log(`blog page ${ok ? 'PUBLISHED' : 'FAILED'}: ${canonical}`);
  if (ok) await pushSitemapToGithub().catch(e => console.warn('sitemap push:', e.message));

  state[inc.meta.slug] = { publishedAt: article.publishedAt, slug, devtoUrl };
  writeState(state);
  console.log(`\ndone — ${canonical}${devtoUrl ? ` + ${devtoUrl}` : ''}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
