#!/usr/bin/env python3
r"""Remove Gmail's \Important label from INBOX mail since 23 Aug 2026 -- the period the VJH detector opened
every mail (fetch RFC822) and Gmail learned "she opens everything". Dry run by default; --apply writes a backup of
X-GM-MSGIDs to ~/backups first. Never touches \Seen. Run on Oracle (reads the VJH .env). 27 Oct 2026."""
import imaplib, re, sys, os
APPLY = '--apply' in sys.argv
env={}
for l in open('/home/ubuntu/VibeJobHunterAIPA_AIMCF/.env',errors='ignore'):
    m=re.match(r'\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$',l)
    if m: env[m.group(1)]=m.group(2).strip().strip('"').strip("'")
c=imaplib.IMAP4_SSL('imap.gmail.com',993,timeout=120); c.login(env['GMAIL_EMAIL'],env['GMAIL_APP_PASSWORD'])
c.select('INBOX', readonly=not APPLY)
t,d=c.uid('SEARCH','SINCE','23-Aug-2026'); uids=d[0].split()
hit=[]  # (uid, gm_msgid)
for i in range(0,len(uids),300):
    t,r=c.uid('FETCH',b','.join(uids[i:i+300]),'(X-GM-LABELS X-GM-MSGID)')
    for x in r:
        s=(x if isinstance(x,bytes) else (x[0] if isinstance(x,tuple) else b'')).decode(errors='ignore')
        if r'\Important' in s:
            u=re.search(r'UID (\d+)',s); g=re.search(r'X-GM-MSGID (\d+)',s)
            if u and g: hit.append((u.group(1),g.group(1)))
print('inbox since 23 Aug:',len(uids),'with Important:',len(hit))
if APPLY:
    os.makedirs('/home/ubuntu/backups',exist_ok=True)
    bk='/home/ubuntu/backups/gmail-important-removed-20261027.txt'
    with open(bk,'w') as f:
        f.write(r'# X-GM-MSGIDs whose \Important label was removed 27 Oct 2026 (bot-trained period). Undo: STORE +X-GM-LABELS (\Important) on these.\n')
        for u,g in hit: f.write(g+'\n')
    print('backup:',bk,len(hit))
    for i in range(0,len(hit),200):
        typ,_=c.uid('STORE',','.join(u for u,_ in hit[i:i+200]),'-X-GM-LABELS',r'(\Important)')
        assert typ=='OK', typ
    t,r=c.uid('FETCH',','.join(u for u,_ in hit[:50]) or '1','(X-GM-LABELS FLAGS)')
    left=sum(1 for x in r if r'\Important' in (x if isinstance(x,bytes) else (x[0] if isinstance(x,tuple) else b'')).decode(errors='ignore'))
    print('spot-check first 50 after: still Important =',left)
c.logout()
