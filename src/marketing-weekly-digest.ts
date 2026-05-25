/**
 * Phase 3: weekly Telegram summary of aideazz.xyz inbound inquiries (Oracle business_leads).
 */
import * as cron from "node-cron";
import { getLeadsSinceForDigest } from "./database";

async function sendTelegramDigest(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId =
    process.env.TELEGRAM_LEADS_DIGEST_CHAT_ID?.trim() ||
    (process.env.TELEGRAM_DAILY_BLOG_NOTIFY_CHAT_ID ?? process.env.TELEGRAM_HASHNODE_NOTIFY_CHAT_ID)?.trim();
  if (!token || !chatId) {
    console.warn("📣 Weekly digest: missing TELEGRAM_BOT_TOKEN or chat id");
    return;
  }
  const max = 4090;
  const chunk = text.length > max ? `${text.slice(0, max)}\n…` : text;
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: true,
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error("📣 Telegram digest failed:", r.status, t);
  }
}

export async function runWeeklyMarketingDigest(): Promise<void> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await getLeadsSinceForDigest(since, "aideazz_inquiry");
  if (rows.length === 0) {
    // MAY 25 2026: silent skip — empty inbound is not a signal worth surfacing.
    // Lead activity flows into HubSpot now (May 24 wiring), not business_leads.
    // If you want a non-empty inbound, check HubSpot or trigger via the form.
    console.log("📣 Weekly marketing digest: 0 inquiries in last 7d — Telegram SUPPRESSED");
    return;
  }
  let body = `📋 AIdeazz inbound (last 7 days) — ${rows.length} new\n\n`;
  let i = 0;
  for (const r of rows) {
    i += 1;
    const u = [r.utm_source, r.utm_medium, r.utm_campaign].filter(Boolean).join(" / ");
    const ctx = (r.context || "").replace(/\s+/g, " ").slice(0, 400);
    body += `${i}. ${r.name || "?"}${r.contact_email ? ` <${r.contact_email}>` : ""}\n`;
    if (u) body += `   UTM: ${u}\n`;
    if (ctx) body += `   “${ctx}”\n`;
    if (r.page_url) body += `   ${r.page_url}\n`;
    body += "\n";
  }
  await sendTelegramDigest(body);
}

export function startMarketingWeeklyDigest(): void {
  if (process.env.MARKETING_LEADS_DIGEST_ENABLED === "false") {
    console.log("📣 Marketing weekly digest: disabled (MARKETING_LEADS_DIGEST_ENABLED=false)");
    return;
  }
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId =
    process.env.TELEGRAM_LEADS_DIGEST_CHAT_ID?.trim() ||
    (process.env.TELEGRAM_DAILY_BLOG_NOTIFY_CHAT_ID ?? process.env.TELEGRAM_HASHNODE_NOTIFY_CHAT_ID)?.trim();
  if (!token || !chatId) {
    console.log(
      "📣 Marketing weekly digest: skip (set TELEGRAM_LEADS_DIGEST_CHAT_ID or TELEGRAM_HASHNODE_NOTIFY_CHAT_ID + TELEGRAM_BOT_TOKEN)"
    );
    return;
  }
  const cronExpr = process.env.MARKETING_LEADS_DIGEST_CRON || "0 9 * * 1";
  const tz = process.env.MARKETING_LEADS_DIGEST_TZ || "UTC";
  cron.schedule(
    cronExpr,
    async () => {
      try {
        await runWeeklyMarketingDigest();
      } catch (e) {
        console.error("📣 Weekly digest error:", e);
      }
    },
    { timezone: tz }
  );
  console.log(`📣 Marketing weekly digest scheduled: ${cronExpr} (${tz})`);
}
