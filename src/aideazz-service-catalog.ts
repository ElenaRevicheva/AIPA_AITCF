/**
 * AIdeazz billable services — PagueloFacil SKUs (Panamá / tarjeta local).
 * Reused across aideazz pay pages and WhatsApp payment links.
 */

export type ServiceSku =
  | 'diagnostic_call'
  | 'web_audit_prelim'
  | 'web_audit_blueprint';

export interface ServiceProduct {
  sku: ServiceSku;
  /** PagueloFacil CMTN amount (USD string, e.g. "200.00") */
  amount: string;
  amountUsd: number;
  titleEn: string;
  titleEs: string;
  descriptionEn: string;
  descriptionEs: string;
  /** Shown on PF checkout description (max ~150 chars) */
  pfDescription: string;
  /** Blueprint requires prior prelim unless override query param */
  requiresPrelim?: boolean;
  /** Next-step line in the client's "payment received" email (default: the audit questionnaire line) */
  paidNextStepEs?: string;
}

export const SERVICE_PRODUCTS: Record<ServiceSku, ServiceProduct> = {
  diagnostic_call: {
    sku: 'diagnostic_call',
    amount: '100.00',
    amountUsd: 100,
    titleEn: '1:1 diagnostic call with Elena',
    titleEs: 'Llamada de diagnóstico 1:1 con Elena',
    descriptionEn:
      'A live video call with Elena before you commit to an audit. She reviews your website and how AI assistants describe your business beforehand, so the call goes to your questions — and you leave knowing whether an audit is worth it for you.',
    descriptionEs:
      'Una videollamada en vivo con Elena antes de comprometerse con una auditoría. Ella revisa antes su sitio web y cómo los asistentes de IA describen su negocio, para que la llamada se dedique a sus preguntas — y usted sepa si una auditoría vale la pena en su caso.',
    pfDescription: 'AIdeazz — Llamada de diagnóstico 1:1 con Elena',
    paidNextStepEs:
      'Elena Revicheva le escribirá a este correo para acordar la fecha y hora de la videollamada.',
  },
  web_audit_prelim: {
    sku: 'web_audit_prelim',
    amount: '200.00',
    amountUsd: 200,
    titleEn: 'Preliminary technical web audit',
    titleEs: 'Informe técnico preliminar (web)',
    descriptionEn:
      'After you share answers to the discovery checklist, we deliver a concrete preliminary report on domain, hosting, forms, and technical risks — without interfering with your current vendors.',
    descriptionEs:
      'Después de compartir las respuestas al cuestionario de descubrimiento, entregamos un informe preliminar concreto sobre dominio, hosting, formularios y riesgos técnicos — sin interferir con sus proveedores actuales.',
    pfDescription: 'AIdeazz — Informe técnico preliminar web',
  },
  web_audit_blueprint: {
    sku: 'web_audit_blueprint',
    amount: '500.00',
    amountUsd: 500,
    titleEn: 'Implementation blueprint (full analysis)',
    titleEs: 'Análisis profundo + plan de implementación',
    descriptionEn:
      'Step-by-step implementation blueprint after the preliminary audit — prioritized fixes, ownership, and sequencing. For clients who want to move forward.',
    descriptionEs:
      'Plan de implementación paso a paso tras la auditoría preliminar — correcciones priorizadas, responsables y secuencia. Para clientes que desean avanzar.',
    pfDescription: 'AIdeazz — Análisis profundo + blueprint',
    requiresPrelim: true,
  },
};

export function getServiceProduct(sku: string): ServiceProduct | null {
  if (sku in SERVICE_PRODUCTS) {
    return SERVICE_PRODUCTS[sku as ServiceSku];
  }
  return null;
}

export function listPublicServiceProducts(): ServiceProduct[] {
  return Object.values(SERVICE_PRODUCTS);
}

export function buildSvcParm1(sku: ServiceSku, orderIdHex: string): string {
  return `SVC:${sku}:${orderIdHex}`;
}

export function parseSvcParm1(parm1: string): { sku: ServiceSku; orderId: string } | null {
  const parts = String(parm1 || '').trim().split(':');
  if (parts.length < 3 || parts[0]?.toUpperCase() !== 'SVC') return null;
  const sku = parts[1] as ServiceSku;
  const orderId = parts.slice(2).join(':');
  if (!getServiceProduct(sku) || !orderId) return null;
  return { sku, orderId };
}
