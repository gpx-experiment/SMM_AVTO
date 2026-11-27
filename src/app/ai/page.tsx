import { db, currentWorkspace } from "@/lib/db";
import { getSettings } from "@/lib/ai";
import { telegramReady } from "@/lib/health";
import { Flash } from "@/components/Flash";
import { Card, PageHeader, Badge, btn, btnGhost, btnMint, input, label } from "@/components/ui";
import { applyNichePreset, approveProposal, rejectProposal, runAiNow, saveAiSettings, sendReportNow } from "../actions";
import { NICHES, SRC, IG_ER, type NicheId } from "@/lib/benchmarks";

export const dynamic = "force-dynamic";
const STATUS: Record<string, [string, "mint" | "amber" | "red" | "gray" | "ink"]> = {
  pending: ["Ждёт решения", "amber"], executed: ["Выполнено", "mint"], approved: ["Подтверждено", "mint"], rejected: ["Отклонено", "gray"], failed: ["Ошибка", "red"], blocked: ["Заблокировано лимитом", "red"],
};
const KIND: Record<string, string> = { post: "Пост", create_campaign: "Новая кампания", set_budget: "Бюджет", pause: "Пауза рекламы", resume: "Запуск рекламы", create_retargeting: "Ретаргетинг", create_lookalike: "Look-alike" };
const OBJECTIVE: Record<string, string> = { engagement: "Вовлечение", traffic: "Трафик", sales: "Продажи", messages: "Заявки в переписку" };
const FUNNEL: Record<string, string> = { TOFU: "Охват (TOFU)", MOFU: "Прогрев (MOFU)", BOFU: "Продажа (BOFU)" };
const GENDER: Record<string, string> = { all: "все", male: "мужчины", female: "женщины" };

export default async function AiPage() {
  const ws = await currentWorkspace();
  const s = await getSettings(ws.id);
  const runs = await db.aiRun.findMany({ where: { workspaceId: ws.id }, orderBy: { createdAt: "desc" }, take: 5, include: { proposals: { orderBy: { createdAt: "asc" } } } });
  return (
    <div className="space-y-6">
      <PageHeader title="ИИ-менеджер" subtitle="Анализирует статистику, пишет стратегию и посты, предлагает рекламу">
        <form action={runAiNow}><button className={btn}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M12 2l2.4 6.1L20.5 10l-6.1 2.4L12 18.5l-2.4-6.1L3.5 10l6.1-1.9z" /></svg>
          Проанализировать и предложить план</button></form>
      </PageHeader>
      <Flash />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="order-2 space-y-6 xl:order-1">
          {!runs.length && (
            <Card className="bg-mint">
              <h2 className="text-2xl font-extrabold">ИИ ещё не запускался</h2>
              <p className="mt-1 text-sm text-ink/70">Заполните настройки справа и нажмите «Проанализировать и предложить план».</p>
            </Card>
          )}
          {runs.map((r) => (
            <Card key={r.id}
              title={<span className="flex items-center gap-2">{r.status === "running" && <span className="pulse h-2.5 w-2.5 rounded-full bg-[#18c47a]" />}Запуск {r.createdAt.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</span>}
              action={r.status === "failed" ? <Badge tone="red">Ошибка</Badge> : <Badge tone="mint">{r.proposals.length} предложений</Badge>}>
              {r.error && <p className="mb-3 rounded-xl bg-[#ffd2d2] px-3 py-2 text-sm">{r.error.includes("Could not resolve authentication method") ? "ИИ не подключён: в переменных Railway не задан ANTHROPIC_API_KEY (ключ с console.anthropic.com)" : r.error}</p>}
              {(r.analysis || r.strategy) && (
                <div className="mb-5 grid gap-3 md:grid-cols-2">
                  {r.analysis && <div className="rounded-xl bg-paper p-4"><div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-mute">Анализ</div><p className="text-sm leading-relaxed whitespace-pre-line">{r.analysis}</p></div>}
                  {r.strategy && <div className="rounded-xl bg-ink p-4 text-white"><div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-mint">Стратегия</div><p className="text-sm leading-relaxed whitespace-pre-line text-white/85">{r.strategy}</p></div>}
                </div>
              )}
              <ul className="space-y-3">
                {r.proposals.map((p) => {
                  const d = JSON.parse(p.payload);
                  const [st, tone] = STATUS[p.status] ?? [p.status, "gray" as const];
                  return (
                    <li key={p.id} className={`rounded-2xl border p-4 text-sm ${p.status === "pending" ? "border-ink/15 bg-white shadow-[0_8px_24px_-16px_rgba(11,12,13,.35)]" : "border-line bg-white"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold text-mute">{KIND[p.kind] ?? "Реклама"}</div>
                          <b className="mt-0.5 block text-[15px]">{p.title}</b>
                        </div>
                        <Badge tone={tone}>{st}</Badge>
                      </div>
                      {p.kind === "post" && (
                        <div className="mt-3 rounded-xl bg-paper p-3.5">
                          {d.pillar && <div className="mb-2 flex flex-wrap gap-1.5"><Badge tone="ink">{d.pillar}</Badge><Badge tone="gray">{FUNNEL[d.funnel] ?? d.funnel}</Badge><Badge tone="gray">{d.format}</Badge></div>}
                          {d.hookB && (
                            <div className="mb-2 grid gap-2 md:grid-cols-2">
                              <div className="rounded-lg bg-white p-2.5"><div className="text-[11px] font-bold text-mute">ХУК A</div>{d.hook}</div>
                              <div className="rounded-lg bg-white p-2.5"><div className="text-[11px] font-bold text-mute">ХУК B (A/B тест)</div>{d.hookB}</div>
                            </div>
                          )}
                          <p className="whitespace-pre-line">{d.caption}</p>
                          {d.question && <p className="mt-2">💬 {d.question}</p>}
                          {d.hashtags?.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{d.hashtags.map((t: string) => <span key={t} className="rounded-full bg-mint px-2.5 py-0.5 text-xs font-medium">{t}</span>)}</div>}
                          <div className="mt-2 text-xs text-mute">Публикация: {new Date(d.publishAt).toLocaleString("ru-RU")}{d.cta && ` · CTA: ${d.cta}`}</div>
                          {d.repurpose && <div className="mt-1 text-xs text-mute">♻️ Репурпосинг: {d.repurpose}</div>}
                        </div>
                      )}
                      {p.kind === "create_campaign" && (
                        <div className="mt-3 space-y-1.5 text-xs">
                          {d.objective && <div><Badge tone="ink">Цель: {OBJECTIVE[d.objective] ?? d.objective}</Badge></div>}
                          {(d.audiences ?? (d.audience ? [d.audience] : [])).map((a: { label?: string; countries: string[]; ageMin: number; ageMax: number; gender: string; interests: string[]; useRetargeting?: boolean }, i: number) => (
                            <div key={i} className="flex flex-wrap gap-1.5">
                              <span className="rounded-full bg-ink px-2.5 py-1 text-white">{a.label ?? `Аудитория ${i + 1}`}</span>
                              <span className="rounded-full bg-paper px-2.5 py-1">{a.countries.join(", ")}</span>
                              <span className="rounded-full bg-paper px-2.5 py-1">{a.ageMin}–{a.ageMax} лет</span>
                              <span className="rounded-full bg-paper px-2.5 py-1">{GENDER[a.gender]}</span>
                              {a.useRetargeting && <span className="rounded-full bg-mint px-2.5 py-1">ретаргетинг</span>}
                              {a.interests.map((x) => <span key={x} className="rounded-full bg-paper px-2.5 py-1">{x}</span>)}
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="mt-3 text-mute">{p.reason}</p>
                      {p.dailyCost > 0 && (
                        <div className="mt-3 flex items-center gap-3">
                          <span className="font-semibold">Расход до {p.dailyCost}/день</span>
                          <span className="h-1.5 max-w-48 flex-1 overflow-hidden rounded-full bg-line"><span className={`block h-full rounded-full ${p.dailyCost > s.maxDailyAdBudget ? "bg-red-500" : "bg-ink"}`} style={{ width: `${Math.min(100, (p.dailyCost / (s.maxDailyAdBudget || 1)) * 100)}%` }} /></span>
                          <span className="text-xs text-mute">лимит {s.maxDailyAdBudget}</span>
                        </div>
                      )}
                      {p.result && <p className="mt-2 text-xs text-mute">{p.result}</p>}
                      {p.status === "pending" && (
                        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                          <form action={approveProposal.bind(null, p.id)} className="flex flex-1 flex-wrap gap-2">
                            {p.kind === "post" && d.hookB && (
                              <span className="flex items-center gap-3 text-sm">
                                <label className="flex items-center gap-1"><input type="radio" name="variant" value="A" defaultChecked /> Хук A</label>
                                <label className="flex items-center gap-1"><input type="radio" name="variant" value="B" /> Хук B</label>
                              </span>
                            )}
                            {p.kind === "post" && d.mediaType !== "text" && <input name="mediaUrl" placeholder="Ссылка на медиа для поста" className={`${input} min-w-48 flex-1`} />}
                            <button className={btn}>Подтвердить</button>
                          </form>
                          <form action={rejectProposal.bind(null, p.id)}><button className={btnGhost}>Отклонить</button></form>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>

        <div className="order-1 space-y-6 xl:order-2">
          <Card title="Автонастройка по сфере" className="!border-ink !bg-ink text-white">
            <form action={applyNichePreset} className="space-y-3">
              <p className="text-sm text-white/70">Выберите сферу, и ИИ поставит частоту постов, пороги автоправил и стартовую аудиторию по отраслевым данным.</p>
              <select name="niche" defaultValue={s.niche} className={`${input} !text-ink`}>
                <option value="" disabled>Выберите сферу…</option>
                {Object.entries(NICHES).map(([id, n]) => <option key={id} value={id}>{n.label}</option>)}
              </select>
              <button className={`${btnMint} w-full`}>✨ Настроить автоматически</button>
            </form>
            {s.niche in NICHES && (() => { const n = NICHES[s.niche as NicheId]; return (
              <div className="mt-4 space-y-1.5 rounded-xl bg-white/10 p-3 text-xs text-white/85">
                <div className="font-bold text-mint">Сейчас: {n.label}</div>
                <div>• {s.postsPerWeek} постов в неделю{"igEngViews" in n ? ` (типично для сферы, ${SRC.dash.name})` : ""}</div>
                <div>• Медиана CTR рекламы: {n.ctr}%, клик ≈ ${n.cpc} ({SRC.wordstream.name} 2025)</div>
                <div>• Пауза, если CTR ниже {s.minCtr}%, масштаб от {s.scaleCtr}%</div>
                <div>• Формат: карусели и Reels (+{Math.round((IG_ER.carousel / IG_ER.image - 1) * 100)}% и +{Math.round((IG_ER.reels / IG_ER.image - 1) * 100)}% к фото, {SRC.socialinsider.name})</div>
                <div>• Аудитория: {n.age[0]}-{n.age[1]} лет, {n.interests.join(", ")}</div>
                <div className="text-white/50">Это стартовая точка по отраслевым данным. По мере накопления вашей статистики ИИ уточняет её.</div>
              </div>
            ); })()}
          </Card>
          <Card title="Настройки" className="xl:sticky xl:top-10">
            <form action={saveAiSettings} className="space-y-4">
              <label className={label}>О бренде<span className="-mt-1 text-xs font-normal text-mute">что продаём, аудитория, тон</span><textarea name="brief" rows={4} defaultValue={s.brief} className={input} /></label>
              <label className={label}>Цели<input name="goals" defaultValue={s.goals} className={input} /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className={label}>Постов в неделю<input name="postsPerWeek" type="number" min={1} defaultValue={s.postsPerWeek} className={input} /></label>
                <label className={label}>Запуск каждые, ч<input name="runEveryHours" type="number" min={1} defaultValue={s.runEveryHours} className={input} /></label>
              </div>
              <div className="rounded-2xl bg-mint p-4">
                <label className={label}>Лимит бюджета на кампанию в день<input name="maxDailyAdBudget" type="number" step="0.01" defaultValue={s.maxDailyAdBudget} className={`${input} !border-transparent font-display !text-lg font-extrabold`} /></label>
                <p className="mt-2 text-xs text-ink/70">Создание кампаний, запуск и рост бюджета всегда ждут вашего подтверждения и не могут превысить лимит.</p>
              </div>
              <div className="space-y-2.5 text-sm">
                <label className="flex items-start gap-2.5"><input type="checkbox" name="autoPublish" defaultChecked={s.autoPublish} className="mt-0.5" /> Публиковать посты ИИ без подтверждения</label>
                <label className="flex items-start gap-2.5"><input type="checkbox" name="autoPauseAds" defaultChecked={s.autoPauseAds} className="mt-0.5" /> Разрешить ИИ ставить неэффективную рекламу на паузу</label>
              </div>
              <details className="rounded-2xl border border-line p-4 text-sm">
                <summary className="cursor-pointer font-semibold">Таргетолог: пиксель, сайт, автоправила</summary>
                <div className="mt-3 space-y-3">
                  <label className={label}>Сайт (ссылки и UTM)<input name="websiteUrl" defaultValue={s.websiteUrl} placeholder="https://..." className={input} /></label>
                  <label className={label}>Meta Pixel ID<span className="-mt-1 text-xs font-normal text-mute">нужен для кампаний «Продажи»</span><input name="pixelId" defaultValue={s.pixelId} className={input} /></label>
                  <label className={label}>Часовой пояс аудитории<input name="timezone" defaultValue={s.timezone} className={input} /></label>
                  <label className="flex items-start gap-2.5"><input type="checkbox" name="autoRules" defaultChecked={s.autoRules} className="mt-0.5" /> Автоправила: пауза слабых и масштабирование сильных кампаний</label>
                  <div className="grid grid-cols-3 gap-2">
                    <label className={label}>Мин. CTR, %<input name="minCtr" type="number" step="0.1" defaultValue={s.minCtr} className={input} /></label>
                    <label className={label}>Судить после<input name="minSpendToJudge" type="number" step="1" defaultValue={s.minSpendToJudge} className={input} /></label>
                    <label className={label}>Масштаб от CTR, %<input name="scaleCtr" type="number" step="0.1" defaultValue={s.scaleCtr} className={input} /></label>
                  </div>
                  <p className="text-xs text-mute">«Судить после» = сколько кампания должна потратить за 7 дней, прежде чем правило её оценит (правило 3 дней).</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className={label}>Потолок цены заявки<input name="maxCpl" type="number" step="0.1" min={0} defaultValue={s.maxCpl} className={input} /></label>
                    <label className={label}>Потолок в месяц<input name="monthlyAdLimit" type="number" step="1" min={0} defaultValue={s.monthlyAdLimit} className={input} /></label>
                  </div>
                  <p className="text-xs text-mute">С потолком цены заявки кампании на заявки судятся по нему, а не по CTR: дороже в 1,5 раза или без заявок — пауза, дешевле — предложение +20%. 0 = не использовать.</p>
                  <label className={label}>Кампании «Сообщения» ведут в
                    <select name="messageChannel" defaultValue={s.messageChannel} className={input}>
                      <option value="instagram">Instagram Direct</option>
                      <option value="whatsapp">WhatsApp (номер должен быть привязан к странице Facebook)</option>
                      <option value="messenger">Messenger</option>
                    </select></label>
                  <label className={label}>Номер WhatsApp<span className="-mt-1 text-xs font-normal text-mute">для ссылок с кодом идеи, например 994501234567</span><input name="whatsappNumber" defaultValue={s.whatsappNumber} className={input} /></label>
                  <label className={label}>Час отчёта в Telegram<span className="-mt-1 text-xs font-normal text-mute">0-23 по часовому поясу выше, -1 = не слать</span><input name="reportHour" type="number" min={-1} max={23} defaultValue={s.reportHour} className={input} /></label>
                </div>
              </details>
              <button className={`${btnMint} w-full !bg-ink !text-white`}>Сохранить</button>
            </form>
            <div className="mt-4 border-t border-line pt-4 text-sm">
              <div className="font-semibold">Отчёт и сторож в Telegram</div>
              {telegramReady()
                ? <form action={sendReportNow} className="mt-2"><button className={`${btnGhost} w-full`}>Отправить отчёт сейчас</button></form>
                : <p className="mt-1 text-xs text-mute">Чтобы получать расход, заявки, цену заявки и предупреждения о сбоях, добавьте в переменные Railway TELEGRAM_BOT_TOKEN (от @BotFather) и TELEGRAM_CHAT_ID.</p>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
