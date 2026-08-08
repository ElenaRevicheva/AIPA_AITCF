"""Load and validate the mock sales/inventory extract."""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path
from typing import List

REQUIRED_COLUMNS = [
    "SKU",
    "Shopify_M1",
    "Shopify_M2",
    "Shopify_M3",
    "Shopify_M4",
    "Amazon_M1",
    "Amazon_M2",
    "Amazon_M3",
    "Amazon_M4",
    "Stock_On_Hand",
    "Units_On_Order",
    "Order_Arrival_Months",
    "Target_Months_Cover",
    "Retail_Price_USD",
]

INT_COLUMNS = [
    "Shopify_M1",
    "Shopify_M2",
    "Shopify_M3",
    "Shopify_M4",
    "Amazon_M1",
    "Amazon_M2",
    "Amazon_M3",
    "Amazon_M4",
    "Stock_On_Hand",
    "Units_On_Order",
]

FLOAT_COLUMNS = [
    "Order_Arrival_Months",
    "Target_Months_Cover",
    "Retail_Price_USD",
]


@dataclass(frozen=True)
class SkuRow:
    sku: str
    shopify: tuple[int, int, int, int]
    amazon: tuple[int, int, int, int]
    stock_on_hand: int
    units_on_order: int
    order_arrival_months: float
    target_months_cover: float
    retail_price_usd: float


def load_extract(path: str | Path) -> List[SkuRow]:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Extract not found: {path}")

    with path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        if reader.fieldnames is None:
            raise ValueError("Extract is empty or missing a header row")
        missing = [c for c in REQUIRED_COLUMNS if c not in reader.fieldnames]
        if missing:
            raise ValueError(f"Extract missing required columns: {missing}")

        rows: List[SkuRow] = []
        for i, raw in enumerate(reader, start=2):
            try:
                rows.append(_parse_row(raw))
            except (TypeError, ValueError) as exc:
                raise ValueError(f"Row {i} ({raw.get('SKU', '?')}): {exc}") from exc

    if not rows:
        raise ValueError("Extract has a header but no data rows")
    return rows


def _parse_row(raw: dict) -> SkuRow:
    for col in INT_COLUMNS + FLOAT_COLUMNS:
        if raw.get(col) is None or str(raw[col]).strip() == "":
            raise ValueError(f"{col} is empty")

    shopify = tuple(int(raw[f"Shopify_M{m}"]) for m in (1, 2, 3, 4))
    amazon = tuple(int(raw[f"Amazon_M{m}"]) for m in (1, 2, 3, 4))
    return SkuRow(
        sku=str(raw["SKU"]).strip(),
        shopify=shopify,  # type: ignore[arg-type]
        amazon=amazon,  # type: ignore[arg-type]
        stock_on_hand=int(raw["Stock_On_Hand"]),
        units_on_order=int(raw["Units_On_Order"]),
        order_arrival_months=float(raw["Order_Arrival_Months"]),
        target_months_cover=float(raw["Target_Months_Cover"]),
        retail_price_usd=float(raw["Retail_Price_USD"]),
    )
