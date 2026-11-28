import { currentWorkspace } from "@/lib/db";
import { adsAccounts } from "@/lib/services";
import { getSettings } from "@/lib/ai";
import { connectorFor, ref, tokenFor } from "@/connectors";
import { Card, NetDot, PageHeader, Badge, btn, btnGhost, input, fmt } from "@/components/ui";
import { createCampaign, toggleCampaign, updateBudget } from "../actions";
import { TargetingPicker } from "@/components/TargetingPicker";
import { CampaignOptions } from "@/components/CampaignOptions";
import { ImpactHint } from "@/components/ImpactHint";
import { Funnel } from "@/components/Funnel";
import { ctrVsIndustry, nichePreset, NICHES, type NicheId } from "@/lib/benchmarks";
import { DELIVERY } from "@/lib/health";
import Link from "next/link";

export const dynamic = "force-dynamic";
const GENDER = { all: "все", male: "мужчины", female: "женщины" } as const;

export default async function Ads() {
  const ws = await currentWorkspace();
  const accounts = await adsAccounts(ws.id);
  const s = await getSettings(ws.id);
  const preset = s.niche in NICHES ? nichePreset(s.niche as NicheId) : null;
  const data = await Promise.all(accounts.map(async (a) => {
    try {
      const ads = connectorFor(a.provider).ads!, token = await tokenFor(a);
      const campaigns = await ads.listCampaigns(ref(a), token);
      return { a, campaigns, summary: await ads.summary?.(ref(a), token).catch(() => undefined) };
    } catch (e) { return { a, campaigns: [], summary: undefined, error: (e as Error).message }; }
  }));
  const all = data.flatMap((d) => d.campaigns);
  const spend = all.reduce((s, c) => s + (c.spend ?? 0), 0);
  const imp = all.reduce((s, c) => s + (c.impressions ?? 0), 0);
  const clicks = all.reduce((s, c) => s + (c.clicks ?? 0), 0);
  const leads = all.reduce((s, c) => s + (c.leads ?? 0), 0);
  const reach = all.reduce((s, c) => s + (c.reach ?? 0), 0);
  const linkClicks = all.reduce((s, c) => s + (c.linkClicks ?? 0), 0);
  const messaging = all.reduce((s, c) => s + (c.messaging ?? 0), 0);
  const money = (n: number) => n.toFixed(2).replace(".", ",");
  // Бюджет: расход за месяц против своего потолка, сумма дневных бюджетов активных кампаний, остаток лимита Meta
  const sums = data.map((d) => d.summary).filter((x) => x != null);
  const monthSpend = sums.length ? sums.reduce((s, x) => s + x.monthSpend, 0) : null;
  const capLeft = sums.some((x) => x.capLeft != null) ? sums.reduce((s, x) => s + (x.capLeft ?? 0), 0) : null;
  const dailyTotal = all.filter((c) => c.status === "ACTIVE").reduce((s, c) => s + (c.dailyBudget ?? 0), 0);
  const today = new Date(), daysLeft = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate() + 1;
  const limit = s.monthlyAdLimit, left = monthSpend != null && limit > 0 ? limit - monthSpend : null;
  const forecast = monthSpend != null ? monthSpend + dailyTotal * daysLeft : null;
  return (
    <div className="space-y-6">
      <PageHeader title="Реклама" subtitle="Кампании Meta и TikTok без перехода в рекламные кабинеты">
        <Link href="/ai" className="inline-flex items-center gap-2 rounded-full bg-mint px-4 py-2 text-sm font-semibold">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M9 12l2 2 4-4" /></svg>
          Траты только с вашего подтверждения</Link>
      </PageHeader>
      {!accounts.length && <Card><p className="text-sm">Подключите Meta или TikTok Ads на странице «Аккаунты», чтобы управлять рекламой.</p></Card>}
      {all.length > 0 && (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[["Расход за 7 дней", money(spend)], ["Заявки за 7 дней", fmt(leads)], ["Цена заявки", leads ? money(spend / leads) : "—"], ["Средний CTR", imp ? `${((clicks / imp) * 100).toFixed(2)}%` : "—"]].map(([l, v], i) => (
            <div key={l} className={`rounded-2xl p-5 ${i === 0 ? "bg-ink text-white" : "border border-line bg-white"}`}>
              <div className={`text-sm ${i === 0 ? "text-white/60" : "text-mute"}`}>{l}</div>
              <div className="mt-1 font-display text-3xl font-extrabold tracking-tight">{v}</div>
            </div>
          ))}
        </section>
      )}
      {all.length > 0 && <p className="-mt-3 text-xs text-mute">Заявка = начатая переписка (WhatsApp, Direct, Messenger) или лид. Показы за 7 дней: {fmt(imp)}, клики: {fmt(clicks)}.{s.maxCpl > 0 ? ` Потолок цены заявки: ${money(s.maxCpl)}.` : " Задайте потолок цены заявки в ИИ-менеджере, и автоправила будут останавливать кампании, где заявки дороже."}</p>}
      {monthSpend != null && (
        <Card title="Бюджет" action={<Link href="/ai" className="text-xs font-semibold text-mute underline decoration-dotted">изменить лимиты</Link>}>
          <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><div className="text-mute">Потрачено в этом месяце</div><div className="font-display text-2xl font-extrabold">{money(monthSpend)}{limit > 0 && <span className="text-base font-semibold text-mute"> из {money(limit)}</span>}</div></div>
            <div><div className="text-mute">Бюджеты активных кампаний</div><div className="font-display text-2xl font-extrabold">{money(dailyTotal)}<span className="text-base font-semibold text-mute"> в день</span></div></div>
            <div><div className="text-mute">Прогноз на конец месяца</div><div className={`font-display text-2xl font-extrabold ${limit > 0 && forecast! > limit ? "text-red-600" : ""}`}>{money(forecast!)}</div><div className="text-xs text-mute">осталось дней: {daysLeft}</div></div>
            <div><div className="text-mute">Остаток лимита затрат в Meta</div><div className="font-display text-2xl font-extrabold">{capLeft != null ? money(capLeft) : "—"}</div>{capLeft == null && <div className="text-xs text-mute">лимит в кабинете не задан</div>}</div>
          </div>
          {left != null && (
            <div className="mt-4">
              <div className="h-2 overflow-hidden rounded-full bg-line"><div className={`h-full rounded-full ${left <= 0 || forecast! > limit ? "bg-red-500" : "bg-ink"}`} style={{ width: `${Math.min(100, (monthSpend / limit) * 100)}%` }} /></div>
              <p className="mt-2 text-xs text-mute">{left <= 0 ? "Месячный потолок исчерпан: поставьте кампании на паузу или поднимите потолок." : forecast! > limit ? `При текущих бюджетах потолок закончится раньше конца месяца: остатка ${money(left)} хватит на ${Math.floor(left / (dailyTotal || 1))} дн.` : `Остаток ${money(left)}: текущие бюджеты укладываются в потолок.`}</p>
            </div>
          )}
        </Card>
      )}
      {imp > 0 && (() => {
        const stages = [
          { label: "Показы", value: imp, hint: "сколько раз показали рекламу" },
          ...(reach > 0 ? [{ label: "Охват", value: reach, hint: "сколько разных людей увидели" }] : []),
          { label: "Клики", value: clicks, cost: clicks ? spend / clicks : null },
          ...(linkClicks > 0 ? [{ label: "Переходы по ссылке", value: linkClicks, cost: linkClicks ? spend / linkClicks : null }] : []),
          ...(messaging > 0 ? [{ label: "Переписки (WhatsApp/Direct)", value: messaging, hint: "перешли и написали", cost: messaging ? spend / messaging : null }] : []),
          { label: "Заявки", value: leads, hint: "переписки + лиды", cost: leads ? spend / leads : null },
        ];
        return (
          <Card title="Воронка за 7 дней" action={<span className="text-xs text-mute">путь клиента от показа до заявки</span>}>
            <Funnel stages={stages} />
            <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
              <div><div className="text-mute">CTR (клики/показы)</div><div className="font-display text-xl font-extrabold tabular-nums">{imp ? `${((clicks / imp) * 100).toFixed(2)}%` : "—"}</div></div>
              <div><div className="text-mute">Цена клика</div><div className="font-display text-xl font-extrabold tabular-nums">{clicks ? money(spend / clicks) : "—"}</div></div>
              <div><div className="text-mute">Цена 1000 показов</div><div className="font-display text-xl font-extrabold tabular-nums">{imp ? money((spend / imp) * 1000) : "—"}</div></div>
              <div><div className="text-mute">Частота показа</div><div className="font-display text-xl font-extrabold tabular-nums">{reach ? (imp / reach).toFixed(1) : "—"}</div><div className="text-[11px] text-mute">раз на человека</div></div>
              <div><div className="text-mute">Цена перехода в WhatsApp</div><div className="font-display text-xl font-extrabold tabular-nums">{messaging ? money(spend / messaging) : "—"}</div></div>
            </div>
          </Card>
        );
      })()}

      {imp > 0 && <ImpactHint hint={ctrVsIndustry((clicks / imp) * 100, s.niche)} />}
      <p className="text-sm">Новые аудитории и заходы удобнее проверять на <Link href="/ideas" className="font-semibold underline decoration-dotted">доске идей</Link>: гипотеза, тест с малым бюджетом, вердикт.</p>
      {!preset && accounts.length > 0 && <p className="text-xs text-mute">Выберите сферу бизнеса в ИИ-менеджере, чтобы сравнивать CTR с вашей отраслью и получить стартовую аудиторию.</p>}
      {data.map(({ a, campaigns, error }) => (
        <Card key={a.id} title={<span className="flex items-center gap-2"><NetDot provider={a.provider === "tiktok_ads" ? "tiktok" : "facebook"} size={12} />{a.name}</span>} action={<Badge>{campaigns.length} кампаний</Badge>}>
          {error && <p className="mb-3 rounded-xl bg-[#ffd2d2] px-3 py-2 text-sm">{error}</p>}
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="text-left text-xs font-semibold text-mute">
                <tr className="border-b border-line"><th className="py-2.5 pr-3">Кампания</th><th className="pr-3">Статус</th><th className="pr-3 text-right">Расход 7д</th><th className="pr-3 text-right">Показы</th><th className="pr-3 text-right">Клики</th><th className="pr-3 text-right">CTR</th><th className="pr-3 text-right">Переходы</th><th className="pr-3 text-right">WhatsApp</th><th className="pr-3 text-right">Заявки</th><th className="pr-3 text-right">Цена заявки</th><th className="pr-3">Бюджет/день</th><th /></tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const active = c.status === "ACTIVE";
                  const [stText, stTone] = DELIVERY[c.delivery ?? c.status] ?? [active ? "● Активна" : "Пауза", active ? "mint" as const : "gray" as const];
                  const price = c.leads ? (c.spend ?? 0) / c.leads : null;
                  return (
                    <tr key={c.id} className="border-b border-line last:border-0">
                      <td className="py-3.5 pr-3">
                        <div className="font-semibold">{c.name}</div>
                        {c.targeting && <div className="mt-0.5 text-xs text-mute">{c.targeting.countries.join(", ")} · {c.targeting.ageMin}–{c.targeting.ageMax} · {GENDER[c.targeting.gender]} · {c.targeting.interests.map((i) => i.name).join(", ") || "без интересов"}</div>}
                      </td>
                      <td className="pr-3"><Badge tone={stTone}>{stText}</Badge>{active && c.delivery === "ACTIVE" && !c.impressions && <div className="mt-1 text-[11px] text-mute">показов пока нет</div>}</td>
                      <td className="pr-3 text-right tabular-nums">{c.spend != null ? money(c.spend) : "—"}</td>
                      <td className="pr-3 text-right tabular-nums">{c.impressions != null ? fmt(c.impressions) : "—"}</td>
                      <td className="pr-3 text-right tabular-nums">{c.clicks != null ? fmt(c.clicks) : "—"}</td>
                      <td className="pr-3 text-right font-semibold tabular-nums">{c.impressions && a.provider === "tiktok_ads" ? `${(((c.clicks ?? 0) / c.impressions) * 100).toFixed(2)}%` : c.impressions ? (() => { const ctr = ((c.clicks ?? 0) / c.impressions) * 100; const h = ctrVsIndustry(ctr, s.niche); return <>{ctr.toFixed(2)}%<div className={`text-[11px] font-medium ${h.pct! >= 0 ? "text-emerald-700" : "text-red-600"}`} title={h.text}>{h.pct! >= 0 ? "▲" : "▼"} {Math.abs(h.pct!)}% к отрасли</div></>; })() : "—"}</td>
                      <td className="pr-3 text-right tabular-nums">{c.linkClicks != null ? fmt(c.linkClicks) : "—"}</td><td className="pr-3 text-right tabular-nums">{c.messaging != null ? fmt(c.messaging) : "—"}</td><td className="pr-3 text-right tabular-nums">{c.leads != null ? fmt(c.leads) : "—"}</td>
                      <td className={`pr-3 text-right font-semibold tabular-nums ${price != null && s.maxCpl > 0 ? (price <= s.maxCpl ? "text-emerald-700" : "text-red-600") : ""}`}>{price != null ? money(price) : c.leadGoal && (c.spend ?? 0) > 0 ? <span className="font-normal text-mute">нет заявок</span> : "—"}</td>
                      <td className="pr-3">
                        <form action={updateBudget.bind(null, a.id, c.id)} className="flex gap-1.5">
                          <input name="budget" type="number" step="0.01" min="1" defaultValue={c.dailyBudget} className={`${input} !w-24 !py-1.5`} />
                          <button className={`${btnGhost} !px-3 !py-1.5`}>OK</button>
                        </form>
                        {c.budgetLevel === "adset" && c.dailyBudget != null && <div className="mt-1 text-[11px] text-mute">сумма по группам объявлений</div>}
                      </td>
                      <td className="text-right"><form action={toggleCampaign.bind(null, a.id, c.id, !active)}><button className={active ? `${btnGhost} !py-1.5` : `${btn} !py-1.5`}>{active ? "Пауза" : "Запустить"}</button></form></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <form action={createCampaign.bind(null, a.id)} className="mt-5 space-y-3 rounded-2xl bg-paper p-5">
            <div className="font-display text-base font-extrabold">Новая кампания</div>
            <div className="flex flex-wrap gap-2">
              <input name="name" required placeholder="Название новой кампании" className={`${input} flex-1`} />
              <input name="budget" type="number" step="0.01" min="1" required placeholder="Бюджет/день" className={`${input} !w-40`} />
            </div>
            <CampaignOptions meta={a.provider === "facebook"} hasPixel={!!s.pixelId} hasRetargeting={!!s.retargetingAudienceId} hasLookalike={!!s.lookalikeAudienceId} channel={s.messageChannel} />
            <TargetingPicker accountId={a.id} initial={preset ? { ageMin: preset.age[0], ageMax: preset.age[1], gender: preset.gender as "all" | "male" | "female" } : undefined} />
            <div className="flex flex-wrap items-center gap-3">
              <button className={btn}>Создать (на паузе)</button>
              <span className="text-xs text-mute">Кампания создаётся на паузе. Запуск только по вашей кнопке.</span>
            </div>
          </form>
        </Card>
      ))}
    </div>
  );
}
