/**
 * One-shot: wire atuona.xyz/aifilmstudio via the GitHub API (no local clone — atuona has no checkout).
 *  1) adds an "AI FILM STUDIO" nav link next to VAULT in index.html
 *  2) creates public/aifilmstudio/index.html — an ATUONA-styled page that loads films from
 *     webhook.aideazz.xyz/cto/films.json and plays them inline (works on phone or laptop).
 * 4everland rebuilds atuona on push. Run: GITHUB_TOKEN=… node scripts/deploy-atuona-studio.mjs
 */
import { Octokit } from '@octokit/rest';

const OWNER = 'ElenaRevicheva', REPO = 'atuona';
const o = new Octokit({ auth: (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim() });
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

const NAV_ANCHOR = 'data-text="VAULT">VAULT</a>';
const NAV_INSERT = NAV_ANCHOR + '\n                <a href="/aifilmstudio/" class="nav-link space" data-text="FILM STUDIO">FILM STUDIO</a>';

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ATUONA · AI Film Studio</title>
<link rel="icon" href="/favicon.svg">
<style>
  :root{--red:#e0144c;--bg:#070708;--ink:#ededed;--muted:#8a8a90}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:'Courier New',monospace}
  header{padding:28px 18px;text-align:center;border-bottom:1px solid #1a1a1e;position:relative}
  .brand{font-size:30px;font-weight:700;letter-spacing:.35em;color:#fff}
  .tag{color:var(--red);font-size:12px;letter-spacing:.45em;margin-top:9px}
  .sub{color:var(--muted);font-size:12px;margin-top:10px;letter-spacing:.15em}
  .back{position:absolute;left:18px;top:30px;color:var(--muted);text-decoration:none;font-size:12px;letter-spacing:.2em}
  .back:hover{color:var(--red)}
  .wrap{max-width:820px;margin:0 auto;padding:22px 16px 64px}
  .film{margin:0 0 38px;border:1px solid #16161a;border-radius:10px;padding:14px;background:#0c0c0e}
  .film h2{font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:23px;margin:0 0 4px;text-transform:capitalize;letter-spacing:.02em;color:#fff}
  .meta{color:var(--muted);font-size:12px;margin-bottom:10px;letter-spacing:.08em}
  video{width:100%;border-radius:6px;background:#000;display:block}
  .dl{display:inline-block;margin-top:9px;color:var(--red);text-decoration:none;font-size:12px;letter-spacing:.1em}
  .msg{color:var(--muted);text-align:center;padding:50px;letter-spacing:.1em}
</style>
</head>
<body>
<header>
  <a class="back" href="/">&larr; ATUONA</a>
  <div class="brand">ATUONA</div>
  <div class="tag">AI FILM STUDIO</div>
  <div class="sub">underground poetry &rarr; cinema</div>
</header>
<div class="wrap" id="films"><div class="msg">Loading films&hellip;</div></div>
<script>
  var API='https://webhook.aideazz.xyz/cto/films.json';
  function esc(s){return (s||'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  fetch(API).then(function(r){return r.json();}).then(function(films){
    var el=document.getElementById('films');
    if(!films||!films.length){el.innerHTML='<div class="msg">No films yet. Create one with /film build in the Atuona bot.</div>';return;}
    el.innerHTML=films.map(function(f){
      return '<div class="film"><h2>'+esc(f.title||f.name)+'</h2>'+
        '<div class="meta">'+esc(f.when)+' UTC &middot; '+f.sizeMB+' MB</div>'+
        '<video controls preload="metadata" playsinline src="'+esc(f.url)+'"></video>'+
        '<a class="dl" href="'+esc(f.url)+'" download>&darr; download</a></div>';
    }).join('');
  }).catch(function(){
    document.getElementById('films').innerHTML='<div class="msg">Could not load films right now. Please try again shortly.</div>';
  });
</script>
</body>
</html>
`;

(async () => {
  // 1) index.html nav link
  const idx = await o.repos.getContent({ owner: OWNER, repo: REPO, path: 'index.html' });
  let html = Buffer.from(idx.data.content, 'base64').toString('utf8');
  if (html.includes('/aifilmstudio/')) {
    console.log('• index.html already has the studio link — skipping');
  } else if (!html.includes(NAV_ANCHOR)) {
    console.error('✗ VAULT nav anchor not found in index.html — aborting'); process.exit(1);
  } else {
    html = html.replace(NAV_ANCHOR, NAV_INSERT);
    await o.repos.createOrUpdateFileContents({
      owner: OWNER, repo: REPO, path: 'index.html', sha: idx.data.sha,
      message: 'feat(nav): AI FILM STUDIO link -> /aifilmstudio/',
      content: b64(html),
    });
    console.log('✓ index.html nav updated');
  }
  // 2) the studio page
  let existSha;
  try { const e = await o.repos.getContent({ owner: OWNER, repo: REPO, path: 'public/aifilmstudio/index.html' }); existSha = e.data.sha; } catch { /* new file */ }
  await o.repos.createOrUpdateFileContents({
    owner: OWNER, repo: REPO, path: 'public/aifilmstudio/index.html',
    message: 'feat: AI Film Studio page (loads films from cto /films.json)',
    content: b64(PAGE), ...(existSha ? { sha: existSha } : {}),
  });
  console.log('✓ public/aifilmstudio/index.html ' + (existSha ? 'updated' : 'created'));
  console.log('\n4everland will rebuild atuona.xyz from main shortly → https://atuona.xyz/aifilmstudio/');
})().catch(e => { console.error('✗ ERR', e.status, e.message); process.exit(1); });
