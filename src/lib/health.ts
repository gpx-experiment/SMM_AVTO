// Сторож: собирает всё, что мешает рекламе работать (ключ ИИ, токены, зависшие кампании, лимит месяца, продления),
// и ежедневный отчёт для Telegram. Показывается на дашборде и уходит в Telegram, если задан бот.
import { db } from "./db";
import { APP_URL, DEMO, env } from "./env";
import { adsAccounts } from "./services";
import { getSettings, hasAiKey, NO_KEY } from "./ai";
import { connectorFor, ref, tokenFor } from "@/connectors";
import type { Campaign } from "@/connectors/types";
import { dueRenewals } from "./renewals";

export interface Alert { level: "red" | "amber"; text: string; href: string }
export const DELIVERY: Record<string, [string, "mint" | "amber" | "red" | "gray"]> = {
  ACTIVE: ["● Активна", "mint"], PAUSED: ["Пауза", "gray"], CAMPAIGN_PAUSED: ["Пауза", "gray"], IN_REVIEW: ["На модерации", "amber"], IN_PROCESS: ["Подготовка", "amber"],
  NO_ADS: ["Нет объявлений", "amber"], WITH_ISSUES: ["Есть проблемы", "red"], DISAPPROVED: ["Отклонена", "red"], ARCHIVED: ["В архиве", "gray"], DELETED: ["Удалена", "gray"],
};

export interface AdsOverview { campaigns: Campaign[]; spend: number; leads: number; clicks: number; impressions: number; monthSpend: number | null; capLeft: number | null; dailyTotal: number; errors: string[] }

/** Реклама всех кабинетов одной сводкой */
export async function adsOverview(workspaceId: string): Promise<AdsOverview> {
  const o: AdsOverview = { campaigns: [], spend: 0, leads: 0, clicks: 0, impressions: 0, monthSpend: null, capLeft: null, dailyTotal: 0, errors: [] };
  for (const a of await adsAccounts(workspaceId)) {
    try {
      const ads = connectorFor(a.provider).ads!, token = await tokenFor(a);
      o.campaigns.push(...await ads.listCampaigns(ref(a), token));
      const sum = await ads.summary?.(ref(a), token);
      if (sum) { o.monthSpend = (o.monthSpend ?? 0) + sum.monthSpend; if (sum.capLeft != null) o.capLeft = (o.capLeft ?? 0) + sum.capLeft; }
    } catch (e) { o.errors.push(`${a.name}: ${(e as Error).message}`); }
  }
  for (const c of o.campaigns) {
    o.spend += c.spend ?? 0; o.leads += c.leads ?? 0; o.clicks += c.clicks ?? 0; o.impressions += c.impressions ?? 0;
    if (c.status === "ACTIVE") o.dailyTotal += c.dailyBudget ?? 0;
  }
  return o;
}

export async function healthAlerts(workspaceId: string, ads?: AdsOverview): Promise<Alert[]> {
  const out: Alert[] = [];
  const s = await getSettings(workspaceId);
  if (!hasAiKey() && !DEMO) out.push({ level: "red", text: `${NO_KEY}. Посты и идеи ИИ не создаются, работают только автоправила`, href: "/ai" });
  const runs = await db.aiRun.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 3 });
  if (hasAiKey() && runs.length === 3 && runs.every((r) => r.status === "failed")) out.push({ level: "red", text: `ИИ-менеджер падает 3 запуска подряд: ${runs[0].error?.slice(0, 140) ?? "ошибка"}`, href: "/ai" });

  const week = Date.now() + 7 * 86400000;
  for (const a of await db.account.findMany({ where: { workspaceId, hidden: false, tokenExpiresAt: { not: null }, refreshTokenEnc: null } })) {
    const t = a.tokenExpiresAt!.getTime();
    if (t < Date.now()) out.push({ level: "red", text: `Доступ к «${a.name}» истёк: переподключите в «Аккаунтах»`, href: "/accounts" });
    else if (t < week) out.push({ level: "amber", text: `Доступ к «${a.name}» истекает ${a.tokenExpiresAt!.toLocaleDateString("ru-RU")}: переподключите заранее, иначе реклама перестанет управляться отсюда`, href: "/accounts" });
  }

  if (ads) {
    for (const e of ads.errors) out.push({ level: "red", text: `Рекламный кабинет не отвечает. ${e.slice(0, 160)}`, href: "/ads" });
    for (const c of ads.campaigns) {
      if (c.status !== "ACTIVE") continue;
      if (c.delivery === "DISAPPROVED" || c.delivery === "WITH_ISSUES") out.push({ level: "red", text: `Кампания «${c.name}»: ${DELIVERY[c.delivery][0].toLowerCase()}, показов нет. Откройте её в Ads Manager`, href: "/ads" });
      else if (c.delivery === "NO_ADS") out.push({ level: "amber", text: `Кампания «${c.name}» включена, но в ней нет объявлений`, href: "/ads" });
      else if (!c.impressions) out.push({ level: "amber", text: `Кампания «${c.name}» включена, но за 7 дней нет показов${c.delivery === "IN_REVIEW" ? " (на модерации)" : ""}`, href: "/ads" });
    }
    if (s.monthlyAdLimit > 0 && ads.monthSpend != null) {
      const left = s.monthlyAdLimit - ads.monthSpend;
      if (left <= 0) out.push({ level: "red", text: `Месячный лимит рекламы ${s.monthlyAdLimit} исчерпан: потрачено ${ads.monthSpend.toFixed(2)}`, href: "/ads" });
      else if (ads.monthSpend >= s.monthlyAdLimit * 0.8) out.push({ level: "amber", text: `Потрачено ${ads.monthSpend.toFixed(2)} из месячного лимита ${s.monthlyAdLimit}`, href: "/ads" });
      else if (ads.dailyTotal > 0 && left / ads.dailyTotal < daysLeftInMonth()) out.push({ level: "amber", text: `При бюджетах ${ads.dailyTotal.toFixed(2)}/день месячного лимита хватит на ${Math.floor(left / ads.dailyTotal)} дн., до конца месяца ${daysLeftInMonth()}`, href: "/ads" });
    }
  }
  const waiting = await db.lead.count({ where: { workspaceId, status: "new", waiting: true, lastAt: { lte: new Date(Date.now() - 15 * 60000) } } });
  if (waiting) out.push({ level: "red", text: `Заявки ждут ответа дольше 15 минут: ${waiting}`, href: "/leads" });
  const due = await dueRenewals(workspaceId, 7);
  if (due.length) out.push({ level: "amber", text: `Полисы заканчиваются в ближайшие 7 дней: ${due.length}. Напишите клиентам`, href: "/renewals" });
  return out;
}

const daysLeftInMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate() + 1; };

export const telegramReady = () => !!(env("TELEGRAM_BOT_TOKEN") && env("TELEGRAM_CHAT_ID"));

export async function sendTelegram(text: string, buttons: [string, string][] = []) {
  if (!telegramReady()) throw new Error("Не заданы TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в переменных Railway");
  // Кнопки-ссылки Telegram принимает только с https-адресом
  const rows = APP_URL.startsWith("https://") ? buttons.map(([label, path]) => [{ text: label, url: `${APP_URL}${path}` }]) : [];
  const res = await fetch(`https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: env("TELEGRAM_CHAT_ID"), text, disable_web_page_preview: true, ...(rows.length ? { reply_markup: { inline_keyboard: rows } } : {}) }),
  });
  if (!res.ok) throw new Error(`Telegram ответил ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/** Ежедневный отчёт: расход, заявки, цена заявки, что ждёт решения и что сломано */
export async function sendDailyReport(workspaceId: string) {
  const s = await getSettings(workspaceId);
  const ads = await adsOverview(workspaceId);
  const alerts = await healthAlerts(workspaceId, ads);
  const pending = await db.proposal.count({ where: { status: "pending", run: { workspaceId } } });
  const judged = await db.adIdea.findMany({ where: { workspaceId, status: { in: ["won", "lost"] } }, orderBy: { createdAt: "desc" }, take: 3 });
  const n = (x: number) => x.toFixed(2);
  const lines = [
    "📊 Реклама за 7 дней",
    `Расход: ${n(ads.spend)} · заявок: ${ads.leads} · цена заявки: ${ads.leads ? n(ads.spend / ads.leads) : "нет заявок"}`,
    `Показы: ${ads.impressions} · клики: ${ads.clicks} · CTR: ${ads.impressions ? n((ads.clicks / ads.impressions) * 100) : "0"}%`,
    ads.monthSpend != null ? `Месяц: ${n(ads.monthSpend)}${s.monthlyAdLimit ? ` из ${s.monthlyAdLimit}` : ""} · бюджеты: ${n(ads.dailyTotal)}/день` : "",
    ...ads.campaigns.filter((c) => c.status === "ACTIVE").map((c) => `• ${c.name}: ${n(c.spend ?? 0)}, заявок ${c.leads ?? 0}${c.leads ? ` по ${n((c.spend ?? 0) / c.leads)}` : ""}`),
    await leadsLine(workspaceId),
    pending ? `\n🟡 Ждут вашего решения: ${pending}` : "",
    judged.length ? `\n🧪 Идеи:\n${judged.map((i) => `• ${i.title}. ${i.verdict}`).join("\n")}` : "",
    alerts.length ? `\n⚠️ Требует внимания:\n${alerts.map((a) => `• ${a.text}`).join("\n")}` : "\n✅ Сбоев нет",
  ].filter(Boolean);
  await sendTelegram(lines.join("\n"), [["Открыть рекламу", "/ads"], ["Заявки", "/leads"], ...(pending ? [["Решения ИИ", "/ai"] as [string, string]] : []), ["Идеи", "/ideas"]]);
  await db.aiSettings.update({ where: { workspaceId }, data: { lastReportAt: new Date() } });
}

async function leadsLine(workspaceId: string) {
  const week = { workspaceId, createdAt: { gte: new Date(Date.now() - 7 * 86400000) } };
  const [all, sold] = [await db.lead.count({ where: week }), await db.lead.findMany({ where: { ...week, status: "sold" } })];
  return all ? `\n📥 Заявок в программе за 7 дней: ${all} · продано: ${sold.length}${sold.length ? ` · заработано: ${sold.reduce((x, l) => x + l.amount, 0).toFixed(2)}` : ""}` : "";
}

/** Пора ли слать отчёт: наступил заданный час по часовому поясу и сегодня ещё не слали */
export function reportDue(s: { reportHour: number; timezone: string; lastReportAt: Date | null }) {
  if (s.reportHour < 0 || !telegramReady()) return false;
  let hour: number;
  try { hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: s.timezone }).format(new Date())); }
  catch { hour = new Date().getUTCHours(); }
  return hour === s.reportHour && (!s.lastReportAt || Date.now() - s.lastReportAt.getTime() > 20 * 3600000);
}
