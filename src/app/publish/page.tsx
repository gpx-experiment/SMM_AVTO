import { db, currentWorkspace } from "@/lib/db";
import { Card, NETWORK, NetDot, PageHeader, Badge, btn, input } from "@/components/ui";
import { createPost } from "../actions";
import { HashtagPicker } from "@/components/HashtagPicker";
import { SmartPostFields } from "@/components/SmartPostFields";

export const dynamic = "force-dynamic";
const STATUS: Record<string, [string, "mint" | "amber" | "red" | "gray" | "ink"]> = {
  draft: ["Черновик", "gray"], scheduled: ["Запланирован", "amber"], publishing: ["Публикуется", "ink"], published: ["Опубликован", "mint"], failed: ["Ошибка", "red"],
};

export default async function Publish() {
  const ws = await currentWorkspace();
  const accounts = (await db.account.findMany({ where: { workspaceId: ws.id } })).filter((a) => !a.externalId.startsWith("ads:") && a.provider !== "tiktok_ads");
  const posts = await db.post.findMany({ where: { workspaceId: ws.id }, orderBy: { createdAt: "desc" }, take: 50, include: { targets: { include: { account: true } } } });
  return (
    <div className="space-y-6">
      <PageHeader title="Публикации" subtitle="Один пост сразу в несколько соцсетей, сейчас или по расписанию" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card title="Новый пост">
          <form action={createPost} className="space-y-4">
            <textarea name="caption" required rows={5} className={input} placeholder="О чём пост? Текст увидят подписчики во всех выбранных сетях" />
            <div className="grid gap-3 md:grid-cols-3">
              <input name="mediaUrl" className={`${input} md:col-span-3`} placeholder="Ссылка на фото или видео (публичный URL)" />
            </div>
            <SmartPostFields networks={[...new Set(accounts.map((a) => a.provider))]} />
            <div>
              <div className="mb-2 text-sm font-semibold">Куда публикуем</div>
              <div className="flex flex-wrap gap-2 text-sm">
                {accounts.map((a) => (
                  <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded-full border border-line bg-white py-1.5 pl-2.5 pr-3.5 transition has-[:checked]:border-ink has-[:checked]:bg-paper">
                    <input type="checkbox" name="accountIds" value={a.id} defaultChecked />
                    <NetDot provider={a.provider} />{NETWORK[a.provider]?.label}<span className="text-mute">· {a.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <HashtagPicker networks={[...new Set(accounts.map((a) => a.provider))]} />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <p className="text-xs text-mute">TikTok и YouTube принимают только видео, Instagram требует фото или видео.</p>
              <button className={btn}>Опубликовать или запланировать</button>
            </div>
          </form>
        </Card>
        <Card title="Последние посты" action={<Badge>{posts.length}</Badge>}>
          {!posts.length && <p className="text-sm text-mute">Постов пока нет. Создайте первый слева.</p>}
          <ul className="space-y-2.5 text-sm">
            {posts.map((p) => {
              const [st, tone] = STATUS[p.status] ?? [p.status, "gray" as const];
              return (
                <li key={p.id} className="rounded-xl border border-line p-3.5">
                  <div className="flex items-start justify-between gap-3"><span className="line-clamp-2 font-medium">{p.caption}</span><Badge tone={tone}>{st}</Badge></div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mute">
                    {p.targets.map((t) => <span key={t.id} className="inline-flex items-center gap-1.5" title={t.error ?? ""}><NetDot provider={t.account.provider} size={8} />{NETWORK[t.account.provider]?.label}{t.status === "failed" && <span className="text-red-600">ошибка{t.error ? `: ${t.error}` : ""}</span>}</span>)}
                    {p.scheduledAt && <span className="ml-auto">{p.scheduledAt.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
