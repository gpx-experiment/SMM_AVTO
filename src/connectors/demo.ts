// Демо-режим: те же интерфейсы, но без реальных API. Позволяет увидеть платформу до получения ключей.
import type { Connector, Campaign, AuthProvider, ConnectedAccount } from "./types";

const DEMO_ACCOUNTS: Record<AuthProvider, ConnectedAccount[]> = {
  meta: [
    { provider: "facebook", externalId: "demo-fb", name: "Demo Brand (Facebook)", accessToken: "demo", adAccountId: "act_demo" },
    { provider: "instagram", externalId: "demo-ig", name: "@demo.brand", accessToken: "demo", adAccountId: "act_demo" },
    { provider: "facebook", externalId: "ads:act_demo", name: "Реклама Meta (демо)", accessToken: "demo", adAccountId: "act_demo" },
  ],
  tiktok: [{ provider: "tiktok", externalId: "demo-tt", name: "demo.brand (TikTok)", accessToken: "demo" }],
  tiktok_ads: [{ provider: "tiktok_ads", externalId: "demo-tt-ads", name: "TikTok Ads demo", accessToken: "demo", adAccountId: "demo-tt-ads" }],
  youtube: [{ provider: "youtube", externalId: "demo-yt", name: "Demo Brand TV", accessToken: "demo" }],
};

const campaigns = new Map<string, Campaign[]>();
function list(adAccountId: string) {
  if (!campaigns.has(adAccountId)) {
    campaigns.set(adAccountId, [
      { id: `${adAccountId}-1`, name: "Продвижение Reels: новинка", status: "ACTIVE", dailyBudget: 20, spend: 96.4, impressions: 41200, clicks: 1310, leads: 38, leadGoal: true, delivery: "ACTIVE" },
      { id: `${adAccountId}-2`, name: "Охват: бренд", status: "PAUSED", dailyBudget: 10, spend: 35.1, impressions: 18800, clicks: 402, leads: 0, delivery: "PAUSED" },
      { id: `${adAccountId}-3`, name: "Баннер: холодная аудитория", status: "ACTIVE", dailyBudget: 8, spend: 41.7, impressions: 23400, clicks: 117, leads: 1, leadGoal: true, delivery: "ACTIVE" },
    ]);
  }
  return campaigns.get(adAccountId)!;
}

const INTERESTS = [
  ["6003139266461", "Фитнес и здоровье", 820_000_000], ["6003107902433", "Мода", 1_100_000_000], ["6003384248805", "Красота и косметика", 950_000_000],
  ["6003020834693", "Путешествия", 1_200_000_000], ["6003659420716", "Рестораны и кафе", 610_000_000], ["6003348604581", "Технологии", 900_000_000],
  ["6003277229526", "Малый бизнес", 380_000_000], ["6003456388203", "Автомобили", 700_000_000], ["6003397425735", "Недвижимость", 290_000_000],
  ["6003012317397", "Онлайн-шопинг", 1_000_000_000], ["6003304473660", "Автострахование", 120_000_000], ["6003176678152", "Такси", 210_000_000], ["6002991239659", "Материнство", 260_000_000], ["6003252179711", "Кулинария", 640_000_000],
] as const;

const DEMO_COMMENTS = [
  { author: "aysel_m", text: "Сколько стоит доставка в Гянджу?", postCaption: "Новая коллекция осень-зима" },
  { author: "rashad.k", text: "Очень красиво! 🔥", postCaption: "Новая коллекция осень-зима" },
  { author: "leyla_shop", text: "Заказала неделю назад, до сих пор нет ответа в директе 😡", postCaption: "3 ошибки при выборе продукта" },
  { author: "nigar.style", text: "А есть размер S в синем?", postCaption: "Новая коллекция осень-зима" },
];

const rnd = (min: number, max: number) => Math.round(min + Math.random() * (max - min));

export function demoConnector(auth: AuthProvider): Connector {
  return {
    authUrl: (state) => `/api/callback/${auth}?code=demo&state=${state}`,
    exchangeCode: async () => DEMO_ACCOUNTS[auth],
    refresh: async () => ({ accessToken: "demo", expiresAt: new Date(Date.now() + 86400000) }),
    fetchDailyMetrics: async (acc) => {
      const base = { instagram: 1, facebook: 0.6, tiktok: 2.5, youtube: 1.4, tiktok_ads: 0 }[acc.provider];
      const views = rnd(3000, 9000) * base;
      return {
        followers: Math.round(12000 * base) + rnd(0, 300), views: Math.round(views), reach: Math.round(views * 0.7),
        likes: Math.round(views * 0.06), comments: Math.round(views * 0.006), shares: Math.round(views * 0.004),
        saves: Math.round(views * 0.003), dislikes: acc.provider === "youtube" ? Math.round(views * 0.002) : undefined,
      };
    },
    publish: async () => `demo-${Date.now()}`,
    fetchComments: async (acc) => !["instagram", "facebook"].includes(acc.provider) || acc.externalId.startsWith("ads:") ? [] : DEMO_COMMENTS.map((c, i) => ({ ...c, id: `${acc.externalId}-c${i}`, createdAt: new Date(Date.now() - (i + 1) * 3600_000) })),
    replyComment: async () => {},
    fetchConversations: async (_a, _t, platform) => platform !== "instagram" ? [] : [
      { id: "demo-conv-1", platform, name: "@elvin.m", updatedAt: new Date(), firstText: "Salam, İcbari neçəyədir? Toyota Prius 2014 · S01", lastText: "Salam, İcbari neçəyədir? Toyota Prius 2014 · S01", lastFromCustomer: true, customerMessages: [{ text: "Salam, İcbari neçəyədir? Toyota Prius 2014 · S01", at: new Date() }] },
      { id: "demo-conv-2", platform, name: "@aysel_k", updatedAt: new Date(), firstText: "KASKO haqqında məlumat ala bilərəm?", lastText: "KASKO haqqında məlumat ala bilərəm?", lastFromCustomer: true, customerMessages: [{ text: "KASKO haqqında məlumat ala bilərəm?", at: new Date() }] },
    ],
    ads: {
      searchInterests: async (_a, _t, q) => INTERESTS.filter(([, n]) => n.toLowerCase().includes(q.toLowerCase()))
        .map(([id, name, audienceSize]) => ({ id, name, audienceSize })),
      listCampaigns: async (acc) => list(acc.adAccountId!),
      summary: async (acc) => ({ monthSpend: list(acc.adAccountId!).reduce((s, c) => s + (c.spend ?? 0), 0) * 2.1, currency: "USD" }),
      setStatus: async (acc, _t, id, active) => { const c = list(acc.adAccountId!).find((x) => x.id === id); if (c) c.status = active ? "ACTIVE" : "PAUSED"; },
      setDailyBudget: async (acc, _t, id, b) => { const c = list(acc.adAccountId!).find((x) => x.id === id); if (c) c.dailyBudget = b; },
      createAds: async (acc, _t, input) => { const c = list(acc.adAccountId!).find((x) => x.id === input.campaignId); if (c) c.delivery = "PAUSED"; return input.texts.length; },
      createEngagementAudience: async () => `aud-${Date.now()}`,
      createLookalike: async () => `lal-${Date.now()}`,
      createCampaign: async (acc, _t, { name, dailyBudget, audiences, objective }) => {
        const id = `${acc.adAccountId}-${Date.now()}`;
        const suffix = audiences && audiences.length > 1 ? ` (тест ${audiences.length} аудиторий)` : "";
        list(acc.adAccountId!).push({ id, name: name + suffix, status: "PAUSED", dailyBudget, spend: 0, impressions: 0, clicks: 0, leads: 0, leadGoal: objective === "messages" || objective === "sales", delivery: "PAUSED", targeting: audiences?.[0], objective });
        return id;
      },
    },
  };
}
