/**
 * PagueloFacil LinkDeamon — shared with EspaLuz (same CCLW, sandbox flag).
 * https://developers.paguelofacil.com/guias/enlace-de-pago
 */
import { type ServiceProduct, buildSvcParm1, type ServiceSku } from './aideazz-service-catalog.js';

const SANDBOX = ['1', 'true', 'yes'].includes((process.env.PAGUELOFACIL_SANDBOX || 'false').toLowerCase());

const LINK_URL = SANDBOX
  ? 'https://sandbox.paguelofacil.com/LinkDeamon.cfm'
  : 'https://secure.paguelofacil.com/LinkDeamon.cfm';

export function pagueloFacilConfigured(): boolean {
  return Boolean(process.env.PAGUELOFACIL_CCLW?.trim());
}

export interface PfLinkResult {
  success: boolean;
  url?: string;
  code?: string;
  amount?: string;
  error?: string;
}

export async function createServicePaymentLink(params: {
  product: ServiceProduct;
  orderIdHex: string;
  clientLabel: string;
}): Promise<PfLinkResult> {
  const cclw = process.env.PAGUELOFACIL_CCLW?.trim();
  if (!cclw) {
    return { success: false, error: 'PAGUELOFACIL_CCLW not configured on CTO AIPA' };
  }

  const desc = `${params.product.pfDescription} — ${params.clientLabel}`.slice(0, 150);
  const body = new URLSearchParams({
    CCLW: cclw,
    CMTN: params.product.amount,
    CDSC: desc,
    PARM_1: buildSvcParm1(params.product.sku as ServiceSku, params.orderIdHex),
    EXPIRES_IN: '86400',
  });

  try {
    const r = await fetch(LINK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: '*/*',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) {
      return { success: false, error: `PagueloFacil HTTP ${r.status}` };
    }
    const json = (await r.json()) as {
      success?: boolean;
      message?: string;
      data?: { url?: string; code?: string };
    };
    if (!json.success) {
      return { success: false, error: json.message || 'PagueloFacil rejected link request' };
    }
    const url = json.data?.url;
    if (!url) {
      return { success: false, error: 'No checkout URL in PagueloFacil response' };
    }
    return {
      success: true,
      url,
      ...(json.data?.code != null ? { code: json.data.code } : {}),
      amount: params.product.amount,
    };
  } catch (e) {
    return { success: false, error: String((e as Error)?.message || e) };
  }
}
