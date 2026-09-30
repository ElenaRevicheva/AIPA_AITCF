# AI Growth Operator promo - YouTube caption files (EN = the locked narration, ES = the burned-in Spanish + the card lines).
# Same clock as aigo-promo-cut3.py: decoded voice lengths + breathing pauses; each line split at the pauses measured in
# its own voice file. YouTube indexes caption text, so both files also carry the film's words into search.
# Runs on Oracle in ~/aigo-promo -> cut3/AIGO_promo_en.srt, cut3/AIGO_promo_es.srt
import os, subprocess
B = os.path.expanduser("~/aigo-promo"); VO = f"{B}/voice/full_mm"
PAUSE = {"s01": .8, "s02": 1.0, "s03": 1.4, "s04": 2.0, "s05": .8, "s06": .8, "s07": .8, "s08": .9, "s09": 1.0, "s10": 1.2, "s11": 1.2, "s12": 2.5}
def decoded(p):
    return len(subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-f", "s16le", "-ac", "1", "-ar", "44100", "-"], capture_output=True).stdout) / 88200
L = {k: decoded(f"{VO}/{k}.mp3") for k in PAUSE}
start, t = {}, 1.5
for k in PAUSE: start[k] = t; t += L[k] + PAUSE[k]
END = None   # chunk runs to the end of the spoken line
EN = {
 "s01": [(0, 2.71, "Your next charter guest is planning at midnight."), (2.71, END, "She isn't calling you. She's asking an AI.")],
 "s02": [(0, 2.45, "It suggests the boats it can understand."), (2.45, END, "If it can't understand your website, you may not make the list.")],
 "s03": [(0, 1.81, "Some guests message you directly."), (1.81, 3.42, "Friday night — you're at sea."), (3.42, 4.58, "You reply Monday."),
         (4.58, END, "She's already booked the boat that answered first.")],
 "s04": [(0, END, "Nobody wakes up wanting AI. You want more bookings.")],
 "s05": [(0, 1.06, "Rewind."), (1.06, 3.41, "Same guest. Same question."), (3.41, END, "This time, you have an AI Growth Operator.")],
 "s06": [(0, 3.88, "First, it checks what AI can actually understand about your website."), (3.88, 6.33, "Thirty-four checks. One score."),
         (6.33, END, "The fixes that matter.")],
 "s07": [(0, 2.70, "When she writes, she hears back right away."), (2.70, END, "And a reply is already drafted on your phone.")],
 "s08": [(0, 2.50, "The AI drafts. You decide."), (2.50, 3.70, "One tap — sent."), (3.70, END, "And the conversation is logged in your CRM.")],
 "s09": [(0, 2.14, "Every morning, you know who's new,"), (2.14, END, "who's warm, and who's starting to slip away.")],
 "s10": [(0, 3.53, "AIdeazz AI Lab doesn't sell you another CRM."), (3.53, 7.70, "We install an AI Growth Operator inside the tools you already use —"),
         (7.70, END, "and run it with you.")],
 "s11": [(0, END, "The people in this film are AI. The product screens are real.")],
 "s12": [(0, 2.73, "What does AI see when it looks at your business?"), (2.73, END, "Find out free at aideazz.xyz/api.")],
}
ES = {
 "s01": [(0, 2.71, "Tu próxima clienta de chárter está planeando a medianoche."), (2.71, END, "No te está llamando. Le está preguntando a una IA.")],
 "s02": [(0, 2.45, "La IA sugiere los barcos que puede entender."), (2.45, END, "Si no entiende tu sitio web, puede que no estés en la lista.")],
 "s03": [(0, 1.81, "Algunos clientes te escriben directamente."), (1.81, 3.42, "Viernes por la noche: estás en el mar."), (3.42, 4.58, "Respondes el lunes."),
         (4.58, END, "Ella ya reservó el barco que respondió primero.")],
 "s04": [(0, END, "Nadie se despierta queriendo IA. Tú quieres más reservas.")],
 "s05": [(0, 1.06, "Rebobina."), (1.06, 3.41, "Misma clienta. Misma pregunta."), (3.41, END, "Esta vez tienes un AI Growth Operator.")],
 "s06": [(0, 3.88, "Primero, revisa qué puede entender realmente la IA de tu sitio web."), (3.88, 6.33, "34 señales. Una puntuación."),
         (6.33, END, "Las correcciones que importan.")],
 "s07": [(0, 2.70, "Cuando ella escribe, recibe respuesta al instante."), (2.70, END, "Y ya tienes una respuesta redactada en tu teléfono.")],
 "s08": [(0, 2.50, "La IA redacta. Tú decides."), (2.50, 3.70, "Un toque: enviado."), (3.70, END, "Y la conversación queda registrada en tu CRM.")],
 "s09": [(0, 2.14, "Cada mañana sabes quién es nuevo,"), (2.14, END, "quién está interesado y quién se te empieza a escapar.")],
 "s10": [(0, 3.53, "AIdeazz AI Lab no te vende otro CRM."), (3.53, 7.70, "Instalamos un AI Growth Operator dentro de las herramientas que ya usas,"),
         (7.70, END, "y lo operamos contigo.")],
 "s11": [(0, END, "Las personas de esta película son IA. Las pantallas del producto son reales.")],
 "s12": [(0, 2.73, "¿Qué ve la IA cuando mira tu negocio?"), (2.73, END, "Descúbrelo gratis en aideazz.xyz/api.")],
}
def ts(x):
    ms = int(round(x * 1000)); return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"
for lang, table in (("en", EN), ("es", ES)):
    rows = []
    for k, chunks in table.items():
        for a, z, text in chunks:
            rows.append((start[k] + a, start[k] + (z if z is not None else L[k] + 0.3), text))
    out = f"{B}/cut3/AIGO_promo_{lang}.srt"
    open(out, "w", encoding="utf-8").write("".join(f"{i}\n{ts(a)} --> {ts(z)}\n{txt}\n\n" for i, (a, z, txt) in enumerate(rows, 1)))
    print(lang, len(rows), "cues ->", out)
