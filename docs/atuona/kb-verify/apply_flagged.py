"""Apply the final check of flagged facts (7 Oct 2026). Exact-line match: a fact changes only if the knowledge base
holds current_text exactly once as a bullet; otherwise it is reported and skipped. Writes
docs/atuona/KB_FINAL_CHECK_2026-10-07.md. Usage: python docs/atuona/kb-verify/apply_flagged.py [--dry]"""
import json, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[3]
SRC = ROOT / 'src' / 'atuona-creative-ai.ts'
BS = chr(92)


def safe(t):
    return t.replace(BS, BS + BS).replace('`', "'").replace('${', '$ {').replace('\n', ' ').strip()


def main(dry):
    R = json.loads((ROOT / 'docs/atuona/kb-verify/FLAGGED.result.json').read_text(encoding='utf-8'))
    s = SRC.read_text(encoding='utf-8')
    counts, problems, rows = {}, [], []
    for r in R:
        st = r.get('status')
        if st not in {'CONFIRMED', 'TRIMMED', 'FIXED'} or not r.get('new_text'):
            problems.append(f"{r.get('id')}: incomplete"); continue
        cur, new = safe(r['current_text']), safe(r['new_text'])
        hits = len(re.findall(re.escape('- ' + cur + '\n'), s))
        if hits != 1:
            problems.append(f"{r['id']}: current text found {hits}x"); continue
        counts[st] = counts.get(st, 0) + 1
        if new != cur:
            s = s.replace('- ' + cur + '\n', '- ' + new + '\n', 1)
        rows.append(f"| {r['id']} | {st} | {cur.replace('|', '/')} | {new.replace('|', '/')} | "
                    f"[{(r.get('source_note') or 'source').replace('|', '/')}]({r.get('source_url', '')}) |")
    print('statuses:', counts, '| problems:', len(problems))
    for p in problems:
        print('  ', p)
    if dry or problems:
        return
    SRC.write_text(s, encoding='utf-8')
    md = ['# Atuona knowledge base — final check of flagged facts (7 Oct 2026)', '',
          'Facts earlier agents flagged (from memory, snippet-only, Wikipedia-only detail, or sources in conflict), re-checked',
          'against a page actually read. CONFIRMED kept; TRIMMED = unverifiable detail removed; FIXED = corrected.', '',
          '| id | status | before | after | source |', '|---|---|---|---|---|'] + rows
    (ROOT / 'docs/atuona/KB_FINAL_CHECK_2026-10-07.md').write_text('\n'.join(md) + '\n', encoding='utf-8')
    print('written: src + audit')


if __name__ == '__main__':
    main('--dry' in sys.argv)
