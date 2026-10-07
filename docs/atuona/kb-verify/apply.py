"""Apply verified knowledge-base facts back into src/atuona-creative-ai.ts (7 Oct 2026).

Each fact id (e.g. GAU-017) is positional: the Nth bullet (fact text >= 12 chars) of that lane's KNOWLEDGE_* string,
exactly as src/atuona-fact-engine.ts numbers them. Only the fact text after the bullet marker is replaced; headers,
order and every other line stay untouched. Writes an audit table to docs/atuona/KB_VERIFICATION_2026-10-07.md.

Usage: python docs/atuona/kb-verify/apply.py [--dry]
"""
import json, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[3]
SRC = ROOT / 'src' / 'atuona-creative-ai.ts'
KV = ROOT / 'docs' / 'atuona' / 'kb-verify'
ALL_LANES = {'ATU': 'KNOWLEDGE_ATUONA', 'GAU': 'KNOWLEDGE_GAUGUIN', 'ART': 'KNOWLEDGE_ART_HISTORY',
             'MOD': 'KNOWLEDGE_MODERN_ART', 'AUC': 'KNOWLEDGE_AUCTION_HOUSES', 'FAS': 'KNOWLEDGE_FASHION',
             'VIB': 'KNOWLEDGE_VIBE_CODING', 'NFT': 'KNOWLEDGE_VIBE_NFT_ART_FUSION', 'ATL': 'KNOWLEDGE_ATLAS_SHRUGGED',
             'AGT': 'KNOWLEDGE_AI_AGENTIC'}
ARG = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--lanes=')), 'ATU,GAU,ART,MOD,AUC')
LANES = {k: ALL_LANES[k] for k in ARG.split(',')}
AUDIT = ROOT / 'docs' / 'atuona' / next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--audit=')),
                                        'KB_VERIFICATION_2026-10-07.md')
VERDICTS = {'VERIFIED', 'CORRECTED', 'GENERIC_REPLACED', 'UNVERIFIABLE_REPLACED', 'NOVEL_CANON', 'AUTHOR_CANON'}
CANON = {'NOVEL_CANON', 'AUTHOR_CANON'}
BULLET = re.compile(r'^(\s*(?:[-•*]|\d+\.)\s+)(.*)$')


def load_results(lane):
    out = {}
    for f in sorted(KV.glob('*.result*.json')):
        for r in json.loads(f.read_text(encoding='utf-8')):
            if r['id'].startswith(lane + '-'):
                out[r['id']] = r
    return out


def safe(t):  # must live inside a JS template literal
    return t.replace('\\', '\\\\').replace('`', "'").replace('${', '$ {').replace('\n', ' ').strip()


def main(dry):
    s = SRC.read_text(encoding='utf-8')
    audit, problems = [], []
    for lane, const in LANES.items():
        res = load_results(lane)
        expected = json.loads((KV / f'{lane}.json').read_text(encoding='utf-8'))
        missing = [e['id'] for e in expected if e['id'] not in res]
        if missing:
            problems.append(f'{lane}: missing results for {missing}')
            continue
        start = s.index(f'const {const} = `') + len(f'const {const} = `')
        end = s.index('`;', start)
        lines = s[start:end].split('\n')
        n = 0
        for i, line in enumerate(lines):
            m = BULLET.match(line)
            if not m or len(m.group(2).strip()) < 12:
                continue
            n += 1
            fid = f'{lane}-{n:03d}'
            r = res.get(fid)
            if not r:
                problems.append(f'{fid}: no result'); continue
            if r.get('verdict') not in VERDICTS or not r.get('final_text') or (not r.get('source_url') and r['verdict'] not in CANON):
                problems.append(f'{fid}: incomplete result {r.get("verdict")}'); continue
            # the result must describe the same line we are about to replace
            orig_body = m.group(2).strip()
            if orig_body[:40] not in r.get('original', ''):
                problems.append(f'{fid}: original mismatch'); continue
            final = orig_body if r['verdict'] in CANON else safe(r['final_text'])  # her own words stay byte-for-byte
            lines[i] = m.group(1) + final
            audit.append((fid, r['verdict'], orig_body, final, r['source_url'], r.get('source_note', '')))
        if n != len(expected):
            problems.append(f'{lane}: counted {n} bullets, expected {len(expected)}')
        s = s[:start] + '\n'.join(lines) + s[end:]
    if problems:
        print('PROBLEMS — nothing written:'); print('\n'.join(problems)); sys.exit(1)
    counts = {}
    for a in audit:
        counts[a[1]] = counts.get(a[1], 0) + 1
    print('verdicts:', counts, '| total', len(audit))
    if dry:
        return
    SRC.write_text(s, encoding='utf-8')
    md = ['# Atuona knowledge base — art lanes verified against sources (7 Oct 2026)', '',
          'Each fact was checked against a public source. Verdicts: VERIFIED (kept), CORRECTED (fixed to the source),',
          'GENERIC_REPLACED (true but guidebook-level → replaced by a rare sourced fact on the same subject),',
          'UNVERIFIABLE_REPLACED (no source → replaced), NOVEL_CANON / AUTHOR_CANON (the novel own fiction or the author own ideas, kept as written). Applied in place in `src/atuona-creative-ai.ts`.', '',
          'Counts: ' + ', '.join(f'{k} {v}' for k, v in sorted(counts.items())), '',
          '| id | verdict | before | after | source |', '|---|---|---|---|---|']
    for fid, v, o, f, u, note in audit:
        esc = lambda t: t.replace('|', '/')
        md.append(f'| {fid} | {v} | {esc(o)} | {esc(f)} | ' + (f'[{esc(note) or "source"}]({u})' if u else esc(note)) + ' |')
    AUDIT.write_text('\n'.join(md) + '\n', encoding='utf-8')
    print('written: src + audit')


if __name__ == '__main__':
    main('--dry' in sys.argv)
