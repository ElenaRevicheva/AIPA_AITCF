# Prompt v1 — first attempt (deliberately naive)

You are an S&OP analyst. Here is our raw sales and inventory CSV for the last
four months across Shopify and Amazon. Write a short executive briefing for
March 2026 covering what changed, what is at risk, and what we should reorder.

Use your judgement on growth rates, cover, and priority. Be decisive.

```
{{RAW_CSV}}
```

---

## Why this prompt fails (observed)

Handing the model the raw extract and asking it to "use its judgement" produces
three consistent failure modes:

1. **Invented arithmetic.** Cover ratios, growth percentages, and revenue
   figures are computed inside the model and frequently wrong — or right by
   coincidence and therefore unverifiable.
2. **Missed business rules.** The phase-out floor, the 3-month premium target,
   the mid-window launch, and "arrival = 0 means no order" are not discoverable
   from the CSV alone. The model either ignores them or invents causes.
3. **Summary instead of decision.** The output reads like a dashboard narrative
   ("sales are up across the board") rather than a ranked action list.

v1 is kept in the repo as the control. It is not used in the pipeline.
