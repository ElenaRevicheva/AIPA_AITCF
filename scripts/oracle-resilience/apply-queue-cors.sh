#!/usr/bin/env bash
# Let aideazz.xyz/ops/ (the static face of Elena's CRM) read the queue API on this box.
#
# 28 Oct 2026. The queue data lives at /queue/api/* behind nginx basic auth. A page served
# from https://aideazz.xyz calls it cross-origin, which needs two things nginx did not do:
#   1. answer the browser's OPTIONS preflight WITHOUT the password (the preflight never
#      carries credentials — a 401 there kills the request before it starts);
#   2. carry Access-Control-Allow-Origin on every /queue/api/ response, 401 included,
#      so the page can tell "wrong password" from "unreachable".
# The lock itself is unchanged: GET/POST still need the same htpasswd user. The page
# /queue/ itself and /ops/ are untouched.
#
# Idempotent. Derives the file and the proxy lines from the LIVE config (never assumes a
# path), backs the file up, `nginx -t`, reloads, verifies the live endpoint three ways and
# rolls back on any failure. Run on Oracle as ubuntu: bash ~/apply-queue-cors.sh
set -euo pipefail
fail(){ echo "✗ $*" >&2; exit 1; }

# -R, not -r: sites-enabled/ holds symlinks, and -r skips symlinks inside a directory (29 Oct: found nothing).
F=$(sudo -n grep -RlE 'location[[:space:]]+/queue/[[:space:]]*\{' /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null | head -1 || true)
F=$(readlink -f "$F")
[ -n "$F" ] || fail "no nginx file has 'location /queue/'"
if sudo -n grep -q 'location /queue/api/' "$F"; then echo "already applied in $F"; exit 0; fi

# The existing /queue/ block, brace-balanced.
BLOCK=$(sudo -n awk '/location[[:space:]]+\/queue\/[[:space:]]*\{/{f=1} f{print; n+=gsub(/\{/,"{"); n-=gsub(/\}/,"}"); if(n==0) exit}' "$F")
[ -n "$BLOCK" ] || fail "could not read the /queue/ block"
INDENT=$(printf '%s\n' "$BLOCK" | head -1 | sed -E 's/^([[:space:]]*).*/\1/')
PROXY=$(printf '%s\n' "$BLOCK" | grep -E '^[[:space:]]*proxy_' || true)
AUTH=$(printf '%s\n' "$BLOCK" | grep -E '^[[:space:]]*auth_basic' || true)
printf '%s\n' "$PROXY" | grep -q 'proxy_pass' || fail "the /queue/ block has no proxy_pass; apply by hand"
# A proxy_pass with a URI part rewrites the matched prefix. Safe cases: a bare host, or the
# 1:1 mapping `…/queue/` (live since 31 Aug), which becomes `…/queue/api/` for the new prefix.
if printf '%s\n' "$PROXY" | grep -qE 'proxy_pass[[:space:]]+https?://[^/;[:space:]]+/queue/;'; then
  PROXY=$(printf '%s\n' "$PROXY" | sed -E 's#(proxy_pass[[:space:]]+https?://[^/;[:space:]]+)/queue/;#\1/queue/api/;#')
elif printf '%s\n' "$PROXY" | grep -qE 'proxy_pass[[:space:]]+https?://[^/;[:space:]]+/[^;[:space:]]'; then
  fail "proxy_pass carries a URI; apply by hand"
fi

NEW=$(cat <<EOF
${INDENT}# 28 Oct 2026 — aideazz.xyz/ops/ is the face of the CRM; the data stays here (apply-queue-cors.sh).
${INDENT}location /queue/api/ {
${INDENT}    # 29 Oct: the app sends its own ACAO *; two values make the browser refuse the reply.
${INDENT}    proxy_hide_header Access-Control-Allow-Origin;
${INDENT}    proxy_hide_header Access-Control-Allow-Headers;
${INDENT}    proxy_hide_header Access-Control-Allow-Methods;
${INDENT}    set \$ops_cors "";
${INDENT}    if (\$http_origin ~* ^https://(www\.)?aideazz\.xyz\$) { set \$ops_cors \$http_origin; }
${INDENT}    if (\$request_method = OPTIONS) {
${INDENT}        add_header Access-Control-Allow-Origin \$ops_cors always;
${INDENT}        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
${INDENT}        add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;
${INDENT}        add_header Access-Control-Max-Age 86400 always;
${INDENT}        add_header Vary Origin always;
${INDENT}        return 204;
${INDENT}    }
${INDENT}    add_header Access-Control-Allow-Origin \$ops_cors always;
${INDENT}    add_header Vary Origin always;
$(printf '%s\n' "$AUTH" | sed "s/^/    /")
$(printf '%s\n' "$PROXY" | sed "s/^/    /")
${INDENT}}
EOF
)

TS=$(date -u +%Y%m%d-%H%M%S)
BK=/home/ubuntu/_session-backups/nginx-queue-cors-$TS
mkdir -p "$BK" && sudo -n cp "$F" "$BK/$(basename "$F")" && echo "backup → $BK"

TMP=$(mktemp)
# ENVIRON, not -v: -v processes backslash escapes and would turn aideazz\.xyz into aideazz.xyz.
sudo -n env BLOCK="$NEW" awk '/location[[:space:]]+\/queue\/[[:space:]]*\{/ && !done {print ENVIRON["BLOCK"]; done=1} {print}' "$F" > "$TMP"
grep -q 'location /queue/api/' "$TMP" || fail "insertion produced no block"
sudo -n cp "$TMP" "$F"; rm -f "$TMP"

rollback(){ echo "↩ rolling back"; sudo -n cp "$BK/$(basename "$F")" "$F"; sudo -n nginx -t && sudo -n systemctl reload nginx; }
sudo -n nginx -t || { rollback; fail "nginx -t rejected the new block"; }
sudo -n systemctl reload nginx
# reload returns before the workers switch config; checking at once reads the OLD config (29 Oct: rolled back a good change).
sleep 3

H=https://webhook.aideazz.xyz/queue
c1=$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS -H 'Origin: https://aideazz.xyz' -H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: authorization' "$H/api/today")
c2=$(curl -s -D - -o /dev/null -H 'Origin: https://aideazz.xyz' "$H/api/today" | tr -d '\r')
c2code=$(printf '%s\n' "$c2" | head -1 | awk '{print $2}')
c2cors=$(printf '%s\n' "$c2" | grep -i '^access-control-allow-origin:' | awk '{print $2}' || true)
c3=$(curl -s -o /dev/null -w '%{http_code}' "$H/")
echo "preflight=$c1 anonymous-get=$c2code cors=$c2cors page=$c3"
if [ "$c1" != "204" ] || [ "$c2code" != "401" ] || [ "$c2cors" != "https://aideazz.xyz" ] || [ "$c3" != "401" ]; then
  rollback; fail "live check failed — restored the previous config"
fi
echo "✓ /queue/api/ answers preflights and carries CORS for aideazz.xyz; lock intact (anonymous 401)"
