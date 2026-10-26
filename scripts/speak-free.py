#!/usr/bin/env python3
"""speak-free.py — free text-to-speech for the fleet: Microsoft Edge first, Google gTTS as the fallback (24 Oct 2026).

Why: OpenAI's voice died with its credits (23 Oct). Microsoft's free Edge voice works (python edge-tts 7.3.1) but is FLAKY
on long text — the same 1,219-char reply worked once and failed the next run with NoAudioReceived, or ran past 30 s.
Elena heard nothing. So: split into sentence chunks (~450 chars), each with a timeout and one retry; if any chunk still
fails, the whole text goes to Google's free gTTS (the voice EspaLuz already uses). Writes one MP3.

Used by OpenClaw (node-edge-tts ttsPromise, local patch) and CTO AIPA (telegram-bot.ts edgeVoiceOpus) — one copy.

    <venv>/bin/python speak-free.py --in text.txt --out voice.mp3 [--voice en-US-AvaMultilingualNeural] [--rate=-5%]
Exit 0 + "edge" or "gtts" on stdout; exit 1 when every provider failed.
"""
import argparse, asyncio, re, sys

CHUNK = 450


def chunks(text: str):
    sentences = re.split(r"(?<=[.!?…])\s+|\n+", text.strip())
    out, cur = [], ""
    for s in filter(None, (x.strip() for x in sentences)):
        while len(s) > CHUNK:                      # one very long sentence: cut at a comma or space
            cut = max(s.rfind(", ", 0, CHUNK), s.rfind(" ", 0, CHUNK))
            cut = cut if cut > 100 else CHUNK
            if cur:
                out.append(cur); cur = ""
            out.append(s[:cut].strip()); s = s[cut:].strip(" ,")
        if len(cur) + len(s) + 1 > CHUNK and cur:
            out.append(cur); cur = s
        else:
            cur = f"{cur} {s}".strip()
    if cur:
        out.append(cur)
    return out


# 26 Oct 2026: chunks were spoken ONE AFTER ANOTHER — the 3,783-char morning briefing took 2 min 32 s and was killed at
# the caller's 2 min 30 s limit, so Elena got text only. Now up to PARALLEL chunks at once, results kept in order.
PARALLEL = 3


async def edge(text: str, voice: str, rate: str) -> bytes:
    import edge_tts
    gate = asyncio.Semaphore(PARALLEL)

    async def one(part: str) -> bytes:
        async with gate:
            for attempt in range(2):
                try:
                    buf = b""
                    comm = edge_tts.Communicate(part, voice, rate=rate)
                    async def collect():
                        nonlocal buf
                        async for ev in comm.stream():
                            if ev["type"] == "audio":
                                buf += ev["data"]
                    await asyncio.wait_for(collect(), timeout=25)
                    if len(buf) > 500:
                        return buf
                    raise RuntimeError("no audio")
                except Exception as e:              # one retry, then give the whole text to gTTS
                    if attempt == 1:
                        raise RuntimeError(f"edge chunk failed twice: {e}")

    parts = await asyncio.gather(*(one(p) for p in chunks(text)))
    return b"".join(parts)                           # Edge MP3 frames share one format, so bytes concatenate


def gtts(text: str, out: str):
    from gtts import gTTS
    spanish = re.search(r"[áéíóúñ¿¡]", text) and len(re.findall(r"\b(el|la|los|las|que|de|y|en|por|para|con)\b", text, re.I)) > 3
    gTTS(text=text, lang="es" if spanish else "en", slow=False).save(out)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--in", dest="inp", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--voice", default="en-US-AvaMultilingualNeural")
    p.add_argument("--rate", default="+0%")
    a = p.parse_args()
    text = open(a.inp, encoding="utf8").read().strip()
    if not text:
        sys.exit("empty text")
    rate = a.rate if a.rate not in ("default", "") else "+0%"
    try:
        data = asyncio.run(edge(text, a.voice, rate))
        open(a.out, "wb").write(data)
        print("edge")
        return
    except Exception as e:
        print(f"edge failed: {e}", file=sys.stderr)
    try:
        gtts(text, a.out)
        print("gtts")
    except Exception as e:
        sys.exit(f"every free voice failed: {e}")


if __name__ == "__main__":
    main()
