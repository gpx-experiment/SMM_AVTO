// Заявки: каждая новая переписка в Direct или Messenger становится карточкой. Заявки из WhatsApp и звонков добавляются вручную.
// Источник (идея таргетинга) определяется по коду вида S01 в сообщении клиента или выбирается на карточке.
import type { Lead } from "@prisma/client";
import { db } from "./db";
import { connectorFor, ref, tokenFor } from "@/connectors";
import { getSettings } from "./ai";
import { sendTelegram, telegramReady } from "./health";

export const SOURCES: Record<string, string> = { instagram: "Instagram Direct", messenger: "Messenger", whatsapp: "WhatsApp", phone: "Звонок", other: "Другое" };
export const STATUSES: [string, string, string][] = [
  ["new", "Новые", "Ответьте как можно быстрее"],
  ["quoted", "Цена названа", "Ждём решения клиента"],
  ["sold", "Продано", "Полис оформлен"],
  ["lost", "Отказ", "Не купили"],
];

/** Код идеи в тексте: «Kod: S02», «· S02» */
export const findCode = (text: string) => text.match(/\bS\d{2,3}\b/i)?.[0].toUpperCase() ?? null;

/** Собирает новые переписки. Возвращает число новых заявок и ошибки доступа. */
export async function syncLeads(workspaceId: string) {
  const s = await getSettings(workspaceId);
  // Первый сбор: считаем заявками только переписки за последние сутки, старые чаты страницы не трогаем
  const since = s.leadsSince ?? new Date(Date.now() - 86400000);
  if (!s.leadsSince) await db.aiSettings.update({ where: { workspaceId }, data: { leadsSince: since } });
  const pages = await db.account.findMany({ where: { workspaceId, hidden: false, provider: "facebook", NOT: { externalId: { startsWith: "ads:" } } } });
  const igs = await db.account.findMany({ where: { workspaceId, hidden: false, provider: "instagram" } });
  const own = [...pages.map((p) => p.externalId), ...igs.flatMap((i) => [i.externalId, i.name.replace(/^@/, "")])];
  const ideas = await db.adIdea.findMany({ where: { workspaceId }, select: { id: true, code: true, product: true } });
  const errors: string[] = [], fresh: Lead[] = [];
  for (const page of pages) {
    const c = connectorFor(page.provider);
    if (!c.fetchConversations) continue;
    for (const platform of ["instagram", "messenger"] as const) {
      if (platform === "instagram" && !igs.length) continue;
      try {
        for (const conv of await c.fetchConversations(ref(page), await tokenFor(page), platform, own)) {
          const existing = await db.lead.findFirst({ where: { workspaceId, source: platform, externalId: conv.id } });
          if (existing) {
            if (conv.updatedAt > existing.lastAt) await db.lead.update({ where: { id: existing.id }, data: { lastAt: conv.updatedAt, lastMessage: conv.lastText.slice(0, 500), waiting: conv.lastFromCustomer } });
            continue;
          }
          const first = conv.customerMessages.find((m) => m.at >= since);
          if (!first) continue; // человек не писал после начала учёта
          const code = conv.customerMessages.map((m) => findCode(m.text)).find(Boolean);
          const idea = ideas.find((i) => i.code === code);
          fresh.push(await db.lead.create({ data: { workspaceId, source: platform, externalId: conv.id, name: conv.name, contact: conv.name.startsWith("@") ? conv.name : "",
            product: idea?.product ?? "", ideaId: idea?.id ?? null, message: first.text.slice(0, 1000), lastMessage: conv.lastText.slice(0, 500), lastAt: conv.updatedAt, waiting: conv.lastFromCustomer } }));
        }
      } catch (e) {
        const msg = (e as Error).message;
        errors.push(/permission|\(#10\)|\(#200\)|OAuth/i.test(msg)
          ? `${SOURCES[platform]}: у приложения Meta нет доступа к перепискам. Добавьте разрешения ${platform === "instagram" ? "instagram_manage_messages и pages_manage_metadata" : "pages_messaging"} и переподключите Meta в «Аккаунтах»`
          : `${SOURCES[platform]}: ${msg.slice(0, 200)}`);
      }
    }
  }
  if (fresh.length && telegramReady()) {
    await sendTelegram(`🔔 Новых заявок: ${fresh.length}\n${fresh.map((l) => `• ${l.name} (${SOURCES[l.source]}): ${l.message.slice(0, 140)}`).join("\n")}`, [["Открыть заявки", "/leads"]]).catch(() => {});
  }
  return { added: fresh.length, errors };
}

/** Смена статуса: продажа прибавляет проданный полис идее-источнику, откат продажи убавляет */
export async function setLeadStatus(lead: Lead, status: string, amount?: number) {
  const wasSold = lead.status === "sold", isSold = status === "sold";
  await db.lead.update({ where: { id: lead.id }, data: { status, ...(isSold && amount != null ? { amount } : {}), ...(status !== "new" ? { waiting: false } : {}) } });
  if (lead.ideaId && wasSold !== isSold) {
    const idea = await db.adIdea.findUnique({ where: { id: lead.ideaId } });
    if (idea) await db.adIdea.update({ where: { id: idea.id }, data: { sales: Math.max(0, idea.sales + (isSold ? 1 : -1)) } });
  }
}

/** Привязка заявки к идее: проданная заявка переносит и проданный полис */
export async function setLeadIdea(lead: Lead, ideaId: string | null) {
  if (lead.ideaId === ideaId) return;
  if (lead.status === "sold") {
    for (const [id, delta] of [[lead.ideaId, -1], [ideaId, 1]] as const) {
      const idea = id ? await db.adIdea.findUnique({ where: { id } }) : null;
      if (idea) await db.adIdea.update({ where: { id: idea.id }, data: { sales: Math.max(0, idea.sales + delta) } });
    }
  }
  await db.lead.update({ where: { id: lead.id }, data: { ideaId } });
}

/** Ссылка, чтобы ответить клиенту */
export function replyLink(l: Pick<Lead, "source" | "contact">) {
  const digits = l.contact.replace(/\D/g, "");
  if ((l.source === "whatsapp" || l.source === "phone") && digits.length >= 9) return `https://wa.me/${digits}`;
  if (l.source === "instagram") return l.contact.startsWith("@") ? `https://ig.me/m/${l.contact.slice(1)}` : "https://www.instagram.com/direct/inbox/";
  if (l.source === "messenger") return "https://business.facebook.com/latest/inbox/all";
  return "";
}

