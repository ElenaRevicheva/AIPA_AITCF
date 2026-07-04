# AIdeazz service payments (PagueloFacil)

Consulting SKUs for **Análisis técnico web** and future AIdeazz services. Reuses the EspaLuz PagueloFacil LinkDeamon on Oracle; `PARM_1` prefix `SVC:` routes to CTO AIPA instead of WhatsApp/Telegram bot access.

## SKUs

| SKU | Price | When to offer |
|-----|-------|----------------|
| `web_audit_prelim` | **$200 USD** | After discovery letter / checklist — client pays, then Elena starts the preliminary audit |
| `web_audit_blueprint` | **$500 USD** | After client is satisfied with prelim and wants step-by-step implementation plan |

**Payment timing (Global Marine model):** **A)** Discovery answers first → send pay link → client pays → deep work begins.

## Client-facing URLs

| Channel | URL |
|---------|-----|
| Aideazz page (ES, default) | https://aideazz.xyz/pay/analisis-tecnico?sku=web_audit_prelim&lng=es |
| Aideazz page (EN) | https://aideazz.xyz/pay/analisis-tecnico?sku=web_audit_prelim&lng=en |
| Prelim (default SKU) | https://aideazz.xyz/pay/analisis-tecnico?sku=web_audit_prelim&lng=es |
| Blueprint (invite only) | https://aideazz.xyz/pay/analisis-tecnico?sku=web_audit_blueprint&invite=blueprint&lng=es |

**WhatsApp:** paste the same URL after the discovery conversation. Page includes copy-link + WhatsApp prefill.

## API (CTO AIPA)

- `GET /api/service-catalog` — public SKU list
- `POST /api/service-checkout` — `{ sku, name, email, company?, notes?, page_url?, utm_* }` → `{ checkout_url, order_id }`
- `GET /api/service-order/:id` — order status (`pending` / `paid`)
- `POST /internal/service-paid` — PF webhook hook (secret auth)

## Oracle deploy

```bash
# From cto-aipa repo (Windows → Oracle)
bash scripts/oracle-deploy-service-payments.sh
```

Requires `PAGUELOFACIL_CCLW` in `~/cto-aipa/.env`. Backs up `paguelofacil_payments.json` before patch.

## Example: Global Marine

Discovery letter: `docs/clients/global-marine-carta-arrigo-whatsapp.txt`

After they reply to the checklist, send:

> Para encargar el informe técnico preliminar ($200), complete sus datos y pague aquí:  
> https://aideazz.xyz/pay/analisis-tecnico?sku=web_audit_prelim
