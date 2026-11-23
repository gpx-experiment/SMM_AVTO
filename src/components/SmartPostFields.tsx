"use client";
// Формат и время публикации с подсказками эффективности
import { useState } from "react";
import { formatHints, timeHint } from "@/lib/benchmarks";
import { ImpactHint } from "./ImpactHint";
import { input } from "./ui";

export function SmartPostFields({ networks }: { networks: string[] }) {
  const [mediaType, setMediaType] = useState("image");
  const [when, setWhen] = useState("");
  return (
    <div className="space-y-2">
      <div className="grid gap-3 md:grid-cols-3">
        <select name="mediaType" value={mediaType} onChange={(e) => setMediaType(e.target.value)} className={input}><option value="image">Фото / карусель</option><option value="video">Видео (Reels, TikTok, Shorts)</option></select>
        <input name="scheduledAt" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={`${input} md:col-span-2`} title="Пусто = опубликовать сейчас" />
      </div>
      {formatHints(mediaType).map((h) => <ImpactHint key={h.text} hint={h} />)}
      <ImpactHint hint={timeHint(when ? new Date(when) : null, networks)} />
    </div>
  );
}
