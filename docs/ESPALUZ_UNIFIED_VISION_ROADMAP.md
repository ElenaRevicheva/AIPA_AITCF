# 🌟 EspaLuz Unified Vision Roadmap
## Bringing Both Bots to 100% Vision Implementation

**Document Version:** 1.0  
**Created:** January 18, 2026  
**Author:** CTO AIPA  

---

## 🎯 THE COMPLETE VISION

> **EspaLuz** is a truly emotionally intelligent AI personal assistant and bilingual Spanish↔English tutor serving:
>
> 1. **Expats & Expat Families** - Learning Spanish, relocation assistance (schools, apartments, jobs, immigration)
> 2. **Travelers On-the-Go** - Real-time translation, cultural navigation, emergency assistance
> 3. **Locals** - Learning English for better service rendering, travel to English-speaking countries, and communication bridging with expats
>
> Acting as a **friendly counselor**, **relocation assistant**, **cultural interpreter**, and **trusted persona with memory for all members of the family** across ALL Spanish-speaking countries.

---

## 📱 Platform Capabilities Comparison

### What Each Platform Allows

| Capability | Telegram | WhatsApp |
|------------|----------|----------|
| **Bot API** | Native Bot API (telebot) | Twilio/Meta Business API |
| **Inline Keyboards** | ✅ Rich interactive buttons | ⚠️ Limited (list messages, buttons) |
| **Commands** | ✅ `/command` syntax | ❌ No slash commands |
| **Message Length** | 4096 characters | 1600 characters |
| **Voice Notes** | ✅ OGG/Opus format | ✅ OGG/Opus format |
| **Voice Duration** | Up to 20 min | Up to 5 min |
| **File Sharing** | ✅ Up to 2GB | ⚠️ Up to 100MB |
| **Webhooks** | ✅ Polling or Webhook | ✅ Webhook required |
| **Scheduled Messages** | ⚠️ Via external scheduler | ⚠️ Via external scheduler |
| **Message Templates** | Not required | ✅ Required for business |
| **User Phone Access** | ❌ (unless shared) | ✅ Always have phone |
| **Rich Media** | ✅ Stickers, GIFs, video notes | ⚠️ Images, videos, audio |
| **Groups/Channels** | ✅ Full support | ✅ Groups, Broadcast lists |
| **Status/Stories** | ❌ | ✅ WhatsApp Status |
| **Cost** | Free API | Paid per conversation |

### Platform-Specific UX Approaches

| Feature | Telegram Implementation | WhatsApp Implementation |
|---------|------------------------|-------------------------|
| **Menu Navigation** | Inline keyboards, `/commands` | Quick reply buttons, numbered lists |
| **Country Selection** | `/country panama` command | "Type the country name" or button list |
| **Conversation Mode** | `/convo on` / `/convo off` | "Say 'conversation mode'" natural language |
| **Demo Mode** | `/demo` command | Not applicable (no demos on WhatsApp) |
| **Settings** | `/settings` with inline keyboard | "Settings" keyword → numbered options |
| **Subscription** | Bot sends PayPal link | Bot sends PayPal link + PayPangea |

---

## 🔄 Feature Exchange Matrix

### Features to Port FROM Telegram TO WhatsApp

| Feature | Current State | Porting Effort | Priority |
|---------|---------------|----------------|----------|
| **Neural TTS (Microsoft Edge)** | ❌ Not in WhatsApp | 1-2 hours | 🔴 HIGH |
| **Deep Country Contexts** | ⚠️ Shallow in WhatsApp | 2-3 hours | 🔴 HIGH |
| **PostgreSQL Analytics** | ❌ Uses JSON files | 3-4 hours | 🔴 HIGH |
| **Local Slang Dictionaries** | ❌ Basic greetings only | 2 hours | 🟡 MEDIUM |
| **Clean Text Formatting** | ⚠️ Partial | 30 min | 🟢 LOW |

### Features to Port FROM WhatsApp TO Telegram

| Feature | Current State | Porting Effort | Priority |
|---------|---------------|----------------|----------|
| **Family Memory System** | ❌ Single profile only | 4-5 hours | 🔴 HIGH |
| **GPT-5 Emotional Analysis** | ⚠️ Basic detection | 2-3 hours | 🔴 HIGH |
| **PayPangea (Crypto)** | ❌ PayPal only | 2 hours | 🟡 MEDIUM |
| **Email Linking** | ❌ Not available | 1-2 hours | 🟢 LOW |
| **Learning Level Tracking** | ❌ No levels | 3 hours | 🔴 HIGH |

### Features BOTH Bots Need (New Development)

| Feature | Current State | Development Effort | Priority |
|---------|---------------|-------------------|----------|
| **Proactive Daily Tips** | ❌ 0% both | 4-6 hours | 🔴 CRITICAL |
| **Long-Term Learning Memory** | ❌ 5% both | 8-10 hours | 🔴 CRITICAL |
| **Spaced Repetition System** | ❌ 0% both | 10-15 hours | 🔴 HIGH |
| **Emotional Pattern Tracking** | ❌ One-shot only | 6-8 hours | 🔴 HIGH |
| **Relocation Assistant Tools** | ⚠️ Data exists, passive | 8-12 hours | 🟡 MEDIUM |
| **Bidirectional Mode (EN↔ES)** | ⚠️ Partial | 4-6 hours | 🔴 HIGH |

---

## 👥 User Persona Architecture

### The THREE User Types

```
┌─────────────────────────────────────────────────────────────────┐
│                        EspaLuz Users                            │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   🌎 EXPATS     │  ✈️ TRAVELERS   │        🏠 LOCALS            │
│ (Families)      │  (On-the-go)    │  (Service/Travel)           │
├─────────────────┼─────────────────┼─────────────────────────────┤
│ Learning:       │ Learning:       │ Learning:                   │
│ Spanish         │ Spanish         │ English                     │
│                 │                 │                             │
│ Needs:          │ Needs:          │ Needs:                      │
│ - Schools       │ - Directions    │ - Customer service phrases  │
│ - Apartments    │ - Emergency     │ - Travel English            │
│ - Jobs          │ - Food ordering │ - Expat communication       │
│ - Immigration   │ - Transport     │ - Professional vocabulary   │
│ - Healthcare    │ - Cultural tips │ - Accent practice           │
│ - Banking       │ - Quick phrases │ - Interview prep            │
│                 │                 │                             │
│ Memory:         │ Memory:         │ Memory:                     │
│ - All family    │ - Trip context  │ - Work context              │
│ - Long-term     │ - Short-term    │ - Long-term                 │
│ - Progress      │ - Location      │ - Progress                  │
└─────────────────┴─────────────────┴─────────────────────────────┘
```

### Onboarding Flow (Both Platforms)

```
START
  │
  ▼
┌─────────────────────────────────────┐
│ "¡Hola! Hello! I'm EspaLuz 🌟"      │
│                                      │
│ Are you:                             │
│ 1️⃣ Expat/Expat Family (Spanish)     │
│ 2️⃣ Traveler (Quick Help)            │
│ 3️⃣ Local (Learning English)         │
└─────────────────────────────────────┘
  │
  ├──► [1] Expat ──────────────────────┐
  │    │                                │
  │    ▼                                │
  │   "Welcome! What country are you   │
  │    relocating to?"                 │
  │    │                                │
  │    ▼                                │
  │   "Tell me about your family:      │
  │    - Just you?                     │
  │    - Partner/Spouse?               │
  │    - Children? (ages)"             │
  │    │                                │
  │    ▼                                │
  │   CREATE: Family Profile           │
  │   MODE: Relocation + Spanish       │
  │                                     │
  ├──► [2] Traveler ───────────────────┤
  │    │                                │
  │    ▼                                │
  │   "Quick setup! Which country      │
  │    are you visiting?"              │
  │    │                                │
  │    ▼                                │
  │   "How long is your trip?"         │
  │    │                                │
  │    ▼                                │
  │   CREATE: Trip Profile             │
  │   MODE: Quick Translation + Tips   │
  │                                     │
  └──► [3] Local ──────────────────────┤
       │                                │
       ▼                                │
      "¡Excelente! What's your goal?"  │
       - Customer service English      │
       - Travel to USA/UK/etc          │
       - Communicate with expats       │
       - Professional/Business English │
       │                                │
       ▼                                │
      CREATE: Local Profile            │
      MODE: English Learning           │
       │                                │
       ▼                                │
┌─────────────────────────────────────┐
│      PERSONALIZED EXPERIENCE        │
│  - Context-aware responses          │
│  - Learning path based on goal      │
│  - Emotional support adapted        │
│  - Progress tracking enabled        │
└─────────────────────────────────────┘
```

---

## 🧠 Unified Database Schema

### Core Tables (PostgreSQL - Both Bots)

```sql
-- ============================================
-- USER PROFILES (Supports all user types)
-- ============================================
CREATE TABLE user_profiles (
    id SERIAL PRIMARY KEY,
    platform VARCHAR(20) NOT NULL, -- 'telegram' or 'whatsapp'
    platform_id VARCHAR(50) NOT NULL, -- Telegram user_id or WhatsApp phone
    
    -- Identity
    name VARCHAR(100),
    preferred_name VARCHAR(50),
    email VARCHAR(255),
    phone VARCHAR(20),
    
    -- User Type & Goals
    user_type VARCHAR(20) NOT NULL, -- 'expat', 'traveler', 'local'
    learning_direction VARCHAR(10), -- 'en_to_es', 'es_to_en', 'both'
    primary_goal TEXT,
    
    -- Location Context
    country_of_origin VARCHAR(50),
    current_country VARCHAR(50),
    target_country VARCHAR(50), -- For travelers/future expats
    city VARCHAR(100),
    timezone VARCHAR(50),
    
    -- Learning Profile
    native_language VARCHAR(20),
    target_language VARCHAR(20),
    proficiency_level VARCHAR(30), -- 'absolute_beginner' to 'advanced'
    learning_style VARCHAR(30), -- 'visual', 'auditory', 'kinesthetic', 'mixed'
    
    -- Family Link
    family_id UUID,
    family_role VARCHAR(30), -- 'parent', 'child', 'grandparent', 'single'
    
    -- Subscription
    subscription_status VARCHAR(20) DEFAULT 'trial',
    subscription_id VARCHAR(100),
    trial_start TIMESTAMP,
    trial_end TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    last_active TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(platform, platform_id)
);

-- ============================================
-- FAMILY RELATIONSHIPS
-- ============================================
CREATE TABLE family_members (
    id SERIAL PRIMARY KEY,
    family_id UUID NOT NULL,
    user_id INTEGER REFERENCES user_profiles(id),
    
    -- Member Info (can exist without user_profile if added by parent)
    name VARCHAR(100) NOT NULL,
    relationship VARCHAR(30), -- 'spouse', 'child', 'parent', 'grandparent'
    age INTEGER,
    age_group VARCHAR(20), -- 'toddler', 'child', 'teen', 'adult', 'senior'
    
    -- Learning Profile
    proficiency_level VARCHAR(30),
    learning_interests TEXT[],
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- VOCABULARY TRACKING (Spaced Repetition)
-- ============================================
CREATE TABLE vocabulary (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES user_profiles(id),
    
    -- Word Data
    word VARCHAR(100) NOT NULL,
    translation VARCHAR(100),
    language VARCHAR(10), -- 'es' or 'en'
    context_sentence TEXT,
    category VARCHAR(50), -- 'banking', 'medical', 'food', etc.
    
    -- SRS Data (SM-2 Algorithm)
    ease_factor FLOAT DEFAULT 2.5,
    interval_days INTEGER DEFAULT 1,
    repetitions INTEGER DEFAULT 0,
    next_review TIMESTAMP,
    last_reviewed TIMESTAMP,
    
    -- Learning Source
    learned_from VARCHAR(50), -- 'conversation', 'lesson', 'correction'
    country_context VARCHAR(50),
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(user_id, word, language)
);

-- ============================================
-- EMOTIONAL HISTORY (Pattern Tracking)
-- ============================================
CREATE TABLE emotional_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES user_profiles(id),
    
    -- Emotion Data
    emotion VARCHAR(50) NOT NULL,
    intensity FLOAT, -- 0.0 to 1.0
    category VARCHAR(50), -- 'language_learning', 'cultural', 'family', etc.
    
    -- Context
    trigger_text TEXT,
    response_given TEXT,
    
    -- Metadata
    detected_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- CONVERSATION MEMORY (Long-term)
-- ============================================
CREATE TABLE conversation_memory (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES user_profiles(id),
    
    -- Memory Type
    memory_type VARCHAR(30), -- 'fact', 'preference', 'struggle', 'achievement'
    
    -- Content
    content TEXT NOT NULL,
    importance INTEGER DEFAULT 5, -- 1-10
    
    -- Usage
    times_referenced INTEGER DEFAULT 0,
    last_referenced TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- PROACTIVE TIPS SCHEDULE
-- ============================================
CREATE TABLE scheduled_tips (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES user_profiles(id),
    
    -- Tip Content
    tip_type VARCHAR(30), -- 'vocabulary', 'cultural', 'holiday', 'review'
    content TEXT,
    
    -- Schedule
    scheduled_for TIMESTAMP NOT NULL,
    sent BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMP,
    
    -- User Response
    user_engaged BOOLEAN,
    engagement_type VARCHAR(30)
);

-- ============================================
-- RELOCATION PROGRESS (Expats)
-- ============================================
CREATE TABLE relocation_progress (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES user_profiles(id),
    
    -- Milestones
    milestone_type VARCHAR(50), -- 'visa', 'housing', 'school', 'bank', 'healthcare'
    status VARCHAR(20), -- 'not_started', 'in_progress', 'completed'
    notes TEXT,
    
    -- Dates
    target_date DATE,
    completed_date DATE,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- APPLICATION TRACKING
-- ============================================
CREATE TABLE applications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES user_profiles(id),
    
    platform VARCHAR(20),
    total_messages INTEGER DEFAULT 0,
    voice_messages INTEGER DEFAULT 0,
    image_messages INTEGER DEFAULT 0,
    
    -- Learning Stats
    words_learned INTEGER DEFAULT 0,
    conversations_completed INTEGER DEFAULT 0,
    review_sessions INTEGER DEFAULT 0,
    
    -- Engagement
    streak_days INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_message_at TIMESTAMP,
    
    updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🚀 Implementation Phases

### Phase 1: Foundation (Week 1)
**Goal:** Unified database, feature parity basics

| Task | Platform | Hours | Owner |
|------|----------|-------|-------|
| Port PostgreSQL to WhatsApp | WhatsApp | 3-4h | CTO |
| Port Neural TTS to WhatsApp | WhatsApp | 1-2h | CTO |
| Port Family Memory to Telegram | Telegram | 4-5h | CTO |
| Implement unified user_profiles table | Both | 2-3h | CTO |
| Add bidirectional language support | Both | 4-6h | CTO |

**Deliverable:** Both bots have same database, TTS quality, and user profiling

---

### Phase 2: Emotional Intelligence (Week 2)
**Goal:** Deep emotional tracking across sessions

| Task | Platform | Hours | Owner |
|------|----------|-------|-------|
| Create emotional_history table | Both | 1h | CTO |
| Implement emotion pattern detection | Both | 4-5h | CTO |
| Add week-over-week trend analysis | Both | 3-4h | CTO |
| Create "You seem more confident!" logic | Both | 2-3h | CTO |
| Test emotional continuity across sessions | Both | 2h | CTO |

**Deliverable:** Bots recognize emotional patterns and provide continuity

---

### Phase 3: Learning Memory (Week 3)
**Goal:** Vocabulary tracking + Spaced Repetition

| Task | Platform | Hours | Owner |
|------|----------|-------|-------|
| Create vocabulary table with SRS fields | Both | 2h | CTO |
| Implement word extraction from conversations | Both | 4-5h | CTO |
| Implement SM-2 algorithm | Both | 6-8h | CTO |
| Create review scheduling system | Both | 3-4h | CTO |
| Build quiz/review interaction | Both | 4-5h | CTO |
| Add "You learned X words this week!" reports | Both | 2-3h | CTO |

**Deliverable:** Complete spaced repetition system competing with Duolingo

---

### Phase 4: Proactive Assistant (Week 4)
**Goal:** Bot initiates helpful contact

| Task | Platform | Hours | Owner |
|------|----------|-------|-------|
| Create scheduled_tips table | Both | 1h | CTO |
| Build holiday/event calendar per country | Both | 3-4h | CTO |
| Implement daily tip scheduler | Both | 4-5h | CTO |
| Add weather-based vocabulary suggestions | Both | 2-3h | CTO |
| Create review reminders | Both | 2-3h | CTO |
| Build proactive relocation milestone reminders | Both | 3-4h | CTO |

**Deliverable:** Bots send helpful tips without being asked

---

### Phase 5: Relocation Assistant (Week 5)
**Goal:** Active relocation support tools

| Task | Platform | Hours | Owner |
|------|----------|-------|-------|
| Create relocation_progress table | Both | 1h | CTO |
| Build school finder with filters | Both | 6-8h | CTO |
| Add apartment search guidance | Both | 4-5h | CTO |
| Implement immigration timeline tracker | Both | 4-5h | CTO |
| Add job search vocabulary & tips | Both | 3-4h | CTO |
| Create healthcare navigation guides | Both | 3-4h | CTO |

**Deliverable:** Complete relocation assistant for expats

---

### Phase 6: Local English Learning (Week 6)
**Goal:** Serve the LOCAL market (Spanish speakers learning English)

| Task | Platform | Hours | Owner |
|------|----------|-------|-------|
| Add English vocabulary modules | Both | 4-5h | CTO |
| Create service industry phrase packs | Both | 3-4h | CTO |
| Add travel English scenarios | Both | 3-4h | CTO |
| Build expat communication bridging | Both | 4-5h | CTO |
| Add pronunciation guides (EN) | Both | 3-4h | CTO |
| Create professional English tracks | Both | 4-5h | CTO |

**Deliverable:** Complete bidirectional language learning

---

## 📊 Success Metrics

### Vision Completion Tracking

| Metric | Current | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | Phase 6 |
|--------|---------|---------|---------|---------|---------|---------|---------|
| **Telegram Vision %** | 45% | 55% | 65% | 80% | 90% | 95% | 100% |
| **WhatsApp Vision %** | 40% | 55% | 65% | 80% | 90% | 95% | 100% |

### User Experience Metrics

| Metric | Target |
|--------|--------|
| Response time (text) | < 3 seconds |
| Response time (voice) | < 10 seconds |
| Emotional detection accuracy | > 85% |
| SRS review completion rate | > 60% |
| Proactive tip engagement | > 30% |
| Monthly retention | > 80% |
| Trial-to-paid conversion | > 15% |

---

## 💰 Cost Projections

### Development Investment

| Phase | Hours | Cost (@$0 - internal) |
|-------|-------|----------------------|
| Phase 1 | 18-22h | $0 |
| Phase 2 | 12-15h | $0 |
| Phase 3 | 21-27h | $0 |
| Phase 4 | 15-20h | $0 |
| Phase 5 | 21-27h | $0 |
| Phase 6 | 21-27h | $0 |
| **TOTAL** | **108-138h** | **$0** |

### Operational Costs (Post-Migration)

| Item | Monthly Cost |
|------|--------------|
| Oracle Cloud (both bots) | $0 (free tier) |
| PostgreSQL (shared) | $0 (Oracle) |
| Claude API | ~$50-100 |
| OpenAI API (Whisper) | ~$20-50 |
| Edge TTS | $0 (free) |
| **TOTAL** | **$70-150/month** |

### Revenue Projections (6 months post-completion)

| Metric | Conservative | Optimistic |
|--------|--------------|------------|
| Telegram Users | 500 | 2,000 |
| WhatsApp Users | 1,000 | 5,000 |
| Conversion Rate | 10% | 20% |
| Paying Users | 150 | 1,400 |
| ARPU | $11/month | $11/month |
| **MRR** | **$1,650** | **$15,400** |

---

## 🎯 Immediate Next Steps

1. **Migrate WhatsApp to Oracle** (eliminate Railway cost immediately)
2. **Port Neural TTS to WhatsApp** (quick win for voice quality)
3. **Implement unified PostgreSQL schema** (foundation for everything)
4. **Add bidirectional onboarding** (expat/traveler/local selection)
5. **Begin Phase 2: Emotional Intelligence** (key differentiator)

---

## 📝 Platform-Specific Adaptations

### Telegram-Specific Features
- `/commands` for quick access
- Inline keyboards for navigation
- Bot @mentions in groups
- Scheduled messages via Telegram's native scheduling
- Sticker packs for celebrations

### WhatsApp-Specific Features
- Natural language commands ("settings", "help")
- Quick reply buttons
- List messages for menus
- WhatsApp Status for daily tips
- Broadcast lists for subscribers

---

**Document maintained by:** CTO AIPA  
**Last updated:** January 18, 2026  
**Status:** STRATEGIC ROADMAP - Ready for Execution
