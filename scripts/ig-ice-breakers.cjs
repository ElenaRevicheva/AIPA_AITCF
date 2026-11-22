#!/usr/bin/env node
/**
 * Install (or read back) the EspaLuz Instagram ice breakers — the "start a chat" buttons a person sees when they open
 * a DM with @elena_revicheva (22 Nov 2026). Texts live in src/ig-dm-chat.ts (ICE_BREAKERS); the answers to a tap are
 * sent by the webhook. Uses the Page token in .ig-token.json (Unified login, graph.facebook.com).
 *   node scripts/ig-ice-breakers.cjs          # read what Instagram shows now
 *   node scripts/ig-ice-breakers.cjs --apply  # set them
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const tok = JSON.parse(fs.readFileSync(path.join(ROOT, '.ig-token.json'), 'utf8'));
const token = tok.page_access_token;
if (!token) throw new Error('.ig-token.json has no page_access_token');
const { ICE_BREAKERS } = require(path.join(ROOT, 'dist', 'ig-dm-chat.js'));
const BASE = 'https://graph.facebook.com/v23.0/me/messenger_profile';

(async () => {
  if (process.argv.includes('--apply')) {
    const body = {
      platform: 'instagram',
      ice_breakers: [{ call_to_actions: ICE_BREAKERS.map((b) => ({ question: b.question, payload: b.payload })), locale: 'default' }],
    };
    const r = await fetch(`${BASE}?platform=instagram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    console.log('set:', r.status, (await r.text()).slice(0, 200));
  }
  const g = await fetch(`${BASE}?platform=instagram&fields=ice_breakers`, { headers: { Authorization: `Bearer ${token}` } });
  console.log('now:', g.status, (await g.text()).slice(0, 600));
})();
