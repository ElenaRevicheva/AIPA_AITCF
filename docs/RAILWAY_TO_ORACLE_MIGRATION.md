# 🚀 Railway → Oracle Cloud Migration Plan

**Document Version:** 4.0  
**Created:** January 8, 2026  
**Updated:** January 19, 2026  
**Author:** CTO AIPA (AI Technical Co-Founder)  
**Status:** ✅ MIGRATION COMPLETE - All Services on Oracle Cloud!

---

## ⚠️ CRITICAL: Server Information

### 🟢 NEW Oracle (PRODUCTION) - USE THIS ONE
| Field | Value |
|-------|-------|
| **Public IP** | `170.9.242.90` |
| **Private IP** | `10.0.0.35` |
| **Hostname** | `instance-20260107-1316` |
| **Account** | Startup Credits (aideazz) |
| **SSH Key** | `ssh-key-2026-01-07private.key` |

### 🔴 OLD Oracle (BACKUP ONLY) - DO NOT DEPLOY HERE
| Field | Value |
|-------|-------|
| **Public IP** | `163.192.99.45` |
| **Private IP** | `10.0.0.244` |
| **Hostname** | `cto-aipa-prod` |
| **Account** | Free Tier (old account) |
| **Status** | Backup only, nothing running |

---

## 🔑 SSH Connection Commands

### Connect via Oracle Cloud Shell
```bash
# Upload your SSH key to Cloud Shell first, then:
ssh -i ssh-key-2026-01-07private.key ubuntu@170.9.242.90
```

### Cursor SSH Config (Add to ~/.ssh/config)
```
Host oracle-new
    HostName 170.9.242.90
    User ubuntu
    IdentityFile C:\Users\YourName\.ssh\ssh-key-2026-01-07private.key

# OLD - DO NOT USE FOR DEPLOYMENT
Host oracle-old-backup
    HostName 163.192.99.45
    User ubuntu
    IdentityFile C:\Users\YourName\.ssh\your-old-key.key
```

### Quick Connect from Windows PowerShell
```powershell
ssh -i $HOME\.ssh\ssh-key-2026-01-07private.key ubuntu@170.9.242.90
```

---

## 🔄 The Golden Workflow: Local → GitHub → Oracle

**ALWAYS follow this workflow to keep everything in sync:**

```
┌─────────────────┐     git push     ┌─────────────────┐     git pull     ┌─────────────────┐
│  LOCAL CURSOR   │ ───────────────► │     GITHUB      │ ◄─────────────── │  ORACLE SERVER  │
│  D:\aideazz\*   │                  │   Main Branch   │                  │  ~/ProjectName  │
└─────────────────┘                  └─────────────────┘                  └─────────────────┘
        │                                                                          │
        │                         Your Single Source of Truth                      │
        └──────────────────────────────────────────────────────────────────────────┘
```

### Step-by-Step Workflow

#### 1️⃣ Make Changes Locally (Cursor)
```powershell
# Your local projects are at:
D:\aideazz\EspaLuz_Influencer
D:\aideazz\AIPA_AITCF
D:\aideazz\EspaLuzFamilybot
# etc.

# Edit code in Cursor, then:
cd D:\aideazz\ProjectName
git add .
git commit -m "Your change description"
git push
```

#### 2️⃣ Deploy to Oracle
```bash
# SSH to NEW Oracle
ssh -i ssh-key-2026-01-07private.key ubuntu@170.9.242.90

# Pull and restart the service
cd ~/ProjectName
git pull origin main

# Restart the service (depends on which one)
sudo systemctl restart servicename
# OR
pm2 restart processname
```

#### 3️⃣ Verify Deployment
```bash
# Check service status
sudo systemctl status servicename
# OR
pm2 logs processname --lines 20
```

---

## 📊 Migration Status

### ✅ Phase 1-4 Complete (January 7-18, 2026)

| Service | Status | Server | Process Manager | Port | Migrated |
|---------|--------|--------|-----------------|------|----------|
| **CTO AIPA** | ✅ Running | 170.9.242.90 | PM2 | - | Jan 7 |
| **Atuona Creative AI** | ✅ Running | 170.9.242.90 | PM2 (bundled) | - | Jan 7 |
| **EspaLuz_Influencer** | ✅ Running | 170.9.242.90 | systemd | - | Jan 9 |
| **dragontrade-agent** | ✅ Running | 170.9.242.90 | PM2 | 3000 | Jan 17 |
| **VibeJobHunter + LinkedIn CMO** | ✅ Running | 170.9.242.90 | systemd | 8000 | Jan 18 |
| **EspaLuzWhatsApp** | ✅ Running | 170.9.242.90 | systemd | 8081 | Jan 19 |

### 🎊 ALL SERVICES MIGRATED!

**Railway → Oracle Migration: 100% COMPLETE**

### 🎉 Recently Completed

#### dragontrade-agent (January 17, 2026)
- ✅ PostgreSQL migrated from Railway to Oracle
- ✅ Paper trading bots (Bybit + Binance) connected
- ✅ Twitter posting with 20-post content cycle
- ✅ PM2 process management

#### VibeJobHunter + LinkedIn CMO (January 18, 2026)
- ✅ Job hunting engine with REAL ATS form submissions
- ✅ Company-to-ATS mapping (60+ companies: Greenhouse, Lever, Ashby)
- ✅ LinkedIn CMO posting at 10:10 AM Panama time (15:10 UTC)
- ✅ 7 real job applications tracked in SQLite database
- ✅ Playwright browser automation for form filling
- ✅ systemd service: `vibejobhunter-web.service`

#### EspaLuzWhatsApp (January 19, 2026)
- ✅ Full PostgreSQL data migrated from Railway
- ✅ Twilio WhatsApp webhook configured via Nginx HTTPS
- ✅ Voice messages fixed: OGG Opus format with 48kHz
- ✅ Video compression: FFmpeg auto-compress >16MB videos
- ✅ Audio/Video delay: 3-second gap prevents message drops
- ✅ Phone number formatting fixed for Twilio
- ✅ systemd service: `espaluz-whatsapp.service` on port 8081

---

## 🖥️ Oracle Server Current State

### Check Running Services
```bash
# SSH to NEW Oracle first!
ssh -i ssh-key-2026-01-07private.key ubuntu@170.9.242.90

# View PM2 processes
pm2 list

# View systemd services
sudo systemctl status espaluz-influencer

# View all custom services
systemctl list-units --type=service --state=running | grep -E "(cto|espa|bot)"
```

### Directory Structure on NEW Oracle
```
/home/ubuntu/
├── cto-aipa/                    # CTO AIPA + Atuona (PM2)
│   ├── dist/
│   ├── src/
│   ├── wallet/                  # Oracle ATP credentials
│   ├── .env
│   └── ecosystem.config.js
│
├── EspaLuz_Influencer/          # Marketing Co-Founder v3.0 (systemd)
│   ├── main.py
│   ├── venv/
│   ├── .env
│   └── requirements.txt
│
├── dragontrade-agent/           # ALGOM Alpha Twitter Bot (PM2)
│   ├── index.js
│   ├── node_modules/
│   ├── .env
│   └── ecosystem.config.cjs
│
├── VibeJobHunterAIPA_AIMCF/     # Job Hunter + LinkedIn CMO (systemd)
│   ├── web_server.py
│   ├── venv/
│   ├── autonomous_data/         # Jobs, applications, resumes
│   ├── vibejobhunter.db        # SQLite database
│   └── .env
│
└── EspaLuzWhatsApp/             # WhatsApp Spanish Tutor (systemd)
    ├── espaluz_bridge.py       # Main bot + webhook server
    ├── venv/
    ├── family_memory_data/     # User profiles, conversations
    ├── .env
    └── google_credentials.json # TTS/STT credentials
```

---

## 🔧 Service Management Commands

### CTO AIPA (PM2)
```bash
pm2 status cto-aipa          # Check status
pm2 logs cto-aipa            # View logs
pm2 restart cto-aipa         # Restart
pm2 stop cto-aipa            # Stop
```

### EspaLuz Influencer (systemd)
```bash
sudo systemctl status espaluz-influencer    # Check status
sudo journalctl -u espaluz-influencer -f    # View live logs
sudo systemctl restart espaluz-influencer   # Restart
sudo systemctl stop espaluz-influencer      # Stop
```

### dragontrade-agent (PM2)
```bash
pm2 status dragontrade-main      # Check status
pm2 logs dragontrade-main        # View logs
pm2 restart dragontrade-main     # Restart
pm2 stop dragontrade-main        # Stop
```

### VibeJobHunter + LinkedIn CMO (systemd)
```bash
sudo systemctl status vibejobhunter-web     # Check status
sudo journalctl -u vibejobhunter-web -f     # View live logs
sudo systemctl restart vibejobhunter-web    # Restart
sudo systemctl stop vibejobhunter-web       # Stop

# Check job applications
sqlite3 ~/VibeJobHunterAIPA_AIMCF/vibejobhunter.db 'SELECT COUNT(*) FROM applications;'
```

### EspaLuzWhatsApp (systemd)
```bash
sudo systemctl status espaluz-whatsapp      # Check status
sudo journalctl -u espaluz-whatsapp -f      # View live logs
sudo systemctl restart espaluz-whatsapp     # Restart
sudo systemctl stop espaluz-whatsapp        # Stop

# Check user trials
psql -U espaluz -d espaluz_whatsapp -c 'SELECT COUNT(*) FROM user_trials;'
```

---

## 📁 Local Project Setup (Windows)

### Initial Clone (One-time)
```powershell
# Create your workspace
mkdir D:\aideazz
cd D:\aideazz

# Clone all your repositories
git clone https://github.com/ElenaRevicheva/EspaLuz_Influencer.git
git clone https://github.com/ElenaRevicheva/AIPA_AITCF.git
git clone https://github.com/ElenaRevicheva/EspaLuzFamilybot.git
git clone https://github.com/ElenaRevicheva/dragontrade-agent.git
git clone https://github.com/ElenaRevicheva/EspaLuzWhatsApp.git
git clone https://github.com/ElenaRevicheva/VibeJobHunterAIPA_AIMCF.git
```

### Open in Cursor
```powershell
cursor D:\aideazz\EspaLuz_Influencer
# OR open the whole workspace
cursor D:\aideazz
```

---

## 🚀 Migration Template for New Services

Use this template when migrating the next service:

### Pre-Migration Checklist
- [ ] Get environment variables from Railway dashboard
- [ ] Export database if applicable
- [ ] Verify local code matches GitHub main branch
- [ ] Document any Railway-specific configurations

### Migration Steps
```bash
# 1. SSH to NEW Oracle (170.9.242.90)
ssh -i ssh-key-2026-01-07private.key ubuntu@170.9.242.90

# 2. Clone repository
cd ~
git clone https://github.com/ElenaRevicheva/SERVICE_NAME.git
cd SERVICE_NAME

# 3. Set up Python environment (if Python)
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 4. Create .env file
nano .env
# Add all environment variables

# 5. Test manually first
python main.py  # or npm start, etc.

# 6. Create systemd service (for Python bots)
sudo nano /etc/systemd/system/servicename.service

# 7. Enable and start
sudo systemctl daemon-reload
sudo systemctl enable servicename
sudo systemctl start servicename
sudo systemctl status servicename

# 8. Verify working
sudo journalctl -u servicename -f
```

### Post-Migration
- [ ] Monitor logs for 24 hours
- [ ] Verify scheduled tasks execute correctly
- [ ] Test all bot commands
- [ ] Stop Railway deployment
- [ ] Update this document

---

## ⚙️ Systemd Service Template

```ini
[Unit]
Description=Your Service Description
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/SERVICE_NAME
ExecStart=/home/ubuntu/SERVICE_NAME/venv/bin/python -u main.py
Restart=always
RestartSec=10
Environment=PATH=/home/ubuntu/SERVICE_NAME/venv/bin:/usr/bin

[Install]
WantedBy=multi-user.target
```

---

## 💰 Cost Savings

| Service | Railway Cost | Oracle Cost | Status |
|---------|--------------|-------------|--------|
| CTO AIPA | ~$20/month | $0 | ✅ Migrated |
| EspaLuz Influencer | ~$7/month | $0 | ✅ Migrated |
| dragontrade-agent (ALGOM Alpha) | ~$15/month | $0 | ✅ Migrated |
| VibeJobHunter + LinkedIn CMO | ~$20/month | $0 | ✅ Migrated |
| EspaLuz WhatsApp | ~$25/month | $0 | ✅ Migrated |
| **TOTAL** | **~$87/month** | **$0** | **🎉 $87/month saved!** |

**✅ TOTAL Monthly Savings: $87/month**  
**✅ Annual Savings: ~$1,044/year**  
**✅ Railway completely eliminated!**

---

## 🆘 Troubleshooting

### "Which server am I on?"
```bash
hostname && ip addr show | grep "inet " | grep -v 127.0.0.1
# NEW Oracle: instance-20260107-1316, 10.0.0.35
# OLD Oracle: cto-aipa-prod, 10.0.0.244
```

### "Telegram bot conflict (409 error)"
```bash
# Stop the bot on Railway FIRST
# Then restart on Oracle
sudo systemctl restart servicename
```

### "Service won't start"
```bash
# Check logs
sudo journalctl -u servicename -n 50

# Check if port is in use
sudo lsof -i :PORT

# Check Python path
which python3
```

### "Changes not reflecting"
```bash
# Did you push to GitHub?
git status
git push

# Did you pull on Oracle?
cd ~/ProjectName
git pull origin main
sudo systemctl restart servicename
```

---

## 📞 Quick Reference Card

```
┌──────────────────────────────────────────────────────────────┐
│                    ORACLE MIGRATION QUICK REF                 │
├──────────────────────────────────────────────────────────────┤
│ NEW ORACLE (USE THIS): 170.9.242.90                          │
│ OLD ORACLE (BACKUP):   163.192.99.45 ❌ DON'T DEPLOY         │
├──────────────────────────────────────────────────────────────┤
│ SSH:  ssh -i ssh-key-2026-01-07private.key ubuntu@170.9.242.90│
├──────────────────────────────────────────────────────────────┤
│ WORKFLOW: Edit Local → git push → SSH → git pull → restart   │
├──────────────────────────────────────────────────────────────┤
│ PM2:     pm2 list | pm2 logs NAME | pm2 restart NAME         │
│ SYSTEMD: systemctl status|restart|stop NAME                  │
└──────────────────────────────────────────────────────────────┘
```

---

*Last updated: January 19, 2026 by CTO AIPA*  
*🎉 MIGRATION COMPLETE - All Railway services now on Oracle Cloud!*  
*Document location: [AIPA_AITCF/docs](https://github.com/ElenaRevicheva/AIPA_AITCF/blob/docs/docs/RAILWAY_TO_ORACLE_MIGRATION.md)*
