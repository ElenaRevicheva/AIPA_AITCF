/**
 * hs-env.cjs — one way to read HubSpot / audit credentials for the Manual Prospect Play.
 *
 * The play's scripts used to read `.env` directly with `fs.readFileSync`, which throws
 * ENOENT before the script can explain itself. That is fine on Elena's laptop, where
 * `.env` always exists, and wrong everywhere else the same scripts run: Oracle cron,
 * CI and cloud agents hold the Service Key in the process environment, not in a file.
 * Here `.env` stays the default and the environment wins when it is set, so one command
 * behaves the same in all four places.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');

function readEnvFile() {
  try {
    return fs.readFileSync(ENV_PATH, 'utf8');
  } catch {
    return '';
  }
}

const ENV_FILE = readEnvFile();

/** Process environment first (explicit invocation wins), then `.env`, then ''. */
function envValue(name) {
  const live = process.env[name];
  if (live && live.trim()) return live.trim();
  return ENV_FILE.match(new RegExp(`^${name}=(.+)$`, 'm'))?.[1]?.trim() || '';
}

function hubspotKey() {
  return envValue('HUBSPOT_API_KEY');
}

/** Elena — every CLIENT-MANUAL deal/task assigns to her or Tasks → "Assigned to me" hides it. */
function hubspotOwnerId() {
  return envValue('HUBSPOT_OWNER_ID') || '91612860';
}

/** Overridable so the cycle can be exercised end to end against a mock CRM. */
function hubspotBase() {
  return (envValue('HUBSPOT_API_BASE') || 'https://api.hubapi.com').replace(/\/$/, '');
}

function visibilityUrl() {
  return envValue('VISIBILITY_API_URL') || 'https://webhook.aideazz.xyz/cto/v1/visibility';
}

/** Owner key for batch/manual work; the public demo key is capped at 20/hour. */
function visibilityKey() {
  return (
    envValue('VISIBILITY_API_KEY') ||
    envValue('VISIBILITY_API_KEYS').split(',')[0].trim() ||
    'aidz_demo_visibility_2026'
  );
}

module.exports = {
  ENV_PATH,
  envValue,
  hubspotKey,
  hubspotOwnerId,
  hubspotBase,
  visibilityUrl,
  visibilityKey,
};
