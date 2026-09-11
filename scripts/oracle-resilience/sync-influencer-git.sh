#!/usr/bin/env bash
# Push the live EspaLuz_Influencer image-URL fix to GitHub without --force
# and without restarting the bot. Remote was ahead of Oracle's clone.
set -uo pipefail

DIR=/home/ubuntu/EspaLuz_Influencer
echo "=== influencer-sync $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
cd "$DIR" || { echo "FATAL: $DIR missing"; exit 1; }

echo "--- local ---"
git log -1 --format='%h %ci %s'
echo "--- fetch origin main ---"
git fetch origin main 2>&1
echo "--- origin/main ---"
git log -1 --format='%h %ci %s' origin/main
echo "--- commits on origin/main not in HEAD ---"
git log --oneline HEAD..origin/main | head -20
echo "--- commits on HEAD not in origin/main ---"
git log --oneline origin/main..HEAD | head -10

# Live file must keep the public image prefix. Do not checkout remote main.py.
if ! grep -q 'webhook.aideazz.xyz/influencer-images/' main.py; then
  echo "FATAL: live main.py lost the public image prefix — aborting sync"
  exit 1
fi

# Rebase our local fix commit(s) onto origin/main. If main.py conflicts, keep
# the version that has the public prefix (the verification).
if git merge-base --is-ancestor origin/main HEAD; then
  echo "already contains origin/main — trying push"
else
  echo "--- rebase onto origin/main ---"
  if git rebase origin/main; then
    echo "rebase ok"
  else
    echo "rebase conflict — resolving main.py in favour of public image prefix"
    if [ -f main.py ] && grep -q 'webhook.aideazz.xyz/influencer-images/' main.py; then
      git add main.py
    elif git show :2:main.py >/dev/null 2>&1; then
      # ours during rebase = the commit being replayed = the fix
      git checkout --ours -- main.py 2>/dev/null || git checkout --theirs -- main.py
      git add main.py
    fi
    if grep -q 'webhook.aideazz.xyz/influencer-images/' main.py && \
       GIT_EDITOR=true git rebase --continue; then
      echo "rebase continued"
    else
      git rebase --abort
      echo "FATAL: rebase aborted; live patched file left in place; GitHub still behind"
      exit 1
    fi
  fi
fi

if grep -q 'webhook.aideazz.xyz/influencer-images/' main.py; then
  echo "post-rebase prefix: PASS"
else
  echo "FATAL: prefix missing after rebase"
  exit 1
fi

echo "--- push ---"
if git push origin HEAD:main; then
  echo "PUSH_OK $(git log -1 --format='%h')"
else
  echo "WARN: push still rejected"
  git status -sb
  exit 1
fi

echo "service not restarted (sync only)"
systemctl is-active espaluz-influencer
systemctl show espaluz-influencer -p ActiveEnterTimestamp -p MainPID
echo "=== DONE influencer-sync ==="
