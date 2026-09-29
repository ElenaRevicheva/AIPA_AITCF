/**
 * A PAID service order → HubSpot: contact + company + deal in "🔥 I act TODAY" + task.
 *
 * Deliberately NOT pushLeadToHubSpot. That path is for prospects, and a paid order is
 * not a prospect (found 29 Sep 2026, before any order had ever been paid):
 *   - its keyword gate dropped every paid order — "outside Elena skill ICP";
 *   - it files deals in "🤖 AI working — ignore", named "… — outreach";
 *   - it attaches a cold-pitch "ACTION PACKAGE" draft to someone who just paid;
 *   - form-inquiry fields feed Make's Lead Concierge, which would draft a first reply.
 * Built from hubspot-client's own exported primitives, so that shared file is unchanged.
 */
import {
  HS_STAGES,
  upsertContact,
  upsertCompany,
  createDeal,
  associateContactCompany,
  associateDealContact,
  associateDealCompany,
  domainFromUrl,
  cleanDisplayName,
} from './hubspot-client.js';

const HS_BASE = 'https://api.hubapi.com';
const TASK_TO_DEAL = 216;

export interface PaidOrderForHubSpot {
  orderId: string;
  /** e.g. "Quick AI Growth Operator Diagnostic" */
  service: string;
  amountUsd: number;
  name: string | null;
  email: string;
  company: string | null;
  website: string | null;
  notes: string | null;
}

export function paidDealName(o: Pick<PaidOrderForHubSpot, 'service' | 'amountUsd' | 'name' | 'company'>): string {
  const who = (o.company || o.name || 'Client').trim();
  return `[CLIENT-SERVICE-PAID] ${who} — ${o.service} ($${o.amountUsd})`;
}

export async function createPaidOrderDeal(
  o: PaidOrderForHubSpot,
): Promise<{ contactId: string | null; companyId: string | null; dealId: string | null }> {
  if (!process.env.HUBSPOT_API_KEY) {
    console.error(`[paid-order] HUBSPOT_API_KEY not set — paid order ${o.orderId} NOT in HubSpot`);
    return { contactId: null, companyId: null, dealId: null };
  }
  const display = cleanDisplayName(o.name || o.company || o.email, o.company || undefined);
  const [firstName, ...rest] = display.split(' ');
  const contactId = await upsertContact({
    email: o.email,
    firstName: firstName || display,
    lastName: rest.join(' ') || undefined,
    company: o.company || undefined,
    source: 'aideazz_service_checkout',
  });
  const domain = domainFromUrl(o.website);
  const companyId = o.company
    ? await upsertCompany({ name: o.company, domain, website: o.website || undefined })
    : null;
  const dealId = await createDeal({
    name: paidDealName(o),
    stage: HS_STAGES.contacted, // 🔥 I act TODAY — a paid order is never "AI working — ignore"
    amount: o.amountUsd,
    dealType: 'newbusiness',
    description: [
      `PAID ${o.service} — $${o.amountUsd} via PagueloFacil`,
      `Order: ${o.orderId}`,
      `Email: ${o.email}`,
      o.website ? `Website: ${o.website}` : null,
      o.notes ? `Their answers / notes:\n${o.notes.slice(0, 1500)}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
  });
  if (contactId && companyId) await associateContactCompany(contactId, companyId);
  if (dealId && contactId) await associateDealContact(dealId, contactId);
  if (dealId && companyId) await associateDealCompany(dealId, companyId);
  console.log(`[paid-order] order ${o.orderId} → contact:${contactId} company:${companyId} deal:${dealId}`);
  return { contactId, companyId, dealId };
}

/** One task on a deal, assigned to Elena (Tasks → "Assigned to me"). */
export async function addTaskToDeal(
  dealId: string,
  task: { subject: string; body: string; priority: 'HIGH' | 'MEDIUM' | 'LOW'; due: Date },
): Promise<string | null> {
  const key = process.env.HUBSPOT_API_KEY;
  if (!key) return null;
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  try {
    const r = await fetch(`${HS_BASE}/crm/v3/objects/tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        properties: {
          hs_task_subject: task.subject,
          hs_task_body: task.body,
          hs_task_status: 'NOT_STARTED',
          hs_task_priority: task.priority,
          hs_timestamp: task.due.toISOString(),
          hubspot_owner_id: process.env.HUBSPOT_OWNER_ID || '91612860',
        },
      }),
    });
    const created = (await r.json().catch(() => ({}))) as { id?: string };
    if (!r.ok || !created.id) {
      console.error(`[paid-order] task create → ${r.status}`);
      return null;
    }
    const a = await fetch(`${HS_BASE}/crm/v4/objects/tasks/${created.id}/associations/deals/${dealId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: TASK_TO_DEAL }]),
    });
    if (!a.ok) console.error(`[paid-order] task ${created.id} → deal ${dealId} association ${a.status}`);
    return created.id;
  } catch (e) {
    console.error('[paid-order] task:', e);
    return null;
  }
}
