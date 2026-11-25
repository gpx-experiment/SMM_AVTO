// Комментарии: собираем входящие из Instagram и Facebook, ИИ определяет тон и готовит ответ.
// Ответ уходит только после вашего подтверждения.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db } from "./db";
import { DEMO } from "./env";
import { getSettings } from "./ai";
import { connectorFor, ref, tokenFor } from "@/connectors";

const Drafts = z.object({ items: z.array(z.object({
  id: z.string(),
  sentiment: z.enum(["positive", "neutral", "negative", "question"]),
  reply: z.string().describe("Короткий человечный ответ от бренда: по имени, по делу, без шаблонности. На негатив: извиниться и увести в директ. На вопрос: ответить или пригласить в директ."),
})) });

function demoDraft(text: string) {
  if (/\?/.test(text)) return { sentiment: "question", reply: "Спасибо за вопрос! Напишите нам в директ, и менеджер всё подробно расскажет 💬" };
  if (/😡|нет ответа|плохо|ужас/i.test(text)) return { sentiment: "negative", reply: "Простите за ожидание! Уже передали менеджеру, напишем вам в директ в течение часа 🙏" };
  return { sentiment: "positive", reply: "Спасибо большое, очень приятно! ❤️" };
}

export async function syncComments(workspaceId: string) {
  const accounts = await db.account.findMany({ where: { workspaceId, hidden: false } });
  const fresh: { id: string; text: string; author: string; post: string }[] = [];
  for (const acc of accounts) {
    const c = connectorFor(acc.provider);
    if (!c.fetchComments) continue;
    try {
      for (const cm of await c.fetchComments(ref(acc), await tokenFor(acc))) {
        const exists = await db.commentItem.findUnique({ where: { accountId_externalId: { accountId: acc.id, externalId: cm.id } } });
        if (exists) continue;
        const row = await db.commentItem.create({ data: { accountId: acc.id, externalId: cm.id, author: cm.author, text: cm.text, postCaption: cm.postCaption.slice(0, 300), createdAt: cm.createdAt } });
        fresh.push({ id: row.id, text: cm.text, author: cm.author, post: cm.postCaption.slice(0, 150) });
      }
    } catch { /* сеть без доступа к комментариям: пропускаем */ }
  }
  if (!fresh.length) return 0;
  if (DEMO && !process.env.ANTHROPIC_API_KEY) {
    for (const f of fresh) { const d = demoDraft(f.text); await db.commentItem.update({ where: { id: f.id }, data: { sentiment: d.sentiment, replyDraft: d.reply } }); }
    return fresh.length;
  }
  const { brief } = await getSettings(workspaceId);
  const res = await new Anthropic().messages.parse({
    model: process.env.AI_MODEL ?? "claude-opus-5-5", max_tokens: 8000,
    output_config: { effort: "low", format: zodOutputFormat(Drafts) },
    system: `Ты SMM-менеджер бренда и отвечаешь на комментарии. О бренде: ${brief || "не указано"}. Отвечай на языке комментария. Никогда не обещай того, чего нет в брифе.`,
    messages: [{ role: "user", content: JSON.stringify(fresh) }],
  });
  for (const it of res.parsed_output?.items ?? []) {
    await db.commentItem.updateMany({ where: { id: it.id }, data: { sentiment: it.sentiment, replyDraft: it.reply } });
  }
  return fresh.length;
}

export async function sendReply(id: string, text: string) {
  const item = await db.commentItem.findUniqueOrThrow({ where: { id } });
  const acc = await db.account.findUniqueOrThrow({ where: { id: item.accountId } });
  const c = connectorFor(acc.provider);
  if (!c.replyComment) throw new Error("Ответы в эту сеть не поддерживаются");
  await c.replyComment(ref(acc), await tokenFor(acc), item.externalId, text);
  await db.commentItem.update({ where: { id }, data: { status: "replied", replyDraft: text } });
}
