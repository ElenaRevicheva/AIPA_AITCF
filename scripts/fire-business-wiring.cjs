#!/usr/bin/env node
/**
 * Fire the client-side business wiring on demand — same functions the Telegram
 * commands and daily crons call, runnable from a shell on Oracle:
 *
 *   cd ~/cto-aipa && node scripts/fire-business-wiring.cjs                 # fresh + yc + triage
 *   node scripts/fire-business-wiring.cjs fresh                            # HN + GitHub only
 *   node scripts/fire-business-wiring.cjs "places=construction|Lexington KY" triage
 *
 * Steps: fresh (HN+GitHub fresh-leads) · yc (YC->Hunter prospect ingest) ·
 *        places=<industry>|<city> (Google Places) · serp (buyer-intent Google SERP) ·
 *        triage (score + push to HubSpot).
 * Run from the repo root so dotenv picks up .env. Read-only toward email:
 * this NEVER sends outreach — sending stays with the 15:00 Panama cron / Elena's review.
 */
require('dotenv').config();

const A = require('@anthropic-ai/sdk');
const Anthropic = A.default || A.Anthropic || A;
const G = require('groq-sdk');
const Groq = G.default || G.Groq || G;

const { runFreshLeadsIngestion } = require('../dist/fresh-leads-ingest');
const { runProspectIngestion } = require('../dist/prospect-ingest');
const { runPlacesIngestion } = require('../dist/prospect-places');
const { runSerpProspects } = require('../dist/serpapi-prospects');
const { runTriageCycle, buildDailyBrief } = require('../dist/lead-triage');

const log = async (m) => console.log('[fire]', typeof m === 'string' ? m : JSON.stringify(m));

(async () => {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  // Default = money lanes only. No Places (local trades ≠ skill ICP).
  const steps = process.argv.slice(2).length ? process.argv.slice(2) : ['serp', 'fresh', 'yc', 'triage'];

  for (const step of steps) {
    console.log(`\n===== STEP: ${step} =====`);
    try {
      if (step === 'fresh') {
        const r = await runFreshLeadsIngestion(anthropic, ['hn', 'github'], log);
        console.log(`[fire] fresh_leads result: ${JSON.stringify(r)}`);
      } else if (step === 'yc') {
        const r = await runProspectIngestion(anthropic, log);
        console.log(`[fire] outreach_ingest result: ${JSON.stringify(r)}`);
      } else if (step === 'serp') {
        const r = await runSerpProspects();
        console.log(`[fire] serp result: ${JSON.stringify(r)}`);
      } else if (step.startsWith('places=')) {
        const [industry, city] = step.slice('places='.length).split('|');
        if (!industry || !city) { console.error('[fire] places needs "places=<industry>|<city>"'); continue; }
        await runPlacesIngestion(anthropic, { industry, city }, log);
      } else if (step === 'triage') {
        const r = await runTriageCycle(groq, anthropic);
        console.log(`[fire] triage result: processed=${r.processed} urgent=${r.urgent}`);
        const brief = await buildDailyBrief();
        console.log(`[fire] daily brief:\n${brief || '(0 actionable signals)'}`);
      } else {
        console.error(`[fire] unknown step "${step}" — use fresh | yc | serp | places=<industry>|<city> | triage`);
      }
    } catch (e) {
      console.error(`[fire] step "${step}" FAILED:`, (e && e.message) || e);
    }
  }
  process.exit(0);
})();
