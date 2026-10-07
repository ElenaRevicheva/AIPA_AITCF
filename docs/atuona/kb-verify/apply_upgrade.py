"""Apply source upgrades for art facts that were Wikipedia-only (7 Oct 2026).

Input: WIKI.upgrade.part*.json  [{id, current_text, status, new_text, source_url, source_note}].
A fact line is changed ONLY if the knowledge base still contains current_text exactly as the bullet text of the
fact with that id; otherwise the upgrade is skipped and reported. The source is recorded in the art audit table
(docs/atuona/KB_VERIFICATION_2026-10-07.md) by updating that fact's row.

Usage: python docs/atuona/kb-verify/apply_upgrade.py [--dry]
"""
import json, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[3]
SRC = ROOT / 'src' / 'atuona-creative-ai.ts'
KV = ROOT / 'docs' / 'atuona' / 'kb-verify'
AUDIT = ROOT / 'docs' / 'atuona' / 'KB_VERIFICATION_2026-10-07.md'
STATUSES = {'UPGRADED', 'UPGRADED_CORRECTED', 'WIKIPEDIA_ONLY'}


def safe(t):
    return t.replace('\\', '\\\\').replace('`', "'").replace('${', '$ {').replace('\n', ' ').strip()


def main(dry):
    ups = []
    for f in sorted(KV.glob('WIKI.upgrade.part*.json')):
        ups += json.loads(f.read_text(encoding='utf-8'))
    s = SRC.read_text(encoding='utf-8')
    audit = AUDIT.read_text(encoding='utf-8').split('\n')
    counts, problems = {}, []
    for u in ups:
        st = u.get('status')
        if st not in STATUSES or not u.get('new_text') or not u.get('source_url'):
            problems.append(f"{u.get('id')}: incomplete"); continue
        counts[st] = counts.get(st, 0) + 1
        cur = safe(u['current_text'])
        hits = [m.start() for m in re.finditer(re.escape('- ' + cur + '\n'), s)]
        if len(hits) != 1:
            problems.append(f"{u['id']}: current text found {len(hits)}x in the KB — skipped"); continue
        new = safe(u['new_text'])
        if st == 'UPGRADED_CORRECTED' and new != cur:
            s = s.replace('- ' + cur + '\n', '- ' + new + '\n', 1)
        if st != 'WIKIPEDIA_ONLY':
            for i, row in enumerate(audit):
                if row.startswith(f"| {u['id']} |"):
                    cells = row.split(' | ')
                    note = (u.get('source_note') or 'source').replace('|', '/')
                    cells[3] = new.replace('|', '/')
                    cells[4] = f"[{note}]({u['source_url']}) — upgraded from Wikipedia |"
                    audit[i] = ' | '.join(cells[:5])
    print('statuses:', counts, '| problems:', len(problems))
    for p in problems:
        print('  ', p)
    if dry:
        return
    SRC.write_text(s, encoding='utf-8')
    AUDIT.write_text('\n'.join(audit), encoding='utf-8')
    print('written: src + audit')


if __name__ == '__main__':
    main('--dry' in sys.argv)
