"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db, currentWorkspace } from "@/lib/db";
import { adsAccounts, campaignExtras, publishPost, syncMetrics } from "@/lib/services";
import { executeProposal, runAgent } from "@/lib/ai";
import { connectorFor, ref, tokenFor } from "@/connectors";
import { suggestHashtags } from "@/lib/hashtags";
import { getSettings } from "@/lib/ai";
import type { Objective, Targeting } from "@/connectors/types";
import { sendReply, syncComments } from "@/lib/comments";
import { NICHES, nichePreset, type NicheId } from "@/lib/benchmarks";
import { addIdeas, generateIdeas, judgeIdeas, launchIdea, seedIdeas } from "@/lib/ideas";
import { sendDailyReport } from "@/lib/health";
import { parseRenewals } from "@/lib/renewals";

/** Короткое сообщение о результате действия: показывается на странице полминуты */
async function flash(text: string) {
  (await cookies()).set("flash", text.slice(0, 300), { maxAge: 30, httpOnly: true, sameSite: "lax" });
}

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

/** Выбор продвигаемых аккаунтов: отмеченные видны везде, остальные скрываются. Затем обновляет их статистику. */
export async function setPromoted(formData: FormData) {
  const ws = await currentWorkspace();
  const ids = formData.getAll("promote").map(String);
  await db.account.updateMany({ where: { workspaceId: ws.id, id: { in: ids } }, data: { hidden: false } });
  await db.account.updateMany({ where: { workspaceId: ws.id, id: { notIn: ids } }, data: { hidden: true } });
  const errors = await syncMetrics(ws.id);
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
    objective: (String(fd.get("objective") || "engagement")) as Objective, ...(await campaignExtras(acc.workspaceId, s)),
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
      monthlyAdLimit: Math.max(0, Number(fd.get("monthlyAdLimit")) || 0), maxCpl: Math.max(0, Number(fd.get("maxCpl")) || 0),
      messageChannel: ["whatsapp", "instagram", "messenger"].includes(String(fd.get("messageChannel"))) ? String(fd.get("messageChannel")) : "instagram",
      whatsappNumber: String(fd.get("whatsappNumber") ?? "").replace(/[^\d+]/g, ""), reportHour: Math.min(23, Math.max(-1, Math.round(Number(fd.get("reportHour"))))),
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
    brief: s.brief || p.brief,
  } });
  await seedIdeas(ws.id); // готовые гипотезы сферы сразу попадают на доску идей
  revalidatePath("/", "layout");
}

// ---- Идеи таргетинга

export async function seedIdeasAction() {
  const ws = await currentWorkspace();
  const n = await seedIdeas(ws.id);
  await flash(n ? `Добавлено готовых идей: ${n}` : "Для выбранной сферы готовых идей нет или они уже на доске");
  revalidatePath("/ideas");
}

export async function generateIdeasAction() {
  const ws = await currentWorkspace();
  try { await flash(`ИИ добавил идей: ${await generateIdeas(ws.id)}`); } catch (e) { await flash((e as Error).message); }
  revalidatePath("/ideas");
}

export async function createIdeaAction(fd: FormData) {
  const ws = await currentWorkspace();
  const texts = String(fd.get("texts") ?? "").split(/\r?\n/).map((t) => t.trim()).filter(Boolean).map((text) => ({ lang: "", text }));
  await addIdeas(ws.id, [{
    title: String(fd.get("title")).trim(), product: String(fd.get("product") ?? "").trim(), hypothesis: String(fd.get("hypothesis") ?? "").trim(), objective: "messages",
    audience: { countries: ["AZ"], ageMin: Number(fd.get("ageMin")) || 18, ageMax: Number(fd.get("ageMax")) || 65, gender: (String(fd.get("gender")) || "all") as "all" | "male" | "female",
      interests: String(fd.get("interests") ?? "").split(",").map((x) => x.trim()).filter(Boolean), useRetargeting: fd.get("useRetargeting") === "on" },
    texts,
  }], Number(fd.get("dailyBudget")) || 4);
  revalidatePath("/ideas");
}

async function ownIdea(id: string) {
  const ws = await currentWorkspace();
  return db.adIdea.findFirstOrThrow({ where: { id, workspaceId: ws.id } });
}

export async function launchIdeaAction(id: string) {
  await ownIdea(id);
  await launchIdea(id);
  revalidatePath("/ideas"); revalidatePath("/ads");
}

export async function setIdeaStatus(id: string, status: "idea" | "won" | "lost") {
  await ownIdea(id);
  await db.adIdea.update({ where: { id }, data: { status } });
  revalidatePath("/ideas");
}

export async function addIdeaSale(id: string, delta: number) {
  const idea = await ownIdea(id);
  await db.adIdea.update({ where: { id }, data: { sales: Math.max(0, idea.sales + delta) } });
  revalidatePath("/ideas");
}

export async function deleteIdea(id: string) {
  const idea = await ownIdea(id);
  if (idea.campaignId) { await flash("У идеи есть кампания: сначала удалите её в Ads Manager или отметьте идею как несработавшую"); }
  else await db.adIdea.delete({ where: { id } });
  revalidatePath("/ideas");
}

export async function judgeIdeasAction() {
  const ws = await currentWorkspace();
  await flash(`Вынесено вердиктов: ${await judgeIdeas(ws.id)}`);
  revalidatePath("/ideas");
}

// ---- Отчёт в Telegram

export async function sendReportNow() {
  const ws = await currentWorkspace();
  try { await sendDailyReport(ws.id); await flash("Отчёт отправлен в Telegram"); } catch (e) { await flash((e as Error).message); }
  revalidatePath("/ai");
}

// ---- Продления полисов

export async function importRenewals(fd: FormData) {
  const ws = await currentWorkspace();
  const { rows, bad } = parseRenewals(String(fd.get("rows") ?? ""));
  let added = 0;
  for (const r of rows) {
    const dup = await db.renewal.findFirst({ where: { workspaceId: ws.id, phone: r.phone, product: r.product, expiresAt: r.expiresAt } });
    if (!dup) { await db.renewal.create({ data: { workspaceId: ws.id, ...r } }); added++; }
  }
  await flash(`Добавлено полисов: ${added}${rows.length - added ? `, уже были: ${rows.length - added}` : ""}${bad.length ? `. Не разобрано строк: ${bad.length} (нужно «Имя; телефон; дата»)` : ""}`);
  revalidatePath("/renewals");
}

async function ownRenewal(id: string) {
  const ws = await currentWorkspace();
  return db.renewal.findFirstOrThrow({ where: { id, workspaceId: ws.id } });
}

export async function setRenewalStatus(id: string, status: "active" | "contacted" | "lost") {
  await ownRenewal(id);
  await db.renewal.update({ where: { id }, data: { status } });
  revalidatePath("/renewals");
}

/** Клиент продлил: переносим срок на год вперёд, через год напоминание придёт снова */
export async function markRenewed(id: string) {
  const r = await ownRenewal(id);
  const next = new Date(r.expiresAt); next.setUTCFullYear(next.getUTCFullYear() + 1);
  await db.renewal.update({ where: { id }, data: { expiresAt: next, status: "active" } });
  revalidatePath("/renewals");
}

export async function deleteRenewal(id: string) {
  await ownRenewal(id);
  await db.renewal.delete({ where: { id } });
  revalidatePath("/renewals");
}
