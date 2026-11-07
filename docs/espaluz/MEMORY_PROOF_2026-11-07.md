# EspaLuz memory across WhatsApp, Telegram and web: proof, 7 Nov 2026

| Channel | LangChain (last turns) | RAG (semantic recall) | Family notebook (facts) | Evidence |
|---|---|---|---|---|
| WhatsApp | ✅ works | ✅ works | ✅ works | Elena's 17:58 UTC message: `📚 LangChain: 5 recent turns retrieved`, `🔍 RAG: semantic context retrieved`, `🔗 family memory: 7 fact(s)`, `✅ RAG embeddings saved`. Last 3 days: 12 / 12 / 11 lines. |
| Telegram | ❌ never read | ❌ never read | saved only | Saving runs (7 `RAG embeddings saved 2/2`), but 0 recalls since the recall line was added on 3 Nov. Cause: `format_mcp_request` reads `session["user_id"]`, and Telegram sessions keep the id at `context.user.id`, so the whole memory block was silently skipped. Direct test on Oracle: recall itself works (325 chars for the Telegram user). Fix in EspaLuzFamilybot `_session_uid()`, deployed 18:24:06 UTC (`0db83034`, backup `main.py.bak-20261107-memory`); proof = next grown-up Telegram turn logs `📚 memory used: … rag=yes`. |
| Web (signed in) | no LangChain (Deno function): the page sends the last 8 turns | no RAG | ✅ shared notebook via kids-memory `facts_get` / `facts_add` | `espaluz-chat/index.ts` `formatClaudeRequest(... conversationHistory.slice(-8), familyFacts, familyNotes)`. |
| Web (free, incognito) | none by design | none | none | Trial box says "This free chat is not saved." |

Speech-to-text was a separate fault: "Alisa" heard as "Lisa" (fixed 18:04 UTC on both bots, names hint + near-miss fix).
Names exist today only for families linked to a web account; families on WhatsApp or Telegram only need names taken from
the facts EspaLuz gathers in conversation (her gentle profiling) — next step.
