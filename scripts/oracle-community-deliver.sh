#!/usr/bin/env bash
# Named-file deploy of the community paste encoder, then deliver one Telegram paste.
# Piped over SSH from .github/workflows/community-deliver-on-trigger.yml
#
# Usage (on Oracle):
#   bash scripts/oracle-community-deliver.sh <git-ref> [deliver|record-posted|pin-hubspot]
set -uo pipefail

REF="${1:?git ref required}"
MODE="${2:-deliver}"
AIPA_DIR=/home/ubuntu/cto-aipa
[ -d "$AIPA_DIR/.git" ] || AIPA_DIR=/home/ubuntu/AIPA_AITCF
cd "$AIPA_DIR" || { echo "FATAL: no cto-aipa checkout"; exit 1; }

if [ ! -f .env ]; then
  echo "FATAL: .env missing on Oracle"
  exit 1
fi

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP="$AIPA_DIR/backups/community-paste-$STAMP"
mkdir -p "$BACKUP"
for f in dist/community-notify.js dist/community-listener.js dist/community-paste.js dist/community-store.js dist/visibility-api.js; do
  [ -f "$f" ] && cp -a "$f" "$BACKUP/" || true
done
echo "--- backup $BACKUP ---"

echo "--- fetch $REF ---"
git fetch origin "$REF" 2>&1 || { echo "FATAL: fetch failed"; exit 1; }

echo "--- checkout named source + scripts from FETCH_HEAD ---"
git checkout FETCH_HEAD -- \
  src/community-paste.ts src/community-notify.ts src/community-listener.ts src/community-store.ts \
  src/visibility-api.ts \
  scripts/community-deliver-one.cjs scripts/community-ugc-followup.cjs \
  scripts/hs-pin-community-board.cjs scripts/test-community-paste.cjs 2>&1 \
  || echo "WARN: source checkout partial"

echo "--- install compiled dist from /tmp/community-deploy (built on the runner) ---"
if [ -d /tmp/community-deploy ]; then
  cp -f /tmp/community-deploy/community-paste.js dist/community-paste.js
  cp -f /tmp/community-deploy/community-notify.js dist/community-notify.js
  cp -f /tmp/community-deploy/community-listener.js dist/community-listener.js
  cp -f /tmp/community-deploy/community-store.js dist/community-store.js
  cp -f /tmp/community-deploy/visibility-api.js dist/visibility-api.js
  cp -f /tmp/community-deploy/community-deliver-one.cjs scripts/community-deliver-one.cjs
  cp -f /tmp/community-deploy/community-ugc-followup.cjs scripts/community-ugc-followup.cjs
  cp -f /tmp/community-deploy/hs-pin-community-board.cjs scripts/hs-pin-community-board.cjs
else
  echo "WARN: /tmp/community-deploy missing — hoping tsc is on the box"
  npx --yes tsc --pretty false || { echo "FATAL: no compiled dist and tsc failed"; exit 1; }
fi

echo "--- prove encoder is in dist/ ---"
grep -n "encodePastePayload" dist/community-paste.js || { echo "FATAL: encodePastePayload missing"; exit 1; }
grep -n "isCompleteDraft" dist/community-listener.js || { echo "FATAL: isCompleteDraft missing"; exit 1; }
grep -n "I've posted it" dist/community-notify.js || { echo "FATAL: Posted button missing"; exit 1; }
grep -n "recordAlreadyPosted" dist/community-notify.js || { echo "FATAL: recordAlreadyPosted missing"; exit 1; }
grep -n "getOpportunityBySourceExternal" dist/community-store.js || { echo "FATAL: lookup missing"; exit 1; }
grep -n "communityBoardDealUrl" dist/community-notify.js || { echo "FATAL: deal URL helper missing"; exit 1; }
grep -n "record/0-3/" dist/community-paste.js || { echo "FATAL: deal object type 0-3 missing"; exit 1; }
grep -n "utm_campaign" dist/community-paste.js | grep -q "community-reply" || { echo "FATAL: community-reply UTM missing"; exit 1; }
grep -n "parseRequestUtms" dist/visibility-api.js || { echo "FATAL: audit UTM parser missing"; exit 1; }

BEFORE=$(stat -c %Y dist/community-paste.js)
echo "dist/community-paste.js mtime=$BEFORE"

echo "--- pm2 restart cto-aipa --update-env ---"
pm2 restart cto-aipa --update-env
sleep 5
pm2 describe cto-aipa | grep -E 'status|uptime|restarts' | head -20

echo "--- process must be newer than the file ---"
# pm2 dumps JSON; start timestamp vs file mtime
node -e '
const {execSync}=require("child_process");
const fs=require("fs");
const file=fs.statSync("dist/community-paste.js").mtimeMs;
const raw=execSync("pm2 jlist",{encoding:"utf8"});
const apps=JSON.parse(raw);
const app=apps.find(a=>a.name==="cto-aipa");
if(!app){console.error("FATAL: cto-aipa not in pm2"); process.exit(1);}
const started=app.pm2_env.pm_uptime;
console.log("file mtime", new Date(file).toISOString());
console.log("pm2 started", new Date(started).toISOString(), "status", app.pm2_env.status);
if(app.pm2_env.status!=="online"){console.error("FATAL: not online"); process.exit(1);}
if(started < file - 2000){console.error("FATAL: process older than deployed file"); process.exit(1);}
console.log("ok — running process is newer than dist/community-paste.js");
'

echo "--- $MODE ---"
if [ "$MODE" = "deploy-only" ]; then
  echo "ok — named files deployed, no Telegram fire"
  exit 0
elif [ "$MODE" = "record-posted" ]; then
  node scripts/community-deliver-one.cjs --already-posted | tee /tmp/community-deliver-one.log
elif [ "$MODE" = "pin-hubspot" ]; then
  node scripts/hs-pin-community-board.cjs | tee /tmp/community-deliver-one.log
else
  node scripts/community-deliver-one.cjs | tee /tmp/community-deliver-one.log
fi
RC=${PIPESTATUS[0]}
echo "--- deliver exit $RC ---"
exit "$RC"
