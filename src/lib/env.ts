export const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
export const DEMO = process.env.DEMO_MODE === "true";
export const callbackUrl = (provider: string) => `${APP_URL}/api/callback/${provider}`;
