# Cloud Agent Task — Portfolio audit button mobile wrap

**Repo to edit and push:** `ElenaRevicheva/aideazz`  
**Branch:** `main`  
**Deploy:** 4everland auto-deploys `main` → aideazz.xyz (3–10 min after push)

---

## Problem

On **mobile**, the audit payment button on `/portfolio` overflows: label text sits outside the button background.

- **EN:** `Order web visibility & GEO / AEO / Tech SEO audit`
- **ES:** `Encargar auditoría de visibilidad web y GEO / AEO / Tech SEO`

Desktop looks fine. Mobile broken (see portfolio inquiry form at bottom).

---

## Root cause

`src/components/ui/button.tsx` sets `whitespace-nowrap` on all buttons. The audit CTA in `InquiryForm.tsx` is too long for narrow screens.

---

## Fix (one file only)

**File:** `src/components/InquiryForm.tsx`  
**Location:** audit pay `Button` block below `t("cta.inquiryAuditNote")` (~line 220).

**Replace** the existing audit `Button` / `Link` block with:

```tsx
        <Button
          asChild
          variant="outline"
          className="w-full h-auto min-h-10 whitespace-normal py-3 px-4 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200"
        >
          <Link
            to={auditPayUrl}
            className="flex flex-wrap items-center justify-center gap-2 text-center leading-snug"
          >
            <CreditCard className="w-4 h-4 shrink-0" />
            <span>{t("cta.inquiryAuditLink")}</span>
          </Link>
        </Button>
```

**Do not change:**
- `src/i18n/locales/en.json` / `es.json` (text is fine)
- Other buttons or unrelated files

---

## Agent checklist

1. Clone / open **`ElenaRevicheva/aideazz`** (this task is **not** AIPA_AITCF).
2. Apply the fix in `src/components/InquiryForm.tsx`.
3. Run `npm run build` if dependencies allow; otherwise verify TypeScript/JSX syntax.
4. Commit: `Fix audit order button text wrapping on mobile portfolio`
5. **Push to `main`** on `ElenaRevicheva/aideazz`.
6. Reply with commit SHA and confirm: mobile label wraps inside button (EN + ES).

---

## Acceptance criteria

- [ ] Button is full width on mobile
- [ ] Long audit label wraps to multiple lines **inside** the button
- [ ] Credit card icon stays visible (does not float outside)
- [ ] Desktop layout still acceptable
- [ ] Pushed to `aideazz` `main`

---

## Reference

Same patch documented in AIPA_AITCF: `scripts/aideazz-hotfixes/apply-portfolio-audit-button-mobile.sh`
