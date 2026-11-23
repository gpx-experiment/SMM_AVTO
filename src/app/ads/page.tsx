import { currentWorkspace } from "@/lib/db";
import { adsAccounts } from "@/lib/services";
import { getSettings } from "@/lib/ai";
import { connectorFor, ref, tokenFor } from "@/connectors";
import { Card, NetDot, PageHeader, Badge, btn, btnGhost, input, fmt } from "@/components/ui";
import { createCampaign, toggleCampaign, updateBudget } from "../actions";
import { TargetingPicker } from "@/components/TargetingPicker";
import { CampaignOptions } from "@/components/CampaignOptions";
import { ImpactHint } from "@/components/ImpactHint";
import { ctrVsIndustry, nichePreset, NICHES, type NicheId } from "@/lib/benchmarks";
import Link from "next/link";

export const dynamic = "force-dynamic";
const GENDER = { all: "все", male: "мужчины", female: "женщины" } as const;

export default async function Ads() {
  const ws = await currentWorkspace();
  const accounts = await adsAccounts(ws.id);
  const s = await getSettings(ws.id);
  const preset = s.niche in NICHES ? nichePreset(s.niche as NicheId) : null;
  const data = await Promise.all(accounts.map(async (a) => {
    try { return { a, campaigns: await connectorFor(a.provider).ads!.listCampaigns(ref(a), await tokenFor(a)) }; }
    catch (e) { return { a, campaigns: [], error: (e as Error).message }; }
  }));
  const all = data.flatMap((d) => d.campaigns);
  const spend = all.reduce((s, c) => s + (c.spend ?? 0), 0);
  const imp = all.reduce((s, c) => s + (c.impressions ?? 0), 0);
  const clicks = all.reduce((s, c) => s + (c.clicks ?? 0), 0);
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
          {[["Расход за 7 дней", fmt(spend)], ["Показы", fmt(imp)], ["Клики", fmt(clicks)], ["Средний CTR", imp ? `${((clicks / imp) * 100).toFixed(2)}%` : "—"]].map(([l, v], i) => (
            <div key={l} className={`rounded-2xl p-5 ${i === 0 ? "bg-ink text-white" : "border border-line bg-white"}`}>
              <div className={`text-sm ${i === 0 ? "text-white/60" : "text-mute"}`}>{l}</div>
              <div className="mt-1 font-display text-3xl font-extrabold tracking-tight">{v}</div>
            </div>
          ))}
        </section>
      )}
      {imp > 0 && <ImpactHint hint={ctrVsIndustry((clicks / imp) * 100, s.niche)} />}
      {!preset && accounts.length > 0 && <p className="text-xs text-mute">Выберите сферу бизнеса в ИИ-менеджере, чтобы сравнивать CTR с вашей отраслью и получить стартовую аудиторию.</p>}
      {data.map(({ a, campaigns, error }) => (
        <Card key={a.id} title={<span className="flex items-center gap-2"><NetDot provider={a.provider === "tiktok_ads" ? "tiktok" : "facebook"} size={12} />{a.name}</span>} action={<Badge>{campaigns.length} кампаний</Badge>}>
          {error && <p className="mb-3 rounded-xl bg-[#ffd2d2] px-3 py-2 text-sm">{error}</p>}
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="text-left text-xs font-semibold text-mute">
                <tr className="border-b border-line"><th className="py-2.5 pr-3">Кампания</th><th className="pr-3">Статус</th><th className="pr-3 text-right">Расход 7д</th><th className="pr-3 text-right">Показы</th><th className="pr-3 text-right">Клики</th><th className="pr-3 text-right">CTR</th><th className="pr-3">Бюджет/день</th><th /></tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const active = c.status === "ACTIVE";
                  return (
                    <tr key={c.id} className="border-b border-line last:border-0">
                      <td className="py-3.5 pr-3">
                        <div className="font-semibold">{c.name}</div>
                        {c.targeting && <div className="mt-0.5 text-xs text-mute">{c.targeting.countries.join(", ")} · {c.targeting.ageMin}–{c.targeting.ageMax} · {GENDER[c.targeting.gender]} · {c.targeting.interests.map((i) => i.name).join(", ") || "без интересов"}</div>}
                      </td>
                      <td className="pr-3"><Badge tone={active ? "mint" : "gray"}>{active ? "● Активна" : "Пауза"}</Badge></td>
                      <td className="pr-3 text-right tabular-nums">{c.spend != null ? fmt(c.spend) : "—"}</td>
                      <td className="pr-3 text-right tabular-nums">{c.impressions != null ? fmt(c.impressions) : "—"}</td>
                      <td className="pr-3 text-right tabular-nums">{c.clicks != null ? fmt(c.clicks) : "—"}</td>
                      <td className="pr-3 text-right font-semibold tabular-nums">{c.impressions && a.provider === "tiktok_ads" ? `${(((c.clicks ?? 0) / c.impressions) * 100).toFixed(2)}%` : c.impressions ? (() => { const ctr = ((c.clicks ?? 0) / c.impressions) * 100; const h = ctrVsIndustry(ctr, s.niche); return <>{ctr.toFixed(2)}%<div className={`text-[11px] font-medium ${h.pct! >= 0 ? "text-emerald-700" : "text-red-600"}`} title={h.text}>{h.pct! >= 0 ? "▲" : "▼"} {Math.abs(h.pct!)}% к отрасли</div></>; })() : "—"}</td>
                      <td className="pr-3">
                        <form action={updateBudget.bind(null, a.id, c.id)} className="flex gap-1.5">
                          <input name="budget" type="number" step="0.01" min="1" defaultValue={c.dailyBudget} className={`${input} !w-24 !py-1.5`} />
                          <button className={`${btnGhost} !px-3 !py-1.5`}>OK</button>
                        </form>
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
            <CampaignOptions meta={a.provider === "facebook"} hasPixel={!!s.pixelId} hasRetargeting={!!s.retargetingAudienceId} hasLookalike={!!s.lookalikeAudienceId} />
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
