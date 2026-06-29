/**
 * Sync business_leads with utm_campaign=atlas_* → atlas_performance_events.
 * Called on inquiry save (immediate) and hourly cron (backfill / missed).
 */
import {
  saveAtlasPerformanceEvent,
  hasAtlasLeadEventForBusinessLead,
  getAtlasBusinessLeadsForSync,
} from './database';

export function atlasConceptFromUtm(
  utm_campaign: string,
  utm_term?: string | null,
  utm_content?: string | null,
  createdAt?: Date | string,
): { concept_id: string; vertical: string; angle_id?: string } | null {
  const campaign = utm_campaign?.trim();
  if (!campaign?.startsWith('atlas_')) return null;
  const vertical = campaign.replace(/^atlas_/, '');
  let concept_id = utm_term?.trim() || '';
  if (!/^[a-z0-9_]+_\d{4}-\d{2}-\d{2}$/.test(concept_id)) {
    const day =
      createdAt instanceof Date
        ? createdAt.toISOString().slice(0, 10)
        : typeof createdAt === 'string'
          ? createdAt.slice(0, 10)
          : new Date().toISOString().slice(0, 10);
    concept_id = `${vertical}_${day}`;
  }
  const angle_id = utm_content?.trim();
  return angle_id
    ? { concept_id, vertical, angle_id }
    : { concept_id, vertical };
}

export async function recordAtlasLeadFromInquiry(params: {
  leadId: string;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  createdAt?: Date | string;
}): Promise<boolean> {
  if (!params.utm_campaign?.trim().startsWith('atlas_')) return false;
  if (await hasAtlasLeadEventForBusinessLead(params.leadId)) return false;

  const parsed = atlasConceptFromUtm(
    params.utm_campaign,
    params.utm_term,
    params.utm_content,
    params.createdAt,
  );
  if (!parsed) return false;

  const day =
    params.createdAt instanceof Date
      ? params.createdAt.toISOString().slice(0, 10)
      : typeof params.createdAt === 'string'
        ? params.createdAt.slice(0, 10)
        : new Date().toISOString().slice(0, 10);

  const id = await saveAtlasPerformanceEvent({
    concept_id: parsed.concept_id,
    vertical: parsed.vertical,
    ...(parsed.angle_id ? { angle_id: parsed.angle_id } : {}),
    source: 'aideazz_leads',
    metrics: { leads: 1 },
    period_start: day,
    period_end: day,
    notes: `business_leads id ${params.leadId}`,
  });
  if (id) {
    console.log(`[atlas-lead] synced ${parsed.concept_id} ← business_leads ${params.leadId}`);
  }
  return !!id;
}

export async function syncAllAtlasBusinessLeads(): Promise<{ synced: number; total: number }> {
  const rows = await getAtlasBusinessLeadsForSync(200);
  let synced = 0;
  for (const row of rows) {
    const ok = await recordAtlasLeadFromInquiry({
      leadId: row.id,
      utm_campaign: row.utm_campaign,
      utm_term: row.utm_term,
      utm_content: row.utm_content,
      createdAt: row.created_at,
    });
    if (ok) synced++;
  }
  if (rows.length > 0) {
    console.log(`[atlas-lead] cron synced ${synced}/${rows.length} atlas business_leads`);
  }
  return { synced, total: rows.length };
}
