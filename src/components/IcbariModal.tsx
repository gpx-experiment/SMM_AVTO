"use client";
import { useState } from "react";
import { btn } from "./ui";

/** Кнопка «Оформить İcbari»: открывает портал mygov в модальном окне прямо на странице, без перехода на другой сайт. */
export function IcbariModal({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={`${btn} mt-4 !px-6 !py-3 !text-base`}>Оформить İcbari →</button>
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/60 p-3 md:p-6" onClick={() => setOpen(false)}>
          <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <span className="text-sm font-semibold">Оформление İcbari</span>
              <div className="flex items-center gap-3">
                <a href={url} target="_blank" rel="noreferrer" className="text-xs text-mute underline decoration-dotted">открыть в новой вкладке</a>
                <button onClick={() => setOpen(false)} aria-label="Закрыть" className="rounded-full px-2 text-2xl leading-none text-mute hover:text-ink">×</button>
              </div>
            </div>
            <iframe src={url} title="İcbari" referrerPolicy="no-referrer-when-downgrade" allow="clipboard-write; camera; microphone" className="w-full flex-1 bg-white" />
          </div>
        </div>
      )}
    </>
  );
}
