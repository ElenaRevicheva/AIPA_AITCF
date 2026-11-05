# EspaLuz channel health check — 5 Nov 2026 ~16:30 UTC (read-only, nothing changed)

Elena: "are they really functioning right now?" Evidence per channel, from production logs and live probes.

| Channel | Verdict | Evidence |
|---|---|---|
| **Web kids classroom** | ✅ works | 33 `espaluz-chat` 200s today, 0 errors from Alisa's lessons; voice in→text (Groq Whisper) → Grok reply → voice out. Telegram bot sent 11 parent reports for today's lessons. |
| **Web adult chat, signed in** | ⚠️ not proven | No adult turns in the last 24 h. Same function + same auth branch as the classroom (which works with her JWT), but the adult path itself was not exercised — needs a signed-in test (Claude may not type her password). |
| **Web adult chat, NOT signed in ("Free Trial – 20 messages")** | 🔴 broken | Live test 16:27 UTC from an unsigned browser on /dashboard → "Lo siento, hubo un error". Log: `Error in espaluz-chat: Error: Unauthorized` → `POST 500`. The page offers an anonymous free trial (since Aug 2025, `7b2e65f`, `userId: 'free-trial-user'`) but the function requires a signed-in user (since `433325f`, Nov 2025). The dashboard also shows "Sign Out" and "14 days trial" to an anonymous visitor. Low traffic (only this test hit it in 2 days) because landing buttons go to /auth?mode=signup since 4 Nov. |
| **Telegram** (@EspaLuzFamily_bot) | ✅ alive, ⚠️ no user messages since restart | `getMe` ok, polling, `pending_update_count 0`. Since restart 4 Nov 19:30 UTC: kids daily ritual + 11 parent reports SENT; zero incoming user messages logged. One `Network is unreachable` blip to api.telegram.org (recovered). End-to-end reply not proven without a message from a user. |
| **WhatsApp** (Twilio) | ✅ reachable now, 🔴 2 messages lost 4 Nov, 🔴 fact-memory bug | Twilio account active, balance $14.04; webhook `GET` from internet 200 in 0.4 s. **4 Nov 17:03–17:05 UTC**: 2 voice/media messages from one returning sender (also wrote at 02:31) got Twilio `11200` / nginx `502` — the bridge was down during the 4 Nov Oracle freeze — and were never answered. Last answered conversation: 4 Nov 02:31 (text + audio + video sent, all `read`). **Bug:** `espaluz_bridge.py` ~line 3658 has `import threading` inside the reply function, which makes `threading` local to the whole function, so line ~3821 `threading.Thread(target=memory.remember_facts…)` raises `cannot access local variable 'threading'` on every reply that did not make a motivational video → the 3 Nov fact writer never runs on WhatsApp (6 hits in 10 days). Fix = delete that one redundant line (module already imports threading at line 11). |

## Voice chain, for the record
- Telegram + WhatsApp already have the free Microsoft Edge voice (`espaluz_neural_tts.py`).
- Web `generate-voice` does NOT: Replicate (402 since 15:13) → Gemini free (daily cap hit ~16:10) → OpenAI Nova (paid) → device voice. Elena 5 Nov: free options only, no paid wiring. Adding Edge to the Deno function is a separate, careful step (websocket client) — not started.

## Proposed fixes (none applied — waiting for Elena)
1. WhatsApp: delete the redundant `import threading` (1 line, deploy by copy + restart, prove with `✅ Unified memory updated` in the journal).
2. Web free trial: either send anonymous visitors on /dashboard to sign-up, or let the function answer a limited anonymous trial. Elena's product call.
3. Web voice: Edge free voice before OpenAI in `generate-voice`.
