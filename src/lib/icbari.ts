// İcbari через mygov: с одного кабинета можно оформить ограниченное число полисов за скользящий период (как на mygov), здесь считаем остаток.
import { db } from "./db";

export const MYGOV_URL = "https://my.gov.az/services/insurance-services?serviceLabel=IS";
export const ICBARI_FORM_URL = "https://insure.az/az/icbari"; // чистая форма İcbari (insure.az запрещает встраивание в iframe)
export const WINDOW_DAYS = 30; // скользящее окно mygov: место освобождается через 30 дней после полиса

/** Сколько полисов на кабинете попадает в скользящее окно на данный момент (новый полис сейчас не пройдёт, если это >= лимита) */
export function usedInWindow(issuedAts: Date[], now = new Date()) {
  const from = now.getTime() - WINDOW_DAYS * 86400000;
  return issuedAts.filter((d) => d.getTime() > from).length;
}

/** Когда на кабинете снова освободится место: 30 дней после самого раннего полиса из тех, что заняли лимит */
export function freesAt(issuedAts: Date[], limit: number, now = new Date()) {
  const inWin = issuedAts.filter((d) => d.getTime() > now.getTime() - WINDOW_DAYS * 86400000).sort((a, b) => a.getTime() - b.getTime());
  if (inWin.length < limit) return null;
  return new Date(inWin[inWin.length - limit].getTime() + WINDOW_DAYS * 86400000);
}

/** Кабинеты с занятыми местами в скользящем окне; сначала те, где свободно больше */
export async function accountsWithUsage(workspaceId: string) {
  const now = new Date();
  const from = new Date(now.getTime() - WINDOW_DAYS * 86400000);
  const accounts = await db.mygovAccount.findMany({
    where: { workspaceId },
    include: { policies: { where: { issuedAt: { gte: from } }, orderBy: { issuedAt: "desc" } } },
    orderBy: { createdAt: "asc" },
  });
  return accounts
    .map((a) => {
      const used = a.policies.length;
      return { ...a, used, left: Math.max(0, a.monthlyLimit - used), freesAt: freesAt(a.policies.map((p) => p.issuedAt), a.monthlyLimit, now) };
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || b.left - a.left);
}
