#!/usr/bin/env python3
"""
reply-radar.py — a reply from ANY person linked to ANY HubSpot deal reaches Elena by email.

    python3 scripts/reply-radar.py --since-days 60 --report /tmp/rr.json   # dry run: find, change nothing
    python3 scripts/reply-radar.py --init                                  # start the live clock (no alerts for the past)
    python3 scripts/reply-radar.py --apply --since-days 3                  # live (cron, every 10 min)

WHY (24 Sep 2026). The HubSpot workflow "Reply Radar" fires when a deal moves to 💬 They replied —
and only VJH's response_detector ever moves a deal there, for HIRING deals. Product outreach
(~193 deals in ⏳ Sent: CLIENT-*, PARTNER-*, ESPALUZ-*, ATUONA-*, LICENSE) had no sensor at all:
a prospect could answer and the CRM would never know. Elena: "any prefix, any deal, any contact".

WHAT IT DOES, per new message in Zoho + Gmail (Inbox, Notification, Newsletter, Spam — read-only):
  1. Skip anything that is not a person: our own domain, no-reply senders, List-Unsubscribe /
     Precedence: bulk / Auto-Submitted mail. (Otherwise micro1's verification codes would page her.)
  2. Match the sender to HubSpot: exact CONTACT email first, then the COMPANY domain. Domain
     matching is off for free-mail and platform domains (gmail.com, linkedin.com, ashbyhq.com…) —
     there a domain says nothing about which company wrote.
  3. For every matched deal (any prefix, any stage): a NOTE on the deal saying who replied.
  4. Move to 💬 They replied ONLY a non-HIRING deal that is still open. HIRING stages belong to VJH
     (its judge learns from them); Won / No fit keep their history — she is still notified.
  5. One email to Elena per reply, with the deals linked. If no deal was moved, also a HIGH task
     LINKED to the deals (the Starter workflow's own task is created unlinked).

Idempotent: every processed Message-ID is stored in data/reply-radar-state.json. Live mode acts only
on mail dated after --init, so turning it on never floods her with history.
Standard library only.
"""
import argparse
import email
import hashlib
import html
import imaplib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from email.header import decode_header, make_header
from email.utils import getaddresses, parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE_PATH = ROOT / 'data' / 'reply-radar-state.json'
# One sender per line: an address, or @domain. Elena's switch for contacts she does not want paged on.
IGNORE_PATH = ROOT / 'data' / 'reply-radar-ignore.txt'
PORTAL = '51409153'
# Resend sits behind Cloudflare, which answers the default 'Python-urllib' agent with 403 / error 1010.
UA = 'aideazz-reply-radar/1.0 (+https://aideazz.xyz)'
DEAL_URL = 'https://app.hubspot.com/contacts/%s/record/0-3/%%s' % PORTAL

MAILBOXES = (
    {'name': 'zoho', 'host': 'imappro.zoho.com', 'user_env': 'ZOHO_EMAIL', 'pass_env': 'ZOHO_APP_PASSWORD',
     'folders': re.compile(r'^(inbox|notification|newsletter|spam)$', re.I)},
    {'name': 'gmail', 'host': 'imap.gmail.com', 'user_env': 'GMAIL_EMAIL', 'pass_env': 'GMAIL_APP_PASSWORD',
     'folders': re.compile(r'^(inbox|\[gmail\]/spam)$', re.I)},
)

OWN_DOMAINS = {'aideazz.xyz'}
FREE_MAIL = {
    'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.es', 'ymail.com', 'outlook.com', 'hotmail.com',
    'hotmail.es', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me',
    'protonmail.com', 'pm.me', 'mail.ru', 'bk.ru', 'inbox.ru', 'list.ru', 'yandex.ru', 'yandex.com', 'ya.ru',
    'gmx.com', 'gmx.de', 'zoho.com', 'zohomail.com', 'hey.com', 'qq.com', '163.com', 'tutanota.com',
}
# Mail from these comes on behalf of someone else — a domain match would be a false match.
PLATFORMS = {
    'linkedin.com', 'ashbyhq.com', 'greenhouse.io', 'lever.co', 'workablemail.com', 'workable.com',
    'indeed.com', 'upwork.com', 'wellfound.com', 'calendly.com', 'google.com', 'github.com', 'notion.so',
    'slack.com', 'zoom.us', 'hubspot.com', 'hubspotemail.net', 'resend.dev', 'stripe.com', 'paypal.com',
    'teamtailor.com', 'teamtailor-mail.com', 'recruitee.com', 'smartrecruiters.com', 'deel.com',
    'torre.ai', 'getonbrd.com', 'breezy-mail.com', 'karmacheck.com',
}
AUTO_LOCAL = re.compile(
    r'(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounce|^notifications?$|^notify$'
    r'|^newsletters?$|^digest$|^alerts?$|^automated$|^system$|^updates?$|^news$|^marketing$)', re.I)
SECOND_LEVEL = {'co', 'com', 'org', 'net', 'gov', 'ac', 'edu', 'gob'}
# Role mailboxes send reminders and digests with no bulk header (the 60-day dry run: torre.ai 159,
# micro1 support 25, niuro recruitment 20). From these, only a REAL REPLY counts.
ROLE_LOCAL = re.compile(r'^(support|help|team|contact|hello|info|recruit\w*|careers?|jobs?|talent|hr|people'
                        r'|receipts?|billing|accounting|payroll|platform|admin|sales|community|service'
                        r'|accounts?|atrium|admisiones|admissions|office|enquiries|inquiries|candidate-\w+)$', re.I)
REPLY_SUBJECT = re.compile(r'^\s*(re|aw|sv|antw|resp|rv|fw|fwd|tr)\s*:', re.I)


# ─── env ──────────────────────────────────────────────────────────────────────
def load_env():
    files = [ROOT / '.env', ROOT.parent / 'VibeJobHunterAIPA_AIMCF' / '.env']
    for f in files:
        try:
            for line in f.read_text(encoding='utf-8', errors='replace').splitlines():
                m = re.match(r'^([A-Z0-9_]+)=(.*)$', line.strip())
                if m and not os.environ.get(m.group(1)):
                    os.environ[m.group(1)] = m.group(2).strip().strip('"').strip("'")
        except FileNotFoundError:
            pass


def env(name, default=''):
    return (os.environ.get(name) or default).strip()


# ─── HubSpot ──────────────────────────────────────────────────────────────────
def hs(method, path, body=None):
    for attempt in range(6):
        req = urllib.request.Request(
            'https://api.hubapi.com' + path, method=method,
            data=json.dumps(body).encode() if body is not None else None,
            headers={'Authorization': 'Bearer ' + env('HUBSPOT_API_KEY'), 'Content-Type': 'application/json',
                     'User-Agent': UA})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = r.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 5:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise RuntimeError('%s %s -> %s %s' % (method, path.split('?')[0], e.code, e.read()[:160]))


def assoc(obj, oid, to):
    return [str(r['toObjectId']) for r in hs('GET', '/crm/v4/objects/%s/%s/associations/%s?limit=100' % (obj, oid, to)).get('results', [])]


def search_one(obj, prop, value):
    j = hs('POST', '/crm/v3/objects/%s/search' % obj, {
        'filterGroups': [{'filters': [{'propertyName': prop, 'operator': 'EQ', 'value': value}]}],
        'properties': [prop], 'limit': 10})
    return [r['id'] for r in j.get('results', [])]


def registrable(domain):
    parts = domain.split('.')
    if len(parts) >= 3 and parts[-2] in SECOND_LEVEL:
        return '.'.join(parts[-3:])
    return '.'.join(parts[-2:])


_cache = {}


def match_sender(addr):
    """-> (deal_ids, how) for one sender address."""
    if addr in _cache:
        return _cache[addr]
    deals, how = [], ''
    contacts = search_one('contacts', 'email', addr)
    for c in contacts:
        deals += assoc('contacts', c, 'deals')
        if not deals:  # a contact with no deal of its own can still belong to a company that has one
            for co in assoc('contacts', c, 'companies'):
                deals += assoc('companies', co, 'deals')
    if deals:
        how = 'contact email %s' % addr
    else:
        domain = addr.split('@')[-1]
        root = registrable(domain)
        if root not in FREE_MAIL and root not in PLATFORMS and domain not in FREE_MAIL:
            for d in dict.fromkeys([domain, root, 'www.' + root]):
                for co in search_one('companies', 'domain', d):
                    deals += assoc('companies', co, 'deals')
                if deals:
                    how = 'company domain %s' % d
                    break
    result = (list(dict.fromkeys(deals)), how)
    _cache[addr] = result
    return result


# ─── mail ─────────────────────────────────────────────────────────────────────
def dh(v):
    try:
        return str(make_header(decode_header(v or '')))
    except Exception:
        return v or ''


def is_true_reply(msg):
    return bool(msg.get('In-Reply-To') or REPLY_SUBJECT.match(dh(msg.get('Subject', ''))))


def is_platform_notice(msg, addr):
    """A role mailbox, a random +tag or a sending subdomain — a person only if it is a real reply."""
    local, domain = addr.split('@')[0], addr.split('@')[-1]
    base, _, tag = local.partition('+')
    randomish_tag = bool(tag) and len(tag) >= 8 and bool(re.search(r'\d', tag))
    subdomain = domain != registrable(domain)
    platform = registrable(domain) in PLATFORMS
    if (ROLE_LOCAL.match(base) or randomish_tag or subdomain or platform) and not is_true_reply(msg):
        return True
    return False


def is_automated(msg, addr):
    local = addr.split('@')[0]
    if AUTO_LOCAL.search(local):
        return 'automated sender'
    if msg.get('List-Unsubscribe') or msg.get('List-Id'):
        return 'mailing list'
    if (msg.get('Precedence') or '').lower().strip() in ('bulk', 'list', 'junk'):
        return 'bulk'
    auto = (msg.get('Auto-Submitted') or '').lower().strip()
    if auto and auto != 'no':
        return 'auto-submitted'
    if msg.get('X-Autoreply') or msg.get('X-Autorespond'):
        return 'auto-reply'
    return ''


def snippet(conn, num):
    typ, data = conn.fetch(num, '(BODY.PEEK[])')
    if typ != 'OK' or not data or not isinstance(data[0], tuple):
        return ''
    m = email.message_from_bytes(data[0][1])
    text, htm = '', ''
    for part in m.walk():
        ct = part.get_content_type()
        if part.get_content_maintype() == 'multipart' or part.get('Content-Disposition', '').startswith('attachment'):
            continue
        try:
            payload = part.get_payload(decode=True).decode(part.get_content_charset() or 'utf-8', 'replace')
        except Exception:
            continue
        if ct == 'text/plain' and not text:
            text = payload
        elif ct == 'text/html' and not htm:
            htm = re.sub(r'(?is)<(script|style).*?</\1>', ' ', payload)
            htm = html.unescape(re.sub(r'<[^>]+>', ' ', htm))
    body = text or htm
    # drop the quoted thread so the snippet is what THEY wrote
    body = re.split(r'\n\s*(On .{5,80} wrote:|El .{5,80} escribió:|-{2,}\s*Original Message|>)', body, maxsplit=1)[0]
    return re.sub(r'\s+', ' ', body).strip()[:400]


def list_folders(conn, rx):
    typ, boxes = conn.list()
    out = []
    for b in boxes or []:
        s = b.decode(errors='replace')
        m = re.search(r'"([^"]*)"\s*$', s) or re.search(r'\s(\S+)\s*$', s)
        if m and rx.match(m.group(1)):
            out.append(m.group(1))
    return out


# ─── actions ──────────────────────────────────────────────────────────────────
def stage_map():
    stages = hs('GET', '/crm/v3/pipelines/deals')['results'][0]['stages']
    m = {'replied': None, 'terminal': set(), 'labels': {}}
    for s in stages:
        m['labels'][s['id']] = s['label']
        if re.search(r'They replied', s['label'], re.I):
            m['replied'] = s['id']
        elif re.search(r'Won|No fit', s['label'], re.I):
            m['terminal'].add(s['id'])
    return m


def send_email(subject, html_body, text_body):
    key = env('RESEND_API_KEY')
    if not key:
        raise RuntimeError('RESEND_API_KEY missing')
    req = urllib.request.Request('https://api.resend.com/emails', method='POST', data=json.dumps({
        'from': 'Reply Radar <aipa@aideazz.xyz>', 'to': [env('REPLY_RADAR_TO', 'aipa@aideazz.xyz')],
        'subject': subject, 'html': html_body, 'text': text_body}).encode(),
        headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read()).get('id')
    except urllib.error.HTTPError as e:
        raise RuntimeError('Resend -> %s %s' % (e.code, e.read()[:160]))


def act(hit, stages, owner):
    deals = hs('POST', '/crm/v3/objects/deals/batch/read', {
        'properties': ['dealname', 'dealstage'], 'inputs': [{'id': d} for d in hit['deals'][:10]]}).get('results', [])
    # A retry after a partial failure must not write the note twice: look for this reply's note first.
    noted = set()
    for d in deals[:5]:
        nids = assoc('deals', d['id'], 'notes')
        if nids:
            got = hs('POST', '/crm/v3/objects/notes/batch/read', {'properties': ['hs_note_body'], 'inputs': [{'id': n} for n in nids[-50:]]})
            for n in got.get('results', []):
                b = n['properties'].get('hs_note_body') or ''
                if 'Reply received' in b and html.escape(hit['addr']) in b and html.escape(hit['subject'][:40]) in b:
                    noted.add(d['id'])
    moved = []
    for d in deals:
        name, st = d['properties'].get('dealname') or '', d['properties'].get('dealstage')
        if (not name.startswith('[HIRING') and st != stages['replied'] and st not in stages['terminal']
                and len(moved) < 3):
            hs('PATCH', '/crm/v3/objects/deals/%s' % d['id'], {'properties': {'dealstage': stages['replied']}})
            moved.append(d['id'])
        elif d['id'] in noted and st == stages['replied'] and not name.startswith('[HIRING'):
            moved.append(d['id'])  # moved by an earlier, partially failed run — the HubSpot workflow already made its task
    e = html.escape
    note = ('<p><strong>📩 Reply received</strong> — %s &lt;%s&gt;</p><p>Subject: %s<br>Date: %s · %s/%s<br>'
            'Matched by: %s</p><p><em>%s</em></p>') % (
        e(hit['name']), e(hit['addr']), e(hit['subject']), e(hit['date']), e(hit['mailbox']), e(hit['folder']),
        e(hit['how']), e(hit['snippet']))
    for d in deals[:5]:
        if d['id'] in noted:
            continue
        hs('POST', '/crm/v3/objects/notes', {
            'properties': {'hs_note_body': note, 'hs_timestamp': datetime.now(timezone.utc).isoformat(), 'hubspot_owner_id': owner},
            'associations': [{'to': {'id': d['id']}, 'types': [{'associationCategory': 'HUBSPOT_DEFINED', 'associationTypeId': 214}]}]})
    if not moved:
        hs('POST', '/crm/v3/objects/tasks', {
            'properties': {'hs_task_subject': ('📩 Reply from %s: %s' % (hit['name'] or hit['addr'], hit['subject']))[:250],
                           'hs_task_body': 'Answer today. %s\n\n%s' % (hit['addr'], hit['snippet']),
                           'hs_timestamp': datetime.now(timezone.utc).isoformat(), 'hs_task_priority': 'HIGH',
                           'hs_task_status': 'NOT_STARTED', 'hubspot_owner_id': owner},
            'associations': [{'to': {'id': d['id']}, 'types': [{'associationCategory': 'HUBSPOT_DEFINED', 'associationTypeId': 216}]}
                             for d in deals[:5]]})
    rows = ''.join('<li><a href="%s">%s</a> — %s%s</li>' % (
        DEAL_URL % d['id'], e(d['properties'].get('dealname') or d['id']), e(stages['labels'].get(d['properties'].get('dealstage'), '')),
        ' → <strong>moved to 💬 They replied</strong>' if d['id'] in moved else '') for d in deals)
    body = ('<h2>📩 %s replied</h2><p><strong>From:</strong> %s &lt;%s&gt;<br><strong>Subject:</strong> %s<br>'
            '<strong>Date:</strong> %s · %s/%s<br><strong>Matched by:</strong> %s</p><blockquote>%s</blockquote>'
            '<p><strong>Deals:</strong></p><ul>%s</ul><p>Answer today.%s</p>') % (
        e(hit['name'] or hit['addr']), e(hit['name']), e(hit['addr']), e(hit['subject']), e(hit['date']), e(hit['mailbox']),
        e(hit['folder']), e(hit['how']), e(hit['snippet']), rows, '' if moved else ' A HIGH task is on the deal.')
    text = '%s <%s> replied: %s\n%s\nDeals: %s' % (hit['name'], hit['addr'], hit['subject'], hit['snippet'],
                                                  ', '.join(DEAL_URL % d['id'] for d in deals))
    send_email(('📩 Reply from %s — %s' % (hit['name'] or hit['addr'], hit['subject']))[:180], body, text)
    return moved


# ─── main ─────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true', help='write to HubSpot and send the email')
    ap.add_argument('--init', action='store_true', help='start the live clock: later runs act only on newer mail')
    ap.add_argument('--since-days', type=int, default=3)
    ap.add_argument('--report', help='write matches as JSON (dry run)')
    ap.add_argument('--only', help='act on mail from this one sender only, ignoring the live clock (a controlled test)')
    a = ap.parse_args()
    load_env()

    state = json.loads(STATE_PATH.read_text()) if STATE_PATH.exists() else {}
    if a.init:
        STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        state = {'started_at': datetime.now(timezone.utc).isoformat(), 'processed': state.get('processed', [])}
        STATE_PATH.write_text(json.dumps(state))
        print('live clock started at', state['started_at'])
        return
    if a.apply and 'started_at' not in state:
        sys.exit('run --init first, so turning it on does not alert for the whole mailbox history')
    started = datetime.fromisoformat(state['started_at']) if a.apply else None
    processed = set(state.get('processed', []))
    try:
        ignore = {l.strip().lower() for l in IGNORE_PATH.read_text().splitlines() if l.strip() and not l.startswith('#')}
    except FileNotFoundError:
        ignore = set()
    only = (a.only or '').lower().strip()
    own = {env('ZOHO_EMAIL', 'aipa@aideazz.xyz').lower(), env('GMAIL_EMAIL').lower()} - {''}
    stages = stage_map() if a.apply else None
    owner = env('HUBSPOT_OWNER_ID', '91612860')
    since = (datetime.now() - timedelta(days=a.since_days)).strftime('%d-%b-%Y')

    seen = skipped_auto = unmatched = 0
    hits, errors = [], 0
    for mb in MAILBOXES:
        user, pwd = env(mb['user_env']), env(mb['pass_env'])
        if not user or not pwd:
            print('  · %s not configured — skipped' % mb['name'])
            continue
        try:
            conn = imaplib.IMAP4_SSL(mb['host'], 993)
            conn.login(user, pwd)
        except Exception as ex:
            print('  ✖ %s login failed: %s' % (mb['name'], ex))
            errors += 1
            continue
        for folder in list_folders(conn, mb['folders']):
            if conn.select('"%s"' % folder, readonly=True)[0] != 'OK':
                continue
            typ, data = conn.search(None, 'SINCE', since)
            nums = data[0].split() if typ == 'OK' and data and data[0] else []
            for i in range(0, len(nums), 200):
                chunk = b','.join(nums[i:i + 200])
                typ, rows = conn.fetch(chunk, '(BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID LIST-UNSUBSCRIBE '
                                              'LIST-ID PRECEDENCE AUTO-SUBMITTED X-AUTOREPLY X-AUTORESPOND IN-REPLY-TO)])')
                for row in rows or []:
                    if not isinstance(row, tuple):
                        continue
                    num = row[0].split()[0]
                    msg = email.message_from_bytes(row[1])
                    seen += 1
                    frm = getaddresses([msg.get('From', '')])
                    if not frm or '@' not in frm[0][1]:
                        continue
                    name, addr = dh(frm[0][0]), frm[0][1].lower().strip()
                    subj = dh(msg.get('Subject', ''))
                    mid = (msg.get('Message-ID') or '').strip() or hashlib.sha1(
                        ('%s|%s|%s' % (addr, msg.get('Date'), subj)).encode()).hexdigest()
                    if only and addr != only:
                        continue
                    if mid in processed and not only:
                        continue
                    if addr in ignore or '@' + addr.split('@')[-1] in ignore:
                        processed.add(mid)
                        continue
                    try:
                        when = parsedate_to_datetime(msg.get('Date'))
                        if when.tzinfo is None:
                            when = when.replace(tzinfo=timezone.utc)
                    except Exception:
                        when = None
                    if a.apply and not only and (when is None or when < started):
                        processed.add(mid)
                        continue
                    if (addr in own or addr.split('@')[-1] in OWN_DOMAINS or is_automated(msg, addr)
                            or is_platform_notice(msg, addr)):
                        skipped_auto += 1
                        processed.add(mid)
                        continue
                    try:
                        deals, how = match_sender(addr)
                    except Exception as ex:
                        print('  ✖ HubSpot lookup failed for %s: %s' % (addr, ex))
                        errors += 1
                        continue  # NOT marked processed: retried next run
                    if not deals:
                        unmatched += 1
                        processed.add(mid)
                        continue
                    hit = {'mailbox': mb['name'], 'folder': folder, 'name': name, 'addr': addr, 'subject': subj,
                           'date': when.isoformat() if when else msg.get('Date', ''), 'how': how, 'deals': deals,
                           'snippet': snippet(conn, num)}
                    hits.append(hit)
                    if a.apply:
                        try:
                            hit['moved'] = act(hit, stages, owner)
                            processed.add(mid)
                        except Exception as ex:
                            print('  ✖ action failed for %s: %s' % (addr, ex))
                            errors += 1
                    else:
                        processed.add(mid)
        conn.logout()

    for h in hits:
        print('  📩 %s  %-38s %-40s → %d deal(s) via %s%s' % (
            h['date'][:16], h['addr'][:38], h['subject'][:40], len(h['deals']), h['how'],
            ('  moved %s' % h['moved']) if h.get('moved') else ''))
    print('%s — scanned %d · automated/own skipped %d · no CRM match %d · REPLIES MATCHED %d · errors %d'
          % ('APPLY' if a.apply else 'DRY RUN', seen, skipped_auto, unmatched, len(hits), errors))
    if a.report:
        Path(a.report).write_text(json.dumps(hits, indent=1, ensure_ascii=False))
    if a.apply:
        state['processed'] = list(processed)[-20000:]
        STATE_PATH.write_text(json.dumps(state))
    if errors:
        sys.exit(1)


if __name__ == '__main__':
    main()
