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

    (['exec_support', 'leadership', 'pm'],
     'Board-level operating experience.',
     'Seven years as Deputy CEO running digital transformation across IT, legal and compliance in '
     'a heavily regulated environment — comfortable being the person who names the trade-off in '
     'front of people who did not want to hear it.'),
]

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
    s.append(Paragraph(cfg['profile'], st_b))

    s.append(Paragraph('SELECTED WORK — shipped, live, and measured', st_h))
    for _tags, lead, body in pick_facts(lane):
        s.append(Paragraph(f'<b>{lead}</b> {body}', st_bul, bulletText='▪'))

    s.append(Paragraph('TECHNICAL FOUNDATION', st_h))
    s.append(Paragraph(
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
        '<b>Languages:</b> Russian (native) · English (fluent) · '
        '<b>Spanish (working — resident in Panama)</b> · French (elementary)', st_b))

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
            'rules': [{'lane': l, 'pattern': p} for l, p in LANE_RULES],
            'lanes': {l: {'label': c['label'], 'cv': f'CV_Elena_Revicheva_{l}.pdf'}
                      for l, c in LANES.items()},
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
