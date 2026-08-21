"""Deterministic demand, cover, and revenue arithmetic. No LLM touches this."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Iterable, List

from .load import SkuRow

# Brief: Bioactive Blend SKUs launched mid-January 2026 (mid-M2).
# Trend must exclude the partial/pre-launch M1 window.
LAUNCH_PREFIX = "Bioactive Blend"

# Days-per-month convention used for the phase-out 30-day threshold.
DAYS_PER_MONTH = 30.0


@dataclass(frozen=True)
class SkuMetrics:
    sku: str
    shopify_m4: int
    amazon_m4: int
    pooled_months: tuple[int, int, int, int]
    trend_months_used: tuple[int, ...]  # 1-indexed month numbers
    period_growth_pct: float  # first→last over trend window, percentage points
    avg_mom_growth_pct: float  # mean MoM step, percentage points
    # Naive growth if M1 were included (launch SKUs only) — for trap evidence.
    naive_m1_growth_pct: float | None
    growth_overstatement_pp: float | None
    m4_demand: int
    projected_demand: float
    stock_on_hand: int
    units_on_order: int
    order_arrival_months: float
    inbound_credited: int  # 0 when arrival == 0 (no order exists)
    target_months_cover: float
    retail_price_usd: float
    cover_months: float  # soh / m4_demand
    forward_cover_months: float  # soh / projected_demand
    cover_with_inbound_months: float  # (soh + inbound) / m4_demand
    days_of_cover: float
    months_over_target: float  # cover_months - target (can be negative)
    monthly_revenue_usd: float  # m4_demand * price
    projected_monthly_revenue_usd: float
    shopify_m3_to_m4_pct: float
    amazon_m3_to_m4_pct: float
    channel_divergence: bool

    def to_dict(self) -> dict:
        return asdict(self)


def pooled_demand(row: SkuRow) -> tuple[int, int, int, int]:
    return tuple(row.shopify[i] + row.amazon[i] for i in range(4))  # type: ignore[return-value]


def is_launch_sku(sku: str) -> bool:
    return sku.startswith(LAUNCH_PREFIX)


def _pct_change(start: float, end: float) -> float:
    if start == 0:
        return 0.0
    return (end / start - 1.0) * 100.0


def _avg_mom(values: List[int]) -> float:
    if len(values) < 2:
        return 0.0
    steps = [_pct_change(values[i], values[i + 1]) for i in range(len(values) - 1)]
    return sum(steps) / len(steps)


def compute_metrics(row: SkuRow) -> SkuMetrics:
    pooled = pooled_demand(row)
    launch = is_launch_sku(row.sku)

    if launch:
        trend_idx = (1, 2, 3)  # M2, M3, M4 — 0-indexed
        trend_months = (2, 3, 4)
        trend_vals = [pooled[i] for i in trend_idx]
        naive = _pct_change(pooled[0], pooled[3])
        correct = _pct_change(trend_vals[0], trend_vals[-1])
        overstatement = naive - correct
    else:
        trend_months = (1, 2, 3, 4)
        trend_vals = list(pooled)
        naive = None
        overstatement = None

    period_growth = _pct_change(trend_vals[0], trend_vals[-1])
    avg_mom = _avg_mom(trend_vals)
    m4 = pooled[3]

    # Project one month forward from M4 using mean MoM of the trend window.
    projected = m4 * (1.0 + avg_mom / 100.0)

    # Trap 5: arrival 0 means no order — never credit units_on_order.
    inbound = row.units_on_order if row.order_arrival_months > 0 else 0

    cover = row.stock_on_hand / m4 if m4 else float("inf")
    forward_cover = row.stock_on_hand / projected if projected else float("inf")
    cover_with_inbound = (row.stock_on_hand + inbound) / m4 if m4 else float("inf")

    shop_delta = _pct_change(row.shopify[2], row.shopify[3])
    amz_delta = _pct_change(row.amazon[2], row.amazon[3])
    # Opposite signs, and at least one move is material (>2%).
    diverge = (shop_delta * amz_delta < 0) and (
        abs(shop_delta) > 2.0 or abs(amz_delta) > 2.0
    )

    return SkuMetrics(
        sku=row.sku,
        shopify_m4=row.shopify[3],
        amazon_m4=row.amazon[3],
        pooled_months=pooled,
        trend_months_used=trend_months,
        period_growth_pct=round(period_growth, 2),
        avg_mom_growth_pct=round(avg_mom, 2),
        naive_m1_growth_pct=None if naive is None else round(naive, 2),
        growth_overstatement_pp=None
        if overstatement is None
        else round(overstatement, 2),
        m4_demand=m4,
        projected_demand=round(projected, 2),
        stock_on_hand=row.stock_on_hand,
        units_on_order=row.units_on_order,
        order_arrival_months=row.order_arrival_months,
        inbound_credited=inbound,
        target_months_cover=row.target_months_cover,
        retail_price_usd=row.retail_price_usd,
        cover_months=round(cover, 2),
        forward_cover_months=round(forward_cover, 2),
        cover_with_inbound_months=round(cover_with_inbound, 2),
        days_of_cover=round(cover * DAYS_PER_MONTH, 1),
        months_over_target=round(cover - row.target_months_cover, 2),
        monthly_revenue_usd=round(m4 * row.retail_price_usd, 2),
        projected_monthly_revenue_usd=round(projected * row.retail_price_usd, 2),
        shopify_m3_to_m4_pct=round(shop_delta, 2),
        amazon_m3_to_m4_pct=round(amz_delta, 2),
        channel_divergence=diverge,
    )


def compute_all(rows: Iterable[SkuRow]) -> List[SkuMetrics]:
    return [compute_metrics(r) for r in rows]
