/**
 * Telegram-safe text truncation.
 *
 * Why (August 15 2026): a real inbound lead reached Elena's Telegram as silence.
 * AkhilTej submitted the aideazz.xyz form with a message that decorated every
 * line with 💎 (U+1F48E), and the concierge card built its preview with
 * `inquiry.slice(0, 500)`. Index 500 landed exactly in the middle of one of those
 * 💎: in UTF-16 that emoji is a surrogate PAIR, so the cut left a lone high
 * surrogate \uD83D at the end of the string. A lone surrogate has no valid UTF-8
 * encoding, so the Bot API rejected the ENTIRE message:
 *
 *   {"ok":false,"error_code":400,"description":"Bad Request: strings must be
 *    encoded in UTF-8"}
 *
 * The draft itself was fine and safely stored on disk — Elena simply never saw
 * the card, and so never saw the ✅ Send button. Any prospect who writes with an
 * emoji can trip this, which makes it a money bug rather than a cosmetic one.
 *
 * Two rules, and the second is the one that actually saves us:
 *   1. Never cut between the halves of a surrogate pair.
 *   2. Strip lone surrogates ANYWHERE in the string — by the time text reaches a
 *      send function it has usually already been sliced by a caller, so a guard
 *      that only policed its own cut point would not have caught this bug.
 */

/** A high surrogate with no low surrogate after it, or a low surrogate with no high before it. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * Truncate to `max` UTF-16 units without splitting an emoji, then drop any lone
 * surrogate left behind by an earlier slice upstream.
 *
 * Always returns something the Bot API can encode, so a message can still fail
 * for real reasons (chat not found, bot blocked) but never for the shape of its
 * own text.
 */
export function tgSafeText(text: string, max = 4090): string {
  let out = text ?? '';
  if (out.length > max) {
    out = out.slice(0, max);
    // If the cut landed on the leading half of a pair, drop that orphan half.
    const last = out.charCodeAt(out.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  }
  return out.replace(LONE_SURROGATE, '');
}
