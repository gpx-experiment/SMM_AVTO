// Заполняет 30 дней тестовой истории метрик для демо-аккаунтов (только демо-режим).
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const base = { instagram: 1, facebook: 0.6, tiktok: 2.5, youtube: 1.4 };
const accounts = await db.account.findMany({ where: { externalId: { startsWith: "demo-" } } });
for (const a of accounts) {
  const k = base[a.provider]; if (!k) continue;
  for (let i = 30; i >= 1; i--) {
    const date = new Date(); date.setUTCHours(0, 0, 0, 0); date.setUTCDate(date.getUTCDate() - i);
    const views = Math.round((4000 + (30 - i) * 120 + Math.random() * 2500) * k);
    const m = { followers: Math.round(12000 * k + (30 - i) * 40 * k), views, reach: Math.round(views * 0.7), likes: Math.round(views * 0.06),
      comments: Math.round(views * 0.006), shares: Math.round(views * 0.004), saves: Math.round(views * 0.003), dislikes: a.provider === "youtube" ? Math.round(views * 0.002) : null };
    await db.metricSnapshot.upsert({ where: { accountId_date: { accountId: a.id, date } }, create: { accountId: a.id, date, ...m }, update: m });
  }
}
console.log("seeded", accounts.length);
await db.$disconnect();
