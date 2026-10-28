#!/usr/bin/env node
/**
 * Guards the daily-blog buyer-question mode (28 Oct 2026).
 *
 * What it protects: the questions carry no digits (numbers come only from evidence),
 * the picker walks the list once and honours the off switch, and the audit-catalogue
 * collector produces real licensed facts from the live engine — the only "method"
 * facts a buyer article may use. Run after `npm run build`.
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const root = path.join(__dirname, "..");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "blog-buyer-"));
process.env.DAILY_BLOG_TOPIC_STATE_DIR = tmp;
delete process.env.DAILY_BLOG_BUYER_MODE;

const pub = require(path.join(root, "dist/daily-blog-publisher.js"));
const ev = require(path.join(root, "dist/blog-evidence.js"));

let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`ok  ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`not ok  ${name}`);
    console.error("   ", e instanceof Error ? e.message : e);
  }
}

(async () => {
  await check("buyer questions: at least 10, every lane named, no digits anywhere", () => {
    const qs = pub.DAILY_BLOG_BUYER_QUESTIONS;
    assert.ok(Array.isArray(qs) && qs.length >= 10, `got ${qs && qs.length}`);
    for (const q of qs) {
      assert.ok(q.lane && q.keyword && q.brief, JSON.stringify(q));
      assert.ok(!/\d/.test(q.keyword + q.brief), `digits in: ${q.keyword}`);
    }
    const lanes = new Set(qs.map((q) => q.lane));
    for (const l of ["dental", "plastic-surgery", "immigration", "yacht-villa", "category"]) assert.ok(lanes.has(l), `missing lane ${l}`);
  });

  await check("picker: first question, then the next after it is marked done, then null when the mode is off", () => {
    const first = pub.pickBuyerQuestion();
    assert.ok(first && first.keyword === pub.DAILY_BLOG_BUYER_QUESTIONS[0].keyword);
    pub.markBuyerQuestionDone(first.keyword, "some-slug");
    const second = pub.pickBuyerQuestion();
    assert.ok(second && second.keyword === pub.DAILY_BLOG_BUYER_QUESTIONS[1].keyword);
    const state = JSON.parse(fs.readFileSync(path.join(tmp, "daily-blog-buyer-questions.json"), "utf8"));
    assert.strictEqual(state[first.keyword], "some-slug");
    process.env.DAILY_BLOG_BUYER_MODE = "false";
    assert.strictEqual(pub.pickBuyerQuestion(), null);
    delete process.env.DAILY_BLOG_BUYER_MODE;
  });

  await check("audit catalogue collector: live engine run yields the groups, the checks, today's score and the $100 offer", async () => {
    const facts = [];
    await ev.collectAuditCatalog(facts);
    const keys = facts.map((f) => f.key);
    for (const k of ["audit-checks", "audit-group-aiAccess", "audit-group-geo", "audit-group-aeo", "audit-group-techSeo", "audit-self", "offer-diagnostic"]) {
      assert.ok(keys.includes(k), `missing fact ${k}`);
    }
    const bundle = { collectedAt: new Date().toISOString(), facts, stack: [], failures: [] };
    const licensed = ev.licensedNumberList(bundle);
    assert.ok(licensed.includes("100"), `100 not licensed: ${licensed.join(",")}`);
    const checks = facts.find((f) => f.key === "audit-checks").value;
    assert.ok(/^\d+ checks in 4 groups/.test(checks), checks);
    assert.ok(/^\d+\/100, grade/.test(facts.find((f) => f.key === "audit-self").value));
    console.log("    ", checks, "|", facts.find((f) => f.key === "audit-self").value);
  });

  await check("publisher wiring: buyer question taken before the evidence angle, marked done on publish, rule 5 swapped", () => {
    const src = fs.readFileSync(path.join(root, "src/daily-blog-publisher.ts"), "utf8");
    assert.ok(/buyer = pickBuyerQuestion\(\);\s*\n\s*let derived = buyer \? null : await deriveAngleFromEvidence/.test(src));
    assert.ok(/if \(buyer\) markBuyerQuestionDone\(buyer\.keyword, slug\);/.test(src));
    assert.ok(/\$\{buyer \? BUYER_RULE_5 : SYSTEM_RULE_5\}/.test(src));
    const evSrc = fs.readFileSync(path.join(root, "src/blog-evidence.ts"), "utf8");
    assert.ok(/\['audit', \(\) => collectAuditCatalog\(facts\)\]/.test(evSrc));
  });

  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll blog buyer-mode checks passed");
})();
