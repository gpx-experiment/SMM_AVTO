import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = db;

/** MVP: один рабочий кабинет. Когда появится авторизация, брать из сессии пользователя. */
export async function currentWorkspace() {
  const ws = await db.workspace.findFirst();
  return ws ?? db.workspace.create({ data: { name: "Мой бренд" } });
}
