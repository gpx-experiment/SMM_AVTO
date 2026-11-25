import { db, currentWorkspace } from "@/lib/db";
import { AUTH_PROVIDERS } from "@/connectors";
import { Card, NETWORK, NetDot, PageHeader, Badge, btn, btnGhost } from "@/components/ui";
import { disconnect, setAccountHidden } from "../actions";
import type { Account } from "@prisma/client";

export const dynamic = "force-dynamic";

// Цвета и значки провайдеров входа (только оформление).
const BRAND: Record<string, { bg: string; fg: string; dots: string[] }> = {
  meta: { bg: "linear-gradient(135deg,#1877f2,#e1306c)", fg: "#fff", dots: ["instagram", "facebook"] },
  tiktok: { bg: "#0b0c0d", fg: "#fff", dots: ["tiktok"] },
  tiktok_ads: { bg: "linear-gradient(135deg,#0b0c0d,#00b8c4)", fg: "#fff", dots: ["tiktok_ads"] },
  youtube: { bg: "#ff2a2a", fg: "#fff", dots: ["youtube"] },
};

export default async function Accounts({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const ws = await currentWorkspace();
  const accounts = await db.account.findMany({ where: { workspaceId: ws.id }, orderBy: [{ provider: "asc" }, { name: "asc" }] });
  const visible = accounts.filter((a) => !a.hidden);
  const hidden = accounts.filter((a) => a.hidden);
  return (
    <div className="space-y-6">
      <PageHeader title="Аккаунты" subtitle="Подключение через официальный вход. Пароли не хранятся, токены зашифрованы." />
      {msg && <p className="rounded-2xl bg-mint px-4 py-3 text-sm font-medium">{msg}</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {AUTH_PROVIDERS.map((p) => {
          const b = BRAND[p.id];
          return (
            <Card key={p.id} className="flex flex-col !p-5">
              <div className="mb-4 flex h-24 items-end justify-between rounded-xl p-4" style={{ background: b?.bg, color: b?.fg }}>
                <span className="font-display text-2xl font-extrabold">{p.label}</span>
                <svg viewBox="0 0 24 24" className="h-6 w-6 opacity-80" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>
              </div>
              <p className="mb-4 flex-1 text-sm text-mute">{p.covers}</p>
              <a className={btn} href={`/api/connect/${p.id}`}>Подключить</a>
            </Card>
          );
        })}
      </div>
      <Card title="Подключённые" action={<Badge tone={visible.length ? "mint" : "gray"}>{visible.length}</Badge>}>
        {!accounts.length ? <p className="text-sm text-mute">Пока ничего не подключено.</p>
          : !visible.length ? <p className="text-sm text-mute">Все аккаунты скрыты. Верните нужные из списка ниже.</p>
          : (
          <>
            <p className="mb-2 text-xs text-mute">Ненужные страницы можно скрыть: они пропадут из дашборда, публикаций, рекламы, комментариев и анализа ИИ. Данные и доступ сохранятся, вернуть можно в любой момент.</p>
            <ul className="divide-y divide-line">{visible.map((a) => <Row key={a.id} a={a} />)}</ul>
          </>
        )}
      </Card>
      {hidden.length > 0 && (
        <Card title="Скрытые" action={<Badge tone="gray">{hidden.length}</Badge>}>
          <ul className="divide-y divide-line opacity-70">{hidden.map((a) => <Row key={a.id} a={a} />)}</ul>
        </Card>
      )}
    </div>
  );
}

function Row({ a }: { a: Account }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-paper"><NetDot provider={a.provider} size={12} /></span>
        <span className="min-w-0">
          <b className="block">{NETWORK[a.provider]?.label} · {a.name}</b>
          <span className="text-xs text-mute">{a.tokenExpiresAt ? `Доступ до ${a.tokenExpiresAt.toLocaleString("ru-RU")}` : "Доступ активен"}</span>
        </span>
      </span>
      <span className="flex items-center gap-3">
        {a.hidden ? <Badge tone="gray">Скрыт</Badge> : <Badge tone="mint">Подключено</Badge>}
        <form action={setAccountHidden.bind(null, a.id, !a.hidden)}><button className={a.hidden ? btn : btnGhost}>{a.hidden ? "Показать" : "Скрыть"}</button></form>
        <form action={disconnect.bind(null, a.id)}><button className={btnGhost}>Отключить</button></form>
      </span>
    </li>
  );
}
