# AIPA Architecture Document
## Claude Opus 4.6 analysis — March 21, 2026

**See also:** `AIPA_NLU_AUDIT.md` — codebase audit of intent routing, regex vs LLM behavior, and gaps (text vs voice).

---

## Overview

AIPA (AI Personal Assistant) is a multi-modal Telegram bot serving as a CTO assistant, creative writing partner, and personal AI. It runs as a single Node.js/TypeScript process on Oracle Cloud, managed by PM2, with an Oracle Autonomous Database for persistence.

---

## Project Structure

```
/home/ubuntu/cto-aipa/
├── src/
│   ├── cto-aipa.ts              (29 KB)   Main entry point, Express server, GitHub webhooks
│   ├── telegram-bot.ts          (223 KB)  Telegram bot — 70+ commands, voice/photo handling
│   ├── atuona-creative-ai.ts   (324 KB)  Creative AI — book generation, images, video, NFTs
│   └── database.ts              (35 KB)   Oracle database layer — memory, context, knowledge
├── dist/                         Compiled JavaScript output
├── docs/                         Operational guides (JOB_SEARCH.md, guidelines, etc.)
├── wallet/                       Oracle mTLS certificate wallet
├── ecosystem.config.js           PM2 deployment config
├── package.json                  Dependencies and scripts
├── tsconfig.json                 TypeScript config (target: esnext, module: commonjs)
└── atuona-state.json            Persistent Atuona creative state (69 KB)
```

---

## Telegram Interface

**Framework:** Grammy v1.38.4

**Authorization:** Whitelist of Telegram user IDs via `TELEGRAM_AUTHORIZED_USERS`.

### Command Catalog (70+ commands)

**Core CTO Commands:**
| Command | Purpose |
|---------|---------|
| `/start` | Welcome message |
| `/help` | Show available commands |
| `/menu` | Interactive organized menu system |
| `/ask` | Ask a strategic technical question |
| `/status` | Check system health and uptime |
| `/repos` | List monitored AIdeazz repositories |
| `/suggest` | Architectural suggestions |
| `/roadmap` | Technical roadmap |
| `/daily` | Daily technical briefing |
| `/alerts` | Manage alert preferences |
| `/idea` / `/ideas` | Capture and view technical ideas |
| `/debt` | Track technical debt |
| `/decision` | Log architectural decisions |
| `/strategy` | Strategic planning |
| `/priorities` | View priorities |

**Code Review & Analysis:**
| Command | Purpose |
|---------|---------|
| `/review` | Review a GitHub PR or commit |
| `/build` | Analyze build output or errors |
| `/diff` | Show version differences |
| `/error` | Analyze error messages |
| `/study` | Study code patterns in a file |
| `/explain` / `/explainfile` / `/explaincode` | Explain code at different levels |
| `/architecture` | Analyze system architecture |
| `/howto` | How-to guides |

**Cursor-Twin File Operations (edit code from Telegram):**
| Command | Purpose |
|---------|---------|
| `/readfile <repo> <path>` | Read file from GitHub |
| `/editfile <repo> <path>` | Edit file (interactive workflow) |
| `/createfile <repo> <path>` | Create new file |
| `/commit <message>` | Commit pending changes |
| `/cancel` | Cancel pending edits |
| `/apply` | Apply last suggested fix |
| `/search <term> [repo]` | Grep across repos |
| `/tree <repo> [dir]` | Show directory structure |
| `/multifile` / `/batch` | Multi-file operations |
| `/refactor` / `/quickfix` / `/fixerror` | AI-assisted fixes |
| `/gentest` | Generate test code |
| `/approve` / `/reject` / `/pending` | Code approval workflow |
| `/code <repo> <task>` | AI-powered code writing |
| `/fix <repo> <issue>` | Fix a specific issue |
| `/run <repo> [action]` | Trigger GitHub Actions CI/CD |
| `/cmd <command>` | Run shell command (restricted) |

**Personal AI & Knowledge:**
| Command | Purpose |
|---------|---------|
| `/project [name]` | Switch active project context (cto, atuona, job, espaluz) |
| `/know [query]` | Search knowledge base |
| `/diary [entry]` | Write diary/reflections |
| `/tasks` | View task list (project-filtered) |
| `/research [topic]` | Research and save findings |
| `/rules` | Show CLAUDE.md or JOB_SEARCH.md |
| `/resume` | Resume previous context |
| `/forget` | Clear conversation context |
| `/context` | Show conversation context |

**Learning System:**
| Command | Purpose |
|---------|---------|
| `/learn` | Interactive coding lessons |
| `/exercise` | Coding exercises |
| `/lessons` | View saved lessons |
| `/feedback` | Submit feedback |

### Event Handlers (non-command)

| Handler | Purpose |
|---------|---------|
| `message:voice` | Transcribe via Groq Whisper, detect intent, route accordingly |
| `message:photo` | Analyze images with Claude Vision |
| `message:text` | Natural language intent detection, auto-route to commands |

### Menu System

Three-tier interactive keyboard menu:
1. **Main Menu** (`/menu`) — shows organized command categories
2. **Category Menus** — expand to show related commands
3. **Individual Commands** — with usage examples and inline help

---

## AI Stack

### Models and Routing

```
Critical tasks (security reviews, complex decisions) → Claude Opus 4 (claude-opus-4-20250514)
Strategic tasks (Ask CTO, guidance)                  → Claude Opus 4
Standard tasks (fast code reviews)                   → Groq Llama 3.3 70B (free tier)
Voice transcription                                  → Groq Whisper Large v3
Image generation                                     → Replicate Flux Pro/Ultra (primary), DALL-E 3 (fallback)
Video generation                                     → Luma Dream Machine ray-2 (primary), Runway Gen-3 (fallback)
Photo analysis                                       → Claude Vision (base64)
```

### `askAI()` — Primary AI Function

Located in `src/telegram-bot.ts` (~line 313). Tries Claude Opus 4 first; if credits are exhausted (billing error), falls back to Groq Llama 3.3 70B (free tier). This fallback pattern saves ~$200/month.

```typescript
async function askAI(prompt: string, maxTokens = 1500): Promise<string> {
  try {
    // Claude Opus 4 (primary)
    return await anthropic.messages.create({ model: 'claude-opus-4-20250514', ... });
  } catch (claudeError) {
    if (errorMessage.includes('credit') || errorMessage.includes('billing')) {
      // Groq Llama 3.3 70B (free fallback)
      return await groq.chat.completions.create({ model: 'llama-3.3-70b-versatile', ... });
    }
    throw claudeError;
  }
}
```

### AI SDKs

| Package | Version | Purpose |
|---------|---------|---------|
| `@anthropic-ai/sdk` | 0.32.1 | Claude API (code review, Q&A, vision, creative writing) |
| `groq-sdk` | 0.8.0 | Llama 3.3 70B (fast reviews), Whisper (voice) |
| `openai` | 6.15.0 | DALL-E 3 (image fallback), Whisper (optional) |
| `replicate` | 1.4.0 | Flux Pro/Ultra image generation |

Luma and Runway are called via direct REST APIs.

---

## Database

**Type:** Oracle Autonomous Transaction Processing (ATP)
**Auth:** mTLS with wallet certificates at `/home/ubuntu/cto-aipa/wallet`
**Module:** `src/database.ts` (1,157 lines)

### Schema

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `aipa_memory` | Core Q&A and review memory | id, aipa_type, action, context (CLOB), result (CLOB), metadata (CLOB) |
| `tech_debt` | Technical debt tracking | id, repo, description, severity, status, resolved_at |
| `arch_decisions` | Architectural decision log | id, repo, title, description, rationale |
| `pending_code` | Code approval workflow | id, chat_id, repo, task, filename, code, status |
| `alert_preferences` | User alert settings | chat_id (PK), alerts_enabled, daily_briefing |
| `conversation_context` | 7-day session persistence | chat_id, context (CLOB), updated_at |
| `knowledge_base` | Personal knowledge by project/category | id, userId, category, project, title, content, tags |
| `lessons_learned` | Learning system | category, patterns |
| `strategic_insights` | Strategic planning | - |
| `health_checks` | System health monitoring | - |

### Key Database Functions

- `saveMemory()` / `getRelevantMemory()` — persist and recall Q&A, reviews, decisions
- `addTechDebt()` / `getTechDebt()` / `resolveTechDebt()` — debt lifecycle
- `addDecision()` / `getDecisions()` — architectural decision log
- `savePendingCode()` / `getPendingCode()` / `clearPendingCode()` — approval workflow
- `saveConversationContext()` / `loadConversationContext()` — 7-day session persistence
- `saveKnowledge()` / `searchKnowledge()` — knowledge base CRUD

---

## Key Modules

### `cto-aipa.ts` — Main Entry Point

- Express server on port 3000
- GitHub webhook receiver (`POST /webhook/github`) for PR and push events
- AI model routing logic (critical vs. standard reviews)
- Deterministic security analysis (`analyzeSecurityIssues()` — SQL injection, hardcoded secrets, XSS)
- Complexity analysis (`analyzeComplexityIssues()`)
- Architecture pattern detection (`analyzeArchitecturePatterns()`)
- CMO integration — syncs tech announcements to VibeJobHunter bot for LinkedIn posts

**Express Routes:**
- `GET /` — health check
- `POST /webhook/github` — GitHub PR/push webhook
- `POST /ask-cto` — strategic Q&A API
- `GET /cmo-updates` — pending CMO sync updates
- `GET /tech-milestones` — notable achievements

### `telegram-bot.ts` — Telegram Bot

The largest operational file (223 KB, 6,793 lines). Contains:

- **70+ command handlers** via Grammy `bot.command()`
- **Cursor-Twin subsystem** — edit files on GitHub from Telegram with in-memory `fileEditStates`
- **Personal AI** — intent detection, knowledge base, diary, tasks, research
- **JOB_SEARCH mode** — special planning mode that prevents auto-code execution for job strategy discussions
- **Voice handling** — download OGG → Groq Whisper → intent detection → route
- **Photo handling** — Claude Vision analysis
- **Conversation context** — in-memory with Oracle DB sync, 7-day retention, max 10 files / 20 questions

### `atuona-creative-ai.ts` — Creative AI System

The largest file (324 KB, 8,335 lines). Powers an AI creative writing system:

- **Book generation** — Russian poetry collection inspired by Gauguin's "Atuona"
- **Four characters** — Kira (artist), Ule (collector), Narrator, Vibe Spirit (AI presence)
- **Image generation** — Flux Pro via Replicate, DALL-E 3 fallback
- **Video generation** — Luma Dream Machine (ray-2), Runway Gen-3 fallback
- **NFT minting** — poems as NFTs via Pinata/IPFS
- **State persistence** — `atuona-state.json` tracks page number, mood, characters, plot threads

### `database.ts` — Oracle Database Layer

1,157 lines. Provides:
- Connection pooling with mTLS authentication
- Table auto-creation on startup
- CRUD operations for all tables
- CLOB handling for large text fields
- 7-day conversation context retention

---

## External Integrations

| Integration | Technology | Purpose |
|-------------|-----------|---------|
| **GitHub** | Octokit v22.0.1 | PR reviews, commit analysis, file operations, webhooks |
| **CMO AIPA** | REST webhook to VibeJobHunter | LinkedIn/Instagram tech announcements |
| **Replicate** | REST API | Flux Pro/Ultra image generation |
| **Luma Labs** | Direct API | Dream Machine video generation (ray-2) |
| **Runway** | REST API | Gen-3 Alpha Turbo video (fallback) |
| **Pinata/IPFS** | REST API | Decentralized storage for NFT metadata |

---

## Voice Handling Flow

```
Voice message received
  → Download OGG from Telegram API
  → Transcribe with Groq Whisper Large v3
  → Check for JOB_SEARCH keywords (vibejobhunter, job matcher, etc.)
    → Yes: handleJobSearchVoiceIntent() — planning mode, no auto-execution
    → No:  detectPersonalAIIntent() — classify as task/diary/research/idea/question
  → Route to appropriate handler
  → Sync conversation context to Oracle DB
  → Delete temp voice file
```

---

## Multi-Project Context Switching

Users can switch contexts via `/project [name]`:

| Project | Focus | Rules File |
|---------|-------|-----------|
| `cto` | Code review, technical guidance | CLAUDE.md (from GitHub) |
| `atuona` | Creative writing, art, NFTs | — |
| `job` | Job search strategy (JOB_SEARCH mode) | docs/JOB_SEARCH.md |
| `espaluz` | WhatsApp Spanish tutoring | — |

Each project has its own knowledge base entries, task lists, and memory context.

---

## Deployment

- **Runtime:** Node.js on Oracle Cloud
- **Process Manager:** PM2 (single instance, 1G max memory, autorestart)
- **Build:** `tsc` → `dist/cto-aipa.js`
- **Database:** Oracle ATP with mTLS wallet
- **Bot Token:** Telegram Bot API via Grammy
- **Environment:** `.env` file with API keys, tokens, and database credentials

---

## Architecture Highlights

1. **Cost-optimized AI** — free Groq fallback when Claude credits run low
2. **Human-in-the-loop** — approval workflow for code changes, planning mode for job search
3. **Multi-modal** — text, voice (Whisper), photos (Vision), GitHub webhooks, HTTP API
4. **Persistent context** — 7-day conversation memory via Oracle DB
5. **Single process** — all functionality in one PM2-managed Node.js process
6. **Ecosystem awareness** — coordinates across 11+ AIdeazz repositories
