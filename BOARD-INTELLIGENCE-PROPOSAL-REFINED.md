# Board Intelligence Personal Assistant (BIPA)

## Executive Summary

A federated AI system for equity holders who sit on multiple corporate boards. Each company maintains isolated intelligence agents; only processed insights flow to a central personal assistant that consolidates, prioritizes, and prepares decision-ready briefings.

**Core Innovation:** Multi-LLM deliberation (based on Karpathy's llm-council pattern) applied to board-level decision support with enterprise-grade security.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         EQUITY HOLDER INTERFACE                         │
│                    (Consolidated Intelligence Dashboard)                │
└─────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │ Insights Only
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                    BOARD INTELLIGENCE PERSONAL ASSISTANT                │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│  │  Executive  │ │  Conflict   │ │   Voting    │ │  Priority   │       │
│  │  Summaries  │ │  Detection  │ │   Prep      │ │  Ranking    │       │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘       │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │           MULTI-LLM COUNCIL ENGINE (Deliberation)           │       │
│  │     Gemini ←→ Claude ←→ Grok ←→ GPT (Anonymized Review)     │       │
│  └─────────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
                                    ▲
                    ┌───────────────┼───────────────┐
                    │               │               │
            ┌───────┴───────┐ ┌─────┴─────┐ ┌───────┴───────┐
            │   COMPANY 1   │ │ COMPANY 2 │ │   COMPANY 3   │
            │   SANDBOX     │ │  SANDBOX  │ │   SANDBOX     │
            │ ┌───────────┐ │ │           │ │               │
            │ │Doc Parser │ │ │   ...     │ │     ...       │
            │ │Financial  │ │ │           │ │               │
            │ │Risk Agent │ │ │           │ │               │
            │ │Compliance │ │ │           │ │               │
            │ └───────────┘ │ │           │ │               │
            │  RAW DATA     │ │           │ │               │
            │  NEVER LEAVES │ │           │ │               │
            └───────────────┘ └───────────┘ └───────────────┘
```

---

## 2. Component Details

### A. Company-Level Sandboxes (Federated)

Each company operates in complete isolation:

| Agent Type | Function |
|------------|----------|
| **Document Parser** | Ingest board packets (PDF, Word, Excel) |
| **Financial Analyst** | Extract key metrics, trend analysis |
| **Risk Assessment** | Flag concerns, regulatory issues |
| **Compliance Check** | Verify alignment with governance requirements |
| **Summary Generator** | Produce structured output in unified format |

**Critical Design Principle:**
- Raw documents, emails, and financials **never leave** the company sandbox
- Only structured summaries and insights are transmitted upward
- Each sandbox uses isolated Oracle ATP schema with encryption at rest

### B. Multi-LLM Council Engine

Adapted from [Karpathy's llm-council](https://github.com/karpathy/llm-council):

| Stage | Process |
|-------|---------|
| **Stage 1: Independent Analysis** | Query Gemini, Claude, Grok, GPT in parallel |
| **Stage 2: Anonymized Peer Review** | Each model ranks others as "Response A, B, C..." (prevents bias) |
| **Stage 3: Chairman Synthesis** | Designated model consolidates into final recommendation |

**Why Multi-LLM?**
- Different models have different strengths (reasoning, real-time data, synthesis)
- Peer review catches errors and blind spots
- Aggregate ranking provides confidence signals

### C. Personal Assistant Core Functions

| Function | Description | Technical Implementation |
|----------|-------------|-------------------------|
| **Executive Summaries** | Decision-ready briefings per company | Template-based extraction + LLM synthesis |
| **Conflict Detection** | "Company 1 plans X, Company 3 plans opposite" | Cross-company semantic comparison |
| **Voting Preparation** | All context needed for informed decisions | Structured pros/cons with source citations |
| **Priority Ranking** | Most critical items surface first | Weighted scoring (deadline, risk, impact) |
| **Proactive Alerts** | "Board meeting in 3 days — packet ready" | Calendar integration + deadline tracking |
| **User Adaptation** | Learns preferred formats and red flags | Feedback loop with persistent user profile |

---

## 3. Technical Foundation

### What Karpathy's Repo Provides (~30%)

| Component | Status |
|-----------|--------|
| 3-Stage Council Logic | ✅ Ready |
| Parallel AI Queries | ✅ Ready |
| Anonymized Peer Review | ✅ Ready |
| Ranking Parser | ✅ Ready |
| OpenRouter Integration | ✅ Ready |
| React Chat Frontend | ✅ Ready (reference) |

### What Needs to Be Built (~70%)

| Component | Purpose | Effort | Phase |
|-----------|---------|--------|-------|
| Port to TypeScript | Match existing stack (Express.js) | Medium | 1 |
| Oracle ATP Integration | Replace JSON with enterprise DB | Medium | 1 |
| Document Parser | Ingest PDF/Word/Excel board packets | Medium | 1 |
| Board-Specific Prompts | Train for voting decisions, not generic Q&A | Medium | 1 |
| Company Sandbox Architecture | Isolated data + agents per company | High | 2 |
| Conflict Detection Engine | Cross-company semantic analysis | Medium | 2 |
| User Adaptation System | Persistent preferences + feedback loops | Medium | 2 |
| Proactive Alert System | Calendar + deadline integration | Low | 2 |
| Custom Dashboard UI | Equity holder interface (not chat) | High | 3 |
| Audit Trail System | Log every AI recommendation with context | Low | 3 |
| Bilingual Output (EN/ES) | Dual language generation | Low | 3 |

---

## 4. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-6)
**Goal:** Single-company board packet analysis with multi-LLM deliberation

| Week | Deliverable |
|------|-------------|
| 1-2 | Port Karpathy council logic to TypeScript/Express |
| 3-4 | Oracle ATP schema + document parser (PDF focus) |
| 5-6 | Board packet → multi-LLM analysis → voting prep prototype |

**Demo Milestone:** Upload a board packet PDF → receive multi-perspective analysis with ranked recommendations

### Phase 2: Federation (Weeks 7-12)
**Goal:** Multi-company support with conflict detection

| Week | Deliverable |
|------|-------------|
| 7-8 | Company sandbox isolation architecture |
| 9-10 | Cross-company conflict detection engine |
| 11-12 | User preference system + proactive alerts |

**Demo Milestone:** Three companies feeding into unified dashboard with conflict warnings

### Phase 3: Production (Weeks 13-16)
**Goal:** Board-ready deployment

| Week | Deliverable |
|------|-------------|
| 13-14 | Custom equity holder dashboard UI |
| 15 | Audit trail + compliance logging |
| 16 | Production deployment (Oracle Cloud + PM2) |

---

## 5. Security & Compliance

### Data Isolation
- Each company's data resides in **separate Oracle ATP schemas**
- Cross-schema queries are prohibited at database level
- Only structured insight objects cross boundaries (never raw documents)

### Audit Trail
- Every AI recommendation logged with:
  - Timestamp
  - Source documents referenced
  - All model responses (Stage 1, 2, 3)
  - Final recommendation
  - User action taken
- Enables SOX-compliant decision documentation

### Access Control
- Role-based access: Equity holder sees consolidated view only
- Company admins see only their company's sandbox
- No cross-company data visibility at any level

### Data Residency
- Oracle ATP provides configurable region deployment
- All processing occurs within designated jurisdiction

---

## 6. Data Access Assumptions

### Phase 1 (MVP)
- Board packets uploaded manually as PDF/Word/Excel
- No direct system integration required
- User provides documents through secure upload interface

### Phase 2+
- Optional API integration with company document management systems
- Webhook-triggered analysis when new packets are published
- Requires per-company integration work (scoped separately)

---

## 7. Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Backend** | TypeScript + Express.js | Matches existing CTO AIPA infrastructure |
| **Database** | Oracle ATP | Enterprise-grade, encrypted, compliant |
| **AI Routing** | OpenRouter API | Single interface to Gemini, Claude, Grok, GPT |
| **Document Parsing** | pdf-parse, mammoth, xlsx | Standard Node.js libraries |
| **Frontend** | React + Vite | Proven, fast, component-based |
| **Deployment** | Oracle Cloud + PM2 | 24/7 uptime, familiar infrastructure |

---

## 8. Comparison: Existing Stack vs. Karpathy Reference

| Aspect | My Existing Repos | Karpathy's llm-council |
|--------|-------------------|------------------------|
| Language | TypeScript | Python |
| Backend | Express.js | FastAPI |
| AI Integration | Direct APIs (Groq, Claude) | OpenRouter (unified) |
| Database | Oracle ATP | JSON files |
| Decision Model | Single AI per request | Multi-AI council (4+ models) |
| Core Pattern | Code review automation | Multi-perspective deliberation |

**Integration Strategy:** Port the deliberation pattern (council.py) to TypeScript while keeping my existing infrastructure for persistence, deployment, and enterprise features.

---

## 9. Success Metrics

| Metric | Target |
|--------|--------|
| Time to board-ready briefing | < 5 minutes from packet upload |
| Conflict detection accuracy | > 90% (validated against manual review) |
| User preference learning | Measurable improvement in relevance over 10 sessions |
| System uptime | 99.9% |
| Audit trail completeness | 100% of recommendations logged |

---

## 10. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| LLM hallucination in recommendations | Multi-model peer review catches inconsistencies; all sources cited |
| Data leakage between companies | Database-level isolation; architectural review before Phase 2 |
| User trust in AI recommendations | Full transparency: show all model responses, not just synthesis |
| Scope creep | Phased delivery with clear milestones; MVP first |
| API rate limits / costs | OpenRouter provides unified billing; budget alerts configured |

---

## Summary

This system applies proven multi-LLM deliberation patterns to board-level decision support. The architecture prioritizes:

1. **Data sovereignty** — Company information never leaves its sandbox
2. **Decision quality** — Multiple AI perspectives with peer review
3. **Practical delivery** — Phased approach with working software at each milestone
4. **Enterprise readiness** — Audit trails, compliance logging, encrypted persistence

The foundation (Karpathy's deliberation engine) is validated. The value-add is adapting it for federated corporate intelligence with board-specific workflows.

---

*Prepared: December 2024*
