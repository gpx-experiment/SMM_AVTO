// Продления полисов: страховка заканчивается в известный день, поэтому напоминание за 30 дней — самая дешёвая заявка.
import type { Renewal } from "@prisma/client";
import { db } from "./db";

/** 0501234567, 501234567, +994 50 123 45 67 -> 994501234567 */
export function normalizePhone(raw: string) {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10 && d.startsWith("0")) return `994${d.slice(1)}`;
  if (d.length === 9) return `994${d}`;
  return d;
}

/** 31.12.2026, 31/12/2026 или 2026-12-31 */
export function parseDate(raw: string): Date | null {
  const t = raw.trim();
  const m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  const d = m ? new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]))) : /^\d{4}-\d{2}-\d{2}$/.test(t) ? new Date(`${t}T00:00:00.000Z`) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/** Строки вида «Имя; телефон; продукт; авто; дата окончания» (разделитель ; или табуляция, продукт и авто можно пропустить) */
export function parseRenewals(text: string) {
  const rows: { name: string; phone: string; product: string; car: string; expiresAt: Date }[] = [], bad: string[] = [];
  for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const p = line.split(/[;\t]/).map((x) => x.trim());
    const expiresAt = parseDate(p.at(-1) ?? "");
    const phone = normalizePhone(p[1] ?? "");
    if (p.length < 3 || !p[0] || phone.length < 9 || !expiresAt) { bad.push(line); continue; }
    rows.push({ name: p[0], phone, product: p.length > 3 ? p[2] || "İcbari" : "İcbari", car: p.length > 4 ? p[3] : "", expiresAt });
  }
  return { rows, bad };
}

export const daysLeft = (r: Pick<Renewal, "expiresAt">) => Math.ceil((r.expiresAt.getTime() - Date.now()) / 86400000);

/** Полисы, которые заканчиваются в ближайшие N дней (и уже просроченные до 14 дней), по которым ещё не написали */
export function dueRenewals(workspaceId: string, days: number) {
  return db.renewal.findMany({ where: { workspaceId, status: "active", expiresAt: { gte: new Date(Date.now() - 14 * 86400000), lte: new Date(Date.now() + days * 86400000) } }, orderBy: { expiresAt: "asc" } });
}

/** Готовое сообщение клиенту в WhatsApp на азербайджанском */
export function reminderLink(r: Pick<Renewal, "name" | "phone" | "product" | "car" | "expiresAt">) {
  const date = r.expiresAt.toLocaleDateString("ru-RU", { timeZone: "UTC" });
  const text = `Salam, ${r.name}! ${r.car ? `${r.car} üçün ` : ""}${r.product} sığortanızın müddəti ${date} tarixində bitir. Yeniləmək istəyirsinizsə yazın, onlayn rəsmiləşdirək.`;
  return `https://wa.me/${r.phone}?text=${encodeURIComponent(text)}`;
}
