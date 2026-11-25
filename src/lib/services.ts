import { db } from "./db";
import { encrypt } from "./crypto";
import { connectorFor, isAdsAccount, ref, tokenFor } from "@/connectors";
import type { ConnectedAccount } from "@/connectors/types";
import { addUtm } from "./playbook";

export async function saveAccounts(workspaceId: string, list: ConnectedAccount[]) {
  for (const a of list) {
    const data = {
      name: a.name, avatarUrl: a.avatarUrl ?? null, adAccountId: a.adAccountId ?? null,
      accessTokenEnc: encrypt(a.accessToken), refreshTokenEnc: a.refreshToken ? encrypt(a.refreshToken) : null,
      tokenExpiresAt: a.expiresAt ?? null,
    };
    await db.account.upsert({
      where: { provider_externalId_workspaceId: { provider: a.provider, externalId: a.externalId, workspaceId } },
      create: { workspaceId, provider: a.provider, externalId: a.externalId, ...data },
      update: data,
    });
  }
}

const today = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; };

/** Собирает дневные метрики всех аккаунтов кабинета. */
export async function syncMetrics(workspaceId: string) {
  const accounts = await db.account.findMany({ where: { workspaceId, hidden: false } });
  const errors: string[] = [];
  for (const acc of accounts) {
    const c = connectorFor(acc.provider);
    if (!c.fetchDailyMetrics || isAdsAccount(acc)) continue;
    try {
      const m = await c.fetchDailyMetrics(ref(acc), await tokenFor(acc));
      await db.metricSnapshot.upsert({
        where: { accountId_date: { accountId: acc.id, date: today() } },
        create: { accountId: acc.id, date: today(), ...m }, update: m,
      });
      // Вовлечённость за 30 дней по дням публикации: сразу видна история и не задваиваются накопленные значения.
      if (c.fetchHistory) {
        const history = await c.fetchHistory(ref(acc), await tokenFor(acc), 30);
        // История — единственный источник вовлечённости за окно: обнуляем старые значения
        // (в т.ч. накопительные снимки прежних версий), иначе они задваиваются с историей.
        await db.metricSnapshot.updateMany({
          where: { accountId: acc.id, date: { gte: new Date(today().getTime() - 30 * 86400000) } },
          data: { likes: 0, comments: 0, shares: 0, ...(acc.provider === "tiktok" ? { views: 0 } : {}) },
        });
        for (const d of history) {
          const date = new Date(`${d.date}T00:00:00.000Z`);
          const eng = { likes: d.likes, comments: d.comments, shares: d.shares, ...(d.views !== undefined && acc.provider === "tiktok" ? { views: d.views } : {}) };
          await db.metricSnapshot.upsert({
            where: { accountId_date: { accountId: acc.id, date } },
            create: { accountId: acc.id, date, followers: m.followers, views: 0, reach: 0, saves: 0, ...eng }, update: eng,
          });
        }
      }
    } catch (e) {
      const msg = `${acc.provider} · ${acc.name}: ${(e as Error).message}`;
      console.error("[sync]", msg); // токены в текст не попадают: http() отрезает query-строку
      errors.push(msg);
    }
  }
  return errors;
}

/** Публикует пост во все выбранные аккаунты. */
export async function publishPost(postId: string) {
  const post = await db.post.findUniqueOrThrow({ where: { id: postId }, include: { targets: { include: { account: true } } } });
  await db.post.update({ where: { id: postId }, data: { status: "publishing" } });
  let failed = 0;
  for (const t of post.targets) {
    if (t.status === "published") continue;
    try {
      const c = connectorFor(t.account.provider);
      if (!c.publish) throw new Error("Публикация в эту сеть не поддерживается");
      // UTM-метка с источником = сетью, чтобы видеть в аналитике сайта, откуда пришли
      const caption = addUtm(post.caption, t.account.provider, `post_${post.id.slice(-6)}`);
      const externalId = await c.publish(ref(t.account), await tokenFor(t.account), { ...post, caption });
      await db.postTarget.update({ where: { id: t.id }, data: { status: "published", externalId, error: null } });
    } catch (e) {
      failed++;
      await db.postTarget.update({ where: { id: t.id }, data: { status: "failed", error: (e as Error).message } });
    }
  }
  await db.post.update({ where: { id: postId }, data: { status: failed ? "failed" : "published" } });
}

/** Публикует посты, у которых наступило время. Вызывается планировщиком. */
export async function publishDue() {
  const due = await db.post.findMany({ where: { status: "scheduled", scheduledAt: { lte: new Date() } } });
  for (const p of due) await publishPost(p.id);
  return due.length;
}

export async function adsAccounts(workspaceId: string) {
  return (await db.account.findMany({ where: { workspaceId, hidden: false } })).filter(isAdsAccount);
}
