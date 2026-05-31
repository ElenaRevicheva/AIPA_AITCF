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

// ─── Enrichment helpers (May 31 2026) ─────────────────────────────────────────
// Used to fill HubSpot Company/Contact/Deal records with real, scannable data
// instead of bare names. See pushLeadToHubSpot + lead-triage quality gate.

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'hotmail.com',
  'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'proton.me', 'protonmail.com', 'pm.me', 'gmx.com', 'gmx.net',
  'mail.com', 'yandex.com', 'zoho.com', 'fastmail.com', 'hey.com', 'tutanota.com',
]);

/** True when the email is a personal/free webmail address (no company signal). */
export function isFreeEmailDomain(email?: string | null): boolean {
  if (!email || !email.includes('@')) return false;
  const dom = email.split('@')[1]?.toLowerCase().trim();
  return dom ? FREE_EMAIL_DOMAINS.has(dom) : false;
}

/** Extract a bare domain (no protocol/path/www) from a URL. */
export function domainFromUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    const u = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const host = new URL(u).hostname.replace(/^www\./i, '').toLowerCase();
    return host || undefined;
  } catch { return undefined; }
}

/** Company domain derived from a contact email — only when it is NOT free webmail. */
export function companyDomainFromEmail(email?: string | null): string | undefined {
  if (!email || !email.includes('@') || isFreeEmailDomain(email)) return undefined;
  return email.split('@')[1]?.toLowerCase().trim() || undefined;
}

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

/** Like findCompanyByName but also returns current enrichable props (to fill blanks only). */
async function findCompanyWithProps(name: string): Promise<{
  id: string;
  props: { domain?: string | undefined; website?: string | undefined; description?: string | undefined };
} | null> {
  const data = await hsPost<{ results: Array<{ id: string; properties: Record<string, string | null> }> }>(
    '/crm/v3/objects/companies/search',
    {
      filterGroups: [{ filters: [{ propertyName: 'name', operator: 'EQ', value: name }] }],
      properties: ['name', 'domain', 'website', 'description'],
      limit: 1,
    },
  );
  const hit = data?.results?.[0];
  if (!hit) return null;
  return {
    id: hit.id,
    props: {
      domain:      hit.properties.domain      || undefined,
      website:     hit.properties.website     || undefined,
      description: hit.properties.description || undefined,
    },
  };
}

export async function upsertCompany(input: {
  name: string;
  domain?: string | undefined;
  website?: string | undefined;
  description?: string | undefined;
}): Promise<string | null> {
  // Existing company → FILL BLANKS ONLY (never clobber operator-entered values).
  const existing = await findCompanyWithProps(input.name);
  if (existing) {
    const patch: Record<string, string> = {};
    if (input.domain      && !existing.props.domain)      patch.domain      = input.domain;
    if (input.website     && !existing.props.website)     patch.website     = input.website;
    if (input.description && !existing.props.description) patch.description = input.description;
    if (Object.keys(patch).length) {
      await hsPatch(`/crm/v3/objects/companies/${existing.id}`, { properties: patch });
      console.log(`[HubSpot] Enriched company ${existing.id} (${input.name}) +[${Object.keys(patch).join(',')}]`);
    }
    return existing.id;
  }

  const data = await hsPost<{ id: string }>(
    '/crm/v3/objects/companies',
    {
      properties: {
        name: input.name,
        ...(input.domain      ? { domain: input.domain }           : {}),
        ...(input.website     ? { website: input.website }         : {}),
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
  dealType?: string | undefined;
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
        ...(input.dealType    ? { dealtype: input.dealType }        : {}),
      },
    },
  );

  if (data?.id) console.log(`[HubSpot] Created deal ${data.id} (${input.name})`);
  return data?.id ?? null;
}

/**
 * Find existing deal by exact name match (most recent first). Returns deal id or null.
 * Used by upsert paths (lead-triage, fresh-leads-ingest) to avoid creating duplicates.
 */
export async function findDealByName(name: string): Promise<{ id: string; stage: string } | null> {
  try {
    const data = await hsPost<{ results?: Array<{ id: string; properties: { dealstage: string } }> }>(
      '/crm/v3/objects/deals/search',
      {
        filterGroups: [{ filters: [{ propertyName: 'dealname', operator: 'EQ', value: name }] }],
        properties: ['dealname', 'dealstage'],
        sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
        limit: 1,
      },
    );
    const hit = data?.results?.[0];
    return hit ? { id: hit.id, stage: hit.properties.dealstage } : null;
  } catch (e) {
    console.warn('[HubSpot] findDealByName error:', (e as Error).message?.slice(0, 80));
    return null;
  }
}

/**
 * Update an existing deal's stage + optionally description.
 * Used by upsert flows after findDealByName().
 */
export async function updateDeal(dealId: string, input: {
  stage?: HSDealStage | undefined;
  description?: string | undefined;
}): Promise<boolean> {
  try {
    const props: Record<string, string> = {};
    if (input.stage) props.dealstage = input.stage;
    if (input.description) props.description = input.description;
    if (!Object.keys(props).length) return true;
    await hsPatch(`/crm/v3/objects/deals/${dealId}`, { properties: props });
    console.log(`[HubSpot] Updated deal ${dealId} → stage=${input.stage || '(unchanged)'}`);
    return true;
  } catch (e) {
    console.warn(`[HubSpot] updateDeal ${dealId} error:`, (e as Error).message?.slice(0, 80));
    return false;
  }
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
  /** Company website scraped at ingest time — used to populate company domain + website. */
  website?: string | undefined;
  /** Explicit company domain (overrides website/email-derived). */
  domain?: string | undefined;
  linkedinUrl?: string | undefined;
  source?: string | undefined;
  painPoint?: string | undefined;
  matchedSystem?: string | undefined;
  stage?: HSDealStage | undefined;
  /** e.g. 'CLIENT-CTO-INGEST' or 'CLIENT-ALGOM' — wrapped in [brackets] as dealname prefix */
  sourcePrefix?: string | undefined;
}

/** Collapse an ugly "X @ X" or redundant "Name @ Company" display name. */
export function cleanDisplayName(raw: string, company?: string | undefined): string {
  let name = (raw || '').trim();
  const parts = name.split(' @ ');
  if (parts.length === 2) {
    const left = parts[0]?.trim() || '';
    const right = parts[1]?.trim() || '';
    // "Laith0003 @ Laith0003" → "Laith0003"; "Founder @ Acme" / "Jane @ Acme" → keep left
    if (left && (left === right || right === (company || '').trim())) name = left;
  }
  return name;
}

/** Build a one-line, human-scannable company description from enrichment signals. */
function buildCompanyDescription(lead: LeadForHubSpot): string | undefined {
  const bits = [
    lead.matchedSystem ? `Best-fit AIdeazz system: ${lead.matchedSystem}` : null,
    lead.painPoint     ? `Likely pain: ${lead.painPoint}`                 : null,
    lead.source        ? `Discovered via ${lead.source}`                  : null,
  ].filter(Boolean);
  return bits.length ? bits.join(' · ') : undefined;
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
    const displayName = cleanDisplayName(lead.name, lead.company);
    const [firstName, ...rest] = displayName.split(' ');
    const contactId = lead.email || displayName
      ? await upsertContact({
          email:        lead.email,
          firstName:    firstName ?? displayName,
          lastName:     rest.join(' ') || undefined,
          company:      lead.company,
          linkedinUrl:  lead.linkedinUrl,
          source:       lead.source ?? 'AI Marketing Engine',
        })
      : null;

    // 2. Company — use explicit company field, fallback to name for company-sourced leads.
    //    Enrich with domain (explicit → website → real company email) + website + description
    //    so the Company record is scannable, not a bare name.
    const companyName = lead.company || (lead.email ? undefined : displayName);
    const companyDomain = lead.domain || domainFromUrl(lead.website) || companyDomainFromEmail(lead.email);
    const companyId = companyName
      ? await upsertCompany({
          name:        companyName,
          domain:      companyDomain,
          website:     lead.website || (companyDomain ? `https://${companyDomain}` : undefined),
          description: buildCompanyDescription(lead),
        })
      : null;

    // 3. Deal
    const baseDealName = lead.company
      ? `${lead.company} — outreach`
      : `${displayName} — outreach`;
    const dealName = lead.sourcePrefix
      ? `[${lead.sourcePrefix}] ${baseDealName}`
      : baseDealName;

    const dealId = await createDeal({
      name:        dealName,
      stage:       lead.stage ?? HS_STAGES.prospected,
      dealType:    'newbusiness',
      description: [
        lead.painPoint     ? `Pain point: ${lead.painPoint}`         : null,
        lead.matchedSystem ? `Matched system: ${lead.matchedSystem}` : null,
        lead.source        ? `Source: ${lead.source}`                : null,
        lead.website       ? `Website: ${lead.website}`              : null,
        lead.linkedinUrl   ? `LinkedIn: ${lead.linkedinUrl}`         : null,
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
  /** e.g. 'HIRING-VJH' or 'HIRING-VJH-SERP' — wrapped in [brackets] as dealname prefix */
  sourcePrefix?: string | undefined;
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
  // HONEST MODE (May 21 2026): VJH does NOT actually submit applications.
  // 'applied' really means "VJH found this lead — Elena must manually apply".
  // Stage routing reflects what Elena needs to ACT on, not application lifecycle fiction.
  const stageMap: Record<HiringStage, HSDealStage> = {
    applied:             HS_STAGES.contacted,           // \ud83d\udd25 YOU act TODAY (was: prospected/AI-working)
    recruiter_responded: 'contractsent' as HSDealStage, // \ud83d\udcac They replied \u2014 YOU act
    interview_scheduled: 'contractsent' as HSDealStage, // \ud83d\udcac They replied \u2014 YOU act
    offer_received:      'contractsent' as HSDealStage, // \ud83d\udcac They replied \u2014 YOU act
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
      name:  `[${input.sourcePrefix || 'HIRING'}] ${input.jobTitle} @ ${input.company}`,
      stage: stageId,
      description: [
        `Category: hiring`,
        `Stage: ${stage}`,
        input.jobUrl ? `Job URL: ${input.jobUrl}` : null,
        input.source ? `Source: ${input.source}`  : null,
        input.notes  ? `\n${input.notes}`          : null,
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

export interface ActionableDeal {
  id: string;
  dealname: string;
  stage: string;
  pipeline: string;
  amount?: string;
  lastModified: string;
}

/**
 * MAY 25 2026: Query HubSpot for deals that need ACTION RIGHT NOW.
 * Used by the CTO AIPA daily Telegram messages so the operator only sees
 * what to act on, not what was technically processed.
 *
 * Returns deals in stages that mean "needs my attention":
 *   Client pipeline: qualifiedtobuy ('I act today'), contractsent ('they replied')
 *   Hiring pipeline: recruiter_responded, interview_scheduled, offer_received
 *
 * Deals are sorted by lastModified desc so the freshest signals surface first.
 */
export async function getActionableHubSpotDeals(opts: {
  limit?: number;
  sinceHoursAgo?: number; // if set, only deals modified in last N hours
} = {}): Promise<ActionableDeal[]> {
  const limit = opts.limit ?? 25;
  const sinceHoursAgo = opts.sinceHoursAgo;

  // Stage IDs we care about. Some come from env (hiring pipeline), some are constants.
  const stageIds = [
    HS_STAGES.contacted,       // 'qualifiedtobuy' — client pipeline 'I act today'
    'contractsent',            // client pipeline 'they replied'
    HS_HIRING_STAGE_IDS.recruiter_responded(),
    HS_HIRING_STAGE_IDS.interview_scheduled(),
    HS_HIRING_STAGE_IDS.offer_received(),
  ].filter(Boolean) as string[];

  if (stageIds.length === 0) return [];

  const filters: Array<{ propertyName: string; operator: string; value?: string; values?: string[] }> = [
    { propertyName: 'dealstage', operator: 'IN', values: stageIds },
  ];
  if (sinceHoursAgo && sinceHoursAgo > 0) {
    const since = Date.now() - sinceHoursAgo * 60 * 60 * 1000;
    filters.push({ propertyName: 'hs_lastmodifieddate', operator: 'GTE', value: String(since) });
  }

  try {
    const body = {
      filterGroups: [{ filters }],
      properties: ['dealname', 'dealstage', 'pipeline', 'amount', 'hs_lastmodifieddate'],
      sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
      limit,
    };
    const resp = await hsPost<{ results: Array<{ id: string; properties: Record<string, string> }> }>(
      '/crm/v3/objects/deals/search',
      body,
    );
    return (resp?.results || []).map(r => {
      const out: ActionableDeal = {
        id: r.id,
        dealname: r.properties.dealname || '(unnamed)',
        stage: r.properties.dealstage || '',
        pipeline: r.properties.pipeline || '',
        lastModified: r.properties.hs_lastmodifieddate || '',
      };
      if (r.properties.amount) out.amount = r.properties.amount;
      return out;
    });
  } catch {
    return [];
  }
}

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
