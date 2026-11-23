// Подсказка эффективности: «если выбрать так, будет примерно на X% лучше» + источник. Это оценка, а не гарантия.
import type { Hint } from "@/lib/benchmarks";

export function ImpactHint({ hint, className = "" }: { hint: Hint; className?: string }) {
  const tone = hint.tone === "up" ? "bg-mint/60" : hint.tone === "down" ? "bg-[#ffe1e1]" : "bg-paper";
  return (
    <div className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs leading-relaxed ${tone} ${className}`}>
      {hint.pct != null && <span className={`shrink-0 rounded-full px-2 py-0.5 font-bold ${hint.pct >= 0 ? "bg-ink text-white" : "bg-red-600 text-white"}`}>{hint.pct > 0 ? "+" : ""}{hint.pct}%</span>}
      {hint.pct == null && <span className="shrink-0">💡</span>}
      <span>
        {hint.text}.{" "}
        <a href={hint.src.url} target="_blank" rel="noreferrer" className="text-mute underline decoration-dotted">{hint.src.name}, {hint.src.year}</a>
        <span className="text-mute"> · оценка, не гарантия</span>
      </span>
    </div>
  );
}
