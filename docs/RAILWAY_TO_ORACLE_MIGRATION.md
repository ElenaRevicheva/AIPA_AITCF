# 🚀 Railway → Oracle Cloud Migration Plan

**Document Version:** 1.0  
**Created:** January 8, 2026  
**Author:** CTO AIPA (AI Technical Co-Founder)  
**Status:** Active Migration Planning

---

## Executive Summary

This document outlines the strategic migration plan for moving AIdeazz's production services from Railway to Oracle Cloud Infrastructure (OCI) with startup credits. The migration prioritizes cost reduction while maintaining 24/7 uptime for all AI agents.

### Why Migrate?

| Factor | Railway | Oracle Cloud |
|--------|---------|--------------|
| **Monthly Cost** | ~$50-100/month | **$0/month** (startup credits) |
| **Database** | PostgreSQL (separate cost) | Oracle ATP included |
| **Compute** | Shared containers | Dedicated VM (E5.Flex) |
| **Uptime** | Good | Enterprise-grade |

---

## Migration Priority Matrix

### ✅ Already Migrated

| Service | Status | Date | Notes |
|---------|--------|------|-------|
| **CTO AIPA** | ✅ Complete | Jan 7, 2026 | Running on Oracle VM + ATP database |
| **Atuona Creative AI** | ✅ Complete | Jan 7, 2026 | Bundled with CTO AIPA |

### 📋 Migration Queue (Priority Order)

| # | Service | Complexity | Est. Time | Dependencies |
|---|---------|------------|-----------|--------------|
| **1** | EspaLuz_Influencer | ⭐ Easy | 15 min | Telegram, Make.com |
| **2** | EspaLuzFamilybot | ⭐⭐ Medium | 30 min | Telegram, OpenAI, Claude, FFmpeg |
| **3** | dragontrade-agent | ⭐⭐⭐ Hard | 1 hour | Twitter API, PostgreSQL, CCXT |
| **4** | EspaLuzWhatsApp | ⭐⭐⭐⭐ Complex | 2-3 hours | WhatsApp/Twilio, PostgreSQL |
| **5** | VibeJobHunter + CMO | ⭐⭐⭐⭐⭐ Most Complex | 3-4 hours | Playwright, SQLite, Make.com |

---

## Detailed Analysis Per Service

### 1. EspaLuz_Influencer 🏆 **START HERE**

**Repository:** [github.com/ElenaRevicheva/EspaLuz_Influencer](https://github.com/ElenaRevicheva/EspaLuz_Influencer)

**Why Easiest:**
- ✅ Only **678 lines** of Python (single `main.py`)
- ✅ **No database** required
- ✅ **4 simple dependencies**: `pyTelegramBotAPI`, `schedule`, `pytz`, `requests`
- ✅ Already familiar pattern (Telegram bot)

**What It Does:**
- Daily automated social media posts to @EspaLuz Telegram channel
- Scheduled posting at 4:55 PM Panama time (21:55 UTC)
- Sends content to Make.com webhook for LinkedIn/Instagram distribution
- Emotional AI content templates for multiple audience segments

**Architecture:**
```
EspaLuz_Influencer
├── main.py              # Single entry point (678 lines)
├── requirements.txt     # 4 dependencies
├── image1-5.jpg        # Marketing images
└── espaluz_qr_4x5.jpg  # QR code image
```

**Environment Variables Needed:**
```bash
TELEGRAM_BOT_TOKEN=<influencer_bot_token>
```

**Migration Commands:**
```bash
cd /home/ubuntu
git clone https://github.com/ElenaRevicheva/EspaLuz_Influencer.git
cd EspaLuz_Influencer
pip3 install -r requirements.txt
# Create .env with TELEGRAM_BOT_TOKEN
pm2 start main.py --name espaluz-influencer --interpreter python3
pm2 save
```

---

### 2. EspaLuzFamilybot

**Repository:** [github.com/ElenaRevicheva/EspaLuzFamilybot](https://github.com/ElenaRevicheva/EspaLuzFamilybot)

**Complexity:** Medium

**What It Does:**
- Telegram AI tutor bot (`@EspaLuzFamily_bot`)
- Voice message processing with transcription
- OCR for image text extraction
- TTS (Text-to-Speech) responses
- Video generation for motivational content

**Architecture:**
```
EspaLuzFamilybot
├── main.py              # Main bot logic (2,912 lines)
├── requirements.txt     # ~7 dependencies
├── poll_subscriptions.py
├── webhook_cleaner.py
└── bot-killer.py       # Webhook conflict resolver
```

**Dependencies:**
- `openai` - GPT API for responses
- `telebot` - Telegram Bot API
- `gtts` - Google Text-to-Speech
- `pytesseract` - OCR engine
- `pillow` - Image processing

**System Requirements:**
```bash
# Install FFmpeg for video/audio processing
sudo apt install ffmpeg

# Install Tesseract for OCR
sudo apt install tesseract-ocr
```

**Environment Variables:**
```bash
TELEGRAM_BOT_TOKEN=<familybot_token>
CLAUDE_API_KEY=<anthropic_key>
OPENAI_API_KEY=<openai_key>
```

---

### 3. dragontrade-agent (ALGOM Alpha)

**Repository:** [github.com/ElenaRevicheva/dragontrade-agent](https://github.com/ElenaRevicheva/dragontrade-agent)

**Complexity:** Hard

**What It Does:**
- Autonomous X/Twitter trading education bot (@reviceva)
- Paper trading simulation with real market data
- Crypto education content generation
- Market analysis via CoinGecko API
- Scam detection alerts

**Architecture:**
```
dragontrade-agent
├── index.js                    # Main entry (ElizaOS framework)
├── package.json               # Node.js dependencies
├── educational-mcp-simple.js  # MCP educational content
├── coingecko-mcp-client.js   # Market data
├── mcp-trading-simulator.js  # Paper trading
├── mcp-scam-detection.js     # Scam alerts
└── post-logger.js            # Tweet tracking
```

**Key Dependencies:**
- `@elizaos/core` - AI agent framework
- `@elizaos/plugin-twitter` - Twitter integration
- `twitter-api-v2` - Twitter API client
- `ccxt` - Crypto exchange APIs
- `pg` - PostgreSQL client

**Database Required:**
- PostgreSQL for trade history and user data
- Can use Oracle ATP or external PostgreSQL

**Environment Variables:**
```bash
TWITTER_API_KEY=<key>
TWITTER_API_SECRET=<secret>
TWITTER_ACCESS_TOKEN=<token>
TWITTER_ACCESS_SECRET=<secret>
TWITTER_BEARER_TOKEN=<bearer>
DATABASE_URL=<postgres_connection_string>
GROQ_API_KEY=<groq_key>
```

---

### 4. EspaLuzWhatsApp

**Repository:** [github.com/ElenaRevicheva/EspaLuzWhatsApp](https://github.com/ElenaRevicheva/EspaLuzWhatsApp)

**Complexity:** High

**What It Does:**
- WhatsApp AI tutor (`wa.me/50766623757`)
- Multi-turn conversation management
- Subscription system with PayPal integration
- Voice message processing
- Emotional intelligence engine (82,000+ lines!)

**Architecture:**
```
EspaLuzWhatsApp
├── app.py                      # Flask web server
├── main.py                     # Telegram fallback
├── emotional_intelligence.py   # EI engine (82K lines)
├── conversation_mode.py        # Multi-turn conversations
├── user_trial_system.py       # Free trial logic
├── admin_routes.py            # Admin dashboard
├── Dockerfile                 # Container config
└── requirements.txt           # 13 dependencies
```

**Key Dependencies:**
- `flask` - Web framework
- `anthropic` - Claude API
- `openai` - GPT API
- `psycopg2-binary` - PostgreSQL
- `gunicorn` - Production server

**Database Required:**
- PostgreSQL for user data, subscriptions, conversation history

**Environment Variables:**
```bash
TELEGRAM_BOT_TOKEN=<token>
CLAUDE_API_KEY=<key>
OPENAI_API_KEY=<key>
DATABASE_URL=<postgres_url>
PAYPAL_CLIENT_ID=<id>
PAYPAL_CLIENT_SECRET=<secret>
```

---

### 5. VibeJobHunter + CMO AIPA

**Repository:** [github.com/ElenaRevicheva/VibeJobHunterAIPA_AIMCF](https://github.com/ElenaRevicheva/VibeJobHunterAIPA_AIMCF)

**Complexity:** Most Complex

**What It Does:**
- Autonomous job hunting engine (hourly cycles)
- LinkedIn CMO v5.2 (daily AI-generated posts)
- ATS form submission via Playwright browser automation
- Email verification via IMAP
- CTO-CMO integration bridge

**Architecture:**
```
VibeJobHunterAIPA_AIMCF
├── src/
│   ├── autonomous/
│   │   ├── orchestrator.py    # Main brain
│   │   ├── ats_submitter.py   # Greenhouse automation
│   │   └── job_monitor.py     # Job scraping
│   ├── notifications/
│   │   ├── linkedin_cmo_v4.py # CMO AI
│   │   └── telegram_notifier.py
│   └── database/
│       └── database_models.py # SQLAlchemy
├── web_server.py              # FastAPI dashboard
├── railway-entrypoint.sh      # Startup script
├── Dockerfile                 # Container config
└── requirements.txt           # 35+ dependencies
```

**Special Requirements:**
- **Playwright + Chromium** for browser automation
- SQLite database (local file)
- Make.com webhook for LinkedIn posting

**System Requirements:**
```bash
# Playwright browser dependencies
sudo apt install libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
  libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2

# Install Playwright
pip install playwright
playwright install chromium
```

---

## Oracle Cloud Infrastructure Setup

### Current Configuration

**VM Instance:**
- Shape: VM.Standard.E5.Flex
- OCPUs: 1 (burstable)
- Memory: 6 GB
- OS: Ubuntu 24.04 LTS
- Public IP: Assigned

**Database:**
- Oracle Autonomous Database 26ai
- mTLS encryption
- Wallet-based authentication

### Process Manager (PM2)

All services managed via PM2:
```bash
pm2 list                    # View all services
pm2 logs <service>          # View logs
pm2 restart <service>       # Restart service
pm2 monit                   # Real-time monitoring
```

---

## Migration Checklist Template

Use this checklist for each service migration:

```markdown
## [Service Name] Migration Checklist

### Pre-Migration
- [ ] Document current Railway environment variables
- [ ] Export any database data if applicable
- [ ] Test service locally first
- [ ] Verify API keys are still valid

### Migration Steps
- [ ] Clone repository to Oracle VM
- [ ] Install system dependencies
- [ ] Install Python/Node.js dependencies
- [ ] Create .env file with credentials
- [ ] Test run manually first
- [ ] Configure PM2 process
- [ ] Verify service is responding

### Post-Migration
- [ ] Monitor logs for 24 hours
- [ ] Verify scheduled tasks work
- [ ] Update DNS/webhooks if needed
- [ ] Stop Railway service
- [ ] Document any issues encountered
```

---

## Cost Savings Projection

| Service | Railway Cost | Oracle Cost | Monthly Savings |
|---------|--------------|-------------|-----------------|
| CTO AIPA | ~$20/month | $0 | $20 |
| EspaLuz Influencer | ~$7/month | $0 | $7 |
| EspaLuz Familybot | ~$10/month | $0 | $10 |
| ALGOM Alpha | ~$15/month | $0 | $15 |
| EspaLuz WhatsApp | ~$25/month | $0 | $25 |
| VibeJobHunter + CMO | ~$20/month | $0 | $20 |
| **TOTAL** | **~$97/month** | **$0** | **$97/month** |

**Annual Savings: ~$1,164**

---

## Risk Mitigation

### Rollback Strategy
1. Keep Railway services running during migration testing
2. Only stop Railway after 48 hours of stable Oracle operation
3. Maintain Railway environment variables documentation for quick restore

### Monitoring
- PM2 provides automatic restart on crash
- Telegram notifications for critical errors
- Daily health checks via `/health` endpoints

### Known Issues & Solutions

| Issue | Solution |
|-------|----------|
| Telegram webhook conflicts | Use webhook killer threads |
| Oracle ATP connection | Requires mTLS wallet + TNS_ADMIN |
| Python path issues | Use `--interpreter python3` in PM2 |
| Port conflicts | Each service on unique port |

---

## Timeline

| Week | Tasks |
|------|-------|
| **Week 1** | ✅ CTO AIPA migrated |
| **Week 2** | EspaLuz Influencer + Familybot |
| **Week 3** | ALGOM Alpha (database setup) |
| **Week 4** | EspaLuz WhatsApp |
| **Week 5** | VibeJobHunter + CMO (most complex) |
| **Week 6** | Testing, optimization, Railway shutdown |

---

## Support & Documentation

- **CTO AIPA Repository:** [github.com/ElenaRevicheva/AIPA_AITCF](https://github.com/ElenaRevicheva/AIPA_AITCF)
- **Oracle Cloud Console:** [cloud.oracle.com](https://cloud.oracle.com)
- **PM2 Documentation:** [pm2.keymetrics.io](https://pm2.keymetrics.io)

---

*This document is maintained by CTO AIPA and updated with each migration milestone.*
