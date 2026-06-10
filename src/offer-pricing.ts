/**
 * offer-pricing.ts — Revenue Cockpit Phase 2 (June 10 2026)
 *
 * Elena's confirmed service menu. Used to attach an ESTIMATED deal value to
 * every gated client lead so HubSpot shows pipeline $ and the daily brief can
 * prioritize by money. Amounts are deal ESTIMATES (what the lead is worth if
 * closed) — never quoted publicly; Elena quotes whatever she wants live.
 *
 * Matching is deliberately cheap keyword logic over the buying-intent label
 * (which the LLM gate already produced) — no extra LLM calls, no extra cost.
 */

export interface Offer {
  key: string;
  label: string;
  amount: number;        // USD — deal estimate written to HubSpot
  cadence: 'one-time' | 'per month' | 'per project';
}

export const OFFERS: Record<string, Offer> = {
  fractional_cto:   { key: 'fractional_cto',   label: 'Fractional CTO retainer',     amount: 2500, cadence: 'per month' },
  agent_build:      { key: 'agent_build',      label: 'Custom AI agent build',       amount: 5000, cadence: 'per project' },
  marketing_engine: { key: 'marketing_engine', label: 'AI Marketing Engine setup',   amount: 3000, cadence: 'one-time' },
  revops:           { key: 'revops',           label: 'AI Ops / RevOps setup',       amount: 2500, cadence: 'one-time' },
  automation:       { key: 'automation',       label: 'AI Automation package',       amount: 1500, cadence: 'per project' },
  catalyst:         { key: 'catalyst',         label: 'AI Catalyst sprint',          amount: 1200, cadence: 'one-time' },
};

/** Keyword → offer routing. First match wins; order = highest-signal first. */
const RULES: Array<{ offer: keyof typeof OFFERS; re: RegExp }> = [
  // Someone wants a CTO / technical co-founder / technical leadership
  { offer: 'fractional_cto',   re: /\b(cto|technical co-?founder|tech co-?founder|technical leadership|technical partner)\b/i },
  // Someone wants a thing BUILT (app/MVP/platform/agent/bot/website/software)
  { offer: 'agent_build',      re: /\b(build|building|develop|developing|create|creating)\b.{0,60}\b(app|mvp|platform|saas|agent|bot|website|web site|software|product|tool|store)\b/i },
  { offer: 'agent_build',      re: /\b(ai agent|chatbot|voice agent|developer to|someone to build)\b/i },
  // Marketing / content / SEO / leads-from-content
  { offer: 'marketing_engine', re: /\b(marketing|seo|geo|aeo|content engine|blog|social media|brand visibility|discoverability)\b/i },
  // CRM / sales pipeline / revenue ops
  { offer: 'revops',           re: /\b(crm|hubspot|sales pipeline|rev ?ops|lead (gen|generation|capture|qualification)|sales process|follow-?ups?)\b/i },
  // Workflow automation
  { offer: 'automation',       re: /\b(automat(e|ion|ing)|workflow|integrat(e|ion)|zapier|make\.com|n8n|streamline)\b/i },
];

/**
 * Match a lead's intent text (gate label + title + snippet) to the best offer.
 * Falls back to the Catalyst sprint — the cheap entry product every real
 * prospect can be pitched first.
 */
export function matchOfferToIntent(intentText: string): Offer {
  const t = (intentText || '').slice(0, 500);
  for (const r of RULES) {
    if (r.re.test(t)) return OFFERS[r.offer]!;
  }
  return OFFERS.catalyst!;
}

/** "$2,500/mo" / "$5,000" style short renderer for briefs and notes. */
export function renderOfferEstimate(o: Offer): string {
  const usd = `$${o.amount.toLocaleString('en-US')}`;
  return o.cadence === 'per month' ? `${usd}/mo` : usd;
}
