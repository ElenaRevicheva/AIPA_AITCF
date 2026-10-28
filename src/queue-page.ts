/**
 * The /queue/ page markup — one CRM, all streams, HubSpot-shaped.
 *
 * Layout follows the Income ops dashboard Elena already reads (stat tiles, lane
 * tabs, dense table) so the two feel like one product rather than two
 * experiments.
 *
 * Opening a row shows HISTORY FIRST, then the draft, then the actions — her
 * explicit choice, 31 Aug 2026, and the HubSpot instinct: opening a record means
 * picking up a thread, so the first question is what has already happened. The
 * draft below it is the answer to "and what do I do now". Acting before reading
 * is how a second cold email reaches someone who already replied.
 *
 * The timeline is assembled from our own database (crm_event_log, outreach_log,
 * daily_queue). The page still issues NO HubSpot call of any kind.
 */
export interface QueuePageOptions {
  /** Where `api/today`, `api/record/:id`, `api/act` live. Relative on Oracle; absolute for the aideazz.xyz face. */
  apiBase: string;
  /**
   * true = the page is served from another origin (aideazz.xyz/ops) and must carry its own
   * sign-in: the browser will not prompt for HTTP basic auth on a cross-origin fetch, so the
   * page asks once, keeps `Authorization` in localStorage, sends it on every call and goes
   * back to the sign-in box on 401. false = same origin as the API, nginx's own prompt does it.
   */
  remote: boolean;
}

/**
 * 28 Oct 2026 (Elena: "aideazz.xyz/ops is the face of my CRM"): one page, two homes.
 * webhook.aideazz.xyz/queue/ (Oracle, same origin as the data) and aideazz.xyz/ops/
 * (static, built by scripts/build-ops-face.cjs). Same markup, same data, same buttons.
 */
export function renderQueuePage(opts: QueuePageOptions): string {
  const remote = opts.remote;
  const loginBox = remote ? `
<div id="login" class="login" hidden>
  <div class="sec">Sign in</div>
  <div class="quiet">Same password as webhook.aideazz.xyz/ops/ (reset from Telegram with /opspw). Kept in this browser only.</div>
  <form onsubmit="signIn();return false" class="row">
    <input id="pw" type="password" autocomplete="current-password" placeholder="password" aria-label="password">
    <button type="submit" class="primary">Open</button>
  </form>
  <div id="loginmsg" class="quiet"></div>
</div>` : '';
  const signOut = remote ? ' <a href="#" id="out" onclick="signOut();return false" hidden>Sign out</a>' : '';
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Income ops — Today</title>
<style>
  :root{
    --bg:#faf9fb;--fg:#1b1b1f;--mut:#6a6a75;--line:#e6e3ec;--card:#fff;
    --accent:#6d4aff;--accent-soft:#f1ecff;
    --hire:#1f6f8b;--hire-soft:#e3f1f6;--client:#1c6b3f;--client-soft:#e2f3e9;
    --warn:#9a3412;--warn-soft:#fdeee3;--ok:#1c6b3f;
  }
  @media (prefers-color-scheme:dark){:root{
    --bg:#131317;--fg:#ececf1;--mut:#9c9caa;--line:#2b2b33;--card:#1b1b21;
    --accent:#a78bfa;--accent-soft:#242034;
    --hire:#7fc4dc;--hire-soft:#16303a;--client:#7fd3a3;--client-soft:#16301f;
    --warn:#f0a882;--warn-soft:#3a2115;--ok:#7fd3a3;
  }}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);padding:26px 20px 60px;
    font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  .wrap{max-width:1120px;margin:0 auto}
  h1{font-size:30px;margin:0 0 4px;letter-spacing:-.02em}
  .sub{color:var(--mut);font-size:14px;margin-bottom:22px}
  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:14px;margin-bottom:22px}
  .tile{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:15px 17px}
  .tile.hl{background:var(--accent-soft);border-color:transparent}
  .tile .k{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);font-weight:600}
  .tile .v{font-size:32px;font-weight:650;letter-spacing:-.03em;margin-top:5px}
  .tile .n{font-size:12px;color:var(--mut)}
  .tabs{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
  .tab{padding:8px 15px;border-radius:9px;border:1px solid var(--line);background:var(--card);
    color:var(--fg);cursor:pointer;font:14px/1 inherit}
  .tab[aria-selected="true"]{background:var(--accent-soft);border-color:var(--accent);font-weight:600}
  table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);
    border-radius:12px;overflow:hidden}
  th{text-align:left;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);
    font-weight:600;padding:11px 14px;border-bottom:1px solid var(--line);white-space:nowrap}
  td{padding:12px 14px;border-bottom:1px solid var(--line);vertical-align:top}
  tr.r{cursor:pointer}
  tr.r:hover td,tr.r.open td{background:var(--accent-soft)}
  .badge{display:inline-block;font-size:11px;font-weight:650;letter-spacing:.04em;padding:3px 9px;border-radius:6px}
  .badge.hire{background:var(--hire-soft);color:var(--hire)}
  .badge.client{background:var(--client-soft);color:var(--client)}
  .t{font-weight:600}
  .c{color:var(--mut);font-size:13px}
  .pill{font-size:11px;padding:2px 8px;border-radius:99px;border:1px solid var(--line);color:var(--mut)}
  .pill.ok{color:var(--ok);border-color:var(--ok)}
  .pill.warn{color:var(--warn);border-color:var(--warn);background:var(--warn-soft)}
  .sc{font-variant-numeric:tabular-nums;font-weight:600}
  .d{padding:4px 14px 20px;background:var(--accent-soft)}
  .sec{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);
    font-weight:700;margin:14px 0 9px}
  .tl{border-left:2px solid var(--line);margin:0 0 4px;padding:0 0 0 15px}
  .ev{position:relative;padding:0 0 13px}
  .ev:before{content:"";position:absolute;left:-21px;top:5px;width:9px;height:9px;border-radius:50%;
    background:var(--mut);border:2px solid var(--bg)}
  .ev.email:before{background:var(--client)}
  .ev.queue:before{background:var(--accent)}
  .ev .when{font-size:12px;color:var(--mut);font-variant-numeric:tabular-nums}
  .ev .what{font-weight:600;font-size:14px}
  .ev .more{font-size:13px;color:var(--mut)}
  pre{white-space:pre-wrap;font:13.5px/1.62 ui-sans-serif,system-ui,sans-serif;background:var(--card);
    border:1px solid var(--line);border-radius:9px;padding:15px;margin:0 0 13px;max-height:360px;overflow:auto}
  .row{display:flex;gap:9px;flex-wrap:wrap}
  button,a.btn{font:14px/1 inherit;padding:10px 15px;border-radius:8px;border:1px solid var(--line);
    background:var(--card);color:var(--fg);cursor:pointer;text-decoration:none;display:inline-block}
  a.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
  button:hover,a.btn:hover{border-color:var(--fg)}
  .empty{padding:26px 14px;color:var(--mut);text-align:center}
  .quiet{color:var(--mut);font-size:13px;padding:2px 0 10px}
  footer{max-width:1120px;margin:24px auto 0;color:var(--mut);font-size:12px;
    border-top:1px solid var(--line);padding-top:12px}
  .login{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-bottom:22px;max-width:480px}
  .login input{font:15px/1 inherit;padding:10px 12px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--fg);min-width:200px}
  button.primary{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
  #out{color:var(--mut);font-size:13px;text-decoration:none;border-bottom:1px dotted var(--mut)}
  @media(max-width:760px){.hideS{display:none}h1{font-size:24px}}
</style></head><body><div class="wrap">
<h1>Income ops</h1>
<div class="sub"><span id="sub">loading…</span>${signOut}</div>
${loginBox}
<div class="tiles" id="tiles"></div>
<div class="tabs" id="tabs"></div>
<table><thead><tr>
  <th>Lane</th><th>What</th><th class="hideS">Who</th><th>Score</th>
  <th class="hideS">Draft</th><th class="hideS">Added</th>
</tr></thead><tbody id="rows"></tbody></table>
<footer>Reads the AIdeazz operational database only. HubSpot is never written to, or read from, by this page.</footer>
</div>
<script>
var E=function(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});};
var DATA={hiring:[],client:[],counts:{}}, TAB='all', OPEN=null, RECORD=null;
var API=${JSON.stringify(opts.apiBase)}, REMOTE=${remote ? 'true' : 'false'}, KEY='ops.auth';

function auth(){ try{ return REMOTE ? (localStorage.getItem(KEY)||'') : ''; }catch(e){ return ''; } }
function showLogin(bad){
  if(!REMOTE){ return; }
  var box=document.getElementById('login'); if(!box){ return; }
  box.hidden=false; document.getElementById('out').hidden=true;
  document.getElementById('loginmsg').textContent = bad ? 'That password was not accepted.' : '';
  document.getElementById('sub').textContent='sign in to see the queue for today';
  var pw=document.getElementById('pw'); if(pw){ pw.value=''; pw.focus(); }
}
function signIn(){
  var pw=document.getElementById('pw').value||'';
  if(!pw){ return; }
  try{ localStorage.setItem(KEY,'Basic '+btoa('elena:'+pw)); }catch(e){}
  document.getElementById('login').hidden=true;
  load();
}
function signOut(){
  try{ localStorage.removeItem(KEY); }catch(e){}
  DATA={hiring:[],client:[],counts:{}}; OPEN=null; RECORD=null;
  document.getElementById('tiles').innerHTML=''; document.getElementById('tabs').innerHTML='';
  document.getElementById('rows').innerHTML='';
  showLogin(false);
}
// Every call to the data goes through here. Same origin: the browser's own auth.
// Cross origin: the stored header; a 401 means the password changed — ask again.
function q(path,init){
  init=init||{}; init.headers=Object.assign({},init.headers||{});
  if(REMOTE){
    var a=auth(); if(!a){ showLogin(false); return Promise.reject(new Error('sign in')); }
    init.headers['Authorization']=a; init.credentials='omit';
  } else { init.credentials='same-origin'; }
  return fetch(API+path,init).then(function(r){
    if(REMOTE&&r.status===401){ try{ localStorage.removeItem(KEY); }catch(e){} showLogin(true); throw new Error('401'); }
    if(REMOTE){ var o=document.getElementById('out'); if(o){ o.hidden=false; } }
    return r;
  });
}

function load(){
  q('api/today').then(function(r){
    if(!r.ok){document.getElementById('sub').textContent='could not load ('+r.status+')';return null;}
    return r.json();
  }).then(function(d){ if(d){ DATA=d; render(); } })
    .catch(function(e){ if(String(e.message)!=='sign in'&&String(e.message)!=='401'){ document.getElementById('sub').textContent='could not reach the queue ('+e.message+')'; } });
}

function items(){
  var out=[];
  if(TAB!=='client'){ DATA.hiring.forEach(function(x){ out.push(['hiring',x]); }); }
  if(TAB!=='hiring'){ DATA.client.forEach(function(x){ out.push(['client',x]); }); }
  return out;
}

function tile(k,v,n,hl){
  return '<div class="tile'+(hl?' hl':'')+'"><div class="k">'+E(k)+'</div>'+
         '<div class="v">'+E(v)+'</div><div class="n">'+E(n)+'</div></div>';
}
function tab(id,label){
  return '<button class="tab" aria-selected="'+(TAB===id)+'" onclick="setTab(\\''+id+'\\')">'+E(label)+'</button>';
}

function render(){
  var c=DATA.counts||{}, h=c.hiring_new||0, cl=c.client_new||0;
  var all=DATA.hiring.concat(DATA.client);
  var ready=all.filter(function(x){return x.draftTailored;}).length;
  var done=(c.hiring_done||0)+(c.client_done||0)+(c.hiring_skipped||0)+(c.client_skipped||0);
  document.getElementById('sub').textContent=
    'All streams — live from the AIdeazz database · '+(h+cl)+' open items';
  document.getElementById('tiles').innerHTML=
    tile('Employers',h,'to apply to')+
    tile('Clients',cl,'to contact')+
    tile('Drafts ready',ready,'written for this one',true)+
    tile('Closed',done,'done or skipped');
  document.getElementById('tabs').innerHTML=
    tab('all','All ('+(h+cl)+')')+tab('hiring','Employer ('+h+')')+tab('client','Client ('+cl+')');
  var list=items();
  document.getElementById('rows').innerHTML = list.length
    ? list.map(function(p){ return row(p[0],p[1]); }).join('')
    : '<tr><td colspan="6" class="empty">Nothing waiting in this lane.</td></tr>';
}

function timelineHtml(){
  if(!RECORD){ return '<div class="quiet">Loading history…</div>'; }
  var t=RECORD.timeline||[];
  if(!t.length){ return '<div class="quiet">No history yet — this record has not been contacted or moved.</div>'; }
  return '<div class="tl">'+t.map(function(e){
    return '<div class="ev '+E(e.source)+'">'+
      '<div class="when">'+E(e.at)+'</div>'+
      '<div class="what">'+E(e.title)+'</div>'+
      (e.detail?'<div class="more">'+E(e.detail)+'</div>':'')+
      '</div>';
  }).join('')+'</div>';
}

function row(lane,x){
  var open=(OPEN===x.id);
  var badge = lane==='hiring'
    ? '<span class="badge hire">EMPLOYER</span>'
    : '<span class="badge client">CLIENT</span>';
  var pill = x.draftTailored
    ? '<span class="pill ok">written for this one'+(x.draftProvider?' · '+E(x.draftProvider):'')+'</span>'
    : '<span class="pill warn">'+E(x.draftReason||'boilerplate')+'</span>';
  var verb = lane==='hiring' ? 'Apply →' : 'Review &amp; send →';
  var html='<tr class="r'+(open?' open':'')+'" onclick="tog(\\''+x.id+'\\')">'+
    '<td>'+badge+'</td>'+
    '<td><div class="t">'+E(x.title)+'</div></td>'+
    '<td class="hideS c">'+E(x.company)+'</td>'+
    '<td class="sc">'+(x.score!=null?E(x.score):'—')+'</td>'+
    '<td class="hideS">'+pill+'</td>'+
    '<td class="hideS c">'+E(x.createdAt||'')+'</td></tr>';
  if(open){
    html+='<tr><td colspan="6" class="d">'+
      '<div class="sec">History</div>'+
      timelineHtml()+
      '<div class="sec">Draft</div>'+
      (x.draft?'<pre id="d-'+x.id+'">'+E(x.draft)+'</pre>':'<div class="quiet">No draft stored.</div>')+
      '<div class="row">'+
      (x.actionUrl?'<a class="btn primary" target="_blank" rel="noopener" href="'+E(x.actionUrl)+'">'+verb+'</a>':'')+
      (x.draft?'<button onclick="event.stopPropagation();cp(\\''+x.id+'\\')">Copy draft</button>':'')+
      '<button onclick="event.stopPropagation();act(\\''+x.id+'\\',\\'done\\')">Did it</button>'+
      '<button onclick="event.stopPropagation();act(\\''+x.id+'\\',\\'skipped\\')">Skip</button>'+
      (x.hubspotDealId?'<a class="btn" target="_blank" rel="noopener" href="https://app.hubspot.com/contacts/51409153/record/0-3/'+E(x.hubspotDealId)+'">HubSpot record</a>':'')+
      '</div></td></tr>';
  }
  return html;
}

function tog(id){
  if(OPEN===id){ OPEN=null; RECORD=null; render(); return; }
  OPEN=id; RECORD=null; render();
  q('api/record/'+id)
    .then(function(r){ return r.ok?r.json():null; }).catch(function(){ return null; })
    .then(function(d){ if(d && OPEN===id){ RECORD=d; render(); } });
}
function setTab(t){ TAB=t; OPEN=null; RECORD=null; render(); }
function cp(id){
  var el=document.getElementById('d-'+id);
  if(el&&navigator.clipboard){ navigator.clipboard.writeText(el.textContent); }
}
function act(id,status){
  q('api/act',{method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({id:id,status:status})}).then(function(){ OPEN=null; RECORD=null; load(); }).catch(function(){});
}
load();
</script></body></html>`;
}

/** The Oracle page, exactly as before: relative API, nginx's own basic-auth prompt. */
export const QUEUE_PAGE = renderQueuePage({ apiBase: 'api/', remote: false });
