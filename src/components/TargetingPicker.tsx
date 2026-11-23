"use client";
// Аудитория рекламы: страны, возраст, пол, интересы (поиск по рекламному кабинету).
import { useState, useTransition } from "react";
import { searchInterestsAction } from "@/app/actions";
import type { Interest, Targeting } from "@/connectors/types";

const COUNTRIES = [["AZ", "Азербайджан"], ["TR", "Турция"], ["RU", "Россия"], ["KZ", "Казахстан"], ["UZ", "Узбекистан"], ["GE", "Грузия"], ["AE", "ОАЭ"], ["DE", "Германия"], ["US", "США"], ["GB", "Великобритания"]];
const fmtSize = (n?: number) => (n ? (n >= 1e6 ? `${Math.round(n / 1e6)} млн` : `${Math.round(n / 1e3)} тыс.`) : "");

export function TargetingPicker({ accountId, initial }: { accountId: string; initial?: Partial<Targeting> }) {
  const [t, setT] = useState<Targeting>({ countries: ["AZ"], ageMin: 18, ageMax: 45, gender: "all", interests: [], ...initial });
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Interest[]>([]);
  const [pending, start] = useTransition();
  const set = (p: Partial<Targeting>) => setT((x) => ({ ...x, ...p }));
  const search = (v: string) => { setQ(v); start(async () => setFound(await searchInterestsAction(accountId, v))); };

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-white p-4 text-sm">
      <input type="hidden" name="targeting" value={JSON.stringify(t)} />
      <div className="font-display font-extrabold">Аудитория</div>
      <div className="flex flex-wrap gap-1.5">
        <span className="w-20 text-xs text-mute">Страны</span>
        {COUNTRIES.map(([code, name]) => (
          <button type="button" key={code} onClick={() => set({ countries: t.countries.includes(code) ? t.countries.filter((c) => c !== code) : [...t.countries, code] })}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${t.countries.includes(code) ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink/30"}`}>{name}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-20 text-xs text-mute">Возраст</span>
        <input type="number" min={13} max={65} value={t.ageMin} onChange={(e) => set({ ageMin: Number(e.target.value) })} className="w-16 rounded-xl border border-line px-2.5 py-1.5" />
        —
        <input type="number" min={13} max={65} value={t.ageMax} onChange={(e) => set({ ageMax: Number(e.target.value) })} className="w-16 rounded-xl border border-line px-2.5 py-1.5" />
        <span className="ml-4 text-xs text-mute">Пол</span>
        {([["all", "Все"], ["female", "Женщины"], ["male", "Мужчины"]] as const).map(([v, l]) => (
          <label key={v} className="flex items-center gap-1"><input type="radio" checked={t.gender === v} onChange={() => set({ gender: v })} />{l}</label>
        ))}
      </div>
      <div className="flex items-start gap-3">
        <span className="w-20 pt-1.5 text-xs text-mute">Интересы</span>
        <div className="flex-1 space-y-2">
          <input value={q} onChange={(e) => search(e.target.value)} placeholder="Начните вводить: фитнес, мода, авто…" className="w-full rounded-xl border border-line px-3.5 py-2 focus:border-ink focus:outline-none focus:ring-4 focus:ring-mint/60" />
          {pending && <p className="text-xs text-mute">Ищу…</p>}
          {found.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {found.filter((i) => !t.interests.some((x) => x.id === i.id)).map((i) => (
                <button type="button" key={i.id} onClick={() => set({ interests: [...t.interests, { id: i.id, name: i.name }] })}
                  className="rounded-full border border-dashed border-ink/30 bg-white px-3 py-1 text-xs font-medium hover:border-ink">+ {i.name} <span className="text-mute/70">{fmtSize(i.audienceSize)}</span></button>
              ))}
            </div>
          )}
          {t.interests.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {t.interests.map((i) => <span key={i.id} className="flex items-center gap-1 rounded-full bg-mint px-2.5 py-1 text-xs font-medium text-ink">{i.name}<button type="button" onClick={() => set({ interests: t.interests.filter((x) => x.id !== i.id) })}>×</button></span>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
