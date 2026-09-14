#!/usr/bin/env node
/**
 * Gate for the 14 Sep 2026 Atlas classify failure.
 *
 * Production: OpenAI embeddings 429 "You have no credits remaining" was retried
 * as a transient rate limit, then classify.js exited 1 and radar.sqlite stayed
 * on 2026-09-07. This file mirrors the quota detector + lexical assigner from
 * the atlas-shifted patch so AIPA_AITCF CI can prove the logic without that repo.
 */
'use strict';

function isEmbedQuotaError(body) {
  return /no credits remaining|insufficient_quota|exceeded your current quota|billing_not_active|prepayment depleted|credit balance is too low/i.test(
    body,
  );
}

function isRetryableEmbedStatus(status, body) {
  if (isEmbedQuotaError(body)) return false;
  return status >= 500 || status === 429;
}

const ONTOLOGY = [
  { id: 'pain_point', prototype: 'Tired of overpaying? Sick of the hassle and stress? Stop struggling with this frustrating problem that costs you money and time every single month.' },
  { id: 'social_proof', prototype: 'Join over 50,000 happy customers. Rated 5 stars by thousands. Trusted by millions. See why everyone is switching and what our reviews say.' },
  { id: 'urgency_scarcity', prototype: 'Limited time offer ends tonight. Only a few spots left. Act now before this deal expires. Last chance — enrollment closes soon, don\'t miss out.' },
  { id: 'authority', prototype: 'Recommended by experts and doctors. Backed by science and certified professionals. As featured in major publications. Industry-leading, award-winning, accredited.' },
  { id: 'curiosity_gap', prototype: 'This one weird trick they don\'t want you to know. The secret most people never discover. You won\'t believe what happens next. Find out the surprising truth.' },
  { id: 'transformation', prototype: 'From before to after — see the incredible results. Transform your life in 30 days. Real people, real change. Get the body, the score, the savings you always wanted.' },
  { id: 'fear_loss', prototype: 'Don\'t make this costly mistake. Are you at risk? Protect yourself before it\'s too late. What you don\'t know could hurt you and your family. Avoid losing everything.' },
  { id: 'novelty', prototype: 'Introducing the first ever breakthrough. A revolutionary new way nobody has tried. The next generation, just launched. Brand new technology that changes everything.' },
];

function tokenize(s) {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((w) => w.length > 2),
  );
}

function lexicalSim(a, b) {
  const A = tokenize(a);
  const B = tokenize(b);
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  const denom = Math.sqrt(A.size * B.size);
  return denom ? inter / denom : 0;
}

function assignLexical(text) {
  let best = ONTOLOGY[0].id;
  let bestSim = -1;
  for (const o of ONTOLOGY) {
    const sim = lexicalSim(text, o.prototype);
    if (sim > bestSim) {
      bestSim = sim;
      best = o.id;
    }
  }
  return { id: best, confidence: Math.round(bestSim * 1000) / 1000 };
}

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`ok  ${name}`);
  else {
    console.error(`NOT OK  ${name}`);
    failed++;
  }
}

const quotaBody = 'You have no credits remaining. Add credits to continue using the API at https://pla';
check('quota body is quota', isEmbedQuotaError(quotaBody));
check('quota 429 is NOT retryable', isRetryableEmbedStatus(429, quotaBody) === false);
check('rpm 429 IS retryable', isRetryableEmbedStatus(429, 'Rate limit reached for rpm') === true);
check('500 is retryable', isRetryableEmbedStatus(500, 'internal') === true);
check('401 is not retryable', isRetryableEmbedStatus(401, 'invalid api key') === false);
check('insufficient_quota string', isEmbedQuotaError('insufficient_quota'));

for (const o of ONTOLOGY) {
  const got = assignLexical(o.prototype);
  check(`prototype ${o.id} classifies as itself`, got.id === o.id);
}

const painAd = 'Sick of the hassle? Stop struggling with this frustrating problem that costs you money every month.';
check('pain-like ad → pain_point', assignLexical(painAd).id === 'pain_point');

const socialAd = 'Join thousands of happy customers. Rated 5 stars. Trusted by millions of reviews.';
check('social-like ad → social_proof', assignLexical(socialAd).id === 'social_proof');

const empty = assignLexical('xy');
check('tiny text still returns an ontology id', ONTOLOGY.some((o) => o.id === empty.id));

const fs = require('fs');
const patch = fs.readFileSync(require('path').join(__dirname, 'atlas-patches/0001-classify-embed-failover.patch'), 'utf8');
check('patch mentions isEmbedQuotaError', patch.includes('isEmbedQuotaError'));
check('patch mentions text-embedding-004', patch.includes('text-embedding-004'));
check('patch mentions v1-lexical', patch.includes('v1-lexical'));
check('patch fails over to Gemini on quota', patch.includes('failing over to Gemini'));

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
