"""Add a newly published film to atuona.xyz's static film lists (llms.txt, JSON-LD ItemList, <noscript>).

Usage: python scripts/atuona-add-film-to-site.py <atuona-repo> <published-file.mp4> <YYYY-MM-DD> "<Title>"
Additive: one new entry at the top of each list, "six" -> "seven" in the counts. Nothing else is rewritten.
Line endings are preserved byte-for-byte (files are read and written with newline='').
"""
import json, re, sys, html
from pathlib import Path

repo, fname, date, title = Path(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4]
url = f"https://webhook.aideazz.xyz/cto/films/{fname}"
OLD_N, NEW_N = 6, 7

def rd(p): return (repo / p).open(encoding="utf-8", newline="").read()
def wr(p, s): (repo / p).open("w", encoding="utf-8", newline="").write(s)

def swap(s, old, new, count, where):
    n = s.count(old)
    if n != count: raise SystemExit(f"{where}: expected {count} x {old!r}, found {n}")
    return s.replace(old, new)

def patch_jsonld(s, where, fn):
    m = re.search(r'(<script type="application/ld\+json">)(.*?)(</script>)', s, re.S)
    if not m: raise SystemExit(f"{where}: no JSON-LD")
    data = json.loads(m.group(2))
    fn(data)
    return s[:m.start(2)] + json.dumps(data, ensure_ascii=False) + s[m.end(2):]

# ---- public/llms.txt
p = "public/llms.txt"; s = rd(p)
if fname in s: raise SystemExit(f"{p}: already lists {fname}")
s = swap(s, "six finished short films", "seven finished short films", 1, p)
s = swap(s, "AI Film Studio — six finished films", "AI Film Studio — seven finished films", 1, p)
eol = "\r\n" if "\r\n" in s else "\n"
s = swap(s, f"## Films{eol}{eol}", f"## Films{eol}{eol}- [{title}]({url}) — released {date}{eol}", 1, p)
wr(p, s)

# ---- public/aifilmstudio/index.html
p = "public/aifilmstudio/index.html"; s = rd(p)
if fname in s: raise SystemExit(f"{p}: already lists {fname}")
s = swap(s, "Six short films", "Seven short films", 1, p)
s = swap(s, "six finished AI films", "seven finished AI films", 1, p)
s = swap(s, "Six finished short films", "Seven finished short films", 2, p)  # og:description + JSON-LD
def studio(d):
    page = next(g for g in d["@graph"] if g.get("@type") == "CollectionPage")
    lst = page["mainEntity"]
    if lst["numberOfItems"] != OLD_N: raise SystemExit(f"numberOfItems is {lst['numberOfItems']}, expected {OLD_N}")
    tmpl = lst["itemListElement"][0]["item"]
    item = dict(tmpl, name=title, uploadDate=date, contentUrl=url,
                description=f"{title} — a short film from the ATUONA AI Film Studio by Elena Revicheva, released {date}.")
    lst["itemListElement"].insert(0, {"@type": "ListItem", "position": 1, "item": item})
    for i, li in enumerate(lst["itemListElement"], 1):
        li["position"] = i; li["item"]["position"] = i
    lst["numberOfItems"] = NEW_N
    page["dateModified"] = date
s = patch_jsonld(s, p, studio)
li = (f'<li><a href="{url}">{html.escape(title)}</a> — released <time datetime="{date}">{date}</time></li>')
s = swap(s, "<noscript><div class=\"wrap\"><h2>Films from the ATUONA AI Film Studio</h2><ul>",
         "<noscript><div class=\"wrap\"><h2>Films from the ATUONA AI Film Studio</h2><ul>" + li, 1, p)
wr(p, s)

# ---- index.html (home)
p = "index.html"; s = rd(p)
s = swap(s, "six short films made with AI", "seven short films made with AI", 1, p)
s = swap(s, "six finished short films", "seven finished short films", 3, p)  # og:description + 2 in JSON-LD
wr(p, s)
print("ok:", fname, date, title)
