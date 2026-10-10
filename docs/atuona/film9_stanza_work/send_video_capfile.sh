#!/bin/bash
# Oracle helper (copied next to the film, run there): send a video to Elena's Telegram with a caption read from a FILE,
# so multi-line captions with links survive ssh quoting. Same bot + chat as send_preview_tg.sh. Usage: <video> <caption file>
set -e
envv() { grep -E "^$1=" /home/ubuntu/cto-aipa/.env | head -1 | cut -d= -f2- | tr -d '"\r'; }
T=$(envv TELEGRAM_BOT_TOKEN); C=$(envv CONCIERGE_TG_CHAT)
[ -n "$T" ] && [ -n "$C" ] || { echo "token or chat missing"; exit 1; }
curl -s -m 600 -F chat_id="$C" -F video=@"$1" -F supports_streaming=true -F caption="<$2" "https://api.telegram.org/bot$T/sendVideo" \
  | python3 -c 'import json,sys; r=json.load(sys.stdin); print("ok" if r.get("ok") else r)'
