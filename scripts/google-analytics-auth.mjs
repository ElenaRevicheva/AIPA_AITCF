/**
 * Google service-account JWT auth for scripts (GA4 Data API, GSC, etc.).
 * Same pattern as getGoogleAccessToken() in src/daily-blog-publisher.ts — no googleapis dep.
 */
import dotenv from 'dotenv';
import { createSign } from 'crypto';

dotenv.config({ override: true });

export const GA4_READONLY_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
export const GSC_READONLY_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

async function buildGoogleJwt(sa, scope) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      sub: sa.client_email,
      scope,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  ).toString('base64url');
  const unsigned = `${header}.${payload}`;
  const sign = createSign('RSA-SHA256');
  sign.update(unsigned);
  const sig = sign.sign(sa.private_key, 'base64url');
  return `${unsigned}.${sig}`;
}

/** @param {string} scope e.g. GA4_READONLY_SCOPE */
export async function getGoogleAccessToken(scope) {
  const raw = process.env.GOOGLE_ANALYTICS_CREDENTIALS?.trim();
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw);
    const jwt = await buildGoogleJwt(sa, scope);
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });
    const data = await res.json();
    return data.access_token ?? null;
  } catch (e) {
    console.error('[google-analytics-auth] token error:', e);
    return null;
  }
}
