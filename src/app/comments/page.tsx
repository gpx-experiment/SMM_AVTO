import { db, currentWorkspace } from "@/lib/db";
import { Card, NETWORK, NetDot, PageHeader, Badge, btn, btnGhost, input } from "@/components/ui";
import { ignoreCommentAction, replyCommentAction, syncCommentsAction } from "../actions";

export const dynamic = "force-dynamic";
const MOOD: Record<string, [string, "mint" | "amber" | "red" | "gray"]> = {
  question: ["Вопрос", "amber"], negative: ["Негатив", "red"], positive: ["Позитив", "mint"], neutral: ["Нейтрально", "gray"],
};

export default async function Comments() {
  const ws = await currentWorkspace();
  const accounts = await db.account.findMany({ where: { workspaceId: ws.id, hidden: false } });
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const items = await db.commentItem.findMany({ where: { accountId: { in: accounts.map((a) => a.id) }, status: "new" }, orderBy: { createdAt: "desc" }, take: 50 });
  // Сначала негатив и вопросы: на них важнее ответить быстро
  const order = { negative: 0, question: 1, neutral: 2, positive: 3 } as Record<string, number>;
  items.sort((a, b) => (order[a.sentiment] ?? 9) - (order[b.sentiment] ?? 9));
  return (
    <div className="space-y-6">
      <PageHeader title="Комментарии" subtitle="Ответ в первый час продлевает жизнь поста. ИИ готовит ответ, вы отправляете одним нажатием. Негатив и вопросы наверху.">
        <form action={syncCommentsAction}><button className={btn}>Проверить новые</button></form>
      </PageHeader>
      {!items.length && <Card><p className="text-sm text-mute">Новых комментариев нет. Instagram и Facebook проверяются автоматически каждые 15 минут.</p></Card>}
      {items.map((c) => {
        const acc = byId.get(c.accountId);
        const [label, tone] = MOOD[c.sentiment] ?? MOOD.neutral;
        return (
          <Card key={c.id}>
            <div className="mb-1 flex items-center gap-2 text-sm">
              <Badge tone={tone}>{label}</Badge>
              {acc && <NetDot provider={acc.provider} />}<b>{c.author}</b><span className="text-mute">{acc && NETWORK[acc.provider]?.label} · {c.createdAt.toLocaleString("ru-RU")}</span>
            </div>
            <p className="mb-1 text-[15px]">{c.text}</p>
            {c.postCaption && <p className="mb-3 text-xs text-mute">К посту: {c.postCaption.slice(0, 100)}</p>}
            <div className="flex gap-2">
              <form action={replyCommentAction.bind(null, c.id)} className="flex flex-1 gap-2">
                <input name="reply" defaultValue={c.replyDraft} className={`${input} flex-1`} />
                <button className={btn}>Ответить</button>
              </form>
              <form action={ignoreCommentAction.bind(null, c.id)}><button className={btnGhost}>Пропустить</button></form>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
