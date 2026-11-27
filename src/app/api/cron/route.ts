// Вызывается раз в минуту (scripts/scheduler.mjs, cron хостинга или Vercel Cron).
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { publishDue, syncMetrics } from "@/lib/services";
import { getSettings, runAgent } from "@/lib/ai";
import { syncComments } from "@/lib/comments";
import { judgeIdeas } from "@/lib/ideas";
import { reportDue, sendDailyReport } from "@/lib/health";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const published = await publishDue();
  const report: Record<string, unknown> = { published };
  for (const ws of await db.workspace.findMany()) {
    const s = await getSettings(ws.id);
    const last = await db.aiRun.findFirst({ where: { workspaceId: ws.id }, orderBy: { createdAt: "desc" } });
    const minute = new Date().getUTCMinutes();
    if (minute === 0) await syncMetrics(ws.id); // статистика раз в час
    if (minute % 15 === 0) await syncComments(ws.id); // комментарии каждые 15 минут: отвечать в первый час
    try {
      if (minute === 30) await judgeIdeas(ws.id); // вердикты идеям таргетинга раз в час
      if (reportDue(s)) await sendDailyReport(ws.id); // ежедневный отчёт и сторож в Telegram
    } catch (e) { console.error("[cron]", (e as Error).message); }
    if (!last || Date.now() - last.createdAt.getTime() > s.runEveryHours * 3600000) report[ws.id] = await runAgent(ws.id);
  }
  return NextResponse.json(report);
}
