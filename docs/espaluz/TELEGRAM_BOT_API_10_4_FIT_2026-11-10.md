# Telegram Bot API 10.4 (9 Nov 2026) - what fits our bots (10 Nov 2026)

Source: https://t.me/BotNews/122 and https://core.telegram.org/bots/api-changelog#november-9-2026. Nothing built.

## What is new and useful
- **Widgets** (`sendWidget`, `editMessageWidgetData`, `widget_query` update, `answerWidgetQuery`): an HTML card inside the chat bubble,
  interactive, updated in place. Production: private chats only; cannot be forwarded or copied.
- **Ephemeral replies to button taps** (`ephemeral_message_parameters` with `callback_query_id`): only the person who tapped sees it.
  Matters in groups; private chats are already private.
- **Secondary bot usernames** ending in `ai` / `app` / `agent` (needs Telegram Premium, up to 2 bots).
- Not for us: TON wallet, gifts, share themes.

## Fit, in money order
1. **EspaLuz Familybot** - a "Your family's road" widget in the private chat: the map step, this week's talks, next classroom unit,
   updated in place instead of a new message each time. Keeps Telegram families inside Telegram (34 of 40 people never made a web
   account). Possible second username like `@espaluz_ai` if Elena has Premium (availability not checked).
2. **VibeJobHunter** - one job card per deal with Apply / Skip that updates itself (Skipped, Kit ready) instead of new messages.
3. **CTO AIPA** - one fleet-health card for Elena updated in place (services, credits, last blog post) instead of many alerts.
4. **OpenClaw** - drill score card after a practice round.
5. **Atuona, Influencer** - no clear gain.

## Before building
- Our libraries predate 10.4: Familybot `python-telegram-bot==20.7`, Node bots `grammy ^1.38`. Use raw Bot API calls, no upgrade.
- Not checked: how widgets look on older Telegram apps, and the HTML size/script limits. Test on Elena's phone first.
