/**
 * atuona-vault-tree.ts — pure helpers for writing into the atuona.xyz VAULT tree.
 *
 * Deliberately free of imports, env reads and side effects, so it can be loaded
 * and tested on its own. Pulling these out of atuona-creative-ai.ts was not
 * tidiness: requiring that module boots the whole bot graph and throws on a
 * missing GROQ_API_KEY, which meant the only way to test the publisher was to
 * re-implement it — and a test that re-implements the thing it tests proves
 * nothing about the code that actually runs.
 *
 * Tested by scripts/test-atuona-vault-insert.cjs against the real index.html.
 */


// =============================================================================
// INSERT A POEM INTO THE VAULT TREE
// =============================================================================
//
// The vault used to be a flat grid, and this publisher appended to it by finding
// the LAST `<div class="nft-card">`, then `COLLECT SOUL</button>`, then this exact
// literal:
//
//     '</div>\n                        </div>\n                    </div>'
//
// Three fragile string matches in a row, and — the real defect — no else branch.
// If any one missed, the `if` simply ended: the poem was committed to the JSON
// files and to the MINT slots, Telegram reported success, and it never appeared
// in the vault. A publish that loses the poem and says "done".
//
// It also only ever worked by luck. The anchor needs the last card to say
// COLLECT SOUL, and the vault also contains ACQUIRE SPIRIT and RESERVE NOW cards.
//
// The vault is now a generated tree (scripts/build-vault.mjs in the atuona repo)
// with an explicit insertion marker. One anchor, and a THROW when it is absent,
// so a broken publish is loud instead of silent.
//
// Placement does not have to be perfect: atuona's `prebuild` re-derives the whole
// tree from index.html on every deploy, which re-sorts the rows, fixes the year
// headers and the counts, and then verifies all of it against a locked
// fingerprint. This only has to be well-formed and in the right part.

const VAULT_MARKER = '<!-- VAULT:INSERT:ATUONA -->';

/**
 * Find one poem's card by COUNTING DIV DEPTH, not by matching whitespace.
 *
 * Both the add and the replace path used to locate a card's end with a literal
 * `'</div>\n                        </div>\n                    </div>'`, which
 * encodes the indentation of one particular layout. The vault is now a tree and
 * its cards sit deeper, so that literal stopped matching — and because both call
 * sites tested it with a bare `if` and no else, the failure was invisible.
 *
 * Depth counting is indentation-agnostic: it works on the flat grid, on the tree,
 * and on whatever the page looks like next.
 */
export function findCardBounds(html: string, pageId: string): { start: number; end: number } | null {
  const idAt = html.indexOf(`<div class="nft-id">#${pageId}</div>`);
  if (idAt < 0) return null;
  const start = html.lastIndexOf('<div class="nft-card">', idAt);
  if (start < 0) return null;

  const re = /<div\b|<\/div>/g;
  re.lastIndex = start;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[0] === '</div>') {
      depth--;
      if (depth === 0) return { start, end: m.index + '</div>'.length };
    } else {
      depth++;
    }
  }
  return null; // unbalanced markup — caller must refuse rather than guess
}

/**
 * Swap one poem's card for a rebuilt one, leaving its row and the rest of the
 * page alone. THROWS rather than returning quietly: the previous version logged
 * "cannot replace" and carried on to commit, so an overwrite could report success
 * having changed nothing.
 *
 * The contents row above the card still shows the old title until the next
 * deploy, when atuona's `prebuild` re-derives every row from its card. If that
 * regeneration does not run, `verify-vault.mjs` fails the build on the mismatch —
 * so a stale row can never reach the site unnoticed.
 */
export function replacePoemCard(html: string, pageId: string, newCardHtml: string): string {
  const at = findCardBounds(html, pageId);
  if (!at) {
    throw new Error(
      `Could not locate card #${pageId} in index.html (or its markup is unbalanced). ` +
      `Refusing to report a replacement that did not happen.`
    );
  }
  const out = html.slice(0, at.start) + newCardHtml.trim() + html.slice(at.end);
  if (!out.includes(`<div class="nft-id">#${pageId}</div>`)) {
    throw new Error(`Replacement of #${pageId} removed the card instead of swapping it — refusing to commit`);
  }
  return out;
}

const escHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string): string => escHtml(s).replace(/"/g, '&quot;');

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `07-09-2026` → `{ pretty: '7 Sep 2026', year: '2026' }` */
function readBadgeDate(dateStr: string): { pretty: string; year: string } {
  const m = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return { pretty: dateStr, year: String(new Date().getFullYear()) };
  const day = Number(m[1]);
  const mon = MONTHS_SHORT[Number(m[2]) - 1] ?? m[2]!;
  return { pretty: `${day} ${mon} ${m[3]}`, year: m[3]! };
}

/**
 * Wrap a freshly built NFT card in its contents row and splice it into PART I.
 *
 * Pure and idempotent: publishing the same poem twice returns the HTML unchanged
 * rather than creating a second row that would claim the same token.
 *
 * THROWS if the marker is missing. That is deliberate — the caller must fail the
 * publish rather than report success on a poem the reader will never see.
 */
export function insertPoemIntoVault(
  htmlContent: string,
  opts: {
    pageId: string;
    title: string;
    cardHtml: string;
    dateStr: string;
    firstLine: string;
    lang?: string;
  }
): string {
  const { pageId, title, cardHtml, dateStr, firstLine } = opts;

  // Already published — never duplicate a row, and never re-stamp one.
  if (htmlContent.includes(`id="p${pageId}"`) || htmlContent.includes(`nft-id">#${pageId}<`)) {
    return htmlContent;
  }

  const at = htmlContent.indexOf(VAULT_MARKER);
  if (at < 0) {
    throw new Error(
      `VAULT insertion marker ${VAULT_MARKER} not found in index.html. The vault is ` +
      `generated by scripts/build-vault.mjs in the atuona repo and must carry it. ` +
      `Refusing to publish #${pageId} rather than lose it silently.`
    );
  }
  const after = at + VAULT_MARKER.length;

  const { pretty, year } = readBadgeDate(dateStr);
  const lang = (opts.lang ?? (/[а-яё]/i.test(firstLine) ? 'ru' : 'en')).toUpperCase();

  const taster = firstLine.length > 96
    ? firstLine.slice(0, 95).replace(/[\s,;:.—–-]+$/, '') + '…'
    : firstLine;

  const row =
`
            <article class="poem" id="p${pageId}" data-find="${escAttr(`${pageId} ${Number(pageId)} ${title} ${taster}`.toLowerCase())}">
              <h4 class="poem-h">
                <button class="poem-btn" type="button" aria-expanded="false" aria-controls="p${pageId}-body">
                  <span class="poem-num">#${escHtml(pageId)}</span>
                  <span class="poem-txt">
                    <span class="poem-title">${escHtml(title)}</span>
                    <span class="poem-sub">${escHtml(taster)}</span>
                  </span>
                  <span class="poem-side">
                    <span class="poem-status live">LIVE</span>
                    <span class="poem-lang">${escHtml(lang)}</span>
                    <span class="poem-date">${escHtml(pretty)}</span>
                    <span class="poem-leader" aria-hidden="true"></span>
                    <span class="poem-open">Read<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></span>
                  </span>
                </button>
              </h4>
              <div class="poem-body" id="p${pageId}-body">
                <div class="poem-in">
${cardHtml.replace(/\n$/, '')}
                  <a class="poem-permalink" href="#p${pageId}">#${escHtml(pageId)} — permalink</a>
                </div>
              </div>
            </article>`;

  // Which year run does it belong to? The newest run sits directly after the
  // marker. Same year: join it and bump its tally. New year: open a new run.
  const lookahead = htmlContent.slice(after, after + 400);
  const runYear = lookahead.match(/<span class="run-y">(\d{4})<\/span>/);

  if (runYear && runYear[1] === year) {
    const bumped = htmlContent.slice(after).replace(
      /<span class="run-n">(\d+) moments?<\/span>/,
      (_full, n: string) => `<span class="run-n">${Number(n) + 1} moments</span>`
    );
    const runEnd = bumped.indexOf('</div>') + '</div>'.length;
    return htmlContent.slice(0, after) + bumped.slice(0, runEnd) + row + bumped.slice(runEnd);
  }

  const newRun =
`
            <div class="run"><span class="run-y">${escHtml(year)}</span><span class="run-rule" aria-hidden="true"></span><span class="run-n">1 moment</span></div>`;
  return htmlContent.slice(0, after) + newRun + row + htmlContent.slice(after);
}

