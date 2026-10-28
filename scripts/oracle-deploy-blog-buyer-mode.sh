#!/usr/bin/env bash
# Deploy the daily-blog buyer-question mode (28 Oct 2026) and apply the Redis correction
# to the publisher cache on Oracle. Named files only; restarts cto-aipa; prints proof.
#
#   bash scripts/oracle-deploy-blog-buyer-mode.sh
#
# Built on the laptop first (npx tsc). Expected CR-stripped md5 of what ships:
#   dist/daily-blog-publisher.js  3865d236b58d7453024bca947e1cf005
#   dist/blog-evidence.js         3b3db29f6bbd1ed823b5c173b6cbefbd
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== local build check"
tr -d '\r' < dist/daily-blog-publisher.js | md5sum
tr -d '\r' < dist/blog-evidence.js | md5sum

echo "== scp named files"
scp dist/daily-blog-publisher.js dist/blog-evidence.js oracle-cto-aipa:~/cto-aipa/dist/

echo "== remote: cache correction, restart, proof"
ssh oracle-cto-aipa 'bash -s' <<'REMOTE'
set -euo pipefail
cd ~/cto-aipa
git fetch -q origin main
git checkout origin/main -- scripts/blog-redis-correction.cjs
node scripts/blog-redis-correction.cjs --cache data/blog-posts-cache.json --apply | tail -3
# Spanish bundles of the corrected articles regenerate from the corrected markdown (moved, not deleted)
mkdir -p data/blog-es-cache.bak-20261028
for s in $(node -e 'const c=require("./data/blog-posts-cache.json");console.log(Object.keys(c).filter(s=>/Correction \(28 October 2026\)/.test(c[s].markdown)).join(" "))'); do
  [ -f "data/blog-es-cache/$s.json" ] && mv "data/blog-es-cache/$s.json" data/blog-es-cache.bak-20261028/ || true
done
echo "es-cache moved: $(ls data/blog-es-cache.bak-20261028 | wc -l)"
pm2 restart cto-aipa --update-env >/dev/null
sleep 6
echo "== shipped md5 (CR-stripped)"
tr -d '\r' < dist/daily-blog-publisher.js | md5sum
tr -d '\r' < dist/blog-evidence.js | md5sum
pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const p of JSON.parse(s))if(p.name=="cto-aipa")console.log("pm2:",p.name,p.pm2_env.status,"started",new Date(p.pm2_env.pm_uptime).toISOString())})'
echo "== live audit-catalogue collector (the buyer article's method facts)"
node -e 'const ev=require("./dist/blog-evidence.js");const f=[];ev.collectAuditCatalog(f).then(()=>{console.log("audit facts:",f.length);console.log(" ",f[0].value);console.log(" ",f.find(x=>x.key=="audit-self").value);console.log(" ",f.find(x=>x.key=="offer-diagnostic").value)}).catch(e=>{console.log("collector FAILED:",e.message);process.exit(1)})'
echo "== next buyer question the publisher will take"
node -e 'const p=require("./dist/daily-blog-publisher.js");const q=p.pickBuyerQuestion();console.log(q?q.lane+": "+q.keyword:"none (list spent or mode off)")' 2>/dev/null | tail -1
pm2 logs cto-aipa --lines 40 --nostream 2>/dev/null | grep -i "daily blog\|Daily blog" | tail -2 || true
REMOTE
echo "== done. Tomorrow 14:30 Panama: pm2 logs should show '[daily-blog] Buyer question (dental)' and a 🎯 line on the Telegram card."
