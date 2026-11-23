import { db, currentWorkspace } from "@/lib/db";
import { AUTH_PROVIDERS } from "@/connectors";
import { Card, NETWORK, NetDot, PageHeader, Badge, btn, btnGhost } from "@/components/ui";
import { disconnect } from "../actions";

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
  const accounts = await db.account.findMany({ where: { workspaceId: ws.id }, orderBy: { provider: "asc" } });
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
      <Card title="Подключённые" action={<Badge tone={accounts.length ? "mint" : "gray"}>{accounts.length}</Badge>}>
        {!accounts.length ? <p className="text-sm text-mute">Пока ничего не подключено.</p> : (
          <ul className="divide-y divide-line">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-paper"><NetDot provider={a.provider} size={12} /></span>
                  <span className="min-w-0">
                    <b className="block">{NETWORK[a.provider]?.label} · {a.name}</b>
                    <span className="text-xs text-mute">{a.tokenExpiresAt ? `Доступ до ${a.tokenExpiresAt.toLocaleString("ru-RU")}` : "Доступ активен"}</span>
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <Badge tone="mint">Подключено</Badge>
                  <form action={disconnect.bind(null, a.id)}><button className={btnGhost}>Отключить</button></form>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
