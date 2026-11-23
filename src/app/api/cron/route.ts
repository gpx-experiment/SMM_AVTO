// Вызывается раз в минуту (scripts/scheduler.mjs, cron хостинга или Vercel Cron).
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { publishDue, syncMetrics } from "@/lib/services";
import { getSettings, runAgent } from "@/lib/ai";
import { syncComments } from "@/lib/comments";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const published = await publishDue();
  const report: Record<string, unknown> = { published };
  for (const ws of await db.workspace.findMany()) {
    const s = await getSettings(ws.id);
    const last = await db.aiRun.findFirst({ where: { workspaceId: ws.id }, orderBy: { createdAt: "desc" } });
    const minute = new Date().getUTCMinutes();
    if (minute === 0) await syncMetrics(ws.id); // статистика раз в час
    if (minute % 15 === 0) await syncComments(ws.id); // комментарии каждые 15 минут: отвечать в первый час
    if (!last || Date.now() - last.createdAt.getTime() > s.runEveryHours * 3600000) report[ws.id] = await runAgent(ws.id);
  }
  return NextResponse.json(report);
}
