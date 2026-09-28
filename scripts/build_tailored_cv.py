#!/usr/bin/env python3
"""
build_tailored_cv.py — one resume per job, tailored by SELECTION, never by generation.

    python scripts/build_tailored_cv.py --title "Product Manager - LATAM" --company "Hilbert"
    python scripts/build_tailored_cv.py --title "AI Solutions Architect" --company "Glean" --lane architect
    python scripts/build_tailored_cv.py --list-lanes

WHY THIS EXISTS
VJH tailors the cover LETTER for every job and then attaches the same static resume PDF to
all of them. An ATS reads the RESUME. Elena passes interviews and gets screened out before
them, so the untailored resume is the expensive gap. Found 20 Sep 2026 by reading what
Perplexity Computer advertises (per-role resume tailoring) and checking it against VJH:
that was the one capability of six that VJH did not already have and do better.

THE DESIGN RULE — READ BEFORE CHANGING ANYTHING
**No model writes any sentence in this document.** Every line of prose below is pre-written
and verified. Tailoring = choosing WHICH verified facts appear and IN WHAT ORDER, plus which
pre-written profile paragraph opens the page. There is no generation step, so there is
nothing to hallucinate. This is the same rule as scripts/incident-to-blog.cjs, and it exists
because "I do not want to scam anybody" is a hard constraint in this repo, not a preference.

If you ever feel tempted to pipe a job description into an LLM and have it rewrite these
bullets: don't. Add a new verified fact to FACTS instead and tag it.

FORBIDDEN CLAIMS are asserted on every build (see BANNED). A resume that cannot survive a
follow-up question is worse than a generic one.

NUMBERS — all re-verified 21 Sep 2026, not copied from an older CV:
  · 15 long-running services (8 PM2 + 7 systemd app units) + 20 distinct cron jobs, one VM
  · 529 passing tests in the job-pipeline eval suite, ~60s, $0 API cost
  · 5-provider LLM fallback chain across 6 products
  · 1,898 records through the scoring pipeline
  · 34 automated checks in 4 weighted categories (AI Visibility Audit API)
  · 21 published incident write-ups (public AI Ops Wiki)
  NOTE: the old "9 / 10 / 11 / 12 agents" figures disagreed across sources. They are not
  used here. Counts above come from `pm2 jlist`, `systemctl`, and `crontab -l`.
"""

import argparse
import re
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate

# ─── identity (never varies) ──────────────────────────────────────────────────
NAME = 'ELENA REVICHEVA'
EMAIL = 'aipa@aideazz.xyz'
PHONE = '+507 616 66 716'
PLACE = 'Panama City, Panama (UTC-5)'
LINKEDIN = 'https://linkedin.com/in/elenarevicheva'
GITHUB = 'https://github.com/ElenaRevicheva'
PORTFOLIO = 'https://aideazz.xyz/portfolio'

# ─── claims this document must NEVER make ─────────────────────────────────────
# Asserted against the rendered text on every build. Each one is a claim she has not
# made and could not defend in an interview.
BANNED = [
    '8+ years as a product manager',
    'spanish (fluent)',
    'fluent spanish',
    'native spanish',
    'machine learning engineer',
    'phd',
    'computer science degree',
    'native english',
    'certified translator',
    'degree in linguistics',
    'phonetics degree',
]

# ─── the fact bank ────────────────────────────────────────────────────────────
# Each fact: (tags, bold lead, body). Tags decide which lanes it appears in and how high.
# EVERY body is verified. Adding a fact means verifying it first.
FACTS = [
    (['pm', 'architect', 'leadership', 'automation', 'builder', 'evaluation'],
     'Owned an autonomous job-and-lead pipeline 0&#8209;to&#8209;1, live since November 2025.',
     'Sourcing, the scoring rubric, the LLM judge, and the CRM it writes into. '
     '<b>1,898 records</b> processed. I set the success metric and then acted on it: when '
     'outcome data showed one role category produced <b>58% of rejections but only 17% of '
     'positives</b>, I cut it from targeting in a day and re-pointed the paid search queries. '
     'Roadmap from measured reality, not opinion.'),

    (['pm', 'architect', 'geo', 'automation', 'builder'],
     'Shipped a public scoring API 0&#8209;to&#8209;1.',
     '<b>34 automated checks in 4 weighted categories</b>, returning a grade and a prioritised '
     'fix list. I designed the weighting — the judgement call of what counts and how much — and '
     'the output a non-technical buyer can act on.'),

    (['evaluation', 'pm', 'architect', 'builder', 'geo'],
     'Evals as a ship gate, not a vanity metric.',
     '<b>529 passing tests</b> across unit, integration and golden-set layers, running in about '
     'a minute at $0 API cost. It is how I answer "is the model good enough to ship" with '
     'evidence rather than a feeling.'),

    (['architect', 'builder', 'automation', 'leadership', 'evaluation'],
     'Non-determinism handled in the architecture.',
     'Every LLM call runs a <b>five-provider fallback chain</b> ordered per use case across six '
     'products. When a provider deprecated the model I depended on, the fleet kept serving and '
     'the migration was a config change, not an outage.'),

    (['evaluation', 'pm', 'leadership'],
     'Abstention designed in, over hallucination.',
     'Research features return "not enough public information" rather than invent — in the last '
     'production run, <b>2 of 18</b> correctly refused. Where customers make decisions on the '
     'output, a confident wrong answer costs more than a blank one.'),

    (['architect', 'automation', 'builder', 'leadership', 'geo', 'exec_support'],
     'I run the fleet, not just the code.',
     '<b>15 long-running services and 20 scheduled jobs</b> on a single cloud VM at $0/month '
     'infrastructure, 24/7. I am the architect, the reviewer and the on-call — three-layer '
     'recovery so failures heal without me.'),

    (['pm', 'leadership', 'exec_support', 'architect'],
     'Forward-deployed by default.',
     'I run my own discovery, onboarding and follow-up through a CRM I built the automation for, '
     'so I hear the problem behind the request and know which version of it someone will pay for.'),

    (['geo', 'pm', 'automation'],
     'Built the discovery engine that makes a business quotable by AI assistants.',
     'Structured data, AI-crawler access, answer-ready content and daily automated publishing — '
     'measured with a weekly citation probe across Google AI Overviews, Gemini, OpenAI search and '
     'Perplexity, plus first-touch-to-CRM attribution.'),

    (['pm', 'builder', 'leadership', 'exec_support', 'geo'],
     'Took a product from a personal problem to paying subscribers.',
     'A bilingual AI tutor built from my own family\'s need as an expat in Panama, through to '
     'billing — persistent per-user memory, voice, OCR, subscriptions. Early revenue, honestly '
     'small; included because I owned it from problem to paid.'),

    (['leadership', 'pm', 'architect', 'evaluation', 'geo', 'exec_support'],
     'I publish my own postmortems.',
     '<b>21 incident write-ups</b> in a public AI Ops wiki — you can read how I reason about '
     'failure before you interview me.'),

    (['automation', 'builder', 'exec_support', 'geo'],
     'Automation that runs a business when nobody is watching.',
     'Finding customers, qualifying them, drafting the reply, updating the CRM and reporting what '
     'happened — designed, deployed, and still on call for it.'),

    # ── language lane (23-24 Sep 2026). Verified from atuona content/poems.json (venue + date),
    #    docs/atuona/FILM_COMPILATION_GUIDE.md, FILM8_2026-09-22.md and the Nine Systems dossier.
    (['language'],
     'Published author in Russian.',
     '<b>46 poems</b> written in Russian and published on the LITPROM literary portal through its '
     'editorial board, 2019–2025. Stress, rhythm and register are the material I work in.'),

    (['language'],
     'Published author in English as well.',
     '<b>53 poems</b> written in English, published in my own ATUONA gallery, Dec 2024 – Sep 2026 — '
     'so I hear the difference between a native line and a translated one from both sides.'),

    (['language'],
     'Seven years of professional work in Russian, where one word changes the meaning.',
     'Seven years as Deputy CEO and Chief Legal Officer of a Russian public-sector e-government '
     'operator: drafting and negotiating contracts and regulatory positions, presenting to boards '
     'and regulators.'),

    (['language'],
     'Spoken audio, mixed and measured.',
     'My automated film pipeline locks each narration line to its clip, ducks music under the voice '
     'and normalises the mix to broadcast loudness (−16 LUFS; the latest film measured −15.7). '
     '<b>8 films</b> published, each render verified before release.'),

    (['language'],
     'Written justifications that another reviewer can check.',
     'I built a scoring rubric and an AI judge, then replayed <b>51</b> rejected items: <b>20</b> were '
     'wrong, caught before release. I also keep a public record of <b>22</b> written incident '
     'analyses — what happened, why, and the named pattern — the same discipline an evaluation '
     'rationale needs.'),

    (['language'],
     'Language technology, built and used by real learners.',
     'EspaLuz, a bilingual Spanish–English AI tutor on WhatsApp and Telegram, with voice in and '
     'voice out and per-family memory. Selected by micro1 for the Titan Proton human-data project.'),

    (['exec_support', 'leadership', 'pm'],
     'Board-level operating experience.',
     'Seven years as Deputy CEO running digital transformation across IT, legal and compliance in '
     'a heavily regulated environment — comfortable being the person who names the trade-off in '
     'front of people who did not want to hear it.'),
]

# ─── who she is, once, on every CV (Elena approved both sentences, 28 Sep 2026) ─────
# THROUGH_LINE opens every Summary: one person with one pattern, not two careers glued together
# (AI operations + AI film). OPERATING_MODEL opens "How I work": Elena + the AI environment she
# built is one operating unit, stated up front instead of discovered in the interview.
# The same OPERATING_MODEL string lives in src/cover-letter.ts; scripts/test-cover-letter-model.cjs
# fails if the two ever drift apart.
THROUGH_LINE = ('I design intelligent systems and the experience around them — from the agents '
                'that run a business to the films they make.')
OPERATING_MODEL = ('I operate an AI-native development environment where specialized agents handle '
                   'much of the implementation execution. I own requirements, architecture, '
                   'orchestration, evaluation, deployment, monitoring and production decisions.')

# ─── lane definitions: headline + opening paragraph + fact ordering ───────────
LANES = {
    'pm': {
        'label': 'AI Product & Program Management',
        'headline': 'Technical Product Owner — AI &amp; Agentic Platforms | Forward-Deployed',
        'profile':
            'Seven years as a <b>Deputy CEO</b> owning digital transformation at board level, then '
            'building and operating <b>AI products end to end</b> since May 2025 — I write the roadmap, '
            'ship it, carry the pager, and answer to the numbers. What I do daily is data pipelines '
            'and ML infrastructure with an agent on top, sold to operators who buy an outcome, not '
            'a model. I hold the architecture conversation with engineers and then explain the '
            'trade-off to the person signing the cheque, in the same meeting.',
    },
    'architect': {
        'label': 'AI Solutions Architecture & Consulting',
        'headline': 'AI Solutions Architect — production systems, agentic automation, integrations',
        'profile':
            'I design AI and automation solutions and then stay on call for them. Seven years at '
            'board level before this, so I can scope against a business outcome rather than a '
            'wishlist, and say no to the parts that will not pay for themselves. Everything I '
            'describe below is running in production, not a prototype.',
    },
    'leadership': {
        'label': 'AI Leadership & Transformation',
        'headline': 'AI Leadership — strategy, adoption and the systems underneath it',
        'profile':
            'Seven years as <b>Deputy CEO</b> leading digital transformation at board level across '
            'IT, legal and compliance in a heavily regulated environment — then, since May 2025, building '
            'the AI systems myself rather than delegating them. I can set the AI strategy and also '
            'tell you honestly which parts of it will fail, because I have operated them.',
    },
    'automation': {
        'label': 'AI Automation & Operations',
        'headline': 'AI Automation Architect — agents, workflows and the operations around them',
        'profile':
            'I build the automation that runs a business when nobody is watching: finding customers, '
            'qualifying them, drafting the reply, updating the CRM, reporting what happened. I '
            'design it, deploy it, and stay on call for it — and I instrument it, so every claim '
            'about it is a number I can show.',
    },
    'builder': {
        'label': 'AI-Augmented Builder / Integration',
        'headline': 'AI-Augmented Builder — production AI products, agents and integrations',
        'profile':
            'I ship and operate production AI products by directing AI coding tools — that is the '
            'workflow, not a gap to hide, and it is why one person sustains this much surface area. '
            'Seven years as a Deputy CEO before it, so the systems are built against a business '
            'outcome rather than for their own sake.',
    },
    'geo': {
        'label': 'GEO / AEO / AI Search Visibility',
        'headline': 'GEO / AEO Engineer — making businesses quotable by AI assistants',
        'profile':
            'I make companies findable and quotable in AI answers, and I measure it rather than '
            'assert it: structured data, AI-crawler access, answer-ready content, and a recurring '
            'citation probe across Google AI Overviews, Gemini, OpenAI search and Perplexity. I '
            'built the scoring API that grades it, so the method is inspectable.',
    },
    'evaluation': {
        'label': 'Expert AI Evaluation & Training',
        'headline': 'AI Evaluation — evals, red-teaming, and ship/no-ship judgement',
        'profile':
            'I evaluate AI systems for a living because I operate them: I write the harnesses, set '
            'the gates, and decide when a model is good enough to ship. Seven years at board level '
            'before this means I can also explain why a failure matters commercially, not just '
            'that a test went red.',
    },
    'language': {
        'label': 'Russian–English Bilingual Language Expert',
        'headline': 'Russian–English Bilingual Expert — native Russian, published author in both languages',
        'profile':
            'Native Russian speaker, born and educated in Russia, who has written, published and '
            'worked professionally in Russian for over a decade, and who works in English every day. '
            'I listen for what makes speech sound native — stress, intonation, rhythm and register — '
            'the same things I shape in verse. And I write every judgement down in plain English, '
            'with the reason, so another reviewer can check it.',
        'work_heading': 'LANGUAGE WORK — published, professional, and measured',
        'foundation_heading': 'LANGUAGE &amp; AUDIO TOOLKIT',
        'foundation':
            '<b>Russian:</b> native — stress, intonation, rhythm, register (legal, literary, '
            'conversational) &nbsp;·&nbsp; <b>English:</b> fluent, daily professional and literary use '
            '&nbsp;·&nbsp; <b>Audio:</b> FFmpeg, voice/music mixing, loudness normalisation (LUFS), '
            'frame-accurate timing &nbsp;·&nbsp; <b>Evaluation:</b> rubric design, written rationales, '
            'review of AI-generated text and speech output.',
        'languages':
            '<b>Languages:</b> <b>Russian (native)</b> · <b>English (fluent)</b> · '
            'Spanish (working — resident in Panama) · French (elementary)',
    },
    # 24 Sep 2026 — "HubSpot Specialist" (micro1) matched no lane and fell to 'builder'.
    # Numbers are the ones on the 13 Sep Toptal CV; the send behaviour is read from src/go-wa.ts.
    'crm': {
        'label': 'HubSpot CRM &amp; Sales Operations',
        'headline': 'HubSpot CRM &amp; Sales-Ops Automation — pipelines, workflows, clean data',
        'profile':
            'I run my own sales operation in HubSpot and automate it end to end: deals, companies, '
            'contacts, notes and tasks written by agents through the API, pipeline stages named for '
            'who acts next, and one-click approved sends that move the deal, close the task and book '
            'the follow-up by themselves. <b>1,900+ deals and 1,411 companies</b> in the portal I '
            'administer. I document every workflow so someone else can run it, and I audit it from '
            'live records, not from what the dashboard claims.',
    },
    # 28 Sep 2026 — creative AI lane (Elena: "Make step 2"). Facts: 8 films on the live gallery
    # (webhook.../cto/films.json), 99 poems in atuona content/poems.json (46 RU LITPROM, 53 EN),
    # film #8 record docs/atuona/FILM8_2026-09-22.md, engine list NOW.md 22 Sep.
    'creative': {
        'label': 'Creative AI &amp; Generative Media',
        'headline': 'Creative Technologist — generative AI film, image and audio, from concept to published work',
        'profile':
            'I direct generative models the way a producer directs a crew: concept and narrative, '
            'shot design, model choice, edit, mix and release. I also built the machinery — an '
            'automated pipeline that turns my own written universe (<b>99 published poems</b>) into '
            'finished films — so I can budget it, scale it and keep it running. <b>8 films</b> are '
            'published. Seven years as a Deputy CEO before this means creative work delivered '
            'against a brief and a budget.',
    },
    'exec_support': {
        'label': 'AI-Qualified Executive Support',
        'headline': 'AI Chief of Staff — executive operations, automated',
        'profile':
            'Seven years as a <b>Deputy CEO</b>, so I know what an executive actually needs handled '
            'before being asked — and, since May 2025, I have built the AI systems that handle it. I automate '
            'the operations rather than merely coordinating them.',
    },
}

# Title keywords → lane. First match wins; order matters (most specific first).
LANE_RULES = [
    # Language roles first: "Russian Bilingual Expert" matched no rule and fell to 'builder'.
    ('language', r'bilingual|language expert|language evaluator|linguist|transcription'
                 r'|audio recording|voice record'),
    # 2026-09-28: creative AI lane (mirrors VJH src/core/target_lanes.py). Before 'leadership' and
    # 'builder', which would otherwise take "AI Creative Technology Lead" / "Creative AI Engineer".
    ('creative', r'creative technolog|creative ai|generative ai (producer|creative|artist)|'
                 r'ai (video|film|content production|creative)|filmmaker|genai (production|content)|'
                 r'innovation producer|generative ai content'),
    ('crm', r'hubspot|\bcrm\b|salesforce|revops|revenue op|sales op'),
    ('evaluation', r'\beval|red.?team|annotat|ai train(er|ing)|quality review|llm judge'),
    ('geo', r'\bgeo\b|\baeo\b|seo|search visibility|answer engine|content market'),
    ('exec_support', r'chief of staff|executive assistant|\bea\b|executive support'),
    ('leadership', r'chief ai|head of ai|vp .*ai|director .*ai|ai lead(ership)?\b|transformation'
                   r'|senior manager.*(ai|engineering)|engineering manager|manager, ai engineering'),
    ('pm', r'product manager|product owner|program manager|product lead|\bpm\b|product develop'),
    ('architect', r'architect|consultant|solutions|advisor|customer engineer|account manager'),
    ('automation', r'automation|workflow|\bops\b|operations|n8n|make\.com|zapier|rpa'),
    ('builder', r'engineer|developer|builder|forward.?deployed|integration'),
]

DARK = colors.HexColor('#1d2b45')
ACCENT = colors.HexColor('#1f6f8b')
LINK = '#1f6f8b'


def infer_lane(title: str) -> str:
    t = (title or '').lower()
    for lane, pattern in LANE_RULES:
        if re.search(pattern, t):
            return lane
    return 'builder'


def a(url, label=None):
    return f'<link href="{url}"><font color="{LINK}">{label or url.replace("https://", "")}</font></link>'


def pick_facts(lane: str, limit: int = 7):
    """Select and order — never rewrite. Facts tagged for this lane keep bank order,
    which is curated strongest-first per lane."""
    return [f for f in FACTS if lane in f[0]][:limit]


def build(title: str, company: str, lane: str, out: Path):
    cfg = LANES[lane]
    st_name = ParagraphStyle('n', fontName='Helvetica-Bold', fontSize=19, leading=22,
                             textColor=DARK, spaceAfter=1)
    st_title = ParagraphStyle('t', fontName='Helvetica', fontSize=10.3, leading=13,
                              textColor=ACCENT, spaceAfter=4)
    st_meta = ParagraphStyle('m', fontName='Helvetica', fontSize=8.3, leading=11.3,
                             textColor=colors.HexColor('#555a66'), spaceAfter=7)
    st_h = ParagraphStyle('h', fontName='Helvetica-Bold', fontSize=9.2, leading=11,
                          textColor=DARK, spaceBefore=6, spaceAfter=2.5)
    st_b = ParagraphStyle('b', fontName='Helvetica', fontSize=8.2, leading=10.6,
                          textColor=colors.HexColor('#1a1a1a'), alignment=TA_LEFT, spaceAfter=2.5)
    st_bul = ParagraphStyle('bu', parent=st_b, leftIndent=9, bulletIndent=1, spaceAfter=2.2)

    doc = SimpleDocTemplate(str(out), pagesize=letter,
                            leftMargin=0.62 * inch, rightMargin=0.62 * inch,
                            topMargin=0.48 * inch, bottomMargin=0.42 * inch,
                            title=f'Elena Revicheva — {title}', author='Elena Revicheva')
    s = [Paragraph(NAME, st_name), Paragraph(cfg['headline'], st_title)]
    s.append(Paragraph(
        f'{PLACE} &nbsp;·&nbsp; {EMAIL} &nbsp;·&nbsp; {PHONE}<br/>'
        + a(PORTFOLIO, 'aideazz.xyz/portfolio') + ' &nbsp;·&nbsp; '
        + a(LINKEDIN, 'linkedin.com/in/elenarevicheva') + ' &nbsp;·&nbsp; '
        + a(GITHUB, 'github.com/ElenaRevicheva'), st_meta))
    s.append(HRFlowable(width='100%', thickness=0.7, color=ACCENT, spaceBefore=1, spaceAfter=4))

    s.append(Paragraph('PROFILE', st_h))
    s.append(Paragraph(f'<b>{THROUGH_LINE}</b> {cfg["profile"]} {OPERATING_MODEL}', st_b))

    s.append(Paragraph(cfg.get('work_heading', 'SELECTED WORK — shipped, live, and measured'), st_h))
    for _tags, lead, body in pick_facts(lane):
        s.append(Paragraph(f'<b>{lead}</b> {body}', st_bul, bulletText='▪'))

    # A lane may replace the engineering block: a language CV listing pgvector is noise.
    s.append(Paragraph(cfg.get('foundation_heading', 'TECHNICAL FOUNDATION'), st_h))
    s.append(Paragraph(cfg.get('foundation') or
        '<b>Data:</b> SQL, PostgreSQL, Oracle Autonomous Database, pgvector, ingestion pipelines, '
        'RAG retrieval &nbsp;·&nbsp; <b>AI:</b> Claude, OpenAI, Gemini, Grok, Groq; multi-provider '
        'routing; agent orchestration; prompt systems; eval harnesses &nbsp;·&nbsp; '
        '<b>Build:</b> Python, TypeScript, FastAPI, Node.js, REST/webhooks &nbsp;·&nbsp; '
        '<b>Ops:</b> OCI, PM2, systemd, cron, monitoring and alerting &nbsp;·&nbsp; '
        '<b>Analytics:</b> GA4, UTM attribution, Search Console, HubSpot &nbsp;·&nbsp; '
        '<b>Method:</b> AI-assisted development (Claude Code, Cursor) as the daily workflow.',
        st_b))

    s.append(Paragraph('EXECUTIVE BACKGROUND', st_h))
    s.append(Paragraph(
        '<b>Deputy CEO &amp; Chief Legal Officer</b> — JSC "E-GOV OPERATOR" | 2011–2018<br/>'
        'Led public-sector digital transformation at board level for seven years; ran '
        'cross-functional IT, legal and compliance teams in a heavily regulated environment.<br/>'
        '<b>Deputy CEO, Business Development</b> — Fundery LLC (fintech) | 2017–2018', st_b))

    s.append(Paragraph('EDUCATION &amp; LANGUAGES', st_h))
    s.append(Paragraph(
        'Presidential Program for Executive Management, RANEPA Moscow (2015) &nbsp;·&nbsp; '
        'MA Social Psychology, Penza State University (2018) &nbsp;·&nbsp; '
        'Polkadot Blockchain Academy, PBA-X Wave 3 (2025)<br/>'
        + cfg.get('languages',
                  '<b>Languages:</b> Russian (native) · English (fluent) · '
                  '<b>Spanish (working — resident in Panama)</b> · French (elementary)'), st_b))

    doc.build(s)
    return out


def verify(path: Path):
    """A resume that cannot survive a follow-up question is worse than a generic one."""
    try:
        from pypdf import PdfReader
    except ImportError:
        print('  (pypdf not installed — skipped the banned-claim check)')
        return True
    text = ' '.join(p.extract_text() for p in PdfReader(str(path)).pages).lower()
    bad = [b for b in BANNED if b in text]
    if bad:
        print(f'  !! BANNED CLAIM PRESENT: {bad} — refusing', file=sys.stderr)
        return False
    pages = len(PdfReader(str(path)).pages)
    print(f'  {pages} page(s), no banned claims')
    return True


def slug(x):
    return re.sub(r'[^a-z0-9]+', '-', (x or '').lower()).strip('-')[:40] or 'role'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--title', help='job title')
    ap.add_argument('--company', default='')
    ap.add_argument('--lane', choices=sorted(LANES), help='override the inferred lane')
    ap.add_argument('--out', help='output pdf path')
    ap.add_argument('--outdir', help='directory (filename derived from the job)')
    ap.add_argument('--list-lanes', action='store_true')
    ap.add_argument('--infer', metavar='TITLE', help='print the lane a title maps to, and exit')
    ap.add_argument('--build-all-lanes', action='store_true',
                    help='build one canonical CV per lane into docs/applications/cv-by-lane/')
    ap.add_argument('--emit-rules', action='store_true',
                    help='write cv-by-lane/lanes.json so other languages reuse THESE rules '
                         'instead of copying them (a second copy is a second source of truth)')
    args = ap.parse_args()

    if args.infer:
        print(infer_lane(args.infer))
        return

    if args.emit_rules or args.build_all_lanes:
        import json
        base = Path(__file__).resolve().parents[1] / 'docs' / 'applications' / 'cv-by-lane'
        base.mkdir(parents=True, exist_ok=True)
        if args.build_all_lanes:
            # 24 Sep 2026: the lane PDFs are rendered by scripts/build-lane-cv.cjs on the Toptal
            # design Elena approved. This reportlab path printed "■" for every bullet and had no
            # dated experience — building here would overwrite the good files with the old ones.
            print('lane PDFs moved to scripts/build-lane-cv.cjs — rules emitted only')
            args.build_all_lanes = False
        if args.build_all_lanes:
            for lane, cfg in LANES.items():
                p = base / f'CV_Elena_Revicheva_{lane}.pdf'
                build(cfg['label'], '', lane, p)
                ok = verify(p)
                print(f'  {lane:13} {cfg["label"]:40} {"OK" if ok else "REFUSED"}')
                if not ok:
                    sys.exit(1)
        (base / 'lanes.json').write_text(json.dumps({
            'generated_by': 'scripts/build_tailored_cv.py --emit-rules',
            'note': 'Lane rules live in build_tailored_cv.py. Do NOT hand-edit this file and do '
                    'NOT re-implement the rules anywhere else - read this instead.',
            'default': 'builder',
            'through_line': THROUGH_LINE,
            'operating_model': OPERATING_MODEL,
            'rules': [{'lane': l, 'pattern': p} for l, p in LANE_RULES],
            # headline + profile ride along so scripts/build-lane-cv.cjs (the PDF renderer since
            # 24 Sep) reads the verified prose from HERE instead of keeping a second copy.
            'lanes': {l: {'label': c['label'], 'headline': c['headline'], 'profile': c['profile'],
                          'foundation': c.get('foundation'), 'languages': c.get('languages'),
                          'cv': f'CV_Elena_Revicheva_{l}.pdf'}
                      for l, c in LANES.items()},
            'facts': [{'tags': t, 'lead': lead, 'body': body} for t, lead, body in FACTS],
        }, indent=2), encoding='utf-8')
        print(f'rules: {base / "lanes.json"}')
        return

    if args.list_lanes:
        for k, v in LANES.items():
            print(f'  {k:13} {v["label"]:38} {len(pick_facts(k))} facts')
        return
    if not args.title:
        ap.error('--title is required')

    lane = args.lane or infer_lane(args.title)
    if args.out:
        out = Path(args.out)
    else:
        base = Path(args.outdir) if args.outdir else \
            Path(__file__).resolve().parents[1] / 'docs' / 'applications' / 'tailored'
        out = base / f'CV_Elena_Revicheva_{slug(args.company)}_{slug(args.title)}.pdf'
    out.parent.mkdir(parents=True, exist_ok=True)

    build(args.title, args.company, lane, out)
    print(f'built: {out}')
    print(f'  lane: {lane} ({LANES[lane]["label"]})')
    if not verify(out):
        sys.exit(1)


if __name__ == '__main__':
    main()
