"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db, currentWorkspace } from "@/lib/db";
import { adsAccounts, publishPost, syncMetrics } from "@/lib/services";
import { executeProposal, runAgent } from "@/lib/ai";
import { connectorFor, ref, tokenFor } from "@/connectors";
import { suggestHashtags } from "@/lib/hashtags";
import { getSettings } from "@/lib/ai";
import type { Objective, Targeting } from "@/connectors/types";
import { sendReply, syncComments } from "@/lib/comments";
import { NICHES, nichePreset, type NicheId } from "@/lib/benchmarks";

export async function suggestHashtagsAction(caption: string, accountIds: string[]) {
  const ws = await currentWorkspace();
  const accounts = await db.account.findMany({ where: { id: { in: accountIds }, hidden: false } });
  const { brief } = await getSettings(ws.id);
  return suggestHashtags(caption, [...new Set(accounts.map((a) => a.provider))], brief);
}

export async function listHashtagSets() {
  const ws = await currentWorkspace();
  return db.hashtagSet.findMany({ where: { workspaceId: ws.id }, orderBy: { createdAt: "desc" } });
}

export async function saveHashtagSet(name: string, tags: string[]) {
  const ws = await currentWorkspace();
  await db.hashtagSet.create({ data: { workspaceId: ws.id, name, tags: tags.join(" ") } });
  return listHashtagSets();
}

export async function searchInterestsAction(accountId: string, q: string) {
  if (q.trim().length < 2) return [];
  const { acc, ads, token } = await adsCtx(accountId);
  return ads.searchInterests ? ads.searchInterests(ref(acc), token, q.trim()) : [];
}

export async function syncNow() {
  const ws = await currentWorkspace();
  const errors = await syncMetrics(ws.id);
  // Ошибки пишутся в логи Railway (в syncMetrics) и показываются на дашборде 10 минут.
  const jar = await cookies();
  if (errors.length) jar.set("syncErrors", JSON.stringify(errors.map((e) => e.slice(0, 200)).slice(0, 8)), { maxAge: 600, httpOnly: true, sameSite: "lax", secure: true });
  else jar.delete("syncErrors");
  revalidatePath("/", "layout");
}

export async function setAccountHidden(id: string, hidden: boolean) {
  const ws = await currentWorkspace();
  await db.account.updateMany({ where: { id, workspaceId: ws.id }, data: { hidden } });
  revalidatePath("/", "layout");
}

export async function disconnect(id: string) {
  await db.account.delete({ where: { id } });
  revalidatePath("/accounts");
}

export async function createPost(fd: FormData) {
  const ws = await currentWorkspace();
  const accountIds = fd.getAll("accountIds").map(String);
  const hashtags = String(fd.get("hashtags") || "").trim();
  if (!accountIds.length) throw new Error("Выберите хотя бы один аккаунт");
  const when = String(fd.get("scheduledAt") || "");
  const post = await db.post.create({ data: {
    workspaceId: ws.id, caption: [String(fd.get("caption")).trim(), hashtags].filter(Boolean).join("\n\n"), mediaUrl: String(fd.get("mediaUrl") || "") || null,
    mediaType: String(fd.get("mediaType")), scheduledAt: when ? new Date(when) : null, status: when ? "scheduled" : "draft",
    targets: { create: accountIds.map((accountId) => ({ accountId })) },
  } });
  if (!when) await publishPost(post.id);
  revalidatePath("/publish");
}

async function adsCtx(accountId: string) {
  const ws = await currentWorkspace();
  const acc = (await adsAccounts(ws.id)).find((a) => a.id === accountId);
  if (!acc) throw new Error("Рекламный аккаунт не найден");
  return { acc, ads: connectorFor(acc.provider).ads!, token: await tokenFor(acc) };
}

export async function toggleCampaign(accountId: string, campaignId: string, active: boolean) {
  const { acc, ads, token } = await adsCtx(accountId);
  await ads.setStatus(ref(acc), token, campaignId, active);
  revalidatePath("/ads");
}

export async function updateBudget(accountId: string, campaignId: string, fd: FormData) {
  const { acc, ads, token } = await adsCtx(accountId);
  await ads.setDailyBudget(ref(acc), token, campaignId, Number(fd.get("budget")));
  revalidatePath("/ads");
}

export async function createCampaign(accountId: string, fd: FormData) {
  const { acc, ads, token } = await adsCtx(accountId);
  const raw = String(fd.get("targeting") || "");
  const targeting = raw ? (JSON.parse(raw) as Targeting) : undefined;
  const s = await getSettings(acc.workspaceId);
  const retarget = fd.get("useRetargeting") === "on" && s.retargetingAudienceId ? [s.retargetingAudienceId] : [];
  const lal = fd.get("useLookalike") === "on" && s.lookalikeAudienceId ? [s.lookalikeAudienceId] : [];
  await ads.createCampaign(ref(acc), token, {
    name: String(fd.get("name")), dailyBudget: Number(fd.get("budget")),
    objective: (String(fd.get("objective") || "engagement")) as Objective, pixelId: s.pixelId,
    audiences: targeting ? [{ ...targeting, customAudienceIds: [...retarget, ...lal] }] : [],
  });
  revalidatePath("/ads");
}

export async function saveAiSettings(fd: FormData) {
  const ws = await currentWorkspace();
  const data = {
    brief: String(fd.get("brief") ?? ""), goals: String(fd.get("goals") ?? ""),
    postsPerWeek: Number(fd.get("postsPerWeek")), maxDailyAdBudget: Number(fd.get("maxDailyAdBudget")),
    runEveryHours: Number(fd.get("runEveryHours")),
    ...(fd.has("websiteUrl") ? {
      websiteUrl: String(fd.get("websiteUrl") ?? ""), pixelId: String(fd.get("pixelId") ?? ""), timezone: String(fd.get("timezone") || "Asia/Baku"),
      autoRules: fd.get("autoRules") === "on", minCtr: Number(fd.get("minCtr")), minSpendToJudge: Number(fd.get("minSpendToJudge")), scaleCtr: Number(fd.get("scaleCtr")),
    } : {}),
    autoPublish: fd.get("autoPublish") === "on", autoPauseAds: fd.get("autoPauseAds") === "on",
  };
  await db.aiSettings.upsert({ where: { workspaceId: ws.id }, create: { workspaceId: ws.id, ...data }, update: data });
  revalidatePath("/ai");
}

export async function runAiNow() {
  const ws = await currentWorkspace();
  await runAgent(ws.id);
  revalidatePath("/ai");
}

export async function approveProposal(id: string, fd: FormData) {
  await executeProposal(id, { mediaUrl: String(fd.get("mediaUrl") || ""), variant: fd.get("variant") === "B" ? "B" : "A" });
  revalidatePath("/ai");
}

export async function rejectProposal(id: string) {
  await db.proposal.update({ where: { id }, data: { status: "rejected" } });
  revalidatePath("/ai");
}

export async function syncCommentsAction() {
  const ws = await currentWorkspace();
  await syncComments(ws.id);
  revalidatePath("/comments");
}

export async function replyCommentAction(id: string, fd: FormData) {
  await sendReply(id, String(fd.get("reply")));
  revalidatePath("/comments");
}

export async function ignoreCommentAction(id: string) {
  await db.commentItem.update({ where: { id }, data: { status: "ignored" } });
  revalidatePath("/comments");
}

/** «Настроить автоматически по сфере»: ставит стартовые настройки по отраслевым бенчмаркам */
export async function applyNichePreset(fd: FormData) {
  const niche = String(fd.get("niche") || "") as NicheId;
  if (!(niche in NICHES)) return;
  const ws = await currentWorkspace();
  const s = await getSettings(ws.id);
  const p = nichePreset(niche);
  await db.aiSettings.update({ where: { workspaceId: ws.id }, data: {
    niche, postsPerWeek: p.postsPerWeek, minCtr: p.minCtr, scaleCtr: p.scaleCtr, autoRules: true,
    goals: s.goals === "Рост охвата и вовлечённости" ? p.goals : s.goals,
    brief: s.brief || `Сфера: ${NICHES[niche].label}`,
  } });
  revalidatePath("/", "layout");
}
