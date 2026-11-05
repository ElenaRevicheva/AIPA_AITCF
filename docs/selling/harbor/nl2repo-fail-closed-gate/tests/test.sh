#!/bin/bash
# Reward is the fraction of behaviour tests passed (0 to 1), per the NL2Repo brief.
set -u
pytest -q /tests/test_behavior.py
code=$?
mkdir -p /logs/verifier
if [ "$code" -eq 0 ]; then
  echo 1 > /logs/verifier/reward.txt
  exit 0
fi
echo 0 > /logs/verifier/reward.txt
exit 1
