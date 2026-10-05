// Audit (and with 'apply': fix) Make 6263197 Daily YouTube Upload - every lane's upload must read only from its own
// http:ActionGetFile. Backs up the live blueprint to ~/cto-aipa/backups/make first. Run on Oracle with MAKE_API_TOKEN/BASE
// exported from ~/cto-aipa/.env:  node scripts/make-6263197-lane-audit.cjs        (read-only table)
//                                  node scripts/make-6263197-lane-audit.cjs apply  (re-point + PATCH + diff)
const fs = require('fs');
const base = process.env.MAKE_API_BASE, H = { Authorization: 'Token ' + process.env.MAKE_API_TOKEN, 'Content-Type': 'application/json' };
const j = async (p, o = {}) => { const r = await fetch(base + p, { headers: H, ...o }); let t; try { t = await r.json(); } catch { t = {}; } return [r.status, t]; };
const APPLY = process.argv[2] === 'apply';
const audit = bp => {
  const router = bp.flow.find(m => m.module === 'builtin:BasicRouter'); const rows = [];
  router.routes.forEach((r, i) => {
    const [g, u] = r.flow; const s = JSON.stringify(u.mapper);
    const refs = [...new Set([...s.matchAll(/\{\{(\d+)\.(data|fileName)\}\}/g)].map(m => +m[1]))];
    rows.push({ lane: i + 1, filter: (g.filter || {}).name, idx: g.filter && g.filter.conditions[0][0].b, get: g.id, file: (g.mapper.url || '').split('/').pop(), upload: u.id, uploadReadsFrom: refs.join(','),
      ok: refs.length === 1 && refs[0] === g.id, fileName: u.mapper.fileName, title: (u.mapper.title || '').slice(0, 58), desc1: (u.mapper.description || '').split('\n')[0].slice(0, 60), tags: (u.mapper.tags || []).length, synth: u.mapper.containsSyntheticMedia, privacy: u.mapper.privacyStatus });
  });
  return rows;
};
(async () => {
  const [, cur] = await j('/scenarios/6263197/blueprint'); const bp = cur.response.blueprint;
  console.log('BEFORE'); console.table(audit(bp));
  if (!APPLY) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bk = process.env.HOME + `/cto-aipa/backups/make/blueprint-6263197-before-medtour-fix-${stamp}.json`;
  fs.writeFileSync(bk, JSON.stringify(cur)); console.log('backup', bk);
  const router = bp.flow.find(m => m.module === 'builtin:BasicRouter');
  for (const r of router.routes) {
    const [g, u] = r.flow; const s = JSON.stringify(u.mapper);
    const fixed = s.replace(/\{\{\d+\.data\}\}/g, `{{${g.id}.data}}`).replace(/\{\{\d+\.fileName\}\}/g, `{{${g.id}.fileName}}`);
    const m = JSON.parse(fixed); if (/^aigo-film-.*\.mp4$/.test(m.fileName || '')) m.fileName = `{{${g.id}.fileName}}`;
    if (JSON.stringify(m) !== s) { console.log('fix upload module', u.id, '-> reads from', g.id); u.mapper = m; }
  }
  const [ps, pt] = await j('/scenarios/6263197?confirmed=true', { method: 'PATCH', body: JSON.stringify({ blueprint: JSON.stringify(bp) }) });
  console.log('PATCH', ps, pt.message || '', pt.scenario && { invalid: pt.scenario.isinvalid, active: pt.scenario.isActive, next: pt.scenario.nextExec });
  const [, after] = await j('/scenarios/6263197/blueprint'); fs.writeFileSync('/tmp/6263197_after_medtour_fix.json', JSON.stringify(after));
  console.log('AFTER'); console.table(audit(after.response.blueprint));
  const flat = (o, p = '', out = {}) => { if (o && typeof o === 'object') for (const k of Object.keys(o)) flat(o[k], p ? p + '.' + k : k, out); else out[p] = o; return out; };
  const A = flat({ bp: cur.response.blueprint, sch: cur.response.scheduling }), B = flat({ bp: after.response.blueprint, sch: after.response.scheduling });
  const d = [...new Set([...Object.keys(A), ...Object.keys(B)])].filter(k => JSON.stringify(A[k]) !== JSON.stringify(B[k]) && !k.includes('.designer.samples'));
  console.log('changed keys (' + d.length + '):'); for (const k of d) console.log('  ', k, JSON.stringify(A[k]), '->', JSON.stringify(B[k]));
})().catch(e => console.log('ERR', e.message));
