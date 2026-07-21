#!/usr/bin/env node
/**
 * atlas-campaign-alert.cjs — #3: Atlas ENTER window -> outbound campaign alert.
 *
 * When one of Elena's SERVICE lanes opens (state ENTER, or a strong non-AVOID window
 * >= threshold), Telegram her a ready-to-run OUTBOUND brief for that service — the live
 * market angle + hook/headline/CTA + the ad-library evidence link. She adapts it into a
 * WhatsApp/email campaign or a Concierge draft. This is the "Atlas serves my sales" arm:
 * the moment a market for a service she sells opens, she gets the play.
 *
 * Reuses the #1 endpoint: GET {ATLAS}/api/atlas/angle?vertical=<lane>.
 * Dedup by (vertical + snapshot_date) in data/ (gitignored) so a window alerts ONCE.
 * ADDITIVE + STANDALONE: no running service touched, no existing file modified. Cron on
 * Oracle after the weekly Atlas capture.
 *
 * Env (read from .env): TELEGRAM_BOT_TOKEN, CONCIERGE_TG_CHAT (or ATLAS_TELEGRAM_CHAT_ID),
 *   ATLAS_PUBLIC_BASE (default https://webhook.aideazz.xyz/whitespace),
 *   ATLAS_ALERT_SCORE (default 60).
 * Flags: --dry-run (print, don't send).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const env = fs.existsSync(path.join(root, '.env')) ? fs.readFileSync(path.join(root, '.env'), 'utf8') : '';
const g = (k) => (env.match(new RegExp('^' + k + '=(.+)$', 'm')) || [])[1]?.trim();

const TG = g('TELEGRAM_BOT_TOKEN');
const CHAT = g('CONCIERGE_TG_CHAT') || g('ATLAS_TELEGRAM_CHAT_ID');
const ATLAS = (g('ATLAS_PUBLIC_BASE') || 'https://webhook.aideazz.xyz/whitespace').replace(/\/$/, '');
const THRESHOLD = Number(g('ATLAS_ALERT_SCORE') || 60);
const DRY = process.argv.includes('--dry-run');

// Elena's service lanes (WHITESPACE_CAPTURE_ONLY) -> the human service label.
const SERVICE = {
  whatsapp_ai_agents: 'WhatsApp/Telegram AI agents',
  ai_automation: 'End-to-end AI automation',
  geo_aeo_tech_seo_makers: 'AI search visibility (GEO/AEO/SEO)',
  ai_film_making_studios: 'AI video generation',
  ai_marketing_studios: 'AI marketing',
  ai_augmented_product_building: 'AI product building',
  fractional_cto: 'Fractional CTO',
};
const LANES = Object.keys(SERVICE);
const STATE = path.join(root, 'data', 'atlas-campaign-alert.json');

async function tg(text) {
  const r = await fetch(`https://api.telegram.org/bot${TG}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT, text: text.slice(0, 4090), disable_web_page_preview: true }),
  });
  if (!r.ok) throw new Error(`TG ${r.status}: ${(await r.text()).slice(0, 160)}`);
}

async function main() {
  if (!DRY && (!TG || !CHAT)) {
    console.error('atlas-campaign-alert: TELEGRAM_BOT_TOKEN / CONCIERGE_TG_CHAT missing — nothing sent');
    process.exit(0);
  }
  let state = {};
  try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { /* first run */ }

  let alerts = 0;
  for (const v of LANES) {
    let a;
    try {
      const res = await fetch(`${ATLAS}/api/atlas/angle?vertical=${encodeURIComponent(v)}`, { signal: AbortSignal.timeout(15000) });
      a = await res.json();
    } catch (e) {
      console.warn(`  ${v}: fetch failed — ${String(e).slice(0, 80)}`);
      continue;
    }
    if (!a || !a.ok) continue;
    const strong = a.state === 'ENTER' || (a.score != null && a.score >= THRESHOLD && a.state !== 'AVOID');
    if (!strong) { console.log(`  ${v}: ${a.state} ${a.score ?? '?'} — no window`); continue; }

    const key = `${v}:${a.snapshot_date}`;
    if (state[key]) { console.log(`  ${v}: already alerted (${key})`); continue; }

    const c = a.concept || {};
    const msg = [
      `🔥 ATLAS — your "${SERVICE[v] || v}" market just opened`,
      `Angle: ${a.angle} · ${a.state} (${a.score ?? '?'}/100)`,
      a.why ? `Why: ${a.why}` : '',
      '',
      c.hook ? `Hook: ${c.hook}` : '',
      c.headline ? `Headline: ${c.headline}` : '',
      c.cta ? `CTA: ${c.cta}` : '',
      '',
      a.evidence_url ? `Evidence: ${a.evidence_url}` : '',
      `Board: ${ATLAS}/atlas.html`,
      '',
      `→ Ready-to-run outbound angle for ${SERVICE[v] || v}. Adapt into a WhatsApp/email campaign or a Concierge draft while the window is open.`,
    ].filter(Boolean).join('\n');

    if (DRY) {
      console.log(`--- WOULD ALERT (${key}) ---\n${msg}\n`);
      alerts++;
      continue;
    }
    try {
      await tg(msg);
      state[key] = new Date().toISOString();
      alerts++;
      console.log(`  ${v}: ALERTED (${key})`);
    } catch (e) {
      console.error(`  ${v}: TG send failed — ${String(e).slice(0, 120)}`);
    }
  }

  if (!DRY) {
    fs.mkdirSync(path.dirname(STATE), { recursive: true });
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  }
  console.log(`atlas-campaign-alert done · ${alerts} ${DRY ? 'would-alert' : 'new alert(s)'} · threshold=${THRESHOLD}`);
}

main().catch((e) => { console.error('atlas-campaign-alert fatal:', e); process.exit(1); });
