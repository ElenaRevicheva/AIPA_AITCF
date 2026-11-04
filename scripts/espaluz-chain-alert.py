#!/usr/bin/env python3
"""
espaluz-chain-alert.py — tell Elena on Telegram when EspaLuz had to say "I'm resting" (4 Nov 2026).

Why: when every AI provider fails, the bots now send a kind resting message instead of an error (fair_use.py in
EspaLuzWhatsApp / EspaLuzFamilybot, same text on the web). That is graceful — and silent for Elena. This makes it loud.

Two signals, both from machinery that already exists:
  1. SCAN  — "[chain-out] ch=wa|tg" lines the bots print into their journals since the last run (= a family got the
             resting message).
  2. PROBE — every 30 min one tiny call through the WhatsApp bot's own llm_chain (the full provider order). Empty = every
             provider is down right now, for every channel including the web (same providers), before a family writes.

One alert per kind per 3 h. Sends through the cto-aipa bot (TELEGRAM_BOT_TOKEN + CONCIERGE_TG_CHAT, the chat the daily
concierge drill already alerts). Cron: */10, run with the WhatsApp venv:
  */10 * * * * /home/ubuntu/EspaLuzWhatsApp/venv/bin/python /home/ubuntu/cto-aipa/scripts/espaluz-chain-alert.py
Flags: --dry (print, send nothing), --probe-now (probe regardless of the 30 min rhythm).
"""
import json
import os
import subprocess
import sys
import time
import urllib.request

HOME = os.path.expanduser("~")
STATE = os.path.join(HOME, "logs", "espaluz-chain-alert.json")
WA_DIR = os.path.join(HOME, "EspaLuzWhatsApp")
DRY = "--dry" in sys.argv
REALERT_S = 3 * 3600
PROBE_EVERY_S = 30 * 60


def env(path):
    out = {}
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                if "=" in line and not line.lstrip().startswith("#"):
                    k, v = line.rstrip("\n").split("=", 1)
                    out[k.strip()] = v.strip().strip("\"'")
    except OSError:
        pass
    return out


def send(text):
    if DRY:
        print(f"[dry] {text}")
        return
    e = env(os.path.join(HOME, "cto-aipa", ".env"))
    token, chat = e.get("TELEGRAM_BOT_TOKEN", ""), e.get("CONCIERGE_TG_CHAT", "")
    if not token or not chat:
        print("no TELEGRAM_BOT_TOKEN / CONCIERGE_TG_CHAT")
        return
    body = json.dumps({"chat_id": chat, "text": text, "disable_web_page_preview": True}).encode()
    req = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage", data=body,
                                 headers={"Content-Type": "application/json"}, method="POST")
    urllib.request.urlopen(req, timeout=20).read()
    print(f"sent: {text[:100]}")


def alert(state, key, text):
    now = time.time()
    if now - state["alerted"].get(key, 0) < REALERT_S:
        print(f"quiet ({key} alerted <3h ago)")
        return
    send(text)
    state["alerted"][key] = now


def scan(state):
    since = state.get("scan_since") or time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(time.time() - 600))
    now_s = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())
    out = subprocess.run(["sudo", "journalctl", "-u", "espaluz-whatsapp", "-u", "espaluz-familybot", "--since", since,
                          "--until", now_s, "--utc", "--no-pager", "-o", "cat"],
                         capture_output=True, text=True, timeout=60).stdout
    state["scan_since"] = now_s
    hits = {}
    for line in out.splitlines():
        if "[chain-out]" in line:
            ch = line.split("ch=", 1)[1].split()[0] if "ch=" in line else "?"
            hits[ch] = hits.get(ch, 0) + 1
    for ch, n in hits.items():
        name = {"wa": "WhatsApp", "tg": "Telegram"}.get(ch, ch)
        alert(state, f"chain-out:{ch}",
              f"😴 EspaLuz {name}: every AI model failed {n}× in the last minutes - families got the 'resting' message "
              f"instead of a reply. Check credits/limits (Groq, Grok, Gemini, OpenAI, Claude).")
    print(f"scan {since} → {now_s}: {hits or 'no chain-out'}")


def probe(state):
    if "--probe-now" not in sys.argv and time.time() - state.get("probed", 0) < PROBE_EVERY_S:
        return
    state["probed"] = time.time()
    sys.path.insert(0, WA_DIR)
    for k, v in env(os.path.join(WA_DIR, ".env")).items():
        os.environ.setdefault(k, v)
    import llm_chain
    text, errors = llm_chain.complete("Reply with one word.", "Say OK", max_tokens=50)
    if text.strip():
        print(f"probe ok ({len(errors)} provider(s) failed first)")
        return
    alert(state, "probe:all-down",
          "🛑 EspaLuz: EVERY AI model is failing right now (probe through the full chain). The next family message on "
          "WhatsApp, Telegram or the web gets 'resting'.\n" + "\n".join(e[:110] for e in errors))


def main():
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    try:
        with open(STATE, encoding="utf-8") as f:
            state = json.load(f)
    except (OSError, ValueError):
        state = {}
    state.setdefault("alerted", {})
    try:
        scan(state)
    except Exception as e:  # noqa: BLE001
        print(f"scan error: {e}")
    try:
        probe(state)
    except Exception as e:  # noqa: BLE001
        print(f"probe error: {e}")
    if not DRY:
        with open(STATE, "w", encoding="utf-8") as f:
            json.dump(state, f)


if __name__ == "__main__":
    main()
