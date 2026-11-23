// Подбор хэштегов: Claude предлагает по тексту поста, нише бренда и сети.
// Это рекомендации модели, а не живая статистика: официальные API сетей не отдают популярность хэштегов.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { DEMO } from "./env";

export const HashtagSchema = z.object({
  popular: z.array(z.string()).describe("Широкие популярные хэштеги по теме, 5-8 шт."),
  niche: z.array(z.string()).describe("Узкие нишевые хэштеги с меньшей конкуренцией, 6-10 шт."),
  local: z.array(z.string()).describe("Гео и языковые хэштеги для аудитории бренда, 3-5 шт."),
  branded: z.array(z.string()).describe("Фирменные хэштеги бренда/кампании, 1-3 шт."),
  tip: z.string().describe("Короткий совет: сколько и каких тегов ставить для выбранных сетей"),
});
export type HashtagSuggestion = z.infer<typeof HashtagSchema>;

const norm = (t: string) => "#" + t.replace(/^#+/, "").replace(/\s+/g, "").toLowerCase();
const clean = (s: HashtagSuggestion): HashtagSuggestion => ({
  popular: [...new Set(s.popular.map(norm))], niche: [...new Set(s.niche.map(norm))],
  local: [...new Set(s.local.map(norm))], branded: [...new Set(s.branded.map(norm))], tip: s.tip,
});

function demo(caption: string): HashtagSuggestion {
  const words = caption.toLowerCase().match(/[a-zа-яё]{5,}/gi)?.slice(0, 4) ?? [];
  return clean({
    popular: ["#reels", "#trending", "#instagood", "#fyp", "#viral", "#smm"],
    niche: [...words, "советыдлябизнеса", "закулисами", "полезныесоветы", "маленькийбизнес", "новинка"],
    local: ["#baku", "#azerbaijan", "#бакуфото", "#баку"],
    branded: ["#demobrand", "#demobrandteam"],
    tip: "Instagram теперь разрешает максимум 5 тегов: выберите 4-5 самых точных. TikTok: 3-5, YouTube: 2-3. Смешивайте нишевые и локальные.",
  });
}

export async function suggestHashtags(caption: string, networks: string[], brief: string): Promise<HashtagSuggestion> {
  if (DEMO && !process.env.ANTHROPIC_API_KEY) return demo(caption);
  const client = new Anthropic();
  const res = await client.messages.parse({
    model: process.env.AI_MODEL ?? "claude-opus-5-5",
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(HashtagSchema) },
    system: "Ты SMM-специалист. В Instagram с 2026 года можно максимум 5 хэштегов на пост, лучше всего работают 4-5 точных. Подбираешь хэштеги, которые реально используются в выбранных соцсетях. Без пробелов внутри тега, без запрещённых и спамных тегов. Язык тегов соответствует аудитории.",
    messages: [{ role: "user", content: `Сети: ${networks.join(", ") || "Instagram"}\nО бренде: ${brief || "не указано"}\nТекст поста:\n${caption}` }],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error("Не удалось подобрать хэштеги");
  return clean(res.parsed_output);
}
