/**
 * Which order does a PagueloFacil payment belong to?
 *
 * PagueloFacil's webhook never echoes PARM_1 (found 29 Sep 2026 on the first real paid
 * order). It does echo the description, accents stripped, so new links carry
 * "Ref <order id>" there. Links created before that need the fallback below.
 */

/** "Ref 5CA364BF…" in the echoed description → the 32-hex order id, else null. */
export function orderRefFromDescription(description: string | null | undefined): string | null {
  const m = String(description || '').match(/\bRef\s+([0-9A-Fa-f]{32})\b/);
  return m ? m[1]!.toUpperCase() : null;
}

/**
 * A payment with no ref: which pending order of that amount is it?
 * The one whose email matches the payer's; else the only candidate. Two or more with no
 * email match is ambiguous — never guess with money, ask Elena instead.
 */
export function pickOrderForPayment(
  candidates: Array<{ id: string; client_email: string | null }>,
  payerEmail?: string | null,
): { id: string | null; reason: string } {
  if (!candidates.length) return { id: null, reason: 'no pending order of that amount in the last 72h' };
  const payer = String(payerEmail || '').trim().toLowerCase();
  if (payer) {
    const byEmail = candidates.filter(c => (c.client_email || '').trim().toLowerCase() === payer);
    if (byEmail.length === 1) return { id: byEmail[0]!.id, reason: 'amount + payer email' };
  }
  if (candidates.length === 1) return { id: candidates[0]!.id, reason: 'amount (only pending order)' };
  return { id: null, reason: `ambiguous: ${candidates.length} pending orders of that amount, none with the payer's email` };
}
