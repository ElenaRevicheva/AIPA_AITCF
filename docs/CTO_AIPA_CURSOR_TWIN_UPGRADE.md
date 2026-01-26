# CTO AIPA - Cursor Twin & Personal AI Upgrade Roadmap

**Version:** 1.0  
**Created:** January 26, 2026  
**Research Sources:** takopi (banteg/takopi), Obsidian, Personal AI Assistant patterns  
**Purpose:** Upgrade CTO AIPA from "code reviewer" to "true AI co-founder you can talk to anywhere"

---

## Current State: v5.2 "Maximum Cursor Twin"

### What's ENCODED (in telegram-bot.ts)

| Feature | Command | Status | Notes |
|---------|---------|--------|-------|
| **File Operations** | | | |
| Read any file | `/readfile` | ✅ Works | Via GitHub API |
| Edit files | `/editfile` | ⚠️ Partial | Commits work, but no diff preview |
| Create files | `/createfile` | ✅ Works | |
| Search code | `/search` | ✅ Works | GitHub code search |
| Directory tree | `/tree` | ✅ Works | |
| **Session Memory** | | | |
| Context tracking | `/context` | ⚠️ Shallow | Only 30 min, only 5 files |
| Apply last fix | `/apply` | ❓ Untested | Depends on pendingFixes working |
| Batch edits | `/batch` | ⚠️ Complex | Multi-step, easy to break |
| **Voice/Media** | | | |
| Voice messages | Send voice | ✅ Works | Whisper transcription |
| Screenshot analysis | Send photo | ✅ Works | Claude Vision |
| **Learning** | | | |
| Code lessons | `/learn` | ✅ Works | |
| Exercises | `/exercise` | ✅ Works | |
| **Monitoring** | | | |
| Daily briefing | `/daily` | ✅ Works | 8 AM cron |
| Health checks | `/health` | ✅ Works | |
| Proactive alerts | `/alerts` | ⚠️ Basic | Only stale repo detection |

### What's BROKEN or INCOMPLETE

| Issue | Problem | Impact |
|-------|---------|--------|
| **No persistent memory** | Context clears after 30 mins | Can't resume conversations next day |
| **No project awareness** | Doesn't know which project you're working on | Must specify repo every time |
| **No CLAUDE.md equivalent** | Can't give project-specific instructions | Generic responses |
| **No Obsidian integration** | Can't access your notes/ideas | Isolated from your second brain |
| **No real CLI bridge** | Runs via GitHub API only | Can't run actual terminal commands |
| **No worktree support** | Can't work on multiple branches | Limited to main branch |
| **No streaming** | Waits for full response | Long delays on big tasks |
| **Session doesn't survive restart** | In-memory only | All context lost on PM2 restart |

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

## Implementation Priority

| Phase | Feature | Effort | Impact | Priority |
|-------|---------|--------|--------|----------|
| 1 | Persistent Memory | Medium | Critical | 🔴 DO FIRST |
| 2 | Project Awareness | Medium | High | 🔴 DO FIRST |
| 3 | CLAUDE.md Support | Low | High | 🟡 NEXT |
| 4 | Knowledge Base | Medium | Medium | 🟡 NEXT |
| 5 | Voice-First | Medium | Medium | 🟢 LATER |
| 6 | Resume Lines | Low | Low | 🟢 LATER |
| 7 | Streaming | High | Low | 🟢 LATER |

---

## Quick Wins (Can Do Today)

1. **Create CLAUDE.md files** for each major repo
2. **Increase context timeout** from 30 min to 4 hours
3. **Save context to Oracle DB** instead of memory
4. **Add /project command** to set active repo
5. **Enhance /idea** to categorize and file properly

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Context retention | 30 min | 7 days |
| Commands per session | 5-10 | 20+ |
| Voice message usage | Low | Primary input |
| Cross-session continuity | 0% | 95% |
| Project switching time | Manual every time | Auto-detect |

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

### January 26, 2026 - v1.0
- Initial document created
- Research: takopi, Obsidian, Personal AI patterns
- Identified gaps in current v5.2 implementation
- Created 7-phase upgrade roadmap

---

*"When you run out of Cursor credits, CTO AIPA is your twin. But more importantly, CTO AIPA should be your co-founder who remembers everything."*
