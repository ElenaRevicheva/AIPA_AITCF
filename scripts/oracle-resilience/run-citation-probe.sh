#!/usr/bin/env bash
# Weekly AI citation probe — moved off GitHub Actions 2026-08-17.
#
# GitHub only reads repo SECRETS, which are set separately from Oracle's .env.
# When the SerpAPI plan was cancelled the workflow had no other engine key
# configured there, measured nothing, and failed every Monday. Oracle already
# holds every key (Gemini, OpenAI, Bright Data), so running it here needs no
# credential copied anywhere.
set -a
. /home/ubuntu/cto-aipa/.env
set +a
cd /home/ubuntu/cto-aipa
/usr/bin/node scripts/citation-probe.cjs --save --notify
