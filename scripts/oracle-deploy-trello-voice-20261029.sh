#!/usr/bin/env bash
# Deploy the 29 Oct 2026 trello-voice change to Oracle by NAMED FILES (never git pull on Oracle), then prove it.
#   bash scripts/oracle-deploy-trello-voice-20261029.sh
# What it proves: Oracle's pre-copy src md5 == git HEAD~1 (nobody else's work is overwritten), tests pass on Oracle,
# pm2 start time is newer than dist/trello-voice.js, and the compiled dist carries isAddToCardRequest.
set -euo pipefail
HOST=oracle-cto-aipa
REMOTE=~/cto-aipa
STAMP=$(date -u +%Y%m%d-%H%M%S)
EXPECT_TV="${EXPECT_TV:-211bbcb471acdb4632b55d95280dbf50}"   # md5 of src/trello-voice.ts before this change (git ea9deacc)
EXPECT_TB="${EXPECT_TB:-65074953de59bf7dfbc5e80892f639de}"   # md5 of src/telegram-bot.ts before this change
FILES="src/trello-voice.ts dist/trello-voice.js src/telegram-bot.ts dist/telegram-bot.js scripts/test-trello-voice-dates.cjs"

echo "== 1. Oracle state before the copy (backup + md5 guard)"
ssh "$HOST" "cd $REMOTE && mkdir -p ~/_session-backups/trello-voice-$STAMP && cp $FILES ~/_session-backups/trello-voice-$STAMP/ && md5sum src/trello-voice.ts src/telegram-bot.ts | awk '{print \$1}'" > /tmp/oracle-md5.txt
TV_MD5=$(sed -n 1p /tmp/oracle-md5.txt); TB_MD5=$(sed -n 2p /tmp/oracle-md5.txt)
echo "   Oracle src/trello-voice.ts  $TV_MD5  (expected $EXPECT_TV)"
echo "   Oracle src/telegram-bot.ts  $TB_MD5  (expected $EXPECT_TB)"
if [ "$TV_MD5" != "$EXPECT_TV" ] || [ "$TB_MD5" != "$EXPECT_TB" ]; then
  echo "!! Oracle's source differs from the git version this change was built on — someone else's work may be on that box."
  echo "!! Stopping before the copy. Backup is in ~/_session-backups/trello-voice-$STAMP/ on Oracle. Merge by hand."
  exit 2
fi

echo "== 2. copy the named files"
scp -q src/trello-voice.ts "$HOST:$REMOTE/src/trello-voice.ts"
scp -q dist/trello-voice.js "$HOST:$REMOTE/dist/trello-voice.js"
scp -q src/telegram-bot.ts "$HOST:$REMOTE/src/telegram-bot.ts"
scp -q dist/telegram-bot.js "$HOST:$REMOTE/dist/telegram-bot.js"
scp -q scripts/test-trello-voice-dates.cjs "$HOST:$REMOTE/scripts/test-trello-voice-dates.cjs"
scp -q scripts/trello-merge-sop-card-20261029.cjs "$HOST:$REMOTE/scripts/trello-merge-sop-card-20261029.cjs"

echo "== 3. tests on Oracle, restart, proof"
ssh "$HOST" "cd $REMOTE && sed -i 's/\r$//' src/trello-voice.ts dist/trello-voice.js src/telegram-bot.ts dist/telegram-bot.js scripts/test-trello-voice-dates.cjs \
  && node scripts/test-trello-voice-dates.cjs | tail -1 \
  && pm2 restart cto-aipa --update-env >/dev/null && sleep 8 \
  && echo '-- md5 live files' && md5sum src/trello-voice.ts dist/trello-voice.js \
  && echo '-- dist carries the change:' && grep -c 'isAddToCardRequest' dist/trello-voice.js \
  && echo '-- file time vs process start' && stat -c '%y  %n' dist/trello-voice.js \
  && pm2 jlist | node -e 'const a=JSON.parse(require(\"fs\").readFileSync(0,\"utf8\"));for(const p of a)if(p.name===\"cto-aipa\")console.log(\"pm2\",p.name,p.pm2_env.status,\"started\",new Date(p.pm2_env.pm_uptime).toISOString(),\"restarts\",p.pm2_env.restart_time)'"
echo "== local md5 for comparison"; md5sum src/trello-voice.ts dist/trello-voice.js | sed 's/\r//'
