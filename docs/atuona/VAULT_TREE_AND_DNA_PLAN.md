# atuona.xyz — the DNA page and the book tree

Explored 7 Sep 2026 (Claude Code). Sources read: `https://www.toxic-arts.com/pages/dna`,
`https://atuona.xyz/`, a fresh clone of `ElenaRevicheva/atuona` at `D:\aideazz\atuona`,
`aideazz/scripts/generate-ai-ops-wiki.mjs`, `cto-aipa/src/atuona-creative-ai.ts`.

---

## 1. What Toxic Arts' DNA page actually is

Shopify page, top-level nav item sitting beside Artists / Exhibitions / Press. Structure
is deliberately thin:

1. a 7-image slideshow,
2. one quoted mission line in caps — *"spotlighting and incubating the next generation's artists"*,
3. three short paragraphs: who we are, what we look for, get in touch,
4. a contact form.

About 110 words of prose. Two things matter for us:

- **It is a destination, not a subsection.** DNA has its own URL and its own nav slot.
- **It is the HOUSE's identity, not an artist's.** Toxic Arts is speaking about its own
  programme. It never becomes a biography.

## 2. What atuona.xyz has today

One hand-written `index.html` — **6,903 lines, 500 KB** — with three tab-switched
`<section>`s (script toggles a `.hidden` class; only one is ever on screen):

| Section | Nav label | Lines | What is in it |
|---|---|---|---|
| `#home` | VAULT | 955–5411 | **99 poem cards, every one fully expanded** |
| `#about` | MANIFEST | 5411–5446 | 35 lines of generic NFT boilerplate |
| `#gallery` | MINT | 5446–6285 | claim slots |
| `#manifestoModal` | *(none)* | 6812–6882 | **the real DNA — reachable only by `showManifesto()`** |

### The finding that changes the plan

The DNA copy **already exists** and is good. It is in the modal, not in MANIFEST:

> *To the Code Whisperer — Kira Velerevich, blockchain mystic, vibe coder, self-starter
> in Panama… From Panama's distant shores, she breathed life into dead code.*
> *To the Literary Community — Russian LITPROM "Redkollegiya"…*
> *You cannot choose your revelations.*

Meanwhile the section actually labelled MANIFEST in the nav says *"This gallery is a
rebellion against the sterile… POWERED BY POLYGON"* — house boilerplate with no author
in it.

So the site has the identity content and the identity slot, and they are the wrong way
round. **The modal is content with no door.**

## 3. Recommendation — DNA is its own section, and it absorbs the modal

Nav becomes: **VAULT · DNA · MANIFEST · FILM STUDIO · MINT**

- **DNA** (`#dna`, new) — the artist. Origin, practice, the Panama/code line, the LITPROM
  acknowledgment, "you cannot choose your revelations". Promoted out of the modal so it
  is in the DOM, crawlable, and linkable as a URL.
- **MANIFEST** (`#about`, unchanged slot) — the gallery's creed. Stays the house voice.

Why separate rather than folded into MANIFEST:

1. **Toxic Arts models it as a peer nav item.** DNA is where a serious gallery puts its
   identity; a subsection of a manifesto is where a hobby site puts it.
2. **Two different voices.** MANIFEST says *we*. DNA says *I*. On atuona the house and the
   artist are the same person, which is exactly why they need separate rooms — identity
   written inside a mission statement reads as self-promotion inside a creed.
3. **Money.** A DNA page is one URL that can carry the hireable identity (AI-augmented
   builder / GEO-AEO / automation architect) next to shipped proof — 99 poems, 6 films,
   on-chain, an autonomous daily publisher. Buried in a modal with no trigger it earns
   nothing; as a nav item it is a link that goes in an application.

## 4. The book tree — port the wiki's pattern, do not invent one

### The problem, measured

99 poems, all expanded, one flat column: **4,456 lines of DOM** between the hero and
MANIFEST. Reaching #045 means scrolling past 44 complete poems. There is no index, no
anchor, no filter, no deep link.

The AI Ops Wiki already solved this and its source says why:

> *A journal that gains a chapter every week cannot open with every chapter on screen —
> by the fiftieth session the front page is a wall.*

The vault is at ninety-nine.

### The structure

```
VAULT
├── PART I  · LITPROM        #001–#046   RU            2019–2025   (46)
│   ├── 2019 (19) · 2020 (12) · 2021 (3) · 2022 (1) · 2024 (6) · 2025 (5)
│   └── chapter = one poem  →  unfolds: verse · badge · description · COLLECT
└── PART II · ATUONA         #047–#099   mostly EN     2024–2026   (53)
    ├── 2024 (1) · 2025 (16) · 2026 (35)
    └── chapter = one poem
```

Three levels, same as the wiki: **PART → CHAPTER → BEAT**. The parts are not invented —
they are the two publication venues already stamped on every card
(`принято к публикации at LITPROM` vs `at ATUONA`), and the years come from those dates.

Plus: a Contents block that opens first instead of poem #001, a per-poem deep link
(`atuona.xyz/#p045` reaches poem 45 in one URL), and a sticky part rail.

### The three rules that are non-negotiable

1. **Every poem stays in the DOM at load, collapsed with CSS. Never injected, never
   fetched on click.** The entire GEO/AEO position depends on answer engines reading the
   full text of all 99 poems. A virtualised list or lazy fetch would make the site
   invisible to exactly the crawlers being optimised for.
2. **Disclosure by measured `max-height`, not `grid-template-rows: 0fr → 1fr`.** The wiki
   shipped the tidy modern recipe and it failed closed — the engine cannot interpolate an
   `fr`, so every chapter stayed shut while the class, the aria state and the counter all
   said open. The same bug would hide 99 poems here.
3. **`.nojs` fallback: everything stands open.** With JS off the page is a plain complete
   document.

## 5. Two live defects found while exploring

### 5.1 Poem #099's title is an error string — SHIPPED, on the live site

Commit `01f7db4`, today: *"📖 Add poem #099 'Could not generate content.' — complete publish"*.

The poem body is real (a prose piece about Kira backstage). The **title**, the
**description** and the **claim-button argument** are all the literal string
`Could not generate content.` — the model's refusal, treated as content and published
green.

```html
<h2 class="nft-title">Could not generate content.</h2>
<p class="nft-description">Could not generate content.</p>
<button onclick="claimPoem('099', 'Could not generate content.')">
```

Same shape as the grounding-gate incident: the generator refused, and nothing downstream
checked whether what came back was a poem or an apology.

### 5.2 The publisher splices into `index.html` by exact whitespace

`cto-aipa/src/atuona-creative-ai.ts:6369` finds the **last** `<div class="nft-card">`,
then `COLLECT SOUL</button>`, then this exact literal:

```js
const closePattern = '</div>\n                        </div>\n                    </div>';
```

If any of the three is not found, the `if` simply ends — **no else, no throw, no warning**.
The poem is committed to metadata and never appears in the vault.

It works today only because the last card happens to use `COLLECT SOUL`; the vault also
contains `ACQUIRE SPIRIT` and `RESERVE NOW` cards, and landing on one of those breaks it
silently.

**This is the hard constraint on the tree work:** the markup is a contract between two
repos. Restructuring `index.html` without updating `atuona-creative-ai.ts` in the same
change means the next `/create` publish silently stops appearing on the site.

## 6. Build order

1. Claim the row on the NOW.md session board (touches `atuona/index.html` **and**
   `cto-aipa/src/atuona-creative-ai.ts`).
2. Extract the 99 poems out of `index.html` into a durable data file — the wiki rule:
   the data is the source, the HTML is generated and never hand-edited, so it cannot
   drift. #099 proves `index.html` has already drifted.
3. Generator renders VAULT (Contents → parts → chapters) and the new `#dna` section.
4. **Update the publisher to append through the generator**, not by whitespace match, and
   make a failed match throw instead of returning quietly.
5. Fix #099's title/description from the poem's own opening.
6. Verify: all 99 titles present in the built HTML, all 99 verse bodies present in the
   DOM, `#p045` resolves, JS-off renders complete.
7. Push to `main` → 4everland. Confirm with Elena before this step.
