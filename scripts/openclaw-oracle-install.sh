#!/usr/bin/env bash
# OpenClaw gateway install on Oracle (Ubuntu). Run as ubuntu on 170.9.242.90.
set -e

echo "OpenClaw Oracle install..."

# Node 22+ (required by OpenClaw)
if ! command -v node &>/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]; then
  echo "Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "Node: $(node -v)"

# OpenClaw CLI
sudo npm install -g openclaw@latest
echo "OpenClaw: $(openclaw -V 2>/dev/null || true)"

# State and workspace dirs
mkdir -p ~/.openclaw/workspace/skills/job-shortlist
mkdir -p ~/.openclaw/agents/main/sessions
mkdir -p ~/.openclaw/credentials

echo "Done. Next: copy openclaw.json, workspace, agents, .env from your laptop (see docs/OPENCLAW_ORACLE_DEPLOY.md), then deploy job-list-filter and install the systemd unit."
