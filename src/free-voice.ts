import fs from 'fs';
import os from 'os';
import path from 'path';
import https from 'https';

/**
 * One free voice for CTO AIPA (25 Oct 2026): scripts/speak-free.py — Microsoft Edge in sentence chunks with a retry,
 * Google gTTS if Edge still fails. OpenAI TTS ran out of credit on 23 Oct. The bot's voice replies already fell back to
 * this script on 24 Oct, but the morning Sprint Briefing runs on AWS Lambda — no Python there — and kept arriving as
 * text with "OpenAI TTS failed". On Oracle the script runs here; anywhere else it asks Oracle's POST /voice/speak.
 */

// Elena, 25 Oct: CTO AIPA speaks with a man's voice. Andrew is Edge's natural multilingual male voice (EN + ES).
export const CTO_FREE_VOICE = process.env.CTO_EDGE_VOICE || 'en-US-AndrewMultilingualNeural';
const SCRIPT = path.join(__dirname, '..', 'scripts', 'speak-free.py');

/** MP3 from the free voice, run on this machine (Oracle). */
export async function speakFreeLocal(text: string, voice = CTO_FREE_VOICE): Promise<Buffer> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cto-voice-'));
  try {
    const txt = path.join(dir, 'in.txt'), mp3 = path.join(dir, 'out.mp3');
    fs.writeFileSync(txt, text);
    const py = process.env.EDGE_TTS_PY || path.join(os.homedir(), '.openclaw', 'edge-tts-venv', 'bin', 'python');
    await run(py, [SCRIPT, '--in', txt, '--out', mp3, '--voice', voice, '--rate=-5%'], { timeout: 150_000 });
    return fs.readFileSync(mp3);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp dir */ }
  }
}

function oracleCall(method: 'GET' | 'POST', urlPath: string, body?: object): Promise<{ status: number; buf: Buffer }> {
  const base = (process.env.SPRINT_KNOWLEDGE_API_URL || '').replace(/\/sprint-knowledge.*$/, '');
  const secret = (process.env.OUTREACH_SECRET || '').trim();
  if (!base || !secret) return Promise.reject(new Error('no SPRINT_KNOWLEDGE_API_URL / OUTREACH_SECRET to reach Oracle'));
  const url = new URL(`${base}${urlPath}`);
  const data = body ? JSON.stringify(body) : '';
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname, port: url.port || 443, path: url.pathname, method,
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode || 0, buf: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(30_000, () => req.destroy(new Error(`Oracle ${urlPath} did not answer in 30 s`)));
    req.end(data);
  });
}

/**
 * MP3 from Oracle — for hosts without the script (the Sprint Briefing Lambda). Start a job, then ask every 5 s:
 * one long request died at nginx's 60 s proxy timeout (25 Oct) because a full briefing takes longer to speak.
 */
export async function speakFreeViaOracle(text: string, maxWaitMs = 200_000): Promise<Buffer> {
  const start = await oracleCall('POST', '/voice/speak', { text, async: true });
  const id = start.status === 202 ? JSON.parse(start.buf.toString('utf8')).id : '';
  if (!id) throw new Error(`Oracle /voice/speak ${start.status}: ${start.buf.toString('utf8').slice(0, 120)}`);
  for (const t0 = Date.now(); Date.now() - t0 < maxWaitMs;) {
    await new Promise((r) => setTimeout(r, 5000));
    const r = await oracleCall('GET', `/voice/speak/${id}`);
    if (r.status === 202) continue;
    if (r.status === 200 && r.buf.length > 1000) return r.buf;
    throw new Error(`Oracle voice job ${r.status}: ${r.buf.toString('utf8').slice(0, 120)}`);
  }
  throw new Error(`Oracle voice job not ready after ${Math.round(maxWaitMs / 1000)} s`);
}

/** The free voice wherever this runs: the script on Oracle, Oracle's endpoint elsewhere. */
export function speakFree(text: string): Promise<Buffer> {
  return fs.existsSync(SCRIPT) ? speakFreeLocal(text) : speakFreeViaOracle(text);
}
