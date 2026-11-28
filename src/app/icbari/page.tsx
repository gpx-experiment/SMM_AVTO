import { currentWorkspace } from "@/lib/db";
import { MYGOV_URL, accountsWithUsage } from "@/lib/icbari";
import { Card, PageHeader, Badge, btn, btnGhost, input, label } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { addIcbariPolicy, addMygovAccount, deleteIcbariPolicy, deleteMygovAccount, setMygovActive } from "../actions";

export const dynamic = "force-dynamic";

export default async function Icbari() {
  const ws = await currentWorkspace();
  const accounts = await accountsWithUsage(ws.id);
  const active = accounts.filter((a) => a.active);
  const total = active.reduce((s, a) => s + a.monthlyLimit, 0);
  const left = active.reduce((s, a) => s + a.left, 0);
  const policies = accounts.flatMap((a) => a.policies.map((p) => ({ ...p, owner: a.owner }))).sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime());
  const sum = policies.reduce((s, p) => s + p.amount, 0);
  const month = new Date().toLocaleDateString("ru-RU", { month: "long", year: "numeric", timeZone: "Asia/Baku" });
  const date = (d: Date) => d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", timeZone: "Asia/Baku" });
  return (
    <div className="space-y-6">
      <PageHeader title="İcbari" subtitle="Кабинеты mygov, с которых оформляется İcbari sığorta, и сколько полисов у каждого осталось в этом месяце">
        <a href={MYGOV_URL} target="_blank" rel="noreferrer" className={btn}>Открыть mygov</a>
      </PageHeader>
      <Flash />

      <Card title={`Кабинеты · ${month}`} action={<Badge tone={left ? "mint" : accounts.length ? "red" : "gray"}>свободно {left} из {total}</Badge>}>
        {!accounts.length && <p className="text-sm text-mute">Кабинетов пока нет. Добавьте первый ниже.</p>}
        <ul className="divide-y divide-line">
          {accounts.map((a) => (
            <li key={a.id} className={`space-y-3 py-4 ${a.active ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <div className="min-w-48 flex-1">
                  <b>{a.owner}</b> {a.phone && <span className="text-mute">+{a.phone}</span>}
                  {a.note && <div className="text-xs text-mute">{a.note}</div>}
                </div>
                <div className="flex gap-1" aria-label={`${a.used} из ${a.monthlyLimit}`}>
                  {Array.from({ length: a.monthlyLimit }, (_, i) => <span key={i} className={`h-2.5 w-6 rounded-full ${i < a.used ? "bg-ink" : "bg-mint"}`} />)}
                </div>
                <Badge tone={!a.active ? "gray" : a.left === 0 ? "red" : a.left === 1 ? "amber" : "mint"}>{!a.active ? "выключен" : a.left ? `осталось ${a.left}` : "лимит исчерпан"}</Badge>
                <form action={setMygovActive.bind(null, a.id, !a.active)}><button className="text-xs text-mute underline decoration-dotted">{a.active ? "выключить" : "включить"}</button></form>
                <form action={deleteMygovAccount.bind(null, a.id)}><button className="text-xs text-mute underline decoration-dotted">удалить</button></form>
              </div>
              {a.active && a.left > 0 && (
                <form action={addIcbariPolicy.bind(null, a.id)} className="flex flex-wrap items-center gap-2">
                  <input name="client" required placeholder="Клиент" className={`${input} !w-auto min-w-40 flex-1 !py-1.5`} />
                  <input name="car" placeholder="Госномер, 10-AA-123" className={`${input} !w-44 !py-1.5`} />
                  <input name="amount" inputMode="decimal" placeholder="Сумма, AZN" className={`${input} !w-32 !py-1.5`} />
                  <button className={`${btnGhost} !py-1.5`}>Записать İcbari</button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {accounts.length > 0 && <p className="mt-3 text-xs text-mute">Вход в mygov делает владелец кабинета сам: пароли и коды здесь не хранятся. Оформили полис на mygov, записали его сюда, счётчик уменьшился. Счётчик обнуляется 1-го числа.</p>}
      </Card>

      <Card title="Добавить кабинет mygov">
        <form action={addMygovAccount} className="grid gap-3 md:grid-cols-4">
          <label className={label}>На кого оформлен<input name="owner" required placeholder="Ad Soyad" className={input} /></label>
          <label className={label}>Телефон<input name="phone" placeholder="050 123 45 67" className={input} /></label>
          <label className={label}>Заметка<input name="note" placeholder="сотрудник, родственник..." className={input} /></label>
          <label className={label}>Лимит в месяц<input name="monthlyLimit" type="number" min={1} max={100} defaultValue={5} className={input} /></label>
          <div className="md:col-span-4"><button className={btn}>Добавить</button></div>
        </form>
      </Card>

      {policies.length > 0 && (
        <Card title="Оформлено в этом месяце" action={<Badge>{policies.length}{sum > 0 && ` · ${sum.toFixed(2)} AZN`}</Badge>}>
          <ul className="divide-y divide-line text-sm">
            {policies.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="tabular-nums text-mute">{date(p.issuedAt)}</span>
                <div className="flex-1"><b>{p.client}</b> <span className="text-mute">{p.car && `${p.car} · `}кабинет: {p.owner}</span></div>
                {p.amount > 0 && <span className="tabular-nums">{p.amount.toFixed(2)} AZN</span>}
                <form action={deleteIcbariPolicy.bind(null, p.id)}><button className="text-xs text-mute underline decoration-dotted">удалить</button></form>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
