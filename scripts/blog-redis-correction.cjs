#!/usr/bin/env node
/**
 * Correct the fabricated-Redis passages in published blog articles (incident
 * 2026-08-23-blog-invented-its-stack). Correction, never deletion: the article
 * stays, the passages that claim this system runs Redis are removed, and a dated
 * correction note is inserted after the first paragraph.
 *
 * Two sources, same rule set, because the article lives twice:
 *   --html <aideazz repo>   edits public/blog/<slug>/index.html in place (what is live)
 *   --cache <json>          edits the publisher's blog-posts-cache.json markdown (what a
 *                           regenerate or the Spanish translation would read)
 * Dry run by default; --apply writes. A .bak-<date> copy is written before any change.
 *
 * A block is removed only when it AFFIRMS Redis as part of this system. Negations
 * ("no Redis/RabbitMQ"), the incident field notes, and generic mentions stay.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const DATE = "28 October 2026";
const STAMP = "20261028";
const REDIS = /\b(redis|setnx|redissaver|oci cache)\b/i;
const LEGIT = [
  /\bno redis\b/i, /\bnot redis\b/i, /\bwithout redis\b/i, /\bnever (used|ran|run) redis\b/i,
  /\bredis\/rabbitmq\b/i, /\bhow to use redis cache\b/i,
  /\bredis\b[^.]{0,40}\b(company|vendor|applicant)/i, /\binvented\b/i, /\bfabricat/i, /\bcorrection\b/i,
  /\bmisconfigured redis instance\b/i, // a story about a client's chatbot, not this stack
];
const SKIP_SLUGS = new Set(["blog-invented-its-stack-field-note", "the-generator-that-refused-field-note"]);

const NOTE_MD =
  `**Correction (${DATE}):** an earlier version of this article described Redis (locks, caches, queues) as part of this system. It is not: the pipeline it described runs LangGraph with SQLite checkpointing (\`langgraph-checkpoint-sqlite\`), and no Redis package is installed anywhere in this system. Those passages were written by a fallback model during a credit outage and have been removed. The full account: [The blog that invented its own infrastructure](https://aideazz.xyz/blog/blog-invented-its-stack-field-note/).`;
const NOTE_HTML =
  `<p class="correction"><strong>Correction (${DATE}):</strong> an earlier version of this article described Redis (locks, caches, queues) as part of this system. It is not: the pipeline it described runs LangGraph with SQLite checkpointing (<code>langgraph-checkpoint-sqlite</code>), and no Redis package is installed anywhere in this system. Those passages were written by a fallback model during a credit outage and have been removed. The full account: <a href="https://aideazz.xyz/blog/blog-invented-its-stack-field-note/">The blog that invented its own infrastructure</a>.</p>`;

const affirms = (text) => REDIS.test(text) && !LEGIT.some((re) => re.test(text));

// ── markdown ────────────────────────────────────────────────────────────────
function correctMarkdown(md) {
  if (/Correction \(/.test(md)) return { md, removed: 0, changed: false };
  const lines = md.split("\n");
  const out = [];
  let removed = 0;
  let i = 0;
  let noteInserted = false;
  const isHeading = (l) => /^#{1,6}\s/.test(l);
  const isList = (l) => /^\s*([-*+]|\d+\.)\s/.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) { // fenced block as one unit
      let j = i + 1;
      while (j < lines.length && !/^```/.test(lines[j])) j++;
      const block = lines.slice(i, j + 1);
      if (affirms(block.join("\n"))) removed++; else out.push(...block);
      i = j + 1; continue;
    }
    if (isList(l)) { // one list item = line + continuation lines
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== "" && !isList(lines[j]) && !isHeading(lines[j]) && !/^```/.test(lines[j])) j++;
      const item = lines.slice(i, j);
      if (affirms(item.join("\n"))) removed++; else out.push(...item);
      i = j; continue;
    }
    if (isHeading(l)) { if (affirms(l)) removed++; else out.push(l); i++; continue; }
    if (l.trim() === "") { out.push(l); i++; continue; }
    // paragraph: consecutive non-blank, non-structural lines (FAQ **Q**/A pairs stay together)
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== "" && !isHeading(lines[j]) && !isList(lines[j]) && !/^```/.test(lines[j])) j++;
    const para = lines.slice(i, j);
    if (affirms(para.join("\n"))) removed++;
    else {
      out.push(...para);
      if (!noteInserted && removed >= 0 && !/^\s*[-—]\s*Elena/.test(para[0])) {
        // first surviving paragraph → note after it
        out.push("", NOTE_MD);
        noteInserted = true;
      }
    }
    i = j;
  }
  if (!removed) return { md, removed: 0, changed: false };
  return { md: out.join("\n").replace(/\n{3,}/g, "\n\n"), removed, changed: true };
}

// ── html ────────────────────────────────────────────────────────────────────
function correctHtml(html) {
  if (/class="correction"/.test(html)) return { html, removed: 0, changed: false };
  let removed = 0;
  // Block elements that can carry a claim. <pre> first (may contain <p>-like text).
  const blockRe = /<(pre|p|li|h2|h3)(\s[^>]*)?>[\s\S]*?<\/\1>/g;
  let out = html.replace(blockRe, (m) => {
    const text = m.replace(/<[^>]+>/g, " ");
    if (affirms(text)) { removed++; return ""; }
    return m;
  });
  // The FAQ answers are duplicated into the FAQPage JSON-LD; drop the same entries there.
  out = out.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (m, body) => {
    try {
      const j = JSON.parse(body);
      if (j && j["@type"] === "FAQPage" && Array.isArray(j.mainEntity)) {
        const before = j.mainEntity.length;
        j.mainEntity = j.mainEntity.filter((q) => !affirms(`${q.name || ""} ${(q.acceptedAnswer && q.acceptedAnswer.text) || ""}`));
        if (j.mainEntity.length !== before) {
          removed += before - j.mainEntity.length;
          return `<script type="application/ld+json">${JSON.stringify(j, null, 2)}</script>`;
        }
      }
    } catch { /* not JSON we understand — leave it */ }
    return m;
  });
  if (!removed) return { html, removed: 0, changed: false };
  // note after the first surviving <p> inside <article>
  const art = out.indexOf("<article");
  const firstP = out.indexOf("</p>", art < 0 ? 0 : art);
  if (firstP > 0) out = out.slice(0, firstP + 4) + "\n" + NOTE_HTML + out.slice(firstP + 4);
  // empty <ul>/<ol> left behind
  out = out.replace(/<(ul|ol)(\s[^>]*)?>\s*<\/\1>/g, "");
  return { html: out, removed, changed: true };
}

// ── main ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const htmlRepo = get("--html");
const cachePath = get("--cache");
if (!htmlRepo && !cachePath) {
  console.error("usage: node scripts/blog-redis-correction.cjs [--html <aideazz repo>] [--cache <blog-posts-cache.json>] [--apply]");
  process.exit(2);
}
const report = [];

if (cachePath) {
  const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  let changedCount = 0;
  for (const slug of Object.keys(cache)) {
    if (SKIP_SLUGS.has(slug)) continue;
    const e = cache[slug];
    if (!e || typeof e.markdown !== "string" || !REDIS.test(e.markdown)) continue;
    const r = correctMarkdown(e.markdown);
    report.push(`cache  ${r.changed ? "FIX" : "keep"}  ${slug}  removed=${r.removed}`);
    if (r.changed) { changedCount++; if (apply) e.markdown = r.md; }
  }
  if (apply && changedCount) {
    fs.copyFileSync(cachePath, `${cachePath}.bak-${STAMP}`);
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), "utf8");
    report.push(`cache  written ${changedCount} entr(ies); backup ${path.basename(cachePath)}.bak-${STAMP}`);
  }
  report.push(`cache  slugs changed: ${Object.keys(cache).filter((s) => !SKIP_SLUGS.has(s) && cache[s] && typeof cache[s].markdown === "string" && REDIS.test(cache[s].markdown) && correctMarkdown(cache[s].markdown).changed).join(",")}`);
}

if (htmlRepo) {
  const dir = path.join(htmlRepo, "public", "blog");
  let changedCount = 0;
  for (const slug of fs.readdirSync(dir)) {
    if (SKIP_SLUGS.has(slug)) continue;
    const f = path.join(dir, slug, "index.html");
    if (!fs.existsSync(f)) continue;
    const html = fs.readFileSync(f, "utf8");
    if (!REDIS.test(html)) continue;
    const r = correctHtml(html);
    const left = (r.html.match(/\bredis\b/gi) || []).length;
    report.push(`html   ${r.changed ? "FIX" : "keep"}  ${slug}  removed=${r.removed}  redis-left=${left}`);
    if (r.changed) {
      changedCount++;
      if (apply) {
        // backups live outside public/ so they are never deployed with the site
        const bakDir = path.join(htmlRepo, "backups", `blog-redis-correction-${STAMP}`);
        fs.mkdirSync(bakDir, { recursive: true });
        fs.copyFileSync(f, path.join(bakDir, `${slug}.index.html`));
        fs.writeFileSync(f, r.html, "utf8");
      }
    }
  }
  report.push(`html   ${apply ? "written" : "would change"} ${changedCount} page(s)`);
}
console.log(report.join("\n"));
console.log(apply ? "APPLIED" : "DRY RUN (add --apply)");
