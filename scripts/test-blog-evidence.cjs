#!/usr/bin/env node
/**
 * Guards the daily-blog grounding path.
 *
 * Regression this catches (2026-08-26): cron fired at 14:30 America/Panama,
 * Telegram said "Grounding gate / unsourced number(s): 40", nothing published.
 * Cause: a rotation brief still asked for "BrightData $40/run"; grounded mode
 * treated the brief as copy, the model copied 40, four retries fail-closed.
 *
 * Cadence must survive a correct filter: salvage the draft or assemble a
 * measured-notes article from the bundle. Silence is for thin evidence, not
 * for a decorated draft.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const {
  verifyArticleAgainstEvidence,
  salvageArticleAgainstEvidence,
  composeEvidenceFallbackArticle,
  stripUnverifiedNumbers,
  stripStructuralNumericTokens,
  renderLicensedNumbersForPrompt,
} = require(path.join(root, "dist/blog-evidence.js"));

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

function bundle(extraFacts = []) {
  return {
    collectedAt: "2026-08-26T19:30:00.000Z",
    stack: ["express", "grammy"],
    failures: [],
    facts: [
      {
        key: "git.cto-aipa.count",
        label: "Commits in cto-aipa, last 48h",
        value: "12",
        source: "git log --since=\"48 hours ago\" in cto-aipa",
        numbers: ["12", "48"],
      },
      {
        key: "git.cto-aipa.0",
        label: "Commit in cto-aipa",
        value: "abc1234 (2026-08-26) blog: keep it daily",
        source: "git log in cto-aipa",
        numbers: [],
      },
      {
        key: "pm2.count",
        label: "Processes supervised by PM2",
        value: "9 online of 9",
        source: "pm2 jlist",
        numbers: ["9"],
      },
      {
        key: "hs.replied",
        label: 'Deals at "They replied"',
        value: "7",
        source: "HubSpot deals search API, dealstage=contractsent",
        numbers: ["7"],
      },
      {
        key: "hs.won",
        label: "Deals closed won",
        value: "2",
        source: "HubSpot deals search API, dealstage=closedwon",
        numbers: ["2"],
      },
      {
        key: "log.cron",
        label: "Latest outcome in daily-blog.log",
        value: "healthy — last run published",
        source: "tail of ~/logs/daily-blog.log (modified 1.0h ago)",
        numbers: ["1", "0"],
      },
      ...extraFacts,
    ],
  };
}

function longEnough(body) {
  const pad =
    "\n\nThe method is measure first, then write, then refuse anything that did not come from the measurement. " +
    "A topic brief is an SEO hint. It is not a source. Claude and Cursor sessions belong here when they land as commits, wiki incidents, or the operator queue.\n".repeat(4);
  return body + pad;
}

check("BrightData $40/run is stripped from briefs so the model cannot copy it", () => {
  const brief =
    "Real monthly line items for an AI startup running 10 agents: Oracle $0, Groq $12, BrightData $40/run, Claude API $8, Resend $4.";
  const stripped = stripUnverifiedNumbers(brief);
  assert.ok(!stripped.includes("40"), stripped);
  assert.ok(!stripped.includes("12"), stripped);
  assert.ok(!/\d/.test(stripped), "leftover digits: " + stripped);
  assert.ok(stripped.includes("a measured figure"), stripped);
  assert.ok(!/figure[A-Za-z]/.test(stripped), "needs a space after replacement: " + stripped);
});

check("an article that copies 40 from the brief is rejected", () => {
  const md = longEnough(
    "## One\n\nBrightData costs $40 per run on this fleet.\n\n## Two\n\nI measured twelve commits.\n\n## Frequently Asked Questions\n\n**Q: Cost?**\nA: Forty dollars.\n",
  );
  const v = verifyArticleAgainstEvidence(md, bundle());
  assert.ok(!v.ok, "expected reject");
  assert.ok(v.reason.includes("40"), v.reason);
});

check("the same article passes when 40 is a measured fact", () => {
  const md = longEnough("## One\n\nBrightData billed 40 this run.\n\n## Two\n\nTwelve commits.\n\n## Frequently Asked Questions\n\n**Q: Number?**\nA: 40, measured.\n");
  const v = verifyArticleAgainstEvidence(
    md,
    bundle([
      {
        key: "cost.brightdata",
        label: "BrightData spend this run",
        value: "40",
        source: "invoice",
        numbers: ["40"],
      },
    ]),
  );
  assert.equal(v.ok, true, v.ok ? "" : v.reason);
});

check("clock times and ISO dates are not unsourced claims", () => {
  const md = longEnough(
    "## One\n\nThe cron fires at 14:30 America/Panama.\n\n## Two\n\nCollected 2026-08-26.\n\n## Frequently Asked Questions\n\n**Q: When?**\nA: 14:30 on 2026-08-26.\n",
  );
  const v = verifyArticleAgainstEvidence(md, bundle());
  assert.equal(v.ok, true, v.ok ? "" : v.reason);
});

check("git hashes do not license random digits", () => {
  const stripped = stripStructuralNumericTokens("commit 35c1f53 shipped");
  assert.ok(!stripped.includes("35"), stripped);
  assert.ok(!stripped.includes("53"), stripped);
  assert.ok(stripped.includes("commit"), stripped);
  assert.ok(stripped.includes("shipped"), stripped);
});

check("salvage drops the unsourced-40 paragraph and then passes", () => {
  const md = [
    "## What happened",
    "",
    "Twelve commits landed in 48 hours.",
    "",
    "BrightData still costs $40 per run, which I did not measure today.",
    "",
    "## What I claim",
    "",
    "Nine processes are online.",
    "",
    "## Frequently Asked Questions",
    "",
    "**Q: How many commits?**",
    "A: 12, measured from git log.",
    "",
    "**Q: How many processes?**",
    "A: 9 online.",
    "",
    "**Q: Did I invent a unit price?**",
    "A: No. I do not have that measured.",
  ].join("\n");
  const b = bundle();
  const before = verifyArticleAgainstEvidence(md, b);
  assert.ok(!before.ok && before.reason.includes("40"), before.reason);
  const salvaged = salvageArticleAgainstEvidence(md, b);
  assert.equal(salvaged.ok, true, salvaged.ok ? "" : salvaged.reason);
  assert.ok(!salvaged.markdown.includes("40"), salvaged.markdown);
  assert.ok(salvaged.markdown.includes("12"), salvaged.markdown);
});

check("measured-notes fallback passes the grounding gate against its own bundle", () => {
  const b = bundle();
  const { title, markdown } = composeEvidenceFallbackArticle(b, { keyword: "AI startup infrastructure cost breakdown real numbers" });
  assert.ok(title.length > 8, title);
  assert.ok(markdown.length >= 1400, "fallback too short: " + markdown.length);
  assert.ok((markdown.match(/^## /gm) || []).length >= 3, "need >=3 H2");
  assert.ok(/^## Frequently Asked Questions/m.test(markdown));
  assert.ok((markdown.match(/^\*\*Q:/gm) || []).length >= 3, "need >=3 FAQ");
  const v = verifyArticleAgainstEvidence(markdown, b);
  assert.equal(v.ok, true, v.ok ? "" : v.reason);
  assert.ok(!markdown.includes(" $40"), markdown.slice(0, 400));
  assert.ok(!/\bredis\b/i.test(markdown), "fallback must not name absent infra");
});

check("licensed-numbers prompt lists 12 and 48, not rhetorical 9", () => {
  const text = renderLicensedNumbersForPrompt(bundle());
  assert.ok(text.includes("12"), text);
  assert.ok(text.includes("48"), text);
});

const publisher = fs.readFileSync(path.join(root, "src/daily-blog-publisher.ts"), "utf8");

check("grounded path always derives the angle from today's evidence", () => {
  assert.ok(publisher.includes("deriveAngleFromEvidence"));
  assert.ok(publisher.includes("stripUnverifiedNumbers(brief)"));
  assert.ok(!/const rotationSpent =/.test(publisher), "rotationSpent must not gate evidence angles");
});

check("grounding failure salvages or falls back instead of skipping the day", () => {
  assert.ok(publisher.includes("salvageArticleAgainstEvidence"));
  assert.ok(publisher.includes("composeEvidenceFallbackArticle"));
  assert.ok(publisher.includes("adoptEvidenceFallback"));
  const skipIdx = publisher.indexOf('await notifyTelegramSkipped("Grounding gate"');
  const fallbackIdx = publisher.indexOf('adoptEvidenceFallback("grounding gate")');
  assert.ok(skipIdx !== -1 && fallbackIdx !== -1 && fallbackIdx < skipIdx, "fallback must run before skip");
});

check("skip Telegram no longer blames mutex for every skip", () => {
  assert.ok(!publisher.includes("Sliding-window mutex or prefix-dedup tripped"));
  assert.ok(publisher.includes("No Dev.to / aideazz.xyz publish from this run."));
});

check("cron is still 14:30 America/Panama", () => {
  assert.ok(publisher.includes('"30 14 * * *"'));
  assert.ok(publisher.includes('"America/Panama"'));
});

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll blog-evidence checks passed");
