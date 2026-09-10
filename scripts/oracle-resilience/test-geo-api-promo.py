#!/usr/bin/env python3
"""Local checks for the GEO/AEO influencer lane — including HUD PII shapes."""
from __future__ import annotations

import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import importlib.util

import geo_api_promo as g  # noqa: E402


def _load_patcher():
    spec = importlib.util.spec_from_file_location(
        "patch_influencer_geo_rotation",
        HERE / "patch-influencer-geo-rotation.py",
    )
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod

# Same detectors as scripts/pii-guard.cjs HUD block (shape only, no allowlist).
HUD_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
HUD_PHONE = re.compile(
    r"(?<![\w+.-])\+\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?![\w.-])"
)
HUD_BEARER = re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]{20,}")
HUD_MAKE = re.compile(r"https://hook\.[a-z0-9.-]*make\.com/", re.I)
HUD_URL_CREDS = re.compile(
    r"\b[a-z][a-z0-9+.-]*://[A-Za-z0-9._%+-]{1,64}:[^@/\s\"'`<>${}]{4,}@"
)
HUD_SECRET_ASSIGN = re.compile(
    r"(?<![A-Za-z0-9])(?:password|passwd|pwd|secret|api_?key|access_?token|"
    r"auth_?token|client_?secret|token)(?![A-Za-z0-9])[ \t]*[:=][ \t]*[\"'][^\"'\n]{6,}[\"']",
    re.I,
)

# Instagram feed + LinkedIn photo via Buffer: 1080 wide, height 4:5 … 1.91:1.
IG_LI_WIDTH = 1080
IG_LI_H_MIN = 566
IG_LI_H_MAX = 1350


def _hud_scan(label: str, text: str) -> None:
    findings = []
    for name, rx in (
        ("EMAIL_ADDRESS", HUD_EMAIL),
        ("PHONE_NUMBER", HUD_PHONE),
        ("AUTHORIZATION_BEARER_TOKEN", HUD_BEARER),
        ("MAKE_WEBHOOK", HUD_MAKE),
        ("URL_WITH_CREDENTIALS", HUD_URL_CREDS),
        ("GENERIC_SECRET_ASSIGNMENT", HUD_SECRET_ASSIGN),
    ):
        hits = rx.findall(text)
        if hits:
            findings.append(f"{label} {name}: {hits[:8]!r}")
    assert not findings, "\n".join(findings)


def test_schedule_2_of_3() -> None:
    geo = esp = 0
    for i in range(30):
        dt = datetime(2026, 9, 10, 17, 0, tzinfo=timezone.utc) + timedelta(days=i)
        if g.is_geo_day(dt):
            geo += 1
        else:
            esp += 1
    assert (geo, esp) == (20, 10), (geo, esp)


def test_weighted_pool_fires_new_harder() -> None:
    pool = g.weighted_geo_pool()
    assert pool[0] == g.GEO_PRIMARY[0]
    assert pool.count(g.GEO_PRIMARY[0]) == g.GEO_PRIMARY_WEIGHT
    new_slots = len(g.GEO_PRIMARY) * g.GEO_PRIMARY_WEIGHT
    assert new_slots > len(g.GEO_LEGACY)
    assert all("/geo-api/" in u for u in g.GEO_PRIMARY)
    assert all("/marketing_engine_images/" in u for u in g.GEO_LEGACY)


def test_apply_lane_keeps_make_router() -> None:
    mem = {"geo_api_image_rotation_index": 0}
    geo_noon = datetime(2026, 9, 10, 17, 0, tzinfo=timezone.utc)  # ordinal % 3 != 2
    camp, url = g.apply_lane(
        "espaluz",
        "https://webhook.aideazz.xyz/influencer-images/image1.jpg",
        memory=mem,
        now=geo_noon,
    )
    assert camp == "marketing_engine"
    assert url == g.GEO_PRIMARY[0]
    # EspaLuz day keeps the tutor still.
    esp_noon = datetime(2026, 9, 12, 17, 0, tzinfo=timezone.utc)
    camp2, url2 = g.apply_lane(
        "espaluz",
        "https://webhook.aideazz.xyz/influencer-images/image1.jpg",
        memory=mem,
        now=esp_noon,
    )
    assert camp2 == "espaluz"
    assert url2.endswith("image1.jpg")


def test_copy_sells_the_api() -> None:
    for u in g.GEO_PRIMARY:
        text = g.maybe_geo_copy("marketing_engine", u, "OLD")
        assert "https://aideazz.xyz/api" in text
        assert "https://aideazz.xyz/portfolio/api" not in text
        assert "https://aideazz.xyz/portfolio/portfolio" not in text
        # One destination only — a second URL is what LinkedIn glued into a 404.
        assert "https://aideazz.xyz/portfolio" not in text
        stripped = text.replace("https://aideazz.xyz/api", "")
        assert "/api" not in stripped
        assert "/portfolio" not in stripped
        assert "34" in text
        assert text != "OLD"
    keep = g.maybe_geo_copy(
        "espaluz",
        "https://webhook.aideazz.xyz/influencer-images/image1.jpg",
        "KEEP",
    )
    assert keep == "KEEP"


def test_canonicalize_fixes_relative_and_doubled_paths() -> None:
    raw = (
        "See /api and /portfolio then "
        "https://aideazz.xyz/portfolio/api and "
        "https://aideazz.xyz/portfolio/portfolio/portfolio"
    )
    out = g.canonicalize_aideazz_urls(raw)
    assert "https://aideazz.xyz/api" in out
    assert "https://aideazz.xyz/portfolio" in out
    assert "portfolio/api" not in out
    assert "portfolio/portfolio" not in out
    leftover = out.replace("https://aideazz.xyz/api", "").replace("https://aideazz.xyz/portfolio", "")
    assert "/api" not in leftover
    assert "/portfolio" not in leftover


def test_caption_is_one_absolute_api_url() -> None:
    text = g.with_destinations(
        "See /api and /portfolio then https://aideazz.xyz/portfolio\n"
        "THROWBACK: that graceful skip moment\n"
        "potential: 2026-09-10 leftover"
    )
    assert text.endswith("https://aideazz.xyz/api")
    assert text.count("https://aideazz.xyz/api") == 1
    assert "https://aideazz.xyz/portfolio" not in text
    assert "THROWBACK" not in text
    assert "potential:" not in text
    assert g.bare_aideazz_paths(text) == []


def test_stamp_blanks_leftover_make_fields() -> None:
    payload = {
        "promo": "See /api",
        "linkedinBody": "See /api",
        "bufferPostText": "See /api",
        "story": "THROWBACK: that graceful skip moment when your AI marketing engine just works",
        "cta": "Your breakthrough awaits",
        "audience": "general_professional",
        "potential": "2026-09-10",
        "link": "https://aideazz.xyz/portfolio",
        "imageURL": g.GEO_PRIMARY[4],
    }
    out = g.stamp_make_payload(payload)
    assert out["story"] == ""
    assert out["cta"] == ""
    assert out["audience"] == ""
    assert out["potential"] == ""
    assert out["link"] == "https://aideazz.xyz/api"
    assert "https://aideazz.xyz/api" in out["promo"]
    assert "https://aideazz.xyz/api" in out["linkedinBody"]
    assert "https://aideazz.xyz/portfolio" not in out["promo"]
    assert "THROWBACK" not in out["promo"]
    assert "apiURL" not in out  # do not add keys Make concatenates


def test_drop_leftover_story_keeps_dict() -> None:
    geo_noon = datetime(2026, 9, 10, 17, 0, tzinfo=timezone.utc)
    raw = {
        "story": "THROWBACK: graceful skip",
        "hook": "Your breakthrough awaits",
        "audience": "general_professional",
        "emotion": "insight",
    }
    out = g.drop_leftover_story(
        "marketing_engine",
        g.GEO_PRIMARY[0],
        raw,
    )
    assert isinstance(out, dict)
    assert out["story"] == ""
    assert out["hook"] == ""
    assert out["audience"] == ""
    # EspaLuz day keeps the dict so story.get() still works.
    keep = g.drop_leftover_story(
        "espaluz",
        "https://webhook.aideazz.xyz/influencer-images/image1.jpg",
        raw,
    )
    assert keep == raw


def test_hud_shapes_absent_from_new_source() -> None:
    for name in (
        "geo_api_promo.py",
        "patch-influencer-geo-rotation.py",
    ):
        _hud_scan(name, (HERE / name).read_text(encoding="utf-8"))
    # Posts must not carry the demo key or a mailbox — HUD counts our own address.
    blob = "\n".join(p["en"] + "\n" + p["es"] for p in g._POSTS.values())
    assert "aidz_demo" not in blob
    assert "aipa@" not in blob.lower()
    _hud_scan("geo_posts", blob)


def test_jpegs_fit_buffer_and_carry_no_exif_pii() -> None:
    from PIL import Image

    assets = HERE / "geo-api-assets"
    files = sorted(assets.glob("geo-*.jpg"))
    assert len(files) == 6, files
    for p in files:
        im = Image.open(p)
        w, h = im.size
        assert w == IG_LI_WIDTH, (p.name, w, h)
        assert IG_LI_H_MIN <= h <= IG_LI_H_MAX, (p.name, w, h)
        assert not im.getexif(), f"{p.name} still has EXIF"
        # Printable runs only — Huffman bytes false-positive EMAIL_ADDRESS.
        printable = "".join(chr(b) if 32 <= b < 127 else "\n" for b in p.read_bytes())
        _hud_scan(p.name, printable)


def test_patcher_hooks_both_send_functions() -> None:
    sample = (
        "import os\nfrom datetime import datetime, timezone\nPANAMA_TZ = timezone.utc\n"
        "def get_campaign_type_for_date(dt: datetime) -> str:\n"
        "    return 'espaluz' if dt.day % 2 else 'marketing_engine'\n\n"
        "def send_automated_daily_promo():\n"
        "    promo, story, video_url, image_url, campaign_type = generate_scheduled_promo_bundle()\n"
        "    try:\n"
        "        try:\n"
        "            send_channel_promo_with_image(promo, image_url)\n"
        "            print('ok')\n"
        "        except Exception as e:\n"
        "            print(e)\n"
        "        payload = build_make_webhook_payload()\n"
        "    except Exception as e:\n"
        "        print(e)\n\n"
        "def send_daily_promo(message):\n"
        "    promo, story, video_url, image_url, campaign_type = generate_scheduled_promo_bundle()\n"
        "    try:\n"
        "        send_channel_promo_with_image(promo, image_url)\n"
        "        print('ok')\n"
        "    except Exception as e:\n"
        "        print(e)\n\n"
        "def build_make_webhook_payload():\n"
        "    return {'promo': promo, 'story': story, 'imageURL': image_url}\n\n"
        "marketing_engine_image_urls = [\n"
        "    'https://webhook.aideazz.xyz/influencer-images/marketing_engine_images/me_01.jpg',\n"
        "]\n\n"
        "def next_fn():\n"
        "    return 1\n"
    )
    out = _load_patcher().patch_source(sample)
    import ast
    ast.parse(out)
    # Re-patch must stay valid: live main.py already has apply_lane inside try.
    ast.parse(_load_patcher().patch_source(out))
    assert out.count("apply_lane(campaign_type, image_url)") == 2
    assert out.count("canonicalize_aideazz_urls(promo)") == 2
    assert "drop_leftover_story" in out
    assert out.count("stamp_make_payload(") >= 1
    assert "day.toordinal() % 3" in out
    assert out.index("geo-grapes-citation.jpg") < out.index("me_01.jpg")
    _hud_scan("patched_sample", out)


def main() -> None:
    # Import name: file is patch-influencer-geo-rotation.py (hyphens). Load via runpy.
    tests = [
        test_schedule_2_of_3,
        test_weighted_pool_fires_new_harder,
        test_apply_lane_keeps_make_router,
        test_copy_sells_the_api,
        test_canonicalize_fixes_relative_and_doubled_paths,
        test_caption_is_one_absolute_api_url,
        test_stamp_blanks_leftover_make_fields,
        test_drop_leftover_story_keeps_dict,
        test_hud_shapes_absent_from_new_source,
        test_jpegs_fit_buffer_and_carry_no_exif_pii,
        test_patcher_hooks_both_send_functions,
    ]
    # Replace hyphen import: test_patcher uses patch_source from this file's sibling load.
    failed = 0
    for fn in tests:
        try:
            fn()
            print(f"PASS {fn.__name__}")
        except Exception as e:
            failed += 1
            print(f"FAIL {fn.__name__}: {e}")
    if failed:
        raise SystemExit(1)
    print("all geo-api-promo tests passed")


if __name__ == "__main__":
    main()
