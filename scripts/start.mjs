// Запуск на хостинге: обновляет схему БД, стартует сайт и планировщик в одном сервисе.
import { spawn, execSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const port = process.env.PORT ?? "3000";
process.env.CRON_SECRET ||= randomBytes(24).toString("hex"); // общий секрет сайта и планировщика
execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
const web = spawn("npx", ["next", "start", "-p", port, "-H", "0.0.0.0"], { stdio: "inherit" });
const cron = spawn("node", ["scripts/scheduler.mjs"], {
  stdio: "inherit",
  env: { ...process.env, CRON_URL: `http://127.0.0.1:${port}/api/cron` },
});
for (const p of [web, cron]) p.on("exit", (code) => { console.error("process exited", code); process.exit(code ?? 1); });
