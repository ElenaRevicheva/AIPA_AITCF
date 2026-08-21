"""LLM narration over a pre-computed decision payload.

Four providers, same OpenAI-compatible shape except Anthropic. Failover is
visible — a silent downgrade is the failure mode Part 2 argues against.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, List, Optional, Tuple

from .numeric_guard import guard

ROOT = Path(__file__).resolve().parents[1]
PROMPTS = ROOT / "prompts"


@dataclass
class NarrationResult:
    text: str
    provider: str
    model: str
    attempts: List[str]
    guard_ok: bool
    guard_offenders: List[str]
    used_fallback_template: bool
    failover_notice: Optional[str] = None


def _load_prompt() -> str:
    path = PROMPTS / "v2_final.md"
    return path.read_text(encoding="utf-8")


def _build_user_message(payload: dict) -> str:
    return (
        "Write the March 2026 S&OP executive briefing from this decision object. "
        "Use only figures that appear below. Do not compute, round, or invent.\n\n"
        + json.dumps(payload, indent=2)
    )


# ---- provider adapters -----------------------------------------------------

def _openai_compatible(
    *,
    base_url: str,
    api_key: str,
    model: str,
    system: str,
    user: str,
    timeout: int = 60,
) -> str:
    body = json.dumps(
        {
            "model": model,
            "temperature": 0.2,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["choices"][0]["message"]["content"].strip()


def _anthropic(
    *,
    api_key: str,
    model: str,
    system: str,
    user: str,
    timeout: int = 60,
) -> str:
    body = json.dumps(
        {
            "model": model,
            "max_tokens": 2000,
            "temperature": 0.2,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    parts = data.get("content") or []
    text = "".join(p.get("text", "") for p in parts if p.get("type") == "text")
    return text.strip()


ProviderFn = Callable[[str, str], str]


def _providers() -> List[Tuple[str, str, ProviderFn]]:
    """Return (name, model, callable) for every key present in the environment."""
    out: List[Tuple[str, str, ProviderFn]] = []

    if os.environ.get("OPENAI_API_KEY"):
        key = os.environ["OPENAI_API_KEY"]
        model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

        def call(system: str, user: str, _key=key, _model=model) -> str:
            return _openai_compatible(
                base_url="https://api.openai.com/v1",
                api_key=_key,
                model=_model,
                system=system,
                user=user,
            )

        out.append(("openai", model, call))

    if os.environ.get("ANTHROPIC_API_KEY"):
        key = os.environ["ANTHROPIC_API_KEY"]
        model = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")

        def call(system: str, user: str, _key=key, _model=model) -> str:
            return _anthropic(api_key=_key, model=_model, system=system, user=user)

        out.append(("anthropic", model, call))

    if os.environ.get("GROQ_API_KEY"):
        key = os.environ["GROQ_API_KEY"]
        model = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")

        def call(system: str, user: str, _key=key, _model=model) -> str:
            return _openai_compatible(
                base_url="https://api.groq.com/openai/v1",
                api_key=_key,
                model=_model,
                system=system,
                user=user,
            )

        out.append(("groq", model, call))

    xai_key = os.environ.get("XAI_API_KEY") or os.environ.get("GROK_API_KEY")
    if xai_key:
        model = os.environ.get("XAI_MODEL", "grok-2-latest")

        def call(system: str, user: str, _key=xai_key, _model=model) -> str:
            return _openai_compatible(
                base_url="https://api.x.ai/v1",
                api_key=_key,
                model=_model,
                system=system,
                user=user,
            )

        out.append(("xai", model, call))

    return out


def template_briefing(payload: dict) -> str:
    """Deterministic fallback — same figures, no model required."""
    lines = [
        "# S&OP Executive Briefing — March 2026",
        "",
        "_Generated from the pre-computed decision object "
        "(deterministic template; no LLM)._",
        "",
        "## What sold well / poorly (M4 pooled units)",
        "",
        "**Sold well**",
    ]
    for item in payload["display"]["sold_well"]:
        lines.append(
            f"- {item['sku']} — {item['m4_units']} units "
            f"({item['m4_revenue']} at list); growth {item['growth_pct']}"
        )
    lines += ["", "**Sold poorly** (lowest M4 volume)"]
    for item in payload["display"]["sold_poorly"]:
        lines.append(
            f"- {item['sku']} — {item['m4_units']} units "
            f"({item['m4_revenue']} at list); growth {item['growth_pct']}"
        )
    lines += [
        "",
        "## What changed",
        "",
        "Pooled Shopify + Amazon demand is growing on every active line. "
        "Bioactive Blend trends use M2→M4 only (mid-January 2026 launch). "
        "Cover uses M4 sell-through; revenue opportunity and forward cover use "
        "one-month projected demand (price × projected units).",
        "",
        "## Reorder now (ranked by revenue opportunity)",
        "",
    ]
    for item in payload["display"]["reorder"]:
        line = (
            f"- **{item['priority']} {item['sku']}** — cover {item['cover']} / "
            f"target {item['target']} (forward {item['forward_cover']}); "
            f"revenue opportunity {item['revenue_opportunity']}/mo; "
            f"suggested order {item['order_units']} units; "
            f"growth {item['growth_pct']}."
        )
        if item.get("tension_note"):
            line += f" {item['tension_note']}"
        lines.append(line)
    lines += ["", "## Investigate — do not reorder", ""]
    for item in payload["display"]["investigate"]:
        lines.append(
            f"- **{item['sku']}** — cover {item['cover']} / target {item['target']} "
            f"(forward {item['forward_cover']}); {item['rationale']}"
        )
    if not payload["display"]["investigate"]:
        lines.append("- None.")
    lines += ["", "## Do not reorder", ""]
    for item in payload["display"]["do_not_reorder"]:
        lines.append(
            f"- **{item['sku']}** — cover {item['cover']} / target {item['target']}; "
            f"{item['rationale']}"
        )
    if payload["display"]["watch"]:
        lines += ["", "## Watch", ""]
        for item in payload["display"]["watch"]:
            lines.append(
                f"- **{item['sku']}** — cover {item['cover']} today, "
                f"forward {item['forward_cover']}; {item['rationale']}"
            )
    lines += ["", "## Method notes", ""]
    for n in payload.get("notes", []):
        lines.append(f"- {n}")
    lines.append("")
    return "\n".join(lines)


def narrate(
    payload: dict,
    *,
    prefer: Optional[str] = None,
    max_retries_per_provider: int = 1,
) -> NarrationResult:
    system = _load_prompt()
    user = _build_user_message(payload)
    providers = _providers()

    if prefer:
        providers = sorted(
            providers, key=lambda p: 0 if p[0] == prefer else 1
        )

    attempts: List[str] = []
    failed: List[str] = []

    if not providers:
        text = template_briefing(payload)
        return NarrationResult(
            text=text,
            provider="template",
            model="deterministic",
            attempts=["no LLM keys in environment → template"],
            guard_ok=True,
            guard_offenders=[],
            used_fallback_template=True,
            failover_notice=(
                "NOTICE: No LLM provider keys were available. "
                "Briefing rendered from the deterministic template. "
                "Figures are identical; prose is not model-written."
            ),
        )

    for name, model, call in providers:
        for attempt in range(1, max_retries_per_provider + 2):
            label = f"{name}/{model} try {attempt}"
            try:
                text = call(system, user)
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, KeyError, json.JSONDecodeError) as exc:
                msg = f"{label}: ERROR {exc}"
                attempts.append(msg)
                failed.append(name)
                break  # next provider

            ok, offenders = guard(text, payload)
            if ok:
                notice = None
                if failed:
                    notice = (
                        "NOTICE: Failover engaged. "
                        f"Skipped/failed providers: {', '.join(dict.fromkeys(failed))}. "
                        f"Serving narrative from {name}/{model}. "
                        "This is a degraded path — treat provider health as a first-class alert."
                    )
                    text = f"> {notice}\n\n{text}"
                attempts.append(f"{label}: OK")
                return NarrationResult(
                    text=text,
                    provider=name,
                    model=model,
                    attempts=attempts,
                    guard_ok=True,
                    guard_offenders=[],
                    used_fallback_template=False,
                    failover_notice=notice,
                )

            attempts.append(f"{label}: GUARD rejected {offenders}")
            # One corrective retry with the offenders named.
            user = (
                _build_user_message(payload)
                + "\n\nPREVIOUS DRAFT WAS REJECTED. You invented or recomputed these "
                f"figures: {offenders}. Rewrite using ONLY values present in the "
                "decision object. Do not subtract, round, or total."
            )

        failed.append(name)

    # All providers failed the guard or errored — template gate.
    text = template_briefing(payload)
    notice = (
        "NOTICE: Every configured LLM provider failed or was rejected by the "
        f"numeric guard ({', '.join(dict.fromkeys(failed)) or 'none'}). "
        "Briefing gated to the deterministic template so invented figures cannot ship."
    )
    return NarrationResult(
        text=f"> {notice}\n\n{text}",
        provider="template",
        model="deterministic",
        attempts=attempts,
        guard_ok=True,
        guard_offenders=[],
        used_fallback_template=True,
        failover_notice=notice,
    )
