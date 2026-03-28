#!/usr/bin/env node
/**
 * Ask CTO AIPA - Quick CLI to get advice from your AI Tech Co-Founder
 * Usage: node scripts/ask-cto.js "Your question here"
 *    or: npm run ask-cto -- "Your question here"
 *
 * Set CTO_AIPA_URL in .env (e.g. http://YOUR_SERVER_IP:3000) or it will prompt.
 */

require('dotenv').config();
const baseUrl = process.env.CTO_AIPA_URL || process.env.CTO_AIPA_URL_LOCAL || 'http://localhost:3000';

const question = process.argv.slice(2).join(' ').trim();
if (!question) {
  console.log(`
🤖 Ask CTO AIPA - Your AI Technical Co-Founder

Usage:
  npm run ask-cto -- "Your technical question here"
  node scripts/ask-cto.js "Should I use PostgreSQL or MongoDB?"

Examples:
  npm run ask-cto -- "How should I structure auth for EspaLuz?"
  npm run ask-cto -- "Review my approach: [describe]"

Optional: In .env set CTO_AIPA_URL=http://YOUR_SERVER:3000
          (e.g. your Oracle Cloud IP or production URL)
`);
  process.exit(1);
}

async function ask() {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/ask-cto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });
    if (!res.ok) {
      console.error(`\n❌ CTO AIPA returned ${res.status}. Is the server running at ${baseUrl}?`);
      console.error('   Start the server with: npm run start');
      console.error('   Or set CTO_AIPA_URL in .env to your production URL.');
      process.exit(1);
    }
    const data = await res.json();
    console.log('\n🤖 CTO AIPA:\n');
    console.log(data.answer || data.error || JSON.stringify(data));
    console.log('');
  } catch (err) {
    console.error('\n❌ Could not reach CTO AIPA:', err.message);
    console.error(`   URL: ${baseUrl}`);
    console.error('   Tip: Run the server locally (npm run start) or set CTO_AIPA_URL in .env');
    process.exit(1);
  }
}

ask();
