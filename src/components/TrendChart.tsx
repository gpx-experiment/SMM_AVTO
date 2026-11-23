"use client";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const nf = new Intl.NumberFormat("ru-RU", { notation: "compact" });

export function TrendChart({ data, series }: { data: Record<string, number | string>[]; series: { key: string; label: string; color: string }[] }) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.18} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="#eef0ef" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#5b6360" }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tick={{ fontSize: 12, fill: "#5b6360" }} width={48} axisLine={false} tickLine={false} tickFormatter={(v) => nf.format(v)} />
          <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e6e9e7", boxShadow: "0 10px 30px -10px rgba(0,0,0,.2)", fontSize: 13 }} formatter={(v) => new Intl.NumberFormat("ru-RU").format(Number(v))} />
          {series.map((s) => <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.5} fill={`url(#g-${s.key})`} dot={false} activeDot={{ r: 4 }} />)}
        </AreaChart>
      </ResponsiveContainer>
      <div className="mt-3 flex flex-wrap gap-2">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-2 rounded-full bg-paper px-3 py-1 text-xs font-medium">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
