import { DEMO } from "@/lib/env";
import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { meta } from "./meta";
import { tiktok, tiktokAds } from "./tiktok";
import { youtube } from "./youtube";
import { demoConnector } from "./demo";
import type { AccountProvider, AuthProvider, Connector } from "./types";
import type { Account } from "@prisma/client";

const REAL: Record<AuthProvider, Connector> = { meta, tiktok, tiktok_ads: tiktokAds, youtube };

export const AUTH_PROVIDERS: { id: AuthProvider; label: string; covers: string }[] = [
  { id: "meta", label: "Meta", covers: "Instagram, Facebook и реклама Meta" },
  { id: "tiktok", label: "TikTok", covers: "Статистика и публикация видео" },
  { id: "tiktok_ads", label: "TikTok Ads", covers: "Рекламный кабинет TikTok" },
  { id: "youtube", label: "YouTube", covers: "Статистика (включая дизлайки) и загрузка видео" },
];

export function authConnector(p: AuthProvider): Connector {
  return DEMO ? demoConnector(p) : REAL[p];
}

const AUTH_OF: Record<AccountProvider, AuthProvider> = {
  instagram: "meta", facebook: "meta", tiktok: "tiktok", tiktok_ads: "tiktok_ads", youtube: "youtube",
};
export const connectorFor = (p: string) => authConnector(AUTH_OF[p as AccountProvider]);

/** Возвращает действующий токен аккаунта, обновляя его при необходимости. */
export async function tokenFor(acc: Account): Promise<string> {
  const c = connectorFor(acc.provider);
  const expiring = acc.tokenExpiresAt && acc.tokenExpiresAt.getTime() < Date.now() + 5 * 60_000;
  if (expiring && acc.refreshTokenEnc && c.refresh) {
    const t = await c.refresh(decrypt(acc.refreshTokenEnc));
    await db.account.update({ where: { id: acc.id }, data: {
      accessTokenEnc: encrypt(t.accessToken), tokenExpiresAt: t.expiresAt ?? null,
      ...(t.refreshToken ? { refreshTokenEnc: encrypt(t.refreshToken) } : {}),
    } });
    return t.accessToken;
  }
  return decrypt(acc.accessTokenEnc);
}

export const ref = (a: Account) => ({ provider: a.provider as AccountProvider, externalId: a.externalId, adAccountId: a.adAccountId });

/** Аккаунты, через которые можно управлять рекламой */
export const isAdsAccount = (a: Account) => (a.provider === "facebook" && a.externalId.startsWith("ads:")) || a.provider === "tiktok_ads";
