/**
 * Atlas ↔ HubSpot sidecar — links CRM deals to Atlas concept_id via performance ledger.
 *
 * SAFETY: additive only. Never blocks HubSpot writes. Never mutates Atlas/whitespace code paths.
 * Uses hubspot_deals metric (not leads/conversions) to avoid double-counting with
 * recordAtlasLeadFromInquiry or espaluz wiring conversion events.
 */
import { atlasConceptFromUtm } from './atlas-lead-sync';
import {
  saveAtlasPerformanceEvent,
  hasAtlasCrmEventForDeal,
  saveCrmEventLog,
} from './database';

export type CrmStream = 'espaluz' | 'client' | 'hiring';

/** Passed into every HubSpot push* — enables Atlas loop + crm_event_log from any writer. */
export interface HubSpotCrmMeta {
  source: string;
  pipeline?: string;
  type?: string;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  atlas_concept_id?: string | null;
}

const CRM_HUB = (process.env.CTO_AIPA_PUBLIC_URL || 'https://webhook.aideazz.xyz/cto').replace(/\/$/, '');

export function crmEventUrl(): string {
  return `${CRM_HUB}/api/crm-event`;
}

/** Call from hubspot-client after every push — single chokepoint for Atlas + audit. */
export function attachHubSpotToAtlasLoop(
  stream: CrmStream,
  result: { contactId: string | null; companyId?: string | null; dealId: string | null } | null,
  meta: HubSpotCrmMeta | undefined,
  status: 'created' | 'duplicate' | 'skipped' | 'failed',
): void {
  if (!meta) return;
  scheduleAtlasHubSpotLink({
    stream,
    dealId: result?.dealId,
    source: meta.source,
    pipeline: meta.pipeline || (stream === 'hiring' ? 'hiring' : 'client'),
    type: meta.type,
    contactId: result?.contactId ?? null,
    companyId: result?.companyId ?? null,
    status: result?.dealId ? status : status === 'skipped' ? 'skipped' : status,
    utm_campaign: meta.utm_campaign ?? null,
    utm_term: meta.utm_term ?? null,
    utm_content: meta.utm_content ?? null,
    atlas_concept_id: meta.atlas_concept_id ?? null,
  });
}

export interface AtlasAttribution {
  concept_id: string;
  vertical: string;
  angle_id?: string;
}

/** Resolve Atlas join keys from CRM payload / inquiry UTMs. */
export function parseAtlasAttribution(params: {
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  atlas_concept_id?: string | null;
  createdAt?: Date | string;
}): AtlasAttribution | null {
  const explicit = params.atlas_concept_id?.trim();
  if (explicit && /^[a-z0-9_]+_\d{4}-\d{2}-\d{2}$/.test(explicit)) {
    const vertical = explicit.replace(/_\d{4}-\d{2}-\d{2}$/, '');
    const angle_id = params.utm_content?.trim();
    return angle_id ? { concept_id: explicit, vertical, angle_id } : { concept_id: explicit, vertical };
  }
  if (params.utm_campaign?.trim().startsWith('atlas_')) {
    return atlasConceptFromUtm(
      params.utm_campaign,
      params.utm_term,
      params.utm_content,
      params.createdAt,
    );
  }
  return null;
}

/**
 * Record hubspot_deals:1 on the Atlas performance ledger for a HubSpot deal.
 * Deduped by deal id — safe to call from wiring + crm-event + inquiry.
 */
export async function linkHubSpotDealToAtlas(params: {
  stream: CrmStream;
  dealId: string;
  source: string;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  atlas_concept_id?: string | null;
}): Promise<boolean> {
  if (!params.dealId) return false;
  try {
    if (await hasAtlasCrmEventForDeal(params.dealId)) return false;

    const attribution = parseAtlasAttribution(params);
    if (!attribution) return false;

    const id = await saveAtlasPerformanceEvent({
      concept_id: attribution.concept_id,
      vertical: attribution.vertical,
      ...(attribution.angle_id ? { angle_id: attribution.angle_id } : {}),
      source: `hubspot_${params.stream}`,
      metrics: { hubspot_deals: 1 },
      notes: `hubspot deal ${params.dealId} | ${params.source}`,
    });
    if (id) {
      console.log(
        `[atlas-crm] linked deal ${params.dealId} → ${attribution.concept_id} (${params.stream})`,
      );
    }
    return !!id;
  } catch (err) {
    console.error('[atlas-crm] linkHubSpotDealToAtlas non-fatal:', err);
    return false;
  }
}

/** Audit log for every HubSpot write — does not affect Atlas UI. */
export async function logHubSpotCrmEvent(params: {
  source: string;
  type?: string;
  pipeline: string;
  stream: CrmStream;
  contactId?: string | null;
  dealId?: string | null;
  companyId?: string | null;
  status: 'created' | 'duplicate' | 'skipped' | 'failed';
  atlas_concept_id?: string | null;
}): Promise<void> {
  try {
    await saveCrmEventLog({
      source: params.source,
      type: params.type || 'crm_event',
      pipeline: params.pipeline,
      stream: params.stream,
      hubspot_contact_id: params.contactId ?? null,
      hubspot_deal_id: params.dealId ?? null,
      hubspot_company_id: params.companyId ?? null,
      status: params.status,
      atlas_concept_id: params.atlas_concept_id ?? null,
    });
  } catch (err) {
    console.error('[atlas-crm] logHubSpotCrmEvent non-fatal:', err);
  }
}

export function scheduleAtlasHubSpotLink(params: {
  stream: CrmStream;
  dealId: string | null | undefined;
  source: string;
  pipeline: string;
  type?: string | undefined;
  contactId?: string | null | undefined;
  companyId?: string | null | undefined;
  status: 'created' | 'duplicate' | 'skipped' | 'failed';
  utm_campaign?: string | null | undefined;
  utm_term?: string | null | undefined;
  utm_content?: string | null | undefined;
  atlas_concept_id?: string | null | undefined;
}): void {
  setImmediate(() => {
    const attribution = parseAtlasAttribution({
      utm_campaign: params.utm_campaign ?? null,
      utm_term: params.utm_term ?? null,
      utm_content: params.utm_content ?? null,
      atlas_concept_id: params.atlas_concept_id ?? null,
    });
    logHubSpotCrmEvent({
      source: params.source,
      ...(params.type ? { type: params.type } : {}),
      pipeline: params.pipeline,
      stream: params.stream,
      contactId: params.contactId ?? null,
      dealId: params.dealId ?? null,
      companyId: params.companyId ?? null,
      status: params.status,
      atlas_concept_id: attribution?.concept_id ?? params.atlas_concept_id ?? null,
    }).catch(() => {});

    if (params.dealId && (params.status === 'created' || params.status === 'duplicate')) {
      linkHubSpotDealToAtlas({
        stream: params.stream,
        dealId: params.dealId,
        source: params.source,
        utm_campaign: params.utm_campaign ?? null,
        utm_term: params.utm_term ?? null,
        utm_content: params.utm_content ?? null,
        atlas_concept_id: params.atlas_concept_id ?? null,
      }).catch(() => {});
    }
  });
}
