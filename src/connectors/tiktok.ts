// TikTok: Login Kit + Display API (статистика), Content Posting API (публикация),
// Marketing API (реклама, отдельная авторизация через TikTok for Business).
// Пока приложение не прошло аудит TikTok, видео публикуются только как приватные (SELF_ONLY).
import { callbackUrl } from "@/lib/env";
import { http, type Connector, type Campaign } from "./types";

const OPEN = "https://open.tiktokapis.com/v2";
const ADS = "https://business-api.tiktok.com/open_api/v1.3";
const form = (p: Record<string, string>) => ({
  method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(p),
});

type Token = { access_token: string; refresh_token: string; expires_in: number; open_id: string };
const toSet = (t: Token) => ({ accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: new Date(Date.now() + t.expires_in * 1000) });

export const tiktok: Connector = {
  authUrl: (state) => `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY!, response_type: "code", state, redirect_uri: callbackUrl("tiktok"),
    scope: "user.info.basic,user.info.profile,user.info.stats,video.list,video.publish",
  })}`,

  async exchangeCode(code) {
    const t = await http<Token>(`${OPEN}/oauth/token/`, form({
      client_key: process.env.TIKTOK_CLIENT_KEY!, client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      code, grant_type: "authorization_code", redirect_uri: callbackUrl("tiktok"),
    }));
    const u = await http<{ data: { user: { open_id: string; display_name: string; avatar_url?: string } } }>(
      `${OPEN}/user/info/?fields=open_id,display_name,avatar_url`, { headers: { Authorization: `Bearer ${t.access_token}` } });
    return [{ provider: "tiktok", externalId: u.data.user.open_id, name: u.data.user.display_name, avatarUrl: u.data.user.avatar_url, ...toSet(t) }];
  },

  async refresh(refreshToken) {
    const t = await http<Token>(`${OPEN}/oauth/token/`, form({
      client_key: process.env.TIKTOK_CLIENT_KEY!, client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      grant_type: "refresh_token", refresh_token: refreshToken,
    }));
    return toSet(t);
  },

  async fetchDailyMetrics(_acc, token) {
    const auth = { Authorization: `Bearer ${token}` };
    const u = await http<{ data: { user: { follower_count: number } } }>(`${OPEN}/user/info/?fields=follower_count`, { headers: auth });
    type V = { create_time: number; view_count: number; like_count: number; comment_count: number; share_count: number };
    const v = await http<{ data: { videos: V[] } }>(`${OPEN}/video/list/?fields=create_time,view_count,like_count,comment_count,share_count`, {
      method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ max_count: 20 }),
    });
    // TikTok отдаёт накопленные значения по видео; дневную дельту считаем при сохранении снимков.
    const s = (f: (x: V) => number) => v.data.videos.reduce((a, x) => a + f(x), 0);
    return { followers: u.data.user.follower_count, views: s((x) => x.view_count), reach: 0, likes: s((x) => x.like_count),
      comments: s((x) => x.comment_count), shares: s((x) => x.share_count), saves: 0 };
  },

  async publish(_acc, token, post) {
    if (post.mediaType !== "video" || !post.mediaUrl) throw new Error("TikTok принимает только видео");
    const r = await http<{ data: { publish_id: string } }>(`${OPEN}/post/publish/video/init/`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        post_info: { title: post.caption.slice(0, 2200), privacy_level: process.env.TIKTOK_PRIVACY ?? "SELF_ONLY" },
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
    app_id: process.env.TIKTOK_ADS_APP_ID!, state, redirect_uri: callbackUrl("tiktok_ads"),
  })}`,

  async exchangeCode(code) {
    const r = await http<{ data: { access_token: string; advertiser_ids: string[] } }>(`${ADS}/oauth2/access_token/`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: process.env.TIKTOK_ADS_APP_ID, secret: process.env.TIKTOK_ADS_SECRET, auth_code: code }),
    });
    return r.data.advertiser_ids.map((id) => ({
      provider: "tiktok_ads" as const, externalId: id, name: `TikTok Ads ${id}`, accessToken: r.data.access_token, adAccountId: id,
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
