#!/usr/bin/env bash
# Apply portfolio audit button mobile wrap fix to aideazz repo.
# Run on your laptop (ElenaRevicheva gh auth): bash scripts/aideazz-hotfixes/apply-portfolio-audit-button-mobile.sh
set -euo pipefail

AIDEAZZ_DIR="${AIDEAZZ_DIR:-$HOME/aideazz}"
if [[ ! -d "$AIDEAZZ_DIR/.git" ]]; then
  AIDEAZZ_DIR="${AIDEAZZ_DIR:-/d/aideazz/aideazz}"
fi
if [[ ! -d "$AIDEAZZ_DIR/.git" ]]; then
  echo "Clone aideazz first: git clone https://github.com/ElenaRevicheva/aideazz.git"
  exit 1
fi

FILE="$AIDEAZZ_DIR/src/components/InquiryForm.tsx"
export FILE
if ! grep -q 'whitespace-normal py-3 px-4 border-emerald-500/40' "$FILE" 2>/dev/null; then
  python3 <<'PY'
from pathlib import Path
p = Path(__import__("os").environ["FILE"])
text = p.read_text()
old = '''        <Button
          asChild
          variant="outline"
          className="w-full border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200"
        >
          <Link to={auditPayUrl}>
            <CreditCard className="w-4 h-4 mr-2" />
            {t("cta.inquiryAuditLink")}
          </Link>
        </Button>'''
new = '''        <Button
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
        </Button>'''
if old not in text:
    raise SystemExit("Pattern not found — file may already be patched or changed.")
p.write_text(text.replace(old, new, 1))
print("Patched", p)
PY
else
  echo "Already patched: $FILE"
fi

cd "$AIDEAZZ_DIR"
git add src/components/InquiryForm.tsx
git diff --cached --stat
git commit -m "Fix audit order button text wrapping on mobile portfolio" || true
git push origin main
echo "Done — 4everland will redeploy aideazz.xyz from main."
