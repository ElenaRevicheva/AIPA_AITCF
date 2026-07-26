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

// Placeholder/example domains that appear in README templates — never a real company.
const PLACEHOLDER_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net', 'acme.com', 'yourco.com',
  'yourcompany.com', 'company.com', 'domain.com', 'email.com', 'test.com',
  'mycompany.com', 'sample.com', 'foo.com', 'bar.com', 'localhost',
]);

/** Company domain derived from a contact email — only when it is NOT free webmail
 *  and NOT a known placeholder/example domain (those would fabricate wrong data). */
export function companyDomainFromEmail(email?: string | null): string | undefined {
  if (!email || !email.includes('@') || isFreeEmailDomain(email)) return undefined;
  const dom = email.split('@')[1]?.toLowerCase().trim();
  if (!dom || PLACEHOLDER_DOMAINS.has(dom)) return undefined;
  return dom;
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

async function hsDelete(path: string): Promise<boolean> {
  const key = HS_KEY();
  if (!key) return false;
  const res = await fetch(`${HS_BASE}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok && res.status !== 404) {
    console.error(`[HubSpot] DELETE ${path} → ${res.status}: ${await res.text()}`);
    return false;
  }
  return true;
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

/** Distinctive stamp for portfolio-form contacts — Make filter: Equals portfolio_inquiry. */
export const AIDEAZZ_LEAD_KIND_PROP = 'aideazz_lead_kind';
export const PORTFOLIO_INQUIRY_KIND = 'portfolio_inquiry';
/** Always-writable stamp (no custom-property scope needed). Make filter: message Contains this. */
export const AIDEAZZ_FORM_MESSAGE_STAMP = '[AIDEAZZ-FORM]';

const DEFAULT_CONCIERGE_TEST_EMAILS = [
  'adamvelena@gmail.com',
  'marinakulaginabowen@gmail.com',
  'kiravelerevich@gmail.com',
];

/** Allowlisted test inboxes that may force-recreate the HubSpot contact so Make's Contacts/Created fires. */
export function isConciergeTestEmail(email?: string | null): boolean {
  if (!email) return false;
  const raw =
    process.env.CONCIERGE_TEST_EMAILS?.trim() ||
    DEFAULT_CONCIERGE_TEST_EMAILS.join(',');
  const allow = new Set(
    raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
  return allow.has(email.trim().toLowerCase());
}

/** Prefix inquiry text so Make can filter form leads without a custom HubSpot property. */
export function stampPortfolioInquiryMessage(message?: string | null): string | undefined {
  if (!message?.trim()) return `${AIDEAZZ_FORM_MESSAGE_STAMP}`;
  const trimmed = message.trim();
  if (trimmed.startsWith(AIDEAZZ_FORM_MESSAGE_STAMP)) return trimmed.slice(0, 5000);
  return `${AIDEAZZ_FORM_MESSAGE_STAMP} ${trimmed}`.slice(0, 5000);
}

export function stripPortfolioInquiryStamp(message?: string | null): string {
  if (!message) return '';
  return message.replace(/^\[AIDEAZZ-FORM\]\s*/i, '').trim();
}

let leadKindPropReady: Promise<boolean> | null = null;

/**
 * Ensure custom contact property aideazz_lead_kind exists (idempotent).
 * Private app often lacks `crm.schemas.contacts.write` — then returns false and
 * callers rely on the [AIDEAZZ-FORM] message stamp instead (Make can filter either).
 */
export function ensureAideazzLeadKindProperty(): Promise<boolean> {
  if (!leadKindPropReady) {
    leadKindPropReady = (async () => {
      const key = HS_KEY();
      if (!key) return false;
      const get = await fetch(
        `${HS_BASE}/crm/v3/properties/contacts/${AIDEAZZ_LEAD_KIND_PROP}`,
        { headers: { Authorization: `Bearer ${key}` } },
      );
      if (get.ok) return true;
      const create = await fetch(`${HS_BASE}/crm/v3/properties/contacts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: AIDEAZZ_LEAD_KIND_PROP,
          label: 'AIdeazz Lead Kind',
          type: 'string',
          fieldType: 'text',
          groupName: 'contactinformation',
          description:
            'portfolio_inquiry = aideazz.xyz contact form. Make Lead Concierge filters on this.',
        }),
      });
      if (create.ok || create.status === 409) return true;
      // 403 = missing schemas scope — Elena can create the property once in HubSpot UI.
      console.warn(
        `[HubSpot] ${AIDEAZZ_LEAD_KIND_PROP} unavailable (${create.status}) — Make filter on message Contains ${AIDEAZZ_FORM_MESSAGE_STAMP} instead`,
      );
      leadKindPropReady = Promise.resolve(false);
      return false;
    })();
  }
  return leadKindPropReady;
}

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

export type ConciergeContactHit = {
  id: string;
  email: string;
  firstname: string;
  lastname: string;
  message: string;
};

/**
 * Contacts created in the last N minutes. Lead Concierge uses this to resolve
 * the reply recipient when Make only forwards the Fable 5 draft text.
 */
export async function findRecentContacts(sinceMinutes: number): Promise<ConciergeContactHit[]> {
  const since = Date.now() - sinceMinutes * 60_000;
  // Found July 16 2026: HubSpot's own account-level CalendarSync / OnboardingDataSync
  // (auto-imports every person you've ever emailed/met, triggered by connecting Gmail/
  // Calendar — landed a ~90-contact burst right after the Starter-plan upgrade) can flood
  // this window with recruiters/newsletters/vendors who never touched the portfolio form.
  // Real cto-aipa-created contacts always carry this private app's id here — scope to it
  // so the concierge never drafts a "thanks for your portfolio inquiry" reply to someone
  // who just happens to be in Elena's inbox history.
  const OWN_APP_ID = '39045903';
  const data = await hsPost<{ results: Array<{ id: string; properties: Record<string, string | null> }> }>(
    '/crm/v3/objects/contacts/search',
    {
      filterGroups: [{
        filters: [
          { propertyName: 'createdate', operator: 'GTE', value: String(since) },
          { propertyName: 'hs_analytics_source_data_2', operator: 'EQ', value: OWN_APP_ID },
        ],
      }],
      properties: ['email', 'firstname', 'lastname', 'message'],
      sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
      limit: 10,
    },
  );
  return (data?.results ?? []).map((r) => ({
    id: r.id,
    email: r.properties?.email ?? '',
    firstname: r.properties?.firstname ?? '',
    lastname: r.properties?.lastname ?? '',
    message: r.properties?.message ?? '',
  }));
}

/**
 * Portfolio-form recipients for Lead Concierge — includes REUSED contacts.
 *
 * Make watches Contacts/Created, so a re-test with the same email only creates a new
 * deal on the old contact. findRecentContacts() misses those; this looks at:
 *   1) contacts stamped aideazz_lead_kind=portfolio_inquiry and recently modified
 *   2) contacts associated to recently created [CLIENT-CTO-INQUIRY] deals
 */
export async function findRecentInquiryContacts(sinceMinutes: number): Promise<ConciergeContactHit[]> {
  const since = Date.now() - sinceMinutes * 60_000;
  const byId = new Map<string, ConciergeContactHit>();

  const mapHit = (r: { id: string; properties?: Record<string, string | null> }): ConciergeContactHit => ({
    id: r.id,
    email: r.properties?.email ?? '',
    firstname: r.properties?.firstname ?? '',
    lastname: r.properties?.lastname ?? '',
    message: stripPortfolioInquiryStamp(r.properties?.message ?? ''),
  });

  // Path A: custom property (only if Elena created it in HubSpot UI / schemas scope)
  const propOk = await ensureAideazzLeadKindProperty();
  if (propOk) {
    const stamped = await hsPost<{ results: Array<{ id: string; properties: Record<string, string | null> }> }>(
      '/crm/v3/objects/contacts/search',
      {
        filterGroups: [{
          filters: [
            { propertyName: AIDEAZZ_LEAD_KIND_PROP, operator: 'EQ', value: PORTFOLIO_INQUIRY_KIND },
            { propertyName: 'lastmodifieddate', operator: 'GTE', value: String(since) },
          ],
        }],
        properties: ['email', 'firstname', 'lastname', 'message'],
        sorts: [{ propertyName: 'lastmodifieddate', direction: 'DESCENDING' }],
        limit: 10,
      },
    );
    for (const r of stamped?.results ?? []) byId.set(r.id, mapHit(r));
  }

  // Path B: message stamp (always works — no custom property required)
  const msgStamped = await hsPost<{ results: Array<{ id: string; properties: Record<string, string | null> }> }>(
    '/crm/v3/objects/contacts/search',
    {
      filterGroups: [{
        filters: [
          { propertyName: 'message', operator: 'CONTAINS_TOKEN', value: 'AIDEAZZ-FORM' },
          { propertyName: 'lastmodifieddate', operator: 'GTE', value: String(since) },
        ],
      }],
      properties: ['email', 'firstname', 'lastname', 'message'],
      sorts: [{ propertyName: 'lastmodifieddate', direction: 'DESCENDING' }],
      limit: 10,
    },
  );
  for (const r of msgStamped?.results ?? []) {
    if (!byId.has(r.id)) byId.set(r.id, mapHit(r));
  }

  const deals = await hsPost<{ results: Array<{ id: string }> }>(
    '/crm/v3/objects/deals/search',
    {
      filterGroups: [{
        filters: [
          { propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: 'CLIENT-CTO-INQUIRY' },
          { propertyName: 'createdate', operator: 'GTE', value: String(since) },
        ],
      }],
      properties: ['dealname'],
      sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
      limit: 10,
    },
  );
  for (const deal of deals?.results ?? []) {
    const assoc = await hsGet<{ results?: Array<{ toObjectId?: string; id?: string }> }>(
      `/crm/v4/objects/deals/${deal.id}/associations/contacts`,
    );
    for (const row of assoc?.results ?? []) {
      const cid = row.toObjectId || row.id;
      if (!cid || byId.has(cid)) continue;
      const c = await hsGet<{ id: string; properties?: Record<string, string | null> }>(
        `/crm/v3/objects/contacts/${cid}?properties=email,firstname,lastname,message`,
      );
      if (!c?.id) continue;
      byId.set(c.id, mapHit(c));
    }
  }

  return [...byId.values()];
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
  /** Inquiry text → contact `message` property (Make Lead Concierge reads it). */
  message?: string | undefined;
  /** When set, stamps aideazz_lead_kind so Make can filter form leads vs radar junk. */
  leadKind?: string | undefined;
  /**
   * Delete+recreate when email already exists (Make Contacts/Created only fires on create).
   * Used for CONCIERGE_TEST_EMAILS re-tests — do not use for real buyer re-inquiries.
   */
  forceRecreate?: boolean | undefined;
}): Promise<string | null> {
  const propOk = input.leadKind ? await ensureAideazzLeadKindProperty() : false;
  const kindProps =
    input.leadKind && propOk ? { [AIDEAZZ_LEAD_KIND_PROP]: input.leadKind } : {};
  const messageValue =
    input.leadKind && input.message !== undefined
      ? stampPortfolioInquiryMessage(input.message)
      : input.message
        ? input.message.slice(0, 5000)
        : input.leadKind
          ? stampPortfolioInquiryMessage('')
          : undefined;

  // Try to find existing by email first
  if (input.email) {
    const existingId = await findContactByEmail(input.email);
    if (existingId && input.forceRecreate) {
      const ok = await hsDelete(`/crm/v3/objects/contacts/${existingId}`);
      console.log(
        `[HubSpot] ${ok ? 'Deleted' : 'Failed to delete'} contact ${existingId} for concierge re-test (${input.email})`,
      );
    } else if (existingId) {
      // Update existing
      // Never send `lead_source` — not in this HubSpot portal schema (PATCH 400).
      // Source lives on the deal name prefix + contact note instead.
      await hsPatch(`/crm/v3/objects/contacts/${existingId}`, {
        properties: {
          ...(input.company    ? { company: input.company }          : {}),
          ...(input.linkedinUrl ? { hs_linkedin_url: input.linkedinUrl } : {}),
          ...(input.source     ? { hs_lead_status: 'NEW' }           : {}),
          ...(messageValue !== undefined ? { message: messageValue } : {}),
          ...kindProps,
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
        ...(messageValue !== undefined ? { message: messageValue } : {}),
        ...kindProps,
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

/** Deal IDs associated with a contact (Concierge drafts park on the right deal). */
export async function findDealIdsForContact(contactId: string): Promise<string[]> {
  try {
    const data = await hsGet<{ results?: Array<{ toObjectId?: string; id?: string }> }>(
      `/crm/v4/objects/contacts/${contactId}/associations/deals`,
    );
    if (!data?.results?.length) return [];
    return data.results
      .map(r => r.toObjectId || r.id)
      .filter((id): id is string => !!id);
  } catch (e) {
    console.warn('[HubSpot] findDealIdsForContact error:', (e as Error).message?.slice(0, 80));
    return [];
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

/** Escape plain text for HubSpot HTML notes. */
function escHs(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

function hsLink(url: string, label: string): string {
  const u = url.trim();
  if (!u) return '';
  const href = u.startsWith('http') ? u : `https://${u}`;
  return `<a href="${href.replace(/"/g, '&quot;')}">${escHs(label)}</a>`;
}

/**
 * Hiring action package — Elena opens the deal and can Apply + paste the letter.
 * Always includes MANUAL APPLY (VJH does not submit).
 */
export function buildHiringActionPackage(input: {
  jobTitle: string;
  company: string;
  jobUrl?: string | undefined;
  score?: number | undefined;
  recruiterName?: string | undefined;
  recruiterEmail?: string | undefined;
  coverLetter?: string | undefined;
  notes?: string | undefined;
  source?: string | undefined;
}): string {
  const extracted =
    (input.coverLetter || '').trim() ||
    // VJH sometimes embeds the letter inside opaque notes
    (() => {
      const n = input.notes || '';
      const m = n.match(/(?:COVER\s*LETTER|cover letter)\s*[:\-]?\s*([\s\S]{80,})/i);
      return m?.[1]?.trim() || '';
    })();
  // Always park a paste-ready letter — even when VJH omits coverLetter
  const letter =
    extracted ||
    [
      `Dear Hiring Manager,`,
      ``,
      `I am writing to apply for the ${input.jobTitle} role at ${input.company}.`,
      ``,
      `I build AI-augmented products end-to-end (bots, LLM wiring, automation, GEO/AEO) and would welcome the chance to contribute on this team.`,
      ``,
      input.jobUrl ? `Role link: ${input.jobUrl}` : '',
      ``,
      `[Edit this stub — add 1–2 proof points from your resume, then paste into the apply form.]`,
      ``,
      `Best regards,`,
      `Elena Revicheva`,
      `https://aideazz.xyz`,
    ].filter(l => l !== null && l !== undefined).join('\n');
  const lines: string[] = [
    `<strong>⚠️ MANUAL APPLY REQUIRED</strong> — VJH found this; you submit.`,
    input.jobUrl
      ? `<strong>Apply:</strong> ${hsLink(input.jobUrl, 'Open job / apply page')}<br><code>${escHs(input.jobUrl)}</code>`
      : `<strong>Apply:</strong> (no URL — search "${escHs(input.jobTitle)} @ ${escHs(input.company)}")`,
    input.score != null ? `<strong>Score:</strong> ${input.score}/100` : '',
    input.recruiterName || input.recruiterEmail
      ? `<strong>Recruiter:</strong> ${escHs([input.recruiterName, input.recruiterEmail].filter(Boolean).join(' · '))}`
      : '',
    input.source ? `<strong>Source:</strong> ${escHs(input.source)}` : '',
    '',
    `<strong>--- COVER / OUTREACH LETTER (edit, then paste) ---</strong>`,
    `<pre style="white-space:pre-wrap;font-family:inherit">${escHs(letter)}</pre>`,
    '',
    `<strong>--- CHECKLIST ---</strong>`,
    `[ ] Open Apply link`,
    `[ ] Edit letter`,
    `[ ] Attach resume`,
    `[ ] Submit`,
    `[ ] Move deal stage after you apply`,
  ];
  // Keep leftover notes that aren't the letter itself
  if (input.notes?.trim() && !letter) {
    lines.push('', `<strong>Extra notes:</strong>`, escHs(input.notes.trim()));
  } else if (input.notes?.trim() && letter && !input.notes.includes(letter.slice(0, 40))) {
    const stripped = input.notes.replace(/(?:COVER\s*LETTER|cover letter)\s*[:\-]?[\s\S]*/i, '').trim();
    if (stripped) lines.push('', `<strong>Extra notes:</strong>`, escHs(stripped));
  }
  return lines.filter(l => l !== null && l !== undefined).join('<br>');
}

/**
 * Client action package — open deal → review draft → edit → send (Resend / email client).
 */
export function buildClientActionPackage(lead: LeadForHubSpot): string {
  const first = cleanDisplayName(lead.name, lead.company).split(/\s+/)[0] || 'there';
  const company = lead.company || 'your team';
  const offer = lead.matchedSystem || 'an AI system that fits';
  const subject =
    (lead.draftSubject || '').trim() ||
    `Quick idea for ${company} — ${offer}`.slice(0, 120);
  const body =
    (lead.draftBody || '').trim() ||
    [
      `Hi ${first},`,
      ``,
      lead.painPoint
        ? `I noticed ${lead.painPoint.slice(0, 220)}`
        : `I help teams ship WhatsApp/Telegram bots, LLM wiring, automation, GEO/AEO, and AI product video — fast.`,
      ``,
      `I built systems in that lane (EspaLuz, Oracle agents, HubSpot wiring). Happy to show a 15-min walkthrough if useful.`,
      ``,
      `Elena`,
      `https://aideazz.xyz`,
    ].join('\n');

  const website = lead.website || (lead.domain ? `https://${lead.domain.replace(/^https?:\/\//, '')}` : '');
  const lines: string[] = [
    `<strong>🎯 ACTION PACKAGE — review → edit → send</strong>`,
    lead.sourcePrefix ? `<strong>Stream:</strong> ${escHs(lead.sourcePrefix)}` : '',
    lead.email ? `<strong>To:</strong> ${escHs(lead.email)}` : `<strong>To:</strong> <em>(add email — then /add_email or edit contact)</em>`,
    website ? `<strong>Website:</strong> ${hsLink(website, website)}` : '',
    lead.linkedinUrl ? `<strong>LinkedIn:</strong> ${hsLink(lead.linkedinUrl, 'Open profile')}` : '',
    lead.sourceUrl ? `<strong>Source signal:</strong> ${hsLink(lead.sourceUrl, 'Open original post')}` : '',
    lead.matchedSystem ? `<strong>Best-fit offer:</strong> ${escHs(lead.matchedSystem)}` : '',
    lead.painPoint ? `<strong>Pain / signal:</strong> ${escHs(lead.painPoint.slice(0, 500))}` : '',
    lead.message ? `<strong>They wrote:</strong> ${escHs(lead.message.slice(0, 800))}` : '',
    '',
    `<strong>--- EMAIL DRAFT (copy / edit / send) ---</strong>`,
    `<strong>Subject:</strong> ${escHs(subject)}`,
    `<pre style="white-space:pre-wrap;font-family:inherit">${escHs(body)}</pre>`,
    '',
    `<strong>--- CHECKLIST ---</strong>`,
    `[ ] Confirm email / LinkedIn`,
    `[ ] Edit draft`,
    `[ ] Send (Resend / your mail / TG concierge)`,
    `[ ] Move deal to "Qualified to buy" after send`,
  ];
  return lines.filter(Boolean).join('<br>');
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
  /** Raw inquiry text → contact `message` property (Lead Concierge context). */
  message?: string | undefined;
  matchedSystem?: string | undefined;
  stage?: HSDealStage | undefined;
  /** e.g. 'CLIENT-CTO-INGEST' or 'CLIENT-ALGOM' — wrapped in [brackets] as dealname prefix */
  sourcePrefix?: string | undefined;
  /** Estimated deal value in USD (Revenue Cockpit Phase 2 — offer-matched). */
  amount?: number | undefined;
  /** Atlas concept_id for deal description (does not affect qualification gate). */
  atlasConceptId?: string | undefined;
  utmCampaign?: string | undefined;
  utmTerm?: string | undefined;
  utmContent?: string | undefined;
  /** Atlas ↔ HubSpot loop metadata (audit log + concept link when UTMs present). */
  crmMeta?: import('./atlas-crm-bridge').HubSpotCrmMeta;
  /** Clickable original post / SERP result URL. */
  sourceUrl?: string | undefined;
  /** Pre-written outreach draft parked on the deal for review→edit→send. */
  draftSubject?: string | undefined;
  draftBody?: string | undefined;
  /**
   * When true, delete+recreate the HubSpot contact if the email already exists
   * so Make's Contacts/Created trigger fires (test-email re-runs only).
   */
  forceRecreateContact?: boolean | undefined;
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
 * "Right client" gate — only buyers for Elena's 2026 money skills land in HubSpot:
 *   1) WhatsApp/Telegram AI bots (EspaLuz lane, LATAM)
 *   2) LLM API wiring / AI integration
 *   3) Automation workflows (Make / n8n / Oracle / cron agents)
 *   4) GEO/AEO
 *   5) AI video as a service (product videos/ads — not art films)
 *
 * Must be reachable + show BUYING intent (not a job post, not a passive scrape)
 * + match skill ICP. Form inquiries (CLIENT-CTO-INQUIRY) bypass keyword checks.
 */
export function isQualifiedClient(lead: LeadForHubSpot): { ok: boolean; reason: string } {
  // 1) Must be reachable / a real entity (sourceUrl = SERP/HN post counts as a trail)
  if (!(lead.email || lead.domain || lead.website || lead.linkedinUrl || lead.sourceUrl)) {
    return { ok: false, reason: 'no reachable identity (no email/domain/site/linkedin/sourceUrl)' };
  }
  // A direct portfolio-form submission IS the buying signal — a human chose to
  // write in. The keyword intent gate below is for scraped/passive sources only.
  // (July 12 2026: gate was silently dropping real form inquiries.)
  if (lead.sourcePrefix === 'CLIENT-CTO-INQUIRY') {
    return { ok: true, reason: 'qualified: direct form inquiry (active by definition)' };
  }
  const text = [
    lead.company, lead.painPoint, lead.matchedSystem, lead.source, lead.message,
    lead.draftSubject, lead.draftBody, lead.sourceUrl,
  ].filter(Boolean).join(' ').toLowerCase();

  // 2) ACTIVE buyer language — not "Company X is hiring engineers" (job posts).
  //    Removed bare "hiring a"/"hire a" — those match HN Who-is-Hiring junk.
  const INTENT = [
    'looking for someone', 'need someone', 'hire someone', 'pay someone',
    'looking for', 'looking to build', 'looking to hire', 'in search of', 'seeking',
    'need a', 'needs a', 'need an', 'needs an', 'need help', 'needs help', 'need to build',
    'want to build', 'wants to build', 'help building', 'help me build', 'someone to build',
    'non-technical founder', 'non technical founder', 'technical co-founder', 'technical cofounder',
    'fractional cto', 'need cto', 'looking for cto', 'hire cto', 'need a cto',
    'looking for a developer', 'need a developer', 'need an engineer',
    'build an mvp', 'building an mvp', 'outsource', 'looking to outsource', 'want help', 'we need',
    'request for proposal', 'rfp',
    // LATAM Spanish buyer language (WhatsApp bot demand)
    'necesito', 'busco', 'alguien que', 'recomienden', 'para mi negocio', 'para mi empresa',
  ];
  if (!INTENT.some(k => text.includes(k))) {
    return { ok: false, reason: 'no active buying-intent signal (passive/scraped lead — not a buyer)' };
  }

  // 3) Skill ICP — must touch a lane Elena actually sells in 2026.
  const SKILL_ICP = [
    // WhatsApp / Telegram AI bots
    'whatsapp', 'telegram', 'chatbot', 'chat bot', 'conversational ai', 'conversational agent',
    'bot de whatsapp', 'bot para', 'wa bot', 'tg bot', 'espaluz',
    // LLM / AI integration / fractional CTO build
    'llm', 'ai integration', 'ai agent', 'ai automation', 'anthropic', 'openai', 'groq',
    'fractional cto', 'technical co-founder', 'cto', 'mvp', 'saas', 'api',
    // Automation workflows
    'automation', 'workflow', 'make.com', 'n8n', 'zapier', 'integrat', 'oracle', 'cron', 'revops',
    // GEO / AEO
    'geo', 'aeo', 'answer engine', 'generative engine', 'ai search', 'chatgpt', 'cited by',
    'seo', 'content engine',
    // AI video as service (ads/product — not art films)
    'ai video', 'product video', 'video ad', 'video ads', 'video generation', 'promo video',
    'marketing video', 'atuona',
    // Matched-system labels from classifiers
    'whatsapp/telegram', 'llm api', 'automation workflow', 'geo/aeo', 'ai video',
  ];
  if (!SKILL_ICP.some(k => text.includes(k))) {
    return { ok: false, reason: 'outside Elena skill ICP (bots/LLM/automation/GEO/AI-video)' };
  }

  return { ok: true, reason: 'qualified: reachable + buyer intent + skill ICP' };
}

/**
 * EspaLuz Influencer daily content → HubSpot [ESPALUZ] activity deal only.
 * Uses the pre-baked name as-is (e.g. `[ESPALUZ] Influencer post — YYYY-MM-DD`).
 * Skips non-[ESPALUZ] names (no CLIENT stream). Must NOT use pushEspaLuzDealToHubSpot
 * (trial helper would wrap the title as `TG … — trial`).
 */
export async function pushEspaLuzContentActivityToHubSpot(input: {
  dealName: string;
  context?: string;
  crmMeta?: import('./atlas-crm-bridge').HubSpotCrmMeta;
}): Promise<{ contactId: string | null; dealId: string | null } | null> {
  if (!HS_KEY()) {
    console.warn('[HubSpot] HUBSPOT_API_KEY not set — skipping EspaLuz content CRM push');
    return null;
  }
  const dealName = input.dealName.trim();
  if (!dealName) {
    console.warn('[HubSpot] EspaLuz content deal missing name — skipping');
    return null;
  }
  if (!dealName.startsWith('[ESPALUZ]')) {
    console.log(`[HubSpot] EspaLuz content skip (not [ESPALUZ] prefix): ${dealName.slice(0, 80)}`);
    return null;
  }
  try {
    const existing = await findDealByName(dealName);
    if (existing?.id) {
      console.log(`[HubSpot] EspaLuz content deal exists (${existing.id}): ${dealName}`);
      const dup = { contactId: null as string | null, dealId: existing.id };
      const { attachHubSpotToAtlasLoop } = await import('./atlas-crm-bridge');
      attachHubSpotToAtlasLoop('espaluz', dup, input.crmMeta ?? {
        source: 'espaluz_influencer',
        pipeline: 'client',
        type: 'engagement',
        atlas_concept_id: null,
        utm_term: null,
        utm_campaign: null,
      }, 'duplicate');
      return dup;
    }
    const actionNote = [
      `<strong>📣 ESPALUZ INFLUENCER — daily post</strong>`,
      `<strong>Deal:</strong> ${escHs(dealName)}`,
      input.context ? `<strong>Context:</strong> ${escHs(input.context.slice(0, 800))}` : '',
      '',
      `<strong>--- NOTE ---</strong>`,
      `Content activity under [ESPALUZ] (not a user trial). WA/TG trials stay separate.`,
    ].filter(Boolean).join('<br>');
    const dealId = await createDeal({
      name: dealName,
      stage: HS_STAGES.prospected,
      dealType: 'newbusiness',
      description: input.context?.slice(0, 1000) || undefined,
    });
    if (dealId) await addNoteToDeal(dealId, actionNote);
    console.log(`[HubSpot] EspaLuz content deal created: ${dealName}`);
    const out = { contactId: null as string | null, dealId };
    const { attachHubSpotToAtlasLoop } = await import('./atlas-crm-bridge');
    attachHubSpotToAtlasLoop('espaluz', out, input.crmMeta ?? {
      source: 'espaluz_influencer',
      pipeline: 'client',
      type: 'engagement',
      atlas_concept_id: null,
      utm_term: null,
      utm_campaign: null,
    }, 'created');
    return out;
  } catch (err) {
    console.error('[HubSpot] pushEspaLuzContentActivityToHubSpot error:', err);
    return null;
  }
}

/** EspaLuz TG/WA users — product trials, not CTO client prospects. Bypass client gate. */
export async function pushEspaLuzDealToHubSpot(input: {
  channel: 'telegram' | 'whatsapp';
  userId: string;
  context?: string;
  atlasConceptId?: string;
  accessType?: string;
  crmMeta?: import('./atlas-crm-bridge').HubSpotCrmMeta;
}): Promise<{ contactId: string | null; dealId: string | null } | null> {
  if (!HS_KEY()) {
    console.warn('[HubSpot] HUBSPOT_API_KEY not set — skipping EspaLuz CRM push');
    return null;
  }
  const ch = input.channel === 'whatsapp' ? 'WA' : 'TG';
  const dealName = `[ESPALUZ] ${ch} ${input.userId} — trial`;
  try {
    const existing = await findDealByName(dealName);
    const contactId = await upsertContact({
      firstName: 'EspaLuz',
      lastName: `${ch} ${input.userId}`,
      source: `espaluz_${input.channel}`,
    });
    if (existing?.id) {
      console.log(`[HubSpot] EspaLuz deal exists (${existing.id}): ${dealName}`);
      if (contactId) await associateDealContact(existing.id, contactId);
      const dup = { contactId, dealId: existing.id };
      const { attachHubSpotToAtlasLoop } = await import('./atlas-crm-bridge');
      attachHubSpotToAtlasLoop('espaluz', dup, input.crmMeta ?? {
        source: `espaluz_${input.channel}`,
        pipeline: 'client',
        type: 'trial',
        atlas_concept_id: input.atlasConceptId ?? null,
        utm_term: input.atlasConceptId ?? null,
        utm_campaign: input.atlasConceptId ? `atlas_${input.atlasConceptId.replace(/_\d{4}-\d{2}-\d{2}$/, '')}` : null,
      }, 'duplicate');
      return dup;
    }
    const waLink = input.channel === 'whatsapp' && /^\+?\d{8,15}$/.test(input.userId.replace(/\s/g, ''))
      ? `https://wa.me/${input.userId.replace(/[^\d]/g, '')}`
      : '';
    const actionNote = [
      `<strong>🟢 ESPALUZ TRIAL — action package</strong>`,
      `<strong>Channel:</strong> ${escHs(input.channel)} · <strong>User:</strong> ${escHs(input.userId)}`,
      waLink ? `<strong>Open chat:</strong> ${hsLink(waLink, 'WhatsApp deep link')}` : '',
      input.accessType ? `<strong>Access:</strong> ${escHs(input.accessType)}` : '',
      input.atlasConceptId ? `<strong>Atlas:</strong> ${escHs(input.atlasConceptId)}` : '',
      input.context ? `<strong>Context:</strong> ${escHs(input.context.slice(0, 600))}` : '',
      '',
      `<strong>--- UPSELL DRAFT (edit → send in ${ch}) ---</strong>`,
      `<pre style="white-space:pre-wrap;font-family:inherit">${escHs(
        `¡Hola! Vi que estás probando EspaLuz. Si quieres el plan completo (más práctica + seguimiento), te paso el enlace de pago o una demo de 10 min. ¿Te sirve?`
      )}</pre>`,
      '',
      `<strong>--- CHECKLIST ---</strong>`,
      `[ ] Open chat`,
      `[ ] Send upsell / ask for feedback`,
      `[ ] If paid → move deal stage / tag ESPALUZ-PAID`,
    ].filter(Boolean).join('<br>');
    const description = [
      input.context,
      input.accessType ? `Access: ${input.accessType}` : null,
      input.atlasConceptId ? `Atlas concept: ${input.atlasConceptId}` : null,
      `Channel: ${input.channel}`,
      `User ID: ${input.userId}`,
      waLink ? `WhatsApp: ${waLink}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    const dealId = await createDeal({
      name: dealName,
      stage: HS_STAGES.prospected,
      dealType: 'newbusiness',
      description: description || undefined,
    });
    if (dealId && contactId) await associateDealContact(dealId, contactId);
    if (dealId) await addNoteToDeal(dealId, actionNote);
    console.log(`[HubSpot] EspaLuz deal created: ${dealName}`);
    const out = { contactId, dealId };
    const { attachHubSpotToAtlasLoop } = await import('./atlas-crm-bridge');
    attachHubSpotToAtlasLoop('espaluz', out, input.crmMeta ?? {
      source: `espaluz_${input.channel}`,
      pipeline: 'client',
      type: 'trial',
      atlas_concept_id: input.atlasConceptId ?? null,
      utm_term: input.atlasConceptId ?? null,
      utm_campaign: input.atlasConceptId ? `atlas_${input.atlasConceptId.replace(/_\d{4}-\d{2}-\d{2}$/, '')}` : null,
    }, 'created');
    return out;
  } catch (err) {
    console.error('[HubSpot] pushEspaLuzDealToHubSpot error:', err);
    return null;
  }
}

/**
 * Atlas Radar market-window insights → deal-only [ATLAS-RADAR] deals (Gap-1 bridge,
 * July 9 2026). Bypasses the RIGHT-CLIENT gate BY DESIGN (same pattern as EspaLuz
 * trials): a radar window is Elena's own action item, not a scraped "buyer" — it has
 * no email/domain and must not be forced through buying-intent keywords.
 * Idempotent by dealname (score/why drift daily → kept in the note, NOT the name).
 * Deliberately does NOT call attachHubSpotToAtlasLoop with UTM/concept attribution:
 * radar insights must never inflate the Atlas conversion ledger (hubspot_deals stays
 * real-conversions-only, so the dashboard "Convert ✓" claim stays honest).
 */
export async function pushAtlasRadarDealToHubSpot(input: {
  vertical: string;
  angle: string;
  state: string; // 'ENTER' today; kept open for future states
  score?: number | undefined;
  why?: string | undefined;
  evidence?: string | undefined;
  conceptId?: string | undefined;
  landingUrl?: string | undefined;
}): Promise<{ dealId: string | null; duplicate: boolean } | null> {
  if (!HS_KEY()) {
    console.warn('[HubSpot] HUBSPOT_API_KEY not set — skipping Atlas radar push');
    return null;
  }
  const dealName = `[ATLAS-RADAR] ${input.vertical} — ${input.state}: ${input.angle}`;
  try {
    const existing = await findDealByName(dealName);
    if (existing?.id) {
      console.log(`[HubSpot] Atlas radar deal exists (${existing.id}): ${dealName}`);
      return { dealId: existing.id, duplicate: true };
    }
    const description = [
      'Atlas Radar detected an open market window (detected, not predicted).',
      input.score != null ? `Window score: ${input.score}/100` : null,
      input.why ? `Why: ${input.why}` : null,
      input.evidence ? `Evidence: ${input.evidence}` : null,
      input.conceptId ? `Atlas concept: ${input.conceptId}` : null,
      input.landingUrl ? `Landing URL (UTM-tagged): ${input.landingUrl}` : null,
      'Dashboard: https://webhook.aideazz.xyz/whitespace/atlas.html',
    ].filter(Boolean).join('\n');
    const linkedInDraft = [
      `Market window: ${input.vertical} — ${input.angle}`,
      input.why ? `Why now: ${input.why}` : '',
      ``,
      `I help teams ship this with AI agents (bots, automation, GEO). Landing:`,
      input.landingUrl || 'https://aideazz.xyz',
    ].filter(Boolean).join('\n');
    const actionNote = [
      `<strong>📡 ATLAS RADAR — action package</strong>`,
      input.score != null ? `<strong>Score:</strong> ${input.score}/100` : '',
      input.why ? `<strong>Why:</strong> ${escHs(input.why)}` : '',
      input.evidence ? `<strong>Evidence:</strong> ${escHs(input.evidence.slice(0, 400))}` : '',
      input.landingUrl ? `<strong>Landing:</strong> ${hsLink(input.landingUrl, 'Open UTM landing')}` : '',
      `${hsLink('https://webhook.aideazz.xyz/whitespace/atlas.html', 'Open Atlas dashboard')}`,
      '',
      `<strong>--- LINKEDIN / POST DRAFT (edit → publish) ---</strong>`,
      `<pre style="white-space:pre-wrap;font-family:inherit">${escHs(linkedInDraft)}</pre>`,
      '',
      `<strong>--- CHECKLIST ---</strong>`,
      `[ ] Open landing`,
      `[ ] Post / DM angle`,
      `[ ] Log outcome via /outcome`,
    ].filter(Boolean).join('<br>');
    const dealId = await createDeal({
      name: dealName,
      stage: HS_STAGES.prospected,
      dealType: 'newbusiness',
      description,
    });
    if (dealId) await addNoteToDeal(dealId, actionNote);
    console.log(`[HubSpot] Atlas radar deal created: ${dealName}`);
    return { dealId, duplicate: false };
  } catch (err) {
    console.error('[HubSpot] pushAtlasRadarDealToHubSpot error:', err);
    return null;
  }
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

  // RIGHT-CLIENT GATE: qualify before transfer, so HubSpot only shows real prospects.
  const clientMeta: import('./atlas-crm-bridge').HubSpotCrmMeta = lead.crmMeta ?? {
    source: lead.source || 'AI Marketing Engine',
    pipeline: 'client',
    type: 'prospect',
    utm_campaign: lead.utmCampaign ?? null,
    utm_term: lead.utmTerm ?? lead.atlasConceptId ?? null,
    utm_content: lead.utmContent ?? null,
    atlas_concept_id: lead.atlasConceptId ?? null,
  };
  const _q = isQualifiedClient(lead);
  if (!_q.ok) {
    console.log(`[HubSpot] CLIENT lead NOT qualified (${_q.reason}) — skipping: ${(lead.company || lead.name || lead.email || '?').slice(0, 50)}`);
    const { attachHubSpotToAtlasLoop } = await import('./atlas-crm-bridge');
    attachHubSpotToAtlasLoop('client', null, clientMeta, 'skipped');
    return null;
  }

  try {
    // 1. Contact — skip if no email AND no name (nothing to identify by)
    //    When email is absent HubSpot still creates a contact by name (useful for
    //    company-sourced prospects where we don't yet have a personal email).
    const displayName = cleanDisplayName(lead.name, lead.company);
    const [firstName, ...rest] = displayName.split(' ');
    const isFormInquiry = lead.sourcePrefix === 'CLIENT-CTO-INQUIRY';
    const forceRecreate =
      !!lead.forceRecreateContact ||
      (isFormInquiry && isConciergeTestEmail(lead.email));
    const contactId = lead.email || displayName
      ? await upsertContact({
          email:        lead.email,
          firstName:    firstName ?? displayName,
          lastName:     rest.join(' ') || undefined,
          company:      lead.company,
          linkedinUrl:  lead.linkedinUrl,
          source:       lead.source ?? 'AI Marketing Engine',
          message:      lead.message,
          ...(isFormInquiry ? { leadKind: PORTFOLIO_INQUIRY_KIND } : {}),
          ...(forceRecreate ? { forceRecreate: true } : {}),
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
      ...(lead.amount && lead.amount > 0 ? { amount: lead.amount } : {}),
      description: [
        lead.painPoint     ? `Pain point: ${lead.painPoint}`         : null,
        lead.matchedSystem ? `Matched system: ${lead.matchedSystem}` : null,
        lead.source        ? `Source: ${lead.source}`                : null,
        lead.sourceUrl     ? `Source URL: ${lead.sourceUrl}`          : null,
        lead.website       ? `Website: ${lead.website}`              : null,
        lead.linkedinUrl   ? `LinkedIn: ${lead.linkedinUrl}`         : null,
        lead.email         ? `Email: ${lead.email}`                  : null,
        lead.draftSubject  ? `Draft subject: ${lead.draftSubject}`   : null,
        lead.atlasConceptId ? `Atlas concept: ${lead.atlasConceptId}` : null,
        lead.utmCampaign   ? `UTM campaign: ${lead.utmCampaign}`     : null,
        lead.utmTerm       ? `UTM term: ${lead.utmTerm}`             : null,
      ].filter(Boolean).join('\n') || undefined,
    });

    // 4. Associations
    if (contactId && companyId) await associateContactCompany(contactId, companyId);
    if (dealId && contactId)    await associateDealContact(dealId, contactId);
    if (dealId && companyId)    await associateDealCompany(dealId, companyId);

    // 5. Action package on the DEAL (review → edit → send) + light contact trail
    const actionNote = buildClientActionPackage(lead);
    if (dealId) await addNoteToDeal(dealId, actionNote);
    if (contactId) {
      await addNoteToContact(
        contactId,
        [
          `Source: ${lead.source ?? 'AI Marketing Engine'}`,
          lead.painPoint     ? `Pain: ${lead.painPoint.slice(0, 300)}` : null,
          lead.matchedSystem ? `Offer: ${lead.matchedSystem}` : null,
          lead.email         ? `Email: ${lead.email}` : null,
          dealId             ? `Deal action package attached (open associated deal).` : null,
        ].filter(Boolean).join('\n'),
      );
    }

    console.log(`[HubSpot] ✅ Lead pushed — contact:${contactId} company:${companyId} deal:${dealId}`);
    const out = { contactId, companyId, dealId };
    const { attachHubSpotToAtlasLoop } = await import('./atlas-crm-bridge');
    attachHubSpotToAtlasLoop('client', out, clientMeta, 'created');
    return out;

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
  /** Full cover letter text for Elena to edit + paste on apply. */
  coverLetter?: string | undefined;
  /** e.g. 'HIRING-VJH' or 'HIRING-VJH-SERP' — wrapped in [brackets] as dealname prefix */
  sourcePrefix?: string | undefined;
  crmMeta?: import('./atlas-crm-bridge').HubSpotCrmMeta;
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
  const stageMap: Record<string, HSDealStage> = {
    applied:             HS_STAGES.contacted,           // \ud83d\udd25 YOU act TODAY (was: prospected/AI-working)
    recruiter_responded: 'contractsent' as HSDealStage, // \ud83d\udcac They replied \u2014 YOU act
    interview_scheduled: 'contractsent' as HSDealStage, // \ud83d\udcac They replied \u2014 YOU act
    offer_received:      'contractsent' as HSDealStage, // \ud83d\udcac They replied \u2014 YOU act
    accepted:            HS_STAGES.won,
    declined:            HS_STAGES.lost,
    lead_parked:         HS_STAGES.prospected,  // parked in "ignore" — not iron-clad fit (stops the SERP firehose)
  };
  const stage = input.stage ?? 'applied';
  const stageId = stageMap[stage] ?? HS_STAGES.contacted;
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
      name:    input.company,
      domain:  input.domain,
      website: input.domain
        ? (input.domain.startsWith('http') ? input.domain : `https://${input.domain}`)
        : undefined,
    });

    // Dedup: if a deal with this exact name already exists, don't create a second
    // card (now that multiple agents — the bot's Remotive search + Path C — can find
    // the same job). Returns the existing deal instead of duplicating it.
    const dealName = `[${input.sourcePrefix || 'HIRING'}] ${input.jobTitle} @ ${input.company}`;
    const actionPkg = buildHiringActionPackage({
      jobTitle: input.jobTitle,
      company: input.company,
      jobUrl: input.jobUrl,
      score: input.score,
      recruiterName: input.recruiterName,
      recruiterEmail: input.recruiterEmail,
      coverLetter: input.coverLetter,
      notes: input.notes,
      source: input.source,
    });
    const existing = await findDealByName(dealName);
    if (existing) {
      console.log(`[HubSpot] Hiring deal already exists (${existing.id}) — refresh action note: ${dealName.slice(0, 64)}`);
      if (contactId && companyId) await associateContactCompany(contactId, companyId);
      if (existing.id && contactId) await associateDealContact(existing.id, contactId);
      if (existing.id && companyId) await associateDealCompany(existing.id, companyId);
      if (existing.id) await addNoteToDeal(existing.id, actionPkg);
      const dup = { contactId, companyId, dealId: existing.id };
      if (input.crmMeta) {
        const { attachHubSpotToAtlasLoop } = await import('./atlas-crm-bridge');
        attachHubSpotToAtlasLoop('hiring', dup, input.crmMeta, 'duplicate');
      }
      return dup;
    }

    const dealId = await createDeal({
      name:  dealName,
      stage: stageId,
      description: [
        `Category: hiring`,
        `Stage: ${stage}`,
        `⚠️ MANUAL APPLY — open Notes for letter + checklist`,
        input.jobUrl ? `Job URL: ${input.jobUrl}` : null,
        input.source ? `Source: ${input.source}`  : null,
        input.score != null ? `Score: ${input.score}/100` : null,
        input.coverLetter ? `Cover letter: yes (${input.coverLetter.length} chars)` : null,
      ].filter(Boolean).join('\n'),
    });

    if (contactId && companyId) await associateContactCompany(contactId, companyId);
    if (dealId && contactId)    await associateDealContact(dealId, contactId);
    if (dealId && companyId)    await associateDealCompany(dealId, companyId);

    // Always attach full action package (Apply link + letter + checklist)
    if (dealId) await addNoteToDeal(dealId, actionPkg);

    console.log(`[HubSpot] ✅ Hiring deal pushed — "${input.jobTitle} @ ${input.company}" contact:${contactId} deal:${dealId}`);
    const out = { contactId, companyId, dealId };
    if (input.crmMeta) {
      const { attachHubSpotToAtlasLoop } = await import('./atlas-crm-bridge');
      attachHubSpotToAtlasLoop('hiring', out, input.crmMeta, 'created');
    } else {
      const { attachHubSpotToAtlasLoop } = await import('./atlas-crm-bridge');
      attachHubSpotToAtlasLoop('hiring', out, {
        source: input.source || 'VJH',
        pipeline: 'hiring',
        type: 'application',
      }, 'created');
    }
    return out;
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
