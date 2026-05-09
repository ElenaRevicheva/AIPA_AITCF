/**
 * hubspot-client.ts
 * Thin HubSpot CRM API v3 wrapper for the Aideazz Marketing Engine.
 *
 * Pushes outreach targets + triaged leads into HubSpot as:
 *   Contact (person) → associated with → Company → associated with → Deal
 *
 * Auth: Service Key (pat-na1-...) via Bearer header.
 * Scopes needed: crm.objects.contacts/companies/deals/owners read+write.
 *
 * HubSpot free-tier rate limit: 100 req / 10s.
 */

const HS_BASE = 'https://api.hubapi.com';
const HS_KEY  = () => process.env.HUBSPOT_API_KEY || '';

// ─── Deal pipeline stage IDs (HubSpot default pipeline) ──────────────────────
// Free-tier default pipeline uses these stage internal values.
export const HS_STAGES = {
  prospected:  'appointmentscheduled',   // Found / added to list
  contacted:   'qualifiedtobuy',         // Cold email / outreach sent
  engaged:     'presentationscheduled',  // Replied or shown interest
  negotiating: 'decisionmakerboughtin', // Active conversation
  won:         'closedwon',
  lost:        'closedlost',
} as const;
export type HSDealStage = typeof HS_STAGES[keyof typeof HS_STAGES];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HSContact {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  linkedinUrl?: string;
}

export interface HSDeal {
  id: string;
  name: string;
  stage: string;
  amount?: number;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function hsGet<T>(path: string): Promise<T | null> {
  const key = HS_KEY();
  if (!key) return null;
  const res = await fetch(`${HS_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    console.error(`[HubSpot] GET ${path} → ${res.status}: ${await res.text()}`);
    return null;
  }
  return res.json() as Promise<T>;
}

async function hsPost<T>(path: string, body: unknown): Promise<T | null> {
  const key = HS_KEY();
  if (!key) return null;
  const res = await fetch(`${HS_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    // 409 = already exists — not a real error for upserts
    if (res.status !== 409) console.error(`[HubSpot] POST ${path} → ${res.status}: ${txt}`);
    return null;
  }
  return res.json() as Promise<T>;
}

async function hsPatch<T>(path: string, body: unknown): Promise<T | null> {
  const key = HS_KEY();
  if (!key) return null;
  const res = await fetch(`${HS_BASE}${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`[HubSpot] PATCH ${path} → ${res.status}: ${await res.text()}`);
    return null;
  }
  return res.json() as Promise<T>;
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

/** Search for an existing contact by email. Returns HubSpot contact ID or null. */
export async function findContactByEmail(email: string): Promise<string | null> {
  if (!email) return null;
  const data = await hsPost<{ total: number; results: Array<{ id: string }> }>(
    '/crm/v3/objects/contacts/search',
    {
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
      properties: ['email'],
      limit: 1,
    },
  );
  return data?.results?.[0]?.id ?? null;
}

/** Create or update a contact. Returns HubSpot contact ID. */
export async function upsertContact(input: {
  email?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  company?: string | undefined;
  linkedinUrl?: string | undefined;
  source?: string | undefined;
  notes?: string | undefined;
}): Promise<string | null> {
  // Try to find existing by email first
  if (input.email) {
    const existingId = await findContactByEmail(input.email);
    if (existingId) {
      // Update existing
      await hsPatch(`/crm/v3/objects/contacts/${existingId}`, {
        properties: {
          ...(input.company    ? { company: input.company }          : {}),
          ...(input.linkedinUrl ? { hs_linkedin_url: input.linkedinUrl } : {}),
          ...(input.source     ? { lead_source: input.source }        : {}),
        },
      });
      console.log(`[HubSpot] Updated contact ${existingId} (${input.email})`);
      return existingId;
    }
  }

  // Parse name
  const nameParts = ((input.firstName || '') + ' ' + (input.lastName || '')).trim().split(' ');
  const firstName = input.firstName || nameParts[0] || '';
  const lastName  = input.lastName  || nameParts.slice(1).join(' ') || '';

  const data = await hsPost<{ id: string }>(
    '/crm/v3/objects/contacts',
    {
      properties: {
        ...(input.email     ? { email: input.email }               : {}),
        ...(firstName       ? { firstname: firstName }             : {}),
        ...(lastName        ? { lastname: lastName }               : {}),
        ...(input.company   ? { company: input.company }           : {}),
        ...(input.linkedinUrl ? { hs_linkedin_url: input.linkedinUrl } : {}),
        ...(input.source    ? { hs_lead_status: 'NEW', lead_source: input.source } : {}),
      },
    },
  );

  if (data?.id) console.log(`[HubSpot] Created contact ${data.id} (${input.email || input.firstName})`);
  return data?.id ?? null;
}

// ─── Companies ────────────────────────────────────────────────────────────────

export async function findCompanyByName(name: string): Promise<string | null> {
  const data = await hsPost<{ total: number; results: Array<{ id: string }> }>(
    '/crm/v3/objects/companies/search',
    {
      filterGroups: [{ filters: [{ propertyName: 'name', operator: 'EQ', value: name }] }],
      properties: ['name'],
      limit: 1,
    },
  );
  return data?.results?.[0]?.id ?? null;
}

export async function upsertCompany(input: {
  name: string;
  domain?: string | undefined;
  description?: string | undefined;
}): Promise<string | null> {
  const existing = await findCompanyByName(input.name);
  if (existing) return existing;

  const data = await hsPost<{ id: string }>(
    '/crm/v3/objects/companies',
    {
      properties: {
        name: input.name,
        ...(input.domain      ? { domain: input.domain }           : {}),
        ...(input.description ? { description: input.description } : {}),
      },
    },
  );

  if (data?.id) console.log(`[HubSpot] Created company ${data.id} (${input.name})`);
  return data?.id ?? null;
}

// ─── Deals ────────────────────────────────────────────────────────────────────

export async function createDeal(input: {
  name: string;
  stage?: HSDealStage | undefined;
  amount?: number | undefined;
  closeDate?: string | undefined;
  description?: string | undefined;
}): Promise<string | null> {
  const data = await hsPost<{ id: string }>(
    '/crm/v3/objects/deals',
    {
      properties: {
        dealname: input.name,
        dealstage: input.stage ?? HS_STAGES.prospected,
        pipeline: 'default',
        ...(input.amount      ? { amount: String(input.amount) }    : {}),
        ...(input.closeDate   ? { closedate: input.closeDate }      : {}),
        ...(input.description ? { description: input.description }  : {}),
      },
    },
  );

  if (data?.id) console.log(`[HubSpot] Created deal ${data.id} (${input.name})`);
  return data?.id ?? null;
}

// ─── Associations ─────────────────────────────────────────────────────────────

export async function associateContactCompany(contactId: string, companyId: string): Promise<void> {
  await hsPost(
    `/crm/v4/objects/contacts/${contactId}/associations/companies/${companyId}`,
    [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 1 }],
  );
}

export async function associateDealContact(dealId: string, contactId: string): Promise<void> {
  await hsPost(
    `/crm/v4/objects/deals/${dealId}/associations/contacts/${contactId}`,
    [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }],
  );
}

export async function associateDealCompany(dealId: string, companyId: string): Promise<void> {
  await hsPost(
    `/crm/v4/objects/deals/${dealId}/associations/companies/${companyId}`,
    [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 5 }],
  );
}

// ─── Notes (Engagements) ──────────────────────────────────────────────────────

export async function addNoteToContact(contactId: string, body: string): Promise<void> {
  const note = await hsPost<{ id: string }>('/crm/v3/objects/notes', {
    properties: {
      hs_note_body: body,
      hs_timestamp: new Date().toISOString(),
    },
  });
  if (note?.id) {
    await hsPost(
      `/crm/v4/objects/notes/${note.id}/associations/contacts/${contactId}`,
      [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
    );
  }
}

// ─── High-level: push one lead into HubSpot ───────────────────────────────────

export interface LeadForHubSpot {
  name: string;
  email?: string | undefined;
  company?: string | undefined;
  linkedinUrl?: string | undefined;
  source?: string | undefined;
  painPoint?: string | undefined;
  matchedSystem?: string | undefined;
  stage?: HSDealStage | undefined;
}

/**
 * Full pipeline: Contact → Company → Deal → Associations → Note.
 * Safe to call multiple times — upserts prevent duplicates.
 * Returns { contactId, companyId, dealId } or null on total failure.
 */
export async function pushLeadToHubSpot(lead: LeadForHubSpot): Promise<{
  contactId: string | null;
  companyId: string | null;
  dealId: string | null;
} | null> {
  if (!HS_KEY()) {
    console.warn('[HubSpot] HUBSPOT_API_KEY not set — skipping CRM push');
    return null;
  }

  try {
    // 1. Contact — skip if no email AND no name (nothing to identify by)
    //    When email is absent HubSpot still creates a contact by name (useful for
    //    company-sourced prospects where we don't yet have a personal email).
    const [firstName, ...rest] = lead.name.trim().split(' ');
    const contactId = lead.email || lead.name
      ? await upsertContact({
          email:        lead.email,
          firstName:    firstName ?? lead.name,
          lastName:     rest.join(' ') || undefined,
          company:      lead.company,
          linkedinUrl:  lead.linkedinUrl,
          source:       lead.source ?? 'AI Marketing Engine',
        })
      : null;

    // 2. Company — use explicit company field, fallback to name for company-sourced leads
    const companyName = lead.company || (lead.email ? undefined : lead.name);
    const companyId = companyName
      ? await upsertCompany({ name: companyName })
      : null;

    // 3. Deal
    const dealName = lead.company
      ? `${lead.company} — outreach`
      : `${lead.name} — outreach`;

    const dealId = await createDeal({
      name:        dealName,
      stage:       lead.stage ?? HS_STAGES.prospected,
      description: [
        lead.painPoint     ? `Pain point: ${lead.painPoint}`         : null,
        lead.matchedSystem ? `Matched system: ${lead.matchedSystem}` : null,
        lead.source        ? `Source: ${lead.source}`                : null,
      ].filter(Boolean).join('\n') || undefined,
    });

    // 4. Associations
    if (contactId && companyId) await associateContactCompany(contactId, companyId);
    if (dealId && contactId)    await associateDealContact(dealId, contactId);
    if (dealId && companyId)    await associateDealCompany(dealId, companyId);

    // 5. Note
    if (contactId && (lead.painPoint || lead.matchedSystem)) {
      const noteBody = [
        `Source: ${lead.source ?? 'AI Marketing Engine'}`,
        lead.painPoint     ? `Pain point: ${lead.painPoint}`         : null,
        lead.matchedSystem ? `Matched system: ${lead.matchedSystem}` : null,
        lead.email         ? `Email: ${lead.email}`                  : null,
        lead.linkedinUrl   ? `LinkedIn: ${lead.linkedinUrl}`         : null,
      ].filter(Boolean).join('\n');
      await addNoteToContact(contactId, noteBody);
    }

    console.log(`[HubSpot] ✅ Lead pushed — contact:${contactId} company:${companyId} deal:${dealId}`);
    return { contactId, companyId, dealId };

  } catch (err) {
    console.error('[HubSpot] pushLeadToHubSpot error:', err);
    return null;
  }
}

// ─── Stats for /hubspot command ───────────────────────────────────────────────

export async function getHubSpotStats(): Promise<{
  contacts: number;
  companies: number;
  deals: number;
} | null> {
  try {
    const [contacts, companies, deals] = await Promise.all([
      hsGet<{ total: number }>('/crm/v3/objects/contacts?limit=1&properties=email'),
      hsGet<{ total: number }>('/crm/v3/objects/companies?limit=1&properties=name'),
      hsGet<{ total: number }>('/crm/v3/objects/deals?limit=1&properties=dealname'),
    ]);
    return {
      contacts:  contacts?.total  ?? 0,
      companies: companies?.total ?? 0,
      deals:     deals?.total     ?? 0,
    };
  } catch {
    return null;
  }
}
