/**
 * Live smoke test: Google Places API (New) — Text Search.
 * Run: npm run test:places
 * Writes REAL results to disk so you can open them in the editor or browser.
 *
 * Output files (repo root / data/):
 *   - places-live-test.txt   — human-readable
 *   - places-live-test.json  — full API response (no secrets)
 *   - places-live-test.html  — open in browser
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';

async function main() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) {
    console.error('Missing GOOGLE_PLACES_API_KEY in .env');
    process.exit(1);
  }

  const textQuery =
    process.argv.slice(2).join(' ').trim() ||
    'AI automation agencies Panama City';

  const regionCode =
    process.env.GOOGLE_PLACES_REGION?.trim() ||
    (/\bpanama\b/i.test(textQuery) ? 'PA' : undefined);

  const body = {
    textQuery,
    maxResultCount: 10,
    languageCode: process.env.GOOGLE_PLACES_LANGUAGE?.trim() || 'en',
  };
  if (regionCode) body.regionCode = regionCode;

  const outDir = path.join(ROOT, 'data');
  fs.mkdirSync(outDir, { recursive: true });

  const banner = `
╔══════════════════════════════════════════════════════════════════╗
║  GOOGLE PLACES API — LIVE REQUEST (real data from Google)        ║
╚══════════════════════════════════════════════════════════════════╝
`;
  console.log(banner);
  console.log('Query     :', textQuery);
  console.log('regionCode:', regionCode || '(none)');
  console.log('Key ends  :', `…${apiKey.slice(-4)}`);
  console.log('');

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.name,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber',
    },
    body: JSON.stringify(body),
  });

  const rawText = await res.text();
  if (!res.ok) {
    console.error('HTTP', res.status, rawText.slice(0, 800));
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    console.error('Invalid JSON:', rawText.slice(0, 500));
    process.exit(1);
  }

  const places = data.places || [];
  const iso = new Date().toISOString();

  // --- JSON file (no API key)
  const jsonPath = path.join(outDir, 'places-live-test.json');
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: iso,
        endpoint: ENDPOINT,
        requestBody: body,
        response: data,
      },
      null,
      2
    ),
    'utf8'
  );

  // --- Plain text report
  let txt = `GOOGLE PLACES LIVE TEST — ${iso}\n`;
  txt += `Endpoint: ${ENDPOINT}\n`;
  txt += `Query: ${textQuery}\n`;
  txt += `regionCode: ${regionCode || '(none)'}\n`;
  txt += `Results: ${places.length} place(s)\n\n`;

  if (places.length === 0) {
    txt += 'No places returned.\n';
  }

  places.forEach((p, i) => {
    const name = p.displayName?.text || '(no name)';
    const addr = p.formattedAddress || '—';
    const web = p.websiteUri || '—';
    const phone = p.nationalPhoneNumber || '—';
    txt += `${i + 1}. ${name}\n`;
    txt += `   Address: ${addr}\n`;
    txt += `   Website: ${web}\n`;
    txt += `   Phone:   ${phone}\n`;
    txt += `   Resource: ${p.name || '—'}\n\n`;
  });

  const txtPath = path.join(outDir, 'places-live-test.txt');
  fs.writeFileSync(txtPath, txt, 'utf8');

  // --- HTML (open in browser)
  const rows = places
    .map((p, i) => {
      const name = escapeHtml(p.displayName?.text || '(no name)');
      const addr = escapeHtml(p.formattedAddress || '—');
      const web = p.websiteUri
        ? `<a href="${escapeHtml(p.websiteUri)}">${escapeHtml(p.websiteUri)}</a>`
        : '—';
      const phone = escapeHtml(p.nationalPhoneNumber || '—');
      const resId = escapeHtml(p.name || '—');
      return `<tr><td>${i + 1}</td><td><strong>${name}</strong></td><td>${addr}</td><td>${web}</td><td>${phone}</td><td><code>${resId}</code></td></tr>`;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Places live test — ${escapeHtml(iso)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; background: #0f1419; color: #e7e9ea; }
    h1 { color: #1d9bf0; }
    table { border-collapse: collapse; width: 100%; margin-top: 16px; }
    th, td { border: 1px solid #38444d; padding: 10px; text-align: left; vertical-align: top; }
    th { background: #16181c; }
    code { font-size: 11px; word-break: break-all; }
    .meta { color: #8b98a5; font-size: 14px; }
  </style>
</head>
<body>
  <h1>Real data from Google Places API (New)</h1>
  <p class="meta">Generated ${escapeHtml(iso)} · Query: <strong>${escapeHtml(textQuery)}</strong> · ${places.length} result(s)</p>
  <p class="meta">Same API family as Telegram <code>/places_ingest</code> in CTO AIPA.</p>
  <table>
    <thead><tr><th>#</th><th>Name</th><th>Address</th><th>Website</th><th>Phone</th><th>Resource ID</th></tr></thead>
    <tbody>
${rows || '<tr><td colspan="6">No results</td></tr>'}
    </tbody>
  </table>
</body>
</html>`;

  const htmlPath = path.join(outDir, 'places-live-test.html');
  fs.writeFileSync(htmlPath, html, 'utf8');

  // Console
  console.log(`Results: ${places.length} place(s)\n`);
  places.forEach((p, i) => {
    const name = p.displayName?.text || '(no name)';
    console.log(`${i + 1}. ${name}`);
    console.log(`   ${p.formattedAddress || '—'}`);
    console.log('');
  });

  const abs = {
    txt: path.resolve(txtPath),
    json: path.resolve(jsonPath),
    html: path.resolve(htmlPath),
  };

  console.log('────────────────────────────────────────────────────────────');
  console.log('SAVED — open these files to see the same real data:');
  console.log('  ', abs.txt);
  console.log('  ', abs.json);
  console.log('  ', abs.html, '  ← double-click to open in browser');
  console.log('────────────────────────────────────────────────────────────');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
