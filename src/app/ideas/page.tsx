import Link from "next/link";
import { db, currentWorkspace } from "@/lib/db";
import { getSettings, hasAiKey, type NamedAudience } from "@/lib/ai";
import { campaignsById, cpl, hasTemplates, waLink, type IdeaText } from "@/lib/ideas";
import { DELIVERY } from "@/lib/health";
import { Card, PageHeader, Badge, btn, btnGhost, btnMint, input, label, fmt } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { addIdeaSale, createIdeaAction, deleteIdea, generateIdeasAction, judgeIdeasAction, launchIdeaAction, seedIdeasAction, setIdeaStatus } from "../actions";

export const dynamic = "force-dynamic";
const GENDER = { all: "все", male: "мужчины", female: "женщины" } as const;
const COLUMNS: [string, string, string][] = [
  ["idea", "Идеи", "Гипотезы, которые ещё не проверяли"],
  ["testing", "В тесте", "Кампания создана, копятся данные"],
  ["won", "Сработали", "Масштабируйте и развивайте"],
  ["lost", "Не сработали", "Чтобы не повторять"],
];
const money = (n: number) => n.toFixed(2).replace(".", ",");

export default async function Ideas() {
  const ws = await currentWorkspace();
  const s = await getSettings(ws.id);
  const ideas = await db.adIdea.findMany({ where: { workspaceId: ws.id }, orderBy: { createdAt: "asc" } });
  const campaigns = ideas.some((i) => i.campaignId) ? await campaignsById(ws.id) : new Map();
  return (
    <div className="space-y-6">
      <PageHeader title="Идеи таргетинга" subtitle="Гипотеза, тест с малым бюджетом, вердикт по цене заявки">
        <div className="flex flex-wrap gap-2">
          {hasTemplates(s.niche) && <form action={seedIdeasAction}><button className={btnGhost}>Готовые идеи сферы</button></form>}
          {hasAiKey() && <form action={generateIdeasAction}><button className={btnMint}>✨ Придумать с ИИ</button></form>}
          <form action={judgeIdeasAction}><button className={btnGhost}>Проверить тесты</button></form>
        </div>
      </PageHeader>
      <Flash />
      {!hasTemplates(s.niche) && !ideas.length && <Card className="bg-mint"><p className="text-sm">Выберите сферу в <Link href="/ai" className="font-semibold underline">ИИ-менеджере</Link>: для страхования на доску сразу попадут готовые гипотезы с текстами на азербайджанском и русском. Или добавьте свою идею ниже.</p></Card>}
      <p className="text-xs text-mute">Тест создаёт кампанию на паузе с бюджетом идеи. Деньги начинают тратиться только после вашей кнопки «Запустить» в разделе «Реклама». Вердикт выносится после 3 дней показов{s.maxCpl > 0 ? ` по потолку цены заявки ${money(s.maxCpl)}` : " (потолок цены заявки не задан: сравниваю с отраслевым CTR и наличием заявок)"}.</p>

      <div className="grid gap-4 xl:grid-cols-4">
        {COLUMNS.map(([status, title, hint]) => {
          const list = ideas.filter((i) => i.status === status);
          return (
            <section key={status} className="space-y-3">
              <div><h2 className="flex items-center gap-2 text-lg font-extrabold">{title}<Badge>{list.length}</Badge></h2><p className="text-xs text-mute">{hint}</p></div>
              {list.map((i) => {
                const a = JSON.parse(i.audience) as NamedAudience;
                const texts = JSON.parse(i.texts) as IdeaText[];
                const c = i.campaignId ? campaigns.get(i.campaignId) : undefined;
                const price = cpl(c);
                const link = waLink(s.whatsappNumber, i);
                return (
                  <article key={i.id} className="space-y-3 rounded-2xl border border-line bg-white p-4 text-sm shadow-[0_1px_2px_rgba(11,12,13,.04)]">
                    <div className="flex items-start justify-between gap-2">
                      <b className="text-[15px] leading-snug">{i.title}</b>
                      <Badge tone="ink">{i.code}</Badge>
                    </div>
                    {i.hypothesis && <p className="text-mute">{i.hypothesis}</p>}
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      {i.product && <span className="rounded-full bg-mint px-2.5 py-1 font-medium">{i.product}</span>}
                      <span className="rounded-full bg-paper px-2.5 py-1">{a.countries.join(", ")} · {a.ageMin}–{a.ageMax} · {GENDER[a.gender]}</span>
                      {a.useRetargeting && <span className="rounded-full bg-paper px-2.5 py-1">ретаргетинг</span>}
                      {a.interests.map((x) => <span key={x} className="rounded-full bg-paper px-2.5 py-1">{x}</span>)}
                      <span className="rounded-full bg-paper px-2.5 py-1">{money(i.dailyBudget)} в день</span>
                    </div>
                    {texts.length > 0 && (
                      <details>
                        <summary className="cursor-pointer text-xs font-semibold">Тексты объявления: {texts.length}</summary>
                        <ul className="mt-2 space-y-2">{texts.map((t, n) => <li key={n} className="rounded-xl bg-paper p-2.5 text-[13px] leading-relaxed">{t.lang && <span className="mr-1.5 text-[11px] font-bold text-mute">{t.lang}</span>}{t.text}</li>)}</ul>
                      </details>
                    )}
                    {c && (
                      <div className="grid grid-cols-3 gap-2 rounded-xl bg-paper p-2.5 text-center text-xs">
                        <div><div className="text-mute">Расход 7д</div><b>{money(c.spend ?? 0)}</b></div>
                        <div><div className="text-mute">Заявки</div><b>{fmt(c.leads ?? 0)}</b></div>
                        <div><div className="text-mute">Цена заявки</div><b>{price != null ? money(price) : "—"}</b></div>
                        <div className="col-span-3 text-mute">{(DELIVERY[c.delivery ?? c.status] ?? [c.status])[0]} · показы {fmt(c.impressions ?? 0)} · клики {fmt(c.clicks ?? 0)}</div>
                      </div>
                    )}
                    {i.verdict && <p className={`rounded-xl px-3 py-2 text-xs ${i.status === "won" ? "bg-mint/60" : i.verdict.startsWith("Не ") ? "bg-[#ffe1e1]" : "bg-[#ffe9b0]/60"}`}>{i.verdict}</p>}
                    {link && <label className="block text-[11px] text-mute">Ссылка в WhatsApp с кодом {i.code} (для постов, сторис и объявлений)<input readOnly value={link} className={`${input} mt-1 !py-1.5 !text-xs`} /></label>}
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
                      {status === "idea" && <form action={launchIdeaAction.bind(null, i.id)}><button className={`${btn} !py-1.5`}>Создать тест</button></form>}
                      {status !== "idea" && (
                        <span className="flex items-center gap-1.5 text-xs">Продано полисов: <b>{i.sales}</b>
                          <form action={addIdeaSale.bind(null, i.id, 1)}><button className={`${btnGhost} !px-2.5 !py-1`}>+1</button></form>
                          {i.sales > 0 && <form action={addIdeaSale.bind(null, i.id, -1)}><button className={`${btnGhost} !px-2.5 !py-1`}>−1</button></form>}
                        </span>
                      )}
                      {status === "testing" && <>
                        <form action={setIdeaStatus.bind(null, i.id, "won")}><button className={`${btnGhost} !py-1.5`}>Сработала</button></form>
                        <form action={setIdeaStatus.bind(null, i.id, "lost")}><button className={`${btnGhost} !py-1.5`}>Нет</button></form>
                      </>}
                      {!i.campaignId && <form action={deleteIdea.bind(null, i.id)} className="ml-auto"><button className="text-xs text-mute underline decoration-dotted">удалить</button></form>}
                    </div>
                  </article>
                );
              })}
              {!list.length && <p className="rounded-2xl border border-dashed border-line p-4 text-xs text-mute">Пусто</p>}
            </section>
          );
        })}
      </div>

      <Card title="Своя идея">
        <form action={createIdeaAction} className="grid gap-3 md:grid-cols-2">
          <label className={label}>Название<input name="title" required placeholder="KASKO: женщины-водители" className={input} /></label>
          <label className={label}>Продукт<input name="product" placeholder="KASKO" className={input} /></label>
          <label className={`${label} md:col-span-2`}>Гипотеза<input name="hypothesis" placeholder="Почему эта аудитория должна дать дешёвые заявки" className={input} /></label>
          <label className={label}>Интересы через запятую<input name="interests" placeholder="Автомобили, Автострахование" className={input} /></label>
          <div className="grid grid-cols-4 gap-2">
            <label className={label}>Возраст от<input name="ageMin" type="number" min={18} max={65} defaultValue={23} className={input} /></label>
            <label className={label}>до<input name="ageMax" type="number" min={18} max={65} defaultValue={60} className={input} /></label>
            <label className={label}>Пол<select name="gender" className={input}><option value="all">все</option><option value="male">мужчины</option><option value="female">женщины</option></select></label>
            <label className={label}>В день<input name="dailyBudget" type="number" step="0.5" min={1} max={s.maxDailyAdBudget} defaultValue={Math.min(4, s.maxDailyAdBudget)} className={input} /></label>
          </div>
          <label className={`${label} md:col-span-2`}>Тексты объявления, по одному в строке<textarea name="texts" rows={3} className={input} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="useRetargeting" /> Только тёплая аудитория (ретаргетинг)</label>
          <div className="md:text-right"><button className={btn}>Добавить на доску</button></div>
        </form>
      </Card>
    </div>
  );
}
