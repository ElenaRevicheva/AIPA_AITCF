# DeepSeek API key for Atuona — Elena only

Atuona already calls DeepSeek V4.1 Flash (`deepseek-flash` at
`https://api.deepseek.com`). Until `DEEPSEEK_API_KEY` is on Oracle, that rung
is a no-op. Opus 5 → remapped Groq → Grok still run. Seedance does **not**
need this key — it uses the existing `REPLICATE_API_TOKEN`.

**Never paste the key in a chat.** A key in a chat has to be rotated.

## What you do (phone is fine)

1. Open **https://platform.deepseek.com/api_keys** — the API console, not
   chat.deepseek.com.
2. Create a key. Copy it once (`sk-…`). It is shown only at creation.
3. Top up balance if the wallet is empty. An empty wallet returns HTTP 402
   and Atuona will skip DeepSeek the same as a missing key.
4. On Oracle, in `/home/ubuntu/cto-aipa/.env` (gitignored), add:

   ```
   DEEPSEEK_API_KEY=sk-…
   DEEPSEEK_MODEL=deepseek-flash
   ```

   If a line already exists, replace it. Do not commit `.env`.
5. Tell the agent **"key is on Oracle"** — do not send the value. The agent
   restarts `cto-aipa` with `--update-env` so the process actually sees it.
   `pm2 restart` without `--update-env` keeps the old empty env.

There is no `/deepseekkey` command yet. Same phone pattern as `/pplxkey` can
be added later if typing into `.env` is the blocker.

## What you do not do

- Do not put the key in Telegram, Slack, or this chat.
- Do not put it in GitHub Actions secrets unless we add a write-path that
  needs it. The bot reads Oracle `.env` only.
- Do not change `DEEPSEEK_MODEL` to the retired ids (`deepseek-v4-flash`,
  `deepseek-v4-pro`). Those now route to Flash anyway; use `deepseek-flash`.

## How you know it worked

After the `--update-env` restart, Atuona boot logs:

`DeepSeek: deepseek-flash (additive fallback)`

instead of `⚪ set DEEPSEEK_API_KEY`. A `/create` that misses Opus then
tries DeepSeek before Groq.
