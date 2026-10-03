# Medical-tourism film (ICP #5) - YouTube caption files EN + ES (same clock as med-cut.py; ES = the burned-in captions + card lines).
# Copy of reloc-srt.py.
import json, os
B = os.path.expanduser("~/aigo-med")
clk = json.load(open(f"{B}/cut1/clock.json")); start, L = clk["start"], clk["L"]
man = json.load(open(f"{B}/assets/manifest.json", encoding="utf-8"))
EN = {"s01": ["Your next patients are flying to Colombia for treatment —", "dental implants for him,", "a cosmetic procedure for her.", "They aren't calling you.", "They're asking an AI."],
      "s02": ["It tends to suggest the clinics and surgeons it can understand.", "If it can't understand your website, you may not make the list."],
      "s03": ["Some patients message you directly.", "Friday — you're in a long surgery,", "or your coordinator is with another family.", "You reply Monday.", "They've already chosen the clinic that answered first."],
      "s05": ["Rewind. Same family. Same question.", "This time, you have an AI Growth Operator."],
      "s06": ["First, it checks what AI can actually understand about your website.", "Thirty-four checks. One score.", "The fixes that matter."],
      "s07": ["When she writes, she hears back right away.", "And a reply is already drafted on your phone."],
      "s08": ["The AI drafts. You decide.", "One tap — sent.", "And the conversation is logged in your CRM."],
      "s10": ["AIdeazz AI Lab doesn't sell you another CRM.", "We install an AI Growth Operator inside the tools you already use —", "and run it with you."]}
WHOLE = {"s04": ("Nobody wakes up wanting AI. You want more patients.", "Nadie se despierta queriendo IA. Tú quieres más pacientes."),
         "s09": ("Every morning, you know who's new, who's warm, and who's starting to slip away.", "Cada mañana sabes quién es nuevo, quién está interesado y quién se te empieza a escapar."),
         "s11": ("The people in this film are AI. The product screens are real.", "Las personas de esta película son IA. Las pantallas del producto son reales."),
         "s12": ("What does AI see when it looks at your business? Find out free at aideazz.xyz/api", "¿Qué ve la IA cuando mira tu negocio? Descúbrelo gratis en aideazz.xyz/api")}
caps = {}
for c in man["captions"]: caps.setdefault(c["line"], []).append(c)
def ts(x): ms = int(round(x * 1000)); return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"
for lang in ("en", "es"):
    rows = []
    for k, cs in caps.items():
        for i, c in enumerate(cs):
            text = EN[k][i] if lang == "en" else c["text"]
            if k == "s05" and i == 0: text = EN[k][0] if lang == "en" else "Rebobina. Misma familia. Misma pregunta."
            rows.append((start[k] + c["t0"], min(start[k] + (cs[i + 1]["t0"] if i + 1 < len(cs) else c["t1"]), start[k] + L[k] + 0.3), text))
    for k, (en, es) in WHOLE.items(): rows.append((start[k], start[k] + L[k] + 0.3, en if lang == "en" else es))
    rows.sort()
    out = f"{B}/cut1/MEDTOUR_promo_{lang}.srt"
    open(out, "w", encoding="utf-8").write("".join(f"{i}\n{ts(a)} --> {ts(z)}\n{x}\n\n" for i, (a, z, x) in enumerate(rows, 1)))
    print(lang, len(rows), "cues")
