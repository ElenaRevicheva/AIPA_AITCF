#!/usr/bin/env python3
"""
Job-specific CV: micro1 — Arts, Media & Design Expert (PowerPoint Review & Reconstruction), 19 Sep 2026.

Rebuild:  python scripts/build_micro1_cv.py
Out:      docs/applications/19.09.26_EN_Resume_Elena_Revicheva_micro1.pdf

WHAT THIS ROLE BUYS. Not engineering. micro1 pays $150-350/hr for someone who receives
an image of an executive slide, rebuilds it in PowerPoint, improves the storytelling and
data visualisation, and writes a log defending both the changes AND what was deliberately
kept. So this CV leads with arts & media practice and executive presentation work, then
editorial judgment, then AI evaluation (their stated "plus"). The AI engineering that
dominates the other CVs is compressed to one section.

PowerPoint: Elena confirmed on 19 Sep that she wants to apply for this PowerPoint role.
Stated as executive/board presentation work over seven years as Deputy CEO — not as a
certification, and not as "expert". The deck link (aideazz.xyz/pitch.html) is the
visible proof of visual storytelling; it is HTML, and the CV does not pretend otherwise.

Every number verified live on 19 Sep 2026: 16-slide EN/ES deck (slide 08b added that day),
podcast feed 11 items, 150+ blog posts, wiki 21 incidents / 18 failure modes, AI judge 413
tests + 20 of 51 replayed rejections proven wrong, API 34 checks in 4 weighted categories.
"""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer

DARK = colors.HexColor('#2a1f45')
ACCENT = colors.HexColor('#8a3f7a')
BLACK = colors.HexColor('#1a1a1a')
LINK = '#8a3f7a'

OUT = Path(__file__).resolve().parents[1] / 'docs' / 'applications' / \
    '19.09.26_EN_Resume_Elena_Revicheva_micro1.pdf'


def a(url, label=None):
    return f'<link href="{url}"><font color="{LINK}">{label or url.replace("https://", "")}</font></link>'


CONTENT = {
    'name': 'ELENA REVICHEVA',
    'title': ('Arts, Media &amp; Design · Presentation Design &amp; Editorial Review<br/>'
              'Visual Storytelling · Executive Communication · AI Evaluation'),
    'contact': ('aipa@aideazz.xyz  |  +507 616 66 716 (WhatsApp)  |  Panama City, Panama  |  '
                'Remote  |  UTC-5'),
    'links': ('<b>Presentation deck:</b> ' + a('https://aideazz.xyz/pitch.html') +
              '  ·  <b>Film studio:</b> ' + a('https://atuona.xyz/aifilmstudio') +
              '  ·  <b>Podcast:</b> ' + a('https://podcast.aideazz.xyz') +
              '  ·  <b>Portfolio:</b> ' + a('https://aideazz.xyz/portfolio')),
    'sections': [
        ('PROFILE', [
            ('p', 'A published poet and the founder of a generative film studio, with seven years before that '
                  'as <b>Deputy CEO and Chief Legal Officer</b> presenting to boards and regulators. I work where '
                  'content, design and accuracy meet: I rebuild a message so it reads clearly, and I can explain '
                  'in writing why each element changed — or why it was <b>right to leave it alone</b>.'),
        ]),
        ('PRESENTATION DESIGN &amp; VISUAL STORYTELLING', [
            ('b', '<b>Executive and board presentations in PowerPoint for seven years</b> as Deputy CEO &amp; Chief '
                  'Legal Officer of a national e-government operator (2011–2018): strategy, budgets, transformation '
                  'programmes and regulatory positions, for audiences that read every number.'),
            ('b', '<b>16-slide bilingual investor deck</b> (English/Spanish), live at ' + a('https://aideazz.xyz/pitch.html') +
                  ' — narrative arc from problem to proof, and a metrics slide that states the numbers "as they are". '
                  'Extended this week with a new slide without altering a single existing one: keep what works, '
                  'change only what earns it.'),
            ('b', '<b>Message hierarchy for mixed audiences:</b> the same facts rewritten for business owners, HR and '
                  'technical reviewers — plain-language outcomes first, technical detail labelled and moved down.'),
        ]),
        ('ARTS &amp; MEDIA PRACTICE — 2019 to present', [
            ('b', '<b>ATUONA</b>, generative film studio and gallery: <b>six finished short films</b>, each with its own '
                  'score, narration, generated poster and title cards; every release checked frame by frame.'),
            ('b', '<b>98 published literary works</b> — atmosphere, sequence and tone are my native craft.'),
            ('b', '<b>Product film</b> for my own software product: concept, script, generation, edit, soundtrack and '
                  'typography in the product\'s brand fonts. <b>Nineteen versions</b> — most of the gain came from '
                  'rejecting weak shots honestly, not from adding more.'),
            ('b', '<b>Podcast</b> "Building in Public On The Go" — 11 episodes; <b>blog</b> — 150+ bilingual posts.'),
        ]),
        ('EDITORIAL JUDGMENT, ACCURACY &amp; RATIONALE', [
            ('b', '<b>Legal-grade precision on terminology and caveats</b>: seven years drafting and negotiating '
                  'agreements where one misplaced qualifier changes the meaning.'),
            ('b', '<b>Accuracy by design:</b> my publishing pipeline refuses to publish any number it cannot trace to a '
                  'verified source, and blocks near-duplicate pieces — accuracy enforced, not hoped for.'),
            ('b', '<b>Written rationale as a habit:</b> a public engineering wiki of <b>21 incidents and 18 named '
                  'failure patterns</b>, each recording what broke, why, and the named pattern behind it.'),
        ]),
        ('AI TRAINING DATA &amp; EVALUATION', [
            ('b', '<b>Rubric design and evaluation:</b> built an AI screening judge on one shared rulebook with '
                  '<b>413 automatic tests</b>; replaying 51 rejected items proved <b>20 were wrongly rejected</b> — '
                  'caught before release.'),
            ('b', '<b>Scoring framework shipped as a product:</b> a public audit that grades any website on 34 checks in '
                  'four weighted categories, with a prioritised list of fixes ' + a('https://aideazz.xyz/api') + '.'),
            ('b', 'Daily practitioner of Claude, GPT and Gemini, with image and video models (Flux, Runway, Kling, '
                  'Veo) — I know where their output is convincing and where it quietly fails.'),
        ]),
        ('EDUCATION, LANGUAGES &amp; TOOLS', [
            ('kv', ('Education', 'MA Social Psychology, Penza State University · Presidential Program for Executive '
                    'Management, RANEPA Moscow · Anthropic Academy, Claude Certification (in progress)')),
            ('kv', ('Languages', 'Russian (native) · English (fluent) · Spanish (intermediate) · French (basic)')),
            ('kv', ('Tools', 'Microsoft PowerPoint · HTML/CSS slide decks · Claude · GPT · Gemini · Flux · Runway · '
                    'Kling · Veo · FFmpeg · HubSpot · Make.com')),
            ('kv', ('Availability', 'Contract, remote, sprint-based cycles; Panama UTC-5 overlaps US and European hours.')),
        ]),
    ],
}


def styles():
    return {
        'name': ParagraphStyle('name', fontName='Helvetica-Bold', fontSize=19, textColor=DARK, spaceAfter=2, leading=22),
        'title': ParagraphStyle('title', fontName='Helvetica-Bold', fontSize=10, textColor=ACCENT, spaceAfter=4, leading=13),
        'contact': ParagraphStyle('contact', fontName='Helvetica', fontSize=8.4, textColor=BLACK, spaceAfter=1.5, leading=11),
        'section': ParagraphStyle('section', fontName='Helvetica-Bold', fontSize=10.5, textColor=DARK,
                                  spaceBefore=6, spaceAfter=1.2, leading=12.5),
        'body': ParagraphStyle('body', fontName='Helvetica', fontSize=8.5, textColor=BLACK,
                               spaceAfter=2, leading=11, alignment=TA_LEFT),
        'bullet': ParagraphStyle('bullet', fontName='Helvetica', fontSize=8.5, textColor=BLACK,
                                 spaceAfter=1.8, leading=11, leftIndent=10, firstLineIndent=-10),
    }


def build():
    s = styles()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(str(OUT), pagesize=letter,
                            leftMargin=0.55 * inch, rightMargin=0.55 * inch,
                            topMargin=0.45 * inch, bottomMargin=0.4 * inch,
                            title='Elena Revicheva — Arts, Media & Design', author='Elena Revicheva',
                            subject='Application: micro1, Arts, Media & Design Expert')
    flow = [Paragraph(CONTENT['name'], s['name']), Paragraph(CONTENT['title'], s['title']),
            Paragraph(CONTENT['contact'], s['contact']), Paragraph(CONTENT['links'], s['contact']),
            Spacer(1, 3), HRFlowable(width='100%', thickness=1, color=DARK, spaceAfter=2)]
    for heading, items in CONTENT['sections']:
        flow.append(Paragraph(heading, s['section']))
        flow.append(HRFlowable(width='100%', thickness=0.5, color=ACCENT, spaceAfter=3))
        for kind, value in items:
            if kind == 'p':
                flow.append(Paragraph(value, s['body']))
            elif kind == 'b':
                flow.append(Paragraph(f'•&nbsp;&nbsp;{value}', s['bullet']))
            elif kind == 'kv':
                label, text = value
                flow.append(Paragraph(f'<b>{label}:</b> {text}', s['body']))
            else:
                raise ValueError(kind)
    doc.build(flow)
    print(f'PDF generated: {OUT}')


if __name__ == '__main__':
    build()
