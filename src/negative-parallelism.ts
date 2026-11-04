/**
 * Negative parallelism detector — the "not X, but Y" construction.
 *
 * One per text can be a real literary move. A model reaches for it in every
 * paragraph («Не для него. Для себя», "It's not a confession. It's a draft."),
 * and readers now recognise that rhythm as machine prose on sight.
 *
 * Policy (Elena, 4 Nov 2026): keep at most ONE, only where the contrast is the
 * point, phrased as a natural sentence. Everything else is rewritten as a
 * direct statement.
 */

export const NEGATIVE_PARALLELISM_MAX = 1;

const PATTERNS: RegExp[] = [
  // RU: «не X, а Y» / «не для того, чтобы…, а для того…»
  /(?:^|[^\p{L}])не\s+[^.!?\n]{1,60}?[,—–]\s*а\s+/giu,
  // RU: «это не X. Это Y»
  /(?:^|[^\p{L}])не\s+[^.!?\n]{1,40}[.!?…]\s+(?:это|Это)\s/gu,
  // RU staccato: «Не X. Y.» — a short sentence that opens with «Не», then another sentence
  /(?:^|[.!?…»]\s+|\n\s*)Не\s+[^.!?\n]{1,40}[.!?…]\s+[\p{Lu}]/gu,
  // EN: "not X, but Y"
  /\bnot\s+[^.!?\n]{1,40}?,?\s+but\s+/gi,
  // EN: "It's not X. It's Y." / "This is not X — it's Y"
  /\b(?:it'?s|it is|this is|that is|it was)\s+not\s+[^.!?\n]{1,40}[.!?—–;]\s*(?:it'?s|it is|this is|that is|it was)\b/gi,
  // EN staccato: "Not X. Y."
  /(?:^|[.!?…]\s+|\n\s*)Not\s+[^.!?\n]{1,40}[.!?…]\s+[\p{Lu}]/gu,
];

export interface NegParHit { index: number; text: string }

/** All distinct hits (overlapping matches from different patterns count once). */
export function findNegativeParallelism(text: string): NegParHit[] {
  const spans: Array<{ start: number; end: number }> = [];
  for (const re of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      spans.push({ start: m.index, end: m.index + m[0].length });
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  spans.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s.start < last.end) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }
  return merged.map(s => {
    // Report the whole sentence(s) around the hit so the rewriter sees context.
    const from = Math.max(0, text.lastIndexOf('\n', s.start) + 1);
    const nl = text.indexOf('\n', s.end);
    const to = nl === -1 ? text.length : nl;
    return { index: s.start, text: text.slice(from, to).trim().slice(0, 220) };
  });
}

/** Prompt rule — shared by daily inspiration and /create. */
export const NEGATIVE_PARALLELISM_RULE = `
⛔ NEGATIVE PARALLELISM — the #1 tell of AI prose:
«не X, а Y» · «Не X. Y.» · «это не X. Это Y» · «не для того, чтобы…, а для того, чтобы…» · "not X, but Y" · "It's not X. It's Y."
- At most ONE per text, and only where the contrast IS the point of the moment.
- When you use it, write one natural sentence — never two clipped fragments ("Не approves. Remembers.").
- Everywhere else say the thing directly. Write «Она считает вслух, для себя» — not «Не для него. Для себя.»
- Do not swap it for the same move in disguise ("X — вместо Y", "less X, more Y").
`;

export function buildNegParRewritePrompt(text: string, hits: NegParHit[]): string {
  return `Edit this literary text. It overuses negative parallelism (the "not X, but Y" / «не X, а Y» / «Не X. Y.» move) — ${hits.length} times:

${hits.map((h, i) => `${i + 1}. ${h.text}`).join('\n')}

RULES:
- Keep AT MOST ONE — the strongest, where the contrast is truly the point — and phrase it as one natural, full sentence, not clipped fragments.
- Rewrite every other one as a direct statement of the positive half. No contrast, no disguised contrast ("вместо", "rather than", "less X, more Y").
- Change nothing else: same language mix, same facts, same images, same line breaks, same opening and ending, same length (±10%).
- Return ONLY the edited text. No preface, no notes.

TEXT:
${text}`;
}
