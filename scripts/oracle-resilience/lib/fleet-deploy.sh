#!/bin/bash
# Shared fleet deploy helpers — source from deploy-product.sh
set -euo pipefail

fleet_product_var() {
  local product="$1" field="$2"
  local var="PRODUCT_${product}_${field}"
  echo "${!var:-}"
}

fleet_git_fetch() {
  local dir="$1" branch="$2"
  cd "$dir"
  echo "=== Fetch $dir (origin/$branch) ==="
  git fetch origin "$branch"
}

fleet_checkout_files() {
  local branch="$1" files="$2"
  if [[ -z "$files" ]]; then
    echo "WARN: no deploy_files — skipping checkout (restart only)"
    return 0
  fi
  echo "=== Checkout (code only): $files ==="
  # shellcheck disable=SC2086
  git checkout "origin/$branch" -- $files
}

fleet_pull_ff_only() {
  local branch="$1"
  echo "=== git pull --ff-only origin/$branch ==="
  git pull --ff-only "origin/$branch"
}

fleet_run_build() {
  local build_cmd="$1"
  if [[ -n "$build_cmd" ]]; then
    echo "=== Build ==="
    bash -c "$build_cmd"
  elif [[ -f package.json ]]; then
    echo "=== npm ci + build (default) ==="
    npm ci --omit=dev
    npm run build 2>/dev/null || true
  fi
}

fleet_restart() {
  local restart_cmd="$1"
  echo "=== Restart ==="
  # shellcheck disable=SC2086
  bash -c "$restart_cmd"
  sleep 2
}

fleet_health_one() {
  local label="$1" health_cmd="$2"
  if eval "$health_cmd" >/dev/null 2>&1; then
    echo "OK  $label"
    return 0
  fi
  echo "WARN  $label — health check failed"
  return 1
}
