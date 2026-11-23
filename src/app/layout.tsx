import type { Metadata } from "next";
import "./globals.css";
import { DEMO } from "@/lib/env";
import { Nav } from "@/components/Nav";
import { Logo } from "@/components/ui";

export const metadata: Metadata = { title: "Avtopilot", description: "SMM на автопилоте: соцсети, публикации, реклама и ИИ-менеджер в одном окне" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-paper font-sans text-ink antialiased">
        <div className="flex min-h-screen flex-col md:flex-row">
          <aside className="shrink-0 bg-ink text-white md:w-64">
            <div className="p-4 md:sticky md:top-0 md:flex md:h-screen md:flex-col md:p-5">
            <div className="mb-4 flex items-center gap-3 px-1 md:mb-8">
              <Logo />
              <span className="font-display text-xl font-extrabold tracking-tight">Avtopilot</span>
            </div>
            <Nav />
            <div className="mt-auto hidden space-y-3 md:block">
              <div className="rounded-2xl bg-white/5 p-4 text-sm">
                <div className="flex items-center gap-2 font-semibold"><span className="pulse h-2.5 w-2.5 rounded-full bg-[#18c47a]" />ИИ-менеджер на связи</div>
                <p className="mt-1 text-xs leading-relaxed text-white/55">Траты на рекламу только с вашего подтверждения и в пределах лимита.</p>
              </div>
              {DEMO && <p className="rounded-xl border border-[#ffe9b0]/30 bg-[#ffe9b0]/10 px-3 py-2 text-xs text-[#ffe9b0]">Демо-режим: тестовые данные, реальные сети не затрагиваются.</p>}
            </div>
            </div>
          </aside>
          <main className="min-w-0 flex-1 p-5 md:p-10">
            <div className="mx-auto max-w-[1240px]">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
