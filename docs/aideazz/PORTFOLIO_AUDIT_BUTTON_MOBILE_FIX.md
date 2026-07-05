# Portfolio audit button — mobile text wrap

**Repo:** [aideazz](https://github.com/ElenaRevicheva/aideazz)  
**File:** `src/components/InquiryForm.tsx`

**Problem:** `Button` uses `whitespace-nowrap` — long audit CTA overflows on mobile.

**Fix:** Override wrap + flex layout on the audit pay link only.

Replace the audit `Button` block (~line 220) with:

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

Push `main` → 4everland auto-deploys aideazz.xyz.
