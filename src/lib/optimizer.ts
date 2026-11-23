// Автоправила таргетолога: детерминированные правила поверх статистики кампаний (без ИИ).
// Пауза неэффективного экономит деньги; масштабирование предлагает +20% и ждёт подтверждения.
import type { Campaign } from "@/connectors/types";

export interface RuleSettings { minCtr: number; minSpendToJudge: number; scaleCtr: number; maxDailyAdBudget: number }
export interface RuleAction { action: "pause" | "set_budget"; campaignId: string; campaignName: string; dailyBudget: number; reason: string }

export function applyRules(campaigns: Campaign[], s: RuleSettings): RuleAction[] {
  const out: RuleAction[] = [];
  for (const c of campaigns) {
    if (c.status !== "ACTIVE" || !c.impressions || (c.spend ?? 0) < s.minSpendToJudge) continue; // правило 3 дней: мало данных
    const ctr = ((c.clicks ?? 0) / c.impressions) * 100;
    if (ctr < s.minCtr) {
      out.push({ action: "pause", campaignId: c.id, campaignName: c.name, dailyBudget: 0,
        reason: `Автоправило: CTR ${ctr.toFixed(2)}% ниже порога ${s.minCtr}% при расходе ${c.spend} за 7 дней` });
    } else if (ctr >= s.scaleCtr && c.dailyBudget) {
      const next = Math.min(Math.round(c.dailyBudget * 1.2 * 100) / 100, s.maxDailyAdBudget);
      if (next > c.dailyBudget) out.push({ action: "set_budget", campaignId: c.id, campaignName: c.name, dailyBudget: next,
        reason: `Автоправило: CTR ${ctr.toFixed(2)}% выше ${s.scaleCtr}%, плавное масштабирование +20% (не выше лимита)` });
    }
  }
  return out;
}
