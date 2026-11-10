/**
 * source-check.ts — is a number in a claim actually WRITTEN in the source it cites?
 *
 * WHY THIS EXISTS (10 Nov 2026)
 * ----------------------------------------------------------------------------
 * Grounded LLMs rarely invent a whole source; they far more often misquote a real
 * one. A second model checking the first cannot catch that — it trusts the same
 * link. The only check that does is mechanical: open the exact copy of the source
 * that was kept, and look for the number in its text.
 *
 * The blog already enforces the same rule against its own evidence bundle
 * (`blog-evidence.ts`: "every number in the article must be traceable to the
 * bundle"). This module is that rule made reusable for any claim → source check,
 * built ON the blog gate's helpers rather than beside them:
 *   - stripStructuralNumericTokens  (hashes, ISO dates, clock times, URLs are not claims)
 *   - isFreeNumber                  (years and small rhetorical counts need no source)
 *
 * What it adds is the one thing the blog never needed: Russian/European number
 * formats. The blog gate reads "47,0" as 470 and "3 524" as two numbers — correct
 * for English prose, wrong for a Russian port statistic. Nothing here changes the
 * blog gate's behaviour.
 *
 * First used on a private client research engagement (Nov 2026), where it caught
 * figures that an LLM cross-checker had marked VERIFIED but the cited copy did not contain.
 */

import { stripStructuralNumericTokens, isFreeNumber } from './blog-evidence';

/** Thin spaces, NBSP, figure space: all used as thousands separators in RU/EU text. */
const GROUP_SPACE = '     ';

/**
 * Normalise source text so equivalent figures compare equal:
 *   "3 524" / "3 524" → "3524"   (space-grouped thousands)
 *   "47,0" → "47.0"                  (decimal comma)
 * Apply to the SOURCE side; claims are matched through `numberCandidates`.
 */
export function normaliseNumericText(text: string): string {
  return text
    .replace(new RegExp(`(?<=\\d)[${GROUP_SPACE}](?=\\d{3}\\b)`, 'g'), '')
    .replace(/,/g, '.');
}

/**
 * Numbers a claim makes that need a source: structural tokens stripped first
 * (blog-evidence), footnote markers like [12] removed, years and small counts
 * dropped (blog-evidence `isFreeNumber`). Space-grouped thousands are kept whole.
 */
export function claimNumbers(claim: string): string[] {
  const prose = stripStructuralNumericTokens(claim.replace(/\[\d+\]/g, ' '));
  const re = new RegExp(`(?<![\\w.])(\\d{1,3}(?:[,${GROUP_SPACE}]\\d{3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?)`, 'g');
  const out: string[] = [];
  for (const m of prose.matchAll(re)) {
    const n = m[1] ?? '';
    if (!n) continue;
    const plain = n.replace(new RegExp(`[${GROUP_SPACE}]`, 'g'), '').replace(/,(?=\d{3}\b)/g, '');
    // Blog prose may use small counts freely ("three reasons"); a research claim may not use
    // small DECIMALS freely: "4.5 Mt" is a fact. So only whole numbers <= 10 and years are free here.
    // ...and a number written WITH a separator ("2,100 vessels") is never a year.
    if (isFreeNumber(plain) && !/[.,]\d/.test(plain) && n === plain) continue;
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

/** Every spelling under which a claim's number may appear in normalised source text. */
export function numberCandidates(n: string): string[] {
  const c = new Set<string>();
  const noSpace = n.replace(new RegExp(`[${GROUP_SPACE}]`, 'g'), '');
  c.add(noSpace.replace(/,/g, ''));                 // 3,524 → 3524
  c.add(noSpace.replace(/,/g, '.'));                // 47,0 → 47.0
  if (/^\d+\.\d+$/.test(noSpace)) {
    c.add(noSpace.replace(/0+$/, '').replace(/\.$/, '')); // 47.0 → 47
  }
  return [...c].filter(Boolean);
}

/** Is this number written in this (already normalised) source text? */
export function numberInText(n: string, normalisedText: string): boolean {
  for (const cand of numberCandidates(n)) {
    const esc = cand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(?<![\\d.])${esc}(?![\\d])`).test(normalisedText)) return true;
  }
  return false;
}

export type ClaimVerdict = 'IN SOURCE' | 'PARTIAL' | 'NOT IN SOURCE' | 'NO COPY' | 'NO NUMBERS';

export interface ClaimCheck {
  numbers: string[];
  found: string[];
  missing: string[];
  verdict: ClaimVerdict;
}

/**
 * Check one claim against the texts of the sources it cites.
 * `sourceTexts` = raw texts of the kept copies (normalised here); empty = no readable copy.
 */
export function checkClaim(claim: string, sourceTexts: string[]): ClaimCheck {
  const numbers = claimNumbers(claim);
  const texts = sourceTexts.filter((t) => t && t.trim()).map(normaliseNumericText);
  const found = numbers.filter((n) => texts.some((t) => numberInText(n, t)));
  const missing = numbers.filter((n) => !found.includes(n));
  let verdict: ClaimVerdict;
  if (!numbers.length) verdict = 'NO NUMBERS';
  else if (!texts.length) verdict = 'NO COPY';
  else if (found.length === numbers.length) verdict = 'IN SOURCE';
  else if (found.length) verdict = 'PARTIAL';
  else verdict = 'NOT IN SOURCE';
  return { numbers, found, missing, verdict };
}
