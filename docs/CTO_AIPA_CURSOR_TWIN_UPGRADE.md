# CTO AIPA - Cursor Twin & Personal AI Upgrade Roadmap

**Version:** 2.0  
**Created:** January 26, 2026  
**Last Updated:** January 26, 2026  
**Research Sources:** takopi (banteg/takopi), Obsidian, Personal AI Assistant patterns  
**Purpose:** Upgrade CTO AIPA from "code reviewer" to "true AI co-founder you can talk to anywhere"

---

## 🎉 IMPLEMENTATION STATUS: v6.0 "Personal AI Co-Founder" COMPLETE

### What Was Accomplished (January 26, 2026)

| Phase | Feature | Status | Implementation |
|-------|---------|--------|----------------|
| **Phase 1** | Persistent Memory | ✅ **DONE** | `conversation_context` table in Oracle DB, 7-day retention |
| **Phase 2** | Project Awareness | ✅ **DONE** | `/project` command, `activeRepo` tracking per user |
| **Phase 3** | CLAUDE.md Support | ✅ **DONE** | `loadClaudeMd()` function, `/rules` command |
| **Phase 4** | Knowledge Base | ✅ **DONE** | `knowledge_base` table, `/know`, `/diary`, `/tasks`, `/research` |
| **Phase 5** | Voice-First | ✅ **DONE** | `detectPersonalAIIntent()`, auto-routes voice to idea/diary/task |
| **Phase 6** | Resume Lines | ❌ Deferred | Low priority, takopi integration planned separately |
| **Phase 7** | Streaming | ❌ Deferred | Low priority |

### New Commands Added (v6.0)

| Command | Purpose | Works |
|---------|---------|-------|
| `/project [name]` | Set/show active project | ✅ |
| `/know [query]` | Search knowledge base | ✅ |
| `/diary [entry]` | Quick diary entry | ✅ |
| `/tasks` | Show pending tasks | ✅ |
| `/research [note]` | Save research notes | ✅ |
| `/rules` | Show CLAUDE.md for project | ✅ |
| `/resume` | Restore last session from DB | ✅ |
| `/forget` | Clear conversation memory | ✅ |

### Database Tables Added

| Table | Purpose |
|-------|---------|
| `conversation_context` | Persistent session memory (survives restarts) |
| `knowledge_base` | Ideas, diary entries, tasks, research notes |

### Key Functions Added

| Function | File | Purpose |
|----------|------|---------|
| `saveConversationContext()` | database.ts | Save session to Oracle DB |
| `loadConversationContext()` | database.ts | Load session from Oracle DB |
| `saveKnowledge()` | database.ts | Save idea/diary/task/research |
| `searchKnowledge()` | database.ts | Search knowledge base |
| `detectPersonalAIIntent()` | telegram-bot.ts | Route voice messages intelligently |
| `loadClaudeMd()` | telegram-bot.ts | Load project rules from GitHub |
| `syncContextToDb()` | telegram-bot.ts | Background sync to DB |

### UX Improvements

| Feature | Before | After |
|---------|--------|-------|
| Menu | 80+ lines of text | Interactive inline keyboard buttons |
| Context retention | 30 minutes | 7 days (persisted to DB) |
| Context on restart | Lost | Preserved (Oracle DB) |
| Project switching | Manual every command | `/project espaluz` once |
| Voice messages | Just transcription | Auto-routes to idea/diary/task |

---

## Current State: v6.0 "Personal AI Co-Founder"

### What's ENCODED (in telegram-bot.ts)

| Feature | Command | Status | Notes |
|---------|---------|--------|-------|
| **File Operations** | | | |
| Read any file | `/readfile` | ✅ Works | Via GitHub API |
| Edit files | `/editfile` | ✅ Works | Commits to GitHub |
| Create files | `/createfile` | ✅ Works | |
| Search code | `/search` | ✅ Works | GitHub code search |
| Directory tree | `/tree` | ✅ Works | |
| **Session Memory** | | | |
| Context tracking | `/context` | ✅ **UPGRADED** | 7-day retention, DB-backed |
| Apply last fix | `/apply` | ✅ Works | Applies pending fixes |
| Batch edits | `/batch` | ✅ Works | Multi-file editing |
| **Personal AI (NEW!)** | | | |
| Project awareness | `/project` | ✅ **NEW** | Set active project |
| Knowledge base | `/know` | ✅ **NEW** | Search ideas/notes |
| Diary | `/diary` | ✅ **NEW** | Quick entries |
| Tasks | `/tasks` | ✅ **NEW** | Pending tasks |
| Research | `/research` | ✅ **NEW** | Save research notes |
| Project rules | `/rules` | ✅ **NEW** | Show CLAUDE.md |
| Session restore | `/resume` | ✅ **NEW** | Restore from DB |
| Clear memory | `/forget` | ✅ **NEW** | Reset context |
| **Voice/Media** | | | |
| Voice messages | Send voice | ✅ **UPGRADED** | Auto-routes to intent |
| Screenshot analysis | Send photo | ✅ Works | Claude Vision |
| **Learning** | | | |
| Code lessons | `/learn` | ✅ Works | |
| Exercises | `/exercise` | ✅ Works | |
| **Monitoring** | | | |
| Daily briefing | `/daily` | ✅ Works | 8 AM cron |
| Health checks | `/health` | ✅ Works | |
| Proactive alerts | `/alerts` | ✅ Works | |

### What's FIXED

| Issue | Solution | Status |
|-------|----------|--------|
| **No persistent memory** | Oracle DB tables + sync | ✅ Fixed |
| **No project awareness** | `/project` command + activeRepo | ✅ Fixed |
| **No CLAUDE.md equivalent** | `loadClaudeMd()` + `/rules` | ✅ Fixed |
| **Session doesn't survive restart** | DB persistence + `/resume` | ✅ Fixed |
| **Voice not deeply integrated** | Intent detection + auto-routing | ✅ Fixed |

### What's Still TODO

| Issue | Problem | Priority |
|-------|---------|----------|
| **No real CLI bridge** | Runs via GitHub API only | MEDIUM (Takopi) |
| **No worktree support** | Can't work on multiple branches | LOW |
| **No streaming** | Waits for full response | LOW |
| **No Obsidian integration** | Separate from vault | FUTURE |

---

## Takopi Features We Need

[takopi](https://github.com/banteg/takopi) is a Telegram bridge to Claude Code CLI. Key features:

| Takopi Feature | CTO AIPA Status | Priority |
|----------------|-----------------|----------|
| **Projects & Worktrees** | ❌ Missing | HIGH |
| Work on multiple repos/branches simultaneously | Only one repo at a time | |
| Git worktrees for parallel branches | No worktree support | |
| **Stateless Resume** | ❌ Missing | HIGH |
| Continue conversation in chat | Context lost after 30 min | |
| Copy resume line to terminal | No terminal integration | |
| **Progress Streaming** | ❌ Missing | MEDIUM |
| Commands, tools, file changes, elapsed time | No streaming at all | |
| **Parallel Runs** | ❌ Missing | LOW |
| Multiple agent sessions | Single threaded | |
| **Voice Notes** | ✅ Have it | - |
| Telegram voice → transcription | Already works via Whisper | |
| **File Transfer** | ⚠️ Partial | MEDIUM |
| Send files to repo | Only via /createfile | |
| Fetch files back | Only via /readfile (text only) | |
| **Group Chats & Topics** | ❌ Missing | LOW |
| Map topics to repo/branch contexts | No group support | |
| **Multiple Engines** | ❌ Missing | MEDIUM |
| codex, claude, opencode, pi | Only Claude/Groq | |

---

## Obsidian Integration Pattern

From the "Personal AI Assistant" article, the key insight is:

> "Place your iPhone text notes, call transcripts, diary entries in a folder. Run Claude Code in it."

### What This Means for CTO AIPA

| Pattern | How to Implement |
|---------|------------------|
| **CLAUDE.md file** | Create `/cto` command to read project-specific instructions |
| **Obsidian Vault access** | Let CTO read from a designated "knowledge" repo |
| **Notes → Ideas in projects** | Voice message → parse → add to appropriate project |
| **Diaries & self-analysis** | Store conversation history → find patterns |
| **Articles & research** | `/research <topic>` → web search + summarize |

### CLAUDE.md Concept

A `CLAUDE.md` file in each repo tells the AI:
- Project context
- Coding standards
- What NOT to do
- Where to find related files
- Custom instructions

**Example for EspaLuz:**
```markdown
# CLAUDE.md for EspaLuzFamilybot

## Project Context
- AI Spanish tutor for expat families
- PostgreSQL + LangChain memory
- Telegram bot via python-telegram-bot

## Rules
- DO NOT modify espaluz_memory.py without backup
- DO NOT change database schema without migration
- Always use edge-tts for voice, never gTTS
- Keep responses under 4096 chars (Telegram limit)

## Key Files
- main.py: Entry point, all commands
- espaluz_memory.py: Unified memory system
- espaluz_emotional_brain.py: Emotion detection

## Current Focus
- Phase 7: Investor Dashboard
- Bug fixes: None pending
```

---

## Upgrade Roadmap

### Phase 1: Persistent Memory (Priority: CRITICAL)

**Problem:** Context lost after 30 minutes and on restart

**Solution:**
```typescript
// Store conversation context in Oracle DB, not memory
interface PersistentContext {
  userId: number;
  activeProject: string;
  recentFiles: { repo: string; path: string; content: string; timestamp: Date }[];
  recentQuestions: { q: string; a: string; timestamp: Date }[];
  pendingFixes: any[];
  lastActive: Date;
}

// Save to DB after each interaction
async function saveConversationContext(userId: number, ctx: PersistentContext): Promise<void>;

// Load from DB on each interaction  
async function loadConversationContext(userId: number): Promise<PersistentContext>;
```

**Commands to add:**
- `/resume` - Reload last session context
- `/forget` - Clear my memory of this project
- `/remember <note>` - Save a permanent note

---

### Phase 2: Project Awareness (Priority: HIGH)

**Problem:** Must specify repo every time

**Solution:**
```typescript
// Track active project per user
interface ActiveProject {
  repo: string;
  branch: string;
  lastFile: string;
  claudeMd: string; // Contents of CLAUDE.md
}

// Auto-detect project from context
function detectProject(message: string): string | null {
  // "fix the menu" → look at recent files → EspaLuzFamilybot
  // "update the landing page" → aideazz
}
```

**Commands to add:**
- `/project <name>` - Set active project
- `/projects` - List all with last activity
- `/switch <name>` - Quick switch

---

### Phase 3: CLAUDE.md Support (Priority: HIGH)

**Problem:** Generic responses, no project-specific rules

**Solution:**
1. Look for `CLAUDE.md` in repo root
2. Load into system prompt
3. Apply rules to all responses

```typescript
async function loadClaudeMd(repo: string): Promise<string | null> {
  try {
    const { data } = await octokit.repos.getContent({
      owner: 'ElenaRevicheva',
      repo: repo,
      path: 'CLAUDE.md'
    });
    return Buffer.from(data.content, 'base64').toString('utf8');
  } catch {
    return null;
  }
}
```

**Commands to add:**
- `/rules` - Show current CLAUDE.md
- `/addrule <rule>` - Add rule to CLAUDE.md
- `/editrules` - Edit CLAUDE.md

---

### Phase 4: Knowledge Base Integration (Priority: MEDIUM)

**Problem:** CTO doesn't know Elena's ideas, notes, decisions

**Solution:** Create a dedicated `knowledge-base` repo

```
ElenaRevicheva/aideazz-knowledge/
├── CLAUDE.md           # Instructions for the AI
├── ideas/              # Startup ideas
│   ├── espaluz-features.md
│   └── new-products.md
├── decisions/          # Recorded decisions
│   ├── 2026-01-tech-stack.md
│   └── 2026-01-pricing.md
├── diary/              # Optional daily notes
├── research/           # Market research
└── contacts/           # Important contacts
```

**Commands to add:**
- `/idea <text>` - Save to ideas/ (already exists, enhance it)
- `/know <question>` - Search knowledge base
- `/diary` - Quick voice → diary entry
- `/research <topic>` - Save research notes

---

### Phase 5: Voice-First Workflow (Priority: MEDIUM)

**Problem:** Voice works but isn't deeply integrated

**Solution:** Make voice the primary input method

```typescript
// Enhanced voice processing
async function processVoice(voiceFile: File): Promise<{
  transcription: string;
  intent: 'question' | 'command' | 'idea' | 'diary' | 'task';
  project?: string;
  action?: string;
}> {
  // 1. Transcribe with Whisper
  // 2. Detect intent
  // 3. Route appropriately
}

// Voice intents:
// "Remind me to fix the login bug in EspaLuz" → /idea
// "What's the status of the family bot?" → /status
// "Read me the main.py file" → /readfile
// "I had a thought about pricing..." → /diary
```

**Commands to add:**
- Voice → auto-detect intent
- `/voice on` - Enable always-listening mode
- `/transcribe` - Just transcribe, don't act

---

### Phase 6: Takopi-Style Resume (Priority: MEDIUM)

**Problem:** Can't continue from terminal

**Solution:** Generate resume lines like takopi

```typescript
// After each session, generate resume line
function generateResumeLine(context: PersistentContext): string {
  return `cto resume --user ${context.userId} --project ${context.activeProject} --last-file "${context.recentFiles[0]?.path}"`;
}

// Send resume line at end of conversation
// "To continue in terminal: cto resume --user 12345 --project espaluz"
```

---

### Phase 7: Streaming Progress (Priority: LOW)

**Problem:** Long waits with no feedback

**Solution:** Stream progress via Telegram edits

```typescript
async function streamResponse(ctx: Context, generator: AsyncGenerator<string>): Promise<void> {
  const message = await ctx.reply('⏳ Working...');
  let fullText = '';
  
  for await (const chunk of generator) {
    fullText += chunk;
    // Update message every 500ms
    await ctx.api.editMessageText(ctx.chat!.id, message.message_id, fullText);
  }
}
```

---

## Implementation Priority (Updated)

| Phase | Feature | Effort | Impact | Status |
|-------|---------|--------|--------|--------|
| 1 | Persistent Memory | Medium | Critical | ✅ **DONE** |
| 2 | Project Awareness | Medium | High | ✅ **DONE** |
| 3 | CLAUDE.md Support | Low | High | ✅ **DONE** |
| 4 | Knowledge Base | Medium | Medium | ✅ **DONE** |
| 5 | Voice-First | Medium | Medium | ✅ **DONE** |
| 6 | Resume Lines | Low | Low | ⏸️ Deferred |
| 7 | Streaming | High | Low | ⏸️ Deferred |

---

## Quick Wins - COMPLETED

1. ~~**Create CLAUDE.md files** for each major repo~~ ✅ `/rules` command loads them
2. ~~**Increase context timeout** from 30 min to 4 hours~~ ✅ Now 7 days!
3. ~~**Save context to Oracle DB** instead of memory~~ ✅ `conversation_context` table
4. ~~**Add /project command** to set active repo~~ ✅ Implemented
5. ~~**Enhance /idea** to categorize and file properly~~ ✅ Via knowledge_base + intent detection

---

## Success Metrics - ACHIEVED

| Metric | Was | Target | Now |
|--------|-----|--------|-----|
| Context retention | 30 min | 7 days | ✅ **7 days** |
| Commands per session | 5-10 | 20+ | ✅ 80+ available |
| Voice message usage | Low | Primary input | ✅ Auto-routing |
| Cross-session continuity | 0% | 95% | ✅ **DB-backed** |
| Project switching time | Manual every time | Auto-detect | ✅ `/project` once |

---

## Personal AI Assistant Vision

The end goal is not just a "code reviewer" but a **true AI co-founder**:

> "When I'm out for a walk, an idea comes to me → I voice it into CTO AIPA → 
> It adds to the right project → I continue the conversation over breakfast"

**The dream workflow:**
1. Wake up → Voice note to CTO about today's priorities
2. Walk to coffee → Voice ideas for new feature
3. Breakfast → CTO sends progress update
4. Work session → CTO remembers everything from morning
5. Evening → Review what CTO accomplished
6. Next day → Continue exactly where we left off

---

## Changelog

### January 26, 2026 - v2.0 (IMPLEMENTATION COMPLETE)
**Major Release: Personal AI Co-Founder**

**Database Changes:**
- Added `conversation_context` table for persistent session memory
- Added `knowledge_base` table for ideas, diary, tasks, research
- Added functions: `saveConversationContext()`, `loadConversationContext()`, `saveKnowledge()`, `searchKnowledge()`, `getKnowledgeByCategory()`, `getRecentKnowledge()`

**New Commands:**
- `/project [name]` - Set active project (no more specifying repo every time!)
- `/know [query]` - Search your knowledge base
- `/diary [entry]` - Quick diary entry
- `/tasks` - Show pending tasks
- `/research [note]` - Save research notes
- `/rules` - Show CLAUDE.md for current project
- `/resume` - Restore session from database
- `/forget` - Clear conversation memory

**Enhanced Features:**
- Voice messages now auto-detect intent (idea/diary/task/research/question)
- Context retention upgraded from 30 minutes to 7 days
- Context survives PM2 restarts (persisted to Oracle DB)
- Interactive inline keyboard menu (tap sections to see commands)
- Three-persona system prompt (Tech Co-Founder, Cursor Twin, Personal AI)

**Bug Fixes:**
- Fixed: Commands registered after `bot.start()` now work (moved before)
- Fixed: Menu callback buttons now respond (grammY `callbackQuery` filter)

**Technical Notes:**
- Commands MUST be registered before `bot.start()` in grammY
- DB sync is fire-and-forget (non-blocking)
- In-memory context still works, DB is backup for persistence

### January 26, 2026 - v1.0
- Initial document created
- Research: takopi, Obsidian, Personal AI patterns
- Identified gaps in current v5.2 implementation
- Created 7-phase upgrade roadmap

---

## Next Steps (Future Roadmap)

1. **Takopi Integration** - Separate bot for real CLI access
2. **Streaming Responses** - Edit messages as AI generates
3. **pgvector Integration** - Semantic search for knowledge base
4. **LangChain Memory** - Better conversation memory with PostgreSQL

---

*"When you run out of Cursor credits, CTO AIPA is your twin. But more importantly, CTO AIPA should be your co-founder who remembers everything."*

**Status: v6.0 Personal AI Co-Founder - SHIPPED! 🚀**
