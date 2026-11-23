export const NETWORK: Record<string, { label: string; color: string }> = {
  instagram: { label: "Instagram", color: "#e1306c" },
  facebook: { label: "Facebook", color: "#1877f2" },
  tiktok: { label: "TikTok", color: "#00b8c4" },
  youtube: { label: "YouTube", color: "#ff2a2a" },
  tiktok_ads: { label: "TikTok Ads", color: "#00b8c4" },
};

export function Card({ title, action, children, className = "" }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-white p-6 shadow-[0_1px_2px_rgba(11,12,13,.04)] ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-lg font-extrabold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-extrabold md:text-[34px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-mute">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

const TONES = {
  mint: "bg-mint text-ink",
  amber: "bg-[#ffe9b0] text-ink",
  red: "bg-[#ffd2d2] text-ink",
  gray: "bg-paper text-mute",
  ink: "bg-ink text-white",
} as const;
export function Badge({ tone = "gray", children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>;
}

export function NetDot({ provider, size = 10 }: { provider: string; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: NETWORK[provider]?.color ?? "#94a3b8" }} />;
}

export const btn = "inline-flex items-center justify-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-black/80 disabled:opacity-50 whitespace-nowrap";
export const btnMint = "inline-flex items-center justify-center gap-2 rounded-full bg-mint px-4 py-2 text-sm font-semibold text-ink transition hover:bg-mint-strong disabled:opacity-50 whitespace-nowrap";
export const btnGhost = "inline-flex items-center justify-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink/30 hover:bg-paper whitespace-nowrap";
export const input = "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-mute/70 transition focus:border-ink focus:outline-none focus:ring-4 focus:ring-mint/60";
export const label = "flex flex-col gap-1.5 text-sm font-medium text-ink";
export const chip = (on: boolean) => `rounded-full border px-3 py-1 text-xs font-medium transition ${on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink/30"}`;
export const fmt = (n: number) => new Intl.NumberFormat("ru-RU").format(Math.round(n));
export const fmtShort = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".", ",")} млн` : n >= 1e4 ? `${(n / 1e3).toFixed(1).replace(".", ",")} тыс.` : fmt(n));

export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#b8f5d0" />
      <path d="M8 22 L16 8 L24 22" fill="none" stroke="#0b0c0d" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="19" r="2.6" fill="#0b0c0d" />
    </svg>
  );
}

