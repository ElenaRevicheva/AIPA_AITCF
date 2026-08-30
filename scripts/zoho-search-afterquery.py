#!/usr/bin/env python3
"""Search aipa@ Zoho IMAP for AfterQuery / Atrium thread. No secrets printed."""
from __future__ import annotations

import email
import json
import os
import re
import sys
from datetime import datetime, timezone
from email.header import decode_header, make_header
from email.utils import parsedate_to_datetime
from pathlib import Path

HOST_DEFAULT = "imappro.zoho.com"
PORT_DEFAULT = 993
NEEDLE = re.compile(r"afterquery|atrium\.afterquery|@afterquery\.com", re.I)
USER_KEYS = (
    "IMAP_USER",
    "IMAP_USERNAME",
    "EMAIL_USER",
    "EMAIL_USERNAME",
    "ZOHO_EMAIL",
    "ZOHO_USER",
    "SMTP_USER",
    "AIPA_EMAIL",
    "MAIL_USERNAME",
)
PASS_KEYS = (
    "IMAP_PASSWORD",
    "IMAP_PASS",
    "EMAIL_PASSWORD",
    "EMAIL_PASS",
    "ZOHO_PASSWORD",
    "ZOHO_PASS",
    "SMTP_PASSWORD",
    "SMTP_PASS",
    "AIPA_PASSWORD",
    "MAIL_PASSWORD",
)
ENV_CANDIDATES = (
    Path("/home/ubuntu/cto-aipa/.env"),
    Path("/home/ubuntu/AIPA_AITCF/.env"),
    Path("/home/ubuntu/VibeJobHunterAIPA_AIMCF/.env"),
    Path.cwd() / ".env",
)


def parse_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return out
    for line in text.splitlines():
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def first_env(blob: dict[str, str], keys: tuple[str, ...]) -> tuple[str, str]:
    for k in keys:
        v = (os.environ.get(k) or blob.get(k) or "").strip()
        if v:
            return k, v
    return "", ""


def decode_hdr(raw: str | None) -> str:
    if not raw:
        return ""
    try:
        return str(make_header(decode_header(raw)))
    except Exception:
        return raw


def body_text(msg: email.message.Message) -> str:
    chunks: list[str] = []
    if msg.is_multipart():
        for part in msg.walk():
            ctype = (part.get_content_type() or "").lower()
            disp = str(part.get("Content-Disposition") or "")
            if "attachment" in disp:
                continue
            if ctype == "text/plain":
                payload = part.get_payload(decode=True) or b""
                charset = part.get_content_charset() or "utf-8"
                chunks.append(payload.decode(charset, errors="replace"))
    else:
        payload = msg.get_payload(decode=True) or b""
        charset = msg.get_content_charset() or "utf-8"
        chunks.append(payload.decode(charset, errors="replace"))
    text = "\n".join(chunks)
    text = re.sub(r"\r\n", "\n", text)
    return text.strip()[:2500]


def msg_date(msg: email.message.Message) -> str:
    raw = msg.get("Date")
    if not raw:
        return ""
    try:
        dt = parsedate_to_datetime(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except Exception:
        return raw


def extract_addrs(hdr: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", hdr or "")


def load_creds() -> tuple[str, str, str, int, list[str]]:
    blob: dict[str, str] = {}
    sources: list[str] = []
    for p in ENV_CANDIDATES:
        part = parse_env(p)
        if part:
            sources.append(str(p))
            blob.update(part)
    user_key, user = first_env(blob, USER_KEYS)
    pass_key, password = first_env(blob, PASS_KEYS)
    if user_key:
        sources.append(f"user_key={user_key}")
    if pass_key:
        sources.append(f"pass_key={pass_key}")
    host = os.environ.get("IMAP_HOST") or blob.get("IMAP_HOST") or HOST_DEFAULT
    port_s = os.environ.get("IMAP_PORT") or blob.get("IMAP_PORT") or str(PORT_DEFAULT)
    try:
        port = int(port_s)
    except ValueError:
        port = PORT_DEFAULT
    if "@" not in user and blob.get("FROM_EMAIL"):
        m = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", blob["FROM_EMAIL"])
        if m:
            user = m.group(0)
            sources.append("user_from=FROM_EMAIL")
    return user, password, host, port, sources


def search_folder(imap, folder: str) -> list[dict]:
    typ, _ = imap.select(f'"{folder}"', readonly=True)
    if typ != "OK":
        typ, _ = imap.select(folder, readonly=True)
        if typ != "OK":
            return []
    found: set[bytes] = set()
    for crit in (
        '(FROM "afterquery")',
        '(TO "afterquery")',
        '(CC "afterquery")',
        '(SUBJECT "afterquery")',
        '(SUBJECT "Atrium")',
        '(TEXT "afterquery.com")',
        '(TEXT "atrium.afterquery")',
    ):
        typ, data = imap.search(None, crit)
        if typ == "OK" and data and data[0]:
            found.update(data[0].split())
    rows: list[dict] = []
    for uid in found:
        typ, data = imap.fetch(uid, "(RFC822.HEADER BODY.PEEK[TEXT])")
        if typ != "OK" or not data:
            continue
        raw = b""
        for part in data:
            if isinstance(part, tuple):
                raw += part[1]
        if not raw:
            continue
        # Prefer full message if TEXT-only is thin
        typ2, data2 = imap.fetch(uid, "(RFC822)")
        if typ2 == "OK" and data2:
            raw_full = b""
            for part in data2:
                if isinstance(part, tuple):
                    raw_full += part[1]
            if raw_full:
                raw = raw_full
        msg = email.message_from_bytes(raw)
        subj = decode_hdr(msg.get("Subject"))
        frm = decode_hdr(msg.get("From"))
        to = decode_hdr(msg.get("To"))
        cc = decode_hdr(msg.get("Cc"))
        blob = f"{subj}\n{frm}\n{to}\n{cc}\n{body_text(msg)}"
        if not NEEDLE.search(blob):
            continue
        rows.append(
            {
                "folder": folder,
                "date": msg_date(msg),
                "from": frm,
                "to": to,
                "cc": cc,
                "subject": subj,
                "from_emails": [a.lower() for a in extract_addrs(frm)],
                "to_emails": [a.lower() for a in extract_addrs(to)],
                "cc_emails": [a.lower() for a in extract_addrs(cc)],
                "snippet": body_text(msg),
            }
        )
    return rows


def main() -> int:
    user, password, host, port, sources = load_creds()
    report = {
        "ok": False,
        "error": "",
        "host": host,
        "port": port,
        "user_present": bool(user),
        "pass_present": bool(password),
        "cred_sources": sources,
        "folders_tried": [],
        "messages": [],
        "reply_from": "",
        "reply_subject": "",
        "inbound_count": 0,
        "outbound_count": 0,
        "searched_at": datetime.now(timezone.utc).isoformat(),
    }
    if not user or not password:
        report["error"] = "IMAP user/password not found in Oracle .env (checked named keys only)"
        Path("/tmp/afterquery-zoho.json").write_text(json.dumps(report, indent=2) + "\n")
        print("IMAP credentials missing — see /tmp/afterquery-zoho.json (no secrets)")
        return 2
    import imaplib

    try:
        imap = imaplib.IMAP4_SSL(host, port)
        imap.login(user, password)
    except Exception as e:
        report["error"] = f"IMAP login failed: {type(e).__name__}"
        Path("/tmp/afterquery-zoho.json").write_text(json.dumps(report, indent=2) + "\n")
        print("IMAP login failed (error type only)")
        return 3
    typ, folders = imap.list()
    names = []
    if typ == "OK" and folders:
        for raw in folders:
            line = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else str(raw)
            m = re.search(r' "([^"]+)"$| ([^\s]+)$', line)
            if m:
                names.append(m.group(1) or m.group(2))
    prefer = [n for n in names if re.search(r"inbox|sent|all", n, re.I)]
    if not prefer:
        prefer = names[:8] or ["INBOX", "Sent"]
    report["folders_tried"] = prefer
    all_rows: list[dict] = []
    for folder in prefer:
        try:
            all_rows.extend(search_folder(imap, folder))
        except Exception as e:
            report.setdefault("folder_errors", []).append(f"{folder}:{type(e).__name__}")
    try:
        imap.logout()
    except Exception:
        pass

    def sort_key(r: dict) -> str:
        return r.get("date") or ""

    all_rows.sort(key=sort_key, reverse=True)
    # Dedupe by subject+from+date
    seen = set()
    uniq = []
    for r in all_rows:
        k = (r.get("subject"), r.get("from"), r.get("date"))
        if k in seen:
            continue
        seen.add(k)
        uniq.append(r)
    report["messages"] = uniq[:20]
    inbound = [
        r
        for r in uniq
        if any(a.endswith("@afterquery.com") for a in r.get("from_emails", []))
    ]
    outbound = [
        r
        for r in uniq
        if any(a.endswith("@afterquery.com") for a in r.get("to_emails", []) + r.get("cc_emails", []))
        and not any(a.endswith("@afterquery.com") for a in r.get("from_emails", []))
    ]
    report["inbound_count"] = len(inbound)
    report["outbound_count"] = len(outbound)
    if inbound:
        top = inbound[0]
        report["reply_from"] = (top.get("from_emails") or [""])[0]
        report["reply_subject"] = top.get("subject") or ""
        report["reply_snippet"] = (top.get("snippet") or "")[:1200]
        report["reply_date"] = top.get("date") or ""
        report["reply_from_header"] = top.get("from") or ""
    report["ok"] = True
    Path("/tmp/afterquery-zoho.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        f"Zoho search ok: {len(uniq)} thread hits, inbound={len(inbound)} outbound={len(outbound)} "
        f"reply_from={report.get('reply_from') or '-'}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
