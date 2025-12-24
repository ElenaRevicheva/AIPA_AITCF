# 🎭 ATUONA Book Publishing Roadmap

**AI Co-Founders Collaboration: Creative + Technical**

*Last Updated: December 24, 2025 | Created by CTO AIPA*

---

## 📖 The Vision

Transform Elena's underground poetry into an evolving, blockchain-published book where:
- **CTO AIPA** (Tech Co-Founder) pushes new content to the website
- **Atuona AI** (Creative Co-Founder) generates new book pages daily
- Each page becomes an NFT on **atuona.xyz**

**The Secret**: Finding Paradise on Earth through Vibe Coding 🌴💻

---

## 📚 About the Book

### Theme & Style
- **Language**: Russian (with some English/Spanish elements)
- **Genre**: Underground Poetry / Autobiographical Prose
- **Themes**: 
  - Memory and nostalgia
  - Addiction and recovery
  - Family and love
  - Technology (crypto, NFT, AI, blockchain)
  - Finding paradise through creation
  - Vibe coding as spiritual practice

### Existing Content
- **45 poems** already on blockchain as NFTs
- **First chapter** written by Elena (to be deployed)
- **Style reference**: Raw, unfiltered, deeply personal

### Content Format
Each page/entry follows this structure:
```json
{
  "name": "Title #XXX",
  "description": "ATUONA Gallery of Moments - Underground Poem XXX...",
  "image": "https://fast-yottabyte-noisy.on-fleek.app/images/poem-XXX.png",
  "attributes": [
    {"trait_type": "Title", "value": "Title"},
    {"trait_type": "ID", "value": "XXX"},
    {"trait_type": "Collection", "value": "GALLERY OF MOMENTS"},
    {"trait_type": "Type", "value": "Free Underground Poetry"},
    {"trait_type": "Language", "value": "Russian"},
    {"trait_type": "Theme", "value": "Theme Name"},
    {"trait_type": "Poem Text", "value": "Full text content..."}
  ]
}
```

---

## 🏗️ Technical Architecture

### Current Stack
- **Frontend**: HTML + CSS + JavaScript (Vite)
- **Blockchain**: Polygon (ERC721 Drop via thirdweb)
- **Hosting**: Fleek.xyz (auto-deploys from GitHub)
- **NFT Contract**: `0x9cD95Ad5e6A6DAdF206545E90895A2AEF11Ee4D8`

### Website Structure
```
atuona/
├── index.html           # Main gallery page
├── styles.css           # Underground aesthetic
├── src/main.js          # Wallet & claiming logic
├── metadata/            # NFT metadata JSON files
├── public/images/       # Poem images
└── atuona-*.json        # Poem collections
```

### Gallery Slot Format (HTML)
```html
<div class="gallery-slot" onclick="claimPoem(ID, 'Title')">
    <div class="slot-content">
        <div class="slot-id">XXX</div>
        <div class="slot-label">Title</div>
        <div class="slot-year">2025</div>
        <div class="claim-button">CLAIM NFT</div>
    </div>
</div>
```

---

## 🤖 AI Co-Founders

### CTO AIPA (Tech Co-Founder)
**Role**: Technical implementation & deployment

**Capabilities**:
- ✅ Push code to GitHub repos
- ✅ Create PRs with new content
- ✅ Generate gallery slot HTML
- ✅ Create NFT metadata JSON
- ✅ Trigger website updates

**Integration Point**: Telegram bot commands
- `/code atuona <task>` - Write code & create PR
- `/fix atuona <issue>` - Fix bugs

### Atuona AI (Creative Co-Founder) 
**Role**: Daily book content generation

**Capabilities** (To Be Built):
- 🔄 Generate 1-2 pages of book content daily
- 🔄 Maintain Elena's writing style and voice
- 🔄 Continue the narrative arc
- 🔄 Create matching themes and imagery
- 🔄 Output in proper NFT format

**Scheduled Task**: Daily at [TIME TBD] Panama time

---

## 📋 Implementation Phases

### Phase 1: Deploy Existing First Chapter ✅ Ready
**Goal**: CTO AIPA deploys Elena's existing first chapter

**Tasks**:
1. [ ] Elena provides first chapter content
2. [ ] CTO AIPA formats as NFT pages (starting from #046)
3. [ ] Generate metadata JSON for each page
4. [ ] Create gallery slots HTML
5. [ ] Push to main branch → Auto-deploy via Fleek

**Commands**:
```
/code atuona Add chapter 1 page 1 with content: [TEXT]
```

### Phase 2: Build Atuona Creative AI 🔄 In Progress
**Goal**: Create the Creative Co-Founder agent

**Tasks**:
1. [ ] Analyze all 45 existing poems for style patterns
2. [ ] Create style guide document
3. [ ] Build content generation prompt template
4. [ ] Integrate with CTO AIPA's scheduled tasks
5. [ ] Add `/atuona` command to Telegram bot

**Technical Requirements**:
- Claude Opus 4 for creative writing
- Style transfer from existing poems
- Russian language fluency
- Narrative continuity tracking

### Phase 3: Daily Publishing Pipeline 🔄 Planned
**Goal**: Automated daily book page creation

**Workflow**:
```
Daily Cron (10 AM Panama)
        ↓
Atuona AI generates new page
        ↓
CTO AIPA creates:
  - NFT metadata JSON
  - Gallery slot HTML
  - Poem image (optional)
        ↓
Push to GitHub main branch
        ↓
Fleek auto-deploys
        ↓
New page live on atuona.xyz!
```

**Tasks**:
1. [ ] Add cron job to CTO AIPA (10 AM Panama)
2. [ ] Create content generation function
3. [ ] Create metadata generation function
4. [ ] Create HTML slot generation function
5. [ ] Add direct push to main (bypass PR)
6. [ ] Test end-to-end pipeline

### Phase 4: Blockchain Minting 🔄 Future
**Goal**: Auto-mint new pages as NFTs

**Tasks**:
1. [ ] Integrate with thirdweb SDK
2. [ ] Auto-upload images to IPFS
3. [ ] Lazy mint new tokens
4. [ ] Update contract metadata

---

## 📁 New Files to Create

### For Each Book Page:
1. `metadata/poem-XXX.json` - NFT metadata
2. `public/images/poem-XXX.png` - Visual representation
3. Update `index.html` - Add gallery slot

### Style Guide:
- `docs/STYLE-GUIDE.md` - Elena's writing voice
- `docs/NARRATIVE-ARC.md` - Story progression

---

## 🎯 Success Metrics

- [ ] First chapter (all pages) deployed
- [ ] Atuona AI generating daily content
- [ ] Consistent style with existing poems
- [ ] No manual intervention needed for daily updates
- [ ] Website auto-updates within 5 minutes of push

---

## 💡 Commands Reference

### CTO AIPA (Existing)
```
/code atuona Add new poem page with title X
/fix atuona Fix gallery display issue
/review atuona Check latest changes
```

### Atuona AI (To Be Built)
```
/atuona create - Generate next book page
/atuona status - Show current chapter/page
/atuona style - Show style guide
/atuona preview - Preview next generation
```

### Combined Workflow
```
/atuona publish - Generate + Format + Push + Deploy
```

---

## 🔗 Resources

- **Website**: https://atuona.xyz
- **GitHub**: https://github.com/ElenaRevicheva/atuona
- **Contract**: [PolygonScan](https://polygonscan.com/address/0x9cD95Ad5e6A6DAdF206545E90895A2AEF11Ee4D8)
- **Fleek**: Configured for auto-deploy from main branch

---

## 👩‍💻 Author

**Elena Revicheva** - Founder, AIdeazz
- The architect behind Atuona
- Finding Paradise through Vibe Coding
- Building the future, one AI co-founder at a time

---

*"Галеристка. Люблю тебя, мама. Дочь."* 🎭

---

**Next Step**: Elena provides first chapter content → CTO AIPA deploys it! 🚀
