#!/usr/bin/env bash
# Run stage-hiring-outreach.cjs on the Oracle VM, where .env lives.
#
# A Cursor cloud agent has no HUBSPOT_API_KEY and no egress to api.hubapi.com.
# This script is piped over ssh by .github/workflows/hire-outreach-on-trigger.yml.
# It tars back whatever the run wrote under docs/selling so the registry and the
# draft can be committed. That commit is not optional: /go/outreach-email/{slug}
# falls back to GitHub main when Oracle disk is stale.
#
# Usage (on Oracle): bash oracle-stage-hiring-outreach.sh <ref> <spec-relpath> [--dry-run]
set -uo pipefail

REF="${1:?ref required}"
SPEC="${2:?spec path required}"
shift 2
FLAGS=("$@")

AIPA_DIR=/home/ubuntu/cto-aipa
[ -d "$AIPA_DIR/.git" ] || AIPA_DIR=/home/ubuntu/AIPA_AITCF
cd "$AIPA_DIR" || { echo "FATAL: no cto-aipa checkout on this box"; exit 1; }
echo "--- staging $SPEC in $AIPA_DIR as $(whoami) ---"

if [ ! -f .env ]; then
  echo "FATAL: .env missing on Oracle — HUBSPOT_API_KEY unavailable"
  exit 1
fi

# Sweep mode: close send-tasks whose letter demonstrably went out. Writes no
# registry and creates nothing, so it skips the whole staging path below.
if [ "$SPEC" = "close-send-tasks" ]; then
  echo "--- fetching $REF ---"
  git fetch origin "$REF" 2>&1 || { echo "FATAL: fetch $REF failed"; exit 1; }
  git checkout FETCH_HEAD -- \
    scripts/hs-close-sent-send-tasks.cjs \
    scripts/hs-env.cjs 2>&1 || { echo "FATAL: checkout of sweep script failed"; exit 1; }
  echo "--- node scripts/hs-close-sent-send-tasks.cjs ${FLAGS[*]-} ---"
  set +e
  node scripts/hs-close-sent-send-tasks.cjs "${FLAGS[@]}" 2>&1
  RC=$?
  set -e
  echo "--- sweep exit code: $RC ---"
  rm -f /tmp/stage-hiring-output.tar.gz
  exit "$RC"
fi

# Mail-read mode: pull the IntelliOps thread from Zoho IMAP. Read-only against
# the mailbox (readonly SELECT), writes nothing to HubSpot, and tars the result
# back so an agent with no mail credentials and no IMAP egress can read it.
if [ "$SPEC" = "intelliops-mail" ]; then
  echo "--- fetching $REF ---"
  git fetch origin "$REF" 2>&1 || { echo "FATAL: fetch $REF failed"; exit 1; }
  git checkout FETCH_HEAD -- scripts/intelliops-imap-pull.py 2>&1 \
    || { echo "FATAL: checkout of the IMAP script failed"; exit 1; }

  rm -rf /tmp/intelliops-mail
  echo "--- python3 scripts/intelliops-imap-pull.py ---"
  set +e
  # Secrets are never printed by the script; it reports key NAMES only.
  python3 scripts/intelliops-imap-pull.py 2>&1
  RC=$?
  set -e
  echo "--- imap pull exit code: $RC ---"

  if [ -d /tmp/intelliops-mail ]; then
    tar -czf /tmp/intelliops-mail.tar.gz -C /tmp intelliops-mail
    echo "--- packed $(stat -c %s /tmp/intelliops-mail.tar.gz) bytes ---"
    ls -la /tmp/intelliops-mail | sed 's/^/      /'
    # The transcript goes to stdout because the build artifact cannot be
    # downloaded by a cloud agent: the Actions blob host is not in its egress
    # allowlist, so the log is the only channel that reaches it.
    if [ -f /tmp/intelliops-mail/transcript.txt ]; then
      echo "--- BEGIN TRANSCRIPT ---"
      cat /tmp/intelliops-mail/transcript.txt
      echo "--- END TRANSCRIPT ---"
    fi
    # A PDF whose text could not be extracted here still has to be readable by
    # the agent, and the artifact route is closed to it. Small ones travel as
    # base64 through the log, which is the same private channel as the
    # transcript. Capped so a scanned 5 MB contract cannot flood the run.
    for f in /tmp/intelliops-mail/*.pdf; do
      [ -f "$f" ] || continue
      SZ=$(stat -c %s "$f")
      if [ "$SZ" -le 150000 ]; then
        echo "--- BEGIN B64 $(basename "$f") $SZ ---"
        base64 -w 200 "$f"
        echo "--- END B64 $(basename "$f") ---"
      else
        echo "--- SKIP B64 $(basename "$f") $SZ bytes (over 150000 cap) ---"
      fi
    done
  else
    echo "--- nothing to pack ---"
  fi
  rm -f /tmp/stage-hiring-output.tar.gz
  exit "$RC"
fi

# Attach mode: upload a slug's attachments into HubSpot and hang them off the
# deal's note. Reads the registry, writes only to HubSpot.
if [ "$SPEC" = "attach-files" ]; then
  echo "--- fetching $REF ---"
  git fetch origin "$REF" 2>&1 || { echo "FATAL: fetch $REF failed"; exit 1; }
  git checkout FETCH_HEAD -- \
    scripts/hs-attach-deal-files.cjs \
    scripts/hs-files.cjs \
    scripts/hs-env.cjs 2>&1 || { echo "FATAL: checkout of attach scripts failed"; exit 1; }

  # The registry names the files; union GitHub's copy over the disk so a
  # lagging checkout cannot hide the slug we were asked to attach.
  git show "FETCH_HEAD:docs/selling/outreach-registry.json" > /tmp/gh-attach-registry.json 2>/dev/null \
    || { echo "FATAL: GitHub registry missing on $REF"; exit 1; }
  node -e '
    const fs = require("fs");
    const gh = JSON.parse(fs.readFileSync("/tmp/gh-attach-registry.json", "utf8"));
    let disk = {};
    try { disk = JSON.parse(fs.readFileSync("docs/selling/outreach-registry.json", "utf8")); } catch {}
    const out = { ...disk, ...gh };
    fs.writeFileSync("docs/selling/outreach-registry.json", JSON.stringify(out, null, 2) + "\n");
    console.log("  registry keys:", Object.keys(out).length);
  ' || exit 1

  # And the files themselves must be on disk to be uploaded.
  ATTACH_PATHS=$(node -e '
    const fs=require("fs");
    const reg=JSON.parse(fs.readFileSync("docs/selling/outreach-registry.json","utf8"));
    const want=process.argv[1]||"";
    const rows=Object.entries(reg).filter(([s,v])=>{
      if(!v.attachments||!v.attachments.length) return false;
      if(!want) return true;
      return s===want || String(v.dealId||"")===want;
    });
    console.log([...new Set(rows.flatMap(([,v])=>v.attachments.map(a=>a.path)))].join(" "));
  ' "$(printf '%s\n' "${FLAGS[@]}" | sed -n 's/^--\(slug\|deal\)=//p' | head -n1)")
  if [ -n "$ATTACH_PATHS" ]; then
    # shellcheck disable=SC2086
    git checkout FETCH_HEAD -- $ATTACH_PATHS 2>&1 || { echo "FATAL: attachment checkout failed"; exit 1; }
    echo "--- files on disk: $ATTACH_PATHS ---"
  fi

  echo "--- node scripts/hs-attach-deal-files.cjs ${FLAGS[*]-} ---"
  set +e
  node scripts/hs-attach-deal-files.cjs "${FLAGS[@]}" 2>&1
  RC=$?
  set -e
  echo "--- attach exit code: $RC ---"
  rm -f /tmp/stage-hiring-output.tar.gz /tmp/gh-attach-registry.json
  exit "$RC"
fi

# Named files only. Oracle's checkout is meant to lag; never git pull.
echo "--- fetching $REF ---"
git fetch origin "$REF" 2>&1 || { echo "FATAL: fetch $REF failed"; exit 1; }
git checkout FETCH_HEAD -- \
  scripts/stage-hiring-outreach.cjs \
  scripts/hs-env.cjs \
  scripts/preview-outreach-email.cjs \
  "$SPEC" \
  2>&1 || { echo "FATAL: checkout of staging files from $REF failed"; exit 1; }

# The letter and any files it claims to attach. A spec that names an attachment
# the box does not have would register a button that refuses on click.
DRAFT_FILE=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$SPEC','utf8')).draftFile||'')")
ATTACH_PATHS=$(node -e "
const s=JSON.parse(require('fs').readFileSync('$SPEC','utf8'));
console.log((s.attachments||[]).map(a=>a.path).join(' '));
")
if [ -n "$DRAFT_FILE" ]; then
  git checkout FETCH_HEAD -- "$DRAFT_FILE" 2>&1 \
    || { echo "FATAL: draftFile $DRAFT_FILE not on $REF"; exit 1; }
fi
if [ -n "$ATTACH_PATHS" ]; then
  # shellcheck disable=SC2086
  git checkout FETCH_HEAD -- $ATTACH_PATHS 2>&1 \
    || { echo "FATAL: attachment(s) not on $REF: $ATTACH_PATHS"; exit 1; }
  echo "--- the box must be able to SEND what we are about to register ---"
  node -e "
const path=require('path');
let parse;
try { ({parseOutreachAttachmentSpec:parse}=require(path.resolve('dist/go-wa.js'))); }
catch(e){ console.error('FATAL: dist/go-wa.js not loadable: '+e.message); process.exit(1); }
const specs=JSON.parse(require('fs').readFileSync('$SPEC','utf8')).attachments||[];
let bad=0;
for(const s of specs){
  const ok=parse(s);
  console.log((ok?'  ok     ':'  REJECT ')+s.path);
  if(!ok) bad++;
}
if(bad){
  console.error('FATAL: this box\'s compiled sender refuses '+bad+' attachment(s).');
  console.error('Deploy cto_aipa first (.deploy-trigger) so dist/go-wa.js supports the type.');
  process.exit(1);
}
console.log('  compiled sender accepts every listed attachment');
" 2>&1 | grep -v -E 'NJS-125|DPI-1047|oracledb|^[[:space:]]+at |isRecoverable|table error|^[[:space:]]*\}' || exit 1
fi

# Union GitHub's committed registry with whatever is already on this disk so a
# lagging Oracle checkout cannot drop keys (AfterQuery was lost that way once).
# GitHub wins on a key both have — that is the committed source of truth.
echo "--- merging outreach-registry.json (GitHub ∪ Oracle disk) ---"
git show "FETCH_HEAD:docs/selling/outreach-registry.json" > /tmp/gh-outreach-registry.json 2>/dev/null \
  || { echo "FATAL: GitHub registry missing on $REF"; exit 1; }
node -e '
  const fs = require("fs");
  const gh = JSON.parse(fs.readFileSync("/tmp/gh-outreach-registry.json", "utf8"));
  let disk = {};
  try { disk = JSON.parse(fs.readFileSync("docs/selling/outreach-registry.json", "utf8")); } catch { /* first run */ }
  const out = { ...disk, ...gh };
  const added = Object.keys(gh).filter((k) => !disk[k]).length;
  const kept = Object.keys(disk).filter((k) => !gh[k]).length;
  fs.writeFileSync("docs/selling/outreach-registry.json", JSON.stringify(out, null, 2) + "\n");
  console.log("  registry keys:", Object.keys(out).length, "(+" + added, "from GitHub, kept", kept, "Oracle-only)");
'

snapshot() { find docs/selling -type f -exec md5sum {} + 2>/dev/null | sort; }
BEFORE=$(mktemp)
snapshot > "$BEFORE"

echo "--- node scripts/stage-hiring-outreach.cjs $SPEC ${FLAGS[*]-} ---"
set +e
node scripts/stage-hiring-outreach.cjs "$SPEC" "${FLAGS[@]}" 2>&1
RC=$?
set -e
echo "--- stage exit code: $RC ---"

if [ "$RC" -eq 0 ]; then
  echo "--- prove the payload the button will send ---"
  SLUG=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$SPEC','utf8')).slug)")
  node scripts/preview-outreach-email.cjs "$SLUG" 2>/dev/null || echo "WARN: preview failed"
fi

AFTER=$(mktemp)
snapshot > "$AFTER"
CHANGED=$(mktemp)
comm -13 "$BEFORE" "$AFTER" | sed 's/^[0-9a-f]*  //' | sort -u > "$CHANGED"

OUT=/tmp/stage-hiring-output.tar.gz
rm -f "$OUT"
if [ -s "$CHANGED" ]; then
  echo "--- this run touched: ---"
  sed 's/^/      /' "$CHANGED"
  tar -czf "$OUT" -T "$CHANGED" 2>/dev/null && echo "--- packed $(wc -l < "$CHANGED") file(s) → $OUT ---"
else
  echo "--- no docs/selling changes to pack (dry run, or nothing written) ---"
fi
rm -f "$BEFORE" "$AFTER" "$CHANGED" /tmp/gh-outreach-registry.json

exit $RC
