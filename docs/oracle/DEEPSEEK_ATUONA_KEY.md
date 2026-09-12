# DeepSeek API key for Atuona — Elena only

Atuona already calls DeepSeek V4.1 Flash (`deepseek-flash` at
`https://api.deepseek.com`). Until `DEEPSEEK_API_KEY` is on Oracle, that rung
is a no-op. Opus 5 → remapped Groq → Grok still run.

**Video:** `/visualize deepseek 048` shoots a clip. The Flash key is optional
there (motion). The clip uses the existing `REPLICATE_API_TOKEN` — same wallet
as Seedance. `/visualize seedance 048` is the Seedance-named path.

**Never paste the key in Cursor, Slack, or email.** A key in those windows
has to be rotated. Telegram `/deepseekkey` is the intended path: the bot
deletes the message before it does anything else.

## What you do (phone — tap this)

Same contract as `/pplxkey`.

1. Open **https://platform.deepseek.com/api_keys** — the API console, not
   chat.deepseek.com.
2. Create a key. Copy it once (`sk-…`). It is shown only at creation.
3. Top up if the wallet is empty (HTTP 402 still writes the key; Flash
   stays unused until there is balance).
4. In Telegram, Atuona or CTO AIPA, send:

   `/deepseekkey sk-…`

   Or tap `/deepseekkey` in the slash menu, paste the key, send.
5. The bot deletes your message, probes DeepSeek, writes Oracle `.env`,
   then restarts `cto-aipa --update-env`.

Atuona: https://t.me/Atuona_AI_CCF_AIdeazz_bot

CTO AIPA: https://t.me/aitcf_aideazz_bot

## What you do not do

- Do not put the key in Cursor, Slack, or email.
- Do not put it in GitHub Actions secrets. The bot reads Oracle `.env` only.
- Do not change `DEEPSEEK_MODEL` to the retired ids (`deepseek-v4-flash`,
  `deepseek-v4-pro`). Those now route to Flash anyway; use `deepseek-flash`.

## How you know it worked

The bot replies `✅ DeepSeek is wired in.` After the restart, Atuona boot
logs `DeepSeek: deepseek-flash (additive fallback)` instead of
`⚪ set DEEPSEEK_API_KEY`. A `/create` that misses Opus then tries DeepSeek
before Groq.
