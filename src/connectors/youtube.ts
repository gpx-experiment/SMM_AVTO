// YouTube: Data API v3 (канал, загрузка видео) + Analytics API (просмотры, лайки, ДИЗЛАЙКИ).
// Реклама YouTube идёт через Google Ads API (нужен developer token): следующий этап.
import { callbackUrl, env } from "@/lib/env";
import { http, type Connector } from "./types";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
].join(" ");

type Token = { access_token: string; refresh_token?: string; expires_in: number };
const tokenReq = (p: Record<string, string>) => http<Token>("https://oauth2.googleapis.com/token", {
  method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), ...p }),
});
const day = (d: Date) => d.toISOString().slice(0, 10);

export const youtube: Connector = {
  authUrl: (state) => `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID"), redirect_uri: callbackUrl("youtube"), response_type: "code",
    scope: SCOPES, access_type: "offline", prompt: "consent", state,
  })}`,

  async exchangeCode(code) {
    const t = await tokenReq({ code, grant_type: "authorization_code", redirect_uri: callbackUrl("youtube") });
    const ch = await http<{ items: { id: string; snippet: { title: string; thumbnails?: { default?: { url: string } } } }[] }>(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${t.access_token}` } });
    return ch.items.map((c) => ({
      provider: "youtube" as const, externalId: c.id, name: c.snippet.title, avatarUrl: c.snippet.thumbnails?.default?.url,
      accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: new Date(Date.now() + t.expires_in * 1000),
    }));
  },

  async refresh(refreshToken) {
    const t = await tokenReq({ refresh_token: refreshToken, grant_type: "refresh_token" });
    return { accessToken: t.access_token, refreshToken, expiresAt: new Date(Date.now() + t.expires_in * 1000) };
  },

  async fetchDailyMetrics(_acc, token) {
    const auth = { headers: { Authorization: `Bearer ${token}` } };
    const ch = await http<{ items: { statistics: { subscriberCount: string } }[] }>("https://www.googleapis.com/youtube/v3/channels?part=statistics&mine=true", auth);
    // Analytics отдаёт данные с задержкой ~2 дня
    const d = day(new Date(Date.now() - 2 * 86400000));
    const r = await http<{ columnHeaders: { name: string }[]; rows?: number[][] }>(
      `https://youtubeanalytics.googleapis.com/v2/reports?${new URLSearchParams({
        ids: "channel==MINE", startDate: d, endDate: d, metrics: "views,likes,dislikes,comments,shares",
      })}`, auth);
    const row = r.rows?.[0] ?? [];
    const v = (n: string) => Number(row[r.columnHeaders.findIndex((h) => h.name === n)] ?? 0);
    return { followers: Number(ch.items[0]?.statistics.subscriberCount ?? 0), views: v("views"), reach: 0, likes: v("likes"),
      dislikes: v("dislikes"), comments: v("comments"), shares: v("shares"), saves: 0 };
  },

  async publish(_acc, token, post) {
    if (post.mediaType !== "video" || !post.mediaUrl) throw new Error("YouTube принимает только видео");
    const video = await fetch(post.mediaUrl);
    if (!video.ok) throw new Error(`Не удалось скачать видео: ${video.status}`);
    const bytes = Buffer.from(await video.arrayBuffer());
    const [title, ...rest] = post.caption.split("\n");
    const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Upload-Content-Length": String(bytes.length) },
      body: JSON.stringify({ snippet: { title: title.slice(0, 100), description: rest.join("\n") || post.caption }, status: { privacyStatus: "public" } }),
    });
    const location = init.headers.get("location");
    if (!init.ok || !location) throw new Error(`YouTube upload init: ${init.status} ${await init.text()}`);
    const up = await http<{ id: string }>(location, { method: "PUT", headers: { "Content-Type": video.headers.get("content-type") ?? "video/mp4" }, body: bytes });
    return up.id;
  },
};
