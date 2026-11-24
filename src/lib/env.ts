/** Переменная окружения без случайных пробелов и переносов строки (часто прилипают при копировании ключей). */
export const env = (name: string) => process.env[name]?.trim() ?? "";

export const APP_URL = (env("APP_URL") || "http://localhost:3000").replace(/\/+$/, "");
export const DEMO = env("DEMO_MODE") === "true";
export const callbackUrl = (provider: string) => `${APP_URL}/api/callback/${provider}`;
