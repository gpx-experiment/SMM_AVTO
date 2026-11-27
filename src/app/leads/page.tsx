import { db, currentWorkspace } from "@/lib/db";
import { replyLink, SOURCES, STATUSES } from "@/lib/leads";
import { Card, PageHeader, Badge, btn, btnGhost, input, label } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { createLeadAction, deleteLead, setLeadStatusAction, syncLeadsAction, updateLeadAction } from "../actions";

export const dynamic = "force-dynamic";
const money = (n: number) => n.toFixed(2).replace(".", ",");
function ago(d: Date) {
  const m = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  return m < 60 ? `${m} мин назад` : m < 1440 ? `${Math.round(m / 60)} ч назад` : `${Math.round(m / 1440)} дн. назад`;
}

export default async function Leads() {
  const ws = await currentWorkspace();
  const leads = await db.lead.findMany({ where: { workspaceId: ws.id }, orderBy: { lastAt: "desc" }, take: 300 });
  const ideas = await db.adIdea.findMany({ where: { workspaceId: ws.id }, orderBy: { code: "asc" }, select: { id: true, code: true, title: true } });
  const month = leads.filter((l) => l.createdAt.getTime() > Date.now() - 30 * 86400000);
  const sold = month.filter((l) => l.status === "sold");
  const decided = month.filter((l) => l.status === "sold" || l.status === "lost").length;
  const waiting = leads.filter((l) => l.status === "new" && l.waiting).length;
  return (
    <div className="space-y-6">
      <PageHeader title="Заявки" subtitle="Переписки из Direct и Messenger собираются сами, WhatsApp и звонки добавляются вручную">
        <form action={syncLeadsAction}><button className={btn}>Собрать новые переписки</button></form>
      </PageHeader>
      <Flash />
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[["Заявок за 30 дней", String(month.length)], ["Ждут ответа", String(waiting)], ["Продано", `${sold.length}${decided ? ` · ${Math.round((sold.length / decided) * 100)}% от решивших` : ""}`], ["Заработано", money(sold.reduce((s, l) => s + l.amount, 0))]].map(([l, v], i) => (
          <div key={l} className={`rounded-2xl p-5 ${i === 1 && waiting ? "bg-[#ffd2d2]" : i === 0 ? "bg-ink text-white" : "border border-line bg-white"}`}>
            <div className={`text-sm ${i === 0 ? "text-white/60" : "text-mute"}`}>{l}</div>
            <div className="mt-1 font-display text-2xl font-extrabold tracking-tight">{v}</div>
          </div>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-4">
        {STATUSES.map(([status, title, hint]) => {
          const all = leads.filter((l) => l.status === status);
          const list = all.slice(0, status === "new" || status === "quoted" ? 100 : 20);
          return (
            <section key={status} className="space-y-3">
              <div><h2 className="flex items-center gap-2 text-lg font-extrabold">{title}<Badge>{all.length}</Badge></h2><p className="text-xs text-mute">{hint}</p></div>
              {list.map((l) => {
                const link = replyLink(l);
                const idea = ideas.find((i) => i.id === l.ideaId);
                const open = status === "new" || status === "quoted";
                return (
                  <article key={l.id} className={`space-y-2.5 rounded-2xl border bg-white p-4 text-sm ${l.status === "new" && l.waiting ? "border-red-300" : "border-line"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div><b>{l.name}</b>{l.contact && l.contact !== l.name && <span className="text-mute"> {/^\d+$/.test(l.contact) ? `+${l.contact}` : l.contact}</span>}</div>
                      <Badge tone={l.source === "instagram" ? "mint" : "gray"}>{SOURCES[l.source] ?? l.source}</Badge>
                    </div>
                    {l.message && <p className="rounded-xl bg-paper p-2.5 text-[13px] leading-relaxed">{l.message}</p>}
                    {l.lastMessage && l.lastMessage !== l.message && <p className="text-xs text-mute">Последнее: {l.lastMessage}</p>}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-mute">
                      {ago(l.lastAt)}
                      {l.status === "new" && l.waiting && <Badge tone="red">ждёт ответа</Badge>}
                      {idea && <Badge tone="ink">{idea.code}</Badge>}
                      {l.product && <span className="rounded-full bg-mint px-2 py-0.5 font-medium text-ink">{l.product}</span>}
                      {l.status === "sold" && l.amount > 0 && <b className="text-ink">+{money(l.amount)}</b>}
                    </div>
                    {l.note && <p className="text-xs">📝 {l.note}</p>}
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
                      {link && <a href={link} target="_blank" rel="noreferrer" className={`${btn} !py-1.5`}>Ответить</a>}
                      {status === "new" && <form action={setLeadStatusAction.bind(null, l.id, "quoted")}><button className={`${btnGhost} !py-1.5`}>Цену назвал</button></form>}
                      {open && <form action={setLeadStatusAction.bind(null, l.id, "lost")}><button className={`${btnGhost} !py-1.5`}>Отказ</button></form>}
                      {!open && <form action={setLeadStatusAction.bind(null, l.id, "quoted")}><button className="text-xs text-mute underline decoration-dotted">вернуть в работу</button></form>}
                    </div>
                    {open && (
                      <form action={setLeadStatusAction.bind(null, l.id, "sold")} className="flex items-center gap-1.5">
                        <input name="amount" type="number" step="0.01" min={0} placeholder="Заработок" className={`${input} !w-28 !py-1.5`} />
                        <button className={`${btn} !bg-[#18c47a] !py-1.5`}>Продано</button>
                      </form>
                    )}
                    <details>
                      <summary className="cursor-pointer text-xs text-mute">идея, продукт, заметка</summary>
                      <form action={updateLeadAction.bind(null, l.id)} className="mt-2 space-y-1.5">
                        <select name="ideaId" defaultValue={l.ideaId ?? ""} className={`${input} !py-1.5 !text-xs`}>
                          <option value="">Источник неизвестен</option>
                          {ideas.map((i) => <option key={i.id} value={i.id}>{i.code} · {i.title}</option>)}
                        </select>
                        <input name="product" defaultValue={l.product} placeholder="Продукт: İcbari, KASKO…" className={`${input} !py-1.5 !text-xs`} />
                        <input name="note" defaultValue={l.note} placeholder="Заметка: марка, год, номер авто" className={`${input} !py-1.5 !text-xs`} />
                        <div className="flex items-center justify-between"><button className={`${btnGhost} !py-1`}>Сохранить</button><button formAction={deleteLead.bind(null, l.id)} className="text-xs text-mute underline decoration-dotted">удалить</button></div>
                      </form>
                    </details>
                  </article>
                );
              })}
              {!list.length && <p className="rounded-2xl border border-dashed border-line p-4 text-xs text-mute">Пусто</p>}
            </section>
          );
        })}
      </div>

      <Card title="Добавить заявку вручную">
        <form action={createLeadAction} className="grid gap-3 md:grid-cols-3">
          <label className={label}>Имя<input name="name" required className={input} /></label>
          <label className={label}>Телефон или ник<input name="contact" placeholder="050 123 45 67" className={input} /></label>
          <label className={label}>Откуда<select name="source" className={input}>{["whatsapp", "phone", "instagram", "messenger", "other"].map((s) => <option key={s} value={s}>{SOURCES[s]}</option>)}</select></label>
          <label className={label}>Продукт<input name="product" placeholder="İcbari" className={input} /></label>
          <label className={label}>Идея-источник<select name="ideaId" className={input}><option value="">Неизвестно</option>{ideas.map((i) => <option key={i.id} value={i.id}>{i.code} · {i.title}</option>)}</select></label>
          <label className={label}>Что спросил<input name="message" className={input} /></label>
          <div className="md:col-span-3"><button className={btn}>Добавить</button></div>
        </form>
        <p className="mt-3 text-xs text-mute">Код идеи (например S02) в первом сообщении клиента привязывает заявку к идее автоматически. Продажа с указанной идеей сама прибавляет ей проданный полис.</p>
      </Card>
    </div>
  );
}
