"""Numeric guard — the gate that stops invented figures from shipping."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.load import load_extract
from src.metrics import compute_all
from src.numeric_guard import find_unknown_numbers, guard
from src.rules import decide


class NumericGuardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        rows = load_extract(ROOT / "data" / "mock_sales_inventory.csv")
        cls.payload = decide(compute_all(rows)).to_payload()

    def test_clean_display_strings_pass(self):
        item = self.payload["display"]["reorder"][0]
        text = (
            f"Reorder {item['priority']} {item['sku']} — cover {item['cover']} / "
            f"target {item['target']} (forward {item['forward_cover']}); "
            f"revenue opportunity {item['revenue_opportunity']}/mo."
        )
        ok, bad = guard(text, self.payload)
        self.assertTrue(ok, bad)

    def test_catches_invented_months_over_target_subtraction(self):
        # Anthropic computed 4.55-2=2.55 etc. Even when arithmetic is right,
        # the operation is forbidden unless the payload already carries it.
        # Our payload DOES carry months_over_target, so 2.55 for 263+ is allowed
        # if present. Invent a figure that is NOT in the payload.
        text = "The overstocked lines sit 9.7 months over target."
        ok, bad = guard(text, self.payload)
        self.assertFalse(ok)
        self.assertTrue(any("9.7" in b for b in bad), bad)

    def test_catches_rounded_percent(self):
        # 11.8% exists; bare 11% as a growth claim should fail if 11 is not
        # otherwise present. Use a clearly alien percent.
        text = "Growth accelerated to 47% across the portfolio."
        ok, bad = guard(text, self.payload)
        self.assertFalse(ok)
        self.assertTrue(any("47" in b for b in bad), bad)

    def test_catches_invented_total(self):
        text = "Combined revenue at risk is $112,000 this month."
        ok, bad = guard(text, self.payload)
        self.assertFalse(ok)
        self.assertTrue(any("112" in b for b in bad), bad)

    def test_template_briefing_passes_guard(self):
        from src.narrate import template_briefing

        text = template_briefing(self.payload)
        ok, bad = guard(text, self.payload)
        self.assertTrue(ok, bad)

    def test_find_unknown_numbers_empty_on_payload_echo(self):
        # Echoing a display row must be clean.
        item = self.payload["display"]["reorder"][0]
        text = (
            f"{item['sku']} cover {item['cover']} target {item['target']} "
            f"forward {item['forward_cover']} revenue {item['revenue_opportunity']} "
            f"growth {item['growth_pct']}"
        )
        self.assertEqual(find_unknown_numbers(text, self.payload), [])


if __name__ == "__main__":
    unittest.main()
