#!/usr/bin/env node
/**
 * Guards the daily-blog canonical ship path.
 *
 * Regression this catches (2026-08-21): Telegram + Dev.to + /portfolio listed
 * /blog/telegram-my-ai-agent-ops-dashboard-not-a-web-ui while 4everland's IPFS
 * pin had no such directory ("no link named …"). Causes:
 *   1. sitemap commit used [skip ci]
 *   2. daily publish called pushAllBlogArticlesHtml (skip-ci storm)
 *   3. Telegram fired before the HTML PUT
 */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const { githubCommitMessage, SITEMAP_COMMIT_MESSAGE, devtoCanonicalPreface } = require(
  path.join(root, "dist/blog-github-commit.js"),
);

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`not ok  ${name}`);
    console.error("   ", e instanceof Error ? e.message : e);
  }
}

check("new file in bulk still deploys (no skip ci)", () => {
  assert.strictEqual(
    githubCommitMessage("chore(blog-static): regenerate slug/index.html", { bulk: true, hasSha: false }),
    "chore(blog-static): regenerate slug/index.html",
  );
});

check("existing file in bulk skips ci", () => {
  assert.strictEqual(
    githubCommitMessage("chore(blog-static): regenerate slug/index.html", { bulk: true, hasSha: true }),
    "chore(blog-static): regenerate slug/index.html [skip ci]",
  );
});

check("single publish never skips ci even when the file already exists", () => {
  assert.strictEqual(
    githubCommitMessage("chore(blog-static): regenerate slug/index.html", { bulk: false, hasSha: true }),
    "chore(blog-static): regenerate slug/index.html",
  );
});

check("sitemap commit message has no skip ci", () => {
  assert.ok(!SITEMAP_COMMIT_MESSAGE.includes("[skip ci]"));
  assert.strictEqual(SITEMAP_COMMIT_MESSAGE, "chore(sitemap): auto-update");
});

check("Dev.to preface does not italic-wrap AIdeazz", () => {
  const line = devtoCanonicalPreface("https://aideazz.xyz/blog/example");
  assert.ok(!line.includes("*Originally"));
  assert.ok(!line.includes("[AIdeazz]"));
  assert.ok(line.includes("aideazz.xyz"));
});

const publisher = fs.readFileSync(path.join(root, "src/daily-blog-publisher.ts"), "utf8");

check("daily publish does not bulk-regenerate every article", () => {
  assert.ok(
    !publisher.includes("pushAllBlogArticlesHtml"),
    "runDailyDevToPost must not call pushAllBlogArticlesHtml",
  );
});

check("daily publish awaits the one new article HTML", () => {
  assert.ok(publisher.includes("shipNewArticleCanonical"));
  assert.ok(publisher.includes("pushOneArticleHtml"));
  assert.ok(
    /const htmlOk = await shipNewArticleCanonical/.test(publisher),
    "HTML put must be awaited before Telegram",
  );
});

check("Telegram mentions HTML failure instead of claiming the GEO URL is live", () => {
  assert.ok(publisher.includes("canonical HTML push FAILED"));
  const notifyIdx = publisher.indexOf("notifyTelegramBlogPublished(finalTitle, lines.join");
  const htmlOkIdx = publisher.indexOf("const htmlOk = await shipNewArticleCanonical");
  assert.ok(htmlOkIdx !== -1 && notifyIdx !== -1 && htmlOkIdx < notifyIdx, "Telegram must fire after HTML put");
});

check("sitemap source uses SITEMAP_COMMIT_MESSAGE not a skip-ci literal", () => {
  assert.ok(!publisher.includes('chore(sitemap): auto-update [skip ci]'));
  assert.ok(publisher.includes("SITEMAP_COMMIT_MESSAGE"));
});

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll blog-canonical-ship checks passed");
