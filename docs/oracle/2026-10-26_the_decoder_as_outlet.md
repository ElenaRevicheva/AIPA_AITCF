# The Decoder as a Dev.to replacement? Research note (26 Oct 2026, Claude Code)

Prompted by: the-decoder.com article "Anthropic says one AI agent beats many subagents now that models can handle
complexity alone" (Matthias Bastian, 25 Oct 2026). Nothing was signed up, submitted or changed.

## What The Decoder is
- An AI news outlet published by DEEP CONTENT by heise (the German heise publishing group). Editorial, not a
  self-publishing platform like Dev.to, Medium or Hashnode.
- `the-decoder.com/publish-with-us/`: editorial submissions through a form (name, email, topic abstract, optional
  link / file / LinkedIn / X / ResearchGate). "We will get back to you within 24 to 48 hours with feedback on your
  topic." Topics: AI research and science, business and products in AI, AI culture. "All statements must be
  substantiated and linked to a source." Republishing an article published elsewhere is allowed; you must prove you
  are the author. They distribute accepted pieces in social communities and their newsletter.
- Paid side, separate: sponsored posts, newsletters, podcasts for AI companies (mail hello@the-decoder.com; no prices).
- No API, no RSS-in, no automatic posting, no syndication feed. Canonical handling and link policy not stated.

## Verdict
- **Not a Dev.to replacement for the daily automated stream.** Every piece is pitched and edited by a human. There is no
  free (or paid) automatic-posting route, and daily automated posting is what got Dev.to suspended on 10 Oct.
- **A candidate for the borrowed-reach plan (17 Oct), rank #4, by hand, rarely.** One pitch per quarter at most: the
  strongest wiki incident with verified numbers, written as a practitioner piece for a stranger (e.g. "the prompt is a
  source": how an unverified figure in a brief poisoned a grounding gate in production). Editorial acceptance is a
  stronger credential than a Dev.to post ever was, and the audience is the AI-industry readership she sells to.
- Cost of a pitch: ~15 minutes of Elena's time at the laptop (form). Risk: none (no account, no automation).

## The article's claim, against what this workspace already does
- Thesis: fold subagents into one primary agent that loads context on demand (skills, tool search, knowledge base
  with search); keep subagents only for parallel work with separate context windows, measurable context degradation,
  or independent verification. Reference kit: github.com/anthropics/single-agent-loop-kit ("measure, combine, fold,
  maintain"; every change scored on the same eval before and after).
- Pitz case (22-23 Oct): built by ONE agent (CTO AIPA = Claude Code + memory files + skills + deferred tools) with a
  figure-recompute script as the eval. ChatGPT second opinion and the OpenClaw explain-back were used as independent
  verification: the OpenClaw handoff showed the named failure mode, information loss at a handoff (it asserted "the
  case mentions voice"; it does not).
- Borrowed-reach research (17 Oct): 6 parallel research agents + skeptics. Breadth-first, independent sources, each
  with its own context: the case where the article says subagents still earn their place.
- Fleet risk to watch: 10 agents with 10 prompts is the "Conway's Law for agents" shape. Shared state already goes
  through HubSpot and NOW.md (team wiring, 15 Oct), not through prompt duplication.
