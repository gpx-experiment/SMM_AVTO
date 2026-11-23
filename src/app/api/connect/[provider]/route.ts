import { NextResponse } from "next/server";
import { authConnector, AUTH_PROVIDERS } from "@/connectors";
import { randomState } from "@/lib/crypto";
import type { AuthProvider } from "@/connectors/types";
import { DEMO } from "@/lib/env";

// Какие ключи нужны каждой сети: без них показываем понятную подсказку вместо ошибки соцсети.
const KEYS: Record<string, string[]> = {
  meta: ["META_APP_ID", "META_APP_SECRET"],
  tiktok: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
  tiktok_ads: ["TIKTOK_ADS_APP_ID", "TIKTOK_ADS_SECRET"],
  youtube: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
};

export async function GET(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!AUTH_PROVIDERS.some((p) => p.id === provider)) return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  const missing = DEMO ? [] : (KEYS[provider] ?? []).filter((k) => !process.env[k]);
  if (missing.length)
    return new NextResponse(`Эта сеть ещё не настроена: на хостинге не заданы ${missing.join(", ")}.`, { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
  const state = randomState();
  const url = authConnector(provider as AuthProvider).authUrl(state);
  const res = NextResponse.redirect(new URL(url, _req.url));
  res.cookies.set("oauth_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
