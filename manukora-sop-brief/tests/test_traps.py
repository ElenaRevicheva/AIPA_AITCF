"""One named test per trap — 'I verified the math' stops being a claim."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.load import load_extract
from src.metrics import compute_all, compute_metrics
from src.rules import PHASEOUT_SKU, decide

DATA = ROOT / "data" / "mock_sales_inventory.csv"


class TrapTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = {r.sku: r for r in load_extract(DATA)}
        cls.metrics = {m.sku: m for m in compute_all(cls.rows.values())}
        cls.decisions = decide(list(cls.metrics.values()))
        cls.by_sku = {d.sku: d for d in cls.decisions.decisions}

    # --- Trap 1: phase-out above threshold is not a reorder -----------------

    def test_phaseout_sku_not_reordered_above_threshold(self):
        m = self.metrics[PHASEOUT_SKU]
        d = self.by_sku[PHASEOUT_SKU]
        self.assertGreaterEqual(m.days_of_cover, 30.0)
        # Measured: ~41 days at M4 demand (230 / 168 * 30).
        self.assertGreater(m.days_of_cover, 40.0)
        self.assertLess(m.days_of_cover, 42.0)
        self.assertEqual(d.action, "do_not_reorder")
        self.assertNotIn(PHASEOUT_SKU, [r.sku for r in self.decisions.reorder_queue])

    # --- Trap 2: premium SKU uses its 3-month target ------------------------

    def test_premium_sku_uses_three_month_target(self):
        sku = "Manuka Honey MGO 1700+ 100g"
        m = self.metrics[sku]
        d = self.by_sku[sku]
        self.assertEqual(m.target_months_cover, 3.0)
        self.assertEqual(d.target_months_cover, 3.0)
        # Cover is under 3 but would look fine against a default 2.
        self.assertLess(m.cover_months, 3.0)
        self.assertGreater(m.cover_months, 2.0)
        self.assertEqual(d.action, "reorder")

    # --- Trap 3: launch SKU trend excludes partial M1 -----------------------

    def test_launch_sku_trend_excludes_partial_month(self):
        sku = "Bioactive Blend Recovery 250g"
        m = self.metrics[sku]
        self.assertEqual(m.trend_months_used, (2, 3, 4))
        # Correct M2→M4 growth is ~28.2%; naive M1→M4 is ~46.8%.
        self.assertAlmostEqual(m.period_growth_pct, 28.17, delta=0.1)
        self.assertIsNotNone(m.naive_m1_growth_pct)
        self.assertAlmostEqual(m.naive_m1_growth_pct, 46.77, delta=0.2)
        self.assertGreater(m.growth_overstatement_pp, 18.0)
        self.assertLess(m.growth_overstatement_pp, 19.5)

    def test_immunity_growth_overstatement_near_13pp(self):
        """Pinned during build: Immunity overstatement is 12.97pp, displays ~13."""
        m = self.metrics["Bioactive Blend Immunity 250g"]
        self.assertGreaterEqual(m.growth_overstatement_pp, 12.5)
        self.assertLess(m.growth_overstatement_pp, 13.5)

    # --- Trap 4: demand is pooled across channels ---------------------------

    def test_demand_is_pooled_across_channels(self):
        sku = "Manuka Honey MGO 514+ 500g"
        row = self.rows[sku]
        m = self.metrics[sku]
        expected = tuple(row.shopify[i] + row.amazon[i] for i in range(4))
        self.assertEqual(m.pooled_months, expected)
        self.assertEqual(m.m4_demand, row.shopify[3] + row.amazon[3])
        # Cover must use pooled demand, not a single channel.
        self.assertAlmostEqual(
            m.cover_months, row.stock_on_hand / m.m4_demand, places=2
        )

    # --- Trap 5: arrival 0 means no order -----------------------------------

    def test_zero_arrival_months_means_no_order(self):
        sku = "Manuka Honey MGO 514+ 500g"
        row = self.rows[sku]
        m = self.metrics[sku]
        self.assertEqual(row.order_arrival_months, 0)
        self.assertEqual(row.units_on_order, 0)
        self.assertEqual(m.inbound_credited, 0)
        # A SKU with units_on_order>0 but arrival 0 must also credit nothing.
        # (None in this extract — assert the rule on a synthetic case below.)

    def test_zero_arrival_ignores_nonzero_units_on_order(self):
        from src.load import SkuRow

        synthetic = SkuRow(
            sku="Synthetic Arrival Zero",
            shopify=(100, 100, 100, 100),
            amazon=(0, 0, 0, 0),
            stock_on_hand=100,
            units_on_order=500,
            order_arrival_months=0,
            target_months_cover=2,
            retail_price_usd=10.0,
        )
        m = compute_metrics(synthetic)
        self.assertEqual(m.inbound_credited, 0)
        self.assertEqual(m.cover_with_inbound_months, m.cover_months)

    # --- Trap 6 (priority): rank by revenue, not stock risk -----------------

    def test_priority_ranks_by_revenue_not_stock_risk(self):
        queue = self.decisions.reorder_queue
        self.assertGreaterEqual(len(queue), 3)
        revenues = [d.revenue_opportunity_usd for d in queue]
        self.assertEqual(revenues, sorted(revenues, reverse=True))
        # Brief: revenue opportunity = price × projected demand.
        # #1 must be 514+ 500g — not the lowest-cover SKU.
        self.assertEqual(queue[0].sku, "Manuka Honey MGO 514+ 500g")
        self.assertAlmostEqual(queue[0].revenue_opportunity_usd, 34284.12, delta=1.0)
        self.assertEqual(queue[1].sku, "Manuka Honey MGO 850+ 500g")
        self.assertEqual(queue[2].sku, "Manuka Honey MGO 1700+ 100g")

    def test_revenue_opportunity_uses_projected_demand(self):
        for d in self.decisions.reorder_queue:
            m = self.metrics[d.sku]
            self.assertAlmostEqual(
                d.revenue_opportunity_usd,
                m.projected_monthly_revenue_usd,
                places=2,
                msg=d.sku,
            )
            self.assertNotEqual(d.revenue_opportunity_usd, m.monthly_revenue_usd)

    def test_sold_well_and_poorly_surface_m4_extremes(self):
        well = [s.sku for s in self.decisions.sold_well]
        poorly = [s.sku for s in self.decisions.sold_poorly]
        self.assertEqual(well[0], "Manuka Honey MGO 263+ 250g")  # 1604 units
        self.assertEqual(poorly[0], "Propolis Tincture 30ml")  # 168 units
        self.assertEqual(len(well), 3)
        self.assertEqual(len(poorly), 3)

    # --- Cover / M4 revenue pins (observed baseline) ------------------------

    def test_derived_cover_and_m4_revenue_pins(self):
        pins = {
            "Manuka Honey MGO 514+ 500g": (1.99, 31356),
            "Manuka Honey MGO 850+ 500g": (1.80, 26838),
            "Manuka Honey MGO 1700+ 100g": (2.80, 17997),
            "Bioactive Blend Energy 250g": (1.91, 15516),
            "Bioactive Blend Recovery 250g": (1.68, 14556),
            "Propolis Tincture 30ml": (1.37, 5878),
        }
        for sku, (cover, rev) in pins.items():
            m = self.metrics[sku]
            self.assertAlmostEqual(m.cover_months, cover, delta=0.01, msg=sku)
            self.assertAlmostEqual(m.monthly_revenue_usd, rev, delta=2.0, msg=sku)

    # --- Tension case: high-volume overstock + soft channel -----------------

    def test_tension_case_high_volume_soft_channel_not_reordered(self):
        sku = "Manuka Honey MGO 100+ 250g"
        m = self.metrics[sku]
        d = self.by_sku[sku]
        self.assertGreater(m.cover_months, 6.0)
        self.assertTrue(m.channel_divergence)
        self.assertAlmostEqual(m.amazon_m3_to_m4_pct, -3.96, delta=0.1)
        self.assertEqual(d.action, "investigate")
        self.assertAlmostEqual(m.monthly_revenue_usd, 25790, delta=2.0)

    # --- Forward cover justifies marginal #1 --------------------------------

    def test_forward_cover_widens_marginal_top_reorder_gap(self):
        top = self.decisions.reorder_queue[0]
        self.assertEqual(top.sku, "Manuka Honey MGO 514+ 500g")
        # Today's gap is tiny (~0.01); forward gap is material.
        self.assertLessEqual(top.gap_months, 0.05)
        self.assertGreater(top.forward_gap_months, top.gap_months)
        self.assertLess(top.forward_cover_months, top.cover_months)


if __name__ == "__main__":
    unittest.main()
