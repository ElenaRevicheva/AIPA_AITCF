# EspaLuz prod log analysis — memory resets (Telegram) and unresponsive Pere/Titi (web), 31 Oct 2026

Evidence: Oracle `/var/log/espaluz-familybot.log`, the unified Postgres DB (counts and dates only), the JSON
snapshot table, and Supabase `learning_sessions` (classroom turns of 30–31 Oct). Nothing changed yet; fixes await Elena.

## Telegram — why it "starts from scratch"

| Memory layer | State for Elena's account | Verdict |
|---|---|---|
| Web link | `/connect C77E44` → `200 success` at ~10:45 UTC 31 Oct | ✅ connected (no message since, so sync not yet seen) |
| Onboarding (`user_onboarding.json`) | `step: country`, no country/name/role | 🔴 **still wiped** by the 30 Oct `/start`. Fix `7d26fc0` protects only complete profiles. The full profile (complete, parent, country, name) exists in snapshot id 11 (14 Aug) of `json_store_snapshots`. |
| LangChain history (`chat_message_history`) | 112 turns, 22 Jan → 30 Oct 21:54 | ✅ stored; only the **last 5** turns reach the prompt |
| RAG (`espaluz_embeddings`) | 75 rows, last **22 Oct 15:30** (last for anyone too) | 🔴 **dead 9 days**: every embed → OpenAI `429` (no credits). Log still prints "✅ RAG embeddings saved" (the `save_turn` return value is ignored) = silent failure. |
| Profile memory + RAG in kids mode | excluded on purpose (5ec595f: the parent's profile made the tutor call the child "Elena") | ⚠️ nothing replaced it: Alisa has **no durable memory of her own** — not her cat, not her sentences, not the mission (`kids_mission` never saved: lessons never reach the goodbye step) |
| LangGraph | `langgraph 1.0.6` installed in the bot venv | ⚠️ **not used by any code** in FamilyBot, WhatsApp or the SaaS |
| Translation | OpenAI `no credits` every turn | 🔴 skipped silently |

So the tutor sees: its system prompt + last 10 local messages + last 5 LangChain lines. Everything older is invisible,
and in kids mode nothing about Alisa survives a lesson.

## Web classroom — why Pere/Titi did not answer Alisa (31 Oct, 10:49–10:52 UTC)

1. Hello → toucan story + "how was your day" — fine.
2. Speech-to-text heard **"Eu me espethe muito em branco."** (auto-detect chose Portuguese on a child's ES/EN speech).
   Pere: *"I understand you want to say 'I feel very happy'"* — **invented** a meaning, then ran the jump step.
3. Alisa: **"I woke up very early and I do not want to jump. I want to ride my bicycle."**
   Pere: *"¡Casi! Se dice: 'I feel very happy.'"* — ignored her.

**Root cause of 3 is our code, reproduced offline:** `kids_sentence_check` / `kidsSentenceCheck` (same on bot and web)
scored the 4-word target "I feel very happy" against her sentence: "I" + "very" = 50% ≥ threshold → it ordered the
model *"Start with ¡Casi! Se dice …"*. The model obeyed. Short targets of common words match almost anything.

Contributing causes:
- `voice-to-text` requests plain JSON (no detected language, no confidence) and sends no language hint, so a garbled
  transcript is passed on as if it were real, and the tutor is never told "this was unclear".
- The lesson step ("WAKE-UP GAME… Do ONLY this step") outranks a child who refuses or proposes her own idea
  ("I don't want to jump, I want to ride my bicycle"). The question-hold fix (ascent `729de4b`) covers questions
  only, and is **not deployed** (live `espaluz-chat` = v214).
- Earlier turns (30 Oct) repeat the same "hello → how was your day" opening on every start: no memory of the last lesson.

## Proposed fixes (awaiting go-ahead)
- **T1** Restore Elena's onboarding entry from snapshot 11 (merge her one key; stop bot → patch → start, since the bot
  holds the file in memory and would overwrite an edit).
- **T2** Self-heal: an incomplete onboarding whose unified-memory user already has country/name is marked complete.
- **T3** RAG on free local embeddings on Oracle (no quota, $0; 8.7 GB free RAM), re-embed the 586 stored turns,
  and log the real outcome of `save_turn`.
- **T4** Alisa's own durable memory (kids-only category): things she told us, sentences she can say, last mission —
  read into every kids turn on Telegram (bot-local first; joins the one-family-memory plan's Phase 2 later).
- **W1** Sentence check (bot + web): ignore stopwords, need ≥3 shared content words and ≥70%, and only when the last
  turn asked her to repeat a sentence.
- **W2** `voice-to-text`: `verbose_json`; if the language is not es/en/ru or confidence is low, retry with es and en and
  keep the better; if still unclear, tell the tutor to say "No te escuché bien, ¿otra vez?" — never guess.
- **W3** Child-led rule in both prompts: if she refuses the step or proposes her own idea, the step becomes her idea
  (bicycle → "¡Vamos en bici!"), then continue. Deploy with `729de4b`.

## Re-test after the sync (web classroom v216, 31 Oct 12:05–12:08 UTC)

| Alisa (speech-to-text) | Pere/Titi | Verdict |
|---|---|---|
| (start) | "¡Hola! / Hello!" + toucan story + "how was your day?" | ok, thin hello |
| "Ana, Ana, me viene perezoso." (garbled) | "Ana, Ana, I feel sleepy! … you say it perfectly!" → "Jump, jump, jump!" | ❌ praised a garbled transcript as perfect, then the scheduled jump step |
| "donde vive el perezoso" | "Sloths live in the trees of the tropical jungle…" → "Do you know what your favourite fruit is?" | ✅ question answered with a true fact (the 729de4b fix works); ⚠️ question back not about what she asked |
| "Starberry" (strawberry) | new sentence "El perezoso es lento pero muy amable", 4 lines | ❌ ignored her answer to their own question; ran the NEW SENTENCE step |

Function logs, every turn: `Groq openai/gpt-oss-120b: 429 … tokens per day` → answered by **`openai/gpt-oss-20b`**, the smallest model in
the chain. Gemini has no secret in Supabase (and is 402 anyway), Claude's org is dry, and **Grok — which the bots
use and which works on our key — is not in the web chain at all.** The classroom ran all day on the weakest model.

Causes, in order of weight:
1. The per-turn instruction ("Do ONLY this step: …") comes last in the prompt and never names her words, so a small
   model follows the step and forgets the general "answer the child first" rule written far above it.
2. Model quality: 120b's free daily tokens are spent by midday; nothing stronger is reachable.
3. No "I didn't hear you": a garbled transcript is treated as a real sentence (and praised).
