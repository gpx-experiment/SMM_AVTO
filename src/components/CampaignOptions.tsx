"use client";
// Цель кампании и тёплые аудитории с подсказками эффективности
import { useState } from "react";
import { objectiveHint, RETARGETING_HINT } from "@/lib/benchmarks";
import { ImpactHint } from "./ImpactHint";
import { input } from "./ui";

export function CampaignOptions({ meta, hasPixel, hasRetargeting, hasLookalike }: { meta: boolean; hasPixel: boolean; hasRetargeting: boolean; hasLookalike: boolean }) {
  const [objective, setObjective] = useState("engagement");
  const [rt, setRt] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">Цель</span>
        <select name="objective" className={`${input} !w-auto`} value={objective} onChange={(e) => setObjective(e.target.value)}>
          <option value="engagement">Вовлечение (прогрев)</option>
          <option value="traffic">Трафик на сайт</option>
          <option value="sales" disabled={!hasPixel}>Продажи (нужен Meta Pixel){hasPixel ? "" : ": не задан"}</option>
        </select>
        {meta && <>
          <label className="ml-2 flex items-center gap-1.5"><input type="checkbox" name="useRetargeting" disabled={!hasRetargeting} checked={rt} onChange={(e) => setRt(e.target.checked)} /> Ретаргетинг на вовлечённых</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" name="useLookalike" disabled={!hasLookalike} /> Look-alike 1%</label>
        </>}
      </div>
      <ImpactHint hint={objectiveHint(objective)} />
      {meta && !rt && <ImpactHint hint={{ ...RETARGETING_HINT, text: `${hasRetargeting ? "Включите ретаргетинг" : "Создайте аудиторию ретаргетинга в ИИ-менеджере"}: ${RETARGETING_HINT.text.replace("Ретаргетинг: ", "")}` }} />}
    </div>
  );
}
