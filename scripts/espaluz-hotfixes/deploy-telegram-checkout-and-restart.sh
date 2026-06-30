#!/bin/bash
# Back-compat wrapper — use deploy-product.sh PRODUCT=telegram
export PRODUCT=telegram
export DEPLOY_FILES="${DEPLOY_FILES:-main.py espaluz_memory.py espaluz_rag.py espaluz_paypal_system.py espaluz_paguelofacil.py paypal_webhook_server.py espaluz_database.py espaluz_menu.py}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$SCRIPT_DIR/../oracle-resilience/deploy-product.sh"
