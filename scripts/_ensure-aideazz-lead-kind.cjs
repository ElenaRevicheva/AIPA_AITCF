/**
 * Stamp existing test contacts with [AIDEAZZ-FORM] so Make's filter can pass
 * even before the next form submit recreates them.
 * Usage: node scripts/_ensure-aideazz-lead-kind.cjs
 */
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const key = env.match(/^HUBSPOT_API_KEY=(.+)$/m)?.[1]?.trim();
if (!key) throw new Error('HUBSPOT_API_KEY missing');

const STAMP = '[AIDEAZZ-FORM]';
const TESTS = (
  env.match(/^CONCIERGE_TEST_EMAILS=(.+)$/m)?.[1]?.trim() ||
  'adamvelena@gmail.com,marinakulaginabowen@gmail.com,kiravelerevich@gmail.com'
)
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

async function hs(method, p, body) {
  const r = await fetch(`https://api.hubapi.com${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  return { status: r.status, json, text };
}

(async () => {
  for (const email of TESTS) {
    const search = await hs('POST', '/crm/v3/objects/contacts/search', {
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
      properties: ['email', 'message'],
      limit: 1,
    });
    const hit = search.json?.results?.[0];
    if (!hit) {
      console.log(`skip ${email} — no contact yet (next form submit will create+stamp)`);
      continue;
    }
    const msg = hit.properties?.message || '';
    const next = msg.startsWith(STAMP) ? msg : `${STAMP} ${msg}`.trim().slice(0, 5000);
    const patch = await hs('PATCH', `/crm/v3/objects/contacts/${hit.id}`, {
      properties: { message: next },
    });
    console.log(
      patch.status >= 200 && patch.status < 300
        ? `stamped ${email} (${hit.id}) message starts with ${STAMP}`
        : `FAIL stamp ${email}: ${patch.status} ${patch.text.slice(0, 120)}`,
    );
  }
})();
