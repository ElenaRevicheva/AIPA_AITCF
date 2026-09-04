#!/usr/bin/env python3
"""Pull Nishant / IntelliOps mail from Zoho IMAP (and Gmail if wired).

Oracle has the mail passwords. This writes /tmp/intelliops-mail/index.json plus
document attachments. Secrets are never printed.

4 Sep 2026: this saved **.pdf only**, so a revised agreement sent as .docx —
which is how a document still open for redlining normally travels — was
invisible in the output. The same PDF-only assumption was in the outreach
sender. Now any document extension in DOC_EXT is saved; anything else is still
skipped so images and signature blocks do not fill the folder.
"""
from __future__ import annotations

import email
import imaplib
import json
import os
import re
import sys
from email.header import decode_header
from email.utils import parsedate_to_datetime
from pathlib import Path

OUT = Path("/tmp/intelliops-mail")
OUT.mkdir(parents=True, exist_ok=True)

NEEDLE = re.compile(
    r"intelliops|nishant\.chaudhary|business development agreement",
    re.I,
)

# Attachment types worth keeping: a contract arrives as any of these.
DOC_EXT = (".pdf", ".docx", ".doc", ".rtf", ".odt", ".txt", ".md")
DOC_CTYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/rtf",
    "application/vnd.oasis.opendocument.text",
}


def parse_env(path: str) -> dict[str, str]:
    out: dict[str, str] = {}
    try:
        raw = Path(path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return out
    for line in raw.splitlines():
        if not line or line.lstrip().startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def merge_envs() -> dict[str, str]:
    merged: dict[str, str] = {}
    for p in (
        "/home/ubuntu/cto-aipa/.env",
        "/home/ubuntu/AIPA_AITCF/.env",
        "/home/ubuntu/VibeJobHunterAIPA_AIMCF/.env",
        "/home/ubuntu/vibejobhunter/.env",
        str(Path(__file__).resolve().parents[1] / ".env"),
    ):
        if Path(p).is_file():
            merged.update(parse_env(p))
            print(f"env_file {p} keys={len(parse_env(p))}")
    return merged


def extract_doc_text(path: Path, ctype: str) -> str:
    """Text of a saved attachment, using the stdlib only where possible.

    A cloud agent cannot download the build artifact — the blob host is not in
    its egress allowlist — so the text has to travel through the Actions log.
    That means extraction happens HERE, on the box that has the file.
    """
    name = path.name.lower()
    try:
        if name.endswith((".txt", ".md")):
            return path.read_text(encoding="utf-8", errors="replace")
        if name.endswith(".docx"):
            # stdlib: a .docx is a zip of XML. No python-docx needed.
            import xml.etree.ElementTree as ET
            from zipfile import ZipFile

            W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
            with ZipFile(path) as z:
                root = ET.fromstring(z.read("word/document.xml"))
            out = []
            for para in root.iter(f"{W}p"):
                line = "".join(t.text or "" for t in para.iter(f"{W}t")).strip()
                if line:
                    out.append(line)
            return "\n".join(out)
        if name.endswith(".pdf") or ctype == "application/pdf":
            import shutil
            import subprocess

            if shutil.which("pdftotext"):
                r = subprocess.run(
                    ["pdftotext", "-layout", str(path), "-"],
                    capture_output=True,
                    text=True,
                    timeout=60,
                )
                if r.returncode == 0:
                    return r.stdout
                return f"(pdftotext failed rc={r.returncode})"
            return "(pdftotext not installed on this box — raw file is in the bundle)"
    except Exception as e:  # noqa: BLE001 - the reason matters more than the type
        return f"(extract failed: {e})"
    return "(no extractor for this type)"


def dec(val) -> str:
    if val is None:
        return ""
    if isinstance(val, bytes):
        return val.decode("utf-8", "replace")
    parts = decode_header(str(val))
    bits = []
    for text, charset in parts:
        if isinstance(text, bytes):
            bits.append(text.decode(charset or "utf-8", "replace"))
        else:
            bits.append(str(text))
    return "".join(bits)


def accounts(env: dict[str, str]) -> list[dict[str, str]]:
    found = []
    zoho_user = (
        env.get("FROM_EMAIL")
        or env.get("ZOHO_EMAIL")
        or env.get("IMAP_USER")
        or env.get("EMAIL_USER")
        or env.get("AIPA_EMAIL")
        or ""
    )
    m = re.search(r"[\w.+-]+@[\w.-]+\.\w+", zoho_user)
    if m:
        zoho_user = m.group(0)
    zoho_pw = (
        env.get("EMAIL_PASSWORD")
        or env.get("ZOHO_PASSWORD")
        or env.get("IMAP_PASSWORD")
        or env.get("ZOHO_MAIL_PASSWORD")
        or env.get("AIPA_EMAIL_PASSWORD")
        or ""
    )
    zoho_host = env.get("IMAP_HOST") or env.get("ZOHO_IMAP_HOST") or "imappro.zoho.com"
    if zoho_user and zoho_pw:
        found.append({"name": "zoho", "host": zoho_host, "user": zoho_user, "password": zoho_pw})
    g_user = env.get("GMAIL_USER") or env.get("GMAIL_EMAIL") or ""
    g_pw = env.get("GMAIL_APP_PASSWORD") or env.get("GMAIL_PASSWORD") or ""
    if g_user and g_pw:
        found.append({"name": "gmail", "host": "imap.gmail.com", "user": g_user, "password": g_pw})
    return found


def folders(M: imaplib.IMAP4) -> list[str]:
    typ, data = M.list()
    names = ["INBOX"]
    if typ != "OK":
        return names
    for raw in data or []:
        line = raw.decode("utf-8", "replace") if isinstance(raw, bytes) else str(raw)
        m = re.search(r'"([^"]+)"$', line) or re.search(r" (\S+)$", line)
        if not m:
            continue
        name = m.group(1)
        if re.search(r"INBOX|Sent|All Mail|Archive", name, re.I):
            names.append(name)
    # unique, keep order
    seen = set()
    out = []
    for n in names:
        if n not in seen:
            seen.add(n)
            out.append(n)
    return out


def search_ids(M: imaplib.IMAP4) -> list[bytes]:
    queries = [
        '(FROM "nishant.chaudhary@intelliopsautomation.com")',
        '(TO "nishant.chaudhary@intelliopsautomation.com")',
        '(CC "nishant.chaudhary@intelliopsautomation.com")',
        '(FROM "intelliopsautomation.com")',
        '(TO "intelliopsautomation.com")',
        '(SUBJECT "IntelliOps")',
        '(SUBJECT "Business Development")',
        '(SUBJECT "agreement")',
        '(SUBJECT "ELENA REVICHEVA")',
    ]
    ids: set[bytes] = set()
    for q in queries:
        try:
            typ, data = M.search(None, q)
        except Exception as e:
            print(f"WARN search {q}: {e}")
            continue
        if typ == "OK" and data and data[0]:
            ids.update(data[0].split())
    return sorted(ids, key=lambda x: int(x))


def walk_parts(msg: email.message.Message, uid: str, saved: list[dict]) -> str:
    body = ""
    for part in msg.walk():
        ctype = (part.get_content_type() or "").lower()
        disp = str(part.get("Content-Disposition") or "")
        name = dec(part.get_filename() or "")
        if part.get_content_maintype() == "multipart":
            continue
        payload = part.get_payload(decode=True) or b""
        is_doc = name.lower().endswith(DOC_EXT) or ctype in DOC_CTYPES
        if is_doc and payload:
            safe = re.sub(r"[^A-Za-z0-9._-]+", "_", name or f"{uid}.bin")
            path = OUT / f"{uid}_{safe}"
            path.write_bytes(payload)
            text = extract_doc_text(path, ctype)
            saved.append(
                {
                    "filename": name or safe,
                    "path": str(path),
                    "bytes": len(payload),
                    "content_type": ctype,
                    "text": text[:120000],
                }
            )
            print(f"doc {path.name} {len(payload)} bytes {ctype} text_chars={len(text)}")
            continue
        if "attachment" in disp.lower():
            continue
        if ctype == "text/plain" and not body:
            charset = part.get_content_charset() or "utf-8"
            body = payload.decode(charset, "replace")
        elif ctype == "text/html" and not body:
            charset = part.get_content_charset() or "utf-8"
            html = payload.decode(charset, "replace")
            body = re.sub(r"<[^>]+>", " ", html)
            body = re.sub(r"\s+", " ", body).strip()
    return body.strip()


def pull_account(acc: dict[str, str]) -> list[dict]:
    print(f"imap_connect {acc['name']} {acc['host']} user={acc['user']}")
    M = imaplib.IMAP4_SSL(acc["host"], 993)
    M.login(acc["user"], acc["password"])
    messages = []
    for folder in folders(M):
        typ, _ = M.select(f'"{folder}"' if " " in folder else folder, readonly=True)
        if typ != "OK":
            # try without quotes
            typ, _ = M.select(folder, readonly=True)
            if typ != "OK":
                print(f"WARN cannot select {folder}")
                continue
        ids = search_ids(M)
        print(f"folder {folder} hits={len(ids)}")
        for uid in ids:
            typ, data = M.fetch(uid, "(RFC822)")
            if typ != "OK" or not data or not data[0]:
                continue
            raw = data[0][1]
            msg = email.message_from_bytes(raw)
            subj = dec(msg.get("Subject"))
            frm = dec(msg.get("From"))
            to = dec(msg.get("To"))
            cc = dec(msg.get("Cc"))
            blob = f"{subj}\n{frm}\n{to}\n{cc}"
            if re.search(r"github\.com|notifications@github|cursor\[bot\]|github-actions", blob, re.I):
                continue
            if not NEEDLE.search(blob) and "intelliops" not in blob.lower() and "nishant" not in blob.lower():
                # still keep FROM/TO exact hits
                if "intelliopsautomation.com" not in blob.lower() and "nishant" not in blob.lower():
                    continue
            date = dec(msg.get("Date"))
            iso = date
            try:
                iso = parsedate_to_datetime(msg.get("Date")).isoformat()
            except Exception:
                pass
            atts: list[dict] = []
            body = walk_parts(msg, f"{acc['name']}_{folder}_{uid.decode()}", atts)
            messages.append(
                {
                    "account": acc["name"],
                    "user": acc["user"],
                    "folder": folder,
                    "uid": uid.decode(),
                    "date": iso,
                    "from": frm,
                    "to": to,
                    "cc": cc,
                    "subject": subj,
                    "body": body[:20000],
                    "attachments": atts,
                }
            )
    try:
        M.logout()
    except Exception:
        pass
    return messages


def main() -> int:
    env = merge_envs()
    mail_keys = sorted(k for k in env if re.search(r"IMAP|ZOHO|MAIL|GMAIL|FROM_EMAIL|EMAIL_PASS|EMAIL_USER", k, re.I))
    print("mail_key_names", ",".join(mail_keys) or "(none)")
    accs = accounts(env)
    if not accs:
        print("WARN no IMAP accounts resolved from .env")
        (OUT / "index.json").write_text(json.dumps({"ok": False, "reason": "no-imap", "messages": []}, indent=2) + "\n")
        return 0
    all_msgs = []
    for acc in accs:
        try:
            all_msgs.extend(pull_account(acc))
        except Exception as e:
            print(f"WARN account {acc['name']} failed: {e}")
    # de-dupe by subject+date+from
    seen = set()
    uniq = []
    for m in sorted(all_msgs, key=lambda x: x.get("date") or ""):
        k = (m.get("date"), m.get("subject"), m.get("from"))
        if k in seen:
            continue
        seen.add(k)
        uniq.append(m)
    index = {"ok": True, "accounts": [a["name"] for a in accs], "messages": uniq}
    (OUT / "index.json").write_text(json.dumps(index, indent=2) + "\n")
    print(f"wrote {OUT / 'index.json'} messages={len(uniq)} docs={sum(len(m['attachments']) for m in uniq)}")

    # A readable transcript, oldest first, for the Actions log. The bundle is
    # the archive; this is the only copy an agent without blob egress can read.
    lines: list[str] = ["===== INTELLIOPS THREAD (oldest first) ====="]
    for m in uniq:
        lines.append("")
        lines.append(f"--- {m['date']} | {m['account']}/{m['folder']} uid {m['uid']}")
        lines.append(f"FROM: {m['from']}")
        lines.append(f"TO:   {m['to']}")
        if m.get("cc"):
            lines.append(f"CC:   {m['cc']}")
        lines.append(f"SUBJ: {m['subject']}")
        if m["attachments"]:
            lines.append("ATT:  " + ", ".join(f"{a['filename']} ({a['bytes']}B)" for a in m["attachments"]))
        lines.append("")
        lines.append((m.get("body") or "").strip()[:6000])
    lines.append("")
    lines.append("===== ATTACHED DOCUMENTS =====")
    for m in uniq:
        for a in m["attachments"]:
            lines.append("")
            lines.append(f"=== {a['filename']} ({a['bytes']}B) from {m['date']} — {m['subject']}")
            lines.append(a.get("text") or "(no text)")
    (OUT / "transcript.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {OUT / 'transcript.txt'} chars={sum(len(x) for x in lines)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
