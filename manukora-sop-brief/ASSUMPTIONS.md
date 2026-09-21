# Assumptions

Judgment calls I made because the extract or the brief did not settle them.
Each is implemented in code and covered by a test where it affects a number.

## Conflicts in the source material

**Bioactive Blends: launch date vs M1 sales.** The brief says mid-January 2026
(mid-M2). The extract records December 2025 (M1) sales for all three. Both cannot
be true.

*Assumption:* trend uses M2→M4 as the brief instructs. M1 units stay in the
historical totals (removing recorded sales is a larger claim than leaving them).
The briefing reports the conflict instead of resolving it silently. A real
purchase order should not ship until someone confirms which side is wrong.

## Demand and cover

**M4 is the sell-through baseline; projection is for opportunity and timing.**
Cover = `stock_on_hand / M4_pooled_demand`, matching the brief's "current
sell-through baseline." Revenue opportunity and forward cover use
`projected_demand = M4 × (1 + mean MoM of the trend window)` — one month
forward only. Four observations do not support compounding double-digit monthly
growth further.

**Growth is the mean of observed month-over-month steps**, not a regression.
With four points a regression looks more rigorous and means less.

**Arrival month credit.** A shipment with `Order_Arrival_Months = n` is treated
as available for that month's demand. `0` means no order exists — units on order
are not credited.

**Lead time is not in the extract.** Suggested order quantity covers the gap to
target against *projected* demand and is rounded up to 50 units. It does not
claim a supplier MOQ or an exact order-by date; those need a real lead-time
table.

**Days of cover** use a 30-day month so the Propolis 30-day floor is comparable
to the brief's wording.

## Ranking and tension

**Revenue opportunity = retail price × projected monthly demand**, as the brief
defines it. Ranking uses that figure, not cover shortfall size.

**Declining-demand tension.** If a reorder candidate had negative period growth,
it would still rank by revenue opportunity but carry an explicit `tension_note`.
No SKU in this extract is declining overall; the live tension case is
channel divergence on MGO 100+ 250g (Amazon M3→M4 −4.0% with 6.2 months cover
and inbound stock) — investigate, do not reorder.

**Overstock is not a separate policy threshold.** Lines above target with inbound
are simply `do_not_reorder`. The interesting overstock is the divergence case
above.

## What the extract does not contain

- Unit costs / margins — priority is revenue, not profit.
- Supplier MOQs, warehouse capacity, promotions, returns.
- Explicit lead times (inferred only where an open order exists).

## Deliberately out of scope (48-hour box)

No web UI, no database, no live Shopify/Amazon connectors, no auth, no
multi-warehouse, no margin model. A clean offline Python pipeline with a
guarded LLM narration layer is the product of this brief.
