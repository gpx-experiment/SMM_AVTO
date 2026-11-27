// Доска идей таргетинга: гипотеза -> тест-кампания на паузе с малым бюджетом -> вердикт по цене заявки или CTR.
// Запуск теста только создаёт кампанию на паузе: деньги начинают тратиться после вашей кнопки «Запустить».
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { AdIdea } from "@prisma/client";
import { db } from "./db";
import { adsAccounts, campaignExtras } from "./services";
import { getSettings, hasAiKey, NO_KEY, resolveAudiences, type NamedAudience } from "./ai";
import { connectorFor, ref, tokenFor } from "@/connectors";
import type { Campaign, Objective } from "@/connectors/types";
import { cplVerdict } from "./optimizer";
import { NICHES, AVG_CTR, type NicheId } from "./benchmarks";

export interface IdeaText { lang: string; text: string }
export interface IdeaDraft { title: string; product: string; hypothesis: string; objective: Objective; audience: NamedAudience; texts: IdeaText[] }

const aud = (a: Partial<NamedAudience>): NamedAudience => ({ countries: ["AZ"], ageMin: 23, ageMax: 60, gender: "all", interests: [], ...a });

/** Готовые гипотезы для автострахования. Тексты: стартовые варианты на азербайджанском и русском, правьте под себя. */
const INSURANCE: IdeaDraft[] = [
  { title: "İcbari: продление, владельцы авто", product: "İcbari", objective: "messages",
    hypothesis: "Владельцам авто проще продлить обязательную страховку в переписке, чем ехать в офис. Широкая аудитория по интересу к авто.",
    audience: aud({ ageMin: 25, ageMax: 60, interests: ["Автомобили", "Автострахование"] }),
    texts: [
      { lang: "AZ", text: "İcbari sığortanızın vaxtı bitir? 5 dəqiqəyə onlayn yeniləyin, evdən çıxmadan. Yazın, qiyməti dərhal deyək." },
      { lang: "RU", text: "Заканчивается İcbari? Продлим онлайн за 5 минут, никуда ехать не нужно. Напишите нам, сразу назовём цену." },
    ] },
  { title: "KASKO: владельцы новых и дорогих авто", product: "KASKO", objective: "messages",
    hypothesis: "KASKO покупают те, кому есть что терять: недавно купленная или дорогая машина. Сравнение цен нескольких страховых снимает главный вопрос.",
    audience: aud({ ageMin: 28, ageMax: 55, interests: ["Автомобили", "Автосалон", "Автокредит"] }),
    texts: [
      { lang: "AZ", text: "Maşınınızı qəza, oğurluq və zədələrdən qoruyun. Bir neçə sığorta şirkətinin KASKO qiymətini müqayisə edib ən sərfəlisini təklif edirik. Yazın, hesablayaq." },
      { lang: "RU", text: "Защитите машину от ДТП, угона и повреждений. Сравним цены KASKO в нескольких страховых и предложим самую выгодную. Напишите, посчитаем." },
    ] },
  { title: "Yaşıl Kart: едут за границу на машине", product: "Yaşıl Kart", objective: "messages",
    hypothesis: "Тем, кто собирается за границу на своей машине, Yaşıl Kart нужен срочно и один раз: ловим по интересу к поездкам.",
    audience: aud({ ageMin: 25, ageMax: 55, interests: ["Путешествия", "Автомобили"] }),
    texts: [
      { lang: "AZ", text: "Maşınla xaricə gedirsiniz? Yaşıl Kartı yola çıxmazdan əvvəl onlayn alın, sərhəddə vaxt itirməyin. Yazın, dərhal rəsmiləşdirək." },
      { lang: "RU", text: "Едете за границу на машине? Оформите Yaşıl Kart онлайн до выезда и не теряйте время на границе. Напишите, оформим сразу." },
    ] },
  { title: "Такси и курьеры: машина каждый день в работе", product: "İcbari + KASKO", objective: "messages",
    hypothesis: "Водители такси и курьеры ездят больше всех, риск выше, а времени на офис нет: быстрый онлайн-полис для них сильный довод.",
    audience: aud({ ageMin: 23, ageMax: 55, gender: "male", interests: ["Такси", "Bolt", "Uber"] }),
    texts: [
      { lang: "AZ", text: "Taksi və ya kuryer işləyirsiniz? Maşın hər gün yoldadır. İcbari və KASKO-nu bir yerdən, tez və onlayn rəsmiləşdirin. Yazın." },
      { lang: "RU", text: "Работаете в такси или курьером? Машина каждый день в дороге. İcbari и KASKO в одном месте, быстро и онлайн. Напишите нам." },
    ] },
  { title: "Только что купили машину", product: "İcbari", objective: "messages",
    hypothesis: "Новому владельцу İcbari нужен в первые дни после покупки: ловим по интересу к покупке авто.",
    audience: aud({ ageMin: 23, ageMax: 50, interests: ["Покупка автомобиля", "Автосалон", "Подержанный автомобиль"] }),
    texts: [
      { lang: "AZ", text: "Yeni maşın aldınız? Təbrik edirik! İcbari sığortasız yola çıxmaq olmaz. Yazın, 5 dəqiqəyə onlayn rəsmiləşdirək." },
      { lang: "RU", text: "Купили машину? Поздравляем! Без İcbari на дорогу нельзя. Напишите, оформим онлайн за 5 минут." },
    ] },
  { title: "Ретаргетинг: смотрели страницу, но не написали", product: "İcbari, KASKO", objective: "messages",
    hypothesis: "Тёплая аудитория (взаимодействовали со страницей или профилем) даёт заявки дешевле холодной. Нужна аудитория ретаргетинга из ИИ-менеджера.",
    audience: aud({ ageMin: 23, ageMax: 60, useRetargeting: true }),
    texts: [
      { lang: "AZ", text: "Bizi izləyirsiniz, amma hələ yazmamısınız? Maşınınızın markasını yazın, sığortanın qiymətini 5 dəqiqəyə hesablayaq." },
      { lang: "RU", text: "Вы уже заглядывали к нам, но ещё не написали? Пришлите марку машины, посчитаем страховку за 5 минут." },
    ] },
];
const TEMPLATES: Record<string, IdeaDraft[]> = { insurance: INSURANCE };
export const hasTemplates = (niche: string) => niche in TEMPLATES;

const newCode = (n: number) => `S${String(n + 1).padStart(2, "0")}`;

export async function addIdeas(workspaceId: string, drafts: IdeaDraft[], dailyBudget: number) {
  const existing = await db.adIdea.findMany({ where: { workspaceId }, select: { title: true } });
  const titles = new Set(existing.map((e) => e.title));
  let n = existing.length, added = 0;
  for (const d of drafts) {
    if (titles.has(d.title)) continue;
    await db.adIdea.create({ data: { workspaceId, title: d.title, product: d.product, hypothesis: d.hypothesis, objective: d.objective,
      audience: JSON.stringify(d.audience), texts: JSON.stringify(d.texts), dailyBudget, code: newCode(n++) } });
    added++;
  }
  return added;
}

/** Бюджет теста по умолчанию: 4 в день, но не выше лимита на кампанию */
const testBudget = (maxDaily: number) => Math.min(4, maxDaily || 4);

export async function seedIdeas(workspaceId: string) {
  const s = await getSettings(workspaceId);
  return addIdeas(workspaceId, TEMPLATES[s.niche] ?? [], testBudget(s.maxDailyAdBudget));
}

const IdeasSchema = z.object({ ideas: z.array(z.object({
  title: z.string().describe("Короткое название гипотезы"),
  product: z.string().describe("Какой продукт продвигаем"),
  hypothesis: z.string().describe("Почему эта аудитория и этот заход должны дать дешёвые заявки, 1-2 предложения"),
  countries: z.array(z.string()).describe("ISO-коды стран"),
  ageMin: z.number(), ageMax: z.number(), gender: z.enum(["all", "male", "female"]),
  interests: z.array(z.string()).describe("Интересы словами по-русски, 2-4 шт., как в рекламном кабинете Meta"),
  useRetargeting: z.boolean(),
  texts: z.array(z.object({ lang: z.string().describe("AZ или RU"), text: z.string().describe("Текст объявления до 200 знаков с призывом написать") })).describe("3 варианта текста для A/B теста на языках бренда"),
})) });

/** Новые гипотезы от ИИ: с учётом того, какие идеи уже выиграли и проиграли */
export async function generateIdeas(workspaceId: string) {
  if (!hasAiKey()) throw new Error(NO_KEY);
  const s = await getSettings(workspaceId);
  const past = await db.adIdea.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 40 });
  const res = await new Anthropic().messages.parse({
    model: process.env.AI_MODEL ?? "claude-opus-5-5", max_tokens: 8000,
    output_config: { format: zodOutputFormat(IdeasSchema) },
    system: "Ты таргетолог. Придумываешь проверяемые гипотезы для рекламы Meta с целью «заявки в переписку». Каждая гипотеза: одна аудитория, один довод. Не повторяй уже существующие идеи, развивай выигравшие и не предлагай похожее на проигравшие. Только честные обещания: без выдуманных скидок, цен и гарантий.",
    messages: [{ role: "user", content: [
      `Бриф бренда: ${s.brief || "не заполнен"}`, `Сфера: ${s.niche in NICHES ? NICHES[s.niche as NicheId].label : "не выбрана"}`, `Цели: ${s.goals}`,
      `Уже есть идеи (JSON): ${JSON.stringify(past.map((i) => ({ title: i.title, status: i.status, verdict: i.verdict, sales: i.sales })))}`,
      "Предложи 4 новые гипотезы.",
    ].join("\n") }],
  });
  if (!res.parsed_output) throw new Error(`Не удалось разобрать ответ модели (stop_reason: ${res.stop_reason})`);
  return addIdeas(workspaceId, res.parsed_output.ideas.map((i) => ({ title: i.title, product: i.product, hypothesis: i.hypothesis, objective: "messages" as const,
    audience: { countries: i.countries, ageMin: i.ageMin, ageMax: i.ageMax, gender: i.gender, interests: i.interests, useRetargeting: i.useRetargeting }, texts: i.texts })), testBudget(s.maxDailyAdBudget));
}

/** Создаёт тест-кампанию на паузе. Ошибку пишет в вердикт идеи, чтобы её было видно на доске. */
export async function launchIdea(id: string, adsAccountId?: string) {
  const idea = await db.adIdea.findUniqueOrThrow({ where: { id } });
  try {
    if (idea.campaignId) throw new Error("Тест уже создан");
    const s = await getSettings(idea.workspaceId);
    if (idea.dailyBudget > s.maxDailyAdBudget) throw new Error(`Бюджет ${idea.dailyBudget}/день выше лимита ${s.maxDailyAdBudget} на кампанию`);
    const accounts = await adsAccounts(idea.workspaceId);
    const acc = accounts.find((a) => a.id === adsAccountId) ?? accounts[0];
    if (!acc) throw new Error("Нет рекламного кабинета: включите его в «Аккаунтах»");
    const a = JSON.parse(idea.audience) as NamedAudience;
    if (a.useRetargeting && !s.retargetingAudienceId) throw new Error("Сначала создайте аудиторию ретаргетинга в ИИ-менеджере");
    const audiences = await resolveAudiences(acc, [{ ...a, label: idea.title }], s.retargetingAudienceId);
    const campaignId = await connectorFor(acc.provider).ads!.createCampaign(ref(acc), await tokenFor(acc), {
      name: `Тест ${idea.code}: ${idea.title}`, dailyBudget: idea.dailyBudget, objective: idea.objective as Objective, audiences, ...(await campaignExtras(idea.workspaceId, s)) });
    await db.adIdea.update({ where: { id }, data: { status: "testing", campaignId, adsAccountId: acc.id, startedAt: new Date(),
      verdict: "Кампания создана на паузе: добавьте объявление в Ads Manager и нажмите «Запустить» в разделе «Реклама»" } });
  } catch (e) {
    await db.adIdea.update({ where: { id }, data: { verdict: `Не удалось создать тест: ${(e as Error).message}` } });
  }
}

/** Кампании всех рекламных кабинетов по id */
export async function campaignsById(workspaceId: string) {
  const map = new Map<string, Campaign>();
  for (const a of await adsAccounts(workspaceId)) {
    try { for (const c of await connectorFor(a.provider).ads!.listCampaigns(ref(a), await tokenFor(a))) map.set(c.id, c); } catch { /* кабинет недоступен: идеи остаются без цифр */ }
  }
  return map;
}

export const cpl = (c?: Campaign) => (c?.leads ? (c.spend ?? 0) / c.leads : null);

/** Выносит вердикт идеям в тесте: после 3 дней показов и достаточного расхода. */
export async function judgeIdeas(workspaceId: string, campaigns?: Map<string, Campaign>) {
  const testing = await db.adIdea.findMany({ where: { workspaceId, status: "testing", campaignId: { not: null } } });
  if (!testing.length) return 0;
  const s = await getSettings(workspaceId);
  const map = campaigns ?? await campaignsById(workspaceId);
  const bench = s.niche in NICHES ? NICHES[s.niche as NicheId].ctr : AVG_CTR;
  let judged = 0;
  for (const idea of testing) {
    const c = map.get(idea.campaignId!);
    if (!c || !c.impressions) continue; // ещё не запущена или нет показов
    const days = (Date.now() - (idea.startedAt?.getTime() ?? Date.now())) / 86400000;
    const spend = c.spend ?? 0;
    const byCpl = cplVerdict(c, s);
    let status = "", verdict = "";
    if (byCpl) { status = byCpl.verdict === "good" ? "won" : "lost"; verdict = byCpl.reason; }
    else if (days >= 3 && spend >= s.minSpendToJudge) {
      const ctr = ((c.clicks ?? 0) / c.impressions) * 100;
      const price = cpl(c);
      if (c.leadGoal && price != null) { status = "won"; verdict = `${c.leads} заявок по ${price.toFixed(2)} за 7 дней. Задайте потолок цены заявки в настройках, чтобы судить строже`; }
      else if (c.leadGoal) { status = "lost"; verdict = `потрачено ${spend.toFixed(2)} за 7 дней, заявок нет`; }
      else { status = ctr >= bench ? "won" : "lost"; verdict = `CTR ${ctr.toFixed(2)}% при ориентире ${bench}%`; }
    }
    if (!status) continue;
    await db.adIdea.update({ where: { id: idea.id }, data: { status, verdict: `${status === "won" ? "Сработала" : "Не сработала"}: ${verdict}` } });
    judged++;
  }
  return judged;
}

/** Ссылка в WhatsApp с кодом идеи: по коду в первом сообщении видно, откуда пришёл клиент */
export function waLink(number: string, idea: Pick<AdIdea, "product" | "code">) {
  const digits = number.replace(/\D/g, "");
  if (!digits) return "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(`Salam! ${idea.product || "Sığorta"} haqqında məlumat istəyirəm. Kod: ${idea.code}`)}`;
}
