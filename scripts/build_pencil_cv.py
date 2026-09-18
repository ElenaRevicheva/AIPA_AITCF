#!/usr/bin/env python3
"""
Job-specific CV: Pencil — GenAI Creator (LATAM, remote), 18 Sep 2026.

Rebuild:  python scripts/build_pencil_cv.py
Out:      docs/applications/18.09.26_EN_Resume_Elena_Revicheva_Pencil.pdf
Kit:      docs/applications/2026-09-18_pencil_genai_creator.md

WHY A THIRD CV. Two existing versions, neither right for this posting:
  * aideazz `public/Elena_Revicheva_Resume.pdf` (17 Sep) — systems and AI-product
    framing. Strong on governance, but Atuona (the actual GenAI creative work) is the
    last item with one bullet, and a creative reviewer sees CRM and SEO first.
  * `06.09.26_Gallery_CV` — creative craft, the film work and the poetry, one page.
    But it is framed for a gallery: artist liaison, consignment terms, inventory
    reconciliation. Wrong vocabulary for an adtech platform.
This variant leads with GenAI creative production (their "Your mission"), then the
workflow governance and platform-evaluation proof (their "systems side" track, which
the posting names as the growth path), then the client-facing executive background.

NOT CLAIMED, deliberately: advertising-agency experience, and Adobe Creative Cloud.
The posting asks for both; she has neither, and the cover answers say so plainly.
Every fact here is from work verified in this repo or live on her own sites.

Layout is a trimmed copy of aideazz `scripts/generate_resume.py`. Job CVs change per
application; the website resume must not move when one of them does, so the code is
duplicated on purpose rather than shared.
"""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer

DARK = colors.HexColor('#1d2a4d')
ACCENT = colors.HexColor('#1a6b8a')
BLACK = colors.HexColor('#1a1a1a')

OUT = Path(__file__).resolve().parents[1] / 'docs' / 'applications' / \
    '18.09.26_EN_Resume_Elena_Revicheva_Pencil.pdf'

CONTENT = {
    'name': 'ELENA REVICHEVA',
    'title': ('GenAI Creative Technologist | Agentic &amp; Nodal Creative Workflows<br/>'
              'AI Film Production · Workflow Governance · Creative Systems Enablement'),
    'contact': ('aipa@aideazz.xyz  |  +507 616 66 716 (WhatsApp)  |  '
                '<link href="https://aideazz.xyz/portfolio"><font color="#1a6b8a">aideazz.xyz/portfolio</font></link>  |  '
                '<link href="https://atuona.xyz/aifilmstudio"><font color="#1a6b8a">atuona.xyz/aifilmstudio</font></link>  |  '
                '<link href="https://github.com/ElenaRevicheva"><font color="#1a6b8a">GitHub</font></link>'),
    'location': 'Panama City, Panama  |  Remote (LATAM)  |  UTC-5 — overlaps US and European hours',
    'sections': [
        ('PROFILE', [
            ('p', 'I build the systems that carry an idea to finished creative — concept, script, image, '
                  'motion, sound, assembly and publication — as repeatable workflows, not one-off projects.'),
            ('p', 'Founder of <b>ATUONA</b>, a generative film studio with <b>six finished short films</b>, '
                  'each with its own score, narration, generated poster and title cards. A published poet '
                  'with <b>98 released works</b>, so the source material is my own and cleared outright. '
                  'Creative sensibility with an operator\'s discipline.'),
            ('p', 'Alongside it I design and run <b>12+ production AI systems</b> solo — agents, publishing '
                  'pipelines, quality gates and multi-provider model routing — and I document how they fail, '
                  'so other people can use them safely.'),
            ('p', 'Before AI: <b>seven years as Deputy CEO and Chief Legal Officer</b> of a national '
                  'digital-transformation programme. I am comfortable in the discovery meeting and in the '
                  'pipeline.'),
        ]),
        ('GENAI CREATIVE PRODUCTION — concept to finished output', [
            ('sub', 'ATUONA — generative film studio (atuona.xyz/aifilmstudio) · Founder / Curator · 2019–Present'),
            ('b', '<b>Six finished short films</b>, published: script by LLM → images → AI video → automated '
                  'assembly → scored, titled and released. Every release is checked frame by frame before '
                  'it goes live.'),
            ('b', '<b>Nodal pipeline with persisted intermediate assets</b>: any single scene can be '
                  'regenerated and dropped back into the film without rebuilding the other seven — the '
                  'difference between a fix costing one shot and costing the whole piece.'),
            ('b', '<b>Four-provider fallback for video</b> (Luma, Runway, Kling, Veo) behind one interface, '
                  'with model selection per shot, so a provider outage or a refused prompt never stops a '
                  'delivery.'),
            ('sub', 'PRODUCT FILM FOR MY OWN API — brief to broadcast, solo'),
            ('b', 'Concept, script, generation, edit, soundtrack and publication of a product film for my '
                  'AI Visibility Audit API: a fruit-sliced-open metaphor for looking inside a website, '
                  'brand typography taken from the product site, and a <b>scannable QR code on every shot</b> '
                  'so a paused frame reaches the product.'),
            ('b', '<b>Nineteen versions.</b> Most of the improvement came from watching the output honestly '
                  'and rejecting shots, not from better prompts.'),
            ('b', 'Published and then <b>automated</b>: a Make.com workflow distributes it on schedule to '
                  'LinkedIn, Instagram and YouTube, rotating between two cuts so the channel never repeats '
                  'itself on consecutive days.'),
            ('b', '<b>Bilingual production at volume:</b> 146 published pages from a daily English/Spanish '
                  'pipeline — copy, structured data and imagery — plus a daily social-image pipeline for a '
                  'consumer AI product.'),
        ]),
        ('WORKFLOW GOVERNANCE, QUALITY CONTROL &amp; RELIABILITY', [
            ('b', '<b>Two quality gates built after real failures.</b> The publishing pipeline refuses to '
                  'publish any number it cannot trace to a verified source, and blocks near-duplicate '
                  'pieces by comparing each draft against everything already published.'),
            ('b', '<b>A silent fallback is a failure that looks like success.</b> My pipelines now report '
                  'which provider actually produced each asset, and quality is judged on the finished '
                  'frames, not on an exit code.'),
            ('b', '<b>Criteria that live in one place.</b> An AI screening system was quietly rejecting good '
                  'work because its rules had drifted across seven locations; I consolidated them into one '
                  'shared rulebook rendered into every prompt, added <b>413 automatic tests</b>, and proved '
                  'with a replay of 51 rejected items that 20 were wrong — before deploying.'),
            ('b', '<b>Documentation as an artifact, not an afterthought</b>: a public engineering wiki of '
                  '<b>21 production incidents and 18 named failure patterns</b>, generated from verified '
                  'records so no model can re-tell an incident.'),
        ]),
        ('PLATFORM EVALUATION &amp; TECHNICAL INNOVATION', [
            ('b', 'Run a <b>five-provider model chain ordered by use case</b> (quality, classification, '
                  'bulk) rather than one default model — continuous, practical evaluation of what each '
                  'model is actually good for.'),
            ('b', 'Shipped a public product from that work: the <b>AI Visibility Audit API</b> '
                  '(aideazz.xyz/api) — 34 automated checks in four weighted categories, telling any brand '
                  'whether ChatGPT, Claude, Perplexity and Gemini can read and recommend its site.'),
            ('b', 'Measure rather than assume: a weekly automated probe records whether AI answer engines '
                  'cite a page, name it without a link, or miss it.'),
        ]),
        ('ENABLEMENT, CLIENTS &amp; EARLIER CAREER', [
            ('b', '<b>Deputy CEO &amp; Chief Legal Officer</b>, JSC "E-GOV Operator" (Russia, 2011–2018) — '
                  'seven years at board level on a large digital-transformation programme across IT, legal '
                  'and compliance: stakeholder discovery, standards, training and change management in a '
                  'heavily regulated environment.'),
            ('b', '<b>Operational Co-Founder</b>, OmniBazaar (2024–2025) · <b>Deputy CEO, Business Development</b>, '
                  'Fundery LLC (2017–2018). Languages: <b>Russian (native), English (fluent), Spanish '
                  '(intermediate)</b>; Panama UTC-5 covers US and European afternoons.'),
                    ]),
        ('TOOLS, EDUCATION &amp; NOTES', [
            ('kv', ('Creative / GenAI', 'Claude Opus · GPT · Gemini · Flux Pro · Luma Dream Machine · Runway · '
                    'Kling · Veo · prompt systems · agentic workflows')),
            ('kv', ('Systems', 'Make.com · n8n · HubSpot · Python · TypeScript · JSON-LD · Oracle Cloud · IPFS/Polygon')),
            ('kv', ('Education', 'MA Social Psychology, Penza State University · Presidential Program for Executive '
                    'Management, RANEPA Moscow · Anthropic Academy, Claude Certification (in progress)')),
            ('kv', ('Straight answer', 'My craft background is generative film and poetry, not an advertising agency, '
                    'and I work in Flux, Runway, Kling and Claude rather than Adobe Creative Cloud. What I bring '
                    'is the systems side: building and governing the workflows creative teams rely on.')),
        ]),
    ],
}


def styles():
    return {
        'name': ParagraphStyle('name', fontName='Helvetica-Bold', fontSize=18, textColor=DARK,
                               spaceAfter=2, leading=21),
        'title': ParagraphStyle('title', fontName='Helvetica-Bold', fontSize=10, textColor=ACCENT,
                                spaceAfter=4, leading=13),
        'contact': ParagraphStyle('contact', fontName='Helvetica', fontSize=8.5, textColor=BLACK,
                                  spaceAfter=1, leading=11),
        'section': ParagraphStyle('section', fontName='Helvetica-Bold', fontSize=11, textColor=DARK,
                                  spaceBefore=4.5, spaceAfter=1, leading=11.5),
        'sub': ParagraphStyle('sub', fontName='Helvetica-Bold', fontSize=9.5, textColor=ACCENT,
                              spaceBefore=4, spaceAfter=1.2, leading=11),
        'body': ParagraphStyle('body', fontName='Helvetica', fontSize=8.0, textColor=BLACK,
                               spaceAfter=1.7, leading=9.9, alignment=TA_LEFT),
        'bullet': ParagraphStyle('bullet', fontName='Helvetica', fontSize=8.0, textColor=BLACK,
                                 spaceAfter=1.4, leading=9.9, leftIndent=10, firstLineIndent=-10),
    }


def build():
    s = styles()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUT), pagesize=letter,
        leftMargin=0.5 * inch, rightMargin=0.5 * inch,
        topMargin=0.4 * inch, bottomMargin=0.35 * inch,
        title='Elena Revicheva — GenAI Creative Technologist',
        author='Elena Revicheva', subject='Application: Pencil, GenAI Creator',
    )
    flow = [
        Paragraph(CONTENT['name'], s['name']),
        Paragraph(CONTENT['title'], s['title']),
        Paragraph(CONTENT['contact'], s['contact']),
        Paragraph(CONTENT['location'], s['contact']),
        Spacer(1, 3),
        HRFlowable(width='100%', thickness=1, color=DARK, spaceAfter=2),
    ]
    for heading, items in CONTENT['sections']:
        flow.append(Paragraph(heading, s['section']))
        flow.append(HRFlowable(width='100%', thickness=0.5, color=ACCENT, spaceAfter=3))
        for kind, value in items:
            if kind == 'p':
                flow.append(Paragraph(value, s['body']))
            elif kind == 'b':
                flow.append(Paragraph(f'•&nbsp;&nbsp;{value}', s['bullet']))
            elif kind == 'sub':
                flow.append(Paragraph(value, s['sub']))
            elif kind == 'kv':
                label, text = value
                flow.append(Paragraph(f'<b>{label}:</b> {text}', s['body']))
            else:
                raise ValueError(kind)
    doc.build(flow)
    print(f'PDF generated: {OUT}')


if __name__ == '__main__':
    build()
