/**
 * Rules for GitHub Contents API commit messages that 4everland watches.
 *
 * `[skip ci]` tells 4everland not to rebuild. A new canonical blog URL that
 * lands in git behind that flag is invisible on IPFS until some later commit
 * happens to trigger a pin — Dev.to then points at a 404.
 *
 * Bulk regeneration may skip *existing* files (hasSha) so 50 articles do not
 * fire 50 deploys. A genuinely new file (no sha) must never skip, even in bulk.
 * Daily publish must not bulk-regenerate at all: a skip-ci storm in the same
 * second can debounce-drop the one real commit that would have pinned the page.
 */
export function githubCommitMessage(
  base: string,
  opts: { bulk?: boolean; hasSha?: boolean } = {},
): string {
  const skipCi = !!opts.bulk && !!opts.hasSha;
  return skipCi ? `${base} [skip ci]` : base;
}

/** Sitemap commits must never skip CI — they are often the only signal a new URL exists. */
export const SITEMAP_COMMIT_MESSAGE = "chore(sitemap): auto-update";

/**
 * Dev.to cross-post preface. Do not wrap this line in `*italics*`: the `I` in
 * AIdeazz closes the emphasis opener and Dev.to renders the brand as "Aldeazz".
 */
export function devtoCanonicalPreface(canonicalUrl: string): string {
  return `Originally published at [aideazz.xyz](${canonicalUrl}) — cross-posted here with canonical link.`;
}
