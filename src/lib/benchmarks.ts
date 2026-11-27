// Отраслевые бенчмарки с источниками. Все проценты: оценки по открытым исследованиям, не гарантия результата.
// Числа взяты со страниц источников (ноябрь 2026). Где источник не даёт числа, процент не показываем.

export interface Source { name: string; url: string; year: string }
export const SRC = {
  socialinsider: { name: "Socialinsider", url: "https://www.socialinsider.io/social-media-benchmarks/instagram", year: "2025, 67,5 млн постов" },
  dash: { name: "Dash Social", url: "https://www.dashsocial.com/social-media-benchmarks/instagram", year: "2026" },
  fanpagekarma: { name: "Fanpage Karma", url: "https://www.fanpagekarma.com/insights/how-many-hashtags-should-you-use-on-instagram/", year: "2026, 1,6 млн постов" },
  sprout: { name: "Sprout Social", url: "https://sproutsocial.com/insights/best-times-to-post-on-social-media/", year: "2026, ~2 млрд взаимодействий" },
  wordstream: { name: "WordStream", url: "https://wordstream.com/blog/facebook-ads-benchmarks-2025", year: "2025, медианы по 554 кампаниям" },
  webtonic: { name: "Webtonic (обзор, данные вендоров)", url: "https://www.webtonic.io/blog/retargeting", year: "2026" },
} satisfies Record<string, Source>;

export interface Hint { text: string; pct?: number; tone: "up" | "down" | "info"; src: Source }

// Instagram: вовлечённость по формату (Socialinsider, 2025): карусель 0,55%, Reels 0,52%, фото 0,37%
export const IG_ER = { carousel: 0.55, reels: 0.52, image: 0.37 };
const pct = (a: number, b: number) => Math.round((a / b - 1) * 100);

export function formatHints(mediaType: string): Hint[] {
  if (mediaType === "video") return [
    { text: `Reels: вовлечённость на ${pct(IG_ER.reels, IG_ER.image)}% выше, чем у фото`, pct: pct(IG_ER.reels, IG_ER.image), tone: "up", src: SRC.socialinsider },
    { text: "Reels получают на 27% больше репостов, чем средний пост", pct: 27, tone: "up", src: SRC.dash },
  ];
  return [
    { text: `Карусель вместо одного фото: вовлечённость выше на ${pct(IG_ER.carousel, IG_ER.image)}%, сохранений больше в 2,3 раза`, pct: pct(IG_ER.carousel, IG_ER.image), tone: "up", src: SRC.socialinsider },
    { text: `Видео (Reels) вместо фото: вовлечённость выше на ${pct(IG_ER.reels, IG_ER.image)}%`, pct: pct(IG_ER.reels, IG_ER.image), tone: "up", src: SRC.socialinsider },
  ];
}

// Хэштеги (Fanpage Karma, 2026): в Instagram теперь максимум 5. 5 тегов: охват +2%, вовлечённость +3% к постам без тегов; больше 5: охват -3%.
export const HASHTAG_LIMITS: Record<string, number> = { instagram: 5, tiktok: 5, youtube: 5, facebook: 5 }; // Instagram: жёсткий лимит 5; для остальных 3-5 по рекомендациям
export function hashtagHint(count: number, networks: string[]): Hint {
  const ig = networks.includes("instagram");
  if (count === 0) return { text: "5 точных хэштегов дают примерно +2% охвата и +3% вовлечённости к постам без тегов", pct: 3, tone: "up", src: SRC.fanpagekarma };
  if (ig && count > 5) return { text: "Больше 5 хэштегов: Instagram разрешает максимум 5, а охват у таких постов ниже примерно на 3%", pct: -3, tone: "down", src: SRC.fanpagekarma };
  if (count >= 4 && count <= 5) return { text: "Оптимально: 4-5 тегов дают лучшую вовлечённость (до +3%)", pct: 3, tone: "up", src: SRC.fanpagekarma };
  return { text: "1-3 хэштега работают чуть хуже, чем 5: добавьте ещё 2-4 точных тега", tone: "info", src: SRC.fanpagekarma };
}

// Лучшее время (Sprout Social, 2026, местное время). Числа прироста источник не даёт, поэтому без процента.
export const BEST_TIMES: Record<string, { days: number[]; from: number; to: number; label: string }> = {
  instagram: { days: [2, 3], from: 12, to: 19, label: "вт-ср 12:00-19:00" },
  facebook: { days: [2, 3], from: 12, to: 20, label: "вт-ср 12:00-20:00" },
  tiktok: { days: [2, 3], from: 14, to: 18, label: "вт-ср 14:00-18:00" },
  youtube: { days: [2, 3], from: 11, to: 18, label: "вт-ср 11:00-18:00 (общие данные)" },
};
export function timeHint(date: Date | null, networks: string[]): Hint {
  const label = networks.map((n) => BEST_TIMES[n] && `${n === "instagram" ? "Instagram" : n === "facebook" ? "Facebook" : n === "tiktok" ? "TikTok" : "YouTube"}: ${BEST_TIMES[n].label}`).filter(Boolean).join("; ");
  if (!date) return { text: `Лучшие окна по данным ~307 тыс. профилей: ${label}. Хуже всего выходные и раннее утро`, tone: "info", src: SRC.sprout };
  const d = date.getDay(), h = date.getHours();
  const inWindow = networks.some((n) => BEST_TIMES[n] && BEST_TIMES[n].days.includes(d) && h >= BEST_TIMES[n].from && h < BEST_TIMES[n].to);
  const weekend = d === 0 || d === 6;
  if (inWindow) return { text: "Выбранное время попадает в пиковое окно активности аудитории", tone: "up", src: SRC.sprout };
  return { text: `${weekend ? "Выходные: самое слабое время. " : h < 9 ? "Раннее утро: слабое время. " : ""}Пиковые окна: ${label}`, tone: weekend || h < 9 ? "down" : "info", src: SRC.sprout };
}

// Реклама Meta: медианы WordStream 2025 (цель «трафик»): CTR и CPC по отраслям
export const NICHES = {
  fashion: { label: "Одежда и аксессуары", ctr: 1.29, cpc: 0.86, igEngViews: 1.8, postsPerWeek: 8, interests: ["Мода", "Онлайн-шопинг", "Красота и косметика"], age: [20, 40], gender: "female" },
  beauty: { label: "Красота и косметика", ctr: 1.81, cpc: 0.74, igEngViews: 2.9, postsPerWeek: 5, interests: ["Красота и косметика", "Мода"], age: [18, 40], gender: "female" },
  food: { label: "Рестораны и еда", ctr: 1.67, cpc: 0.72, igEngViews: 3.2, postsPerWeek: 5, interests: ["Рестораны и кафе", "Кулинария"], age: [18, 45], gender: "all" },
  retail: { label: "Магазин, подарки", ctr: 4.13, cpc: 0.34, igEngViews: 2.0, postsPerWeek: 7, interests: ["Онлайн-шопинг"], age: [20, 50], gender: "all" },
  realestate: { label: "Недвижимость", ctr: 1.68, cpc: 0.91, postsPerWeek: 4, interests: ["Недвижимость"], age: [27, 55], gender: "all" },
  auto: { label: "Авто (продажа)", ctr: 1.48, cpc: 0.79, postsPerWeek: 4, interests: ["Автомобили"], age: [22, 55], gender: "male" },
  education: { label: "Образование и курсы", ctr: 1.45, cpc: 0.86, postsPerWeek: 4, interests: ["Технологии"], age: [18, 40], gender: "all" },
  fitness: { label: "Фитнес и здоровье", ctr: 1.63, cpc: 0.80, postsPerWeek: 5, interests: ["Фитнес и здоровье"], age: [18, 45], gender: "all" },
  travel: { label: "Путешествия", ctr: 2.76, cpc: 0.51, postsPerWeek: 5, interests: ["Путешествия"], age: [22, 50], gender: "all" },
  // WordStream 2025, «Finance & Insurance», цель «трафик»: CTR 0,98%, клик $1,22. По лид-кампаниям для этой отрасли данных в источнике нет.
  insurance: { label: "Страхование (авто)", ctr: 0.98, cpc: 1.22, postsPerWeek: 4, interests: ["Автострахование", "Автомобили"], age: [23, 60], gender: "all",
    goals: "Заявки в WhatsApp и Direct на İcbari, KASKO и Yaşıl Kart; продления полисов",
    brief: "Автострахование в Азербайджане: İcbari (обязательное), KASKO, Yaşıl Kart. Оформление онлайн, ответ в WhatsApp и Direct. Аудитория: владельцы авто. Языки: азербайджанский и русский. Тон: простой, быстрый, без страшилок." },
  services: { label: "Услуги для бизнеса", ctr: 1.38, cpc: 0.75, postsPerWeek: 3, interests: ["Малый бизнес"], age: [25, 55], gender: "all" },
} as const;
export type NicheId = keyof typeof NICHES;
export const AVG_CTR = 1.71; // все отрасли, WordStream 2025

export function ctrVsIndustry(ctr: number, niche?: string): Hint {
  const n = niche && niche in NICHES ? NICHES[niche as NicheId] : null;
  const bench = n?.ctr ?? AVG_CTR;
  const diff = pct(ctr, bench);
  return { text: `CTR ${ctr.toFixed(2)}%: ${diff >= 0 ? "выше" : "ниже"} медианы ${n ? `отрасли «${n.label}»` : "всех отраслей"} (${bench}%) на ${Math.abs(diff)}%`, pct: diff, tone: diff >= 0 ? "up" : "down", src: SRC.wordstream };
}

// Лид-кампании Meta, все отрасли (WordStream 2025, рынок США): цена заявки $27,66, конверсия клика в заявку 7,72%
export const LEADS_AVG = { cpl: 27.66, cvr: 7.72 };

export function objectiveHint(objective: string): Hint {
  if (objective === "messages") return { text: `Цель «Сообщения» ведёт человека сразу в переписку: для услуг это самый короткий путь до заявки. Ориентир по рынку США: медианная цена заявки $${String(LEADS_AVG.cpl).replace(".", ",")} по всем отраслям`, tone: "info", src: SRC.wordstream };
  if (objective === "traffic") return { text: "Цель «Трафик»: медиана CTR 1,71%, клик около $0,70. Подходит, чтобы вести людей на сайт", tone: "info", src: SRC.wordstream };
  if (objective === "sales") return { text: "Цель «Продажи» оптимизирует под покупки по пикселю: лучше всего работает на тёплой аудитории", tone: "info", src: SRC.wordstream };
  return { text: "Цель «Вовлечение» дешевле набирает реакции и тёплую аудиторию для ретаргетинга", tone: "info", src: SRC.wordstream };
}

// Ретаргетинг против холодной аудитории (обзор Webtonic 2026, данные вендоров): конверсия 3,8% против 1,5-2,2%, CPA ниже на 40-70%
export const RETARGETING_HINT: Hint = { text: "Ретаргетинг: конверсия примерно в 2 раза выше (3,8% против 1,5-2,2%), цена заявки ниже на 40-70%", pct: 100, tone: "up", src: SRC.webtonic };

/** Пресет настроек под нишу: стартовая точка, которую дальше уточняют по вашей статистике */
export function nichePreset(id: NicheId) {
  const n = NICHES[id];
  return {
    postsPerWeek: n.postsPerWeek,
    minCtr: Math.round(n.ctr * 0.5 * 10) / 10,   // ниже половины медианы отрасли: кандидат на паузу
    scaleCtr: Math.round(n.ctr * 1.3 * 10) / 10, // на 30% выше медианы: кандидат на масштабирование
    interests: [...n.interests], age: n.age, gender: n.gender,
    goals: "goals" in n ? n.goals : "Рост охвата и вовлечённости, заявки из соцсетей",
    brief: "brief" in n ? n.brief : `Сфера: ${n.label}`,
  };
}
