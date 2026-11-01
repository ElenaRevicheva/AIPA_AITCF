# EspaLuz — GEO / AEO / tech-SEO audit and free traction plan (1 Nov 2026)

Measured with Elena's own AI Visibility Audit API (`webhook.aideazz.xyz/cto/v1/visibility`, engine 1.2.0) and live data.

## Where EspaLuz stands

| URL | Score | What a crawler sees |
|---|---|---|
| `espaluz-ai-language-tutor.lovable.app` (the app) | **60 / C** | **8 words.** JavaScript-only shell: most AI crawlers do not run JS, so they get an empty page. No JSON-LD, no H1, no headings, no FAQ, no canonical, no sitemap, no llms.txt. Share image = Lovable's default picture. |
| `aideazz.xyz/espaluz` | (homepage) | Not an EspaLuz page: the SPA falls back to the AIdeazz homepage, canonical `/`. |
| `aideazz.xyz` | 100 / A+ | Strong, cited, prerendered — mentions EspaLuz only in passing. |

So EspaLuz has **no page anywhere that an answer engine can read and quote.** When a parent asks ChatGPT/Perplexity
"AI app to teach my child Spanish and English in Panama", there is nothing to cite.

## Funnel, measured
- Web: 9 accounts, 0 strangers (the 30 Oct signup is an internal test address).
- WhatsApp: 3 strangers in 60 days (20/27/29 Sep), all left after message 1 because onboarding demanded their country.
  Fixed live 1 Nov 23:07 UTC (EspaLuzWhatsApp `e0ce2bf`): answer first, country from the phone prefix.
- Root problem: **demand** — almost nobody arrives.

## The name `espaluz-ai-language-tutor.lovable.app`
- Every link, mention and citation EspaLuz earns builds **Lovable's** domain, not Elena's. Leave Lovable and every link dies.
- Reads as a prototype to a parent; too long to say or type; one of thousands of `*.lovable.app` sites.

## Free plan (no ads), in order
1. **A real EspaLuz page on `aideazz.xyz/espaluz`** through the existing `scripts/prerender-routes.mjs` (the machinery that
   made `/portfolio` and `/api` 100/100): ~600 words of real, verified text, one H1, question headings (FAQ),
   `SoftwareApplication` + `FAQPage` JSON-LD, price ($11/month, 14 days free), the three doors (web, WhatsApp, Telegram),
   added to sitemap + `llms.txt`. Inherits aideazz.xyz's authority. $0.
2. **Fix the app's own head** (ascent `index.html` + `public/`): canonical, JSON-LD, an EspaLuz share image, real
   text in the raw HTML (noscript block), `sitemap.xml`, `llms.txt`. Lovable Publish. $0.
3. **Own address later**: `espaluz.aideazz.xyz` (free subdomain; needs Lovable's custom-domain setting — check the plan
   allows it) or a bought domain when there is income.
4. **Track it**: add the EspaLuz URLs to the weekly self-audit (`.github/workflows/visibility-self-audit.yml`) and to the
   AI-citation baseline prompts (parents' questions), so movement is measured, not guessed.
5. **Built-in sharing**: the parent report already goes to every parent after a lesson — one line inviting them to
   share EspaLuz with another family is the only free distribution channel the product owns.
6. **The blog**: daily posts already run; EspaLuz posts link to the new page (internal links = authority).

Nothing here claims a user, a number or a result we have not measured.
