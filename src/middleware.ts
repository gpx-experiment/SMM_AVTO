// Закрывает весь сайт паролем (APP_PASSWORD), чтобы чужой человек по ссылке
// не получил доступ к вашим соцсетям и рекламе. Открыты только /privacy и /api/cron (у него свой секрет).
import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Basic ")) {
    const decoded = atob(auth.slice(6));
    const pass = decoded.slice(decoded.indexOf(":") + 1); // логин любой, важен пароль
    if (pass === password) return NextResponse.next();
  }
  return new NextResponse("Нужен пароль", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Avtopilot", charset="UTF-8"' } });
}

export const config = { matcher: ["/((?!privacy|api/cron|_next/static|_next/image|favicon.ico).*)"] };
