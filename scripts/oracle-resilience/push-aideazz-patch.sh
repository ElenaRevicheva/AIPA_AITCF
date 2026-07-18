#!/bin/bash
# Runs ON the Oracle box (via deploy-oracle-on-trigger.yml, product "aideazz").
#
# Why: Cursor cloud agents can push to AIPA_AITCF but get 403 on the aideazz
# repo. The box's git credential store (oracle-fix-git-https-auth.sh) has a
# full-access PAT — so agents park verified patches in scripts/aideazz-patches/
# here, and the box applies + pushes them to aideazz main (4everland auto-deploys).
set -euo pipefail

AIPA_DIR=/home/ubuntu/cto-aipa
if [ ! -d "$AIPA_DIR/.git" ]; then AIPA_DIR=/home/ubuntu/AIPA_AITCF; fi
PATCH_DIR="$AIPA_DIR/scripts/aideazz-patches"

SITE_DIR=/home/ubuntu/aideazz
if [ ! -d "$SITE_DIR/.git" ]; then
  echo "=== Cloning aideazz into $SITE_DIR ==="
  git clone --depth 20 https://github.com/ElenaRevicheva/aideazz.git "$SITE_DIR"
fi

cd "$SITE_DIR"
git config user.name "AIdeazz Oracle Deploy"
git config user.email "aipa@aideazz.xyz"
echo "=== Sync aideazz main ==="
git fetch origin main
git checkout -f main
git reset --hard origin/main

shopt -s nullglob
PATCHES=("$PATCH_DIR"/*.patch)
if [ ${#PATCHES[@]} -eq 0 ]; then
  echo "No patches in $PATCH_DIR — nothing to do."
  exit 0
fi

APPLIED=0
for p in "${PATCHES[@]}"; do
  echo "=== Patch: $(basename "$p") ==="
  # Skip by commit subject: reverse-apply checks break once later commits touch
  # the same lines, but the subject stays unique in history. git mailinfo
  # decodes RFC-2047 (=?UTF-8?q?...) subjects that plain grep would mangle.
  SUBJECT=$(git mailinfo /dev/null /dev/null < "$p" | grep -m1 '^Subject: ' | sed 's/^Subject: //')
  if [ -n "$SUBJECT" ] && [ -n "$(git log --oneline -F --grep="$SUBJECT" origin/main)" ]; then
    echo "Already in history (\"$SUBJECT\") — skipping."
    continue
  fi
  if git apply --check "$p" 2>/dev/null; then
    git am "$p"
    APPLIED=$((APPLIED + 1))
  else
    echo "ERROR: patch does not apply cleanly (repo diverged?). Aborting before push."
    git am --abort 2>/dev/null || true
    exit 1
  fi
done

if [ "$APPLIED" -gt 0 ]; then
  echo "=== Pushing $APPLIED patch(es) to aideazz main (4everland auto-deploys) ==="
  git push origin main
fi
echo "=== aideazz main now at: $(git log --oneline -1) ==="
