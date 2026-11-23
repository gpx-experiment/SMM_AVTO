import Link from "next/link";
import { db, currentWorkspace } from "@/lib/db";
import { Card, NETWORK, NetDot, PageHeader, Badge, fmt, fmtShort, btn, btnGhost } from "@/components/ui";
import { TrendChart } from "@/components/TrendChart";
import { syncNow } from "./actions";

export const dynamic = "force-dynamic";

function Spark({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values), min = Math.min(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${36 - ((v - min) / span) * 32}`).join(" ");
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-10 w-full">
      <polygon points={`0,40 ${pts} 100,40`} fill={color} opacity={0.1} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

const pct = (a: number, b: number) => (b ? ((a - b) / b) * 100 : 0);
const signed = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1).replace(".", ",")}%`;

export default async function Dashboard() {
  const ws = await currentWorkspace();
  const since = new Date(Date.now() - 30 * 86400000);
  const accounts = (await db.account.findMany({
    where: { workspaceId: ws.id }, include: { metrics: { where: { date: { gte: since } }, orderBy: { date: "asc" } } },
  })).filter((a) => a.metrics.length);

  if (!accounts.length) {
    return (
      <div className="space-y-6">
        <PageHeader title="Дашборд" subtitle="Вся статистика Instagram, Facebook, TikTok и YouTube в одном окне" />
        <Card className="bg-mint">
          <h2 className="text-2xl font-extrabold">Подключите первую соцсеть</h2>
          <p className="mb-4 mt-1 max-w-lg text-sm text-ink/70">Подключите аккаунты, и здесь появится общая статистика, а ИИ-менеджер начнёт анализ.</p>
          <Link className={btn} href="/accounts">Подключить аккаунты</Link>
        </Card>
      </div>
    );
  }

  const byDate = new Map<string, Record<string, number | string>>();
  for (const a of accounts) for (const m of a.metrics) {
    const d = m.date.toISOString().slice(5, 10);
    const row = byDate.get(d) ?? { date: d };
    row[a.provider] = ((row[a.provider] as number) ?? 0) + m.views;
    byDate.set(d, row);
  }
  const networks = [...new Set(accounts.map((a) => a.provider))];

  const followers = accounts.reduce((s, a) => s + a.metrics.at(-1)!.followers, 0);
  const followers0 = accounts.reduce((s, a) => s + a.metrics[0].followers, 0);
  const views = accounts.reduce((s, a) => s + a.metrics.reduce((x, m) => x + m.views, 0), 0);
  const eng = accounts.reduce((s, a) => s + a.metrics.reduce((x, m) => x + m.likes + m.comments + m.shares + m.saves, 0), 0);
  const pending = await db.proposal.count({ where: { status: "pending", run: { workspaceId: ws.id } } });

  return (
    <div className="space-y-6">
      <PageHeader title="Дашборд" subtitle="Все соцсети за последние 30 дней">
        <form action={syncNow}><button className={btnGhost}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3M4 4v4h4M20 20v-4h-4" /></svg>
          Обновить статистику</button></form>
      </PageHeader>

      <section className="grid overflow-hidden rounded-2xl bg-ink text-white md:grid-cols-4 md:divide-x md:divide-white/10">
        {[
          ["Подписчиков всего", fmtShort(followers), `${signed(pct(followers, followers0))} за 30 дней`],
          ["Просмотров за 30 дней", fmtShort(views), `по ${networks.length} сетям`],
          ["Вовлечённость", `${views ? ((eng / views) * 100).toFixed(1).replace(".", ",") : 0}%`, "лайки, комментарии, репосты, сохранения"],
        ].map(([l, v, s]) => (
          <div key={l} className="p-6">
            <div className="text-sm text-white/60">{l}</div>
            <div className="mt-2 font-display text-4xl font-extrabold tracking-tight">{v}</div>
            <div className="mt-1 text-xs text-mint">{s}</div>
          </div>
        ))}
        <Link href="/ai" className="group flex flex-col justify-between bg-mint p-6 text-ink">
          <div className="flex items-center gap-2 text-sm font-semibold"><span className="pulse h-2.5 w-2.5 rounded-full bg-[#18c47a]" />ИИ-менеджер</div>
          <div className="mt-2 font-display text-4xl font-extrabold">{pending}</div>
          <div className="text-xs font-medium">{pending ? "предложений ждут вашего решения →" : "новых предложений нет, всё под контролем"}</div>
        </Link>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {accounts.map((a) => {
          const last = a.metrics.at(-1)!;
          const first = a.metrics[0];
          const er = last.views ? ((last.likes + last.comments + last.shares + last.saves) / last.views) * 100 : 0;
          const color = NETWORK[a.provider]?.color ?? "#64748b";
          const g = pct(last.followers, first.followers);
          return (
            <Card key={a.id} className="!p-5">
              <div className="flex items-center gap-2 text-sm font-semibold"><NetDot provider={a.provider} />{NETWORK[a.provider]?.label}<span className="truncate font-normal text-mute">· {a.name}</span></div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-display text-3xl font-extrabold tracking-tight">{fmtShort(last.followers)}</span>
                <Badge tone={g >= 0 ? "mint" : "red"}>{signed(g)}</Badge>
              </div>
              <div className="text-xs text-mute">подписчиков</div>
              <div className="my-3"><Spark values={a.metrics.map((m) => m.views)} color={color} /></div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-line pt-3 text-[13px]">
                <dt className="text-mute">Просмотры</dt><dd className="text-right font-semibold">{fmt(last.views)}</dd>
                <dt className="text-mute">{a.provider === "facebook" ? "Реакции" : "Лайки"}</dt><dd className="text-right font-semibold">{fmt(last.likes)}</dd>
                {last.dislikes != null && <><dt className="text-mute">Дизлайки</dt><dd className="text-right font-semibold">{fmt(last.dislikes)}</dd></>}
                <dt className="text-mute">Комментарии</dt><dd className="text-right font-semibold">{fmt(last.comments)}</dd>
                <dt className="text-mute">Репосты</dt><dd className="text-right font-semibold">{fmt(last.shares)}</dd>
                <dt className="text-mute">Вовлечённость</dt><dd className="text-right font-semibold">{er.toFixed(1)}%</dd>
              </dl>
            </Card>
          );
        })}
      </div>

      <Card title="Просмотры по сетям" action={<span className="text-sm text-mute">за 30 дней</span>}>
        <TrendChart data={[...byDate.values()]} series={networks.map((n) => ({ key: n, label: NETWORK[n]?.label ?? n, color: NETWORK[n]?.color ?? "#64748b" }))} />
      </Card>
      <p className="text-xs text-mute">Дизлайки показываются только для YouTube: Instagram, Facebook и TikTok их не отдают.</p>
    </div>
  );
}
