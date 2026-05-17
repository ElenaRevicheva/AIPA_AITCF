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

// ─── Client Pipeline — HubSpot default pipeline stage IDs ────────────────────
export const HS_STAGES = {
  prospected:  'appointmentscheduled',
  contacted:   'qualifiedtobuy',
  engaged:     'presentationscheduled',
  negotiating: 'decisionmakerboughtin',
  won:         'closedwon',
  lost:        'closedlost',
} as const;
export type HSDealStage = typeof HS_STAGES[keyof typeof HS_STAGES];

// ─── Hiring Pipeline — stage IDs written to env after one-time setup ─────────
// Run POST /api/crm-pipeline/setup once to create the pipeline and get these IDs.
export const HS_HIRING_PIPELINE_ID  = () => process.env.HUBSPOT_HIRING_PIPELINE_ID  || '';
export const HS_HIRING_STAGE_IDS = {
  applied:             () => process.env.HUBSPOT_HIRING_STAGE_APPLIED             || '',
  recruiter_responded: () => process.env.HUBSPOT_HIRING_STAGE_RECRUITER_RESPONDED || '',
  interview_scheduled: () => process.env.HUBSPOT_HIRING_STAGE_INTERVIEW_SCHEDULED || '',
  offer_received:      () => process.env.HUBSPOT_HIRING_STAGE_OFFER_RECEIVED      || '',
  accepted:            () => process.env.HUBSPOT_HIRING_STAGE_ACCEPTED            || '',
  declined:            () => process.env.HUBSPOT_HIRING_STAGE_DECLINED            || '',
} as const;
export type HiringStage = keyof typeof HS_HIRING_STAGE_IDS;

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

async function hsPut<T>(path: string, body: unknown): Promise<T | null> {
  const key = HS_KEY();
  if (!key) return null;
  const res = await fetch(`${HS_BASE}${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    if (res.status !== 409) console.error(`[HubSpot] PUT ${path} → ${res.status}: ${txt}`);
    return null;
  }
  // 204 No Content is success for associations
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
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
        ...(input.source    ? { hs_lead_status: 'NEW' } : {}),
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
  // CRM v4 associations require PUT, not POST
  await hsPut(
    `/crm/v4/objects/contacts/${contactId}/associations/companies/${companyId}`,
    [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 1 }],
  );
}

export async function associateDealContact(dealId: string, contactId: string): Promise<void> {
  await hsPut(
    `/crm/v4/objects/deals/${dealId}/associations/contacts/${contactId}`,
    [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }],
  );
}

export async function associateDealCompany(dealId: string, companyId: string): Promise<void> {
  await hsPut(
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
    await hsPut(
      `/crm/v4/objects/notes/${note.id}/associations/contacts/${contactId}`,
      [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
    );
  }
}

export async function addNoteToDeal(dealId: string, body: string): Promise<void> {
  const note = await hsPost<{ id: string }>('/crm/v3/objects/notes', {
    properties: {
      hs_note_body: body,
      hs_timestamp: new Date().toISOString(),
    },
  });
  if (note?.id) {
    await hsPut(
      `/crm/v4/objects/notes/${note.id}/associations/deals/${dealId}`,
      [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }],
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

// ─── Deals (pipeline-aware) ───────────────────────────────────────────────────

/** Create a deal in any pipeline. Use for Hiring Pipeline deals. */
export async function createDealInPipeline(input: {
  name: string;
  pipelineId: string;
  stageId: string;
  amount?: number | undefined;
  closeDate?: string | undefined;
  description?: string | undefined;
}): Promise<string | null> {
  const data = await hsPost<{ id: string }>(
    '/crm/v3/objects/deals',
    {
      properties: {
        dealname:  input.name,
        dealstage: input.stageId,
        pipeline:  input.pipelineId,
        ...(input.amount      ? { amount: String(input.amount) }   : {}),
        ...(input.closeDate   ? { closedate: input.closeDate }     : {}),
        ...(input.description ? { description: input.description } : {}),
      },
    },
  );
  if (data?.id) console.log(`[HubSpot] Created deal ${data.id} in pipeline ${input.pipelineId}`);
  return data?.id ?? null;
}

// ─── One-time Hiring Pipeline setup ──────────────────────────────────────────

type PipelineStageResponse = { id: string; label: string };
type PipelineCreateResponse = { id: string; stages: PipelineStageResponse[] };

/**
 * Creates the "Hiring Pipeline" in HubSpot with 6 stages.
 * Call once via POST /api/crm-pipeline/setup — returns env vars to add to Oracle .env.
 * Safe to skip if HUBSPOT_HIRING_PIPELINE_ID is already set.
 */
export async function createHiringPipeline(): Promise<{
  pipelineId: string;
  stageIds: Record<string, string>;
  envVars: string;
} | null> {
  if (HS_HIRING_PIPELINE_ID()) {
    return {
      pipelineId: HS_HIRING_PIPELINE_ID(),
      stageIds: Object.fromEntries(
        Object.entries(HS_HIRING_STAGE_IDS).map(([k, fn]) => [k, fn()])
      ),
      envVars: '(already configured)',
    };
  }

  const data = await hsPost<PipelineCreateResponse>('/crm/v3/pipelines/deals', {
    label: 'Hiring Pipeline',
    displayOrder: 2,
    stages: [
      { label: 'Applied',              displayOrder: 0, metadata: { probability: '0.1' } },
      { label: 'Recruiter Responded',  displayOrder: 1, metadata: { probability: '0.2' } },
      { label: 'Interview Scheduled',  displayOrder: 2, metadata: { probability: '0.4' } },
      { label: 'Offer Received',       displayOrder: 3, metadata: { probability: '0.7' } },
      { label: 'Accepted',             displayOrder: 4, metadata: { probability: '1.0', isClosed: 'true' } },
      { label: 'Declined',             displayOrder: 5, metadata: { probability: '0.0', isClosed: 'true' } },
    ],
  });

  if (!data?.id) return null;

  const stageMap: Record<string, string> = {};
  const keyOrder: HiringStage[] = ['applied', 'recruiter_responded', 'interview_scheduled', 'offer_received', 'accepted', 'declined'];
  for (let i = 0; i < keyOrder.length; i++) {
    stageMap[keyOrder[i]!] = data.stages[i]?.id ?? '';
  }

  const envVars = [
    `HUBSPOT_HIRING_PIPELINE_ID=${data.id}`,
    `HUBSPOT_HIRING_STAGE_APPLIED=${stageMap.applied}`,
    `HUBSPOT_HIRING_STAGE_RECRUITER_RESPONDED=${stageMap.recruiter_responded}`,
    `HUBSPOT_HIRING_STAGE_INTERVIEW_SCHEDULED=${stageMap.interview_scheduled}`,
    `HUBSPOT_HIRING_STAGE_OFFER_RECEIVED=${stageMap.offer_received}`,
    `HUBSPOT_HIRING_STAGE_ACCEPTED=${stageMap.accepted}`,
    `HUBSPOT_HIRING_STAGE_DECLINED=${stageMap.declined}`,
  ].join('\n');

  console.log(`[HubSpot] ✅ Hiring Pipeline created: ${data.id}\n${envVars}`);
  return { pipelineId: data.id, stageIds: stageMap, envVars };
}

// ─── High-level: push a job application into HubSpot Hiring Pipeline ─────────

export interface HiringDealInput {
  jobTitle: string;
  company: string;
  domain?: string | undefined;
  recruiterEmail?: string | undefined;
  recruiterName?: string | undefined;
  jobUrl?: string | undefined;
  source?: string | undefined;
  stage?: HiringStage | undefined;
  score?: number | undefined;
  notes?: string | undefined;
}

/**
 * Contact (recruiter) → Company → Deal in Hiring Pipeline → Associations.
 * Falls back gracefully if pipeline not yet configured.
 */
export async function pushHiringDealToHubSpot(input: HiringDealInput): Promise<{
  contactId: string | null;
  companyId: string | null;
  dealId: string | null;
} | null> {
  if (!HS_KEY()) {
    console.warn('[HubSpot] HUBSPOT_API_KEY not set — skipping hiring push');
    return null;
  }
  // Free HubSpot tier = single pipeline only.
  // Strategy: use Sales Pipeline + [HIRING] prefix + structured description for easy filtering.
  const pipelineId = 'default';
  // Map hiring stages to Sales Pipeline stages (closest semantic match)
  const stageMap: Record<HiringStage, HSDealStage> = {
    applied:             HS_STAGES.prospected,          // Appointment Scheduled
    recruiter_responded: HS_STAGES.contacted,           // Qualified to Buy
    interview_scheduled: HS_STAGES.engaged,             // Presentation Scheduled
    offer_received:      HS_STAGES.negotiating,         // Decision Maker Bought-In
    accepted:            HS_STAGES.won,
    declined:            HS_STAGES.lost,
  };
  const stage = input.stage ?? 'applied';
  const stageId = stageMap[stage];
  console.log(`[HubSpot] Hiring deal → pipeline=default stage=${stageId} (hiring stage=${stage})`);

  try {
    const contactId = input.recruiterEmail || input.recruiterName
      ? await upsertContact({
          email:     input.recruiterEmail,
          firstName: input.recruiterName?.split(' ')[0],
          lastName:  input.recruiterName?.split(' ').slice(1).join(' ') || undefined,
          company:   input.company,
          source:    input.source ?? 'VJH Job Application',
        })
      : null;

    const companyId = await upsertCompany({
      name:   input.company,
      domain: input.domain,
    });

    const dealId = await createDeal({
      name:  `[HIRING] ${input.jobTitle} @ ${input.company}`,
      stage: stageId,
      description: [
        `Category: hiring`,
        `Stage: ${stage}`,
        input.jobUrl ? `Job URL: ${input.jobUrl}` : null,
        input.source ? `Source: ${input.source}`  : null,
              input.notes  ? `
${input.notes}` : null,
].filter(Boolean).join('\n'),
    });

    if (contactId && companyId) await associateContactCompany(contactId, companyId);
    if (dealId && contactId)    await associateDealContact(dealId, contactId);
    if (dealId && companyId)    await associateDealCompany(dealId, companyId);

    // Attach actionable Note engagement so Elena sees score + URL in Notes tab
    if (dealId) {
      const noteLines: string[] = [];
      if (input.score)  noteLines.push(`Score: ${input.score}/100`);
      if (input.jobUrl) noteLines.push(`Apply: ${input.jobUrl}`);
      if (input.notes)  noteLines.push(input.notes);
      if ((input.stage as string) === 'human_pending') noteLines.push('⚠️ NEEDS MANUAL APPLY — click link above');
      if (noteLines.length) await addNoteToDeal(dealId, noteLines.join('\n'));
    }

    console.log(`[HubSpot] ✅ Hiring deal pushed — "${input.jobTitle} @ ${input.company}" contact:${contactId} deal:${dealId}`);
    return { contactId, companyId, dealId };
  } catch (err) {
    console.error('[HubSpot] pushHiringDealToHubSpot error:', err);
    return null;
  }
}

// ─── Stats for /hubspot command ───────────────────────────────────────────────

export async function getHubSpotStats(): Promise<{
  contacts: number;
  companies: number;
  deals: number;
} | null> {
  // HubSpot list endpoint (/crm/v3/objects/*) does NOT return a `total` field.
  // Use the search endpoint instead — it always returns `total` with the full count.
  try {
    const [contacts, companies, deals] = await Promise.all([
      hsPost<{ total: number }>('/crm/v3/objects/contacts/search',  { filterGroups: [], properties: ['email'],    limit: 1 }),
      hsPost<{ total: number }>('/crm/v3/objects/companies/search', { filterGroups: [], properties: ['name'],     limit: 1 }),
      hsPost<{ total: number }>('/crm/v3/objects/deals/search',     { filterGroups: [], properties: ['dealname'], limit: 1 }),
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
