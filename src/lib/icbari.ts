// İcbari через mygov: с одного кабинета можно оформить ограниченное число полисов в месяц, здесь считаем остаток.
import { db } from "./db";

export const MYGOV_URL = "https://my.gov.az/services/insurance-services?serviceLabel=IS";
const BAKU_OFFSET = 4 * 3600000; // Баку: UTC+4 круглый год

/** Начало текущего календарного месяца по бакинскому времени */
export function monthStart(now = new Date()) {
  const local = new Date(now.getTime() + BAKU_OFFSET);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - BAKU_OFFSET);
}

/** Кабинеты с числом полисов за текущий месяц; сначала те, где осталось больше мест */
export async function accountsWithUsage(workspaceId: string) {
  const since = monthStart();
  const accounts = await db.mygovAccount.findMany({
    where: { workspaceId },
    include: { policies: { where: { issuedAt: { gte: since } }, orderBy: { issuedAt: "desc" } } },
    orderBy: { createdAt: "asc" },
  });
  return accounts
    .map((a) => ({ ...a, used: a.policies.length, left: Math.max(0, a.monthlyLimit - a.policies.length) }))
    .sort((a, b) => Number(b.active) - Number(a.active) || b.left - a.left);
}
