// READ-ONLY inventory of every Make.com scenario (GET only — changes nothing).
// Run on Oracle:  cd ~/cto-aipa && set -a && . ./.env && set +a && node scripts/make-scenarios-inventory.cjs [--blueprint=<id>]
// Prints: org/team, credits used, then one line per scenario (id, active, schedule, last edit, apps used).
// --blueprint=<id> also prints that scenario's modules with their mapped text fields (to find where a caption comes from).
const base = (process.env.MAKE_API_BASE || '').replace(/\/$/, '');
const H = { Authorization: 'Token ' + process.env.MAKE_API_TOKEN };
if (!base || !process.env.MAKE_API_TOKEN) { console.error('MAKE_API_BASE / MAKE_API_TOKEN missing'); process.exit(1); }
const get = async (p) => { const r = await fetch(base + p, { headers: H }); if (!r.ok) throw new Error(`${p} → ${r.status} ${await r.text()}`); return r.json(); };
const bpArg = (process.argv.find(a => a.startsWith('--blueprint=')) || '').split('=')[1];

(async () => {
  const orgs = (await get('/organizations')).organizations || [];
  for (const o of orgs) {
    let usage = ''; try { const od = (await get(`/organizations/${o.id}`)).organization; usage = `ops ${od.operations ?? '?'} / ${od.license?.operations ?? '?'}`; } catch {}
    console.log(`ORG ${o.id} ${o.name} ${usage}`);
    const teams = (await get(`/teams?organizationId=${o.id}`)).teams || [];
    for (const t of teams) {
      console.log(` TEAM ${t.id} ${t.name}`);
      const sc = (await get(`/scenarios?teamId=${t.id}&pg[limit]=200`)).scenarios || [];
      for (const s of sc.sort((a, b) => a.id - b.id)) {
        const sched = s.scheduling ? (s.scheduling.type === 'indefinitely' ? `every ${s.scheduling.interval}s` : `${s.scheduling.type}${s.scheduling.time ? ' ' + s.scheduling.time : ''}`) : '-';
        console.log(`  ${s.id}\t${s.isActive ? 'ACTIVE ' : 'stopped'}\t${s.isinvalid ? 'INVALID ' : ''}${sched}\tedited ${String(s.lastEdit || '').slice(0, 10)}\t${s.name}\t[${(s.usedPackages || []).join(',')}]`);
      }
    }
  }
  if (bpArg) {
    const bp = (await get(`/scenarios/${bpArg}/blueprint`)).response.blueprint;
    const walk = (flow, depth = 0) => (flow || []).forEach(m => {
      const txt = JSON.stringify(m.mapper || {}).replace(/"(token|apiKey|access_token|Authorization)":"[^"]*"/gi, '"$1":"<redacted>"').replace(/Bearer [A-Za-z0-9._-]+/g, 'Bearer <redacted>');
      console.log(`${'  '.repeat(depth)}#${m.id} ${m.module}  ${txt.slice(0, 1500)}`);
      (m.routes || []).forEach(r => walk(r.flow, depth + 1));
    });
    console.log(`\nBLUEPRINT ${bpArg} — ${bp.name}`); walk(bp.flow);
  }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
