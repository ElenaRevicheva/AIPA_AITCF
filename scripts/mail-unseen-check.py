#!/usr/bin/env python3
r"""READ-ONLY: UNSEEN counts per folder (Zoho aipa@ + Gmail, INBOX + Spam). Proof that no agent marks her mail read:
run before and after a VJH detector cycle; the numbers must not drop. Run on Oracle (reads the VJH .env). 27 Oct 2026."""
import imaplib, re
env={}
for l in open('/home/ubuntu/VibeJobHunterAIPA_AIMCF/.env',errors='ignore'):
    m=re.match(r'\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$',l)
    if m: env[m.group(1)]=m.group(2).strip().strip('"').strip("'")
out={}
for n,h,u,p,fs in [('zoho','imappro.zoho.com',env.get('ZOHO_EMAIL') or 'aipa@'+'aideazz.xyz',env['ZOHO_APP_PASSWORD'],['INBOX','Spam']),('gmail','imap.gmail.com',env['GMAIL_EMAIL'],env['GMAIL_APP_PASSWORD'],['INBOX','[Gmail]/Spam'])]:
    c=imaplib.IMAP4_SSL(h,993,timeout=60); c.login(u,p)
    for f in fs:
        c.select('"%s"'%f,readonly=True); t,d=c.search(None,'UNSEEN'); t2,d2=c.search(None,'SINCE',__import__('datetime').date.today().strftime('%d-%b-%Y')); t3,d3=c.search(None,'SINCE',__import__('datetime').date.today().strftime('%d-%b-%Y'),'UNSEEN')
        out[n+'/'+f]=(len(d[0].split()), len(d2[0].split()), len(d3[0].split()))
    c.logout()
import datetime; print(datetime.datetime.utcnow().strftime('%H:%M'), 'unseen_total, today_total, today_unseen:', out)
