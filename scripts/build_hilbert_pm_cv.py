#!/usr/bin/env python3
"""
Job-specific CV: Hilbert (hilberts.ai) — Product Manager, LATAM. 21 Sep 2026.

Rebuild:  python scripts/build_hilbert_pm_cv.py
Out:      docs/applications/21.09.26_EN_Resume_Elena_Revicheva_Hilbert_PM.pdf

WHAT THIS ROLE BUYS — and why the other CVs are wrong for it.
Every existing CV leads with "AI Automation Architect" and engineering depth. Hilbert is
hiring a PRODUCT MANAGER, and their posting is explicit about the shape:

  · "0-to-1 seat with founder-level ownership ... vision, roadmap, specs, ship dates"
  · "we're forward-deployed: you'll spend real time inside our customers' businesses"
  · "what our customers buy is growth, but what we build is data and ML infrastructure
     with an agent on top"
  · "sound judgment on AI products — evals, non-determinism, when a model is good enough
     to ship"
  · "engineers or data scientists who became PMs are especially welcome"
  · "Fluency in Spanish is required"  |  Location: LATAM, remote

So this CV leads with PRODUCT OWNERSHIP and OUTCOMES, keeps the technical depth as
evidence that she can "hold her own in architecture discussions", and states the
executive background as the owner's-mindset proof. The engineering stack that dominates
the other CVs is compressed to one band.

HONESTY CONSTRAINTS (non-negotiable — this CV is signed by her):
  · The posting asks for "8+ years as a product manager". She does NOT claim that, here or
    anywhere. The header says product owner / operator and the experience line is the true
    one: 7 years Deputy CEO + 2 years building and operating AI products. Let them weigh it.
  · Spanish is stated as "working — resident in Panama", NOT fluent. She decides whether to
    upgrade that; a CV must not make a claim she has not made.
  · Every number below was verified in production, not taken from an older CV:
      - 529 passing tests in the VJH eval suite, ~60s runtime (run 20 Sep 2026)
      - 5-provider LLM fallback chain across 6 products (Groq deprecation, Aug 2026)
      - 1,898 job/lead records processed through the scoring pipeline
      - 34 automated checks in 4 weighted categories (AI Visibility Audit API)
      - 21 published incident write-ups in the public AI Ops Wiki
"""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer

DARK = colors.HexColor('#1d2b45')
ACCENT = colors.HexColor('#1f6f8b')
BLACK = colors.HexColor('#1a1a1a')
MUT = colors.HexColor('#555a66')
LINK = '#1f6f8b'

OUT = Path(__file__).resolve().parents[1] / 'docs' / 'applications' / \
    '21.09.26_EN_Resume_Elena_Revicheva_Hilbert_PM.pdf'


def a(url, label=None):
    return f'<link href="{url}"><font color="{LINK}">{label or url.replace("https://", "")}</font></link>'


NAME = ParagraphStyle('name', fontName='Helvetica-Bold', fontSize=19, leading=22,
                      textColor=DARK, spaceAfter=1)
TITLE = ParagraphStyle('title', fontName='Helvetica', fontSize=10.5, leading=13,
                       textColor=ACCENT, spaceAfter=4)
META = ParagraphStyle('meta', fontName='Helvetica', fontSize=8.4, leading=11.5,
                      textColor=MUT, spaceAfter=7)
H = ParagraphStyle('h', fontName='Helvetica-Bold', fontSize=9.2, leading=11,
                   textColor=DARK, spaceBefore=6, spaceAfter=2.5)
BODY = ParagraphStyle('body', fontName='Helvetica', fontSize=8.2, leading=10.6,
                      textColor=BLACK, alignment=TA_LEFT, spaceAfter=2.5)
BUL = ParagraphStyle('bul', parent=BODY, leftIndent=9, bulletIndent=1, spaceAfter=2.2)


def rule():
    return HRFlowable(width='100%', thickness=0.7, color=ACCENT,
                      spaceBefore=1, spaceAfter=4)


def build():
    doc = SimpleDocTemplate(str(OUT), pagesize=letter,
                            leftMargin=0.62 * inch, rightMargin=0.62 * inch,
                            topMargin=0.48 * inch, bottomMargin=0.42 * inch,
                            title='Elena Revicheva — Product Manager, AI Platforms',
                            author='Elena Revicheva')
    s = []
    s.append(Paragraph('ELENA REVICHEVA', NAME))
    s.append(Paragraph('Technical Product Owner — AI &amp; Agentic Platforms | '
                       'Forward-Deployed | LATAM', TITLE))
    s.append(Paragraph(
        'Panama City, Panama (UTC-5) — already in LATAM, no relocation needed &nbsp;·&nbsp; '
        'aipa@aideazz.xyz &nbsp;·&nbsp; +507 616 66 716<br/>'
        + a('https://aideazz.xyz/portfolio', 'aideazz.xyz/portfolio') + ' &nbsp;·&nbsp; '
        + a('https://linkedin.com/in/elenarevicheva', 'linkedin.com/in/elenarevicheva')
        + ' &nbsp;·&nbsp; ' + a('https://github.com/ElenaRevicheva', 'github.com/ElenaRevicheva'),
        META))
    s.append(rule())

    s.append(Paragraph('PROFILE', H))
    s.append(Paragraph(
        'Seven years as a <b>Deputy CEO</b> owning large-scale digital transformation at board '
        'level, then two years building and operating <b>AI products end to end</b> — I write the '
        'roadmap, ship it, carry the pager, and answer to the numbers. Twelve systems run in '
        'production today on one cloud VM: I am the product owner, the reviewer and the on-call. '
        'What I do daily is exactly the Hilbert shape — <b>data pipelines and ML infrastructure '
        'with an agent on top</b>, sold to non-technical operators who buy an outcome, not a model. '
        'I can hold the architecture conversation with engineers and then explain the trade-off to '
        'the person signing the cheque, in the same meeting.', BODY))

    s.append(Paragraph('PRODUCT OWNERSHIP, 0 → 1 (each shipped, live, and measured)', H))
    for t, b in [
        ('Autonomous job-and-lead pipeline (0→1, live 18 months).',
         'Owned the whole surface: sourcing, scoring rubric, the LLM judge, and the CRM it writes '
         'into. <b>1,898 records</b> processed. Defined the success metric myself, then acted on it '
         '— when outcome data showed one role category produced <b>58% of rejections but only 17% '
         'of positives</b>, I cut it from the targeting in a day and re-pointed the paid search '
         'queries. That is the roadmap coming from measured customer reality, not opinion.'),
        ('AI Visibility Audit API (0→1, public product).',
         'Scoped and shipped a scoring product: <b>34 automated checks in 4 weighted categories</b>, '
         'returning a grade and a prioritised fix list. Designed the weighting — the judgement call '
         'of what counts and how much — and the output non-technical buyers act on. '
         + a('https://aideazz.xyz/api', 'aideazz.xyz/api')),
        ('Bilingual AI tutor with paying subscribers (0→1).',
         'Built from my own family\'s need as an expat in Panama, through to billing. Persistent '
         'per-user memory, voice, OCR, subscription payments. Early revenue, honestly small — '
         'included because I owned it from problem to paid product.'),
        ('Growth &amp; discovery engine (0→1).',
         'Daily automated publishing, structured data, attribution from first touch to CRM record, '
         'and inbound triage with urgency scoring. Instrumented end to end, so every claim about it '
         'is a number I can show rather than a story.'),
    ]:
        s.append(Paragraph(f'<b>{t}</b> {b}', BUL, bulletText='▪'))

    s.append(Paragraph('JUDGEMENT ON AI PRODUCTS — evals, non-determinism, ship/no-ship', H))
    for b in [
        '<b>Evals as a product gate, not a vanity metric.</b> <b>529 passing tests</b> across unit, '
        'integration and golden-set layers, running in about a minute at $0 API cost. It is how I '
        'answer "is the model good enough to ship" with evidence instead of a feeling.',
        '<b>Non-determinism handled in the architecture.</b> Every LLM call runs a <b>five-provider '
        'fallback chain</b> ordered per use case across six products. When a provider deprecated the '
        'model I depended on, the fleet kept serving and the migration was a config change, not an '
        'outage.',
        '<b>Abstention over hallucination.</b> Research features are built to return '
        '"not enough public information" rather than invent — in the last production run, 2 of 18 '
        'correctly refused. In a product customers make revenue decisions on, a confident wrong '
        'answer costs more than a blank one.',
        '<b>Public postmortems.</b> <b>21 published incident write-ups</b> at '
        + a('https://aideazz.xyz/ai-ops-wiki.html', 'aideazz.xyz/ai-ops-wiki.html')
        + ' — you can read how I reason about failure before you interview me.',
    ]:
        s.append(Paragraph(b, BUL, bulletText='▪'))

    s.append(Paragraph('FORWARD-DEPLOYED &amp; COMMERCIAL', H))
    s.append(Paragraph(
        'I run my own discovery and onboarding: direct outreach, qualification calls and follow-up '
        'through a CRM I built the automation for — so I hear the problem behind the request and '
        'know which version of it someone will pay for. Seven years at board level in a heavily '
        'regulated environment means I am comfortable being the person who says what the trade-off '
        'is, in front of people who did not want to hear it. Based in Panama, working across US and '
        'European time zones daily.', BODY))

    s.append(Paragraph('TECHNICAL FOUNDATION (enough to scope ruthlessly and prototype)', H))
    s.append(Paragraph(
        '<b>Data:</b> SQL, PostgreSQL, Oracle Autonomous Database, pgvector, ingestion pipelines, '
        'RAG retrieval &nbsp;·&nbsp; <b>AI:</b> Claude, OpenAI, Gemini, Grok, Groq; multi-provider '
        'routing; agent orchestration; prompt systems; eval harnesses &nbsp;·&nbsp; '
        '<b>Build:</b> Python, TypeScript, FastAPI, Node.js, REST/webhooks &nbsp;·&nbsp; '
        '<b>Ops:</b> OCI, PM2, systemd, cron, monitoring and alerting &nbsp;·&nbsp; '
        '<b>Analytics:</b> GA4, UTM attribution, Search Console, HubSpot &nbsp;·&nbsp; '
        '<b>Method:</b> AI-assisted development (Claude Code, Cursor) as the daily workflow — '
        'the reason one person ships at this rate.', BODY))

    s.append(Paragraph('EXECUTIVE BACKGROUND', H))
    s.append(Paragraph(
        '<b>Deputy CEO &amp; Chief Legal Officer</b> — JSC "E-GOV OPERATOR" | 2011–2018<br/>'
        'Led public-sector digital transformation at board level for seven years; ran '
        'cross-functional IT, legal and compliance teams in a heavily regulated environment. '
        'Owner\'s mindset is not a phrase here — I have made calls without perfect information and '
        'carried the consequences.<br/>'
        '<b>Deputy CEO, Business Development</b> — Fundery LLC (fintech) | 2017–2018', BODY))

    s.append(Paragraph('EDUCATION &amp; LANGUAGES', H))
    s.append(Paragraph(
        'Presidential Program for Executive Management, RANEPA Moscow (2015) &nbsp;·&nbsp; '
        'MA Social Psychology, Penza State University (2018) &nbsp;·&nbsp; '
        'Polkadot Blockchain Academy, PBA-X Wave 3 (2025)<br/>'
        '<b>Languages:</b> Russian (native) · English (fluent) · '
        '<b>Spanish (working — resident in Panama)</b> · French (elementary)', BODY))

    doc.build(s)
    # plain ASCII: a tick character crashes this print on a Windows cp1252 console
    print(f'built: {OUT}')
    print(f'  {OUT.stat().st_size:,} bytes')


if __name__ == '__main__':
    build()
