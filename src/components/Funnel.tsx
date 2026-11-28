import { fmt } from "./ui";

type Stage = { label: string; value: number; hint?: string; cost?: number | null };

const money = (n: number) => n.toFixed(2).replace(".", ",");

/** Воронка рекламы: показы → охват → клики → переходы → WhatsApp → заявки. Ширина полосы — доля от показов, рядом конверсия и цена шага. */
export function Funnel({ stages }: { stages: Stage[] }) {
  const top = stages[0]?.value || 1;
  return (
    <div className="space-y-2.5">
      {stages.map((st, i) => {
        const prev = i > 0 ? stages[i - 1].value : null;
        const conv = prev ? (st.value / prev) * 100 : null;
        const width = Math.max(4, (st.value / top) * 100);
        return (
          <div key={st.label} className="flex items-center gap-3">
            <div className="w-44 shrink-0 text-sm">
              <div className="font-semibold">{st.label}</div>
              {st.hint && <div className="text-[11px] text-mute">{st.hint}</div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex h-9 items-center rounded-lg bg-mint/60" style={{ width: `${width}%` }}>
                <span className="px-3 font-display text-base font-extrabold tabular-nums">{fmt(st.value)}</span>
              </div>
            </div>
            <div className="w-32 shrink-0 text-right text-xs">
              {conv != null && <div className="font-semibold tabular-nums">{conv.toFixed(1)}%<span className="font-normal text-mute"> прошли</span></div>}
              {st.cost != null && <div className="text-mute tabular-nums">{money(st.cost)} / шт.</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
