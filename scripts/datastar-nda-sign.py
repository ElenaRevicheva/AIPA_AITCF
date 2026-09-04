#!/usr/bin/env python3
"""Drop a signature image into Elena's signature box in the Datastar NDA.

Usage:
    python3 scripts/datastar-nda-sign.py <signature.png> [-o out.docx] [--height-mm 14]

Signing by hand in Word is fine and is the normal path — this exists so it can
also be done without opening Word, and so the result is reproducible.

Rules it enforces:
  * The unsigned deliverable is never overwritten. Output is a new file.
  * The image goes in the BLANK paragraph above ELENA REVICHEVA, so nothing in
    the box moves and no existing text is touched.
  * Both serialisations get the image. Word writes each text box twice
    (mc:Choice and mc:Fallback); signing only one means the signature is
    invisible in whichever reader picks the other.
  * Datastar's box is not touched. Conrad signs his own.
"""
from __future__ import annotations

import argparse
import re
import shutil
import struct
import sys
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED

REPO = Path(__file__).resolve().parent.parent
DIR = REPO / "docs/selling/datastar"
UNSIGNED = DIR / "NDA_Datastar_Elena_Revicheva_DRAFT.docx"

EMU_PER_MM = 36000
# The blank signing paragraph inserted into Elena's box, matched exactly.
BLANK_PARA = '<w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:lang w:val="en-US"/></w:rPr></w:pPr></w:p>'
PNG_CONTENT_TYPE = '<Default Extension="png" ContentType="image/png"/>'


def png_size(path: Path) -> tuple[int, int]:
    """Width/height from the PNG IHDR. Refuses anything that is not a real PNG."""
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        sys.exit(f"{path} is not a PNG (magic bytes do not match)")
    if data[12:16] != b"IHDR":
        sys.exit(f"{path} has no IHDR chunk")
    w, h = struct.unpack(">II", data[16:24])
    if not w or not h:
        sys.exit(f"{path} reports a zero dimension")
    return w, h


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("signature", type=Path, help="PNG of the signature, ideally transparent")
    ap.add_argument("-o", "--out", type=Path, default=DIR / "NDA_Datastar_Elena_Revicheva_SIGNED.docx")
    ap.add_argument(
        "--height-mm",
        type=float,
        default=14.0,
        help="rendered signature height in mm (default 14; the box grows to fit)",
    )
    args = ap.parse_args()

    if not args.signature.exists():
        sys.exit(f"no such signature image: {args.signature}")
    if not UNSIGNED.exists():
        sys.exit(f"missing {UNSIGNED}")
    if args.out.resolve() == UNSIGNED.resolve():
        sys.exit("refusing to overwrite the unsigned deliverable — choose another -o")

    px_w, px_h = png_size(args.signature)
    cy = int(round(args.height_mm * EMU_PER_MM))
    cx = int(round(cy * px_w / px_h))

    work = Path("/tmp/nda-sign-work")
    if work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True)
    with ZipFile(UNSIGNED) as z:
        z.extractall(work)

    media = work / "word" / "media"
    media.mkdir(parents=True, exist_ok=True)
    shutil.copy(args.signature, media / "signature.png")

    # Content types: PNG needs a Default extension entry or Word rejects the part.
    ct = work / "[Content_Types].xml"
    ct_xml = ct.read_text(encoding="utf-8")
    if 'Extension="png"' not in ct_xml:
        ct_xml = ct_xml.replace("<Types ", "<Types ", 1)
        ct_xml = re.sub(r"(<Types[^>]*>)", r"\1" + PNG_CONTENT_TYPE, ct_xml, count=1)
        ct.write_text(ct_xml, encoding="utf-8")

    # Relationship for the image part.
    rels_path = work / "word" / "_rels" / "document.xml.rels"
    rels = rels_path.read_text(encoding="utf-8")
    used = {int(m) for m in re.findall(r'Id="rId(\d+)"', rels)}
    rid = f"rId{max(used) + 1 if used else 1}"
    rels = rels.replace(
        "</Relationships>",
        f'<Relationship Id="{rid}" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" '
        'Target="media/signature.png"/></Relationships>',
    )
    rels_path.write_text(rels, encoding="utf-8")

    doc_path = work / "word" / "document.xml"
    xml = doc_path.read_text(encoding="utf-8")

    found = xml.count(BLANK_PARA)
    if found != 2:
        sys.exit(
            f"expected 2 blank signing paragraphs (mc:Choice + mc:Fallback), found {found}. "
            "Has the signature box changed? Run scripts/verify-datastar-nda-fill.cjs."
        )

    # An inline drawing inside the blank paragraph: the box keeps its layout and
    # grows downward because Elena's box is spAutoFit.
    def drawing(uid: int) -> str:
        return (
            "<w:r><w:rPr><w:noProof/></w:rPr><w:drawing>"
            f'<wp:inline distT="0" distB="0" distL="0" distR="0">'
            f'<wp:extent cx="{cx}" cy="{cy}"/>'
            '<wp:effectExtent l="0" t="0" r="0" b="0"/>'
            f'<wp:docPr id="{uid}" name="Firma Elena Revicheva" descr="Firma"/>'
            "<wp:cNvGraphicFramePr>"
            '<a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>'
            "</wp:cNvGraphicFramePr>"
            '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
            '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
            '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
            f'<pic:nvPicPr><pic:cNvPr id="{uid}" name="signature.png"/><pic:cNvPicPr/></pic:nvPicPr>'
            f'<pic:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
            "<pic:spPr>"
            f'<a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm>'
            '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
            "</pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>"
        )

    signed_para_1 = BLANK_PARA.replace("</w:pPr>", "</w:pPr>" + drawing(9101), 1)
    signed_para_2 = BLANK_PARA.replace("</w:pPr>", "</w:pPr>" + drawing(9102), 1)

    head, _, tail = xml.partition(BLANK_PARA)
    xml = head + signed_para_1 + tail.replace(BLANK_PARA, signed_para_2, 1)

    if xml.count("signature.png") != 2:
        sys.exit("signature was not written into both serialisations — refusing to save")

    doc_path.write_text(xml, encoding="utf-8")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(args.out, "w") as z:
        z.write(ct, "[Content_Types].xml", compress_type=ZIP_STORED)
        for f in sorted(work.rglob("*")):
            if not f.is_file():
                continue
            rel = f.relative_to(work).as_posix()
            if rel == "[Content_Types].xml":
                continue
            z.write(f, rel, compress_type=ZIP_DEFLATED)

    def show(p: Path) -> str:
        try:
            return str(p.resolve().relative_to(REPO))
        except ValueError:
            return str(p)

    print(f"signed -> {show(args.out)}")
    print(f"  signature {px_w}x{px_h}px rendered at {args.height_mm}mm tall")
    print(f"  unsigned deliverable untouched: {show(UNSIGNED)}")


if __name__ == "__main__":
    main()
