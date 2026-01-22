# Takopi Integration Roadmap
## Enhancing CTO AIPA with Remote Coding Capabilities

**Document Version:** 1.0  
**Created:** January 22, 2026  
**Status:** Planning  
**Reference:** [banteg/takopi](https://github.com/banteg/takopi)

---

## Executive Summary

[Takopi](https://github.com/banteg/takopi) is a Telegram bridge for coding agents (Claude Code, Codex, OpenCode) that enables remote triggering of local development sessions. This document outlines the integration plan to enhance the AIdeazz tech co-founder capabilities.

---

## Current Architecture

### Existing Setup

| Component | Location | Purpose |
|-----------|----------|---------|
| **Claude in Cursor** | Local Laptop | Primary development - full IDE integration |
| **CTO AIPA Telegram Bot** | Oracle Server | Mobile companion - quick queries, GitHub ops |

### Limitation

The Telegram bot cannot trigger actual code editing sessions. It's limited to API calls and GitHub operations.

---

## What Takopi Adds

### Core Capabilities

| Feature | Description |
|---------|-------------|
| **Stateless Resume** | Pick up coding sessions from anywhere |
| **Worktrees** | Parallel branches/repos as isolated workspaces |
| **Progress Streaming** | Real-time updates on commands, file changes, elapsed time |
| **File Transfer** | Send files to repo or fetch files/dirs back |
| **Voice Commands** | Voice notes executed as agent commands |
| **Project Registration** | `/project-name` shortcuts for quick access |
| **Engine Switching** | `/codex`, `/claude`, `/opencode` prefixes |

### Architecture Difference

```
Current CTO AIPA:
  Telegram → Oracle Server → Claude API → Response
  (No local file access)

With Takopi:
  Telegram → Takopi (Oracle) → Local Coding Agent → File Changes
  (Full repository access, real edits)
```

---

## Recommended Setup

### Two-Bot Architecture

| Bot | Purpose | Commands |
|-----|---------|----------|
| **@CTO_AIPA_bot** (existing) | Quick queries, GitHub ops | `/ask`, `/health`, `/issue`, `/pr` |
| **@CodeAgent_bot** (new) | Coding sessions | `/claude`, `/codex`, project shortcuts |

### Deployment Location

**Oracle Server (170.9.242.90)** - Recommended because:
- Always online 24/7
- All repositories already cloned
- Can edit and restart services directly
- No dependency on laptop being online

---

## Implementation Roadmap

### Phase 1: Setup (Day 1)
- [ ] Create new Telegram bot via @BotFather
- [ ] Install takopi on Oracle (`uv tool install takopi`)
- [ ] Run setup wizard and configure
- [ ] Test basic functionality

### Phase 2: Project Registration (Day 1-2)
- [ ] Register EspaLuzFamilybot
- [ ] Register EspaLuzWhatsApp
- [ ] Register VibeJobHunter
- [ ] Register dragontrade-agent
- [ ] Register CTO-AIPA

### Phase 3: Workflow Integration (Day 2-3)
- [ ] Configure worktree management
- [ ] Set up progress streaming
- [ ] Test resume functionality
- [ ] Configure file transfer

### Phase 4: Advanced Features (Week 2)
- [ ] Group chat topic mapping (optional)
- [ ] Custom plugins (if needed)
- [ ] Integration with existing CI/CD

---

## Technical Requirements

### Oracle Server
```bash
# Python 3.14+ required
uv python install 3.14

# Install takopi
uv tool install -U takopi

# At least one engine on PATH
# claude, codex, or opencode
```

### Environment Variables
```bash
ANTHROPIC_API_KEY=xxx  # For claude engine
OPENAI_API_KEY=xxx     # For codex engine (optional)
```

---

## Usage Examples

### Basic Coding Request
```
/claude fix the authentication bug in espaluz_memory.py
```

### Project-Specific Request
```
/espaluz add retry logic to the database connection
```

### Branch Work
```
/espaluz @feat/new-dashboard implement the analytics chart
```

### Resume Session
```
/resume ctx_abc123 "continue where we left off"
```

---

## Cost Analysis

| Item | Cost |
|------|------|
| Takopi | Free (MIT License) |
| Additional Telegram Bot | Free |
| Claude API Usage | Existing subscription |
| Oracle Server | Already provisioned |

**Total Additional Cost: $0**

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Python 3.14 requirement | Use uv for isolated Python version |
| Learning curve | Start with basic commands, expand gradually |
| Session management | Takopi handles this natively |
| Conflicts with CTO AIPA | Separate bots, no overlap |

---

## Success Criteria

1. ✅ Can trigger code changes from Telegram
2. ✅ Progress visible in real-time
3. ✅ Can resume sessions after interruption
4. ✅ Worktree isolation working
5. ✅ All 5 main projects registered

---

## References

- [Takopi GitHub](https://github.com/banteg/takopi)
- [Takopi Documentation](https://takopi.dev)
- [Takopi Community](https://t.me/takopi_dev)

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-22 | Use separate bot for takopi | Clean separation, no command conflicts |
| 2026-01-22 | Deploy on Oracle, not laptop | 24/7 availability, repos already there |
| 2026-01-22 | Keep CTO AIPA for quick queries | Different purposes, both valuable |
