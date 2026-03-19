# Connect to CTO AIPA – Your AI Tech Co-Founder

CTO AIPA is your AI Technical Co-Founder: he knows all 11 AIdeazz products, reviews your code, and gives strategic technical advice. Here’s how to reach him.

---

## 1. Telegram (easiest – from your phone)

- Open Telegram and find your **CTO AIPA bot** (the one you set up with `TELEGRAM_BOT_TOKEN`).
- **Ask anything:**  
  `/ask Should I use PostgreSQL or MongoDB for this?`  
  or just send a normal message and he’ll answer.
- **Voice:** send a voice message; he transcribes and answers.
- **Screenshots:** send a photo (errors, UI, diagrams) for instant analysis.
- **Daily briefing:** `/daily` for a morning summary.
- **Other commands:** `/menu` to see all options.

If the bot doesn’t respond, check that CTO AIPA is running on the server and that `TELEGRAM_BOT_TOKEN` and `TELEGRAM_AUTHORIZED_USERS` are set in `.env` on the server.

---

## 2. From this repo (terminal / Cursor)

**Option A – CTO AIPA running locally**

```bash
npm run build && npm run start
```

Then in another terminal:

```bash
npm run ask-cto -- "How should I structure authentication for EspaLuz?"
```

**Option B – CTO AIPA on your server (e.g. Oracle Cloud)**

1. Create a `.env` in the project root (if you don’t have one).
2. Add your CTO AIPA base URL, for example:
   - `CTO_AIPA_URL=http://YOUR_ORACLE_IP:3000`  
   - or your production URL if you use a domain.
3. Run:

```bash
npm run ask-cto -- "Your question here"
```

Examples:

- `npm run ask-cto -- "Should I migrate EspaLuz to Oracle?"`
- `npm run ask-cto -- "What's the best way to add caching to the Telegram bot?"`

---

## 3. HTTP API (from another app or script)

```bash
curl -X POST http://YOUR_CTO_SERVER:3000/ask-cto \
  -H "Content-Type: application/json" \
  -d "{\"question\":\"Your technical question here\"}"
```

With optional context:

```json
{
  "question": "How should I structure the authentication?",
  "repo": "EspaLuzWhatsApp",
  "context": "Currently using JWT tokens"
}
```

---

## 4. GitHub (automatic)

- **Pull requests:** open or update a PR in any connected repo → CTO AIPA reviews it and comments.
- **Pushes to main/master:** he reviews the push and comments on the commit.

Make sure the GitHub webhook points to your CTO AIPA server:  
`POST http://YOUR_SERVER:3000/webhook/github`.

---

## Quick reference

| How              | When to use it                    |
|------------------|-----------------------------------|
| **Telegram**     | Day-to-day questions, voice, daily briefing |
| **npm run ask-cto** | Quick advice from Cursor/terminal        |
| **curl / API**   | Scripts, other tools, integrations       |
| **GitHub**       | Code reviews on PRs and pushes           |

---

*CTO AIPA is the AI Technical Co-Founder for the AIdeazz ecosystem (11 repos). He uses Claude Opus 4 for strategic questions and has full context on your products.*
