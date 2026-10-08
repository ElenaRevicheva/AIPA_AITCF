export const meta = {
  name: 'film9-stanza-translation',
  description: 'Atmospheric English for the Russian stanzas of film #9, fidelity-judged against Elena\'s Russian, then a sequence critic',
  phases: [
    { title: 'Translate', detail: '2 translators per batch: atmospheric poet + close literary' },
    { title: 'Judge', detail: 'pick or merge, check every image of hers is there and nothing is added' },
    { title: 'Critic', detail: 'whole-film read of all 39 stanzas in order' },
  ],
}
// args: { file: picks_verified.json path, ru: [slot ids with Russian stanzas] } — agents read the file themselves
const FILE = args.file
const RULES = `
These are lines by Elena Revicheva, a Russian poet who also writes in English, chosen for her film #9 "Atuona" (Hiva Oa,
Gauguin's last island; underground aesthetic; a woman, Kira, who is a lesbian; Ule is her witness, never her lover).
Elena's instruction for the on-screen text, verbatim: "sharp poetic stanza from my own content, sure translated into English,
with a proper atmospheric translation - it may not fully fit the video shot plot, it should emotionally fit." And: "all the
text should be my true content."

WHAT AN ATMOSPHERIC TRANSLATION IS HERE:
- English that reads like a poem written in English: her mood, her rhythm, her edge, her register (raw words stay raw).
- Every image, object and action she uses is kept. NOTHING is added: no new image, metaphor, name, colour, fact or emotion
  that is not in her Russian. Rhyme may be dropped. Small reorderings and idiomatic choices are fine; explaining is not.
- Line for line where English allows; separate lines with " / ".
- Her Latin, French, English or brand words stay as she wrote them.
- It must fit the slot's max_words (English words). It will be burned at the bottom of the frame and spoken by a low female voice.
`
const T = { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: {
  slot: { type: 'string' }, en: { type: 'string' }, words: { type: 'integer' }, note: { type: 'string' } },
  required: ['slot', 'en', 'words'] } } }, required: ['items'] }
const J = { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: {
  slot: { type: 'string' }, en: { type: 'string' }, words: { type: 'integer' },
  chosen: { type: 'string', enum: ['A', 'B', 'merged', 'new'] },
  image_map: { type: 'array', items: { type: 'string' }, description: 'each image/action of the Russian -> where it is in the English' },
  added: { type: 'array', items: { type: 'string' }, description: 'anything in the English that is NOT in her Russian (must end empty)' },
  why: { type: 'string' } }, required: ['slot', 'en', 'words', 'chosen', 'image_map', 'added', 'why'] } } }, required: ['items'] }

const batches = []
for (let i = 0; i < args.ru.length; i += 5) batches.push(args.ru.slice(i, i + 5))
log(`${args.ru.length} Russian stanzas in ${batches.length} batches; the English stanzas stay verbatim`)

const LENS = {
  A: 'You are a poet-translator. Aim for the ATMOSPHERE: the English must hit like the Russian does, dark, sensual, exact.',
  B: 'You are a close literary translator. Aim for FIDELITY with grace: her exact images in natural, strong English.',
}
const judged = await pipeline(batches,
  async (b, _o, i) => {
    const [a, bb] = await parallel(['A', 'B'].map(k => () => agent(`${RULES}\n${LENS[k]}\nRead ${FILE} and translate the stanzas
of these slots: ${b.join(', ')}. Each entry there has her Russian (source_text), the poem, max_words, target_words, what we see,
and a frame_image you may Read to feel the shot. The English stanzas of the other slots stay as she wrote them.`,
      { label: `translate:${k}:b${i + 1}`, phase: 'Translate', schema: T })))
    return { b, a, bb }
  },
  async ({ b, a, bb }, _o, i) => agent(`${RULES}
You are the JUDGE for these stanzas. For each slot: compare translation A (atmospheric) and B (close) with her Russian. Choose
the better one, or merge the best of both, or write a better one yourself. Then CHECK the result image by image against her
Russian: list every image/action of hers and where it sits in the English (image_map); list anything added that is not in her
Russian (added) and remove it, so "added" ends EMPTY. Respect max_words. Prefer the English that a stranger would remember.

STANZAS: read ${FILE}, slots ${b.join(', ')} (her Russian is in source_text).

TRANSLATION A:
${JSON.stringify(a && a.items)}

TRANSLATION B:
${JSON.stringify(bb && bb.items)}`, { label: `judge:b${i + 1}`, phase: 'Judge', schema: J }),
)
const final = judged.filter(Boolean).flatMap(j => j.items)

phase('Critic')
const enOf = {}; final.forEach(f => { enOf[f.slot] = f.en })
const sequence = enOf
const C = { type: 'object', properties: {
  verdict: { type: 'string' },
  issues: { type: 'array', items: { type: 'object', properties: {
    slot: { type: 'string' }, kind: { type: 'string', enum: ['added-content', 'weak-fit', 'too-long', 'missing', 'repetition', 'rule', 'flat', 'other'] },
    detail: { type: 'string' }, fix: { type: 'string' } }, required: ['slot', 'kind', 'detail', 'fix'] } },
}, required: ['verdict', 'issues'] }
const critic = await agent(`${RULES}
You are the COMPLETENESS CRITIC. ${FILE} is the whole film in order: 39 shots, each with what we see, its frame image, poem and her
source_text. English stanzas (lang en) are burned as written in source_text; for Russian stanzas (lang ru) the English that will
be burned is given below by slot. Read it as one film. Flag ONLY real problems:
an English line that adds anything not in her Russian; a stanza that does not fit the shot emotionally; one longer than
max_words; a missing stanza; two shots saying the same thing; a breach of the rules (Kira and Ule as lovers); a flat,
narrative line that is not "sharp". For each, give a concrete fix (for a translation: the corrected English). Look at frame
images where fit is in doubt. If the film reads well, say so and return few or no issues.

${JSON.stringify(sequence, null, 1)}`, { label: 'critic', phase: 'Critic', schema: C })
return { final, critic }
