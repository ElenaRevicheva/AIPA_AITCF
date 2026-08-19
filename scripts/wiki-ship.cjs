#!/usr/bin/env node
/**
 * wiki-ship.cjs — fire the journal everywhere, in one command.
 *
 * Elena's rule: wire it AND fire it. A session that earns an entry should not
 * leave her with a checklist — the entry should reach the journal, the live
 * site, the blog, Dev.to and the AEO surfaces without her touching anything.
 *
 * What it does, in order, stopping at the first real failure:
 *
 *   1. LINT the corpus. A wiki that rots is worse than no wiki, so a missing
 *      field or a dangling reference stops the run before anything publishes.
 *   2. REGENERATE the page from Markdown. The revision line (Rev N · chapters ·
 *      entries · cross-references · date) is computed from the corpus, so it
 *      refreshes itself — there is no counter anyone has to remember to bump.
 *   3. REFRESH the AEO/GEO surfaces: geo-manifest date, llms.txt entry,
 *      sitemap. This is what makes a new chapter discoverable to answer
 *      engines rather than only to people who already found the page.
 *   4. COMMIT + PUSH the site repo — deliberately WITHOUT [skip ci], because
 *      that flag is what silently skips the 4everland rebuild.
 *   5. PUBLISH any chapter marked `blog: yes` that has not gone out yet, to
 *      aideazz.xyz/blog + Dev.to with the canonical pointing home.
 *
 * Usage:
 *   node scripts/wiki-ship.cjs            full run
 *   node scripts/wiki-ship.cjs --dry      show what would happen, change nothing
 *   node scripts/wiki-ship.cjs --no-blog  site only, skip Dev.to
 */

require('dotenv').config();
const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SITE = process.env.AIDEAZZ_REPO_PATH || 'D:/aideazz/aideazz';
const DRY = process.argv.includes('--dry');
const NO_BLOG = process.argv.includes('--no-blog');

const say = (icon, msg) => console.log(`${icon} ${msg}`);
const die = (msg) => { console.error(`\n✖ ${msg}\n`); process.exit(1); };

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: SITE, encoding: 'utf8', stdio: 'pipe', ...opts });
}
function git(args, cwd = SITE) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
}

function main() {
  console.log(`\n── wiki-ship ${DRY ? '(dry run — nothing will change)' : ''}\n`);
  if (!fs.existsSync(path.join(SITE, 'content', 'ai-ops-wiki'))) {
    die(`no wiki corpus at ${SITE}/content/ai-ops-wiki — set AIDEAZZ_REPO_PATH`);
  }

  // 1 ── Lint. Fail closed: never publish a corpus that does not check out.
  try {
    const out = run('node', ['scripts/generate-ai-ops-wiki.mjs', '--lint']);
    const warns = (out.match(/warn /g) || []).length;
    say('✓', `lint clean${warns ? ` (${warns} warning${warns === 1 ? '' : 's'})` : ''}`);
    if (warns) console.log(out.split('\n').filter(l => l.includes('warn ')).join('\n'));
  } catch (e) {
    console.error(e.stdout || e.message);
    die('lint FAILED — fix the corpus before shipping');
  }

  // 2 ── Regenerate. The revision line recomputes itself from the corpus.
  const gen = run('node', ['scripts/generate-ai-ops-wiki.mjs']).trim();
  say('✓', gen.replace(/^ai-ops-wiki: /, 'regenerated — '));

  // 3 ── AEO/GEO surfaces. A chapter nobody can discover is a chapter nobody cites.
  const today = new Date().toISOString().slice(0, 10);
  const manifestPath = path.join(SITE, 'public', 'geo-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const before = manifest.updated;
  manifest.updated = today;
  manifest.endpoints = manifest.endpoints || {};
  manifest.endpoints.aiOpsWiki = '/ai-ops-wiki.html';
  if (!DRY) fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  say('✓', `geo-manifest ${before === today ? 'current' : `${before} → ${today}`}, aiOpsWiki endpoint present`);

  const llms = path.join(SITE, 'public', 'llms.txt');
  if (!fs.readFileSync(llms, 'utf8').includes('ai-ops-wiki')) {
    die('llms.txt does not list the wiki — assistants will not be told to cite it');
  }
  say('✓', 'llms.txt lists the wiki as a canonical source');

  // The sitemap is generated; regenerate so a new chapter's page is listed.
  try { run('node', ['scripts/generate-sitemap.mjs']); say('✓', 'sitemap regenerated'); }
  catch { say('!', 'sitemap regeneration skipped (non-fatal)'); }

  // 4 ── Commit + push the site. No [skip ci]: that flag skips the deploy.
  /**
   * Name the files rather than parsing `git status` output.
   *
   * The first cut sliced a fixed offset off each porcelain line to recover the
   * path and produced `git add ublic/geo-manifest.json` — the status prefix is
   * not a fixed width once a file is partly staged. These are the only paths
   * this script is ever allowed to touch, so listing them is both simpler and
   * safer: it cannot accidentally stage somebody else's work in progress.
   */
  const OWNED = [
    'public/ai-ops-wiki.html',
    'public/geo-manifest.json',
    'public/llms.txt',
    'public/.well-known/llms.txt',
    'public/sitemap.xml',
    'public/sitemap.txt',
    'public/portfolio-sitemap.xml',
    'content/ai-ops-wiki',
  ].filter(p => fs.existsSync(path.join(SITE, p)));

  const dirty = git(['status', '--porcelain', '--', ...OWNED])
    .split('\n').map(l => l.trim()).filter(Boolean);

  if (!dirty.length) {
    say('·', 'site already up to date — nothing to push');
  } else if (DRY) {
    say('·', `would commit ${dirty.length} path(s):\n   ${dirty.join('\n   ')}`);
  } else {
    git(['add', '--', ...OWNED]);
    git(['commit', '-q', '-m',
      `ai-ops-wiki: refresh journal + AEO surfaces (${today})\n\n` +
      `Regenerated from the Markdown corpus; revision line, sitemap and\n` +
      `geo-manifest date recomputed. Pushed without [skip ci] so the site\n` +
      `actually rebuilds.\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>`]);
    try { execSync('git pull --rebase -q origin main', { cwd: SITE, stdio: 'pipe' }); } catch { /* nothing upstream */ }
    execSync('git push -q origin main', { cwd: SITE, stdio: 'pipe' });
    say('✓', `pushed ${git(['rev-parse', '--short', 'HEAD'])} — 4everland will rebuild`);
  }

  // 5 ── Blog + Dev.to for chapters that earned a public write-up.
  if (NO_BLOG) { say('·', 'blog skipped (--no-blog)'); return finish(); }
  const incDir = path.join(SITE, 'content', 'ai-ops-wiki', 'incidents');
  const statePath = path.join(process.cwd(), 'data', 'incident-blog-published.json');
  let state = {};
  try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { /* first run */ }

  const eligible = fs.readdirSync(incDir).filter(f => f.endsWith('.md')).map(f => {
    const raw = fs.readFileSync(path.join(incDir, f), 'utf8');
    const slug = (raw.match(/^slug:\s*(.+)$/m) || [])[1]?.trim() || f.replace(/\.md$/, '');
    const blog = /^blog:\s*(yes|true)\s*$/im.test(raw);
    return { slug, blog };
  }).filter(i => i.blog && !state[i.slug]);

  if (!eligible.length) { say('·', 'no unpublished chapters marked "blog: yes"'); return finish(); }

  /**
   * Refuse to "publish" without the Dev.to key.
   *
   * The first run did exactly what this script exists to prevent: it printed
   * two green ticks and recorded both chapters as published, while the cross-
   * post had been skipped because DEVTO_API_KEY is only on the Oracle box.
   * The state file then said "done" and would never retry them. A partial
   * success reported as a success is the failure mode this whole journal is
   * about — so stop, and say where to run it instead.
   */
  if (!(process.env.DEVTO_API_KEY || '').trim()) {
    die('DEVTO_API_KEY missing — refusing to half-publish.\n' +
        '  The key lives on the Oracle box. Run it there:\n' +
        '    ssh oracle-cto-aipa "cd ~/aideazz && git pull -q origin main"\n' +
        '    ssh oracle-cto-aipa "cd ~/cto-aipa && AIDEAZZ_REPO_PATH=/home/ubuntu/aideazz node scripts/wiki-ship.cjs"\n' +
        '  Or pass --no-blog to ship the site only.');
  }

  for (const inc of eligible) {
    if (DRY) { say('·', `would publish: ${inc.slug}`); continue; }
    try {
      const out = execFileSync('node', ['scripts/incident-to-blog.cjs', inc.slug, '--publish'],
        { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe' });
      const url = (out.match(/https:\/\/dev\.to\/\S+/) || out.match(/https:\/\/aideazz\.xyz\/blog\/\S+/) || ['(no url)'])[0];
      say('✓', `published ${inc.slug} → ${url}`);
    } catch (e) {
      say('✖', `publish FAILED for ${inc.slug}: ${(e.stdout || e.message || '').slice(0, 200)}`);
    }
  }
  finish();
}

function finish() {
  console.log('\n── done. https://aideazz.xyz/ai-ops-wiki.html\n');
}

try { main(); } catch (e) { die(e.message || String(e)); }
