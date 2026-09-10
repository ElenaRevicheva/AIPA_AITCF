#!/usr/bin/env bash
# EspaLuz Influencer: 2/3 GEO-API (new images in front), 1/3 EspaLuz.
# Piped over SSH (mode=geo). Never prints secrets. Does NOT POST a promo.
set -euo pipefail

MODE="${1:-geo}"
DIR=/home/ubuntu/EspaLuz_Influencer
WEBROOT=/var/www/influencer-images/geo-api
PUBLIC=https://webhook.aideazz.xyz/influencer-images/geo-api
STAGE=/tmp/geo-api-assets

redact() {
  sed -E \
    -e 's#https://hook\.[a-z0-9.-]*make\.com/[A-Za-z0-9_-]+#https://hook.make.com/[REDACTED]#g' \
    -e 's#(Bearer[[:space:]]+)[A-Za-z0-9._+/=-]{8,}#\1[REDACTED]#g' \
    -e 's#\b[0-9a-fA-F]{32,}\b#[REDACTED_HEX]#g' \
    -e 's#(bot)[0-9]+:[A-Za-z0-9_-]+#\1[REDACTED]#g'
}

echo "=== influencer-geo $(date -u +%Y-%m-%dT%H:%M:%SZ) mode=$MODE ==="
[ "$MODE" = "geo" ] || { echo "expected mode=geo"; exit 1; }
[ -d "$DIR" ] || { echo "FATAL: $DIR missing"; exit 1; }
[ -f "$DIR/main.py" ] || { echo "FATAL: main.py missing"; exit 1; }
[ -f /tmp/patch-influencer-geo-rotation.py ] || { echo "FATAL: patcher missing"; exit 1; }
[ -f /tmp/geo_api_promo.py ] || { echo "FATAL: geo_api_promo.py missing"; exit 1; }
[ -d "$STAGE" ] || { echo "FATAL: staged assets missing at $STAGE"; exit 1; }

echo
echo "=== 0. one-deployer ==="
echo "espaluz-influencer ActiveEnterTimestamp=$(systemctl show espaluz-influencer -p ActiveEnterTimestamp --value)"
python3 /tmp/patch-influencer-geo-rotation.py --self-check
python3 - <<'PY'
import ast, pathlib, sys
sys.path.insert(0, "/tmp")
import geo_api_promo as g
from datetime import date, datetime, timezone
# 30 Panama days from a fixed UTC noon — 20 GEO / 10 EspaLuz
geo = esp = 0
for i in range(30):
    # 2026-09-10 17:00 UTC = 12:00 Panama
    dt = datetime(2026, 9, 10, 17, 0, tzinfo=timezone.utc)
    from datetime import timedelta
    dt = dt + timedelta(days=i)
    if g.is_geo_day(dt):
        geo += 1
    else:
        esp += 1
print(f"30-day split geo={geo} espaluz={esp}")
assert geo == 20 and esp == 10, (geo, esp)
pool = g.weighted_geo_pool()
print("pool_len", len(pool), "primary", len(g.GEO_PRIMARY), "weight", g.GEO_PRIMARY_WEIGHT)
assert pool.count(g.GEO_PRIMARY[0]) == g.GEO_PRIMARY_WEIGHT
assert "https://aideazz.xyz/api" in g.maybe_geo_copy("geo_api", g.GEO_PRIMARY[0], "OLD")
assert g.maybe_geo_copy("espaluz", "x", "KEEP") == "KEEP"
print("geo_api_promo self-check: PASS")
PY

echo
echo "=== 1. install module + images (keep existing me_*.jpg) ==="
sudo mkdir -p "$WEBROOT"
mkdir -p "$DIR/geo_api_images"
cp -f /tmp/geo_api_promo.py "$DIR/geo_api_promo.py"
cp -f "$STAGE"/*.jpg "$DIR/geo_api_images/"
sudo cp -f "$STAGE"/*.jpg "$WEBROOT/"
sudo chown -R www-data:www-data /var/www/influencer-images
sudo find "$WEBROOT" -type f -exec chmod 644 {} \;
echo "geo-api files:"
ls -l "$WEBROOT"
ls "$DIR/geo_api_images"

echo
echo "=== 2. patch main.py ==="
echo "--- defs + image_url/promo/campaign hits ---"
grep -nE '^(async )?def (send_automated_daily_promo|send_daily_promo)|image_url|campaign_type|^    promo =' "$DIR/main.py" | head -80
python3 /tmp/patch-influencer-geo-rotation.py "$DIR/main.py"
python3 -c "import ast,pathlib; ast.parse(pathlib.Path('$DIR/main.py').read_text())"
python3 - <<'PY'
from pathlib import Path
src = Path("/home/ubuntu/EspaLuz_Influencer/main.py").read_text()
assert "from geo_api_promo import apply_lane" in src
assert src.count("apply_lane(campaign_type, image_url)") >= 2
assert src.count("promo = maybe_geo_copy") >= 2
assert "geo_api_images" in src
print("patch contracts: PASS")
PY

echo
echo "=== 3. restart espaluz-influencer ==="
sudo systemctl restart espaluz-influencer
sleep 3
systemctl is-active espaluz-influencer
systemctl show espaluz-influencer -p ActiveEnterTimestamp -p MainPID -p SubState
journalctl -u espaluz-influencer --since "20 seconds ago" --no-pager | redact | tail -25

echo
echo "=== 4. public HTTP proof (Buffer-sized JPEGs) ==="
for u in \
  "$PUBLIC/geo-grapes-citation.jpg" \
  "$PUBLIC/geo-passionfruit-crawlers.jpg" \
  "$PUBLIC/geo-pomegranate-audit-hand.jpg" \
  "$PUBLIC/geo-visibility-score-ui.jpg" \
  "$PUBLIC/geo-pomegranate-100-vs-72.jpg" \
  "$PUBLIC/geo-pomegranate-dashboard-2026.jpg"
do
  code=$(curl -sS -o /dev/null -w "%{http_code} %{content_type} %{size_download}" --max-time 15 -L "$u" || echo "curl-fail")
  echo "$code  $u"
done
# prove legacy pool still served
code=$(curl -sS -o /dev/null -w "%{http_code} %{size_download}" --max-time 15 -L "https://webhook.aideazz.xyz/influencer-images/marketing_engine_images/me_29.jpg" || echo fail)
echo "$code  legacy me_29.jpg (must still exist)"

echo
echo "=== 5. commit Influencer repo (module + images + main.py) ==="
(
  cd "$DIR"
  git add main.py geo_api_promo.py geo_api_images/*.jpg
  git status --porcelain | redact
  if git diff --cached --quiet; then
    echo "nothing to commit"
  else
    git commit -m "$(cat <<'EOF'
feat(influencer): 2/3 GEO-API posts, new images in front

Schedule is modulo-3 (GEO, GEO, EspaLuz). Six 1080px stills promote
https://aideazz.xyz/api; legacy me_*.jpg stay in the weighted pool.
EOF
)"
    echo "committed $(git log -1 --format='%h %s')"
    git push origin HEAD:main && echo "PUSH_OK" || echo "WARN: git push failed — live files patched"
  fi
)

echo
echo "=== DONE influencer-geo ==="
echo "ELENA: turn ON Make 3044021, then /daily_promo once. Do not Run once after sending."
