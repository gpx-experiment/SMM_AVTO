export type AuthProvider = "meta" | "tiktok" | "tiktok_ads" | "youtube";
export type AccountProvider = "instagram" | "facebook" | "tiktok" | "tiktok_ads" | "youtube";

/** Аккаунт, полученный после OAuth. Один вход Meta даёт сразу FB-страницы и IG-аккаунты. */
export interface ConnectedAccount {
  provider: AccountProvider;
  externalId: string;
  name: string;
  avatarUrl?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  adAccountId?: string;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export type DayStats = { date: string /* YYYY-MM-DD, UTC */; views?: number; likes: number; comments: number; shares: number };
export const dayKey = (d: Date) => d.toISOString().slice(0, 10);
/** Складывает показатели постов по дню публикации. */
export function byDay<T>(items: T[], date: (x: T) => Date, f: (x: T) => Omit<DayStats, "date">): DayStats[] {
  const m = new Map<string, DayStats>();
  for (const x of items) {
    const k = dayKey(date(x)); const v = f(x); const cur = m.get(k) ?? { date: k, views: 0, likes: 0, comments: 0, shares: 0 };
    cur.views = (cur.views ?? 0) + (v.views ?? 0); cur.likes += v.likes; cur.comments += v.comments; cur.shares += v.shares; m.set(k, cur);
  }
  return [...m.values()];
}

export interface DailyMetrics {
  followers: number;
  views: number;
  reach: number;
  likes: number;
  dislikes?: number;
  comments: number;
  shares: number;
  saves: number;
}

export interface PublishInput {
  caption: string;
  mediaUrl?: string | null;
  mediaType: string; // image | video
}

export interface Campaign {
  id: string;
  name: string;
  status: "ACTIVE" | "PAUSED" | string;
  dailyBudget?: number; // в валюте кабинета (не в копейках)
  spend?: number;
  impressions?: number;
  clicks?: number;
  targeting?: Targeting;
  objective?: Objective;
  /** Заявки за 7 дней: начатые переписки (WhatsApp, Direct, Messenger) и лиды */
  leads?: number;
  /** Охват: сколько разных людей увидели (7 дней) */
  reach?: number;
  /** Переходы по ссылке (link_click, 7 дней) */
  linkClicks?: number;
  /** Просмотры целевой страницы (landing_page_view, 7 дней) */
  landingViews?: number;
  /** Начатые переписки: переходы в WhatsApp/Direct/Messenger (7 дней) */
  messaging?: number;
  /** Кампания нацелена на заявки (переписки, лиды, конверсии): её судят по цене заявки, а не по CTR */
  leadGoal?: boolean;
  /** Состояние показа: ACTIVE, PAUSED, IN_REVIEW, DISAPPROVED, WITH_ISSUES, NO_ADS... */
  delivery?: string;
  /** Где задан бюджет: на кампании или на группах объявлений */
  budgetLevel?: "campaign" | "adset";
}

/** Сводка рекламного кабинета за текущий месяц */
export interface AdsSummary { monthSpend: number; currency?: string; capLeft?: number }

/** Ссылка на аккаунт, с которым работает коннектор */
export interface AccountRef {
  provider: AccountProvider;
  externalId: string;
  adAccountId?: string | null;
}

export interface Connector {
  authUrl(state: string): string;
  exchangeCode(code: string): Promise<ConnectedAccount[]>;
  refresh?(refreshToken: string): Promise<TokenSet>;
  fetchDailyMetrics?(acc: AccountRef, token: string): Promise<DailyMetrics>;
  /** Вовлечённость по дням публикации за последние N дней (лайки, комментарии, репосты, а где есть и просмотры). */
  fetchHistory?(acc: AccountRef, token: string, days: number): Promise<DayStats[]>;
  publish?(acc: AccountRef, token: string, post: PublishInput): Promise<string>;
  ads?: AdsConnector;
  fetchComments?(acc: AccountRef, token: string): Promise<Comment[]>;
  replyComment?(acc: AccountRef, token: string, commentId: string, text: string): Promise<void>;
  /** Последние переписки страницы (Messenger) или привязанного Instagram. acc — Facebook-страница, token — её токен */
  fetchConversations?(acc: AccountRef, token: string, platform: "instagram" | "messenger", own: string[]): Promise<Conversation[]>;
}

/** Аудитория рекламы */
export interface Targeting {
  countries: string[]; // ISO-коды: AZ, TR, RU...
  ageMin: number;
  ageMax: number;
  gender: "all" | "male" | "female";
  interests: { id: string; name: string }[];
}

export type Objective = "engagement" | "traffic" | "sales" | "messages";
/** Куда ведёт кампания «Сообщения» */
export type MessageChannel = "whatsapp" | "instagram" | "messenger";

export interface CampaignInput {
  name: string;
  dailyBudget: number;
  objective?: Objective;
  /** Одна аудитория = обычная кампания; несколько = тест аудиторий (отдельная группа на каждую) */
  audiences?: (Targeting & { label?: string; customAudienceIds?: string[] })[];
  pixelId?: string;
  link?: string;
  /** Для цели «Сообщения»: Facebook-страница и канал переписки */
  pageId?: string;
  messageChannel?: MessageChannel;
}

/** Объявления для кампании «Сообщения»: картинка, тексты и подсказки первого сообщения */
export interface AdsInput {
  campaignId: string;
  pageId: string;
  igId?: string;
  messageChannel: MessageChannel;
  imageUrl: string;
  texts: string[];
  /** Приветствие и готовые вопросы в переписке: по ним видно, с какого объявления пришёл человек */
  greeting?: string;
  iceBreakers?: string[];
}

/** Переписка из Direct или Messenger */
export interface Conversation { id: string; platform: "instagram" | "messenger"; name: string; updatedAt: Date; firstText: string; lastText: string; lastFromCustomer: boolean; customerMessages: { text: string; at: Date }[] }

export interface Comment { id: string; author: string; text: string; createdAt: Date; postCaption: string }

export interface Interest { id: string; name: string; audienceSize?: number; path?: string }

export interface AdsConnector {
  /** Поиск интересов для таргетинга */
  searchInterests?(acc: AccountRef, token: string, q: string): Promise<Interest[]>;
  listCampaigns(acc: AccountRef, token: string): Promise<Campaign[]>;
  setStatus(acc: AccountRef, token: string, campaignId: string, active: boolean): Promise<void>;
  setDailyBudget(acc: AccountRef, token: string, campaignId: string, budget: number): Promise<void>;
  createCampaign(acc: AccountRef, token: string, input: CampaignInput): Promise<string>;
  /** Ретаргетинг: аудитория людей, взаимодействовавших с профилем/страницей */
  createEngagementAudience?(acc: AccountRef, token: string, sources: { igId?: string; pageId?: string }, days: number): Promise<string>;
  /** Похожая аудитория */
  createLookalike?(acc: AccountRef, token: string, originAudienceId: string, country: string, ratio: number): Promise<string>;
  /** Готовые объявления в группах кампании: по одному на каждый текст. Возвращает число созданных объявлений */
  createAds?(acc: AccountRef, token: string, input: AdsInput): Promise<number>;
  /** Расход кабинета за текущий месяц и остаток лимита затрат */
  summary?(acc: AccountRef, token: string): Promise<AdsSummary>;
}

export async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(`${res.status} ${url.split("?")[0]}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  return body as T;
}
