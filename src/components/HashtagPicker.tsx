"use client";
// Подбор хэштегов: ИИ предлагает группы тегов, пользователь выбирает, добавляет свои и сохраняет наборы.
import { useEffect, useState, useTransition } from "react";
import { suggestHashtagsAction, listHashtagSets, saveHashtagSet } from "@/app/actions";
import type { HashtagSuggestion } from "@/lib/hashtags";
import { HASHTAG_LIMITS as LIMITS, hashtagHint } from "@/lib/benchmarks";
import { ImpactHint } from "./ImpactHint";

const GROUPS: [keyof Omit<HashtagSuggestion, "tip">, string][] = [["popular", "Популярные"], ["niche", "Нишевые"], ["local", "Локальные"], ["branded", "Фирменные"]];
type Set_ = { id: string; name: string; tags: string };

export function HashtagPicker({ networks }: { networks: string[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [sugg, setSugg] = useState<HashtagSuggestion | null>(null);
  const [sets, setSets] = useState<Set_[]>([]);
  const [custom, setCustom] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => { listHashtagSets().then(setSets); }, []);

  const toggle = (t: string) => setSelected((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));
  const add = (tags: string[]) => setSelected((s) => [...new Set([...s, ...tags])]);
  const limit = Math.min(...networks.map((n) => LIMITS[n] ?? 5), 5);

  function suggest(e: React.MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.form!;
    const caption = (form.elements.namedItem("caption") as HTMLTextAreaElement).value;
    const accountIds = new FormData(form).getAll("accountIds").map(String);
    if (!caption.trim()) return setErr("Сначала напишите текст поста");
    setErr("");
    start(async () => { try { setSugg(await suggestHashtagsAction(caption, accountIds)); } catch (x) { setErr((x as Error).message); } });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <input type="hidden" name="hashtags" value={selected.join(" ")} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-sm font-extrabold">Хэштеги</span>
        <button type="button" onClick={suggest} disabled={pending} className="inline-flex items-center gap-1.5 rounded-full bg-mint px-3.5 py-1.5 text-sm font-semibold text-ink hover:bg-mint-strong disabled:opacity-50">
          {pending ? "Подбираю…" : "✦ Подобрать ИИ"}
        </button>
        {sets.length > 0 && (
          <select className="rounded-full border border-line bg-white px-3 py-1.5 text-sm" value="" onChange={(e) => { const s = sets.find((x) => x.id === e.target.value); if (s) add(s.tags.split(" ")); }}>
            <option value="">Мои наборы…</option>
            {sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <span className={`ml-auto text-xs ${selected.length > limit ? "text-red-600" : "text-mute"}`}>Выбрано {selected.length} из {limit} допустимых</span>
      </div>
      <ImpactHint hint={hashtagHint(selected.length, networks)} />
      {err && <p className="text-sm text-red-600">{err}</p>}
      {sugg && (
        <div className="space-y-2">
          {GROUPS.map(([k, label]) => sugg[k].length > 0 && (
            <div key={k} className="flex flex-wrap items-center gap-1.5">
              <span className="w-24 text-xs text-mute">{label}</span>
              {sugg[k].map((t) => (
                <button type="button" key={t} onClick={() => toggle(t)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${selected.includes(t) ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink/30"}`}>{t}</button>
              ))}
              <button type="button" onClick={() => add(sugg[k])} className="text-xs font-semibold text-ink underline-offset-2 hover:underline">все</button>
            </div>
          ))}
          <p className="text-xs text-mute">{sugg.tip}</p>
        </div>
      )}
      <div className="flex gap-2">
        <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Свой тег и Enter" className="flex-1 rounded-xl border border-line px-3.5 py-2 text-sm focus:border-ink focus:outline-none focus:ring-4 focus:ring-mint/60"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const t = custom.trim().replace(/^#*/, "#").replace(/\s+/g, ""); if (t.length > 1) add([t.toLowerCase()]); setCustom(""); } }} />
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-paper p-2.5">
          {selected.map((t) => <span key={t} className="flex items-center gap-1 rounded-full bg-mint px-2.5 py-1 text-xs font-medium text-ink">{t}<button type="button" onClick={() => toggle(t)} className="text-ink/50 hover:text-ink">×</button></span>)}
          <button type="button" className="ml-auto text-xs text-mute hover:underline" onClick={async () => { const n = prompt("Название набора"); if (n) setSets(await saveHashtagSet(n, selected)); }}>Сохранить набор</button>
          <button type="button" className="text-xs text-mute hover:underline" onClick={() => setSelected([])}>Очистить</button>
        </div>
      )}
    </div>
  );
}
