#!/usr/bin/env node
/**
 * Re-run the daily blog's GitHub Contents API put for ONE cached slug.
 *
 * This is the same channel a successful daily post uses (author Elena,
 * chore(blog-static): regenerate <slug>/index.html, never skip-ci on a
 * single-article put). It is NOT a git-am patch and NOT a new article.
 *
 * Usage (on Oracle, cwd cto-aipa, GITHUB_TOKEN in .env):
 *   node scripts/republish-blog-html.cjs <slug>
 */
"use strict";

require("dotenv").config();
const fs = require("fs");
const path = require("path");

const slug = (process.argv[2] || "").trim();
if (!slug || !/^[a-zA-Z0-9_-]{1,180}$/.test(slug)) {
  console.error("usage: node scripts/republish-blog-html.cjs <slug>");
  process.exit(1);
}

function cachePath() {
  const dir =
    process.env.DAILY_BLOG_TOPIC_STATE_DIR ||
    process.env.HASHNODE_TOPIC_STATE_DIR ||
    path.join(process.cwd(), "data");
  return path.join(dir, "blog-posts-cache.json");
}

async function main() {
  const cacheFile = cachePath();
  if (!fs.existsSync(cacheFile)) {
    throw new Error("blog-posts-cache.json missing at " + cacheFile);
  }
  const cache = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  const article = cache[slug];
  if (!article || !article.markdown || !article.title) {
    throw new Error("cache has no complete article for slug " + slug);
  }

  const { pushOneArticleHtml } = require("../dist/blog-static-pages.js");
  const { pushSitemapToGithub } = require("../dist/daily-blog-publisher.js");

  const htmlOk = await pushOneArticleHtml({
    slug: article.slug || slug,
    title: article.title,
    markdown: article.markdown,
    ...(article.devtoUrl ? { devtoUrl: article.devtoUrl } : {}),
    url: article.aideazzBlogUrl || "https://aideazz.xyz/blog/" + slug,
  });
  if (!htmlOk) {
    throw new Error("pushOneArticleHtml failed for " + slug);
  }
  console.log("📄 BlogStatic republish OK", slug);

  await pushSitemapToGithub();
  console.log("📍 Sitemap committed after republish");
}

main().catch((e) => {
  console.error("✖ republish-blog-html:", e instanceof Error ? e.message : e);
  process.exit(1);
});
