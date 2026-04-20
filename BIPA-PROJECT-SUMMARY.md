# BIPA Project Summary & Quick Reference

**Board Intelligence Personal Assistant (BIPA)**  
*Prepared: December 2025*  
*Status: Proposal sent, awaiting response*

---

## 📋 Quick Reference Card

| Item | Value |
|------|-------|
| **Total Budget** | USD 8,000–10,000 |
| **Upfront Payment** | USD 2,500 |
| **Operational Costs** | USD 150–350/month |
| **Timeline** | 2–3 months |
| **Structure** | Milestone-based payments |

---

## 1. Project Overview

### What We're Building

A **federated AI system** for an equity holder who sits on multiple corporate boards:

- Each company maintains **isolated intelligence agents**
- Only processed insights flow to a **central personal assistant**
- Uses **multi-LLM deliberation** (Karpathy's llm-council pattern)
- Consolidates, prioritizes, and prepares **decision-ready briefings**

### Core Innovation

Multi-LLM council (Gemini, Claude, Grok, GPT) with:
- Stage 1: Independent opinions from 4 models
- Stage 2: Anonymized peer review (prevents bias)
- Stage 3: Chairman synthesizes final recommendation

---

## 2. Technical Foundation

### Karpathy's llm-council (Reference)

**Location:** `reference/karpathy-llm-council/`

| Component | Status | Notes |
|-----------|--------|-------|
| 3-Stage Council Logic | ✅ Ready | `backend/council.py` |
| Parallel AI Queries | ✅ Ready | `backend/openrouter.py` |
| Anonymized Peer Review | ✅ Ready | Prevents model bias |
| Ranking Parser | ✅ Ready | Extracts structured rankings |
| OpenRouter Integration | ✅ Ready | Unified API for all LLMs |
| React Frontend | ✅ Reference | `frontend/src/` |

**Key Files to Port:**
- `backend/council.py` → TypeScript (core orchestration)
- `backend/openrouter.py` → TypeScript (API integration)
- `backend/config.py` → TypeScript (model configuration)

### My Stack (Integration Target)

| Layer | Technology |
|-------|------------|
| Backend | TypeScript + Express.js |
| Database | Oracle ATP (encrypted, mTLS) |
| AI Routing | OpenRouter API |
| Document Parsing | pdf-parse, mammoth, xlsx |
| Deployment | Oracle Cloud + PM2 |

---

## 3. Architecture

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
            │  (Isolated)   │ │(Isolated) │ │  (Isolated)   │
            └───────────────┘ └───────────┘ └───────────────┘
```

---

## 4. Pricing Breakdown

### Engineering Fee: USD 8,000–10,000

| Phase | Work | Estimated Hours | Value |
|-------|------|-----------------|-------|
| Port Karpathy to TypeScript | Council logic, API integration | 40-60 hrs | $2,000-3,000 |
| Oracle ATP + Document Parser | Database schema, PDF/Word/Excel parsing | 30-40 hrs | $1,500-2,000 |
| Single Company Integration | Board packet analysis, testing | 30-40 hrs | $1,500-2,000 |
| Hardening & Deployment | Security, documentation, production deploy | 20-30 hrs | $1,000-1,500 |
| **Total** | | **120-170 hrs** | **$6,000-8,500** |

**Margin for unknowns, revisions, communication → $8,000-10,000**

### Rate Basis

| Benchmark | Rate |
|-----------|------|
| LATAM Senior AI Developer | $40-80/hour |
| My effective rate | ~$50-60/hour |
| Total hours | 150-180 hours |

### Payment Structure

| Stage | Amount | Trigger |
|-------|--------|---------|
| **Upfront** | USD 2,500 | Project start — architecture + first prototype |
| **Milestone 1** | ~USD 2,500-3,000 | After review/testing of core functionality |
| **Milestone 2** | ~USD 2,000-2,500 | After additional features validated |
| **Final** | Remaining balance | Completion and satisfaction |

### Refund Policy

- If milestone not delivered as agreed → **proportional refund for that stage**
- Covers real work done, not guaranteed outcomes
- Trust and reputation are priority

---

## 5. Operational Costs (Separate from Engineering)

### LLM API Costs (OpenRouter)

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|------------------------|
| GPT-4o | $2.50 | $10.00 |
| Claude 3.5 Sonnet | $3.00 | $15.00 |
| Gemini 1.5 Pro | $1.25 | $5.00 |
| Grok | $2-5 | $10-15 |

### Cost Per Council Deliberation

For ONE board question with 30-50 page document:

| Stage | Cost |
|-------|------|
| Stage 1 (4 models analyze) | $0.40-0.60 |
| Stage 2 (4 models rank) | $0.15-0.25 |
| Stage 3 (chairman synthesizes) | $0.10-0.20 |
| **Total per query** | **$0.65-1.05** |

### Monthly Operational Estimate

| Item | Pilot Cost |
|------|------------|
| LLM APIs | $50-150/month |
| Oracle ATP | $0-50/month |
| Hosting (Railway/OCI) | $0-50/month |
| Misc | $10-20/month |
| **Total** | **$150-350/month** |

### Who Pays

- **Client pays directly** (accounts in their name)
- OR **billed at cost** (transparent, no markup)

---

## 6. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-6)
**Goal:** Single-company board packet analysis with multi-LLM deliberation

| Week | Deliverable |
|------|-------------|
| 1-2 | Port Karpathy council logic to TypeScript/Express |
| 3-4 | Oracle ATP schema + document parser (PDF focus) |
| 5-6 | Board packet → multi-LLM analysis → voting prep prototype |

**Demo Milestone:** Upload board packet PDF → receive multi-perspective analysis

### Phase 2: Federation (Weeks 7-12)
**Goal:** Multi-company support with conflict detection

| Week | Deliverable |
|------|-------------|
| 7-8 | Company sandbox isolation architecture |
| 9-10 | Cross-company conflict detection engine |
| 11-12 | User preference system + proactive alerts |

### Phase 3: Production (Weeks 13-16)
**Goal:** Board-ready deployment

| Week | Deliverable |
|------|-------------|
| 13-14 | Custom equity holder dashboard UI |
| 15 | Audit trail + compliance logging |
| 16 | Production deployment (Oracle Cloud + PM2) |

---

## 7. What Karpathy Provides vs. What Needs Building

### Ready to Use (~30%)

| Component | Source |
|-----------|--------|
| 3-Stage Council Logic | `backend/council.py` |
| Parallel AI Queries | `backend/openrouter.py` |
| Anonymized Peer Review | Built into council logic |
| Ranking Parser | `parse_ranking_from_text()` |
| OpenRouter Integration | `backend/openrouter.py` |

### Needs Building (~70%)

| Component | Effort | Priority |
|-----------|--------|----------|
| Port to TypeScript | Medium | Phase 1 |
| Oracle ATP Integration | Medium | Phase 1 |
| Document Parser (PDF/Word/Excel) | Medium | Phase 1 |
| Board-Specific Prompts | Medium | Phase 1 |
| Company Sandbox Architecture | High | Phase 2 |
| Conflict Detection Engine | Medium | Phase 2 |
| User Adaptation System | Medium | Phase 2 |
| Proactive Alerts | Low | Phase 2 |
| Custom Dashboard UI | High | Phase 3 |
| Audit Trail System | Low | Phase 3 |

---

## 8. Key Design Decisions

### Data Isolation (Critical)
- Each company's data in **separate Oracle ATP schemas**
- Cross-schema queries **prohibited at database level**
- Only structured insights cross boundaries (never raw documents)

### Multi-LLM Strategy
- **Why multiple models:** Different strengths, catches errors
- **Why anonymized review:** Prevents models favoring themselves
- **Why chairman:** Single synthesized recommendation

### Security & Compliance
- Encrypted database (mTLS)
- Full audit trail of all AI recommendations
- SOX-compliant decision documentation possible

---

## 9. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| LLM hallucination | Multi-model peer review catches inconsistencies |
| Data leakage | Database-level isolation |
| User trust | Full transparency — show all model responses |
| Scope creep | Phased delivery with clear milestones |
| API costs spike | Usage monitoring, caps configurable |

---

## 10. Communication Status

**Proposal sent:** December 21, 2025 (WhatsApp, Spanish)  
**Status:** Awaiting response

**Summary of what was sent:**
- MVP pricing: USD 8,000–10,000
- Upfront: USD 2,500
- Operational costs: USD 150–350/month (separate)
- Milestone-based payments with proportional refund policy
- Invitation to continue conversation by call

### If Response is Positive → Next Steps

1. Schedule Zoom call
2. Define exact scope for Phase 1
3. Agree on milestone definitions
4. Set up payment method
5. Begin architecture work

### If Price Negotiation

**Fallback option (pilot-only):**
- USD 4,000–5,000
- Multi-LLM deliberation engine + 1 company prototype
- 4-5 weeks
- Extensible if it works well

### If Employment Discussion Arises

**Can mention on the call:**
> "If at some point it's more convenient to structure this as a 
> part-time or contractor role instead of a project, I'm also 
> open to discussing that."

---

## 11. Reference Documents

| Document | Location |
|----------|----------|
| Refined Proposal | `reference/karpathy-llm-council/BOARD-INTELLIGENCE-PROPOSAL-REFINED.md` |
| Karpathy README | `reference/karpathy-llm-council/README.md` |
| Technical Notes | `reference/karpathy-llm-council/CLAUDE.md` |
| Integration Plan | `reference/karpathy-llm-council/AIDEAZZ-REFERENCE-NOTE.md` |
| Council Logic | `reference/karpathy-llm-council/backend/council.py` |
| OpenRouter Client | `reference/karpathy-llm-council/backend/openrouter.py` |

---

## 12. My Qualifications (For Reference)

| Experience | Relevance |
|------------|-----------|
| 7 live AI agents in production | Multi-LLM orchestration proven |
| Oracle ATP + mTLS encryption | Enterprise DB experience |
| 7 years C-suite in E-Government | Understands board materials, governance |
| CTO AIPA (autonomous code reviewer) | Similar architecture to this project |
| Bilingual EN/ES | Client communication |

---

## Quick Answers If Asked

**"Can you do it cheaper?"**
> "For a narrower pilot (just the deliberation engine + 1 company), 
> we could do USD 4,000-5,000. The $8-10K includes full MVP with 
> document parsing and production deployment."

**"How do I know it will work?"**
> "Milestone-based payments. You test each stage before paying for next. 
> If I don't deliver, proportional refund. Zero risk of paying for nothing."

**"Why should I trust you?"**
> "I have 7 AI agents running in production right now. You can see my 
> GitHub. I also worked 7 years at C-level preparing board materials — 
> I understand exactly what you need."

**"What about ongoing support?"**
> "We can discuss a maintenance arrangement after MVP is validated. 
> Or structure as part-time ongoing role if that works better for you."

---

*Last updated: December 21, 2025*
*Status: Awaiting client response*
