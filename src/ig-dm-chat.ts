/**
 * ig-dm-chat.ts — EspaLuz answers Instagram DIRECT MESSAGES (22 Nov 2026).
 *
 * Elena: "build #1 (answer DMs) and #2 (ice breakers)" — the two ManyChat features worth having, aimed at EspaLuz.
 * Someone writes to @elena_revicheva ("hola, how does it work?") -> EspaLuz answers in her voice, in the person's
 * language, from TRUE facts only, and always leaves the door open to the full EspaLuz (WhatsApp / app / Telegram,
 * where the memory and the 14-day trial live). This is a concierge, NOT the family brain: the brain is keyed by phone
 * number inside the WhatsApp bridge; making Instagram a full fourth channel is a separate, bigger job.
 *
 * Ice breakers (Instagram's "start a chat" buttons) answer with FIXED texts — no model, nothing to invent, no cost.
 * Free text goes through the cost-aware waterfall (completeWithProfile: free models first, Claude last).
 *
 * Guards: never answers itself or an echo; at most IG_CHAT_MAX_PER_DAY (12) replies per person per day; Meta only
 * allows replies inside 24 h of the person's last message, which is exactly when this runs.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { completeWithProfile } from './llm-resilience';

const STATE_FILE = path.join(process.cwd(), '.ig-dm-chat.json');
const WA = '50766623757';

interface Turn { role: 'them' | 'espaluz'; text: string }
interface ChatState { code?: string; people: Record<string, { day: string; count: number; turns: Turn[] }> }

function load(): ChatState {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { people: {} }; }
}
function save(s: ChatState): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 1));
}

/** One stable code for the Instagram-DM door, film-style, so arrivals land in the 13:40 report. */
export function chatCode(s: ChatState, now = new Date()): string {
  if (!s.code) {
    const day = now.toISOString().slice(0, 10).replace(/-/g, '');
    s.code = `f${day}${crypto.createHash('md5').update('ig-dm-chat').digest('hex').slice(0, 4)}`;
  }
  return s.code;
}

export function doors(code: string): string {
  const hello = encodeURIComponent(`Hola EspaLuz 👋 (ref ${code}-ig)`);
  return [
    `💬 WhatsApp: https://wa.me/${WA}?text=${hello}`,
    `📱 App: https://app.espaluz.lat/?utm_source=instagram&utm_medium=dm-chat&utm_campaign=${code}`,
    `✈️ Telegram: https://t.me/EspaLuzFamily_bot?start=${code}_ig`,
  ].join('\n');
}

/** Ice breakers: question shown in Instagram -> payload -> fixed bilingual answer. Max 4 (Meta's limit). */
export const ICE_BREAKERS: { question: string; payload: string; answer: string }[] = [
  {
    question: '¿Qué es EspaLuz? · What is EspaLuz?',
    payload: 'ESPALUZ_WHAT',
    answer:
      'EspaLuz es la compañera de tu familia para la nueva vida en español: te ayuda con la nota de la escuela, el pediatra, el vecino, el súper. Recuerda a cada miembro de la familia, y también pueden practicar inglés.\n' +
      "EspaLuz is your family's companion for a new life in Spanish: school notes, the doctor, the neighbours. It remembers each family member, and you can practise English too.",
  },
  {
    question: '¿Es gratis probar? · Is it free to try?',
    payload: 'ESPALUZ_FREE',
    answer: 'Sí: los primeros 14 días son gratis.\nYes: the first 14 days are free.',
  },
  {
    question: '¿Hay algo para mis hijos? · Anything for my kids?',
    payload: 'ESPALUZ_KIDS',
    answer:
      'Sí: EspaLuz tiene un salón de clases para niños, con juegos, trazos y voces, en la app.\nYes: there is a kids classroom with games, tracing and voices in the app.',
  },
  {
    question: 'Quiero empezar · I want to start',
    payload: 'ESPALUZ_START',
    answer: '¡Qué bien! Elige por dónde empezar · Pick where to start:',
  },
];

const SYSTEM = `You are EspaLuz answering a stranger's Instagram direct message for the EspaLuz Instagram account.
Reply in the language the person wrote in (Spanish, English or Russian). Warm, short: 2-4 sentences, no lists, no hashtags.

TRUE FACTS — use only these, never add numbers, prices, user counts, guarantees or features not listed:
- EspaLuz is an AI companion for families building a new life in Spanish in Latin America (21 countries): real moments
  like the school note, the doctor, the neighbours, the supermarket. Families can also practise English.
- It works on WhatsApp, Telegram and the web app (app.espaluz.lat). It remembers each member of the family.
- There is a kids classroom in the app (games, tracing, voices).
- The first 14 days are free. For prices, say the app shows the plans.
- It was created by Elena, who moved to Panama with her daughter.
NEVER give legal, immigration, medical or financial advice; for those say a local professional should help, and offer
EspaLuz for the Spanish around it. Never claim to be human. If the person wants to start or asks how, say the links
are below. Do not write any links yourself.`;

/**
 * INBOX POLL (22 Nov 2026). Meta did not deliver DM webhooks to this app (2 test DMs, zero POSTs, although the account
 * lists the app as subscribed to `messages`), while the same token READS the inbox fine. So once a minute we read the
 * newest conversations and answer what is new. Safety for a personal profile: never an old friend's chat — a thread
 * whose fetched history reaches back more than IG_CHAT_NEW_DAYS (14) is skipped unless EspaLuz already answers there.
 * Only messages newer than the process start (or IG_CHAT_POLL_SINCE) and younger than 24 h (Meta's reply window).
 */
export interface PollMsg { id: string; created_time: string; from?: { id: string }; message?: string }
export interface PollConv { id: string; updated_time: string; messages?: { data: PollMsg[] } }

export async function pollOnce(
  convs: PollConv[],
  send: Sender,
  opts: { ownId: string; since: Date; now?: Date; llm?: typeof completeWithProfile; newDays?: number },
): Promise<string[]> {
  const now = opts.now || new Date();
  const newDays = opts.newDays ?? Number(process.env.IG_CHAT_NEW_DAYS || 14);
  const s = load();
  const seen = new Set<string>((s as any).seenMids || []);
  const out: string[] = [];
  for (const c of convs) {
    const msgs = [...(c.messages?.data || [])].sort((a, b) => b.created_time.localeCompare(a.created_time)); // newest first
    const newest = msgs[0];
    if (!newest || newest.from?.id === opts.ownId) continue; // last word is ours (bot, ManyChat or Elena)
    const person = newest.from?.id || '';
    const engaged = (s.people[person]?.turns?.length || 0) > 0;
    const oldest = msgs[msgs.length - 1] ?? newest;
    const ageDays = (now.getTime() - new Date(oldest.created_time).getTime()) / 86400000;
    if (!engaged && ageDays > newDays) { out.push(`skip ${c.id.slice(-6)}: an older chat (not a new contact)`); continue; }
    const fresh: PollMsg[] = [];
    for (const m of msgs) {
      if (m.from?.id === opts.ownId) break; // only what came after our last word
      const t = new Date(m.created_time);
      if (seen.has(m.id) || t < opts.since || now.getTime() - t.getTime() > 24 * 3600000) continue;
      fresh.push(m);
    }
    if (!fresh.length) continue;
    const text = fresh.reverse().map((m) => m.message || '').filter(Boolean).join('\n');
    fresh.forEach((m) => seen.add(m.id));
    (s as any).seenMids = [...seen].slice(-3000);
    save(s);
    if (!text) continue;
    const lastMid = fresh[fresh.length - 1]?.id || '';
    out.push(await handleMessaging({ sender: { id: person }, message: { text, mid: lastMid } }, send, { ownId: opts.ownId, now, ...(opts.llm ? { llm: opts.llm } : {}) }));
  }
  return out;
}

/** Sends one Instagram DM through the Page (Unified login). `send` is injected so tests never touch the network. */
export type Sender = (recipientId: string, text: string) => Promise<{ ok: boolean; status: number; text: string }>;

export async function handleMessaging(ev: any, send: Sender, opts: { ownId?: string; now?: Date; llm?: typeof completeWithProfile } = {}): Promise<string> {
  const from = String(ev?.sender?.id || '');
  const own = opts.ownId ?? process.env.IG_USER_ID?.trim() ?? '';
  if (!from) return 'skip: no sender';
  if (from === own || ev?.message?.is_echo) return 'skip: own/echo';
  const payload = String(ev?.postback?.payload || ev?.message?.quick_reply?.payload || '');
  const text = String(ev?.message?.text || '').trim();
  if (!payload && !text) return 'skip: no text (sticker/media)';
  // A tap on ANOTHER app's button (ManyChat's "Muéstrame" on the two ManyChat Reels) reaches us too: not ours, stay out.
  if (payload && !ICE_BREAKERS.some((b) => b.payload === payload)) return 'skip: another app\'s button';

  const s = load();
  const code = chatCode(s, opts.now);
  const day = (opts.now || new Date()).toISOString().slice(0, 10);
  const p = (s.people[from] ??= { day, count: 0, turns: [] });
  if (p.day !== day) { p.day = day; p.count = 0; }
  const cap = Number(process.env.IG_CHAT_MAX_PER_DAY || 12);
  if (p.count >= cap) { save(s); return 'skip: daily cap'; }

  let reply: string;
  let firstToday = p.count === 0;
  const ice = ICE_BREAKERS.find((b) => b.payload === payload);
  if (ice) {
    reply = ice.answer;
    firstToday = true; // a button is a fresh start: always show the doors
  } else {
    const history = p.turns.slice(-6).map((t) => `${t.role === 'them' ? 'Person' : 'EspaLuz'}: ${t.text}`).join('\n');
    const llm = opts.llm || completeWithProfile;
    reply = (await llm('quality', SYSTEM, `${history ? history + '\n' : ''}Person: ${text}\nEspaLuz:`, 400, 'ig-dm/chat')).trim();
    reply = reply.replace(/https?:\/\/\S+/g, '').trim(); // links come only from doors(), never from a model
    if (!reply) return 'skip: model returned nothing';
  }
  const wantsDoors = firstToday || /\b(start|empezar|empiezo|link|enlace|whatsapp|app|telegram|probar|try|начать|ссылк)/i.test(text);
  const out = `${reply}${wantsDoors ? `\n\n${doors(code)}` : ''}`.slice(0, 990);

  const r = await send(from, out);
  p.count++;
  p.turns.push({ role: 'them', text: (text || payload).slice(0, 300) }, { role: 'espaluz', text: reply.slice(0, 300) });
  p.turns = p.turns.slice(-12);
  save(s);
  const line = `[ig-chat] ${ice ? `ice ${ice.payload}` : 'message'} -> reply ${r.status}${r.ok ? '' : ' ' + r.text}${wantsDoors ? ' +doors' : ''}`;
  console.log(line);
  return line;
}
