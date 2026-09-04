#!/usr/bin/env bash
# Stage a partner/NDA deal into HubSpot from Oracle, where the Service Key lives.
# Piped over SSH from .github/workflows/nda-stage-on-trigger.yml
#
# Usage (on Oracle):
#   bash scripts/oracle-stage-nda.sh <git-ref> <spec-path> [--dry-run]
#
# Why this runs on the box: a cloud agent has no HUBSPOT_API_KEY and its egress
# allowlist excludes api.hubapi.com, so the staging script can only ever run here.
set -uo pipefail

REF="${1:?git ref required}"
SPEC="${2:?spec path required}"
shift 2
EXTRA=("$@")

AIPA_DIR=/home/ubuntu/cto-aipa
[ -d "$AIPA_DIR/.git" ] || AIPA_DIR=/home/ubuntu/AIPA_AITCF
cd "$AIPA_DIR" || { echo "FATAL: no cto-aipa checkout"; exit 1; }

[ -f .env ] || { echo "FATAL: .env missing on Oracle"; exit 1; }
grep -q '^HUBSPOT_API_KEY=' .env || grep -q '^HUBSPOT_ACCESS_TOKEN=' .env \
  || { echo "FATAL: no HubSpot key in Oracle .env"; exit 1; }

echo "--- fetch $REF ---"
git fetch origin "$REF" 2>&1 || { echo "FATAL: fetch failed"; exit 1; }

# Named files only. Never a blanket checkout: Oracle's tree is deliberately
# allowed to lag main, and other agents hold work on this box that git has
# never seen. The registry in particular must not be clobbered wholesale —
# it is read here, mutated by one key, and shipped back for commit.
echo "--- checkout named files from FETCH_HEAD ---"
git checkout FETCH_HEAD -- \
  scripts/stage-hiring-outreach.cjs \
  scripts/hs-env.cjs \
  scripts/preview-outreach-email.cjs \
  "$SPEC" 2>&1 || { echo "FATAL: spec/script checkout failed"; exit 1; }

# The draft and the attachment the spec points at.
DRAFT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$SPEC','utf8')).draftFile||'')")
ATTACHMENTS=$(node -e "
const s=JSON.parse(require('fs').readFileSync('$SPEC','utf8'));
console.log((s.attachments||[]).map(a=>a.path).join(' '));
")
# shellcheck disable=SC2086
[ -n "$DRAFT" ] && git checkout FETCH_HEAD -- "$DRAFT" 2>&1 || true
# shellcheck disable=SC2086
[ -n "$ATTACHMENTS" ] && git checkout FETCH_HEAD -- $ATTACHMENTS 2>&1 || true

echo "--- registry: merge the incoming key, never overwrite the file ---"
# Oracle's registry is authoritative for rows that exist ONLY here (the fermatix
# row was found this way, 4 Sep). Checking out main's copy would delete them, so
# the incoming slug is merged key-by-key instead.
git show "FETCH_HEAD:docs/selling/outreach-registry.json" > /tmp/nda-incoming-registry.json 2>/dev/null \
  || { echo "FATAL: cannot read incoming registry"; exit 1; }
SLUG=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$SPEC','utf8')).slug)")
node -e "
const fs=require('fs');
const live='docs/selling/outreach-registry.json';
const cur=JSON.parse(fs.readFileSync(live,'utf8'));
const inc=JSON.parse(fs.readFileSync('/tmp/nda-incoming-registry.json','utf8'));
const slug='$SLUG';
if(!inc[slug]){ console.error('FATAL: slug '+slug+' not in incoming registry'); process.exit(1); }
const beforeKeys=Object.keys(cur).length;
cur[slug]={...(cur[slug]||{}),...inc[slug]};
fs.writeFileSync(live, JSON.stringify(cur,null,2)+'\n');
console.log('registry keys '+beforeKeys+' -> '+Object.keys(cur).length+' (merged '+slug+')');
" || exit 1

echo "--- the box must be able to SEND what we are about to register ---"
# Fail closed: if Oracle's compiled sender still rejects the attachment type,
# staging would produce a button that refuses on click. Better to stop here and
# say so than to publish a dead one-click into a live deal.
node -e "
const path=require('path');
let parse;
try { ({parseOutreachAttachmentSpec:parse}=require(path.resolve('dist/go-wa.js'))); }
catch(e){ console.error('FATAL: dist/go-wa.js not loadable:', e.message); process.exit(1); }
const specs=JSON.parse(require('fs').readFileSync('$SPEC','utf8')).attachments||[];
let bad=0;
for(const s of specs){
  const ok=parse(s);
  console.log((ok?'  ok    ':'  REJECT')+' '+s.path);
  if(!ok) bad++;
}
if(bad){
  console.error('FATAL: Oracle dist/go-wa.js refuses '+bad+' attachment(s).');
  console.error('Deploy cto_aipa first (.deploy-trigger) so the sender supports this type.');
  process.exit(1);
}
console.log('  sender accepts every listed attachment');
" 2>&1 | grep -v -E 'NJS-125|DPI-1047|oracledb|^\s+at |isRecoverable|table error' || exit 1

echo "--- stage ${EXTRA[*]:-} ---"
set -o pipefail
node scripts/stage-hiring-outreach.cjs "$SPEC" --attach-deal "${EXTRA[@]}" 2>&1 \
  | grep -v -E 'NJS-125|DPI-1047|oracledb|^\s+at |isRecoverable|table error' \
  | tee /tmp/nda-stage.log
RC=${PIPESTATUS[0]}
echo "--- stage exit $RC ---"
[ "$RC" -eq 0 ] || exit "$RC"

echo "--- ship the registry back so the send button resolves the slug ---"
tar -czf /tmp/nda-stage-output.tar.gz docs/selling/outreach-registry.json
echo "packed $(stat -c %s /tmp/nda-stage-output.tar.gz) bytes"

echo "--- prove the payload the button will send ---"
node scripts/preview-outreach-email.cjs "$SLUG" 2>/dev/null || echo "WARN: preview failed"
exit 0
