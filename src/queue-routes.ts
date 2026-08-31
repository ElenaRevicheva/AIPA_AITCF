/**
 * The two-card view — Elena's own CRM, reading her own database.
 *
 * Reads `daily_queue` only. It issues **no HubSpot calls of any kind**: not a
 * read, not a write. HubSpot remains the system of record and is entirely
 * unaffected by anything on this page; `hubspot_deal_id` is carried purely so a
 * card can deep-link to the record for the full history.
 *
 * Mounted at /queue/ rather than under /cto/, because /cto/ is deliberately
 * public — the one-click outreach links are opened from email clients that
 * cannot authenticate. This page shows the pipeline, so it sits behind the same
 * nginx basic auth as /ops/, same origin, browser-supplied credentials. That is
 * the pattern already documented for the ops dashboard: a static page cannot
 * hold a secret, so same-origin plus browser auth is the honest option.
 */
import type { Express, Request, Response } from 'express';
import { getQueue, setQueueStatus, getQueueCounts, type QueueStatus } from './daily-queue';

const ALLOWED: QueueStatus[] = ['new', 'working', 'done', 'skipped'];

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const PAGE = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Today — AIdeazz</title>
<style>
  :root{--bg:#fbfaf8;--fg:#1a1a1a;--mut:#6b6b6b;--line:#e5e2dc;--card:#fff;--accent:#8b1e1e;--ok:#1c6b3f}
  @media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#ededed;--mut:#9a9a9a;--line:#2c2c2c;--card:#1c1c1c;--accent:#e0665f;--ok:#5cc48a}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:20px}
  header{max-width:900px;margin:0 auto 22px}
  h1{font-size:26px;margin:0 0 4px;letter-spacing:-.02em}
  .sub{color:var(--mut);font-size:14px}
  main{max-width:900px;margin:0 auto;display:grid;gap:20px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px}
  .lane{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:600}
  .title{font-size:19px;font-weight:600;margin:6px 0 2px;letter-spacing:-.01em}
  .co{color:var(--mut);font-size:14px;margin-bottom:12px}
  .badges{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
  .b{font-size:12px;padding:2px 9px;border-radius:99px;border:1px solid var(--line);color:var(--mut)}
  .b.ok{color:var(--ok);border-color:var(--ok)}
  .b.warn{color:var(--accent);border-color:var(--accent)}
  pre{white-space:pre-wrap;font:14px/1.6 ui-sans-serif,system-ui,sans-serif;background:transparent;border:1px solid var(--line);border-radius:8px;padding:14px;margin:0 0 14px;max-height:340px;overflow:auto}
  .row{display:flex;gap:10px;flex-wrap:wrap}
  button,a.btn{font:14px/1 inherit;padding:10px 15px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--fg);cursor:pointer;text-decoration:none;display:inline-block}
  a.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
  button:hover,a.btn:hover{border-color:var(--fg)}
  .empty{color:var(--mut);font-size:14px;padding:8px 0}
  .more{color:var(--mut);font-size:13px;margin-top:10px}
  footer{max-width:900px;margin:26px auto 0;color:var(--mut);font-size:12px;border-top:1px solid var(--line);padding-top:12px}
</style></head><body>
<header><h1>Today</h1><div class="sub" id="sub">loading…</div></header>
<main id="main"></main>
<footer>Reads the AIdeazz operational database only. HubSpot is never written to from this page.</footer>
<script>
const E=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function load(){
  const r=await fetch('api/today',{credentials:'same-origin'});
  if(!r.ok){document.getElementById('sub').textContent='could not load ('+r.status+')';return;}
  const d=await r.json();
  document.getElementById('sub').textContent=
    (d.counts.hiring_new||0)+' employers · '+(d.counts.client_new||0)+' clients waiting';
  document.getElementById('main').innerHTML=
    card('hiring','Apply',d.hiring)+card('client','Send',d.client);
}
function card(lane,verb,items){
  const label=lane==='hiring'?'Employer':'Client';
  if(!items.length) return '<section class="card"><div class="lane">'+label+
    '</div><div class="empty">Nothing waiting in this lane.</div></section>';
  const it=items[0], rest=items.length-1;
  const badges=[
    it.score!=null?'<span class="b">score '+E(it.score)+'</span>':'',
    it.draftTailored
      ?'<span class="b ok">draft written for this one'+(it.draftProvider?' · '+E(it.draftProvider):'')+'</span>'
      :'<span class="b warn">boilerplate — rewrite before sending</span>',
    it.draftReason?'<span class="b">'+E(it.draftReason)+'</span>':'',
  ].join('');
  return '<section class="card"><div class="lane">'+label+'</div>'+
    '<div class="title">'+E(it.title)+'</div><div class="co">'+E(it.company)+
    (it.createdAt?' · '+E(it.createdAt):'')+'</div>'+
    '<div class="badges">'+badges+'</div>'+
    (it.draft?'<pre id="d-'+it.id+'">'+E(it.draft)+'</pre>':'<div class="empty">No draft stored.</div>')+
    '<div class="row">'+
      (it.actionUrl?'<a class="btn primary" target="_blank" rel="noopener" href="'+E(it.actionUrl)+'">'+verb+' →</a>':'')+
      (it.draft?'<button onclick="cp(\\''+it.id+'\\')">Copy draft</button>':'')+
      '<button onclick="act(\\''+it.id+'\\',\\'done\\')">Did it</button>'+
      '<button onclick="act(\\''+it.id+'\\',\\'skipped\\')">Skip</button>'+
      (it.hubspotDealId?'<a class="btn" target="_blank" rel="noopener" href="https://app.hubspot.com/contacts/51409153/record/0-3/'+E(it.hubspotDealId)+'">History</a>':'')+
    '</div>'+
    (rest>0?'<div class="more">'+rest+' more in this lane behind it.</div>':'')+
  '</section>';
}
function cp(id){const t=document.getElementById('d-'+id);navigator.clipboard.writeText(t.textContent).then(()=>{});}
async function act(id,status){
  await fetch('api/act',{method:'POST',credentials:'same-origin',
    headers:{'content-type':'application/json'},body:JSON.stringify({id,status})});
  load();
}
load();
</script></body></html>`;

export function registerQueueRoutes(app: Express): void {
  // No '/queue' -> '/queue/' redirect here: express's default (non-strict)
  // routing treats both as the same path, so redirecting one to the other is an
  // infinite loop. nginx already does `location = /queue { return 301 /queue/; }`.

  app.get('/queue/', (_req: Request, res: Response) => {
    res.set('cache-control', 'no-store').type('html').send(PAGE);
  });

  app.get('/queue/api/today', async (_req: Request, res: Response) => {
    try {
      const [hiring, client, counts] = await Promise.all([
        getQueue('hiring', 5),
        getQueue('client', 5),
        getQueueCounts(),
      ]);
      res.set('cache-control', 'no-store').json({ hiring, client, counts });
    } catch (e) {
      console.error('[queue] today failed:', e);
      res.status(500).json({ error: (e as Error).message?.slice(0, 200) });
    }
  });

  app.post('/queue/api/act', async (req: Request, res: Response) => {
    const { id, status } = (req.body || {}) as { id?: string; status?: string };
    if (!id || !/^[0-9A-Fa-f]{32}$/.test(id)) return res.status(400).json({ error: 'bad id' });
    if (!status || !ALLOWED.includes(status as QueueStatus)) return res.status(400).json({ error: 'bad status' });
    try {
      const ok = await setQueueStatus(id, status as QueueStatus);
      console.log(`[queue] ${id.slice(0, 8)} -> ${status} (${ok ? 'updated' : 'not found'})`);
      return res.json({ ok });
    } catch (e) {
      console.error('[queue] act failed:', e);
      return res.status(500).json({ error: (e as Error).message?.slice(0, 200) });
    }
  });

  console.log('[queue] routes registered at /queue/ (behind nginx basic auth)');
}

export const _esc = esc;
