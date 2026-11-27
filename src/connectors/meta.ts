// Meta: Facebook Pages API, Instagram Graph API, Marketing API.
// Для чужих аккаунтов нужен App Review (pages_*, instagram_*, ads_management) и Business Verification.
// В режиме разработки работает без проверки для людей с ролью в приложении.
// Приложение типа «Бизнес» использует Facebook Login for Business: тогда задайте META_CONFIG_ID (ID конфигурации входа).
import { callbackUrl, env } from "@/lib/env";
import { http, byDay, type Connector, type ConnectedAccount, type DailyMetrics, type Campaign } from "./types";

// Действия, которые считаем заявкой: начатая переписка и лид (форма или пиксель)
const LEAD_ACTIONS = ["onsite_conversion.messaging_conversation_started_7d", "lead"];
const LEAD_GOALS = ["CONVERSATIONS", "LEAD_GENERATION", "QUALITY_LEAD", "OFFSITE_CONVERSIONS"];
const IN_REVIEW = ["PENDING_REVIEW", "IN_PROCESS", "PREAPPROVED", "PENDING_BILLING_INFO"];
type AdSetRow = { id: string; status: string; daily_budget?: string; optimization_goal?: string };

const V = (env("META_API_VERSION") || "v23.0");
const G = `https://graph.facebook.com/${V}`;
const SCOPES = [
  "pages_show_list", "pages_read_engagement", "pages_manage_posts", "read_insights",
  "instagram_basic", "instagram_content_publish", "instagram_manage_insights",
  "ads_management", "ads_read", "business_management",
].join(",");

const q_ = (p: Record<string, string | number>) => new URLSearchParams(Object.entries(p).map(([k, v]) => [k, String(v)])).toString();
/** Листает выдачу Graph API, пока записи не старше `from` (до 10 страниц). */
async function pages<T>(url: string, from: number, ts: (x: T) => string): Promise<T[]> {
  const out: T[] = [];
  for (let next: string | undefined = url, i = 0; next && i < 10; i++) {
    const r: { data: T[]; paging?: { next?: string } } = await http(next);
    out.push(...r.data.filter((x) => new Date(ts(x)).getTime() / 1000 >= from));
    if (r.data.some((x) => new Date(ts(x)).getTime() / 1000 < from)) break;
    next = r.paging?.next;
  }
  return out;
}
const since = () => Math.floor(Date.now() / 1000) - 86400;

type Page = {
  id: string; name: string; access_token: string; picture?: { data?: { url?: string } };
  instagram_business_account?: { id: string; username: string; profile_picture_url?: string };
};

export const meta: Connector = {
  authUrl: (state) =>
    `https://www.facebook.com/${V}/dialog/oauth?${q_({ client_id: env("META_APP_ID"), redirect_uri: callbackUrl("meta"), state, ...(env("META_CONFIG_ID") ? { config_id: env("META_CONFIG_ID") } : { scope: SCOPES }) })}`,

  async exchangeCode(code) {
    const base = { client_id: env("META_APP_ID"), client_secret: env("META_APP_SECRET") };
    const short = await http<{ access_token: string }>(`${G}/oauth/access_token?${q_({ ...base, redirect_uri: callbackUrl("meta"), code })}`);
    // Долгоживущий токен пользователя (~60 дней); токены страниц, полученные из него, не истекают.
    const long = await http<{ access_token: string; expires_in?: number }>(
      `${G}/oauth/access_token?${q_({ ...base, grant_type: "fb_exchange_token", fb_exchange_token: short.access_token })}`);
    const userToken = long.access_token;

    const ads = await http<{ data: { id: string }[] }>(`${G}/me/adaccounts?${q_({ fields: "id,name", access_token: userToken })}`).catch(() => ({ data: [] }));
    const adAccountId = ads.data[0]?.id; // act_123...

    const pages = await http<{ data: Page[] }>(`${G}/me/accounts?${q_({
      fields: "id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}",
      access_token: userToken,
    })}`);

    const out: ConnectedAccount[] = [];
    for (const p of pages.data) {
      // Рекламой управляем токеном пользователя, поэтому сохраняем его в отдельном поле через adAccountId-аккаунт.
      out.push({ provider: "facebook", externalId: p.id, name: p.name, avatarUrl: p.picture?.data?.url, accessToken: p.access_token, adAccountId });
      const ig = p.instagram_business_account;
      if (ig) out.push({ provider: "instagram", externalId: ig.id, name: `@${ig.username}`, avatarUrl: ig.profile_picture_url, accessToken: p.access_token, adAccountId });
    }
    if (adAccountId) {
      out.push({ provider: "facebook", externalId: `ads:${adAccountId}`, name: `Реклама ${adAccountId}`, accessToken: userToken, adAccountId,
        expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : undefined });
    }
    return out;
  },

  async fetchDailyMetrics(acc, token): Promise<DailyMetrics> {
    if (acc.provider === "instagram") {
      const prof = await http<{ followers_count: number }>(`${G}/${acc.externalId}?${q_({ fields: "followers_count", access_token: token })}`);
      const ins = await http<{ data: { name: string; total_value?: { value: number } }[] }>(`${G}/${acc.externalId}/insights?${q_({
        metric: "reach,views,likes,comments,shares,saves", period: "day", metric_type: "total_value",
        since: since(), until: Math.floor(Date.now() / 1000), access_token: token,
      })}`);
      const v = (n: string) => ins.data.find((m) => m.name === n)?.total_value?.value ?? 0;
      return { followers: prof.followers_count, views: v("views"), reach: v("reach"), likes: v("likes"), comments: v("comments"), shares: v("shares"), saves: v("saves") };
    }
    // Facebook-страница: подписчики; реакции/комментарии/репосты по дням даёт fetchHistory.
    const page = await http<{ followers_count?: number }>(`${G}/${acc.externalId}?${q_({ fields: "followers_count", access_token: token })}`);
    return { followers: page.followers_count ?? 0, views: 0, reach: 0, saves: 0, likes: 0, comments: 0, shares: 0 };
  },

  async fetchHistory(acc, token, days) {
    const from = Math.floor(Date.now() / 1000) - days * 86400;
    if (acc.provider === "instagram") {
      type M = { timestamp: string; like_count?: number; comments_count?: number };
      const items = await pages<M>(`${G}/${acc.externalId}/media?${q_({ fields: "timestamp,like_count,comments_count", since: from, limit: 100, access_token: token })}`, from, (m) => m.timestamp);
      return byDay(items, (m) => new Date(m.timestamp), (m) => ({ likes: m.like_count ?? 0, comments: m.comments_count ?? 0, shares: 0 }));
    }
    type P = { created_time: string; reactions?: { summary: { total_count: number } }; comments?: { summary: { total_count: number } }; shares?: { count: number } };
    const items = await pages<P>(`${G}/${acc.externalId}/posts?${q_({
      fields: "created_time,reactions.summary(true).limit(0),comments.summary(true).limit(0),shares", since: from, limit: 100, access_token: token })}`, from, (p) => p.created_time);
    return byDay(items, (p) => new Date(p.created_time), (p) => ({
      likes: p.reactions?.summary.total_count ?? 0, comments: p.comments?.summary.total_count ?? 0, shares: p.shares?.count ?? 0 }));
  },

  async publish(acc, token, post) {
    if (!post.mediaUrl && acc.provider === "instagram") throw new Error("Instagram требует фото или видео");
    if (acc.provider === "instagram") {
      const isVideo = post.mediaType === "video";
      const c = await http<{ id: string }>(`${G}/${acc.externalId}/media`, { method: "POST", body: new URLSearchParams({
        caption: post.caption, access_token: token,
        ...(isVideo ? { media_type: "REELS", video_url: post.mediaUrl! } : { image_url: post.mediaUrl! }),
      }) });
      // Видео обрабатывается асинхронно: ждём FINISHED
      for (let i = 0; isVideo && i < 30; i++) {
        const s = await http<{ status_code: string }>(`${G}/${c.id}?${q_({ fields: "status_code", access_token: token })}`);
        if (s.status_code === "FINISHED") break;
        if (s.status_code === "ERROR") throw new Error("Instagram не смог обработать видео");
        await new Promise((r) => setTimeout(r, 5000));
      }
      const pub = await http<{ id: string }>(`${G}/${acc.externalId}/media_publish`, { method: "POST", body: new URLSearchParams({ creation_id: c.id, access_token: token }) });
      return pub.id;
    }
    const edge = !post.mediaUrl ? "feed" : post.mediaType === "video" ? "videos" : "photos";
    const body: Record<string, string> = { access_token: token };
    if (edge === "feed") body.message = post.caption;
    if (edge === "photos") Object.assign(body, { url: post.mediaUrl!, caption: post.caption });
    if (edge === "videos") Object.assign(body, { file_url: post.mediaUrl!, description: post.caption });
    const r = await http<{ id: string; post_id?: string }>(`${G}/${acc.externalId}/${edge}`, { method: "POST", body: new URLSearchParams(body) });
    return r.post_id ?? r.id;
  },

  async fetchComments(acc, token) {
    if (acc.externalId.startsWith("ads:")) return [];
    if (acc.provider === "instagram") {
      type M = { caption?: string; comments?: { data: { id: string; text: string; username: string; timestamp: string }[] } };
      const r = await http<{ data: M[] }>(`${G}/${acc.externalId}/media?${q_({ fields: "caption,comments.limit(25){id,text,username,timestamp}", limit: 10, access_token: token })}`);
      return r.data.flatMap((m) => (m.comments?.data ?? []).map((c) => ({ id: c.id, author: c.username, text: c.text, createdAt: new Date(c.timestamp), postCaption: m.caption ?? "" })));
    }
    type P = { message?: string; comments?: { data: { id: string; message: string; from?: { name: string }; created_time: string }[] } };
    const r = await http<{ data: P[] }>(`${G}/${acc.externalId}/posts?${q_({ fields: "message,comments.limit(25){id,message,from,created_time}", limit: 10, access_token: token })}`);
    return r.data.flatMap((p) => (p.comments?.data ?? []).map((c) => ({ id: c.id, author: c.from?.name ?? "Пользователь", text: c.message, createdAt: new Date(c.created_time), postCaption: p.message ?? "" })));
  },

  async replyComment(acc, token, commentId, text) {
    const edge = acc.provider === "instagram" ? "replies" : "comments";
    await http(`${G}/${commentId}/${edge}`, { method: "POST", body: new URLSearchParams({ message: text, access_token: token }) });
  },

  ads: {
    async listCampaigns(acc, token): Promise<Campaign[]> {
      type Row = { id: string; name: string; status: string; effective_status?: string; objective?: string; daily_budget?: string;
        adsets?: { data: AdSetRow[] }; ads?: { data: { effective_status: string }[] };
        insights?: { data: { spend?: string; impressions?: string; clicks?: string; actions?: { action_type: string; value: string }[] }[] } };
      const r = await http<{ data: Row[] }>(`${G}/${acc.adAccountId}/campaigns?${q_({
        fields: "id,name,status,effective_status,objective,daily_budget,adsets.limit(50){id,status,daily_budget,optimization_goal},ads.limit(50){effective_status},insights.date_preset(last_7d){spend,impressions,clicks,actions}",
        limit: 100, access_token: token,
      })}`);
      return r.data.map((c) => {
        const ins = c.insights?.data[0];
        const sets = c.adsets?.data ?? [], ads = c.ads?.data ?? [];
        // Бюджет бывает на кампании или на группах объявлений: во втором случае складываем активные группы
        const setBudget = sets.filter((s) => s.status === "ACTIVE" && s.daily_budget).reduce((x, s) => x + Number(s.daily_budget), 0);
        const budget = c.daily_budget ? Number(c.daily_budget) : setBudget;
        const leads = (ins?.actions ?? []).filter((a) => LEAD_ACTIONS.includes(a.action_type)).reduce((x, a) => x + Number(a.value), 0);
        let delivery = c.effective_status ?? c.status;
        if (delivery === "ACTIVE") {
          if (!ads.length) delivery = "NO_ADS";
          else if (ads.some((a) => a.effective_status === "DISAPPROVED")) delivery = "DISAPPROVED";
          else if (ads.some((a) => a.effective_status === "WITH_ISSUES")) delivery = "WITH_ISSUES";
          else if (ads.every((a) => IN_REVIEW.includes(a.effective_status))) delivery = "IN_REVIEW";
        }
        return {
          id: c.id, name: c.name, status: c.status, delivery, leads,
          leadGoal: ["OUTCOME_LEADS", "OUTCOME_SALES"].includes(c.objective ?? "") || sets.some((s) => LEAD_GOALS.includes(s.optimization_goal ?? "")),
          dailyBudget: budget ? budget / 100 : undefined, budgetLevel: c.daily_budget ? "campaign" as const : "adset" as const,
          spend: Number(ins?.spend ?? 0), impressions: Number(ins?.impressions ?? 0), clicks: Number(ins?.clicks ?? 0),
        };
      });
    },
    async summary(acc, token) {
      const a = await http<{ currency?: string; spend_cap?: string; amount_spent?: string }>(`${G}/${acc.adAccountId}?${q_({ fields: "currency,spend_cap,amount_spent", access_token: token })}`);
      const m = await http<{ data: { spend?: string }[] }>(`${G}/${acc.adAccountId}/insights?${q_({ fields: "spend", date_preset: "this_month", access_token: token })}`);
      const cap = Number(a.spend_cap ?? 0);
      return { monthSpend: Number(m.data[0]?.spend ?? 0), currency: a.currency, capLeft: cap > 0 ? (cap - Number(a.amount_spent ?? 0)) / 100 : undefined };
    },
    async setStatus(_acc, token, id, active) {
      await http(`${G}/${id}`, { method: "POST", body: new URLSearchParams({ status: active ? "ACTIVE" : "PAUSED", access_token: token }) });
    },
    async setDailyBudget(_acc, token, id, budget) {
      const c = await http<{ daily_budget?: string; adsets?: { data: AdSetRow[] } }>(`${G}/${id}?${q_({ fields: "daily_budget,adsets.limit(50){id,status,daily_budget}", access_token: token })}`);
      const post = (target: string, value: number) => http(`${G}/${target}`, { method: "POST", body: new URLSearchParams({ daily_budget: String(Math.round(value * 100)), access_token: token }) });
      if (c.daily_budget) { await post(id, budget); return; }
      // Бюджет на группах объявлений: делим новую сумму между активными группами в прежней пропорции
      const all = (c.adsets?.data ?? []).filter((s) => s.daily_budget);
      const sets = all.some((s) => s.status === "ACTIVE") ? all.filter((s) => s.status === "ACTIVE") : all;
      if (!sets.length) throw new Error("У кампании нет дневного бюджета: он задан как бюджет на весь срок, измените его в Ads Manager");
      const total = sets.reduce((x, s) => x + Number(s.daily_budget), 0);
      for (const s of sets) await post(s.id, budget * Number(s.daily_budget) / total);
    },
    async searchInterests(_acc, token, q) {
      const r = await http<{ data: { id: string; name: string; audience_size_lower_bound?: number; path?: string[] }[] }>(
        `${G}/search?${q_({ type: "adinterest", q, limit: 20, locale: "ru_RU", access_token: token })}`);
      return r.data.map((i) => ({ id: i.id, name: i.name, audienceSize: i.audience_size_lower_bound, path: i.path?.join(" › ") }));
    },
    async createCampaign(acc, token, input) {
      // Кампания с бюджетом на уровне кампании (Advantage+ budget). Группы объявлений создаются на каждую аудиторию:
      // одна аудитория = обычная кампания, несколько = тест аудиторий. Всё создаётся на паузе, креатив добавляется следующим шагом.
      const objective = input.objective ?? "engagement";
      const OBJ = { engagement: "OUTCOME_ENGAGEMENT", traffic: "OUTCOME_TRAFFIC", sales: "OUTCOME_SALES", messages: "OUTCOME_ENGAGEMENT" } as const;
      const GOAL = { engagement: "POST_ENGAGEMENT", traffic: "LINK_CLICKS", sales: "OFFSITE_CONVERSIONS", messages: "CONVERSATIONS" } as const;
      const DEST = { whatsapp: "WHATSAPP", instagram: "INSTAGRAM_DIRECT", messenger: "MESSENGER" } as const;
      if (objective === "sales" && !input.pixelId) throw new Error("Для цели «Продажи» укажите Meta Pixel в настройках ИИ-менеджера");
      if (objective === "messages" && !input.pageId) throw new Error("Для цели «Сообщения» нужна Facebook-страница: включите её в «Аккаунтах»");
      const r = await http<{ id: string }>(`${G}/${acc.adAccountId}/campaigns`, { method: "POST", body: new URLSearchParams({
        name: input.name, objective: OBJ[objective], status: "PAUSED", special_ad_categories: "[]",
        daily_budget: String(Math.round(input.dailyBudget * 100)), bid_strategy: "LOWEST_COST_WITHOUT_CAP", access_token: token,
      }) });
      for (const [i, a] of (input.audiences ?? []).entries()) {
        const t: Record<string, unknown> = {
          geo_locations: { countries: a.countries.length ? a.countries : ["AZ"] }, age_min: a.ageMin, age_max: a.ageMax,
        };
        if (a.gender !== "all") t.genders = [a.gender === "male" ? 1 : 2];
        if (a.interests.length) t.flexible_spec = [{ interests: a.interests }];
        if (a.customAudienceIds?.length) t.custom_audiences = a.customAudienceIds.map((id) => ({ id }));
        const body: Record<string, string> = {
          name: `${input.name}: ${a.label ?? `аудитория ${i + 1}`}`, campaign_id: r.id, status: "PAUSED",
          billing_event: "IMPRESSIONS", optimization_goal: GOAL[objective], targeting: JSON.stringify(t), access_token: token,
        };
        if (objective === "sales") body.promoted_object = JSON.stringify({ pixel_id: input.pixelId, custom_event_type: "PURCHASE" });
        // Переписки: заявка = начатый диалог в WhatsApp, Direct или Messenger (для WhatsApp номер должен быть привязан к странице)
        if (objective === "messages") Object.assign(body, { destination_type: DEST[input.messageChannel ?? "instagram"], promoted_object: JSON.stringify({ page_id: input.pageId }) });
        await http(`${G}/${acc.adAccountId}/adsets`, { method: "POST", body: new URLSearchParams(body) });
      }
      return r.id;
    },
    async createEngagementAudience(acc, token, sources, days) {
      const rules = [];
      const retention_seconds = days * 86400;
      if (sources.igId) rules.push({ event_sources: [{ id: sources.igId, type: "ig_business" }], retention_seconds,
        filter: { operator: "and", filters: [{ field: "event", operator: "eq", value: "ig_business_profile_all" }] } });
      if (sources.pageId) rules.push({ event_sources: [{ id: sources.pageId, type: "page" }], retention_seconds,
        filter: { operator: "and", filters: [{ field: "event", operator: "eq", value: "page_engaged" }] } });
      const r = await http<{ id: string }>(`${G}/${acc.adAccountId}/customaudiences`, { method: "POST", body: new URLSearchParams({
        name: `Вовлечённые ${days} дн.`, rule: JSON.stringify({ inclusions: { operator: "or", rules } }), access_token: token,
      }) });
      return r.id;
    },
    async createLookalike(acc, token, originAudienceId, country, ratio) {
      const r = await http<{ id: string }>(`${G}/${acc.adAccountId}/customaudiences`, { method: "POST", body: new URLSearchParams({
        name: `Look-alike ${Math.round(ratio * 100)}% ${country}`, subtype: "LOOKALIKE", origin_audience_id: originAudienceId,
        lookalike_spec: JSON.stringify({ type: "similarity", ratio, country }), access_token: token,
      }) });
      return r.id;
    },
  },
};
