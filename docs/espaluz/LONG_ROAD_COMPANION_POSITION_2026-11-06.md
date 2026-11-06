# EspaLuz: where we stand on the long-road companion (6 Nov 2026)

Elena: pivot to an avatar nobody else has, a long-road companion, not noisy, natural, adapted inside the family.
Status: research and proposal. Nothing here is built. Pairs with `LAUNCH_FIRST_USERS_2026-11-06.md`, which holds the demand numbers and blockers.

## The finding
A photoreal talking face is not what nobody else has. Anyone can rent one. What we did not find anywhere is one companion, with one face,
who knows a whole family over years, in the chats they already use, and speaks up because of something she remembers.
EspaLuz has the pieces of that, but they are not connected yet.

"Did not find" means these searches on 6 Nov, many of them vendor or affiliate pages. It is not proof that no such product exists.

## What competitors have
| Who | Who it is for | Face | Memory | Gap we can use |
|---|---|---|---|---|
| Replika | One adult | 3D avatar, video calls on the paid tier | Sources disagree; one blog says voice does not share memory with other modes | One person's feelings, not a family |
| Tolan | One person | Animated alien, deliberately not human | Its core focus; personality grows from small story moments | No family, no real-life help in a new country |
| Alexa+, Gemini for Home | A household | None, speaker or screen | Alexa+ strongest: family details, days and devices. Per-person support unclear | Runs the home, not a companion; no LATAM immigrant focus found |
| LatamGuru, AskRudy, SettleIn, Expat.cl | People relocating | None | Not advertised | Tools or paid services for the move itself, not the years after |
| Praktika, Duolingo, Buddy.ai (earlier research) | Learners | 3D or cartoon tutor | Learning progress | Lessons, not family life |
| Tavus, Anam, HeyGen LiveAvatar, Runway | Developers | Photoreal live, about $0.10-0.37 a minute (sources conflict) | Tavus lists per-person memory | These are suppliers: any competitor can buy the same face |

**Lesson from Tolan:** the fastest-reported companion success chose memory and character over a realistic human. Its revenue figures conflict across sources, so do not quote them.

## Where EspaLuz really stands (from our code and production)
| Piece | Today |
|---|---|
| Face | Live on landing, web chat, classroom. Web chat has made 1 real per-reply clip |
| Voice | Emma in the classroom; Dalia + Ava on hellos; Gemini in web chat clips. Not yet one voice |
| Telegram, WhatsApp | Still send the old looping video on replies |
| Child memory | Works: classroom across web and Telegram, her own sentences come back |
| Adult memory, bots | Proven by a probe on 3 Nov. 14 days of production show 0 `remembered`, 0 `RAG recalled`, 0 `followup sent` |
| Adult memory, web chat | Last 8 turns of web chat plus the family list. It does not read the bots' `user_memories` |
| Across channels | Adult memory is not shared across channels; the family plan covered children only |
| Mood | Detected on web since the 5 Nov fix; no automatic clip seen yet |
| Stranger use | 40 people ever, 0 paid, 0 active in 30 days, 0 stranger web accounts in 14 days |

## What she should feel like
A family friend who has been around for a while. Rules:
1. **She speaks because she remembers.** "How did the meeting with the teacher go?" is the product. A video with no memory in it is decoration.
2. **Rare.** Text and voice daily, her face only at moments that earn it. Silence is a feature.
3. **She knows who is talking.** Mother, father, child each have their own thread, inside one family.
4. **She brings the family together, never replaces them.** She sends the child back to the parent; no dependence, no romance, no "I'm your best friend".
5. **Honest.** She always says she is an AI and never invents a memory.
6. **The long road is visible.** A short monthly clip: "three months ago you were worried about the school; look at you now." We found no competitor offering this; it is cheap and hard to copy, since it needs their history.

## Build order (connect pieces, no new servers)
1. **One adult memory.** Fix and prove the bots' memory with log lines (`remembered`, `RAG recalled`), then let web chat read and write the same facts. Free.
2. **One voice.** Emma everywhere, if the web chat can reach her for free (not checked).
3. **Moments built from memory.** The clip's words use one remembered fact. Web first, then replace the Telegram and WhatsApp loop.
4. **Follow-ups.** One gentle message after something she knows was coming up, with an easy off switch. Make `followup sent` non-zero.
5. **Long-road clip,** monthly, paying families only.
6. **Live video talk,** only after a family pays. Runway: 2 credits upfront + 2 per 6 s (about $0.20 a minute), 5-minute limit reported, up to 50,000 tokens of knowledge reported, sends the user's audio to Runway. Untested. Never for children without a separate privacy decision.

## Money
Eight 20-second moments a month is about 21 credits measured, 53 at list: $0.21-0.53 per family against $11. The clip formula works; the wallet does not yet: 76 credits above the 279 floor. The floor is Elena's call.
Grown-up moments only. Children keep pre-made clips.

## Safety before any child-facing companion claim
California SB 243 (in force 1 Jan 2026) requires AI disclosure, break reminders for minors and self-harm protocols; the FTC opened a companion-chatbot inquiry; Italy reportedly fined Replika EUR 5M (one source). Whether these reach us is a question for a lawyer, not settled here. Open gap: "me pega" gets no clip and no parent alert.

## How we will know it works
Five real families, Panama first. It works if at least 3 are still talking after 30 days and at least 1 pays. If not, stop building the face and read what they said. Sign-up blocker 1 in the first-users plan must be fixed first, or nobody can get in.

## Sources
[Replika reviews](https://clank.pages.dev/blog/replika-review-2026/), [Replika voice memory](https://www.roborhythms.com/?p=32975), [Tolan, OpenAI](https://openai.com/index/tolan), [Tolan, Fast Company](https://www.fastcompany.com/91283982/tolan-adorable-alien-ai-companion), [Alexa+](https://www.tomsguide.com/ai/alexa-release-date-cost-devices-and-all-the-new-ai-features), [Gemini for Home](https://blog.google/products/google-nest/gemini-for-home/), [LatamGuru](https://appadvice.com/app/latamguru-expat-life/6748356451), [SettleIn](https://apps.apple.com/app/settlein/id6758104988), [Expat.cl](https://www.expat.cl/expat-support-chile), [Tavus pricing](https://www.tavus.io/pricing), [Anam vs Tavus](https://anam.ai/blog/anam-vs-tavus), [Synthesia on Tavus](https://www.synthesia.io/post/tavus-interactive-avatar-alternatives), [Runway Characters](https://runwayml.com/en/product/characters), [Runway API reference](https://skills.sh/runwayml/skills/api-reference), [SB 243 and FTC](https://calawyers.org/privacy-law/regulatory-focus-on-ai-companion-character-chatbots/), [FTC orders](https://www.dlapiper.com/en/insights/publications/2025/09/ftc-ai-chatbots).
