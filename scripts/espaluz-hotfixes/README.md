# Fleet deploy scripts (Oracle + phone + Cloud Agent)

All products deploy via **GitHub Actions → Deploy to Oracle VM** — pick a **product** from the dropdown.

See **`scripts/oracle-resilience/CLOUD_AGENT_DEPLOY.md`** for phone setup and product table.

## Legacy script names (still work)

| Script | Maps to |
|--------|---------|
| `deploy-whatsapp-checkout-and-restart.sh` | `PRODUCT=whatsapp` |
| `deploy-telegram-checkout-and-restart.sh` | `PRODUCT=telegram` |
| `deploy-kinder-fix-on-oracle.sh` | WhatsApp kinder fix + test |

## Universal entry point

```bash
PRODUCT=whatsapp DEPLOY_FILES="espaluz_bridge.py" bash scripts/oracle-resilience/deploy-product.sh
```

---

## Kinder preference bug (reference)

Messages containing **"kinder"** were matched as preference `kind` — fixed in `espaluz_advanced_features.py` (`70bb926`).

```bash
PRODUCT=whatsapp DEPLOY_FILES="espaluz_advanced_features.py scripts/tests/test_preference_parsing.py" \
  bash scripts/oracle-resilience/deploy-product.sh
```

Or run `deploy-kinder-fix-on-oracle.sh`.
