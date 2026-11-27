"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const I = {
  dash: <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />,
  acc: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></>,
  pub: <><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4" /></>,
  ads: <><path d="M3 11v2a1 1 0 0 0 1 1h3l6 5V5L7 10H4a1 1 0 0 0-1 1z" /><path d="M17 8a5 5 0 0 1 0 8" /></>,
  com: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z" />,
  book: <><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M4 21.5A2.5 2.5 0 0 1 6.5 19H20v3H6.5" /></>,
  idea: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></>,
  renew: <><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></>,
  ai: <path d="M12 2l2.4 6.1L20.5 10l-6.1 2.4L12 18.5l-2.4-6.1L3.5 10l6.1-1.9zM19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z" />,
};
const NAV: [string, string, keyof typeof I][] = [["/", "Дашборд", "dash"], ["/accounts", "Аккаунты", "acc"], ["/publish", "Публикации", "pub"], ["/ads", "Реклама", "ads"], ["/ideas", "Идеи", "idea"], ["/renewals", "Продления", "renew"], ["/comments", "Комментарии", "com"], ["/ai", "ИИ-менеджер", "ai"], ["/playbook", "Приёмы", "book"]];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {NAV.map(([href, text, icon]) => {
        const on = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link key={href} href={href}
            className={`flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-[15px] font-medium transition ${on ? "bg-mint text-ink" : "text-white/65 hover:bg-white/5 hover:text-white"}`}>
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round">{I[icon]}</svg>
            {text}
          </Link>
        );
      })}
    </nav>
  );
}
