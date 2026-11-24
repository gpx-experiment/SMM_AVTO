import { NextResponse, type NextRequest } from "next/server";
import { authConnector } from "@/connectors";
import { currentWorkspace } from "@/lib/db";
import { saveAccounts, syncMetrics } from "@/lib/services";
import type { AuthProvider } from "@/connectors/types";
import { APP_URL } from "@/lib/env";

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const code = req.nextUrl.searchParams.get("code") ?? req.nextUrl.searchParams.get("auth_code");
  const state = req.nextUrl.searchParams.get("state");
  const back = (msg: string) => NextResponse.redirect(new URL(`/accounts?msg=${encodeURIComponent(msg)}`, APP_URL)); // от APP_URL: за прокси Railway req.url = 0.0.0.0:8080
  if (!code || !state || state !== req.cookies.get("oauth_state")?.value) return back("Ошибка авторизации: неверный state или нет кода");
  try {
    const ws = await currentWorkspace();
    const accounts = await authConnector(provider as AuthProvider).exchangeCode(code);
    await saveAccounts(ws.id, accounts);
    await syncMetrics(ws.id);
    return back(`Подключено аккаунтов: ${accounts.length}`);
  } catch (e) {
    return back(`Ошибка подключения: ${(e as Error).message}`);
  }
}
