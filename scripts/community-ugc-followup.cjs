#!/usr/bin/env node
/**
 * Follow-up paste for the 28 Aug r/AI_UGC_Marketing thread. Elena already
 * posted the first sentence of the torn draft; this is the rest, written as a
 * standalone comment so it still makes sense underneath that fragment.
 *
 * Loaded by community-deliver-one.cjs (Telegram) and by the encoder test
 * (no Telegram, no Oracle).
 */
'use strict';

const draft = [
  'GPT-4 with browsing retrieves through a search index and cites a handful of sources; without browsing it reproduces training data. "Engine = UGC" collapses that. Each model quotes the surfaces it actually indexes, which is why the same "best [category]" question returns different citations — and why a Reddit-heavy answer can vanish when the retriever mix shifts toward YouTube or the open web.',
  '',
  'Video vs written matters less than whether a single passage is quotable on its own on a surface that engine already looks at. I built a free 34-check audit for that gap at https://aideazz.xyz/api (disclosure: it\'s mine).',
].join('\n');

module.exports = {
  source: 'reddit',
  externalId: '1vz7a0f-followup',
  url: 'https://www.reddit.com/r/AI_UGC_Marketing/comments/1vz7a0f/which_ugc_gets_you_cited_by_ai_depends_entirely/',
  title: 'Which UGC gets you cited by AI depends entirely on the engine, and I\'ve got the citation graph to prove it. (Plus the ChatGPT/Reddit twist.)',
  body: 'Anyone here making UGC specifically for AI pickup?',
  author: 'followup',
  createdAt: Date.now(),
  channel: 'r/AI_UGC_Marketing',
  score: 14,
  matchedQuery: 'get recommended by ChatGPT Perplexity',
  latam: false,
  draft,
};
