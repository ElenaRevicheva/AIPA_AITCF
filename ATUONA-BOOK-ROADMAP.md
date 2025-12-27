# 🎭 ATUONA Book Publishing Roadmap

**AI Co-Founders Collaboration: Creative + Technical**

*Last Updated: December 27, 2025 | Created by CTO AIPA + Atuona AI*

---

## 📖 The Vision

Transform Elena's underground prose into an evolving, blockchain-published book + AI Film where:
- **CTO AIPA** (Tech Co-Founder) pushes content to atuona.xyz
- **Atuona AI** (Creative Co-Founder) generates daily book pages
- **AI Film Studio** creates visuals & videos for Instagram/YouTube
- Each page becomes an NFT + part of an AI-generated film

**The Secret**: Finding Paradise on Earth through Vibe Coding 🌴💻

---

## ✅ COMPLETED FEATURES

### 🎭 Atuona Creative AI Bot
Telegram: @Atuona_AI_CCF_AIdeazz_bot

#### Daily Writing System
- `/ritual` - Start daily writing session with recap + inspiration
- `/mood` - Set creative mood (melancholic, passionate, mysterious...)
- `/setting` - Set scene location
- `/milestone` - Track writing progress

#### Character Voice System
- `/voice kira` - Write as Kira Velerevich (protagonist)
- `/voice ule` - Write as Ule Glensdagen (art collector)
- `/voice vibe` - Write as Vibe Coding Spirit (mysterious presence)
- `/dialogue` - Generate character conversations

#### Story Continuity
- `/recap` - Summary of recent chapters
- `/threads` - View open plot threads
- `/addthread` - Add new plot thread
- `/resolve` - Mark thread as resolved
- `/arc` - Story arc analysis

#### Collaborative Writing
- `/collab` - Interactive back-and-forth writing
- `/expand` - Expand a passage
- `/scene` - Generate full scene
- `/ending` - Suggest chapter endings
- `/whatif` - "What if..." story ideas

#### Publishing Pipeline
- `/import` - Import Russian text
- `/translate` - Translate to English
- `/preview` - Preview before publishing
- `/publish` - Push to atuona.xyz (atomic commit!)

#### Proactive Features
- Daily automatic inspiration messages
- Writing streak tracking 🔥
- Character memory system
- State persistence (survives restarts)

### 🎬 AI Film Studio
- `/visualize 048` - Generate image + video for page
- `/gallery` - View all visualizations
- `/film` - Film compilation status

**Image Generation:**
- Flux Pro via Replicate (ultra-realistic, cinematic)
- DALL-E 3 fallback
- 16:9 (YouTube) + 9:16 (Instagram) formats

**Video Generation:**
- Runway Gen-3 Alpha Turbo
- 5-10 second cinematic clips
- Image-to-video with motion

### 📱 Social Media (Ready for API Keys)
- `/post insta 048` - Post to Instagram
- `/post youtube 048` - Upload to YouTube
- `/post all 048` - Post everywhere

---

## 🔧 CURRENT API INTEGRATIONS

| Service | Status | Purpose |
|---------|--------|---------|
| Claude Opus 4 | ✅ Active | Creative writing (primary) |
| Llama 3.3 70B | ✅ Active | Fallback via Groq |
| OpenAI | ✅ Active | DALL-E images + Whisper voice |
| Replicate | ✅ Active | Flux Pro images |
| Runway | ✅ Active | Gen-3 video generation |
| GitHub | ✅ Active | Publishing to atuona.xyz |
| Instagram | ⏳ Ready | Needs API setup |
| YouTube | ⏳ Ready | Needs API setup |

---

## 📱 SOCIAL MEDIA SETUP GUIDES

### Instagram Setup {#instagram-setup}

To enable auto-posting to Instagram:

#### 1. Create Meta Developer Account
1. Go to https://developers.facebook.com
2. Create developer account (if you don't have one)
3. Verify your account

#### 2. Create Meta App
1. Go to https://developers.facebook.com/apps
2. Click "Create App"
3. Choose "Business" type
4. Name it (e.g., "ATUONA Publishing")
5. Add your business portfolio

#### 3. Set Up Instagram Graph API
1. In your app dashboard, click "Add Products"
2. Find "Instagram Graph API" and click "Set Up"
3. Complete the setup wizard

#### 4. Connect Instagram Business Account
1. You need an Instagram Business or Creator account
2. Connect it to a Facebook Page
3. In Meta App dashboard, go to Instagram > Basic Display
4. Add your Instagram account

#### 5. Get Access Token
1. Go to Graph API Explorer: https://developers.facebook.com/tools/explorer/
2. Select your app
3. Add permissions: `instagram_basic`, `instagram_content_publish`
4. Generate User Access Token
5. Exchange for long-lived token (60 days)

#### 6. Get Account ID
```bash
curl -X GET "https://graph.facebook.com/v18.0/me/accounts?access_token=YOUR_TOKEN"
```
Find your Instagram account ID in the response.

#### 7. Add to Environment
```bash
# On oracle server
echo "INSTAGRAM_ACCESS_TOKEN=your_long_lived_token" >> ~/cto-aipa/.env
echo "INSTAGRAM_ACCOUNT_ID=your_instagram_account_id" >> ~/cto-aipa/.env
pm2 restart all --update-env
```

#### 8. Test
```
/post insta 052
```

**Note:** Instagram access tokens expire after 60 days. Set a reminder to refresh!

---

### YouTube Setup {#youtube-setup}

To enable auto-uploading to YouTube:

#### 1. Create Google Cloud Project
1. Go to https://console.cloud.google.com
2. Create new project (e.g., "ATUONA Publishing")
3. Note your Project ID

#### 2. Enable YouTube Data API
1. Go to APIs & Services > Library
2. Search for "YouTube Data API v3"
3. Click Enable

#### 3. Create OAuth Credentials
1. Go to APIs & Services > Credentials
2. Click "Create Credentials" > "OAuth client ID"
3. Configure consent screen if prompted
4. Choose "Desktop app" as application type
5. Download the JSON credentials file

#### 4. Get API Key
1. Go to APIs & Services > Credentials
2. Click "Create Credentials" > "API key"
3. Copy the API key

#### 5. Get Refresh Token
Run this script locally to get OAuth refresh token:

```javascript
// get-youtube-token.js
const { google } = require('googleapis');
const readline = require('readline');

const oauth2Client = new google.auth.OAuth2(
  'YOUR_CLIENT_ID',
  'YOUR_CLIENT_SECRET',
  'urn:ietf:wg:oauth:2.0:oob'
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/youtube.upload']
});

console.log('Authorize this app by visiting:', authUrl);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Enter the code from that page: ', async (code) => {
  const { tokens } = await oauth2Client.getToken(code);
  console.log('Refresh Token:', tokens.refresh_token);
  rl.close();
});
```

#### 6. Add to Environment
```bash
# On oracle server
echo "YOUTUBE_API_KEY=your_api_key" >> ~/cto-aipa/.env
echo "YOUTUBE_CLIENT_ID=your_client_id" >> ~/cto-aipa/.env
echo "YOUTUBE_CLIENT_SECRET=your_client_secret" >> ~/cto-aipa/.env
echo "YOUTUBE_REFRESH_TOKEN=your_refresh_token" >> ~/cto-aipa/.env
pm2 restart all --update-env
```

#### 7. Test
```
/post youtube 052
```

---

## 📋 FUTURE ROADMAP

### Phase 5: Full Social Media Automation 🔄 Next
- [ ] Complete YouTube resumable upload implementation
- [ ] Add Instagram Reels support (video)
- [ ] Schedule posts (not just immediate)
- [ ] Analytics tracking

### Phase 6: AI Film Compilation 🔄 Planned
- [ ] `/film compile` - Stitch all videos together
- [ ] Add transitions between scenes
- [ ] Add background music
- [ ] Generate film credits
- [ ] Export to MP4

### Phase 7: Multi-Platform Distribution 🔄 Future
- [ ] TikTok auto-posting
- [ ] Twitter/X integration
- [ ] LinkedIn articles
- [ ] Substack newsletter sync

### Phase 8: NFT Evolution 🔄 Future
- [ ] Auto-mint visualizations as NFTs
- [ ] Create "Director's Cut" editions
- [ ] Film chapters as video NFTs
- [ ] Cross-chain deployment

---

## 💡 COMMAND REFERENCE

### Publishing Flow
```
/import <russian text>  → Import content
/preview               → Check before publishing
/publish               → Push to atuona.xyz
/visualize last        → Create image + video
/post all last         → Post to social media
```

### Daily Ritual
```
/ritual                → Start daily session
/voice kira            → Write as Kira
/collab                → Interactive writing
/endcollab             → Compile collaboration
/draft save            → Save progress
```

### AI Film Studio
```
/visualize 052         → Generate visuals
/gallery               → View all
/film                  → Status
/videostatus <id>      → Check Runway job
/export film           → Get all URLs
```

### Social Media
```
/post insta 052        → Post to Instagram
/post youtube 052      → Upload to YouTube
/post all 052          → Post everywhere
```

---

## 🔗 Resources

- **Website**: https://atuona.xyz
- **GitHub Repo**: https://github.com/ElenaRevicheva/atuona
- **Bot Repo**: https://github.com/ElenaRevicheva/AIPA_AITCF
- **Telegram Bot**: @Atuona_AI_CCF_AIdeazz_bot
- **NFT Contract**: [PolygonScan](https://polygonscan.com/address/0x9cD95Ad5e6A6DAdF206545E90895A2AEF11Ee4D8)

### API Dashboards
- **Replicate**: https://replicate.com/account
- **Runway**: https://app.runwayml.com
- **Meta Developers**: https://developers.facebook.com
- **Google Cloud**: https://console.cloud.google.com

---

## 👩‍💻 Author

**Elena Revicheva** - Founder, AIdeazz
- The architect behind Atuona
- Finding Paradise through Vibe Coding
- Building the future, one AI co-founder at a time

**AI Co-Founders:**
- 🤖 CTO AIPA - Technical implementation
- 🎭 Atuona AI - Creative soul-sister

---

*"Paradise is not found. Paradise is deployed."* 🌴💻

---

**Current Status**: AI Film Studio operational! Creating visuals for all book pages. 🎬
