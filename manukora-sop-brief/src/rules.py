"""Business rules — one function per trap. Pure Python, fully testable."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import List, Literal, Optional

from .metrics import SkuMetrics

PHASEOUT_SKU = "Propolis Tincture 30ml"
PHASEOUT_REORDER_FLOOR_DAYS = 30.0
Action = Literal["reorder", "do_not_reorder", "investigate", "watch"]


@dataclass(frozen=True)
class Decision:
    sku: str
    action: Action
    priority: Optional[int]  # 1 = highest revenue opportunity; None if not a reorder
    cover_months: float
    forward_cover_months: float
    target_months_cover: float
    gap_months: float  # max(0, target - cover)
    forward_gap_months: float
    days_of_cover: float
    monthly_revenue_usd: float  # M4 observed: price × M4 demand
    projected_monthly_revenue_usd: float  # price × projected demand
    revenue_opportunity_usd: float  # brief def: price × projected demand (when under target)
    months_over_target: float
    period_growth_pct: float
    m4_demand: int
    projected_demand: float
    inbound_credited: int
    order_arrival_months: float
    channel_divergence: bool
    demand_declining: bool
    shopify_m3_to_m4_pct: float
    amazon_m3_to_m4_pct: float
    rationale: str
    suggested_order_units: int = 0
    tension_note: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class SalesHighlight:
    sku: str
    m4_units: int
    m4_revenue_usd: float
    period_growth_pct: float
    rank_by: str  # "units" or "revenue"

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class DecisionSet:
    decisions: List[Decision]
    reorder_queue: List[Decision] = field(default_factory=list)
    do_not_reorder: List[Decision] = field(default_factory=list)
    investigate: List[Decision] = field(default_factory=list)
    watch: List[Decision] = field(default_factory=list)
    sold_well: List[SalesHighlight] = field(default_factory=list)
    sold_poorly: List[SalesHighlight] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)

    def to_payload(self) -> dict:
        """Payload the LLM is allowed to see — every figure pre-computed."""
        return {
            "period": "March 2026 (M4)",
            "method": {
                "demand": "pooled Shopify + Amazon",
                "cover": "stock_on_hand / M4_pooled_demand",
                "forward_cover": "stock_on_hand / projected_next_month_demand",
                "projection": "M4 * (1 + mean MoM of the trend window)",
                "launch_trend": "Bioactive Blend SKUs use M2→M4 only",
                "arrival_zero": "Order_Arrival_Months=0 means no open order",
                "revenue_opportunity": (
                    "retail_price_usd × projected_monthly_demand "
                    "(brief definition); used for reorder ranking"
                ),
                "priority": "rank reorder candidates by revenue_opportunity_usd desc",
                "sold_well_poorly": "M4 pooled units (top 3 / bottom 3)",
            },
            "sold_well": [s.to_dict() for s in self.sold_well],
            "sold_poorly": [s.to_dict() for s in self.sold_poorly],
            "reorder_queue": [d.to_dict() for d in self.reorder_queue],
            "do_not_reorder": [d.to_dict() for d in self.do_not_reorder],
            "investigate": [d.to_dict() for d in self.investigate],
            "watch": [d.to_dict() for d in self.watch],
            "notes": list(self.notes),
            "display": _display_strings(self),
        }


def _display_strings(ds: DecisionSet) -> dict:
    """Every number the narrative is likely to need, already formatted."""
    out: dict = {
        "sold_well": [],
        "sold_poorly": [],
        "reorder": [],
        "investigate": [],
        "do_not_reorder": [],
        "watch": [],
    }
    for s in ds.sold_well:
        out["sold_well"].append(
            {
                "sku": s.sku,
                "m4_units": str(s.m4_units),
                "m4_revenue": f"${s.m4_revenue_usd:,.0f}",
                "growth_pct": f"{s.period_growth_pct:.1f}%",
            }
        )
    for s in ds.sold_poorly:
        out["sold_poorly"].append(
            {
                "sku": s.sku,
                "m4_units": str(s.m4_units),
                "m4_revenue": f"${s.m4_revenue_usd:,.0f}",
                "growth_pct": f"{s.period_growth_pct:.1f}%",
            }
        )
    for d in ds.reorder_queue:
        out["reorder"].append(
            {
                "sku": d.sku,
                "priority": f"#{d.priority}",
                "cover": f"{d.cover_months:.2f}",
                "forward_cover": f"{d.forward_cover_months:.2f}",
                "target": f"{d.target_months_cover:.0f}"
                if d.target_months_cover.is_integer()
                else f"{d.target_months_cover}",
                "gap_months": f"{d.gap_months:.2f}",
                "forward_gap_months": f"{d.forward_gap_months:.2f}",
                "days_of_cover": f"{d.days_of_cover:.0f}",
                "revenue_opportunity": f"${d.revenue_opportunity_usd:,.0f}",
                "m4_revenue": f"${d.monthly_revenue_usd:,.0f}",
                "growth_pct": f"{d.period_growth_pct:.1f}%",
                "order_units": str(d.suggested_order_units),
                "months_over_target": f"{d.months_over_target:.2f}",
                "tension_note": d.tension_note,
                "rationale": d.rationale,
            }
        )
    for bucket, key in (
        (ds.investigate, "investigate"),
        (ds.do_not_reorder, "do_not_reorder"),
        (ds.watch, "watch"),
    ):
        for d in bucket:
            out[key].append(
                {
                    "sku": d.sku,
                    "cover": f"{d.cover_months:.2f}",
                    "forward_cover": f"{d.forward_cover_months:.2f}",
                    "target": f"{d.target_months_cover:.0f}"
                    if d.target_months_cover.is_integer()
                    else f"{d.target_months_cover}",
                    "days_of_cover": f"{d.days_of_cover:.0f}",
                    "m4_revenue": f"${d.monthly_revenue_usd:,.0f}",
                    "revenue_opportunity": f"${d.revenue_opportunity_usd:,.0f}",
                    "months_over_target": f"{d.months_over_target:.2f}",
                    "shopify_m3_to_m4": f"{d.shopify_m3_to_m4_pct:.1f}%",
                    "amazon_m3_to_m4": f"{d.amazon_m3_to_m4_pct:.1f}%",
                    "rationale": d.rationale,
                }
            )
    return out


def _order_units(m: SkuMetrics) -> int:
    """Units to reach target cover against projected demand, rounded up to 50."""
    need = m.target_months_cover * m.projected_demand - m.stock_on_hand
    if need <= 0:
        return 0
    return int((need + 49) // 50 * 50)


def _base_kwargs(m: SkuMetrics, *, under_target: bool) -> dict:
    gap = max(0.0, round(m.target_months_cover - m.cover_months, 2))
    fwd_gap = max(0.0, round(m.target_months_cover - m.forward_cover_months, 2))
    # Brief: revenue opportunity = retail price × projected monthly demand.
    rev_opp = m.projected_monthly_revenue_usd if under_target else 0.0
    return dict(
        sku=m.sku,
        cover_months=m.cover_months,
        forward_cover_months=m.forward_cover_months,
        target_months_cover=m.target_months_cover,
        gap_months=gap,
        forward_gap_months=fwd_gap,
        days_of_cover=m.days_of_cover,
        monthly_revenue_usd=m.monthly_revenue_usd,
        projected_monthly_revenue_usd=m.projected_monthly_revenue_usd,
        revenue_opportunity_usd=rev_opp,
        months_over_target=m.months_over_target,
        period_growth_pct=m.period_growth_pct,
        m4_demand=m.m4_demand,
        projected_demand=m.projected_demand,
        inbound_credited=m.inbound_credited,
        order_arrival_months=m.order_arrival_months,
        channel_divergence=m.channel_divergence,
        demand_declining=m.period_growth_pct < 0,
        shopify_m3_to_m4_pct=m.shopify_m3_to_m4_pct,
        amazon_m3_to_m4_pct=m.amazon_m3_to_m4_pct,
    )


def classify(m: SkuMetrics) -> Decision:
    """Apply business rules to one SKU. Order of checks matters."""
    under_target = m.cover_months < m.target_months_cover
    kw = _base_kwargs(m, under_target=under_target)

    # Trap 1 — phase-out above the 30-day floor: never reorder.
    if m.sku == PHASEOUT_SKU and m.days_of_cover >= PHASEOUT_REORDER_FLOOR_DAYS:
        return Decision(
            action="do_not_reorder",
            priority=None,
            rationale=(
                f"Phase-out SKU at {m.days_of_cover:.0f} days of cover "
                f"(floor is {PHASEOUT_REORDER_FLOOR_DAYS:.0f} days). "
                f"Under the 2-month target, but do not reorder."
            ),
            # Still report opportunity dollars so the cost of the rule is visible.
            **{**kw, "revenue_opportunity_usd": m.projected_monthly_revenue_usd},
        )

    # Tension — healthy / overstocked cover + channel divergence → investigate.
    if m.channel_divergence and m.cover_months >= m.target_months_cover:
        return Decision(
            action="investigate",
            priority=None,
            rationale=(
                f"Cover is {m.cover_months:.2f} months against a "
                f"{m.target_months_cover:.0f}-month target"
                + (
                    f", with {m.inbound_credited} units inbound"
                    if m.inbound_credited
                    else ""
                )
                + f". Amazon M3→M4 {m.amazon_m3_to_m4_pct:+.1f}% while "
                f"Shopify M3→M4 {m.shopify_m3_to_m4_pct:+.1f}%. "
                f"Do not reorder — investigate the soft channel."
            ),
            **{**kw, "gap_months": 0.0, "revenue_opportunity_usd": 0.0},
        )

    if under_target:
        tension = ""
        if m.period_growth_pct < 0:
            tension = (
                f"TENSION: revenue opportunity is "
                f"${m.projected_monthly_revenue_usd:,.0f}/mo but period growth is "
                f"{m.period_growth_pct:.1f}%. Rank by revenue as instructed, but "
                f"confirm the decline is not a lasting demand shift before ordering."
            )
        return Decision(
            action="reorder",
            priority=None,
            rationale=(
                f"Cover {m.cover_months:.2f} vs target {m.target_months_cover:.0f}; "
                f"forward cover {m.forward_cover_months:.2f}. "
                f"Revenue opportunity ${m.projected_monthly_revenue_usd:,.0f}/mo "
                f"(price × projected demand)."
            ),
            suggested_order_units=_order_units(m),
            tension_note=tension,
            **kw,
        )

    # Clears target today, but forward cover will breach it with no inbound.
    if m.forward_cover_months < m.target_months_cover and m.inbound_credited == 0:
        return Decision(
            action="watch",
            priority=None,
            rationale=(
                f"Clears target today ({m.cover_months:.2f}/{m.target_months_cover:.0f}) "
                f"but forward cover is {m.forward_cover_months:.2f} with no inbound."
            ),
            **{**kw, "gap_months": 0.0, "revenue_opportunity_usd": 0.0},
        )

    return Decision(
        action="do_not_reorder",
        priority=None,
        rationale=(
            f"Cover {m.cover_months:.2f} meets or exceeds the "
            f"{m.target_months_cover:.0f}-month target"
            + (
                f"; {m.inbound_credited} units inbound in "
                f"{m.order_arrival_months:.0f} month(s)"
                if m.inbound_credited
                else ""
            )
            + "."
        ),
        **{**kw, "gap_months": 0.0, "revenue_opportunity_usd": 0.0},
    )


def _sales_highlights(metrics: List[SkuMetrics]) -> tuple[List[SalesHighlight], List[SalesHighlight]]:
    by_units = sorted(metrics, key=lambda m: m.m4_demand, reverse=True)
    well = [
        SalesHighlight(
            sku=m.sku,
            m4_units=m.m4_demand,
            m4_revenue_usd=m.monthly_revenue_usd,
            period_growth_pct=m.period_growth_pct,
            rank_by="units",
        )
        for m in by_units[:3]
    ]
    poorly = [
        SalesHighlight(
            sku=m.sku,
            m4_units=m.m4_demand,
            m4_revenue_usd=m.monthly_revenue_usd,
            period_growth_pct=m.period_growth_pct,
            rank_by="units",
        )
        for m in by_units[-3:][::-1]  # weakest first
    ]
    return well, poorly


def decide(metrics: List[SkuMetrics]) -> DecisionSet:
    raw = [classify(m) for m in metrics]
    reorders = [d for d in raw if d.action == "reorder"]
    # Rank by revenue opportunity (brief: price × projected demand), not stock risk.
    reorders.sort(key=lambda d: d.revenue_opportunity_usd, reverse=True)
    ranked = [
        Decision(**{**d.to_dict(), "priority": i})
        for i, d in enumerate(reorders, start=1)
    ]
    sold_well, sold_poorly = _sales_highlights(metrics)

    notes = [
        "Bioactive Blend M1 sales exist in the extract but the brief says mid-M2 launch; "
        "trend uses M2→M4 only. Conflict reported, not silently resolved.",
        "Cover uses M4 pooled demand (observed baseline per brief). "
        "Revenue opportunity and forward cover use one-month projected demand "
        "(M4 × (1 + mean MoM of the trend window)).",
        "Priority ranks by revenue opportunity (price × projected demand), "
        "not by cover shortfall size.",
    ]

    if ranked:
        top = ranked[0]
        if top.gap_months <= 0.05 and top.forward_gap_months > top.gap_months:
            notes.append(
                f"{top.sku} is only {top.gap_months:.2f} months under target on "
                f"today's cover, but forward cover is {top.forward_cover_months:.2f} "
                f"(gap {top.forward_gap_months:.2f}). Urgency is justified by growth, "
                f"not by the 0.01-month headline alone."
            )
        for d in ranked:
            if d.tension_note:
                notes.append(d.tension_note)

    return DecisionSet(
        decisions=ranked + [d for d in raw if d.action != "reorder"],
        reorder_queue=ranked,
        do_not_reorder=[d for d in raw if d.action == "do_not_reorder"],
        investigate=[d for d in raw if d.action == "investigate"],
        watch=[d for d in raw if d.action == "watch"],
        sold_well=sold_well,
        sold_poorly=sold_poorly,
        notes=notes,
    )
