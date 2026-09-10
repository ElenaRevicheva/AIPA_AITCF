"""EspaLuz Influencer lane: 2/3 GEO/AEO/Tech-SEO promoting aideazz.xyz/api, 1/3 EspaLuz.

Imported by main.py (Oracle). Does not start the bot. Secrets stay in .env.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Tuple
from zoneinfo import ZoneInfo

PUBLIC = "https://webhook.aideazz.xyz/influencer-images"
GEO_DIR = f"{PUBLIC}/geo-api"
ME_DIR = f"{PUBLIC}/marketing_engine_images"
API_URL = "https://aideazz.xyz/api"
PORTFOLIO = "https://aideazz.xyz/portfolio"

# New fruit/dashboard stills — in FRONT of the legacy marketing-engine pool.
# Fired 5× as often as any single me_*.jpg (see weighted_geo_pool).
GEO_PRIMARY = [
    f"{GEO_DIR}/geo-grapes-citation.jpg",
    f"{GEO_DIR}/geo-passionfruit-crawlers.jpg",
    f"{GEO_DIR}/geo-pomegranate-audit-hand.jpg",
    f"{GEO_DIR}/geo-visibility-score-ui.jpg",
    f"{GEO_DIR}/geo-pomegranate-100-vs-72.jpg",
    f"{GEO_DIR}/geo-pomegranate-dashboard-2026.jpg",
]
# Each new still appears this many times per cycle vs one slot for each me_*.jpg.
# 10× → ~65% of GEO-day posts are the new fruit/dashboard cards; legacy stays in the pool.
GEO_PRIMARY_WEIGHT = 10

# Legacy marketing-engine cards — kept, never deleted, just less often.
GEO_LEGACY = [f"{ME_DIR}/me_{i:02d}.jpg" for i in range(1, 33)]

PANAMA = ZoneInfo("America/Panama")
# /tmp — never next to the bot. EspaLuz_Influencer is a HUD-listed tree;
# a rotation index is not PII, but it must not become a tracked JSON blob.
_MEMORY = Path(os.environ.get("GEO_API_MEMORY", "/tmp/espaluz-geo_api_rotation.json"))


def _load_memory() -> dict:
    try:
        import json
        if _MEMORY.is_file():
            data = json.loads(_MEMORY.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
    except Exception:
        pass
    return {}


def _save_memory(mem: dict) -> None:
    try:
        import json
        _MEMORY.write_text(json.dumps(mem, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    except Exception:
        pass


def panama_today(now: Optional[datetime] = None):
    dt = now or datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(PANAMA).date()


def is_geo_day(now: Optional[datetime] = None) -> bool:
    """2/3 GEO, 1/3 EspaLuz: ordinal % 3 in {0,1} → GEO, {2} → EspaLuz."""
    return panama_today(now).toordinal() % 3 != 2


def weighted_geo_pool() -> List[str]:
    return GEO_PRIMARY * GEO_PRIMARY_WEIGHT + GEO_LEGACY


def next_geo_image(memory: Optional[dict] = None) -> str:
    pool = weighted_geo_pool()
    mem = memory if isinstance(memory, dict) else _load_memory()
    idx = int(mem.get("geo_api_image_rotation_index") or 0)
    url = pool[idx % len(pool)]
    mem["geo_api_image_rotation_index"] = (idx + 1) % len(pool)
    if memory is None:
        _save_memory(mem)
    return url


def apply_lane(
    old_campaign: str,
    old_url: str,
    memory: Optional[dict] = None,
    now: Optional[datetime] = None,
) -> Tuple[str, str]:
    if is_geo_day(now):
        # Keep Make.com's existing marketing_engine router; swap the asset + copy.
        return "marketing_engine", next_geo_image(memory)
    if old_url and "geo-api/" not in old_url and "/marketing_engine_images/" not in old_url:
        return "espaluz", old_url
    return "espaluz", old_url or f"{PUBLIC}/image1.jpg"


# --- copy: specific to the live API, not generic "AI is the future" ---
# Facts from src/visibility-audit.ts + visibility-api.ts (engine 1.2.0):
# 34 checks, 4 categories (crawler 25 / GEO 25 / AEO 30 / tech 20),
# GPTBot · ClaudeBot · PerplexityBot · Google-Extended, direct page reads,
# each check carries `why it matters`, shareable ?url=, free demo.

_POSTS = {
    "geo-grapes-citation.jpg": {
        "en": (
            "Google ranked you. ChatGPT still picked someone else's grape.\n\n"
            "Answer engines don't 'search'. They lift a cluster of pages they can "
            "parse — schema, llms.txt, a sentence they can quote without guessing. "
            "If you're not in that cluster, you are dew on a leaf they never pick.\n\n"
            "I built the audit I wanted as a buyer: 34 checks, each with why it "
            "matters, across crawler access / GEO / AEO / tech-SEO. Paste any URL. "
            "No scraping vendor. The bots that actually quote you — GPTBot, ClaudeBot, "
            "PerplexityBot, Google-Extended — either reach you or they don't.\n\n"
            f"Run yours free: {API_URL}\n"
            f"Work: {PORTFOLIO}"
        ),
        "es": (
            "Google te posicionó. ChatGPT igual eligió la uva de otro.\n\n"
            "Los motores de respuesta no 'buscan'. Levantan un racimo de páginas "
            "que pueden parsear: schema, llms.txt, una frase que puedan citar sin "
            "adivinar. Si no estás en ese racimo, eres rocío en una hoja que no cortan.\n\n"
            "Construí la auditoría que yo querría como compradora: 34 chequeos, cada "
            "uno con por qué importa — crawlers / GEO / AEO / tech-SEO. Pegas la URL. "
            "Sin vendor de scraping. GPTBot, ClaudeBot, PerplexityBot, Google-Extended "
            "o te alcanzan, o no.\n\n"
            f"Pruébalo gratis: {API_URL}\n"
            f"Trabajo: {PORTFOLIO}"
        ),
    },
    "geo-passionfruit-crawlers.jpg": {
        "en": (
            "Those are not decorations. They are GPTBot, ClaudeBot and PerplexityBot "
            "trying to taste your site.\n\n"
            "If robots.txt shuts them out, they never reach the pulp — and ChatGPT "
            "cannot cite what it was forbidden to chew. A 200 OK for humans is not "
            "a 200 OK for an answer engine. My audit scores that split: crawler "
            "access (25), structured data (25), answer-readiness (30), technical "
            "foundation (20). Bot-blocked and JS-only sites get a diagnosis, not "
            "an error splash.\n\n"
            "34 evidence-backed checks. A 'why it matters' on every one. A fix "
            "list ordered for the next hour, not a 40-page PDF.\n\n"
            f"Paste your URL: {API_URL}\n"
            f"{PORTFOLIO}"
        ),
        "es": (
            "No son adornos. Son GPTBot, ClaudeBot y PerplexityBot intentando "
            "probar tu sitio.\n\n"
            "Si robots.txt los echa, nunca llegan a la pulpa — y ChatGPT no cita "
            "lo que le prohibieron masticar. Un 200 para humanos no es un 200 para "
            "un motor de respuestas. Mi auditoría puntúa esa grieta: crawlers (25), "
            "datos estructurados (25), AEO (30), base técnica (20). Sitios bloqueados "
            "o solo-JS reciben un diagnóstico, no un error vacío.\n\n"
            "34 chequeos con evidencia. Un 'por qué importa' en cada uno. Lista de "
            "arreglos para la próxima hora, no un PDF de 40 páginas.\n\n"
            f"Pega tu URL: {API_URL}\n"
            f"{PORTFOLIO}"
        ),
    },
    "geo-pomegranate-audit-hand.jpg": {
        "en": (
            "This is the question I ship, not a moodboard: can ChatGPT, Perplexity, "
            "Claude and Gemini find you, understand you, and quote you?\n\n"
            "One POST. Score 0–100. Grade. 34 checks. Per-engine crawlability. Four category "
            "bars. Then the checks — pass/warn/fail — each with what we actually "
            "saw on the page and why that check exists. Shareable as "
            f"{API_URL}?url=https://your-site.com\n\n"
            "I run it on my own properties first. The money page is /portfolio; "
            "the tool buyers punch a domain into is /api. Direct page reads. "
            "Engine v1.2.0. Free demo key.\n\n"
            f"Your turn: {API_URL}\n{PORTFOLIO}"
        ),
        "es": (
            "Esta es la pregunta que vendo, no un moodboard: ¿pueden ChatGPT, "
            "Perplexity, Claude y Gemini encontrarte, entenderte y citarte?\n\n"
            "Un POST. Score 0–100. Nota. 34 chequeos. Crawlability por motor. Cuatro barras. "
            "Luego los chequeos — pass/warn/fail — con lo que vimos en la página "
            "y por qué existe ese chequeo. Se comparte: "
            f"{API_URL}?url=https://tu-sitio.com\n\n"
            "Lo corro primero en mis propias propiedades. La página de dinero es "
            "/portfolio; la herramienta donde pegas el dominio es /api. Lectura "
            "directa. Motor v1.2.0. Demo gratis.\n\n"
            f"Tu turno: {API_URL}\n{PORTFOLIO}"
        ),
    },
    "geo-visibility-score-ui.jpg": {
        "en": (
            "ChatGPT already has a number for you. Most sites never see it.\n\n"
            "This dashboard is the shape of the product: not vanity traffic, "
            "whether GPTBot / Gemini / Perplexity can actually retrieve you. "
            "My API does not scrape SERPs. It fetches YOUR page, robots.txt, "
            "llms.txt, sitemap — and tells you which crawler is allowed, which "
            "schema is missing, which heading a model can lift as an answer.\n\n"
            "34 checks. Prioritized fix list. curl it or use the form. Production "
            "keys if you want the same engine inside your own stack.\n\n"
            f"{API_URL}\n{PORTFOLIO}"
        ),
        "es": (
            "ChatGPT ya tiene un número para ti. La mayoría de sitios nunca lo ve.\n\n"
            "Este tablero es la forma del producto: no tráfico vanidoso, sino si "
            "GPTBot / Gemini / Perplexity pueden recuperarte. Mi API no raspa SERPs. "
            "Lee TU página, robots.txt, llms.txt, sitemap — y te dice qué crawler "
            "pasa, qué schema falta, qué heading un modelo puede citar.\n\n"
            "34 chequeos. Arreglos en orden. curl o el formulario. Keys de "
            "producción si quieres el mismo motor en tu stack.\n\n"
            f"{API_URL}\n{PORTFOLIO}"
        ),
    },
    "geo-pomegranate-100-vs-72.jpg": {
        "en": (
            "Same fruit. Two scores. That's the gap GEO/AEO actually names.\n\n"
            "Google can still love a page that answer engines refuse to quote — "
            "no FAQ schema, no llms.txt, a SPA that sends empty HTML to ClaudeBot, "
            "a robots rule that blocks GPTBot while letting Googlebot through. "
            "My audit splits that: structured data (GEO) vs answer-readiness (AEO) "
            "vs crawler access vs the technical floor they all stand on.\n\n"
            "I don't sell a mystery score. 34 checks, each with evidence and a why. "
            "Paste the URL. Steal the fix list. Then hire me if you want it done.\n\n"
            f"{API_URL}\n{PORTFOLIO}"
        ),
        "es": (
            "Misma fruta. Dos scores. Eso es el hueco que GEO/AEO nombra de verdad.\n\n"
            "Google puede amar una página que los motores de respuesta se niegan "
            "a citar: sin schema FAQ, sin llms.txt, un SPA que manda HTML vacío "
            "a ClaudeBot, un robots que bloquea GPTBot y deja pasar a Googlebot. "
            "Mi auditoría parte eso: datos estructurados (GEO) vs AEO vs crawlers "
            "vs la base técnica.\n\n"
            "No vendo un número misterioso. 34 chequeos, cada uno con evidencia y un porqué. "
            "Pegas la URL. Te quedas la lista. Me contratas si quieres que lo haga.\n\n"
            f"{API_URL}\n{PORTFOLIO}"
        ),
    },
    "geo-pomegranate-dashboard-2026.jpg": {
        "en": (
            "Indexing. Crawlability. Metadata. Site performance. That's tech-SEO "
            "as the floor — not the whole game.\n\n"
            "2026 buyers ask a nastier question: when someone types what you sell "
            "into ChatGPT, whose paragraph gets used. AEO is 30% of my score on "
            "purpose. GEO (identity schema, sameAs, JSON-LD) is 25. Crawler access "
            "25. Tech 20. You can ace Core Web Vitals and still be invisible to "
            "PerplexityBot.\n\n"
            "Free audit, 34 checks, shareable link, engine v1.2.0. I built it "
            "because I got tired of pitching GEO with a PDF.\n\n"
            f"Drop your URL: {API_URL}\n{PORTFOLIO}"
        ),
        "es": (
            "Indexación. Crawlability. Metadata. Rendimiento. Eso es tech-SEO como "
            "piso — no el juego entero.\n\n"
            "El comprador de 2026 pregunta peor: cuando alguien escribe lo que "
            "vendes en ChatGPT, ¿de quién es el párrafo? AEO es 30% de mi score "
            "a propósito. GEO 25. Crawlers 25. Tech 20. Puedes clavar Core Web "
            "Vitals y seguir invisible para PerplexityBot.\n\n"
            "Auditoría gratis, 34 chequeos, link para compartir, motor v1.2.0. "
            "Lo construí porque me cansé de vender GEO con un PDF.\n\n"
            f"Suelta tu URL: {API_URL}\n{PORTFOLIO}"
        ),
    },
}


def _stem(image_url: str) -> str:
    return (image_url or "").rstrip("/").rsplit("/", 1)[-1]


def maybe_geo_copy(campaign_type: str, image_url: str, promo: str, now: Optional[datetime] = None) -> str:
    geo_asset = "geo-api/" in (image_url or "") or _stem(image_url).startswith("geo-")
    if campaign_type == "espaluz" and not geo_asset:
        return promo
    if not geo_asset and campaign_type not in ("geo_api", "marketing_engine"):
        return promo
    if not geo_asset:
        return promo
    stem = _stem(image_url)
    pair = _POSTS.get(stem)
    if not pair:
        # legacy me_*.jpg on a GEO day — still sell the API, not the agent card.
        pair = {
            "en": (
                "This is not another 'AI will change marketing' post.\n\n"
                "I ship a live audit: 34 checks on whether ChatGPT/Perplexity/Claude/"
                "Gemini can find you, parse you, and quote you. Four weighted "
                "categories. Evidence on every row. Free.\n\n"
                f"{API_URL}\n{PORTFOLIO}"
            ),
            "es": (
                "Esto no es otro post de 'la IA cambiará el marketing'.\n\n"
                "Tengo una auditoría viva: 34 chequeos sobre si ChatGPT/Perplexity/"
                "Claude/Gemini pueden encontrarte, entenderte y citarte. Cuatro "
                "categorías. Evidencia en cada fila. Gratis.\n\n"
                f"{API_URL}\n{PORTFOLIO}"
            ),
        }
    lang = "es" if panama_today(now).toordinal() % 2 == 0 else "en"
    return pair[lang]


def local_geo_dir() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(here, "geo_api_images")
