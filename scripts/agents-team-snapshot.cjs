#!/usr/bin/env node
/**
 * agents-team-snapshot.cjs — the Team tab on aideazz.xyz/ops (1 Nov 2026).
 *
 * Elena: "a coworking space where I see all my agents — collaboration, conversation and results".
 * Built only from what the agents ALREADY write; it adds no channel and changes no agent:
 *   - alive?      pm2 / systemd / systemd --user (OpenClaw runs as a user service)
 *   - delivered   crm_event_log — every hand-off an agent makes into the shared memory, with its real
 *                 outcome (created / duplicate / skipped)
 *   - for you     daily_queue — what is waiting for Elena (kits and drafts, mirrored from HubSpot)
 *   - signals     the few log lines that are reliable: VJH "Found N new jobs", Algom "[Poll] Cycle done",
 *                 EspaLuz truth snapshot, OpenClaw model tier
 * Same shape as the EspaLuz lane: this writes data/agents-team.json, /queue/api/team only reads it.
 * READ ONLY: no HubSpot call, no write to any table, no restart.
 *
 *   node scripts/agents-team-snapshot.cjs          (cron every 10 min on Oracle)
 *   node scripts/agents-team-snapshot.cjs --print  (show the JSON instead of writing it)
 */
'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const oracledb = require('oracledb');
const db = require('../dist/database');

const HOME = process.env.HOME || '/home/ubuntu';
const OUT = path.join(__dirname, '..', 'data', 'agents-team.json');

// One card per agent. `sources` = the `source` values each agent writes into crm_event_log.
const AGENTS = [
  { id: 'cto', name: 'CTO AIPA', role: 'apply kits · code reviews · blog · leads', env: 'cto-aipa',
    procs: [['pm2', 'cto-aipa']], sources: ['cto_aipa', 'serpapi_search', 'hn_hiring', 'aideazz_inquiry_form', 'github', 'sprint'] },
  { id: 'vjh', name: 'VibeJobHunter', role: 'finds jobs · judges fit · spots employer replies', env: 'VibeJobHunterAIPA_AIMCF',
    procs: [['systemd', 'vibejobhunter'], ['systemd', 'vibejobhunter-web']], sources: ['vjh', 'serpapi_jobs', 'response_detector', 'vjh_review'] },
  { id: 'espaluz', name: 'EspaLuz', role: 'Spanish tutor · WhatsApp · Telegram · kids · influencer', env: 'EspaLuzWhatsApp',
    procs: [['systemd', 'espaluz-whatsapp'], ['systemd', 'espaluz-familybot'], ['systemd', 'espaluz-influencer']],
    sources: ['espaluz_whatsapp', 'espaluz_telegram', 'espaluz_influencer'] },
  { id: 'openclaw', name: 'OpenClaw', role: 'interview coach · study packs', env: null,
    procs: [['user', 'openclaw-gateway']], sources: ['openclaw'] },
  { id: 'atlas', name: 'Atlas', role: 'creative angles · Monday lead machine', env: 'whitespace',
    procs: [['pm2', 'whitespace']], sources: ['whitespace_tool', 'atlas', 'atlas_radar'] },
  { id: 'algom', name: 'Algom', role: 'X / Twitter · Web3 coach', env: 'dragontrade-agent',
    procs: [['pm2', 'dragontrade-main'], ['pm2', 'algom-poll'], ['pm2', 'algom-stream']], sources: ['algom_alpha', 'algom'] },
];
const BY_SOURCE = {};
for (const a of AGENTS) for (const s of a.sources) BY_SOURCE[s] = a.id;

const sh = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return ''; } };
const iso = (ms) => (Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null);

function processes() {
  const pm2 = {};
  try { for (const p of JSON.parse(sh('pm2', ['jlist']) || '[]')) pm2[p.name] = { up: p.pm2_env.status === 'online', since: iso(p.pm2_env.pm_uptime) }; } catch { /* pm2 missing */ }
  const unit = (user, name) => {
    const args = [...(user ? ['--user'] : []), 'show', name, '-p', 'ActiveState', '-p', 'ActiveEnterTimestamp'];
    const o = sh('systemctl', args);
    const since = Date.parse((o.match(/ActiveEnterTimestamp=(.+)/) || [])[1] || '');
    return { up: /ActiveState=active/.test(o), since: iso(since) };
  };
  return (kind, name) => (kind === 'pm2' ? pm2[name] || { up: false, since: null } : unit(kind === 'user', name));
}

function envTier(dir) {
  if (!dir) return null;
  try { return (fs.readFileSync(path.join(HOME, dir, '.env'), 'utf8').match(/^MODEL_TIER=(\w+)/m) || [])[1] || null; } catch { return null; }
}

// Reliable log signals only. Rotated pm2 logs are NOT counted (cto-aipa keeps ~400 lines).
function signals() {
  const out = {};
  const vjh = sh('sudo', ['-n', 'journalctl', '-u', 'vibejobhunter', '--since', '-24 h', '--no-pager', '-o', 'cat']);
  const found = [...vjh.matchAll(/Found (\d+) new jobs?/g)].reduce((n, m) => n + Number(m[1]), 0);
  out.vjh = `${found} new job${found === 1 ? '' : 's'} found in 24 h`;
  try {
    const lines = fs.readFileSync(path.join(HOME, '.pm2', 'logs', 'algom-poll-out.log'), 'utf8').trim().split('\n');
    const last = lines.reverse().find((l) => l.includes('[Poll] Cycle done'));
    if (last) out.algom = `last X cycle ${last.slice(11, 16)} UTC: ${last.split('—')[1].trim()}`;
  } catch { /* no log */ }
  try {
    const e = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'espaluz-truth.json'), 'utf8')).summary || {};
    out.espaluz = `${e.real_people ?? '?'} real users · ${e.alive_30d ?? '?'} active this month · ${e.paid_active ?? 0} paying`;
  } catch { /* snapshot missing */ }
  try {
    const t = JSON.parse(fs.readFileSync(path.join(HOME, '.openclaw', 'private', 'model-tier.json'), 'utf8'));
    out.openclaw = `model mode: ${t.tier}`;
  } catch { /* no state */ }
  return out;
}

async function rows(conn, sql) {
  return (await conn.execute(sql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows || [];
}

(async () => {
  const proc = processes();
  const sig = signals();
  const conn = await db.getPoolConnection();
  let events, queue;
  try {
    // The conversation: every hand-off into the shared memory, last 7 days.
    events = await rows(conn, `
      SELECT e.source, e.event_type, e.pipeline, e.status, e.hubspot_deal_id,
             TO_CHAR(e.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at, q.title, q.company
        FROM crm_event_log e
        LEFT JOIN daily_queue q ON q.hubspot_deal_id = e.hubspot_deal_id
       WHERE e.created_at > SYSTIMESTAMP - INTERVAL '7' DAY
       ORDER BY e.created_at DESC`);
    // What is waiting for Elena, and what was handed to her in the last 7 days.
    queue = await rows(conn, `
      SELECT lane, title, company, status, draft_tailored, draft_provider,
             TO_CHAR(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at
        FROM daily_queue
       WHERE status = 'new' OR created_at > SYSTIMESTAMP - INTERVAL '7' DAY`);
  } finally { await conn.close(); }

  const waiting = queue.filter((x) => x.STATUS === 'new');
  const forElena = { hiring: waiting.filter((x) => x.LANE === 'hiring').length, client: waiting.filter((x) => x.LANE === 'client').length };
  sig.cto = `${forElena.hiring} jobs + ${forElena.client} clients ready for you`;
  const day = Date.now() - 24 * 3600e3;
  const agents = AGENTS.map((a) => {
    const ps = a.procs.map(([k, n]) => ({ name: n, ...proc(k, n) }));
    const mine = events.filter((e) => BY_SOURCE[e.SOURCE] === a.id);
    const created = mine.filter((e) => e.STATUS === 'created');
    return {
      id: a.id, name: a.name, role: a.role,
      up: ps.every((p) => p.up), processes: ps,
      tier: envTier(a.env),
      delivered24h: created.filter((e) => Date.parse(e.AT) > day).length,
      delivered7d: created.length,
      alreadyKnown7d: mine.length - created.length,
      lastHandoff: mine[0] ? mine[0].AT : null,
      signal: sig[a.id] || null,
    };
  });

  // A CRM company field sometimes holds an email address; the team feed shows organisations, not people.
  const clean = (t) => (t ? String(t).replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '').replace(/\s*[—-]\s*$/, '').trim() || null : null);
  const name = (s) => (AGENTS.find((a) => a.id === BY_SOURCE[s]) || {}).name || s;
  const what = (e) => [e.EVENT_TYPE, e.PIPELINE].filter(Boolean).join(' · ');
  const feed = [
    ...events.slice(0, 60).map((e) => ({
      at: e.AT, from: name(e.SOURCE), to: 'shared memory (HubSpot)', what: what(e) || e.SOURCE,
      item: clean([e.TITLE, e.COMPANY].filter(Boolean).join(' — ')), outcome: e.STATUS,
    })),
    ...queue.filter((x) => x.STATUS === 'new' && Date.parse(x.AT) > Date.now() - 7 * 86400e3).slice(0, 40).map((x) => ({
      at: x.AT, from: x.LANE === 'hiring' ? 'CTO AIPA (apply kit)' : 'CTO AIPA', to: 'Elena',
      what: x.LANE === 'hiring' ? 'ready to apply' : 'ready to contact',
      item: clean([x.TITLE, x.COMPANY].filter(Boolean).join(' — ')),
      outcome: x.DRAFT_TAILORED ? `draft written${x.DRAFT_PROVIDER ? ' by ' + x.DRAFT_PROVIDER : ''}` : 'no tailored draft',
    })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 80);

  const snap = {
    checked_at: new Date().toISOString(),
    agents,
    forElena,
    feed,
    unmapped: [...new Set(events.map((e) => e.SOURCE).filter((s) => !BY_SOURCE[s]))],
  };
  if (process.argv.includes('--print')) return console.log(JSON.stringify(snap, null, 2));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(`${OUT}.tmp`, JSON.stringify(snap));
  fs.renameSync(`${OUT}.tmp`, OUT); // atomic: the route never reads a half-written file
  console.log(`${snap.checked_at} team snapshot: ${agents.filter((a) => a.up).length}/${agents.length} up, ${feed.length} feed events, unmapped=${snap.unmapped.join(',') || 'none'}`);
})().catch((e) => { console.log(`⚠️ team snapshot failed: ${e.message}`); process.exitCode = 1; })
  .finally(() => setTimeout(() => process.exit(process.exitCode || 0), 500));
