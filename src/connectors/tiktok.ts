// TikTok: Login Kit + Display API (статистика), Content Posting API (публикация),
// Marketing API (реклама, отдельная авторизация через TikTok for Business).
// Пока приложение не прошло аудит TikTok, видео публикуются только как приватные (SELF_ONLY).
import { callbackUrl, env } from "@/lib/env";
import { http, byDay, type Connector, type Campaign } from "./types";

const OPEN = "https://open.tiktokapis.com/v2";
const ADS = "https://business-api.tiktok.com/open_api/v1.3";
const form = (p: Record<string, string>) => ({
  method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(p),
});

type Token = { access_token: string; refresh_token: string; expires_in: number; open_id: string; error?: string; error_description?: string };
const toSet = (t: Token) => ({ accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: new Date(Date.now() + t.expires_in * 1000) });

export const tiktok: Connector = {
  authUrl: (state) => `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams({
    client_key: env("TIKTOK_CLIENT_KEY"), response_type: "code", state, redirect_uri: callbackUrl("tiktok"),
    scope: "user.info.basic,user.info.profile,user.info.stats,video.list,video.publish",
  })}`,

  async exchangeCode(code) {
    const t = await http<Token>(`${OPEN}/oauth/token/`, form({
      client_key: env("TIKTOK_CLIENT_KEY"), client_secret: env("TIKTOK_CLIENT_SECRET"),
      code, grant_type: "authorization_code", redirect_uri: callbackUrl("tiktok"),
    }));
    // TikTok отвечает 200 даже при ошибке: проверяем тело, чтобы показать понятную причину.
    if (!t.access_token) throw new Error(`TikTok: ${t.error_description || t.error || "не выдал токен"}. Проверьте Client Key/Secret и Redirect URI.`);
    const u = await http<{ data: { user: { open_id: string; display_name: string; avatar_url?: string } } }>(
      `${OPEN}/user/info/?fields=open_id,display_name,avatar_url`, { headers: { Authorization: `Bearer ${t.access_token}` } });
    return [{ provider: "tiktok", externalId: u.data.user.open_id, name: u.data.user.display_name, avatarUrl: u.data.user.avatar_url, ...toSet(t) }];
  },

  async refresh(refreshToken) {
    const t = await http<Token>(`${OPEN}/oauth/token/`, form({
      client_key: env("TIKTOK_CLIENT_KEY"), client_secret: env("TIKTOK_CLIENT_SECRET"),
      grant_type: "refresh_token", refresh_token: refreshToken,
    }));
    if (!t.access_token) throw new Error(`TikTok: ${t.error_description || t.error || "не обновил токен"}`);
    return toSet(t);
  },

  async fetchDailyMetrics(_acc, token) {
    // Подписчики; просмотры и вовлечённость по дням публикации даёт fetchHistory.
    const u = await http<{ data: { user: { follower_count: number } } }>(`${OPEN}/user/info/?fields=follower_count`, { headers: { Authorization: `Bearer ${token}` } });
    return { followers: u.data.user.follower_count, views: 0, reach: 0, likes: 0, comments: 0, shares: 0, saves: 0 };
  },

  async fetchHistory(_acc, token, days) {
    type V = { create_time: number; view_count: number; like_count: number; comment_count: number; share_count: number };
    const from = Math.floor(Date.now() / 1000) - days * 86400;
    const videos: V[] = [];
    for (let cursor: number | undefined, i = 0; i < 10; i++) {
      const r = await http<{ data: { videos: V[]; cursor?: number; has_more?: boolean } }>(`${OPEN}/video/list/?fields=create_time,view_count,like_count,comment_count,share_count`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ max_count: 20, ...(cursor ? { cursor } : {}) }),
      });
      videos.push(...r.data.videos.filter((v) => v.create_time >= from));
      if (!r.data.has_more || r.data.videos.some((v) => v.create_time < from)) break;
      cursor = r.data.cursor;
    }
    return byDay(videos, (v) => new Date(v.create_time * 1000), (v) => ({ views: v.view_count, likes: v.like_count, comments: v.comment_count, shares: v.share_count }));
  },

  async publish(_acc, token, post) {
    if (post.mediaType !== "video" || !post.mediaUrl) throw new Error("TikTok принимает только видео");
    const r = await http<{ data: { publish_id: string } }>(`${OPEN}/post/publish/video/init/`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        post_info: { title: post.caption.slice(0, 2200), privacy_level: (env("TIKTOK_PRIVACY") || "SELF_ONLY") },
        // PULL_FROM_URL требует подтверждённого домена в настройках приложения TikTok
        source_info: { source: "PULL_FROM_URL", video_url: post.mediaUrl },
      }),
    });
    return r.data.publish_id;
  },
};

// Реклама TikTok: отдельное приложение TikTok for Business, токен без срока действия.
export const tiktokAds: Connector = {
  authUrl: (state) => `https://business-api.tiktok.com/portal/auth?${new URLSearchParams({
    app_id: env("TIKTOK_ADS_APP_ID"), state, redirect_uri: callbackUrl("tiktok_ads"),
  })}`,

  async exchangeCode(code) {
    const r = await http<{ code?: number; message?: string; data?: { access_token: string; advertiser_ids: string[] } }>(`${ADS}/oauth2/access_token/`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: env("TIKTOK_ADS_APP_ID"), secret: env("TIKTOK_ADS_SECRET"), auth_code: code }),
    });
    if (!r.data?.access_token) throw new Error(`TikTok Ads: ${r.message || "не выдал токен"}. Проверьте App ID/Secret и Redirect URI.`);
    const { access_token, advertiser_ids } = r.data;
    return advertiser_ids.map((id) => ({
      provider: "tiktok_ads" as const, externalId: id, name: `TikTok Ads ${id}`, accessToken: access_token, adAccountId: id,
    }));
  },

  ads: {
    async listCampaigns(acc, token): Promise<Campaign[]> {
      type C = { campaign_id: string; campaign_name: string; operation_status: string; budget?: number; budget_mode?: string };
      const r = await http<{ data: { list: C[] } }>(`${ADS}/campaign/get/?advertiser_id=${acc.adAccountId}&page_size=100`, { headers: { "Access-Token": token } });
      return r.data.list.map((c) => ({
        id: c.campaign_id, name: c.campaign_name, status: c.operation_status === "ENABLE" ? "ACTIVE" : "PAUSED",
        dailyBudget: c.budget_mode === "BUDGET_MODE_DAY" ? c.budget : undefined,
      }));
    },
    async setStatus(acc, token, id, active) {
      await http(`${ADS}/campaign/status/update/`, { method: "POST", headers: { "Access-Token": token, "Content-Type": "application/json" },
        body: JSON.stringify({ advertiser_id: acc.adAccountId, campaign_ids: [id], operation_status: active ? "ENABLE" : "DISABLE" }) });
    },
    async setDailyBudget(acc, token, id, budget) {
      await http(`${ADS}/campaign/update/`, { method: "POST", headers: { "Access-Token": token, "Content-Type": "application/json" },
        body: JSON.stringify({ advertiser_id: acc.adAccountId, campaign_id: id, budget }) });
    },
    async searchInterests(acc, token, q) {
      // Категории интересов TikTok: фильтруем по названию локально
      type C = { interest_category_id: string; interest_category_name: string; level: number };
      const r = await http<{ data: { interest_categories: C[] } }>(`${ADS}/tool/interest_category/?advertiser_id=${acc.adAccountId}&language=ru`, { headers: { "Access-Token": token } });
      const needle = q.toLowerCase();
      return r.data.interest_categories.filter((c) => c.interest_category_name.toLowerCase().includes(needle)).slice(0, 20)
        .map((c) => ({ id: c.interest_category_id, name: c.interest_category_name }));
    },
    // Аудитория TikTok задаётся в группе объявлений (ad group): сохраняется в кампании ИИ, создание ad group: следующий шаг.
    async createCampaign(acc, token, { name, dailyBudget, objective }) {
      const r = await http<{ data: { campaign_id: string } }>(`${ADS}/campaign/create/`, { method: "POST", headers: { "Access-Token": token, "Content-Type": "application/json" },
        body: JSON.stringify({ advertiser_id: acc.adAccountId, campaign_name: name, objective_type: objective === "traffic" ? "TRAFFIC" : objective === "sales" ? "WEB_CONVERSIONS" : "ENGAGEMENT", budget_mode: "BUDGET_MODE_DAY", budget: dailyBudget, operation_status: "DISABLE" }) });
      return r.data.campaign_id;
    },
  },
};
