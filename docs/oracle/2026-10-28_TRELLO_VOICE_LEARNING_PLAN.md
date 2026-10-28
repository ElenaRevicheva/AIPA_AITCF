# Voice → Trello learns from Elena's corrections — plan (28 Oct 2026)

**Status: PLAN, waiting for Elena's go.** Nothing below is built yet.

## Why
Elena: "we are pivoting to make each of my agents learn and evolve on the go." Today the voice → Trello path in
`src/trello-voice.ts` has **no learning loop**: a correction fixes one card and is forgotten, so the same kind of miss
can repeat until someone writes code. Two of her agents already learn, and this plan reuses their patterns instead of
building a new one:

- **VibeJob Hunter:** her decisions go into a permanent ledger, and the latest ones are injected as few-shot examples
  into the judge prompt every hour (`judge_feedback_sync.py` → `_feedback_block()`; proven in production).
- **OpenClaw:** a weekly job proposes *rules* from repeated mistakes; she approves each with `/rules approve` before it
  applies (`private/learned-rules.json`). A model never adds a rule to itself unreviewed.

## The loop (four small, additive pieces)

1. **Capture every correction (two doors).**
   - *By voice or text:* the existing `update` action already edits exactly one card. Before it writes, log
     `{when, heard (transcript), field, bot_value, her_value, card}` to `data/trello-corrections.json`
     (append-only; one entry per card + field).
   - *By hand in Trello:* at creation, remember what the bot set on each card (title, date, list, colour). A small
     read-only nightly check compares those cards with Trello now; a field she changed herself is logged as a
     correction too. She fixes most cards in the Trello app, so this is where most of the signal is.
2. **Use them at once (VJH pattern).** The classifier prompt gets a short block, "Her recent corrections", with the
   latest ~12 entries ("heard '…next cycle 28 Nov…' → you set Oct 28 → she set Nov 28"). The next voice note benefits
   the same day.
3. **Turn repeats into rules she approves (OpenClaw pattern).** Weekly: corrections of the same type become a
   proposed rule in Telegram ("When a cycle repeats monthly, each card's date is the start of its cycle — approve?").
   Approved rules go into the prompt permanently; rejected ones never come back.
4. **Prove it, never assume it.** Each correction also becomes a test case in `scripts/test-trello-voice-dates.cjs`
   (or a replay file of real transcripts), so a learned behaviour that later breaks fails a check.

## Guard rails
- Learning never edits cards by itself; it only shapes the next classification.
- Family/health wording stays in `data/` (gitignored, on Oracle only), never in the public repo.
- Clean-ups never teach: bulk moves or archives by any agent are not corrections (VJH lesson, 28 Sep).
- Deploy by named files, back up first, restart PM2, verify from logs.

## How we will know it works
Corrections per week by type, before vs after: the same correction type should stop recurring once a rule is approved.
