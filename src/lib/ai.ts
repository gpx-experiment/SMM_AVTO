// ИИ-SMM-менеджер на Claude: анализирует статистику, строит стратегию, предлагает посты и продвижение.
// Безопасность: любые траты (новая кампания, рост бюджета, запуск) выполняются только после подтверждения
// человеком и не выше лимита maxDailyAdBudget. Пауза кампании экономит деньги и может выполняться сама.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db } from "./db";
import { DEMO } from "./env";
import { adsAccounts, syncMetrics } from "./services";
import { connectorFor, ref, tokenFor } from "@/connectors";
import { playbookPrompt } from "./playbook";
import { applyRules } from "./optimizer";
import { NICHES, AVG_CTR, IG_ER, type NicheId } from "./benchmarks";

const PlanSchema = z.object({
  analysis: z.string().describe("Что происходит со статистикой: что растёт, что падает, лучшие сети и форматы. 3-6 предложений."),
  strategy: z.string().describe("Стратегия на неделю: рубрики, форматы, частота, распределение по сетям, тренды, коллаборации, UGC, продвижение."),
  abInsight: z.string().describe("Что показали прошлые A/B тесты хуков и что из этого следует; если данных нет, так и скажи"),
  posts: z.array(z.object({
    accountIds: z.array(z.string()).describe("id аккаунтов из списка, куда публиковать"),
    pillar: z.enum(["польза", "вовлечение", "доверие", "продажа"]).describe("Рубрика по контент-миксу 40/30/20/10"),
    funnel: z.enum(["TOFU", "MOFU", "BOFU"]).describe("Этап воронки: охват, прогрев, продажа"),
    format: z.enum(["reels", "carousel", "story", "photo", "shorts", "tiktok", "text"]),
    hook: z.string().describe("Хук: первая строка или первые 1-3 секунды видео"),
    hookB: z.string().describe("Альтернативный хук для A/B теста, другой подход"),
    caption: z.string().describe("Готовый текст поста без хэштегов, начинается с хука, заканчивается CTA и при уместности вопросом"),
    cta: z.string().describe("Призыв к действию"),
    question: z.string().describe("Вопрос для комментариев; пустая строка, если не нужен"),
    repurpose: z.string().describe("Как адаптировать этот пост под другие сети"),
    hashtags: z.array(z.string()).describe("Подобранные хэштеги с #: смесь популярных, нишевых и локальных, с учётом лимитов сетей"),
    mediaType: z.enum(["image", "video", "text"]),
    mediaIdea: z.string().describe("Что снять или нарисовать для поста"),
    publishAt: z.string().describe("Дата и время публикации в ISO 8601 UTC, в лучшее время для аудитории"),
    reason: z.string(),
  })),
  promotions: z.array(z.object({
    action: z.enum(["create_campaign", "set_budget", "pause", "resume", "create_retargeting", "create_lookalike"]),
    objective: z.enum(["engagement", "traffic", "sales"]).describe("Цель для create_campaign"),
    adsAccountId: z.string().describe("id рекламного аккаунта из списка"),
    campaignId: z.string().describe("id кампании; пустая строка для create_campaign"),
    name: z.string().describe("название новой кампании; пустая строка для других действий"),
    dailyBudget: z.number().describe("суточный бюджет в валюте кабинета; 0 если не меняется"),
    audiences: z.array(z.object({
      label: z.string().describe("Короткое название аудитории"),
      countries: z.array(z.string()).describe("ISO-коды стран"),
      ageMin: z.number(), ageMax: z.number(),
      gender: z.enum(["all", "male", "female"]),
      interests: z.array(z.string()).describe("Интересы словами, 2-6 шт."),
      useRetargeting: z.boolean().describe("Ограничить аудиторией вовлечённых (ретаргетинг)"),
    })).describe("Для create_campaign: 1 аудитория или 2-3 для теста аудиторий; для create_lookalike первая задаёт страну; иначе пустой массив"),
    reason: z.string(),
  })),
});
type Plan = z.infer<typeof PlanSchema>;

const SYSTEM = `Ты опытный SMM-менеджер и таргетолог. Ведёшь соцсети бренда: Instagram, Facebook, TikTok, YouTube.
По данным статистики и рекламы ты:
1) кратко анализируешь, что работает и что нет;
2) формируешь стратегию на неделю;
3) предлагаешь конкретные посты с готовыми текстами, подобранными хэштегами (Instagram максимум 5, лучше 4-5 точных; TikTok 3-5; YouTube 2-3; Facebook 1-3) и временем публикации (учитывай особенности сетей: TikTok и YouTube принимают только видео, Instagram требует фото или видео);
4) для новых кампаний подбираешь аудиторию: страны, возраст, пол, интересы;
5) предлагаешь действия по рекламе: продвинуть удачное, поставить на паузу неэффективное (низкий CTR, высокая цена клика), перераспределить бюджет.
Не превышай лимит суточного бюджета на кампанию. Не выдумывай цифры, которых нет в данных: если данных мало, так и скажи и предложи осторожные шаги.
Пиши по-русски, если бриф не требует другого языка.
Используй только белые методы: никаких накруток, ботов, массфолловинга, покупки подписчиков и вводящих в заблуждение обещаний.

Профессиональные приёмы, которые ты применяешь:
${playbookPrompt()}`;

async function gatherContext(workspaceId: string) {
  const since = new Date(Date.now() - 14 * 86400000);
  const accounts = await db.account.findMany({ where: { workspaceId, hidden: false }, include: { metrics: { where: { date: { gte: since } }, orderBy: { date: "asc" } } } });
  const posts = await db.post.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 20, include: { targets: true } });
  const ads = [];
  for (const a of await adsAccounts(workspaceId)) {
    try { ads.push({ adsAccountId: a.id, name: a.name, campaigns: await connectorFor(a.provider).ads!.listCampaigns(ref(a), await tokenFor(a)) }); }
    catch (e) { ads.push({ adsAccountId: a.id, name: a.name, error: (e as Error).message }); }
  }
  return {
    accounts: accounts.filter((a) => !a.externalId.startsWith("ads:") && a.provider !== "tiktok_ads").map((a) => ({
      id: a.id, network: a.provider, name: a.name,
      daily: a.metrics.map(({ date, followers, views, reach, likes, dislikes, comments, shares, saves }) =>
        ({ date: date.toISOString().slice(0, 10), followers, views, reach, likes, dislikes, comments, shares, saves })),
    })),
    recentPosts: posts.map((p) => ({ caption: p.caption.slice(0, 200), status: p.status, scheduledAt: p.scheduledAt, networks: p.targets.length, hook: p.hook, abVariant: p.variant, pillar: p.pillar })),
    ads,
  };
}

function demoPlan(ctx: Awaited<ReturnType<typeof gatherContext>>): Plan {
  const ids = ctx.accounts.map((a) => a.id);
  const ad = ctx.ads[0];
  const camps = ad && "campaigns" in ad ? ad.campaigns ?? [] : [];
  const at = (h: number) => new Date(Date.now() + h * 3600000).toISOString();
  return {
    analysis: "Демо-анализ: TikTok даёт больше всего просмотров на подписчика, Instagram лучше по сохранениям. Facebook отстаёт по вовлечённости. Активная кампания Reels держит CTR ~3%, кампания на охват на паузе.",
    strategy: "Контент-микс 40/30/20/10. Рубрики: «Ошибка недели» (польза), «Закулисье» (доверие), «А или Б?» (вовлечение). Упор на короткие видео 7-20 сек с хуком в первую секунду и субтитрами: 4 раза в неделю, 1 карусель-чек-лист для сохранений. Каждое видео репурпосим в Reels, TikTok и Shorts. Запускаем UGC: просим клиентов отмечать бренд. Реклама: продвигаем лидера органики, собираем аудиторию вовлечённых и строим look-alike 1%.",
    abInsight: "Прошлых A/B тестов пока нет: начинаем с хуков-вопросов против хуков-фактов.",
    posts: [
      { accountIds: ids.filter((_, i) => i < 2), pillar: "польза", funnel: "TOFU", format: "carousel",
        hook: "90% покупателей совершают эту ошибку 👇", hookB: "Вы точно выбираете правильно? Проверьте за 30 секунд",
        caption: "90% покупателей совершают эту ошибку 👇\n\nЛистайте карусель: 3 ошибки при выборе и как их избежать.\n\nСохраните, чтобы не потерять 📌", cta: "Сохраните пост", question: "Какую ошибку совершали вы: 1, 2 или 3?",
        repurpose: "TikTok/Shorts: те же 3 ошибки в видео 15 сек с текстом на экране; Stories: опрос «Знали об этом?»",
        hashtags: ["#советы", "#полезныесоветы", "#маленькийбизнес", "#баку", "#demobrand"], mediaType: "image", mediaIdea: "Карусель из 5 слайдов: обложка с хуком, 3 ошибки, слайд-CTA", publishAt: at(20), reason: "Карусель: вовлечённость примерно +49% к одиночному фото и в 2,3 раза больше сохранений (Socialinsider 2025, оценка). Время: вторник днём, пиковое окно (Sprout Social 2026)" },
      { accountIds: ids, pillar: "доверие", funnel: "MOFU", format: "reels",
        hook: "Это видео видят только 1% наших клиентов", hookB: "Как на самом деле делается то, что вы покупаете",
        caption: "Это видео видят только 1% наших клиентов 🎬\n\n30 секунд за кадром: как мы проверяем каждый товар перед отправкой.\n\nНапишите «ХОЧУ» в комментариях, и мы пришлём каталог в директ", cta: "Написать «ХОЧУ»", question: "",
        repurpose: "Один ролик: Reels, TikTok (трендовый звук), Shorts; кадры для Stories с опросом",
        hashtags: ["#закулисами", "#reels", "#fyp", "#производство", "#demobrand"], mediaType: "video", mediaIdea: "Вертикальное видео 15-20 сек, первый кадр крупным планом, субтитры, концовка-петля", publishAt: at(44), reason: "Reels: вовлечённость примерно +41% к фото и +27% репостов (Socialinsider 2025, Dash Social 2026, оценка). Закулисье строит доверие" },
    ],
    promotions: camps.length ? [
      { action: "create_retargeting", objective: "engagement", adsAccountId: ad.adsAccountId, campaignId: "", name: "", dailyBudget: 0, audiences: [], reason: "Тёплая аудитория конвертируется примерно в 2 раза лучше холодной, цена заявки ниже на 40-70% (обзор Webtonic 2026, данные вендоров, оценка)" },
      { action: "create_lookalike", objective: "engagement", adsAccountId: ad.adsAccountId, campaignId: "", name: "", dailyBudget: 0, audiences: [{ label: "Азербайджан", countries: ["AZ"], ageMin: 18, ageMax: 65, gender: "all", interests: [], useRetargeting: false }], reason: "Look-alike 1% от вовлечённых: самый дешёвый способ расширения" },
      { action: "create_campaign", objective: "traffic", adsAccountId: ad.adsAccountId, campaignId: "", name: "ИИ: тест аудиторий, видео недели", dailyBudget: 15,
        audiences: [
          { label: "Интересы: мода", countries: ["AZ"], ageMin: 20, ageMax: 40, gender: "female", interests: ["Мода", "Онлайн-шопинг"], useRetargeting: false },
          { label: "Ретаргетинг", countries: ["AZ"], ageMin: 18, ageMax: 55, gender: "all", interests: [], useRetargeting: true },
        ], reason: "Тест двух аудиторий на одном креативе: через 3-5 дней оставим победителя" },
    ] : [],
  };
}

async function askClaude(settings: { niche: string; brief: string; goals: string; postsPerWeek: number; maxDailyAdBudget: number; timezone: string; websiteUrl: string; pixelId: string; retargetingAudienceId: string }, ctx: object): Promise<Plan> {
  const client = new Anthropic();
  const res = await client.messages.parse({
    model: process.env.AI_MODEL ?? "claude-opus-5-5",
    max_tokens: 16000,
    output_config: { effort: "high", format: zodOutputFormat(PlanSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: [
      `Бриф бренда: ${settings.brief || "не заполнен"}`,
      `Сфера: ${settings.niche in NICHES ? NICHES[settings.niche as NicheId].label : "не выбрана"}. Бенчмарки: медиана CTR рекламы Meta в сфере ${settings.niche in NICHES ? NICHES[settings.niche as NicheId].ctr : AVG_CTR}% (WordStream 2025); вовлечённость Instagram по формату: карусель ${IG_ER.carousel}%, Reels ${IG_ER.reels}%, фото ${IG_ER.image}% (Socialinsider 2025); лучшие окна публикаций вт-ср 11-19 по местному времени (Sprout Social 2026). В поле reason у постов и рекламы указывай ожидаемый эффект в процентах только со ссылкой на эти бенчмарки или на статистику аккаунта, и помечай как оценку.`,
      `Цели: ${settings.goals}`,
      `Постов в неделю: ${settings.postsPerWeek}`,
      `Лимит суточного бюджета на кампанию: ${settings.maxDailyAdBudget}`,
      `Сейчас: ${new Date().toISOString()}, часовой пояс аудитории: ${settings.timezone}`,
      `Сайт: ${settings.websiteUrl || "нет"}; Meta Pixel: ${settings.pixelId ? "установлен" : "нет (цель «Продажи» недоступна)"}; аудитория ретаргетинга: ${settings.retargetingAudienceId ? "уже создана" : "ещё нет"}`,
      `Данные (JSON):\n${JSON.stringify(ctx)}`,
    ].join("\n") }],
  });
  if (res.stop_reason === "refusal") throw new Error("Модель отказалась выполнять запрос");
  if (!res.parsed_output) throw new Error(`Не удалось разобрать ответ модели (stop_reason: ${res.stop_reason})`);
  return res.parsed_output;
}

export async function getSettings(workspaceId: string) {
  return (await db.aiSettings.findUnique({ where: { workspaceId } })) ?? db.aiSettings.create({ data: { workspaceId } });
}

/** Полный цикл: собрать статистику -> спросить ИИ -> сохранить посты и предложения. */
export async function runAgent(workspaceId: string) {
  const run = await db.aiRun.create({ data: { workspaceId } });
  try {
    const settings = await getSettings(workspaceId);
    await syncMetrics(workspaceId);
    const ctx = await gatherContext(workspaceId);
    const useDemo = DEMO && !process.env.ANTHROPIC_API_KEY;
    const plan = useDemo ? demoPlan(ctx) : await askClaude(settings, ctx);
    const validAccounts = new Set(ctx.accounts.map((a) => a.id));

    for (const p of plan.posts) {
      const accountIds = p.accountIds.filter((id) => validAccounts.has(id));
      if (!accountIds.length) continue;
      await db.proposal.create({ data: {
        runId: run.id, kind: "post", title: p.caption.slice(0, 80), reason: `${p.reason}. Медиа: ${p.mediaIdea}`,
        payload: JSON.stringify({ ...p, accountIds }),
      } });
    }

    const TITLES: Record<string, (a: Plan["promotions"][number]) => string> = {
      create_campaign: (a) => `Новая кампания «${a.name}»${a.audiences.length > 1 ? `: тест ${a.audiences.length} аудиторий` : ""}`,
      set_budget: (a) => `Бюджет ${a.dailyBudget}/день`, pause: () => "Пауза кампании", resume: () => "Запуск кампании",
      create_retargeting: () => "Аудитория для ретаргетинга (вовлечённые 365 дней)", create_lookalike: (a) => `Look-alike 1% ${a.audiences[0]?.countries[0] ?? "AZ"}`,
    };
    const addPromotion = async (a: Plan["promotions"][number], title: string) => {
      const costly = ["create_campaign", "set_budget", "resume"].includes(a.action);
      const overLimit = costly && a.dailyBudget > settings.maxDailyAdBudget;
      const proposal = await db.proposal.create({ data: {
        runId: run.id, kind: a.action, title, reason: a.reason, payload: JSON.stringify(a),
        dailyCost: costly ? a.dailyBudget : 0,
        status: overLimit ? "blocked" : "pending",
        result: overLimit ? `Выше лимита ${settings.maxDailyAdBudget}/день` : null,
      } });
      if (a.action === "pause" && settings.autoPauseAds) await executeProposal(proposal.id);
    };

    // 1) Автоправила таргетолога (детерминированные)
    const ruleCampaigns = new Set<string>();
    if (settings.autoRules) {
      for (const ad of ctx.ads) {
        if (!("campaigns" in ad) || !ad.campaigns) continue;
        for (const r of applyRules(ad.campaigns, settings)) {
          ruleCampaigns.add(r.campaignId);
          await addPromotion({ action: r.action, objective: "engagement", adsAccountId: ad.adsAccountId, campaignId: r.campaignId, name: "",
            dailyBudget: r.dailyBudget, audiences: [], reason: r.reason }, `${r.action === "pause" ? "Пауза" : "Масштабирование"}: ${r.campaignName} (${ad.name})`);
        }
      }
    }
    // 2) Предложения ИИ (кроме кампаний, по которым уже сработало правило)
    for (const a of plan.promotions) {
      if (a.campaignId && ruleCampaigns.has(a.campaignId)) continue;
      await addPromotion(a, TITLES[a.action](a));
    }
    if (settings.autoPublish) {
      for (const p of await db.proposal.findMany({ where: { runId: run.id, kind: "post", status: "pending" } })) await executeProposal(p.id);
    }
    await db.aiRun.update({ where: { id: run.id }, data: { status: "done", analysis: plan.analysis, strategy: `${plan.strategy}\n\nA/B тесты: ${plan.abInsight}` } });
  } catch (e) {
    await db.aiRun.update({ where: { id: run.id }, data: { status: "failed", error: (e as Error).message } });
  }
  return run.id;
}

/** Текст поста с выбранным хуком (A/B) и вопросом для комментариев */
function captionFor(d: { caption: string; hook?: string; hookB?: string; question?: string }, variant?: "A" | "B") {
  let text = d.caption;
  if (variant === "B" && d.hook && d.hookB) text = text.includes(d.hook) ? text.replace(d.hook, d.hookB) : `${d.hookB}\n\n${text}`;
  if (d.question && !text.includes(d.question)) text += `\n\n${d.question}`;
  return text;
}

/** Выполнить подтверждённое предложение. */
export async function executeProposal(id: string, overrides?: { mediaUrl?: string; variant?: "A" | "B" }) {
  const p = await db.proposal.findUniqueOrThrow({ where: { id }, include: { run: true } });
  if (!["pending", "approved"].includes(p.status)) throw new Error(`Предложение уже ${p.status}`);
  const data = JSON.parse(p.payload);
  try {
    let result = "";
    if (p.kind === "post") {
      const mediaType = data.mediaType === "text" ? "image" : data.mediaType;
      const post = await db.post.create({ data: {
        workspaceId: p.run.workspaceId, caption: [captionFor(data, overrides?.variant), (data.hashtags ?? []).join(" ")].filter(Boolean).join("\n\n"),
        hook: overrides?.variant === "B" ? data.hookB ?? "" : data.hook ?? "", variant: data.hookB ? overrides?.variant ?? "A" : "", pillar: data.pillar ?? "", mediaType, mediaUrl: overrides?.mediaUrl || null,
        // Без медиа пост для Instagram/TikTok/YouTube не опубликовать: оставляем черновиком
        scheduledAt: new Date(data.publishAt), status: data.mediaType === "text" || overrides?.mediaUrl ? "scheduled" : "draft",
        targets: { create: (data.accountIds as string[]).map((accountId) => ({ accountId })) },
      } });
      result = post.status === "scheduled" ? `Запланирован на ${new Date(data.publishAt).toLocaleString("ru-RU")}` : "Сохранён черновиком: добавьте медиа в «Публикациях»";
    } else {
      const settings = await getSettings(p.run.workspaceId);
      if (["create_campaign", "set_budget", "resume"].includes(p.kind) && data.dailyBudget > settings.maxDailyAdBudget) throw new Error("Бюджет выше лимита");
      const acc = await db.account.findUniqueOrThrow({ where: { id: data.adsAccountId } });
      const ads = connectorFor(acc.provider).ads!;
      const token = await tokenFor(acc);
      if (p.kind === "create_retargeting") {
        if (!ads.createEngagementAudience) throw new Error("Ретаргетинг пока поддерживается только для Meta");
        const own = await db.account.findMany({ where: { workspaceId: p.run.workspaceId, hidden: false, provider: { in: ["instagram", "facebook"] } } });
        const igId = own.find((a) => a.provider === "instagram")?.externalId;
        const pageId = own.find((a) => a.provider === "facebook" && !a.externalId.startsWith("ads:"))?.externalId;
        const audId = await ads.createEngagementAudience(ref(acc), token, { igId, pageId }, 365);
        await db.aiSettings.update({ where: { workspaceId: p.run.workspaceId }, data: { retargetingAudienceId: audId } });
        result = `Создана аудитория вовлечённых ${audId}`;
      }
      if (p.kind === "create_lookalike") {
        if (!ads.createLookalike) throw new Error("Look-alike пока поддерживается только для Meta");
        if (!settings.retargetingAudienceId) throw new Error("Сначала создайте аудиторию для ретаргетинга");
        const country = data.audiences?.[0]?.countries?.[0] ?? "AZ";
        const lal = await ads.createLookalike(ref(acc), token, settings.retargetingAudienceId, country, 0.01);
        await db.aiSettings.update({ where: { workspaceId: p.run.workspaceId }, data: { lookalikeAudienceId: lal } });
        result = `Создана похожая аудитория ${lal}`;
      }
      if (p.kind === "create_campaign") {
        // Интересы ИИ называет словами: находим их id через поиск рекламного кабинета
        const audiences = [];
        for (const a of (data.audiences ?? []) as Plan["promotions"][number]["audiences"]) {
          const interests = [];
          for (const name of a.interests) {
            const hit = (await ads.searchInterests?.(ref(acc), token, name))?.[0];
            if (hit) interests.push({ id: hit.id, name: hit.name });
          }
          const customAudienceIds = a.useRetargeting && settings.retargetingAudienceId ? [settings.retargetingAudienceId] : [];
          audiences.push({ label: a.label, countries: a.countries, ageMin: a.ageMin, ageMax: a.ageMax, gender: a.gender, interests, customAudienceIds });
        }
        const id = await ads.createCampaign(ref(acc), token, { name: data.name, dailyBudget: data.dailyBudget, objective: data.objective, audiences, pixelId: settings.pixelId });
        result = `Создана кампания ${id}${audiences.length > 1 ? ` с тестом ${audiences.length} аудиторий` : ""} (на паузе, добавьте креатив и запустите)`;
      }
      if (p.kind === "set_budget") { await ads.setDailyBudget(ref(acc), token, data.campaignId, data.dailyBudget); result = "Бюджет изменён"; }
      if (p.kind === "pause") { await ads.setStatus(ref(acc), token, data.campaignId, false); result = "Кампания на паузе"; }
      if (p.kind === "resume") { await ads.setStatus(ref(acc), token, data.campaignId, true); result = "Кампания запущена"; }
    }
    await db.proposal.update({ where: { id }, data: { status: "executed", result } });
  } catch (e) {
    await db.proposal.update({ where: { id }, data: { status: "failed", result: (e as Error).message } });
  }
}
