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
}

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
  publish?(acc: AccountRef, token: string, post: PublishInput): Promise<string>;
  ads?: AdsConnector;
  fetchComments?(acc: AccountRef, token: string): Promise<Comment[]>;
  replyComment?(acc: AccountRef, token: string, commentId: string, text: string): Promise<void>;
}

/** Аудитория рекламы */
export interface Targeting {
  countries: string[]; // ISO-коды: AZ, TR, RU...
  ageMin: number;
  ageMax: number;
  gender: "all" | "male" | "female";
  interests: { id: string; name: string }[];
}

export type Objective = "engagement" | "traffic" | "sales";

export interface CampaignInput {
  name: string;
  dailyBudget: number;
  objective?: Objective;
  /** Одна аудитория = обычная кампания; несколько = тест аудиторий (отдельная группа на каждую) */
  audiences?: (Targeting & { label?: string; customAudienceIds?: string[] })[];
  pixelId?: string;
  link?: string;
}

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
}

export async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(`${res.status} ${url.split("?")[0]}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  return body as T;
}
