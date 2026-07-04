#!/usr/bin/env python3
"""
AIdeazz consulting service payments — PagueloFacil SVC:* webhook branch.

Additive only: EspaLuz WA:/TG: flows unchanged in espaluz_paguelofacil.process_webhook.

PARM_1 format: SVC:{sku}:{order_id_hex}
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Dict, Optional

import requests

logger = logging.getLogger(__name__)

CTO_INTERNAL_URL = os.getenv(
    "AIDEAZZ_SERVICE_PAID_URL",
    "http://127.0.0.1:3000/internal/service-paid",
).strip()
INTERNAL_SECRET = os.getenv("INTERNAL_WEBHOOK_SECRET", "").strip() or os.getenv(
    "OUTREACH_SECRET", ""
).strip()


def _parse_svc_parm1(value: str) -> Optional[Dict[str, str]]:
    val = str(value or "").strip()
    if not val.upper().startswith("SVC:"):
        return None
    parts = val.split(":")
    if len(parts) < 3:
        return None
    sku = parts[1].strip()
    order_id = ":".join(parts[2:]).strip()
    if not sku or not order_id:
        return None
    return {"sku": sku, "order_id": order_id}


def _is_payment_approved(payload: Dict[str, Any]) -> bool:
    status = payload.get("status")
    if status in (1, "1", True):
        return True
    if str(payload.get("Estado", "")).lower() == "aprobada":
        return True
    auth = str(payload.get("authStatus") or "").strip()
    if auth in ("00", "0", "000"):
        return True
    msg = str(payload.get("messageSys") or "").lower()
    return "aprob" in msg


def intercept_service_webhook(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    If payload is SVC:* and approved, notify CTO AIPA and return result dict.
    Returns None if not a service payment (caller should use EspaLuz process_webhook).
    """
    parm = str(
        payload.get("PARM_1") or payload.get("parm_1") or payload.get("parm1") or ""
    ).strip()
    parsed = _parse_svc_parm1(parm)
    if not parsed:
        return None

    cod_oper = str(payload.get("codOper") or payload.get("relatedTx") or "")
    if not cod_oper:
        return {"processed": False, "reason": "missing_codOper", "svc": True}

    if not _is_payment_approved(payload):
        return {
            "processed": False,
            "reason": "not_approved",
            "cod_oper": cod_oper,
            "svc": True,
            "sku": parsed["sku"],
            "order_id": parsed["order_id"],
        }

    if not INTERNAL_SECRET:
        logger.error("Aideazz SVC: INTERNAL_WEBHOOK_SECRET / OUTREACH_SECRET missing")
        return {"processed": False, "reason": "no_internal_secret", "svc": True}

    try:
        resp = requests.post(
            CTO_INTERNAL_URL,
            json={
                "order_id": parsed["order_id"],
                "cod_oper": cod_oper,
                "sku": parsed["sku"],
            },
            headers={
                "Authorization": f"Bearer {INTERNAL_SECRET}",
                "Content-Type": "application/json",
            },
            timeout=20,
        )
        if resp.status_code == 200:
            body = resp.json()
            return {
                "processed": True,
                "svc": True,
                "cod_oper": cod_oper,
                **parsed,
                **body,
            }
        logger.warning(
            "Aideazz SVC: CTO internal HTTP %s: %s",
            resp.status_code,
            resp.text[:300],
        )
        return {
            "processed": False,
            "reason": f"cto_http_{resp.status_code}",
            "svc": True,
            **parsed,
        }
    except Exception as exc:
        logger.error("Aideazz SVC: CTO notify failed: %s", exc)
        return {"processed": False, "reason": "cto_notify_error", "svc": True, **parsed}


def salvage_svc_from_raw(raw: bytes) -> Optional[Dict[str, str]]:
    """Optional helper if PARM_1 regex needed on corrupt payloads."""
    text = raw.decode("utf-8", errors="replace")
    match = re.search(r'"PARM_1"\s*:\s*"(SVC:[^"]+)"', text)
    if match:
        return _parse_svc_parm1(match.group(1))
    return None
