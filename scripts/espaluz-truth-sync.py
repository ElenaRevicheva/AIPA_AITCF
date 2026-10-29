#!/usr/bin/env python3
"""
EspaLuz single source of truth — one verified row per real person, in espaluz_unified.

29 Oct 2026, Elena: "make this unified layer the one source of truth … without wiping or
overwriting … each user on free trial or converted to payments should be ironclad, verified —
a true user, not duplicated, not a dead skeleton from the past."

READS (never writes) every store that exists today:
  espaluz_unified : users, whatsapp_users, user_trials, subscribers
  espaluz_telegram: telegram_users, telegram_trials, telegram_subscriptions   (legacy)
  espaluz_whatsapp: whatsapp_users, user_trials, subscribers                   (legacy)
  bot JSON files  : trials + subscribers of both bots, paguelofacil_payments.json
VERIFIES with the payment providers themselves:
  PayPal     : GET /v1/billing/subscriptions/{id} (live API, read only)
  PagueloFácil: the operation code (CodOper) PagueloFácil returned for the payment; sandbox
                orders and manual grants are labelled, never counted as paid
WRITES only its own two tables in espaluz_unified:
  truth_people (rebuilt each run — a computed view, nothing else depends on it)
  truth_runs   (append-only: one line per run, so a stale or failing sync is visible)

Run on Oracle with a bot venv (psycopg2):
  ~/EspaLuzWhatsApp/venv/bin/python ~/cto-aipa/scripts/espaluz-truth-sync.py [--dry-run]
"""
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

import psycopg2
import psycopg2.extras
import requests
from dotenv import dotenv_values

HOME = os.path.expanduser('~')
WA_ENV = dotenv_values(f'{HOME}/EspaLuzWhatsApp/.env')
FB_ENV = dotenv_values(f'{HOME}/EspaLuzFamilybot/.env')
CTO_ENV = dotenv_values(f'{HOME}/cto-aipa/.env')
DRY = '--dry-run' in sys.argv
NOW = datetime.now(timezone.utc)
ALIVE_DAYS = 30

DB = {
    'unified': WA_ENV.get('DATABASE_URL_UNIFIED') or FB_ENV.get('DATABASE_URL_UNIFIED'),
    'telegram': FB_ENV.get('DATABASE_URL'),
    'whatsapp': WA_ENV.get('DATABASE_URL'),
}
JSON_FILES = {
    'fb:telegram_trials.json': f'{HOME}/EspaLuzFamilybot/telegram_trials.json',
    'fb:user_trials.json': f'{HOME}/EspaLuzFamilybot/user_trials.json',
    'wa:user_trials.json': f'{HOME}/EspaLuzWhatsApp/user_trials.json',
    'wa:subscribers.json': f'{HOME}/EspaLuzWhatsApp/subscribers.json',
    'fb:telegram_subscribers.json': f'{HOME}/EspaLuzFamilybot/telegram_subscribers.json',
    'fb:subscribers.json': f'{HOME}/EspaLuzFamilybot/subscribers.json',
}
PF_FILE = WA_ENV.get('PAGUELOFACIL_PAYMENTS_FILE') or f'{HOME}/EspaLuzFamilybot/paguelofacil_payments.json'

# Owner / test identities — labelled internal, never counted as users.
# Kept in Oracle's cto-aipa/.env, not here: this repo is public.
#   ESPALUZ_OWNER_EMAILS=a@x,b@y   ESPALUZ_OWNER_WA=<digits>[,<digits>]
_csv = lambda v: [x.strip() for x in (v or '').split(',') if x.strip()]
OWNER_EMAILS = {e.lower() for e in _csv(CTO_ENV.get('ESPALUZ_OWNER_EMAILS')) + [
    WA_ENV.get('ADMIN_TEST_EMAIL'), WA_ENV.get('ADMIN_CHECK_EMAIL_1'), WA_ENV.get('ADMIN_CHECK_EMAIL_2'),
] if e}
OWNER_TG = {re.sub(r'\D', '', CTO_ENV.get('TELEGRAM_DAILY_BLOG_NOTIFY_CHAT_ID') or '')} - {''}
OWNER_WA = {re.sub(r'\D', '', x) for x in _csv(CTO_ENV.get('ESPALUZ_OWNER_WA'))}

warnings = []


# ── identity ─────────────────────────────────────────────────────────────────
def key_wa(v):
    d = re.sub(r'\D', '', str(v or ''))
    return f'wa:{d}' if d else None


def key_tg(v):
    s = str(v or '').strip()
    d = re.sub(r'\D', '', s)
    return f'tg:{d}' if d and d == s.lstrip('-') else (f'tg?{s}' if s else None)


def key_em(v):
    s = str(v or '').strip().lower()
    return f'em:{s}' if '@' in s else None


def key_any(v, platform=None):
    s = str(v or '').strip()
    if not s:
        return None
    if '@' in s:
        return key_em(s)
    if platform == 'telegram':
        return key_tg(s)
    if platform == 'whatsapp' or s.startswith('+') or s.startswith('whatsapp:'):
        return key_wa(s)
    d = re.sub(r'\D', '', s)
    if d == s and 5 <= len(d) <= 10:   # Telegram ids are 5–10 digits; phones carry a country code
        return key_tg(s)
    return key_wa(s) if d else f'id?{s}'


def identity_issue(k):
    if k.startswith('wa:'):
        n = len(k) - 3
        return None if 10 <= n <= 15 else f'{n}-digit number is not a valid WhatsApp number'
    if k.startswith('tg:'):
        return None if 5 <= len(k) - 3 <= 12 else 'not a valid Telegram id'
    if k.startswith('em:'):
        return None
    return 'test or malformed id'


class People:
    """Union-find over identity keys: one person may have a phone, a Telegram id and an email."""

    def __init__(self):
        self.parent, self.facts = {}, {}

    def _find(self, k):
        self.parent.setdefault(k, k)
        while self.parent[k] != k:
            self.parent[k] = self.parent[self.parent[k]]
            k = self.parent[k]
        return k

    def link(self, *keys):
        keys = [k for k in keys if k]
        for k in keys:
            self._find(k)
        for a, b in zip(keys, keys[1:]):
            ra, rb = self._find(a), self._find(b)
            if ra != rb:
                self.parent[rb] = ra

    def add(self, k, source, **f):
        if not k:
            return
        self.link(k)
        self.facts.setdefault(k, []).append((source, f))

    def groups(self):
        g = {}
        for k in self.parent:
            g.setdefault(self._find(k), []).append(k)
        return g.values()


def ts(v):
    if v in (None, ''):
        return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    try:
        d = datetime.fromisoformat(str(v).replace('Z', '+00:00'))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def rows(conn_name, sql):
    url = DB.get(conn_name)
    if not url:
        warnings.append(f'{conn_name}: no database URL')
        return []
    try:
        with psycopg2.connect(url) as c, c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql)
            return cur.fetchall()
    except Exception as e:  # a missing source is a warning in truth_runs, never a silent zero
        warnings.append(f'{conn_name}: {str(e).splitlines()[0][:120]}')
        return []


def load_json(name, path):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception as e:
        warnings.append(f'{name}: {str(e)[:100]}')
        return {}


def paypal_ids(obj):
    """Every PayPal subscription id (I-XXXXXXXX) anywhere inside a record."""
    found = set()
    if isinstance(obj, dict):
        for v in obj.values():
            found |= paypal_ids(v)
    elif isinstance(obj, list):
        for v in obj:
            found |= paypal_ids(v)
    elif isinstance(obj, str) and re.fullmatch(r'I-[A-Z0-9]{8,}', obj.strip()):
        found.add(obj.strip())
    return found


# ── collect ──────────────────────────────────────────────────────────────────
P = People()
pp_ids = {}  # PayPal id -> identity keys that claim it

for r in rows('unified', 'select * from users'):
    keys = [key_tg(r['telegram_id']) if r.get('telegram_id') else None,
            key_wa(r['whatsapp_id']) if r.get('whatsapp_id') else None,
            key_em(r.get('email'))]
    P.link(*keys)
    main = next((k for k in keys if k), None)
    P.add(main, 'unified.users', name=r.get('display_name'), first_seen=ts(r.get('created_at')),
          last_active=max([d for d in (ts(r.get('last_active_telegram')), ts(r.get('last_active_whatsapp'))) if d], default=None),
          messages=r.get('total_messages'), platform=r.get('preferred_platform'))

for db in ('unified', 'whatsapp'):
    for r in rows(db, 'select user_id, first_seen, last_seen, total_messages from whatsapp_users'):
        P.add(key_wa(r['user_id']), f'{db}.whatsapp_users', first_seen=ts(r['first_seen']),
              last_active=ts(r['last_seen']), messages=r['total_messages'], platform='whatsapp')
    for r in rows(db, 'select user_id, trial_start, trial_end, status from user_trials'):
        P.add(key_any(r['user_id'], 'whatsapp'), f'{db}.user_trials', trial_start=ts(r['trial_start']),
              trial_end=ts(r['trial_end']), platform='whatsapp')
    for r in rows(db, 'select email, telegram_id, whatsapp_id, status, subscription_data from subscribers'):
        keys = [key_em(r['email']), key_tg(r['telegram_id']) if r.get('telegram_id') else None,
                key_wa(r['whatsapp_id']) if r.get('whatsapp_id') else None]
        P.link(*keys)
        for i in paypal_ids(r.get('subscription_data')):
            pp_ids.setdefault(i, set()).update(k for k in keys if k)
        P.add(next((k for k in keys if k), None), f'{db}.subscribers', claimed_status=r['status'])

for r in rows('telegram', 'select user_id, first_name, first_seen, last_active, total_messages from telegram_users'):
    P.add(key_tg(r['user_id']), 'telegram.telegram_users', name=r['first_name'], first_seen=ts(r['first_seen']),
          last_active=ts(r['last_active']), messages=r['total_messages'], platform='telegram')
for r in rows('telegram', 'select user_id, trial_start, trial_end from telegram_trials'):
    P.add(key_tg(r['user_id']), 'telegram.telegram_trials', trial_start=ts(r['trial_start']),
          trial_end=ts(r['trial_end']), platform='telegram')
for r in rows('telegram', 'select user_id, email, paypal_subscription_id, status from telegram_subscriptions'):
    keys = [key_tg(r['user_id']), key_em(r['email'])]
    P.link(*keys)
    if r.get('paypal_subscription_id'):
        pp_ids.setdefault(r['paypal_subscription_id'].strip(), set()).update(k for k in keys if k)
    P.add(next((k for k in keys if k), None), 'telegram.telegram_subscriptions', claimed_status=r['status'])

for name, path in JSON_FILES.items():
    data = load_json(name, path)
    items = data.items() if isinstance(data, dict) else enumerate(data)
    platform = 'telegram' if name.startswith('fb:') else 'whatsapp'
    for k, v in items:
        v = v if isinstance(v, dict) else {}
        if 'trials' in name:
            start = ts(v.get('trial_start') or v.get('start_date') or v.get('created_at'))
            end = ts(v.get('trial_end')) or (start + timedelta(days=int(v['trial_days'])) if start and v.get('trial_days') else None)
            P.add(key_any(v.get('user_id') or k, platform), name, trial_start=start, trial_end=end, platform=platform)
        else:
            keys = [key_any(k), key_tg(v['telegram_id']) if v.get('telegram_id') else None,
                    key_wa(v['whatsapp_id']) if v.get('whatsapp_id') else None]
            P.link(*keys)
            for i in paypal_ids(v):
                pp_ids.setdefault(i, set()).update(x for x in keys if x)
            P.add(next((x for x in keys if x), None), name, claimed_status=v.get('status'))

pf = load_json('paguelofacil_payments.json', PF_FILE)
pf_paid = {}  # identity key -> evidence
for uid, u in (pf.get('users') or {}).items():
    plat = u.get('platform') or ('telegram' if u.get('telegram_id') else None)
    keys = [key_any(u.get('telegram_id') or u.get('user_id') or uid, plat), key_em(u.get('email'))]
    P.link(*keys)
    k = next((x for x in keys if x), None)
    sandbox = any(o.get('sandbox') for o in (pf.get('orders') or {}).values()
                  if str(o.get('user_id') or o.get('telegram_id') or '') in (str(uid), str(u.get('telegram_id') or '')))
    src = str(u.get('source') or '')
    until = ts(u.get('paid_until'))
    if 'manual' in src.lower():
        pf_paid[k] = ('manual_grant', f'PagueloFácil manual grant until {until:%Y-%m-%d}' if until else 'manual grant')
    elif sandbox:
        pf_paid[k] = ('sandbox_test', 'PagueloFácil SANDBOX order — a test, not money')
    elif u.get('last_cod_oper'):
        state = 'paid_active' if until and until >= NOW else 'paid_expired'
        pf_paid[k] = (state, f'PagueloFácil CodOper {u["last_cod_oper"]} · ${u.get("last_amount")} · paid until {until:%Y-%m-%d}' if until else f'PagueloFácil CodOper {u["last_cod_oper"]}')
    else:
        pf_paid[k] = ('unverified_claim', 'PagueloFácil entry without an operation code')
    P.add(k, 'paguelofacil_payments.json')


# ── verify PayPal with PayPal ────────────────────────────────────────────────
def paypal_token():
    for env in (WA_ENV, FB_ENV):
        cid, sec = env.get('PAYPAL_CLIENT_ID'), env.get('PAYPAL_CLIENT_SECRET')
        if cid and sec:
            r = requests.post('https://api.paypal.com/v1/oauth2/token', auth=(cid, sec),
                              data={'grant_type': 'client_credentials'}, timeout=30)
            if r.ok:
                return r.json()['access_token']
            warnings.append(f'PayPal token {r.status_code}')
    return None


pp_verdict = {}  # identity key -> (state, evidence)
if pp_ids:
    tok = paypal_token()
    for sid, keys in pp_ids.items():
        if not tok:
            state, ev = 'unverified_claim', f'PayPal {sid}: could not reach PayPal'
        else:
            r = requests.get(f'https://api.paypal.com/v1/billing/subscriptions/{sid}',
                             headers={'Authorization': f'Bearer {tok}'}, timeout=30)
            if r.status_code == 404:
                state, ev = 'not_found', f'PayPal {sid}: PayPal has no such subscription'
            elif not r.ok:
                state, ev = 'unverified_claim', f'PayPal {sid}: HTTP {r.status_code}'
            else:
                j = r.json()
                last = (j.get('billing_info') or {}).get('last_payment') or {}
                payer = ((j.get('subscriber') or {}).get('email_address') or '').lower()
                if payer:
                    P.link(*(list(keys) + [key_em(payer)]))
                    keys = set(keys) | {key_em(payer)}
                paid = bool(last.get('time'))
                state = ('paid_active' if paid and j.get('status') == 'ACTIVE'
                         else 'paid_expired' if paid else 'never_charged')
                ev = (f'PayPal {sid}: {j.get("status")}'
                      + (f', last payment {last["time"][:10]} {last.get("amount", {}).get("value")} {last.get("amount", {}).get("currency_code")}' if paid else ', no payment ever collected'))
        for k in keys:
            pp_verdict[k] = (state, ev)


# ── merge into one row per person ────────────────────────────────────────────
RANK = {'paid_active': 5, 'paid_expired': 4, 'manual_grant': 3, 'sandbox_test': 2, 'never_charged': 2,
        'not_found': 1, 'unverified_claim': 1, 'not_paid': 0}
people = []
for keys in P.groups():
    keys = sorted(set(keys), key=lambda k: ('wa:', 'tg:', 'em:').index(k[:3]) if k[:3] in ('wa:', 'tg:', 'em:') else 9)
    facts = [f for k in keys for f in P.facts.get(k, [])]
    if not facts:
        continue
    get = lambda name: [f[name] for _, f in facts if f.get(name) is not None]
    first_seen = min(get('first_seen') + get('trial_start'), default=None)
    last_active = max(get('last_active'), default=None)
    trial_start, trial_end = min(get('trial_start'), default=None), max(get('trial_end'), default=None)
    pay = [v for k in keys for v in (pf_paid.get(k), pp_verdict.get(k)) if v]
    paid_state, paid_ev = max(pay, key=lambda p: RANK[p[0]]) if pay else ('not_paid', None)
    claims = [c for c in get('claimed_status') if str(c).lower() in ('active', 'paid', 'subscribed')]
    if paid_state == 'not_paid' and claims:
        paid_state, paid_ev = 'unverified_claim', 'a bot file says "active" but no PayPal id or PagueloFácil receipt backs it'
    issues = [i for i in (identity_issue(k) for k in keys) if i]
    real_ids = [k for k in keys if not identity_issue(k)]
    internal = None
    if any(k[3:] in OWNER_EMAILS for k in keys if k.startswith('em:')):
        internal = 'owner/admin email'
    elif any(k[3:] in OWNER_TG for k in keys if k.startswith('tg:')) or any(k[3:] in OWNER_WA for k in keys if k.startswith('wa:')):
        internal = 'owner phone / Telegram'
    elif not real_ids:
        internal = 'no valid id: ' + '; '.join(issues)
    elif all(k.endswith(('@example.com', '@test.com')) for k in real_ids if k.startswith('em:')) and all(k.startswith('em:') for k in real_ids):
        internal = 'test email'
    elif not (get('trial_start') or get('last_active') or any(str(m).isdigit() and int(m) > 0 for m in get('messages'))):
        internal = 'no usage on record (no trial, no message, no activity) — a leftover, not a user'
    people.append(dict(
        person_key=(real_ids or keys)[0],
        all_ids=keys,
        channels=sorted({p for p in get('platform') if p}),
        display_name=next(iter(get('name')), None),
        first_seen=first_seen, last_active=last_active,
        alive=bool(last_active and NOW - last_active <= timedelta(days=ALIVE_DAYS)),
        messages=max([int(m) for m in get('messages') if str(m).isdigit()], default=0),
        trial_start=trial_start, trial_end=trial_end,
        trial_state='active' if trial_end and trial_end >= NOW else 'expired' if trial_end else 'started' if trial_start else 'none',
        paid_state=paid_state, paid_evidence=paid_ev,
        counted=internal is None,
        internal_reason=internal,
        id_issues='; '.join(issues) or None,
        sources=sorted({s for s, _ in facts}),
    ))

real = [p for p in people if p['counted']]
summary = dict(
    people_total=len(people), real_people=len(real), excluded=len(people) - len(real),
    trials_ever=sum(1 for p in real if p['trial_start']), trials_active=sum(1 for p in real if p['trial_state'] == 'active'),
    alive_30d=sum(1 for p in real if p['alive']),
    paid_active=sum(1 for p in real if p['paid_state'] == 'paid_active'),
    paid_ever=sum(1 for p in real if p['paid_state'] in ('paid_active', 'paid_expired')),
    unverified_claims=sum(1 for p in real if p['paid_state'] == 'unverified_claim'),
    paypal_ids_checked=len(pp_ids),
)
summary['conversion_pct'] = round(100 * summary['paid_ever'] / summary['trials_ever'], 1) if summary['trials_ever'] else 0.0
print(json.dumps({**summary, 'warnings': warnings}, default=str))

if DRY:
    for p in sorted(people, key=lambda p: (not p['counted'], p['paid_state'] == 'not_paid', str(p['last_active']))):
        print(('REAL ' if p['counted'] else 'SKIP '), p['person_key'][:3], p['channels'], 'trial=' + p['trial_state'],
              'paid=' + p['paid_state'], 'alive' if p['alive'] else 'quiet', '|', p['internal_reason'] or '', p['id_issues'] or '',
              '|', len(p['sources']), 'sources')
    sys.exit(0)

with psycopg2.connect(DB['unified']) as c, c.cursor() as cur:
    cur.execute("""
      CREATE TABLE IF NOT EXISTS truth_people (
        person_key text PRIMARY KEY, all_ids text[], channels text[], display_name text,
        first_seen timestamptz, last_active timestamptz, alive boolean, messages int,
        trial_start timestamptz, trial_end timestamptz, trial_state text,
        paid_state text, paid_evidence text, counted boolean, internal_reason text, id_issues text,
        sources text[], checked_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS truth_runs (
        run_at timestamptz PRIMARY KEY DEFAULT now(), summary jsonb, warnings jsonb);
      COMMENT ON TABLE truth_people IS 'EspaLuz single source of truth (scripts/espaluz-truth-sync.py, hourly). Computed from every store; do not edit by hand.';
    """)
    cur.execute('DELETE FROM truth_people')
    for p in people:
        cur.execute("""INSERT INTO truth_people (person_key, all_ids, channels, display_name, first_seen, last_active,
                       alive, messages, trial_start, trial_end, trial_state, paid_state, paid_evidence, counted,
                       internal_reason, id_issues, sources) VALUES (%(person_key)s, %(all_ids)s, %(channels)s,
                       %(display_name)s, %(first_seen)s, %(last_active)s, %(alive)s, %(messages)s, %(trial_start)s,
                       %(trial_end)s, %(trial_state)s, %(paid_state)s, %(paid_evidence)s, %(counted)s,
                       %(internal_reason)s, %(id_issues)s, %(sources)s)""", p)
    cur.execute('INSERT INTO truth_runs (summary, warnings) VALUES (%s, %s)',
                (json.dumps(summary), json.dumps(warnings)))
print('written:', len(people), 'rows to truth_people')
sys.exit(2 if warnings else 0)
