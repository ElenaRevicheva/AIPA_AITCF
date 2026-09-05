#!/usr/bin/env python3
"""Build Addendum No. 1 to the 24 Aug IntelliOps BD agreement.

The Word file is the deliverable they can sign. A reconstruction in chat is
not a contract. This writes the same bytes to:

  docs/selling/intelliops/ADDENDUM_No1_IntelliOps_BD.docx
  docs/selling/attachments/ADDENDUM_No1_IntelliOps_BD.docx

and a plain-text extract next to the source. The two .docx copies must stay
byte-identical — the send path only reads attachments/, the review path
reads intelliops/. The verifier asserts that.

No cédula, no RUC. This is a commercial addendum, not an identity filing.
"""
from __future__ import annotations

import io
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / "docs" / "selling" / "intelliops"
ATTACH_DIR = ROOT / "docs" / "selling" / "attachments"
NAME = "ADDENDUM_No1_IntelliOps_BD.docx"

# The clauses are the four remaining items from the 25 Aug letter, plus the
# AIdeazz carve-out. 20% is deliberately untouched.
PARAS: list[tuple[str, str]] = [
    ("title", "ADDENDUM NO. 1"),
    ("sub", "to the Business Development Expert Commission & Representation Agreement dated 24 August 2026"),
    ("body", "This Addendum is made between IntelliOps Automation (the “Company”), as named in the 24 August 2026 Agreement, and Elena Revicheva of Panama City, Republic of Panama (the “BD Expert”)."),
    ("body", "It amends that Agreement only as set out below. The commission rate of 20% (twenty percent) of Net Collected Revenue is unchanged. Capitalised terms have the meaning given in the Agreement unless this Addendum defines them."),
    ("h", "1. Deemed acceptance of a registered opportunity (amends Section 8)"),
    ("body", "If a complete opportunity registration receives no written response within five (5) business days, the opportunity is deemed accepted as attributable to the BD Expert. A request for clarification is limited to one round. If the BD Expert answers that request within three (3) business days and the Company does not then accept or reject the registration in writing, the opportunity is deemed accepted."),
    ("h", "2. Commission base (amends Section 6)"),
    ("body", "Net Collected Revenue means amounts actually received and retained by the Company from the customer for Company services under the qualifying deal, excluding only taxes, refunds, credits and chargebacks. Delivery costs, subcontractors, tools, pass-through amounts and reimbursable expenses are not deducted from the commission base."),
    ("h", "3. Payment rail and statement date (amends Sections 7 and 9)"),
    ("body", "Commission is paid in United States dollars by Wise or international wire within fifteen (15) business days of the Company’s receipt of the relevant customer funds. Verification runs in parallel and does not extend that period. The Company bears ordinary transfer fees. The monthly statement described in Section 9 is issued by the tenth (10th) calendar day of the following month and states the currency as USD."),
    ("h", "4. Post-termination tail (amends Section 19)"),
    ("body", "A documented opportunity confirmed in writing as attributable under Section 8 (including by deemed acceptance under clause 1 of this Addendum) before termination remains commission-eligible if the resulting customer transaction is executed within twelve (12) months after termination and the Company receives the relevant Net Collected Revenue."),
    ("h", "5. Independent practice (clarifies Section 16)"),
    ("body", "The BD Expert’s independent practice (AIdeazz: GEO/AEO, conversational agents, and AI-ops systems she builds and sells in her own name) is not a conflict under Section 16, provided she does not redirect a registered IntelliOps opportunity."),
    ("body", "This Addendum may be accepted by (a) wet-ink or electronic signature of both parties on this page, or (b) a written reply from the Company that accepts clauses 1 to 5. Either form binds the parties. It may be signed in counterparts."),
    ("body", "Date: 4 September 2026"),
    ("signh", "For the Company"),
    ("sign", "Legal entity name: ________________________________"),
    ("sign", "CIN / GSTIN: ________________________________"),
    ("sign", "Authorised signatory: ________________________________"),
    ("sign", "Name / title: ________________________________"),
    ("sign", "Signature: ________________________________    Date: ________"),
    ("signh", "For the BD Expert"),
    ("sign", "Name: Elena Revicheva"),
    ("sign", "Residence: Panama City, Republic of Panama"),
    ("sign", "Practice name: AIdeazz (nombre comercial — not a company)"),
    ("sign", "Signature: ________________________________    Date: ________"),
]


def w_p(style: str, text: str) -> str:
    align = {
        "title": "center",
        "sub": "center",
        "h": "left",
        "signh": "left",
        "sign": "left",
        "body": "both",
    }[style]
    size = {
        "title": "32",
        "sub": "20",
        "h": "22",
        "signh": "22",
        "sign": "20",
        "body": "21",
    }[style]
    bold = style in {"title", "h", "signh"}
    space_before = "240" if style in {"h", "signh", "title"} else "80"
    space_after = "80" if style == "title" else "120"
    rpr = f'<w:rPr><w:sz w:val="{size}"/><w:szCs w:val="{size}"/>'
    if bold:
        rpr += "<w:b/>"
    if style == "sub":
        rpr += "<w:i/>"
    rpr += "</w:rPr>"
    return (
        f'<w:p><w:pPr><w:jc w:val="{align}"/>'
        f'<w:spacing w:before="{space_before}" w:after="{space_after}"/>'
        f"</w:pPr><w:r>{rpr}<w:t xml:space=\"preserve\">{escape(text)}</w:t></w:r></w:p>"
    )


def document_xml() -> bytes:
    body = "".join(w_p(style, text) for style, text in PARAS)
    xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{body}"
        '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>'
        '<w:pgMar w:top="1008" w:right="1008" w:bottom="1008" w:left="1008"/>'
        "</w:sectPr></w:body></w:document>"
    )
    return xml.encode("utf-8")


CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>
"""

RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>
"""

CORE = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Addendum No. 1 — IntelliOps BD Agreement</dc:title>
  <dc:creator>Elena Revicheva</dc:creator>
</cp:coreProperties>
"""


def build_docx() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("docProps/core.xml", CORE)
        z.writestr("word/document.xml", document_xml())
    return buf.getvalue()


def extract_text() -> str:
    return "\n\n".join(text for _, text in PARAS) + "\n"


def main() -> int:
    SRC_DIR.mkdir(parents=True, exist_ok=True)
    ATTACH_DIR.mkdir(parents=True, exist_ok=True)
    blob = build_docx()
    src = SRC_DIR / NAME
    att = ATTACH_DIR / NAME
    src.write_bytes(blob)
    att.write_bytes(blob)
    (SRC_DIR / NAME.replace(".docx", ".txt")).write_text(extract_text(), encoding="utf-8")
    print(f"wrote {src.relative_to(ROOT)} {len(blob)} bytes")
    print(f"wrote {att.relative_to(ROOT)} {len(blob)} bytes (identical)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
