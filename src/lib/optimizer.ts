// Автоправила таргетолога: детерминированные правила поверх статистики кампаний (без ИИ).
// Пауза неэффективного экономит деньги; масштабирование предлагает +20% и ждёт подтверждения.
// Кампании на заявки судим по цене заявки (если задан потолок maxCpl), остальные по CTR.
import type { Campaign } from "@/connectors/types";

export interface RuleSettings { minCtr: number; minSpendToJudge: number; scaleCtr: number; maxDailyAdBudget: number; maxCpl?: number }
export interface RuleAction { action: "pause" | "set_budget"; campaignId: string; campaignName: string; dailyBudget: number; reason: string }

/** Оценка кампании по цене заявки: good, bad или null, если судить рано или потолок не задан */
export function cplVerdict(c: Campaign, s: RuleSettings): { verdict: "good" | "bad"; reason: string } | null {
  const maxCpl = s.maxCpl ?? 0, spend = c.spend ?? 0;
  if (!maxCpl || !c.leadGoal || c.leads == null) return null;
  if (!c.leads) return spend >= Math.max(s.minSpendToJudge, maxCpl * 2) ? { verdict: "bad", reason: `потрачено ${spend.toFixed(2)} за 7 дней, заявок нет (потолок цены заявки ${maxCpl})` } : null;
  const cpl = spend / c.leads;
  if (cpl > maxCpl * 1.5 && spend >= s.minSpendToJudge) return { verdict: "bad", reason: `цена заявки ${cpl.toFixed(2)} выше потолка ${maxCpl} в 1,5 раза и больше` };
  if (cpl <= maxCpl && c.leads >= 3) return { verdict: "good", reason: `цена заявки ${cpl.toFixed(2)} при потолке ${maxCpl}, заявок ${c.leads}` };
  return null;
}

export function applyRules(campaigns: Campaign[], s: RuleSettings): RuleAction[] {
  const out: RuleAction[] = [];
  const scale = (c: Campaign, why: string) => {
    if (!c.dailyBudget) return;
    const next = Math.min(Math.round(c.dailyBudget * 1.2 * 100) / 100, s.maxDailyAdBudget);
    if (next > c.dailyBudget) out.push({ action: "set_budget", campaignId: c.id, campaignName: c.name, dailyBudget: next, reason: `Автоправило: ${why}, плавное масштабирование +20% (не выше лимита)` });
  };
  for (const c of campaigns) {
    if (c.status !== "ACTIVE" || !c.impressions) continue;
    const byCpl = cplVerdict(c, s);
    if (byCpl) {
      if (byCpl.verdict === "bad") out.push({ action: "pause", campaignId: c.id, campaignName: c.name, dailyBudget: 0, reason: `Автоправило: ${byCpl.reason}` });
      else scale(c, byCpl.reason);
      continue;
    }
    if ((c.spend ?? 0) < s.minSpendToJudge) continue; // правило 3 дней: мало данных
    // Кампания на заявки с потолком цены: CTR ей не судья, ждём данных по заявкам
    if (c.leadGoal && s.maxCpl) continue;
    const ctr = ((c.clicks ?? 0) / c.impressions) * 100;
    if (ctr < s.minCtr) {
      out.push({ action: "pause", campaignId: c.id, campaignName: c.name, dailyBudget: 0,
        reason: `Автоправило: CTR ${ctr.toFixed(2)}% ниже порога ${s.minCtr}% при расходе ${c.spend} за 7 дней` });
    } else if (ctr >= s.scaleCtr) scale(c, `CTR ${ctr.toFixed(2)}% выше ${s.scaleCtr}%`);
  }
  return out;
}
