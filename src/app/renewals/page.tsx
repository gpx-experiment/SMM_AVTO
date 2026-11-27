import { db, currentWorkspace } from "@/lib/db";
import { daysLeft, reminderLink } from "@/lib/renewals";
import { Card, PageHeader, Badge, btn, btnGhost, input, label } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { deleteRenewal, importRenewals, markRenewed, setRenewalStatus } from "../actions";

export const dynamic = "force-dynamic";

export default async function Renewals() {
  const ws = await currentWorkspace();
  const all = await db.renewal.findMany({ where: { workspaceId: ws.id }, orderBy: { expiresAt: "asc" } });
  const due = all.filter((r) => r.status !== "lost" && daysLeft(r) <= 30);
  const later = all.filter((r) => r.status !== "lost" && daysLeft(r) > 30);
  const lost = all.filter((r) => r.status === "lost");
  const date = (d: Date) => d.toLocaleDateString("ru-RU", { timeZone: "UTC" });
  return (
    <div className="space-y-6">
      <PageHeader title="Продления" subtitle="Полис заканчивается в известный день: напоминание за 30 дней дешевле любой рекламы" />
      <Flash />
      <Card title="Пора написать" action={<Badge tone={due.length ? "amber" : "gray"}>{due.length}</Badge>}>
        {!due.length && <p className="text-sm text-mute">В ближайшие 30 дней полисы не заканчиваются.</p>}
        <ul className="divide-y divide-line">
          {due.map((r) => {
            const d = daysLeft(r);
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <div className="min-w-48 flex-1">
                  <b>{r.name}</b> <span className="text-mute">+{r.phone}</span>
                  <div className="text-xs text-mute">{r.product}{r.car && ` · ${r.car}`} · до {date(r.expiresAt)}</div>
                </div>
                <Badge tone={d < 0 ? "red" : d <= 7 ? "amber" : "gray"}>{d < 0 ? `просрочен ${-d} дн.` : d === 0 ? "сегодня" : `через ${d} дн.`}</Badge>
                {r.status === "contacted" && <Badge tone="mint">написали</Badge>}
                <a href={reminderLink(r)} target="_blank" rel="noreferrer" className={`${btn} !py-1.5`}>Написать в WhatsApp</a>
                {r.status === "active" && <form action={setRenewalStatus.bind(null, r.id, "contacted")}><button className={`${btnGhost} !py-1.5`}>Написал</button></form>}
                <form action={markRenewed.bind(null, r.id)}><button className={`${btnGhost} !py-1.5`}>Продлил</button></form>
                <form action={setRenewalStatus.bind(null, r.id, "lost")}><button className="text-xs text-mute underline decoration-dotted">отказался</button></form>
              </li>
            );
          })}
        </ul>
        {due.length > 0 && <p className="mt-3 text-xs text-mute">Кнопка открывает WhatsApp с готовым текстом на азербайджанском, отправляете вы сами. «Продлил» переносит срок на год вперёд.</p>}
      </Card>

      <Card title="Добавить полисы">
        <form action={importRenewals} className="space-y-3">
          <label className={label}>По одному полису в строке: имя; телефон; продукт; авто; дата окончания
            <textarea name="rows" rows={5} required placeholder={"Elvin Məmmədov; 050 123 45 67; İcbari; Toyota Prius 10-AA-123; 15.01.2027\nAysel; 0551234567; 20.02.2027"} className={`${input} font-mono !text-xs`} /></label>
          <p className="text-xs text-mute">Можно вставить столбцы прямо из Excel. Продукт и авто необязательны. Дата: 15.01.2027 или 2027-01-15.</p>
          <button className={btn}>Добавить</button>
        </form>
      </Card>

      {later.length > 0 && (
        <Card title="Позже" action={<Badge>{later.length}</Badge>}>
          <ul className="divide-y divide-line text-sm">
            {later.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="flex-1"><b>{r.name}</b> <span className="text-mute">+{r.phone} · {r.product}{r.car && ` · ${r.car}`}</span></div>
                <span className="tabular-nums text-mute">до {date(r.expiresAt)}</span>
                <form action={deleteRenewal.bind(null, r.id)}><button className="text-xs text-mute underline decoration-dotted">удалить</button></form>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {lost.length > 0 && (
        <Card title="Отказались" action={<Badge>{lost.length}</Badge>}>
          <ul className="divide-y divide-line text-sm">
            {lost.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="flex-1"><b>{r.name}</b> <span className="text-mute">+{r.phone} · {r.product} · до {date(r.expiresAt)}</span></div>
                <form action={setRenewalStatus.bind(null, r.id, "active")}><button className="text-xs text-mute underline decoration-dotted">вернуть</button></form>
                <form action={deleteRenewal.bind(null, r.id)}><button className="text-xs text-mute underline decoration-dotted">удалить</button></form>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
