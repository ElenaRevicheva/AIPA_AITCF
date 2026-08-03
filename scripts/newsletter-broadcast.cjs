#!/usr/bin/env node
/**
 * Send one newsletter issue to every confirmed subscriber.
 *
 *   node scripts/newsletter-broadcast.cjs --subject "..." --html-file issue.html
 *   node scripts/newsletter-broadcast.cjs --subject "..." --md-file issue.md
 *   node scripts/newsletter-broadcast.cjs --subject "..." --md-file issue.md --dry-run
 *   node scripts/newsletter-broadcast.cjs --subject "..." --md-file issue.md --test me@example.com
 *
 * Sends one message per subscriber rather than one message with many recipients,
 * because every copy carries that person's own unsubscribe link — and because a
 * shared To: header would expose the whole list to everyone on it.
 *
 * Defaults to a dry run only when asked; sending is explicit and prints the list
 * size before it starts, so a mistaken subject line is catchable at the prompt.
 *
 * Requires a build first (`npm run build`) — it reads dist/newsletter-store.js.
 */

const fs = require('fs');
const path = require('path');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

try {
  require('dotenv').config();
} catch {
  /* dotenv is optional; PM2 supplies the environment in production */
}

const PUBLIC_BASE = (process.env.CTO_AIPA_PUBLIC_URL || 'https://webhook.aideazz.xyz/cto').replace(/\/$/, '');
const FROM = process.env.NEWSLETTER_FROM || 'AIdeazz <aipa@aideazz.xyz>';

function resendKey() {
  return (process.env.RESEND_API_KEY || process.env.RESEND_KEY || '').trim();
}

/** Deliberately small: bold, links, headings, paragraphs. Anything richer belongs in an HTML file. */
function miniMarkdown(md) {
  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .split(/\n{2,}/)
    .map((block) => {
      const b = block.trim();
      if (!b) return '';
      const h = b.match(/^(#{1,3})\s+(.*)$/);
      if (h) {
        const level = h[1].length + 1;
        return `<h${level} style="margin:24px 0 8px">${inline(h[2])}</h${level}>`;
      }
      return `<p style="margin:0 0 16px">${inline(b).replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');
}

function inline(s) {
  return s
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#2563eb">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:#f1f5f9;padding:2px 5px;border-radius:4px">$1</code>');
}

function wrap(bodyHtml, unsubscribeUrl) {
  return `<div style="font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:620px;margin:0 auto;padding:24px">
${bodyHtml}
<hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 16px">
<p style="font-size:13px;color:#6b7280;margin:0">
  You are getting this because you confirmed a subscription at
  <a href="https://aideazz.xyz/portfolio" style="color:#6b7280">aideazz.xyz/portfolio</a>.<br>
  <a href="${unsubscribeUrl}" style="color:#6b7280">Unsubscribe</a>
</p>
</div>`;
}

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function sendOne(to, subject, html, text) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).id;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const subject = arg('subject');
  const htmlFile = arg('html-file');
  const mdFile = arg('md-file');
  const testTo = arg('test');
  const dryRun = has('dry-run');

  if (!subject || (!htmlFile && !mdFile)) {
    console.error('Usage: newsletter-broadcast.cjs --subject "..." (--md-file f.md | --html-file f.html) [--test you@x.com] [--dry-run]');
    process.exit(1);
  }
  if (!dryRun && !resendKey()) {
    console.error('RESEND_API_KEY (or RESEND_KEY) is not set — nothing can be sent.');
    process.exit(1);
  }

  const sourceFile = htmlFile || mdFile;
  const raw = fs.readFileSync(path.resolve(sourceFile), 'utf8');
  const bodyHtml = htmlFile ? raw : miniMarkdown(raw);

  // A test send goes to one address with a dead unsubscribe link, so proofreading
  // never risks removing a real subscriber.
  if (testTo) {
    const html = wrap(bodyHtml, `${PUBLIC_BASE}/v1/newsletter/unsubscribe?token=test`);
    if (dryRun) {
      console.log(`[dry-run] would send test to ${testTo}\n---\n${stripHtml(html).slice(0, 800)}`);
      return;
    }
    const id = await sendOne(testTo, subject, html, stripHtml(html));
    console.log(`Test sent to ${testTo} (${id})`);
    return;
  }

  const { listConfirmed, markSent } = require('../dist/newsletter-store.js');
  const subs = await listConfirmed();
  console.log(`Confirmed subscribers: ${subs.length}`);
  if (subs.length === 0) {
    console.log('Nobody to send to. Stopping.');
    return;
  }

  if (dryRun) {
    console.log(`[dry-run] subject: ${subject}`);
    console.log(`[dry-run] would send to ${subs.length} address(es): ${subs.map((s) => s.email).join(', ')}`);
    console.log(`---\n${stripHtml(wrap(bodyHtml, `${PUBLIC_BASE}/v1/newsletter/unsubscribe?token=EXAMPLE`)).slice(0, 1200)}`);
    return;
  }

  const sent = [];
  const failed = [];
  for (const sub of subs) {
    const html = wrap(bodyHtml, `${PUBLIC_BASE}/v1/newsletter/unsubscribe?token=${encodeURIComponent(sub.unsubscribeToken)}`);
    try {
      await sendOne(sub.email, subject, html, stripHtml(html));
      sent.push(sub.email);
      process.stdout.write('.');
    } catch (err) {
      failed.push({ email: sub.email, error: err.message });
      process.stdout.write('x');
    }
    await sleep(600); // stay inside Resend's per-second budget
  }
  process.stdout.write('\n');

  if (sent.length > 0) await markSent(sent);
  console.log(`Sent ${sent.length}/${subs.length}.`);
  if (failed.length > 0) {
    console.log('Failed:');
    for (const f of failed) console.log(`  ${f.email}: ${f.error}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Broadcast failed:', err.message);
    process.exit(1);
  });
